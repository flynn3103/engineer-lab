# Phase 3 — Lỗi thường gặp khi vận hành Spark trên Kubernetes ở quy mô enterprise

Áp dụng cho stack trong [phase-3-enterprise.md](../phase-3-enterprise.md):
nhiều cluster K8s ở 2 region, portal + router, YuniKorn mỗi cluster,
Celeborn, Iceberg REST catalog, OpenLineage, ~10.000 job/ngày.

Chỉ gồm lỗi **mới xuất hiện hoặc nặng hơn nhiều** ở quy mô này. Lỗi của các
phase trước vẫn áp dụng — xem
[Phase 1](../../start-up/issue/common-issues.md) và
[Phase 2](../../growth/issue/common-issues.md).

Mỗi lỗi ghi: **Triệu chứng / Nguyên nhân / Cách sửa / Phát hiện / Nguồn**.
Mục đánh dấu *[chưa xác minh]* là kiến thức chung, chưa tìm được nguồn cụ thể.

## Top 10 ở quy mô enterprise (tần suất × mức ảnh hưởng)

| # | Lỗi | Phòng ngừa chính | Mục |
|---|---|---|---|
| 1 | Shuffle Celeborn đi qua zone khác → hoá đơn network tăng gần gấp đôi | Celeborn cell theo zone, executor cùng zone với worker | 3.3 |
| 2 | API server chậm/quá tải do driver LIST pod liên tục và pod churn | Namespace theo team, giảm polling, giới hạn pod/namespace | 1.1 |
| 3 | etcd đầy → cluster read-only | TTL cho `SparkApplication`, giới hạn event, alert DB size | 1.2 |
| 4 | Celeborn worker đầy disk / partition khổng lồ / upgrade làm fail job | Partition split, disk dư, graceful shutdown | 3.1-3.2 |
| 5 | Router failover chạy trùng job ở 2 cluster | Run ID duy nhất, router là nguồn sự thật duy nhất | 4.1 |
| 6 | Replica DR ở region B không đọc được (đường dẫn tuyệt đối, thứ tự commit) | Location trừu tượng, replication hiểu Iceberg, DR drill | 5.1 |
| 7 | Hết capacity một loại instance/spot hoặc bị throttle API cloud khi scale | Đa dạng instance type/zone, xin quota trước, fallback | 6.1-6.2 |
| 8 | Metric bùng nổ cardinality do label pod/executor | Bỏ label id, aggregate, backend metric phân tán | 7.1 |
| 9 | Upgrade fleet vỡ vì lệch version K8s/Operator/Spark giữa các team | Ma trận version, base image chung, canary cluster | 8.1-8.2 |
| 10 | Tranh chấp chargeback và tuning tự động gây regression | Quy tắc phân bổ chi phí chung rõ ràng; guardrail cho tuning | 9.1, 7.3 |

### Alert tối thiểu bổ sung ở quy mô này

| Alert | Điều kiện | Bắt lỗi |
|---|---|---|
| API server chậm | p99 latency LIST/mutating > ngưỡng baseline x 2 | 1.1 |
| etcd DB size | > 70% quota (quota khuyến nghị ≤ 8 GiB) | 1.2 |
| Operator backlog | số `SparkApplication` chờ xử lý tăng liên tục > 10 phút | 2.1 |
| Queue starvation | job T0/T1 chờ trong queue YuniKorn > N phút | 2.2 |
| Celeborn disk | disk worker > 80% hoặc số worker healthy < ngưỡng | 3.1 |
| Inter-AZ cost | billing inter-AZ theo ngày vượt ngưỡng | 3.3 |
| Replication lag | độ trễ replica region B > RPO | 5.1 |
| Series active | tăng > 20%/tuần | 7.1 |
| Cloud API throttle | `RequestLimitExceeded` / quota error từ autoscaler | 6.2 |

---

## 1. Control plane

### 1.1 API server quá tải do LIST polling và pod churn

- **Triệu chứng**: `kubectl` chậm, submit job chậm, driver timeout khi tạo
  executor, API server latency tăng mạnh vào giờ cao điểm batch.
- **Nguyên nhân**: mỗi driver chạy `ExecutorPodsPollingSnapshotSource`, LIST
  toàn bộ pod theo label mỗi `spark.kubernetes.executor.apiPollingInterval`
  (mặc định 30s). Watch cache không index theo label nên API server phải quét
  mọi pod trong namespace — chi phí tỉ lệ với tổng pod của namespace, không
  với kết quả. Hàng trăm driver trong namespace lớn cộng dồn thành tải LIST
  đáng kể. Pod churn (~400.000 pod/ngày) thêm write và event.
- **Cách sửa**:
  - Mỗi team một namespace để giới hạn số pod mỗi lần quét.
  - `spark.kubernetes.executor.enablePollingWithResourceVersion=true` giảm tải
    đáng kể, nhưng API server có thể trả version cũ (nhất là khi HA) — thử
    kỹ trước khi bật toàn fleet.
  - Tăng `spark.kubernetes.executor.apiPollingInterval` cho job dài.
  - Theo dõi thay đổi dùng Informer thay polling (SPARK-33737, PR #58489).
  - Cấu hình API Priority and Fairness để job batch không chiếm hết capacity
    của controller hệ thống.
- **Phát hiện**: API server request latency/inflight theo verb; alert "API
  server chậm".
- **Nguồn**: [apache/spark PR #58489](https://github.com/apache/spark/pull/58489),
  [Spark on K8s docs](https://spark.apache.org/docs/latest/running-on-kubernetes.html),
  [EKS scalability](https://docs.aws.amazon.com/eks/latest/best-practices/scalability.html)

### 1.2 etcd đầy, cluster thành read-only

- **Triệu chứng**: mọi thao tác tạo/sửa object bị từ chối (không tạo được
  pod, không scale); etcd báo alarm `NOSPACE`.
- **Nguyên nhân**: object tích tụ — `SparkApplication` cũ, event, ConfigMap
  của driver, CRD lớn — cộng churn cao. etcd khuyến nghị DB ≤ 8 GiB (quota
  mặc định 2 GiB ở etcd upstream); vượt quota thì cluster chỉ đọc.
- **Cách sửa**: `timeToLiveSeconds` cho mọi `SparkApplication`; không lưu
  dữ liệu lớn trong CR/ConfigMap; giới hạn event (EventRateLimit/TTL event);
  tách cluster khi số object vẫn tăng.
- **Phát hiện**: alert etcd DB size (trên EKS xem metric
  `apiserver_storage_size_bytes`).
- **Nguồn**: [AWS – managing etcd size on EKS](https://aws.amazon.com/blogs/containers/managing-etcd-database-size-on-amazon-eks-clusters/),
  [etcd – debug large DB size](https://etcd.io/blog/2023/how_to_debug_large_db_size_issue/),
  [Why etcd DB should not exceed 8GB](https://www.perfectscale.io/blog/etcd-8gb)

### 1.3 Event flood

- **Triệu chứng**: API server/etcd tải cao dù số job không đổi; nhiều event
  lặp từ một controller hoặc pod lỗi.
- **Nguyên nhân**: controller hoặc pod retry lỗi liên tục tạo/cập nhật event
  hàng nghìn lần/giây. API Priority and Fairness bảo vệ API chung nhưng không
  sửa nguồn phát event.
- **Cách sửa**: EventRateLimit admission; sửa vòng retry của controller;
  alert theo tốc độ event.
- **Nguồn**: [Rate-limit Kubernetes event floods](https://oneuptime.com/blog/post/2026-09-04-rate-limit-kubernetes-event-floods/view)

---

## 2. Scheduling & Operator

### 2.1 Spark Operator thành nút thắt khi submit đỉnh

- **Triệu chứng**: `SparkApplication` nằm ở trạng thái mới lâu; submit ban
  đêm dồn thành backlog; controller Operator dùng hết CPU.
- **Nguyên nhân**: benchmark của Kubeflow: ~130-150 app/phút/instance,
  controller CPU-bound (dùng hết 36 core), API server latency lên ~600 ms dưới
  tải; webhook thêm ~60s/job; 6.000 app trong một namespace gây pod lỗi do
  tràn biến môi trường.
- **Cách sửa**: tắt webhook (dùng pod template); tăng số worker controller
  (10 → 20); chạy nhiều instance Operator theo namespace; giới hạn số app
  mỗi namespace; `enableServiceLinks: false` trên pod để tránh tràn biến môi
  trường do Service *[chưa xác minh là nguyên nhân chính trong benchmark]*.
- **Phát hiện**: alert "Operator backlog"; CPU của controller.
- **Nguồn**: [Kubeflow Spark Operator benchmark](https://spark.kubeflow.org/en/latest/performance/benchmarking.html)

### 2.2 Queue YuniKorn cấu hình sai → đói tài nguyên hoặc preempt bất ngờ

- **Triệu chứng**: job T0 chờ trong queue trong khi cluster còn capacity ở
  queue khác; hoặc job T1 bị preempt giữa chừng không rõ lý do.
- **Nguyên nhân**: tổng `guaranteed` vượt capacity thật; `max` quá chặt nên
  không mượn được phần rảnh; priority/preemption không khớp định nghĩa tier.
- **Cách sửa**: tổng `guaranteed` ≤ capacity thực tế (tính lại khi thêm/bớt
  node pool); `priority.offset` theo tier; chỉ cho preempt queue T2; review
  cấu hình queue như code (Argo CD) *[chưa xác minh — thực hành chung]*.
- **Phát hiện**: alert "Queue starvation"; metric queue của YuniKorn.
- **Nguồn**: [YuniKorn performance](https://yunikorn.apache.org/docs/performance/evaluate_perf_function_with_kubemark/),
  [Pinterest – YuniKorn trên EKS](https://medium.com/pinterest-engineering/resource-management-with-apache-yunikorn-for-apache-spark-on-aws-eks-at-pinterest-0dba3afb4609)

### 2.3 Throughput scheduler bị giới hạn bởi control plane

- **Triệu chứng**: pod `Pending` hàng loạt dù có node trống, khi nhiều job
  lớn bắt đầu cùng lúc.
- **Nguyên nhân**: YuniKorn đạt ~410 pod/giây trên cluster 4.000 node trong
  benchmark, và giới hạn thực sự là API server/controller-manager/etcd chứ
  không phải scheduler.
- **Cách sửa**: rải thời điểm bắt đầu job T1/T2 (không dồn cùng phút); tăng
  `spark.kubernetes.allocation.batch.size` vừa phải thay vì tối đa; tách
  cluster nếu đỉnh pod/giây vẫn cao.
- **Nguồn**: [YuniKorn performance](https://yunikorn.apache.org/docs/performance/evaluate_perf_function_with_kubemark/)

---

## 3. Remote shuffle (Celeborn)

### 3.1 Worker đầy disk, partition khổng lồ, disk lệch tải

- **Triệu chứng**: push shuffle lỗi, worker bị loại khỏi cụm, job lớn fail;
  một số disk đầy trong khi disk khác rảnh.
- **Nguyên nhân**: job lớn hoặc dữ liệu lệch tạo partition file rất lớn;
  partition > 100 GB dễ làm đầy disk và lệch tải.
- **Cách sửa**: bật partition split (worker báo client chuyển partition sang
  worker mới khi vượt ngưỡng); partition shuffle 64-512 MB; dư disk ≥ 25%;
  xử lý skew ở Spark (AQE).
- **Phát hiện**: alert "Celeborn disk"; số lần split và push fail.
- **Nguồn**: [Spark + Celeborn (Alibaba)](https://www.alibabacloud.com/developer/a/bigdata/spark-celeborn-faster-more-stable),
  [Celeborn discussion #3191](https://github.com/apache/celeborn/discussions/3191)

### 3.2 Celeborn thành điểm lỗi đơn khi upgrade hoặc mất worker

- **Triệu chứng**: rolling upgrade worker làm hàng loạt job fail
  `FetchFailed`; mất master quorum thì mọi job mới không đăng ký được shuffle.
- **Nguyên nhân**: tắt worker khi slot chưa commit; không bật replica; không
  bật stage rerun ở client; tắt quá nhiều worker cùng lúc.
- **Cách sửa**: master 3 node; `celeborn.client.push.replicate.enabled=true`;
  client bật `spark.celeborn.client.spark.fetch.throwsFetchFailure` và
  `spark.celeborn.client.spark.stageRerun.enabled` để Spark chạy lại stage;
  worker dùng graceful shutdown/decommission
  (`celeborn.worker.graceful.shutdown.*`, `celeborn.worker.decommission.*`),
  upgrade từng ít worker một. Báo cáo thực tế còn ghi nhận race khi node bị
  xoá trước khi shuffle hoàn tất.
- **Phát hiện**: số worker healthy, fetch fail rate, stage rerun/job.
- **Nguồn**: [Celeborn client config](https://celeborn.apache.org/docs/latest/configuration/client/),
  [Celeborn worker config](https://celeborn.apache.org/docs/latest/configuration/worker/),
  [Celeborn discussion #3191](https://github.com/apache/celeborn/discussions/3191)

### 3.3 Chi phí network giữa zone bùng nổ

- **Triệu chứng**: hoá đơn inter-AZ tăng vọt sau khi bật Celeborn, có thể
  lớn hơn cả compute.
- **Nguyên nhân**: executor và worker ở zone khác nhau; replica đặt khác
  zone. Với ~2.160 TiB traffic/ngày, 2/3 qua zone khác ≈ ~$885k/tháng trên AWS
  (xem phase-3 mục 3.2).
- **Cách sửa**: Celeborn cell theo zone; executor pool và worker cùng zone
  (node affinity); chấp nhận mất zone = chạy lại stage thay vì replicate qua
  zone.
- **Phát hiện**: alert "Inter-AZ cost" từ billing export.
- **Nguồn**: tính toán nội bộ từ giá inter-AZ công bố *[chưa xác minh với
  case study cụ thể]*.

---

## 4. Multi-cluster routing

### 4.1 Failover chạy trùng job ở hai cluster

- **Triệu chứng**: cùng một ngày dữ liệu bị ghi hai lần, hoặc hai job tranh
  commit cùng bảng sau khi router chuyển job sang cluster khác.
- **Nguyên nhân**: router không biết job ở cluster cũ vẫn chạy (mất kết nối
  tới API server cluster đó, không phải cluster chết); không có khoá theo
  run ID.
- **Cách sửa**: router là nguồn sự thật duy nhất cho trạng thái run; run ID
  duy nhất gắn vào tên `SparkApplication` và commit Iceberg; chỉ failover sau
  khi xác nhận huỷ được app cũ hoặc hết timeout; job ghi idempotent.
- **Nguồn**: *[chưa xác minh — rủi ro chung của hệ thống điều phối đa
  cluster]*.

### 4.2 Công cụ đa cluster chưa hỗ trợ đủ SparkApplication

- **Triệu chứng**: thử MultiKueue/Armada cho Spark gặp tính năng thiếu (dynamic
  allocation, trạng thái app) hoặc phải chạy bản dev.
- **Nguyên nhân**: Kueue v0.17 hỗ trợ SparkApplication sau feature gate và
  không hỗ trợ dynamic allocation; MultiKueue cần field `managedBy` trong
  SparkApplication (issue #2879 và PR #2896 vẫn open); `armada-spark` đang
  phát triển.
- **Cách sửa**: router nội bộ mỏng + YuniKorn mỗi cluster; đánh giá lại định kỳ.
- **Nguồn**: [kubeflow/spark-operator #2879](https://github.com/kubeflow/spark-operator/issues/2879),
  [Kueue – Run a SparkApplication](https://kueue.sigs.k8s.io/docs/tasks/run/kubeflow/sparkapplications/),
  [Kueue v0.17.0 release](https://github.com/kubernetes-sigs/kueue/issues/9951),
  [armada-spark](https://github.com/armadaproject/armada-spark/blob/master/README.md)

---

## 5. Cross-region & DR

### 5.1 Replica Iceberg ở region B không dùng được

- **Triệu chứng**: khi chuyển sang region B, engine vẫn cố đọc bucket ở
  region A (đang lỗi); hoặc bảng replica ở trạng thái không nhất quán
  (metadata trỏ tới file chưa tới).
- **Nguyên nhân**: metadata Iceberg (format v1-v3) ghi **đường dẫn tuyệt
  đối**; replication object storage không hiểu thứ tự commit nên file có thể
  tới sai thứ tự; bảng phải đăng ký lại trong catalog region B.
- **Cách sửa**: tạo bảng với location trừu tượng từ đầu (ví dụ S3
  Multi-Region Access Point hoặc tương đương); hoặc replication hiểu Iceberg
  (copy theo snapshot, rewrite path một lần khi restore); replicate catalog
  cùng dữ liệu; DR drill mỗi quý.
- **Phát hiện**: alert "Replication lag"; job kiểm tra đọc thử snapshot mới
  nhất ở region B mỗi ngày.
- **Nguồn**: [Disaster recovery for Iceberg tables](https://datalakehousehub.com/blog/disaster-recovery-for-iceberg-tables/),
  [AWS sample – cross-region DR for Iceberg/Delta](https://github.com/aws-samples/cross-region-disaster-recovery-sample-for-iceberg-deltalake),
  [AWS re:Post – Iceberg DR](https://repost.aws/questions/QUF6pBn5beTOy2s0V-Im3vbQ/what-are-the-aws-recommended-production-approach-to-recover-apache-iceberg-tables-in-another-region-after-regional-disruption)

### 5.2 Catalog là điểm lỗi chung của cả fleet

- **Triệu chứng**: catalog/DB chậm hoặc down → mọi job ở mọi cluster fail
  khi commit hoặc load bảng.
- **Nguyên nhân**: một catalog dùng chung cho 10.000 job/ngày; DB không HA
  hoặc hết connection; bảng nóng bị tranh chấp commit.
- **Cách sửa**: catalog chạy HA nhiều replica, DB multi-AZ + replica region
  B; connection pool; tách catalog theo BU khi cần; mỗi bảng nóng một writer.
- **Nguồn**: *[chưa xác minh — kinh nghiệm vận hành chung]*; xem thêm lỗi
  commit conflict ở [Phase 1](../../start-up/issue/common-issues.md).

---

## 6. Capacity & quota cloud

### 6.1 Hết capacity một loại instance hoặc spot

- **Triệu chứng**: node không lên được, pod `Pending` hàng loạt; autoscaler
  báo insufficient capacity.
- **Nguyên nhân**: executor pool chỉ dùng vài loại instance/zone; spot pool
  cạn vào giờ cao điểm của cả region.
- **Cách sửa**: ≥ 10 instance type tương đương, nhiều zone; fallback
  on-demand cho T0/T1; lưu ý fallback của Karpenter chỉ kích hoạt khi lỗi
  capacity, không kích hoạt với một số lỗi API.
- **Nguồn**: [Using Spot with Karpenter](https://aws.amazon.com/blogs/containers/using-amazon-ec2-spot-instances-with-karpenter/),
  [karpenter-provider-aws #9616](https://github.com/aws/karpenter-provider-aws/issues/9616),
  [#8885](https://github.com/aws/karpenter-provider-aws/issues/8885)

### 6.2 Throttle API của cloud khi scale nhanh

- **Triệu chứng**: `RequestLimitExceeded`; NodeClaim kẹt rồi bị tạo lại liên
  tục; scale-up chậm dù quota còn.
- **Nguyên nhân**: API EC2 (và tương đương) giới hạn theo account/region
  bằng token bucket; nhiều cluster cùng account cùng scale ban đêm.
- **Cách sửa**: tách account/project theo nhóm cluster; rải thời điểm scale;
  xin tăng rate limit; theo dõi lỗi throttle.
- **Phát hiện**: alert "Cloud API throttle".
- **Nguồn**: [EC2 API throttling](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-throttling.html),
  [karpenter-provider-aws #9311](https://github.com/aws/karpenter-provider-aws/issues/9311),
  [#5021](https://github.com/aws/karpenter-provider-aws/issues/5021)

---

## 7. Observability & tuning

### 7.1 Metric bùng nổ cardinality

- **Triệu chứng**: Prometheus OOM, query dashboard chậm, chi phí metric
  managed tăng nhanh.
- **Nguyên nhân**: metric executor gắn label pod name/executor id/app id;
  ~400.000 pod/ngày tạo series mới liên tục.
- **Cách sửa**: bỏ label id ở relabel, giữ label team/job/tier; aggregate
  theo job trước khi lưu dài hạn; backend phân tán (Mimir/Thanos/
  VictoriaMetrics).
- **Phát hiện**: alert "Series active".
- **Nguồn**: [Pinterest – logging & monitoring Spark trên EKS](https://aws.amazon.com/blogs/containers/inside-pinterests-custom-spark-job-logging-and-monitoring-on-amazon-eks-using-aws-for-fluent-bit-amazon-s3-and-adot)
  (chi tiết cardinality *[chưa xác minh]*)

### 7.2 Lineage thiếu hoặc quá lớn

- **Triệu chứng**: bảng không có upstream trong DataHub/Marquez; hoặc
  backend lineage chậm vì event quá lớn.
- **Nguyên nhân**: job không dùng base image có listener; thao tác RDD/ghi
  tuỳ biến không phát lineage đầy đủ; column lineage làm event rất lớn
  *[chưa xác minh]*.
- **Cách sửa**: listener bật mặc định trong base image; đo % job có lineage;
  giới hạn kích thước event, tắt column lineage cho job không cần.

### 7.3 Tuning tự động gây regression

- **Triệu chứng**: job đang ổn bắt đầu OOM hoặc chậm sau khi hệ thống gợi ý
  giảm memory/executor.
- **Nguyên nhân**: tuning dựa trên lịch sử không thấy dữ liệu tăng hoặc ngày
  đặc biệt (cuối tháng, backfill).
- **Cách sửa**: chỉ giảm khi đủ N lần chạy ổn định; giữ margin; tự rollback
  khi OOM/SLA miss; không áp tuning tự động cho T0 nếu chưa duyệt.
  *[chưa xác minh — thực hành chung]*

---

## 8. Upgrade & version

### 8.1 Lệch version K8s trong fleet

- **Triệu chứng**: node pool cũ không tương thích control plane mới; cluster
  rơi vào extended support với phí cao hơn.
- **Nguyên nhân**: 7+ cluster upgrade không đồng bộ; kubelet chỉ được phép
  lệch một số minor version so với API server.
- **Cách sửa**: lịch upgrade cố định, thứ tự adhoc → standard → critical;
  dùng công cụ fleet (GKE Fleet, Azure Fleet Manager) hoặc pipeline tự viết.
- **Nguồn**: [Kubernetes version skew policy](https://kubernetes.io/releases/version-skew-policy/)

### 8.2 Nhiều version Spark/Operator/Celeborn client giữa các team

- **Triệu chứng**: upgrade Operator/Celeborn làm hỏng job của một số team;
  bug đã sửa vẫn xuất hiện ở image cũ.
- **Nguyên nhân**: 40 team tự build image với Spark/connector khác nhau;
  CRD Operator không được Helm tự upgrade.
- **Cách sửa**: base image chung + ma trận version hỗ trợ; chặn image ngoài
  ma trận bằng admission policy; canary cluster chạy job mẫu của mỗi BU
  trước khi rollout. *[chưa xác minh — thực hành chung]*

---

## 9. Chi phí & bảo mật

### 9.1 Tranh chấp chargeback

- **Triệu chứng**: BU không chấp nhận hoá đơn; tranh cãi về phần platform
  dùng chung, Celeborn, storage.
- **Nguyên nhân**: chỉ tính chi phí pod; phần dùng chung (Celeborn, system
  node, network, commitment) chia không có quy tắc.
- **Cách sửa**: quy tắc phân bổ được duyệt trước (theo core-giờ, shuffle
  bytes, TiB lưu trữ); gộp billing export của cloud với OpenCost; công bố
  báo cáo hằng tháng. *[chưa xác minh — thực hành FinOps chung]*

### 9.2 Chuỗi cung ứng image và credential rải rác

- **Triệu chứng**: image không rõ nguồn gốc chạy trong production; access key
  tĩnh nằm trong secret của nhiều namespace.
- **Cách sửa**: ký image bằng cosign, Kyverno `verifyImages`; workload
  identity + credential vending từ catalog; quét secret định kỳ.
- **Nguồn**: [Kyverno – verify images](https://kyverno.io/docs/writing-policies/verify-images/)
  *[chưa xác minh chi tiết cấu hình]*
