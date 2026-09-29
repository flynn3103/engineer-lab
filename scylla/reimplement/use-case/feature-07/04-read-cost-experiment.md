# Feature 07: Bloom filters, indexes và cache

## UC-04: Tối ưu đã tiết kiệm I/O nào, đổi bằng bao nhiêu RAM?

### 1. Bài toán và output

Một query nhanh hơn chưa chứng minh Bloom/index/cache đúng hoặc hiệu quả.
OS page cache có thể làm lượt sau nhanh hơn, dataset nhỏ có thể nằm hết trong
RAM, và cache stale có thể trông rất nhanh vì trả sai dữ liệu.

UC này thiết kế benchmark kiểm tra correctness trước rồi mới so sánh cost.
Output là replay fixture, per-query trace và bảng metrics có denominator,
seed, ReadAt, warmup và cache-state controls.

Đây là thiết kế **chưa triển khai**, chưa có measurements thực tế. Các số
bên dưới là ví dụ tính toán, không phải kết quả performance của project.

### 2. Fixture có câu trả lời biết trước

Một shard, table orders, 10,000 canonical full row keys, flush mỗi 1,000
mutations. Dùng seed=704 để tạo payload và query order.

```text
phase 1: upsert K00000..K09999, logical=1, payload=128 bytes
phase 2: overwrite K00000..K00999, logical=2, payload=192 bytes
phase 3: delete K01000..K01199, logical=3
phase 4: upsert K01200..K01399, logical=4, ExpiresAt=5000
phase 5: repeat point-read trace at ReadAt=4999 and ReadAt=5000
```

Mutation IDs và WriterID được sinh một lần rồi replay nguyên vẹn.
Clock không dựa vào tốc độ chạy máy; cả cấu hình chậm và nhanh đều đọc tại
cùng timestamp. Không random lại mutation history cho từng cấu hình.

Tại ReadAt=5000: 9,600 rows live, 200 rows deleted, 200 rows expired.
Trace còn có missing keys ngoài K00000..K09999 và nhiều tables/partitions để
kiểm tra key encoding. Empty value vẫn là live value, không coi là absent.

### 3. Query mix cho từng câu hỏi

| Trace | Thành phần | Câu hỏi |
| --- | --- | --- |
| misses | 100% keys chưa từng ghi | Bloom skip được bao nhiêu file? |
| uniform-live | random đều live keys | index giảm scan bytes ra sao? |
| hot-set | 90% reads trên 100 keys, 10% trên phần còn lại | cache đáng giá không? |
| deleted-expired | cân bằng delete và expired keys | absent answer có đúng không? |
| interleaved-write | hot reads xen successful writes/deletes | invalidation ảnh hưởng hit rate? |
| bounded-range | intervals có/không có rows | range không bị point Bloom skip? |

Seed quyết định chọn key; workload label không suy ra từ kết quả.
Trace lưu request ID, canonical key/bounds, ReadAt và mutation barrier.
Benchmark correctness cơ bản serialize operations; race test của UC-03
chạy riêng bằng barriers để tránh so expected values theo timing ngẫu nhiên.

### 4. Các configurations cần so sánh

```text
A: baseline scan + merge, Bloom off, index off, row cache off
B: Bloom on, index off, row cache off
C: Bloom on, index on, row cache off
D: Bloom on, index on, row cache on
E: index on, Bloom off, row cache off (để tách riêng tác động index)
```

Tất cả dùng cùng mutation codec, reconciliation, file layout và flush plan.
Trong experiment này compaction không chạy nền; nếu thêm compaction thì
phải dùng fixed barrier schedule và báo riêng, tránh đổi số files ngẫu nhiên.

Mỗi configuration replay vào data directory mới từ cùng logical history.
Không clone mutable caches. Sau load, kiểm tra manifest file counts và
logical content checksum bằng oracle trước khi chạy queries.

### 5. Oracle độc lập với optimization

```go
type ReadEvent struct {
    RequestID string
    Key       CanonicalRowKey
    ReadAt    int64
}

type ExpectedAnswer struct {
    WinnerID string
    Visible  bool
    Value    []byte
}

type ExperimentSpec struct {
    Seed        uint64
    Mutations   []Mutation
    Events      []ReplayEvent
    CacheBudget uint64
    Repetitions uint32
}
```

Oracle giữ mutation history trong memory, group theo canonical full key.
Nó chọn max `(Logical, Delete > Upsert, WriterID, ID)` rồi xét expiry.
Oracle không dùng Bloom, index, cache hoặc outputs của reader tối ưu.

So sánh Visible, exact Value và internal WinnerID khi có instrumentation.
Expired/deleted winner không biến thành missing history. Một mismatch dừng
report performance cho run đó và lưu seed/request/source trace để tái hiện.

### 6. Cold, warm và ba loại cache khác nhau

Row cache, loaded Bloom/index metadata và OS page cache phải được phân biệt.
`row_cache_cold` chỉ nghĩa app cache rỗng; không chứng minh disk cold.

Cold-app phase mở reader mới, clear row cache và metadata cache theo config.
Warm phase chạy một warmup trace cố định, reset counters rồi chạy measured
trace. Report warmup reads và bytes riêng, không cộng vào latency histogram.

Không gọi một run là disk-cold nếu chưa có cách kiểm soát OS cache được
xác nhận trong môi trường test. Khi không kiểm soát được, ghi
`os_cache=uncontrolled`, đổi thứ tự configurations qua các repetitions,
và dùng engine-level data bytes/read calls làm evidence chính.

Không evict OS cache trên máy làm việc chung chỉ để có số đẹp.
Pin CPU/storage settings nếu benchmark harness hỗ trợ, ghi cấu hình thực
tế; environment khác nhau không được so latency như cùng một máy.

### 7. Counter schema và mẫu số

| Metric | Định nghĩa chính xác |
| --- | --- |
| candidate-files/read | tổng SSTables qua bounds, trước Bloom / completed reads |
| opened-data-files/read | distinct data files mở trong mỗi read, cộng lại / completed reads |
| data-read-calls/read | calls đọc data qua reader abstraction / completed reads |
| data-bytes/read | bytes data thực sự request từ abstraction / completed reads |
| Bloom negative rate | negative probes / valid Bloom probes |
| observed false-positive rate | absent-in-file positives / absent-in-file probes |
| row-cache hit rate | hits / cache lookups |
| metadata bytes | resident Bloom + index bytes, tách khỏi row cache |
| row-cache bytes | charged resident entry bytes |
| p95 latency | nearest-rank 95th percentile của successful measured reads |

False-positive denominator cần truth membership per file từ fixture/scan,
không dùng số final absent queries: row có thể có trong một file nhưng bị
delete bởi file khác. Một probe của invalid filter là fallback, không phải
valid probe hoặc false positive.

Counter data bytes không đồng nghĩa physical disk-device bytes vì OS cache.
Khi hệ điều hành cung cấp device metrics, report chúng thành cột riêng.

### 8. Ví dụ tính read amplification

Giả sử 100 completed point reads có 800 candidate file checks, mở 120 files,
request 240 KiB data, và trả tổng 20 KiB live payload:

```text
candidate-files/read = 800 / 100 = 8
opened-data-files/read = 120 / 100 = 1.2
data-bytes/read = 240 KiB / 100 = 2.4 KiB
payload read amplification = 240 KiB / 20 KiB = 12
```

Deleted/missing-only trace có returned live payload=0. Payload amplification
là `N/A (zero live payload)`, không ép thành 0 hoặc infinity.
Vẫn report data-bytes/read và absolute bytes cho trace đó.
Nếu completed reads=0, rates tương ứng là N/A; errors/cancellations có
counters riêng và không âm thầm biến mất khỏi run summary.

### 9. Execution flow và output artifact

```text
generate fixture and event trace once; record content hashes
for repetition in fixed randomized configuration order:
    create fresh storage, replay identical mutations and flush boundaries
    validate baseline answers against independent oracle
    configure features and prescribed warmup state
    reset counters; run measured event trace
    compare every answer with oracle at the recorded ReadAt
    save latency samples, counters, memory and correctness status
aggregate only comparable successful runs; keep raw runs available
```

Suggested report row:
`config, trace, repetition, seed, ReadAt policy, file_count, cache_state,
reads, errors, bytes/read, files/read, hit_rate, metadata_bytes, p50, p95`.
Include engine version/config and fixture hashes, không chỉ screenshot chart.

### 10. Acceptance tests

**A. Determinism:** chạy generator hai lần seed=704; mutation IDs, payloads,
flush boundaries và event trace hashes giống nhau.

**B. Correctness:** A/B/C/D/E trả exact oracle answers cho tất cả traces,
kể cả read đúng expiry boundary và delete che older SSTable value.

**C. Cost trace:** injected counters của ví dụ mục 8 cho 8, 1.2, 2.4 KiB và
12 đúng mẫu số. Zero-payload/zero-read cases trả N/A với reason.

**D. Cache control:** first hot-set run bắt đầu resident entries=0; warm run
báo warmup riêng. Interleaved write sau ACK không hit old generation.

**E. Metadata failure:** corrupt filter/index nhưng data intact, output vẫn
đúng; fallback tăng và I/O có thể tăng. Corrupt data làm run fail correctness.

**F. Latency:** unit fixture samples có known p95; warmup và failed requests
không lọt histogram success, nhưng failure count vẫn xuất hiện.

### 11. Chi phí, dependencies và ngoài phạm vi

Oracle/history và raw samples dùng RAM/disk riêng, không tính vào engine
cache budget nhưng phải ghi benchmark process overhead khi đo RSS.
Không assert p95 luôn giảm: small data, writes nhiều hoặc low locality có
thể khiến optimization chậm hơn.

UC-01/02/03 và Feature 03/04 là dependencies. Phần compaction của Feature 03 dùng lại replay,
oracle và read counters để so policy. Không đưa ra tuning recommendation
production hoặc đánh đồng local benchmark với ScyllaDB cluster throughput.
