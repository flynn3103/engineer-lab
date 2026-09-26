# Phase 2 — Lỗi thường gặp khi vận hành Spark trên Kubernetes cho nhiều team

Áp dụng cho stack trong [phase-2-growth.md](../phase-2-growth.md): 2 cluster,
namespace theo team, YuniKorn với queue `critical`/`batch.team-*`/`adhoc`,
Kubeflow Spark Operator ≥ 2.0, Argo CD, Iceberg REST catalog, OpenCost.

**Mọi lỗi của Phase 1 vẫn áp dụng** — xem
[Phase 1 common issues](../../start-up/issue/common-issues.md). Tài liệu này chỉ
ghi lỗi **mới xuất hiện hoặc nặng hơn nhiều** khi nhiều team dùng chung
cluster.

Mỗi lỗi ghi: **Triệu chứng / Nguyên nhân / Cách sửa / Phát hiện / Nguồn**.
Mục đánh dấu *[chưa xác minh]* là kiến thức chung, chưa tìm được nguồn cụ thể.

## Top 10 cho Phase 2 (tần suất × mức ảnh hưởng)

| # | Lỗi | Phòng ngừa chính | Mục |
|---|---|---|---|
| 1 | Gang scheduling kẹt: nhiều app cùng giữ placeholder, executor không khởi động | Queue max ≥ gang lớn nhất, `maxapplications`, placeholder timeout > thời gian autoscale | 1.1 |
| 2 | Preemption giết driver → cả app fail | `PriorityClass` driver `allow-preemption: "false"`, guaranteed cho `critical` | 1.3 |
| 3 | Guaranteed/max đặt sai: tổng guaranteed vượt capacity, hoặc max quá thấp để tài nguyên rảnh không ai dùng | Tổng guaranteed ≤ capacity thật, max cho mượn | 1.4 |
| 4 | Autoscaler và YuniKorn "không hiểu nhau": pod Pending mãi dù cần node mới | Cấu hình đã kiểm chứng, test scale-from-zero, alert Pending | 1.6 |
| 5 | Một team (backfill, skew) làm evict/chậm job team khác trên cùng node | Ephemeral-storage bắt buộc, NVMe, pool riêng cho `critical`, queue `adhoc` giới hạn | 2.1-2.2 |
| 6 | Service tồn đọng → pod mới lỗi "argument list too long" | `timeToLiveSeconds`, `enableServiceLinks: false` | 3.3 |
| 7 | Nhiều writer cùng bảng + maintenance trùng giờ → commit conflict | 1 writer chính/bảng, lịch maintenance ngoài cửa sổ `critical` | 5.1 |
| 8 | Catalog down làm fail job của cả 4 team | Catalog 2 replica, Postgres HA, alert + runbook | 5.2 |
| 9 | Prometheus nổ cardinality vì metric theo app/executor | `spark.metrics.namespace` cố định, drop label `executor_id` | 6.1 |
| 10 | Showback sai: tổng theo namespace < hoá đơn, số nhảy khi đổi cách chia | Chính sách chia idle/system rõ ràng, bill theo request | 7.1 |

### Alert tối thiểu thêm cho Phase 2

| Alert | Điều kiện | Bắt lỗi |
|---|---|---|
| Chờ placeholder | App ở trạng thái chờ gang > 15 phút, hoặc event "Placeholder timed out" | 1.1, 1.2 |
| `critical` thiếu tài nguyên | Queue `critical` dưới guaranteed trong khi có app `critical` Pending | 1.3, 1.4 |
| Driver bị preempt | Pod `spark-role=driver` bị xoá do preemption | 1.3 |
| Job `critical` trễ | Chưa xong lúc 06:30 | 1.x, 2.x, 5.x |
| Service trong namespace | Số `Service` trong namespace Spark > 1.000 | 3.3 |
| Catalog | Health check lỗi hoặc p95 latency commit > ngưỡng | 5.2 |
| Commit conflict | Số `CommitFailedException` trong log > N/giờ | 5.1 |
| Cardinality | Số series Prometheus tăng > 20%/tuần | 6.1 |
| Chi phí chưa phân bổ | Idle + chưa gán namespace > 25% tổng chi phí cluster | 7.1 |

---

## 1. Multi-tenant scheduling (YuniKorn)

### 1.1 Gang scheduling kẹt khi nhiều app chạy cùng lúc

- **Triệu chứng**: submit 2+ app cùng lúc, chỉ driver chạy, executor không
  khởi động vì thiếu tài nguyên; log YuniKorn "Placeholder timed out"; app chờ
  đến hết timeout (mặc định 15 phút) rồi mới chạy hoặc fail.
- **Nguyên nhân**: mỗi app giữ một phần placeholder, không app nào đủ cả gang
  (fragmentation). Queue max nhỏ hơn gang của app; placeholder timeout ngắn
  hơn thời gian autoscaler thêm node.
- **Cách sửa**:
  - Queue max ≥ gang lớn nhất (driver + `minExecutors` × kích thước executor)
  - `maxapplications` trên queue để giới hạn app chạy song song
  - `placeholderTimeoutInSeconds` > thời gian scale-from-zero thực tế
  - Hiểu `gangSchedulingStyle`: `Soft` (mặc định) hết timeout thì chạy như
    app thường; `Hard` thì fail app
  - `minExecutors` thấp hơn đỉnh để app bắt đầu được khi cluster bận
- **Phát hiện**: alert "chờ placeholder".
- **Nguồn**: [YUNIKORN-2682](https://www.mail-archive.com/dev@yunikorn.apache.org/msg07210.html),
  [YUNIKORN-2687](https://issues.apache.org/jira/browse/YUNIKORN-2687),
  [YuniKorn – gang scheduling](https://yunikorn.apache.org/docs/user_guide/gang_scheduling/)

### 1.2 Placeholder nhỏ hơn pod thật (PySpark)

- **Triệu chứng**: placeholder được cấp, nhưng executor thật không thay được
  placeholder và nằm Pending.
- **Nguyên nhân**: task group do Operator sinh ra không tính
  `spark.executor.pyspark.memory` vào `minResource`, nên placeholder nhỏ hơn
  executor thật.
- **Cách sửa**: nâng Operator lên bản đã sửa, hoặc tăng `memoryOverhead` thay
  vì dùng `spark.executor.pyspark.memory`; kiểm tra annotation
  `yunikorn.apache.org/task-groups` trên driver pod khớp với request thật.
- **Phát hiện**: executor Pending trong khi placeholder của cùng app đang chạy.
- **Nguồn**: [spark-operator #2176](https://github.com/kubeflow/spark-operator/issues/2176)

### 1.3 Preemption giết driver

- **Triệu chứng**: app `batch`/`adhoc` fail giữa chừng ngay khi job `critical`
  bắt đầu; driver pod bị xoá.
- **Nguyên nhân**: preemption chọn driver làm nạn nhân. Driver giữ toàn bộ
  trạng thái (DAG, vị trí shuffle), mất driver là mất cả app, khác với mất
  executor.
- **Cách sửa**: `PriorityClass` cho driver với annotation
  `yunikorn.apache.org/allow-preemption: "false"` (gợi ý mạnh, không đảm bảo
  tuyệt đối); guaranteed cho queue cần bảo vệ (YuniKorn không preempt task khi
  queue chưa vượt guaranteed); `preemption.policy: fence` cho `adhoc`.
- **Phát hiện**: alert "driver bị preempt".
- **Nguồn**: [YuniKorn – preemption design](https://yunikorn.apache.org/docs/design/preemption/)

### 1.4 Guaranteed/max không khớp capacity

- **Triệu chứng**: job `critical` vẫn trễ dù có guaranteed; hoặc ban ngày
  cluster rảnh nhưng team bị giới hạn không dùng được.
- **Nguyên nhân**: tổng guaranteed vượt capacity thật (hoặc capacity cần
  autoscale mới có, trong khi pool đang ở 0); max đặt bằng guaranteed nên
  không mượn được; `ResourceQuota` namespace thấp hơn queue max.
- **Cách sửa**: tổng guaranteed ≤ capacity có thể có trong vài phút; max cao
  hơn guaranteed để cho mượn; `ResourceQuota` ≥ queue max; xem lại mỗi quý
  theo số liệu thật.
- **Phát hiện**: alert "`critical` thiếu tài nguyên"; dashboard usage vs
  guaranteed theo queue.
- **Nguồn**: [YuniKorn – queue config](https://yunikorn.apache.org/docs/user_guide/queue_config/),
  [YuniKorn – preemption design](https://yunikorn.apache.org/docs/design/preemption/)

### 1.5 Reservation chặn node, scheduler đứng

- **Triệu chứng**: preemption không xảy ra, app Pending lâu dù có thể preempt;
  scheduler có vẻ "đứng".
- **Nguyên nhân**: reservation trên node có thể chặn node vĩnh viễn trong một
  số trường hợp.
- **Cách sửa**: nâng YuniKorn lên bản có fix; restart scheduler là cách chữa
  cháy.
- **Phát hiện**: app Pending lâu trong khi queue khác đang vượt guaranteed.
- **Nguồn**: [YUNIKORN-3092](https://www.mail-archive.com/issues@yunikorn.apache.org/msg21159.html)

### 1.6 Autoscaler không tạo node cho pod của YuniKorn

- **Triệu chứng**: pod/placeholder Pending, node pool không scale lên; hoặc
  node mới được tạo nhưng YuniKorn không đặt pod lên.
- **Nguyên nhân**: Karpenter mô phỏng quyết định của default scheduler; khi
  custom scheduler lọc node theo logic riêng, hai bên không đồng ý và pod có
  thể Pending mãi. Issue hỗ trợ custom scheduler của Karpenter vẫn mở.
- **Cách sửa**: dùng tổ hợp version/cấu hình đã được kiểm chứng (ví dụ
  blueprint Data on EKS); test scale-from-zero với YuniKorn trên staging sau
  mỗi lần upgrade; tránh ràng buộc node chỉ YuniKorn hiểu.
- **Phát hiện**: alert Pending > 10 phút trong khi pool dưới max.
- **Nguồn**: [karpenter #742](https://github.com/kubernetes-sigs/karpenter/issues/742),
  [karpenter-provider-aws #7265](https://github.com/aws/karpenter-provider-aws/issues/7265)

### 1.7 Admission controller của YuniKorn đổi scheduler của mọi pod

- **Triệu chứng**: pod hệ thống (Airflow, Prometheus…) cũng được YuniKorn
  schedule, bị ảnh hưởng khi YuniKorn lỗi hoặc upgrade.
- **Nguyên nhân**: YuniKorn cài admission controller mặc định tự đặt
  `schedulerName` cho mọi pod.
- **Cách sửa**: cấu hình admission controller chỉ xử lý namespace Spark
  (`admissionController.filtering.*` trong `yunikorn-configs`)
  *[kiểm tra tên key theo version]*.
- **Phát hiện**: pod ngoài namespace Spark có `schedulerName: yunikorn`.
- **Nguồn**: [Kubeflow – YuniKorn integration](https://spark.kubeflow.org/en/latest/user-guide/yunikorn-integration.html)

---

## 2. Noisy neighbor

### 2.1 Job của team này làm evict/chậm job team khác

- **Triệu chứng**: executor của team A bị `Evicted` (DiskPressure) hoặc chậm
  hẳn khi job shuffle lớn của team B chạy trên cùng node.
- **Nguyên nhân**: disk local và network của node là tài nguyên dùng chung,
  không nằm trong queue quota. Phase 1 lỗi này chỉ ảnh hưởng một team; Phase 2
  lan sang team khác.
- **Cách sửa**: Kyverno bắt buộc request/limit `ephemeral-storage`; NVMe riêng
  làm `spark-local-dir`; pool on-demand riêng cho `critical`; AQE skew join.
- **Phát hiện**: eviction trên node đang chạy app của nhiều team; tương quan
  với app có spill lớn.
- **Nguồn**: như [Phase 1 mục 4.1](../../start-up/issue/common-issues.md#41-pod-bị-evict-vì-hết-ephemeral-storage);
  phần ảnh hưởng chéo giữa team *[chưa xác minh]*.

### 2.2 Backfill storm

- **Triệu chứng**: một team chạy backfill vài tháng → hàng trăm
  `SparkApplication` cùng lúc; queue đầy, API server chậm, S3 throttling, commit
  conflict, job của team khác trễ.
- **Nguyên nhân**: Airflow backfill tạo nhiều DAG run song song, không có giới
  hạn ở tầng Airflow lẫn queue.
- **Cách sửa**: backfill chạy trong queue `adhoc` (max 64 vcore,
  `maxapplications` 10); Airflow `max_active_runs` và pool theo team; lịch
  backfill ngoài cửa sổ `critical`.
- **Phát hiện**: số `SparkApplication` tạo/giờ vượt 2x bình thường.
- **Nguồn**: *[chưa xác minh]*

---

## 3. Spark Operator ở throughput cao hơn

### 3.1 Webhook làm mỗi job khởi động chậm ~60 giây

- **Triệu chứng**: thời gian từ submit đến driver chạy tăng khi nhiều app.
- **Nguyên nhân**: mutating webhook trên đường tạo mọi pod.
- **Cách sửa**: tắt webhook (`webhook.enable: false`), dùng pod template
  (cũng tránh lỗi webhook không áp cấu hình ở Phase 1 mục 5.1).
- **Phát hiện**: p95 thời gian submit → driver Running.
- **Nguồn**: [Kubeflow Spark Operator benchmarks](https://spark.kubeflow.org/en/latest/performance/benchmarking.html)

### 3.2 Operator thành nút thắt khi backfill

- **Triệu chứng**: `SparkApplication` nằm lâu ở trạng thái mới tạo; CPU
  Operator 100%.
- **Nguyên nhân**: benchmark cho thấy Operator xử lý ~130 app/phút mặc định,
  giới hạn bởi CPU; tăng `controller.workers` 10 → 20 chỉ thêm ~7-11%.
- **Cách sửa**: `controller.workers` 20-30 trên node đủ CPU; nhiều Operator
  instance chia theo namespace khi cần; giới hạn backfill (2.2).
- **Phát hiện**: CPU Operator, độ trễ reconcile.
- **Nguồn**: [Kubeflow Spark Operator benchmarks](https://spark.kubeflow.org/en/latest/performance/benchmarking.html)

### 3.3 Service tồn đọng → "argument list too long"

- **Triệu chứng**: pod mới trong namespace (kể cả không phải Spark) không khởi
  động: "argument list too long".
- **Nguyên nhân**: mỗi app để lại service (ví dụ `*-ui-svc`); kubelet inject 3
  biến môi trường cho **mỗi** service trong namespace vào mọi pod. Sau khoảng
  ≥ 2.000 app không dọn, danh sách env quá dài.
- **Cách sửa**: `timeToLiveSeconds` trên mọi `SparkApplication`;
  `enableServiceLinks: false` trong pod template; dọn service mồ côi.
- **Phát hiện**: alert "service trong namespace".
- **Nguồn**: [spark-operator #2984](https://github.com/kubeflow/spark-operator/issues/2984),
  [kubernetes #121787](https://github.com/kubernetes/kubernetes/issues/121787)

### 3.4 API server chậm vì Spark poll executor pod

- **Triệu chứng**: latency K8s API tăng (benchmark ghi nhận đỉnh ~600 ms) khi
  nhiều app chạy.
- **Nguyên nhân**: driver Spark truy vấn danh sách executor pod thường xuyên,
  không phải do Operator.
- **Cách sửa**: `spark.kubernetes.executor.enablePollingWithResourceVersion:
  "true"` (benchmark lưu ý rủi ro nhất quán); giảm số app chạy song song không
  cần thiết.
- **Phát hiện**: metric latency request của API server.
- **Nguồn**: [Kubeflow Spark Operator benchmarks](https://spark.kubeflow.org/en/latest/performance/benchmarking.html)

### 3.5 Upgrade Operator/YuniKorn ảnh hưởng mọi team cùng lúc

- **Triệu chứng**: sau upgrade, job của tất cả team lỗi cùng lúc (CRD lệch,
  field đổi hành vi, annotation task group khác).
- **Nguyên nhân**: một Operator và một scheduler phục vụ toàn cluster.
- **Cách sửa**: upgrade trên staging trước ≥ 1 tuần với job mẫu của mỗi team;
  apply CRD tường minh; pin version; thông báo lịch upgrade; có đường rollback.
- **Nguồn**: *[chưa xác minh]*

---

## 4. GitOps & dependency

### 4.1 Argo CD và thứ khác cùng sửa một resource

- **Triệu chứng**: Application luôn `OutOfSync`; hotfix sửa tay bị Argo revert;
  hoặc Argo xoá `SparkApplication` do Airflow tạo.
- **Nguyên nhân**: Argo CD quản lý resource mà Operator/controller khác cũng
  ghi (status, field được mutate), hoặc manifest job từ Git mang nhãn tracking
  của Argo nên bị prune.
- **Cách sửa**: Argo chỉ quản lý hạ tầng (Operator, YuniKorn config, namespace,
  quota, RBAC), không quản lý `SparkApplication` runtime; dùng
  `ignoreDifferences` cho field bị controller khác sửa; mọi hotfix đi qua PR.
- **Phát hiện**: Application `OutOfSync` kéo dài; audit log thao tác tay.
- **Nguồn**: [Argo CD – diffing customization](https://argo-cd.readthedocs.io/en/stable/user-guide/diffing/);
  trường hợp cụ thể với Spark *[chưa xác minh]*

### 4.2 Mỗi team một image, xung đột dependency

- **Triệu chứng**: `NoSuchMethodError`/`ClassNotFoundException` khi đổi version
  Iceberg/connector; cùng query chạy khác nhau giữa team; nhiều CVE.
- **Nguyên nhân**: team tự build image từ base khác nhau, trộn version Spark,
  Iceberg, Hadoop connector.
- **Cách sửa**: 1 base image do platform quản lý + ma trận version hỗ trợ
  (N, N-1); Kyverno chỉ cho image build từ base chung; scan CVE trong CI.
- **Nguồn**: *[chưa xác minh]*

---

## 5. Iceberg & catalog

### 5.1 Commit conflict tăng nhanh khi nhiều writer

- **Triệu chứng**: `CommitFailedException: Cannot commit changes based on
  stale table metadata` xuất hiện thường xuyên hơn; job chạy xong phần tính
  toán rồi fail ở bước commit.
- **Nguyên nhân**: Iceberg dùng optimistic concurrency — conflict xảy ra như
  nhau với JDBC, REST hay Glue catalog. Mỗi writer thêm (ETL team khác,
  compaction, expire snapshot, `MERGE`) làm xác suất va chạm tăng không tuyến
  tính. Tăng `commit.retry.num-retries` lên rất cao chỉ làm lỗi đến muộn hơn.
- **Cách sửa**: 1 team owner và 1 writer chính mỗi bảng; lịch maintenance
  ngoài cửa sổ `critical`; ghi theo partition riêng để conflict validation
  không chạm nhau; Airflow pool để serialize writer cùng bảng.
- **Phát hiện**: alert "commit conflict".
- **Nguồn**: [Surviving commit conflicts – dozens of writers](https://datalakehousehub.com/blog/iceberg-concurrent-commits-agents/),
  [AWS – concurrent write conflicts on Glue Data Catalog](https://aws.amazon.com/blogs/big-data/manage-concurrent-write-conflicts-in-apache-iceberg-on-the-aws-glue-data-catalog),
  [Ryft – commit conflicts](https://www.ryft.io/blog/handling-commit-conflicts-in-apache-iceberg-patterns-and-fixes)

### 5.2 Catalog là điểm lỗi chung

- **Triệu chứng**: catalog hoặc Postgres phía sau lỗi → mọi job của 4 team
  fail khi đọc metadata hoặc commit; Trino cũng không query được.
- **Nguyên nhân**: một catalog dùng chung cho toàn công ty.
- **Cách sửa**: catalog ≥ 2 replica trên các zone khác nhau; Postgres HA;
  health check + alert; runbook failover; job retry được khi lỗi tạm thời.
- **Phát hiện**: alert "catalog".
- **Nguồn**: *[chưa xác minh]*

### 5.3 Không ai sở hữu maintenance của bảng dùng chung

- **Triệu chứng**: bảng dùng chung nhiều file nhỏ, snapshot tích tụ, query
  chậm dần; phí storage tăng vì snapshot cũ không xoá.
- **Nguyên nhân**: bảng nhiều team ghi nhưng không ai chịu trách nhiệm
  compaction/expire.
- **Cách sửa**: mỗi bảng có owner ghi trong catalog; platform chạy
  maintenance mặc định cho bảng không có lịch riêng.
- **Nguồn**: *[chưa xác minh]*

---

## 6. Observability

### 6.1 Prometheus nổ cardinality

- **Triệu chứng**: Prometheus dùng RAM tăng dần theo tuần, query chậm, có lúc
  OOM; chi phí managed Prometheus tăng.
- **Nguyên nhân**: mặc định tên metric của driver có tiền tố `spark.app.id`,
  nên mỗi app tạo ra tập metric mới; metric executor gắn id app/executor. Với
  400 app/ngày và hàng nghìn executor, số series mới không có giới hạn.
- **Cách sửa**: đặt `spark.metrics.namespace` cố định (ví dụ theo tên job
  thay vì app id); relabel để drop label `executor_id`; recording rules tổng
  hợp theo job/team; retention ngắn cho metric chi tiết.
- **Phát hiện**: alert "cardinality"; `prometheus_tsdb_head_series`.
- **Nguồn**: [Spark – monitoring](https://spark.apache.org/docs/latest/monitoring.html),
  [Prometheus relabeling để drop label](https://oneuptime.com/blog/post/2026-02-09-prometheus-relabeling-high-cardinality/view)

### 6.2 Loki chạm giới hạn ingest

- **Triệu chứng**: thiếu log của job khi nhiều executor cùng log nhiều; lỗi
  rate limit trong log của Promtail/agent.
- **Nguyên nhân**: giới hạn ingest theo tenant mặc định của Loki thấp so với
  log Spark ở mức INFO.
- **Cách sửa**: log level WARN cho Spark internals; tăng giới hạn ingest có
  chủ đích; tenant/label theo team.
- **Nguồn**: *[chưa xác minh]*

---

## 7. Chi phí & cross-zone

### 7.1 Showback sai hoặc gây tranh cãi

- **Triệu chứng**: tổng chi phí theo namespace thấp hơn hoá đơn nhiều; số của
  một team thay đổi dù họ không làm gì khác.
- **Nguyên nhân**: chi phí idle (node trả tiền nhưng không pod nào dùng),
  system pool, placeholder, storage không tự gán về namespace. OpenCost tính
  theo max(request, usage), nên team request dư bị tính nhiều hơn dùng thật.
  Đổi cách chia idle mà không báo trước làm số nhảy.
- **Cách sửa**: chính sách viết rõ: idle và system chia theo tỷ lệ usage hay
  platform chịu; storage gán theo bucket/prefix của team; công bố trước khi
  đổi; kiểm tra định kỳ tỷ lệ chi phí chưa phân bổ.
- **Phát hiện**: alert "chi phí chưa phân bổ".
- **Nguồn**: [Cast AI – Kubernetes chargeback/showback](https://cast.ai/blog/kubernetes-chargeback-showback/),
  [OpenCost namespace showback/chargeback](https://stribog.com/blog/opencost-namespace-showback-chargeback-kubernetes-finops)

### 7.2 Shuffle qua zone sau khi bật multi-zone

- **Triệu chứng**: hoá đơn data transfer tăng mạnh sau khi chuyển node pool
  sang nhiều zone "cho HA".
- **Nguyên nhân**: executor của cùng app rải nhiều zone, shuffle đi qua zone
  (AWS, GCP tính ~$0,01/GB mỗi chiều).
- **Cách sửa**: chỉ system pool multi-zone; pool Spark 1 zone hoặc affinity
  giữ mỗi app trong 1 zone. Ước tính ở [phase-2-growth.md](../phase-2-growth.md)
  mục 3.2.
- **Phát hiện**: dòng inter-zone data transfer trong billing.
- **Nguồn**: như [phase-1-startup.md](../../start-up/phase-1-startup.md) mục 3.2
  *[chưa xác minh lại]*

---

## 8. Airflow ở quy mô nhiều team

### 8.1 Task xếp hàng dù cluster còn chỗ

- **Triệu chứng**: task Airflow ở `queued` lâu; job `critical` bắt đầu muộn.
- **Nguyên nhân**: KubernetesExecutor mặc định tạo 1 worker pod mỗi vòng lặp
  scheduler (`worker_pods_creation_batch_size` = 1); `parallelism` thấp.
- **Cách sửa**: tăng `worker_pods_creation_batch_size` và `parallelism`; 2
  scheduler replica; pool theo team.
- **Phát hiện**: số task `queued` và thời gian queued.
- **Nguồn**: [Astronomer – scaling Airflow](https://www.astronomer.io/docs/learn/airflow-scaling-workers),
  [Airflow cncf.kubernetes config](https://airflow.apache.org/docs/apache-airflow-providers-cncf-kubernetes/stable/configurations-ref.html)

### 8.2 DAG của nhiều team làm parse chậm

- **Triệu chứng**: DAG mới lâu mới xuất hiện; scheduler chậm; DAG lỗi của một
  team ảnh hưởng hiển thị của team khác.
- **Nguyên nhân**: parse toàn bộ DAG của 4 team trong cùng tiến trình.
- **Cách sửa**: dag-processor tách riêng; tăng `parsing_processes`, tăng
  `min_file_process_interval`; CI kiểm tra DAG import được trước khi merge.
- **Nguồn**: [Astronomer – scaling Airflow](https://www.astronomer.io/docs/learn/airflow-scaling-workers)

---

## 9. Identity khi nhiều namespace

### 9.1 AKS: hết federated credential

- **Triệu chứng**: không tạo thêm được liên kết workload identity cho
  ServiceAccount mới khi thêm namespace/cluster.
- **Nguyên nhân**: tối đa 20 federated identity credential trên mỗi managed
  identity.
- **Cách sửa**: 1 managed identity cho mỗi team (hoặc mỗi nhóm namespace);
  quản lý bằng Terraform.
- **Nguồn**: [azure-workload-identity – discussion #1178](https://github.com/Azure/azure-workload-identity/discussions/1178),
  [AKS – workload identity overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
