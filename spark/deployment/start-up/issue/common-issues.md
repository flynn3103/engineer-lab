# Phase 1 — Lỗi thường gặp khi vận hành Spark trên Kubernetes

Áp dụng cho stack trong [phase-1-startup.md](../phase-1-startup.md): managed
K8s, Kubeflow Spark Operator, Airflow `SparkKubernetesOperator`, executor trên
spot (autoscale về 0), Iceberg trên object storage + JDBC catalog,
Prometheus/Loki.

Mỗi lỗi ghi: **Triệu chứng / Nguyên nhân / Cách sửa / Phát hiện / Nguồn**.
Mục đánh dấu *[chưa xác minh]* là kiến thức chung, chưa tìm được nguồn cụ thể.

## Top 10 cho team nhỏ (tần suất × mức ảnh hưởng)

| # | Lỗi | Phòng ngừa chính | Mục |
|---|---|---|---|
| 1 | Executor `OOMKilled` (exit 137) do `memoryOverhead` quá thấp, nhất là PySpark | Đặt `spark.executor.memoryOverhead` ≥ 2g cho PySpark | 1.1 |
| 2 | Airflow retry bị lỗi trùng tên `SparkApplication` hoặc chạy job 2 lần | Tên app unique theo run + ghi idempotent | 6.1-6.3 |
| 3 | Spot bị thu hồi → `FetchFailedException` lặp, job fail | Decommission + fallback storage + termination handler; driver không ở spot | 3.1-3.3 |
| 4 | Pod bị evict vì hết `ephemeral-storage` (DiskPressure) do shuffle | Khai request/limit ephemeral-storage hoặc volume `spark-local-dir-*` riêng | 4.1 |
| 5 | Webhook của Operator không áp toleration/volume → pod chạy sai pool, không báo lỗi | Kiểm tra webhook, dùng pod template, smoke test sau deploy | 5.1 |
| 6 | Autoscaler/Karpenter consolidation giết driver giữa job | Annotation `do-not-disrupt`/`safe-to-evict=false` cho driver, pool driver tắt consolidation | 2.3 |
| 7 | Executor `Pending` lâu, cold start chậm | Request ≤ allocatable, image nhỏ, tăng timeout allocation | 2.1-2.2 |
| 8 | Pod/CR mồ côi làm tốn tiền, pool không về 0 | `timeToLiveSeconds`, job dọn dẹp định kỳ | 5.3, 10 |
| 9 | Iceberg commit conflict + nhiều file nhỏ | Không chạy compaction trùng ETL, tăng commit retry | 7.2-7.3 |
| 10 | Hết IP cho pod (EKS) hoặc DNS quá tải khi scale | Subnet lớn/prefix delegation, NodeLocal DNSCache | 8.1-8.2 |

### Alert tối thiểu để bắt các lỗi trên

| Alert | Điều kiện | Bắt lỗi |
|---|---|---|
| OOMKilled | `kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}` > 0 với pod spark | 1.1, 1.3 |
| Pending lâu | pod spark ở `Pending` > 10 phút | 2.1, 2.2, 8.1 |
| SparkApplication kẹt | ở trạng thái chưa kết thúc > N phút (thời gian chạy bình thường × 2) | 5.2 |
| Evicted / DiskPressure | node có `DiskPressure` hoặc pod spark bị `Evicted` | 4.1 |
| Stage retry | số stage retry hoặc executor lost/job vượt ngưỡng | 3.1, 2.3 |
| Pod mồ côi | pod có label `spark-role` sống > 24 giờ | 5.3, 10 |
| Node rảnh | executor pool có node nhưng không có SparkApplication nào chạy | 10 |

---

## 1. Memory

### 1.1 Executor `OOMKilled` (exit 137) nhưng không có `OutOfMemoryError` của JVM

- **Triệu chứng**: pod executor `OOMKilled`, exit code 137, driver log
  "Executor lost", không thấy Java heap OOM. Có job chạy vài giờ mới chết.
- **Nguyên nhân**: bộ nhớ ngoài heap JVM vượt limit của pod: Python worker
  (UDF, pandas/Arrow), native/off-heap buffer, netty. Pod = heap +
  `memoryOverhead` + off-heap + `spark.executor.pyspark.memory`. Overhead mặc
  định (10%, tối thiểu 384 MiB) quá thấp cho PySpark.
- **Cách sửa**: đặt `spark.executor.memoryOverhead` tường minh (≥ 2g cho
  PySpark) hoặc `spark.kubernetes.memoryOverheadFactor` ~0.4 cho workload
  non-JVM; đặt `spark.executor.pyspark.memory` để giới hạn riêng phần Python.
- **Phát hiện**: alert OOMKilled ở trên.
- **Nguồn**: [spark-operator #766](https://github.com/GoogleCloudPlatform/spark-on-k8s-operator/issues/766),
  [Conveyor – Spark/PySpark issues](https://docs.conveyordata.com/how-to-guides/troubleshooting/spark-pyspark-issues/),
  [Spark Advanced Topics – executor OOM](https://holdenk.github.io/spark-flowchart/details/error-executor-out-of-memory/)

### 1.2 JVM heap OOM trên executor

- **Triệu chứng**: `java.lang.OutOfMemoryError: Java heap space` / `GC
  overhead limit exceeded`, thường ở một task xử lý key lệch.
- **Nguyên nhân**: partition quá lớn, skew, broadcast join quá to, quá nhiều
  core/executor so với heap.
- **Cách sửa**: bật AQE (`spark.sql.adaptive.enabled`,
  `spark.sql.adaptive.skewJoin.enabled`); tăng `spark.sql.shuffle.partitions`;
  giảm `spark.sql.autoBroadcastJoinThreshold`; giảm core/executor.
- **Phát hiện**: GC time, heap used; task chậm nhất / trung vị > 5x.
- **Nguồn**: [Cazpian – OOM guide](https://cazpian.ai/blog/spark-oom-debugging-the-complete-guide),
  [AWS re:Post – exit 137](https://repost.aws/knowledge-center/container-killed-on-request-137-emr)

### 1.3 Driver OOM

- **Triệu chứng**: driver `OOMKilled` hoặc JVM OOM, `SparkApplication` →
  `FAILED`.
- **Nguyên nhân**: `collect()`/`toPandas()` dữ liệu lớn, broadcast, plan lớn,
  list quá nhiều file nhỏ, driver để memory mặc định.
- **Cách sửa**: tránh `collect`; đặt `spark.driver.maxResultSize`; driver
  2-4 GiB + `spark.driver.memoryOverhead` (nhiều hơn cho PySpark).
- **Phát hiện**: OOMKilled trên pod label `spark-role=driver`.
- **Nguồn**: như 1.1; nguyên nhân riêng cho driver *[chưa xác minh]*.

---

## 2. Scheduling & autoscaling

### 2.1 Executor `Pending`, job chạy với một phần executor

- **Triệu chứng**: driver chạy, executor `Pending` ("0/N nodes available",
  "Insufficient cpu"); job chậm vì chỉ vài executor.
- **Nguyên nhân**: autoscaler cần vài phút thêm node; `ResourceQuota` đã
  hết; pod request vượt allocatable của node (`spark.executor.cores` bằng số
  vCPU node); scheduler mặc định không có gang scheduling nên hai job cùng giữ
  một phần tài nguyên.
- **Cách sửa**: request ≤ allocatable, dùng
  `spark.kubernetes.executor.request.cores` (ví dụ `3500m`); max node của
  pool và quota = đỉnh × margin; dùng
  `spark.scheduler.minRegisteredResourcesRatio` +
  `spark.scheduler.maxRegisteredResourcesWaitingTime` để job không chạy khi
  quá ít executor; chỉ thêm YuniKorn/Volcano khi nhiều job tranh nhau.
- **Phát hiện**: alert Pending; event "unschedulable" của autoscaler.
- **Nguồn**: [Banzai – Spark scheduling on K8s](https://banzaicloud.github.io/blog/spark-k8s-scheduler/),
  [palantir/k8s-spark-scheduler #150](https://github.com/palantir/k8s-spark-scheduler/issues/150)

### 2.2 Cold start chậm, executor bị tạo lại liên tục

- **Triệu chứng**: stage đầu chờ vài phút; executor bị huỷ và tạo lại vì
  allocator coi là timeout.
- **Nguyên nhân**: scale từ 0 = boot node (1-3 phút) + pull image Spark
  1-3 GB. Timeout allocation (max của 5 × `spark.kubernetes.allocation.batch.delay`
  và `spark.kubernetes.allocation.executor.timeout`) hết trước khi pull xong.
  Batch mặc định chỉ 5 pod.
- **Cách sửa**: image nhỏ (base slim, bỏ tool dev), dùng image streaming/
  preload nếu provider hỗ trợ; tăng `spark.kubernetes.allocation.executor.timeout`;
  tăng `spark.kubernetes.allocation.batch.size` (10-20); tính cold start vào SLA.
- **Phát hiện**: thời gian từ driver start đến executor đầu tiên đăng ký;
  event `ImagePullBackOff`/`ErrImagePull`.
- **Nguồn**: [Debug Spark 3.0 K8s executor restarts](https://prashanth-cvvp.medium.com/debug-spark-3-0-kubernetes-runtime-executor-pods-restarts-continuously-d2dec91e2e5a),
  [ExecutorPodsAllocator internals](https://jaceklaskowski.github.io/spark-kubernetes-book/ExecutorPodsAllocator/)

### 2.3 Consolidation/scale-down evict pod giữa job

- **Triệu chứng**: driver biến mất giữa job (cả app fail), hoặc executor mất
  lặp lại, stage tính lại; node bị xoá bởi consolidation/scale-down.
- **Nguyên nhân**: K8s không biết pod đang giữ shuffle/cache. Karpenter
  consolidation và cluster-autoscaler coi pod trên node ít dùng là di chuyển
  được. `karpenter.sh/do-not-disrupt` chỉ chặn disruption tự nguyện —
  `expireAfter`, spot interruption, xoá thủ công vẫn bỏ qua.
- **Cách sửa**: driver có annotation `karpenter.sh/do-not-disrupt: "true"`
  hoặc `cluster-autoscaler.kubernetes.io/safe-to-evict: "false"`; pool driver
  on-demand với consolidation tắt hoặc `WhenEmpty`; không đặt `expireAfter`
  ngắn cho pool driver. Executor có thể để evict được nếu đã bật decommission.
- **Phát hiện**: event eviction của Karpenter/autoscaler trùng thời điểm mất
  driver/executor.
- **Nguồn**: [Karpenter – disruption](https://karpenter.sh/docs/concepts/disruption/),
  [karpenter #1167](https://github.com/kubernetes-sigs/karpenter/issues/1167),
  [karpenter-provider-aws #3594](https://github.com/aws/karpenter-provider-aws/issues/3594),
  [autoscaler #4813](https://github.com/kubernetes/autoscaler/issues/4813),
  [Onehouse – Spark autoscaler](https://www.onehouse.ai/blog/why-sparks-autoscaler-fails-your-lakehouse-and-how-we-fixed-it)

---

## 3. Spot interruption

### 3.1 Mất executor → mất shuffle → `FetchFailedException`

- **Triệu chứng**: "Executor lost" → `FetchFailedException` / "Missing an
  output location for shuffle" → stage chạy lại; job fail sau
  `spark.stage.maxConsecutiveAttempts` (mặc định 4).
- **Nguyên nhân**: shuffle file nằm trên disk local của executor; node spot
  bị xoá thì mất. Kể cả có decommission, reducer vẫn có thể fetch từ vị trí cũ
  (SPARK-52090; SPARK-40481 đề xuất không tính fetch failure do decommission
  vào giới hạn retry).
- **Cách sửa**:
  - `spark.decommission.enabled=true`, `spark.storage.decommission.enabled=true`,
    `spark.storage.decommission.shuffleBlocks.enabled=true`
  - `spark.storage.decommission.fallbackStorage.path=s3a://…` để đẩy block
    lên object storage khi không còn executor nào nhận
  - Node termination handler (aws-node-termination-handler hoặc interruption
    queue của Karpenter) để cordon + drain khi có thông báo thu hồi
  - `terminationGracePeriodSeconds` của executor đủ dài cho decommission
  - Tuỳ chọn: tăng `spark.stage.maxConsecutiveAttempts`
- **Phát hiện**: số stage retry, số executor lost/job, event spot interruption.
- **Nguồn**: [Dataminded – Spark resilient to spot](https://medium.com/datamindedbe/make-spark-resilient-against-spot-interruptions-on-kubernetes-a2d6403399b0),
  [SPARK-40481](https://issues.apache.org/jira/browse/SPARK-40481),
  [SPARK-52090](https://www.mail-archive.com/issues@spark.apache.org/msg386016.html),
  [Node decommission](https://blog.duyet.net/2021/11/spark-node-decommission/),
  [AWS – EMR on EKS + Spot](https://aws.amazon.com/blogs/big-data/run-fault-tolerant-and-cost-optimized-spark-clusters-using-amazon-emr-on-eks-and-amazon-ec2-spot-instances/)

### 3.2 Thời gian báo trước quá ngắn

- **Triệu chứng**: decommission bắt đầu nhưng node chết trước khi chuyển xong
  block → lại FetchFailed.
- **Nguyên nhân**: AWS báo trước 2 phút; GCP/Azure Spot khoảng 30 giây
  *[chưa xác minh trong lần research này]*.
- **Cách sửa**: trên GKE/AKS dựa vào fallback storage + retry stage, job
  idempotent.

### 3.3 Driver chạy trên spot

- **Triệu chứng**: một lần thu hồi làm fail cả application.
- **Cách sửa**: `nodeSelector` driver vào pool on-demand; chỉ executor
  tolerate taint spot.
- **Nguồn**: [AWS – EMR on EKS + Spot](https://aws.amazon.com/blogs/big-data/run-fault-tolerant-and-cost-optimized-spark-clusters-using-amazon-emr-on-eks-and-amazon-ec2-spot-instances/)

---

## 4. Shuffle & disk local

### 4.1 Pod bị evict vì hết ephemeral-storage

- **Triệu chứng**: pod `Evicted` — "The node was low on resource:
  ephemeral-storage. Container executor was using X, which exceeds its request
  of 0"; pod khác trên node cũng bị evict.
- **Nguyên nhân**: shuffle/spill ghi vào `spark.local.dir`, mặc định là
  `emptyDir` trên root disk của node. Không khai request `ephemeral-storage`
  nên scheduler xếp quá tải disk; kubelet evict khi disk còn ~10%, ưu tiên pod
  dùng vượt request (không có request = vượt ngay).
- **Cách sửa**: khai request/limit ephemeral-storage cho executor (pod
  template), hoặc mount volume riêng tên `spark-local-dir-*` (NVMe local qua
  `hostPath`, hoặc PVC on-demand:
  `spark.kubernetes.executor.volumes.persistentVolumeClaim.spark-local-dir-1.options.claimName=OnDemand`);
  disk node đủ cho spill lúc đỉnh.
- **Phát hiện**: alert Evicted/DiskPressure; ephemeral-storage > 80%.
- **Nguồn**: [spark-operator #772](https://github.com/GoogleCloudPlatform/spark-on-k8s-operator/issues/772),
  [OneUptime – DiskPressure evictions](https://oneuptime.com/blog/post/2026-08-27-diagnose-diskpressure-inode-evictions-ephemeral-storage/view),
  [Spark on K8s – local storage](https://spark.apache.org/docs/latest/running-on-kubernetes.html)

### 4.2 Skew làm đầy disk/memory của một executor

- **Triệu chứng**: một task chạy rất lâu, spill lớn, executor đó bị
  OOMKilled/evict.
- **Cách sửa**: AQE skew join, salting key.
- **Phát hiện**: task chậm nhất / trung vị > 5x.
- **Nguồn**: [Cazpian – OOM guide](https://cazpian.ai/blog/spark-oom-debugging-the-complete-guide)

---

## 5. Spark Operator (Kubeflow)

### 5.1 Webhook không áp volume/toleration/nodeSelector — không báo lỗi

- **Triệu chứng**: executor chạy sai pool (thiếu toleration spot), volume
  không mount, cấu hình `emptyDir` bị bỏ qua. Không có lỗi ở đâu.
- **Nguyên nhân**: webhook bị tắt hoặc cert TLS lỗi; bug fabric8 tạo pod
  thiếu `metadata.namespace` khiến webhook trả patch rỗng (đã thấy trên API
  server 1.22); `spark.jobNamespaces` trong Helm values không gồm namespace
  của job.
- **Cách sửa**: bật webhook và kiểm tra health; nâng Operator lên bản có
  PR #3057; kiểm tra `spark.jobNamespaces`; ưu tiên pod template native
  (`spark.kubernetes.executor.podTemplateFile`) cho cấu hình quan trọng; smoke
  test sau mỗi lần deploy: kiểm tra toleration trên executor pod đang chạy.
- **Phát hiện**: policy/audit kiểm tra executor pod có đúng toleration/label.
- **Nguồn**: [spark-operator #1725](https://github.com/kubeflow/spark-operator/issues/1725),
  [#1879](https://github.com/kubeflow/spark-operator/issues/1879),
  [#1438](https://github.com/kubeflow/spark-operator/issues/1438),
  [PR #3057](https://github.com/kubeflow/spark-operator/pull/3057)

### 5.2 `SparkApplication` kẹt trạng thái

- **Triệu chứng**: status không bao giờ tới `COMPLETED`/`FAILED` (kẹt ở
  `SUBMITTED`, `PENDING_RERUN`…); `spark-submit` trong Operator treo; retry
  không chạy.
- **Nguyên nhân**: reconcile không requeue khi cleanup chưa xong (#2905);
  driver pod `Failed` với `containerStatuses` rỗng (sau eviction/xoá node)
  khiến Operator đọc sai; JVM submit treo (#1573).
- **Cách sửa**: alert theo thời gian ở trạng thái chưa kết thúc; xoá CR + pod
  thủ công; nâng Operator; đặt timeout trong Airflow.
- **Phát hiện**: alert "SparkApplication kẹt".
- **Nguồn**: [#2905](https://github.com/kubeflow/spark-operator/issues/2905),
  [apache/spark-kubernetes-operator #863](https://github.com/apache/spark-kubernetes-operator/issues/863),
  [#1573](https://github.com/kubeflow/spark-operator/issues/1573),
  [#1572](https://github.com/GoogleCloudPlatform/spark-on-k8s-operator/issues/1572)

### 5.3 Pod và CR mồ côi không được dọn

- **Triệu chứng**: driver pod đã xong và CR cũ tích tụ; executor vẫn chạy
  sau khi driver bị xoá/app bị suspend, giữ node không cho scale về 0.
- **Nguyên nhân**: một số luồng không xoá cascade executor (#2961, #2803);
  không đặt TTL.
- **Cách sửa**: `spec.timeToLiveSeconds` cho `SparkApplication`; giữ
  `spark.kubernetes.executor.deleteOnTermination=true` (mặc định); CronJob
  dọn pod spark cũ hơn X giờ.
- **Phát hiện**: alert "pod mồ côi" và "node rảnh".
- **Nguồn**: [#2961](https://github.com/kubeflow/spark-operator/issues/2961),
  [#2803](https://github.com/kubeflow/spark-operator/issues/2803),
  [#1543](https://github.com/kubeflow/spark-operator/issues/1543),
  [Kubeflow – working with SparkApplication](https://www.kubeflow.org/docs/components/spark-operator/user-guide/working-with-sparkapplication/)

### 5.4 CRD lệch version sau khi upgrade Operator

- **Triệu chứng**: field mới bị bỏ qua hoặc apply lỗi.
- **Nguyên nhân**: Helm không tự upgrade CRD.
- **Cách sửa**: apply CRD tường minh khi upgrade, pin version.
  *[chưa xác minh — hành vi chung của Helm]*

---

## 6. Airflow (`SparkKubernetesOperator`)

### 6.1 Lỗi "already exists" (409) khi retry/rerun

- **Triệu chứng**: `sparkapplications.sparkoperator.k8s.io "X" already exists`.
- **Nguyên nhân**: `metadata.name` cố định; từ Airflow 2.6.2 app cũ không còn
  tự xoá (hành vi xoá-rồi-tạo cũ còn có thể giết app đang chạy).
- **Cách sửa**: tên unique theo run (template theo `ts_nodash`/`try_number`)
  + TTL cleanup của Operator.
- **Nguồn**: [airflow #35395](https://github.com/apache/airflow/issues/35395),
  [#32363](https://github.com/apache/airflow/issues/32363),
  [#16290](https://github.com/apache/airflow/issues/16290),
  [kubeflow #1566](https://github.com/kubeflow/spark-operator/issues/1566)

### 6.2 Task fail nhưng Spark job vẫn chạy

- **Triệu chứng**: 404 `pods "<name>-driver" not found`, task fail; 1-2 phút
  sau driver xuất hiện và chạy không ai giám sát.
- **Nguyên nhân**: Airflow tìm driver pod trước khi Spark Operator tạo xong
  (báo cáo trên provider cncf.kubernetes 8.3.1).
- **Cách sửa**: nâng provider; retry task; đảm bảo retry không chạy trùng job
  (tên unique + ghi idempotent).
- **Nguồn**: [airflow #40495](https://github.com/apache/airflow/issues/40495),
  [#58228](https://github.com/apache/airflow/issues/58228)

### 6.3 Task zombie/retry bám vào driver cũ hoặc tạo bản chạy trùng

- **Triệu chứng**: worker chết, task retry tìm thấy driver cũ và chờ nó, hoặc
  khởi chạy bản thứ hai.
- **Cách sửa**: job idempotent (Iceberg `MERGE`/overwrite partition), đặt
  timeout.
- **Nguồn**: [airflow #35395](https://github.com/apache/airflow/issues/35395)

### 6.4 Lỗi RBAC và mất log

- **Triệu chứng**: 403 khi create/watch `sparkapplications` hoặc đọc
  `pods/log`; task không hiện log Spark.
- **Cách sửa**: `ServiceAccount` của Airflow có Role trong namespace spark:
  create/get/list/watch/delete `sparkapplications`; get/list/watch `pods`,
  `pods/log`.
- **Nguồn**: [Airflow provider docs](https://airflow.apache.org/docs/apache-airflow-providers-cncf-kubernetes/stable/_api/airflow/providers/cncf/kubernetes/operators/spark_kubernetes/index.html)
  (chi tiết RBAC *[chưa xác minh]*)

---

## 7. Object storage & Iceberg

### 7.1 S3 throttling

- **Triệu chứng**: `503 Slow Down` / "Please reduce your request rate", ghi
  chậm hẳn.
- **Nguyên nhân**: nhiều task ghi nhiều file nhỏ cùng prefix, không
  repartition trước khi ghi.
- **Cách sửa**: repartition/sort theo partition key trước khi ghi;
  `write.distribution-mode=hash`; Iceberg `write.object-storage.enabled` để
  hash prefix; tăng retry của S3A/S3FileIO.
- **Nguồn**: [iceberg #6125](https://github.com/apache/iceberg/issues/6125),
  [AWS – best practices truy cập S3](https://aws.amazon.com/blogs/big-data/best-practices-to-optimize-data-access-performance-from-amazon-emr-and-aws-glue-to-amazon-s3/)

### 7.2 Commit conflict

- **Triệu chứng**: `CommitFailedException: Cannot commit changes based on
  stale table metadata`.
- **Nguyên nhân**: optimistic concurrency — hai job (hoặc job + compaction)
  cùng commit một bảng.
- **Cách sửa**: tăng `commit.retry.num-retries` và thời gian chờ; không lên
  lịch compaction trùng ETL; dùng Airflow pool để mỗi bảng chỉ một writer.
- **Nguồn**: [iceberg #9178](https://github.com/apache/iceberg/issues/9178),
  [Ryft – commit conflicts](https://www.ryft.io/blog/handling-commit-conflicts-in-apache-iceberg-patterns-and-fixes),
  [iceberg #1912](https://github.com/apache/iceberg/issues/1912)

### 7.3 Nhiều file nhỏ

- **Triệu chứng**: thời gian job và phí request storage tăng dần theo tuần;
  query planning chậm.
- **Cách sửa**: định kỳ chạy `rewrite_data_files`, `expire_snapshots`,
  `rewrite_manifests`.
- **Nguồn**: [Ryft](https://www.ryft.io/blog/handling-commit-conflicts-in-apache-iceberg-patterns-and-fixes)

### 7.4 JDBC catalog hết connection

- **Triệu chứng**: `IllegalStateException: Connection pool shut down`, hoặc
  Postgres "too many connections" khi nhiều job chạy cùng lúc.
- **Cách sửa**: tăng `max_connections` của Postgres; thêm PgBouncer khi số
  job đồng thời tăng.
- **Nguồn**: [iceberg #11633](https://github.com/apache/iceberg/issues/11633),
  [Iceberg JDBC catalog](https://iceberg.apache.org/docs/latest/jdbc/)
  (mức độ ở quy mô Phase 1 *[chưa xác minh]*)

### 7.5 Credential hết hạn giữa job dài

- **Triệu chứng**: job chạy vài giờ rồi fail 403 / `ExpiredToken`.
- **Nguyên nhân**: dùng sai credentials provider nên token workload identity
  không được làm mới.
- **Cách sửa**: dùng provider hỗ trợ web identity/workload identity của cloud
  với SDK bản mới. *[chưa xác minh]*

---

## 8. Network

### 8.1 Hết IP cho pod (EKS VPC CNI)

- **Triệu chứng**: pod `Pending`/`ContainerCreating` với "failed to assign an
  IP address to container" dù còn CPU/RAM.
- **Nguyên nhân**: mỗi pod lấy một IP của VPC; subnet nhỏ, chạm giới hạn ENI
  của instance, EC2 API bị throttle khi scale nhanh.
- **Cách sửa**: subnet lớn hơn, prefix delegation, secondary CIDR; AKS dùng
  Azure CNI Overlay.
- **Phát hiện**: metric IP của CNI; event `FailedCreatePodSandBox`.
- **Nguồn**: [amazon-vpc-cni-k8s #1245](https://github.com/aws/amazon-vpc-cni-k8s/issues/1245),
  [Data on EKS – networking](https://awslabs.github.io/data-on-eks/docs/bestpractices/networking),
  [Adevinta – hết IP trên EKS](https://adevinta.com/techblog/how-we-avoided-an-outage-caused-by-running-out-of-ips-in-eks/)

### 8.2 Lỗi DNS khi nhiều pod khởi động cùng lúc

- **Triệu chứng**: `java.net.UnknownHostException: kubernetes.default.svc`
  trên driver, hoặc executor không resolve được service của driver và thoát
  exit code 1.
- **Nguyên nhân**: CoreDNS quá tải khi nhiều pod khởi động cùng lúc; service
  của driver chưa sẵn sàng.
- **Cách sửa**: NodeLocal DNSCache; scale CoreDNS; tinh chỉnh `ndots`; giữ
  batching allocation mặc định.
- **Nguồn**: [SPARK-29640](https://issues.apache.org/jira/browse/SPARK-29640),
  [spark-operator #1200](https://github.com/kubeflow/spark-operator/issues/1200),
  [#1019](https://github.com/GoogleCloudPlatform/spark-on-k8s-operator/issues/1019)

### 8.3 Phí NAT và phí giữa zone

Xem [phase-1-startup.md](../phase-1-startup.md) mục 3.2.

---

## 9. Observability

### 9.1 History Server trống hoặc app crash hiện mãi "incomplete"

- **Nguyên nhân**: driver bị giết trước `SparkListenerApplicationEnd`, để lại
  file `.inprogress` trên object storage.
- **Cách sửa**: `spark.eventLog.rolling.enabled=true` +
  `spark.eventLog.rolling.maxFileSize`; chấp nhận app crash hiện incomplete.
- **Nguồn**: [SPARK-35428](https://issues.apache.org/jira/browse/SPARK-35428),
  [Spark monitoring](https://spark.apache.org/docs/latest/monitoring.html)

### 9.2 Mất metric của pod sống ngắn

- **Triệu chứng**: pod sống ngắn hơn một chu kỳ scrape thì không có metric.
- **Cách sửa**: chu kỳ scrape ngắn cho pod spark, hoặc push metric.
- **Nguồn**: [dev.to – Spark job dies before Prometheus can scrape it](https://dev.to/chiragbhatia94/your-spark-job-dies-before-prometheus-can-even-scrape-it-how-do-you-monitor-dead-containers-2oei)

### 9.3 Mất log khi pod bị xoá

- **Nguyên nhân**: executor bị xoá khi kết thúc, `kubectl logs` không còn.
- **Cách sửa**: Loki/Promtail DaemonSet gom stdout; giữ driver pod fail một
  thời gian qua TTL. *[chưa xác minh — thực hành phổ biến]*

---

## 10. Chi phí phát sinh

- **Rò rỉ làm pool không về 0**: executor mồ côi (5.3), `SparkApplication`
  chạy dài bị quên, quá nhiều pod có `safe-to-evict=false` (cũng chặn
  scale-down — [autoscaler #3183](https://github.com/kubernetes/autoscaler/issues/3183)).
- **Request quá tay**: `spark.executor.memory` cao hơn nhiều so với dùng
  thật; pool không đặt min 0.
- **Phát hiện**: node-giờ của executor pool khi không có app nào chạy; chi
  phí theo namespace.
- **Nguồn**: [Onehouse](https://www.onehouse.ai/blog/why-sparks-autoscaler-fails-your-lakehouse-and-how-we-fixed-it);
  phần còn lại *[chưa xác minh]*.
