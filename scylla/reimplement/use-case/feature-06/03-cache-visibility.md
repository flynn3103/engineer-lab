# Feature 07: Bloom filters, indexes và cache

## UC-03: Đọc từ cache mà không trả lại value đã bị xóa

### 1. Bài toán và output

Một row hot có thể được đọc hàng nghìn lần nhưng không đổi. Cache tránh lặp
lại Bloom/index/merge. Vấn đề khó là một read cũ hoàn tất sau write mới:
nếu nó insert value cũ vào cache, các read sau ACK sẽ thấy dữ liệu sai.

Output là shard-local cache giữ **winner mutation** hoặc verified missing,
kèm generation của snapshot đã dùng. Cache hit vẫn xét expiry tại ReadAt.

Đây là thiết kế **chưa triển khai**. Chọn invalidation toàn shard đơn giản
để chứng minh correctness trước; chưa tối ưu invalidation theo từng row.

### 2. Ví dụ race cần chặn

Ban đầu generation=40; storage và cache chứa order-9 upsert v10.

| Thứ tự | Read R | Write W | Shard generation |
| --- | --- | --- | --- |
| 1 | miss, pin snapshot S40 | | 40 |
| 2 | đọc file cũ, tạm dừng | | 40 |
| 3 | | apply delete v12 | 40 |
| 4 | | increment generation, clear cache | 41 |
| 5 | | ACK delete | 41 |
| 6 | merge S40 ra upsert v10 | | 41 |
| 7 | thử insert với snapshot generation 40 | | 41 |

R có thể trả v10 vì snapshot của nó được pin trước W; đây là read chồng lấn
write theo contract snapshot của lab. Nhưng bước 7 phải bị từ chối.
Read mới bắt đầu sau ACK pin S41, thấy delete v12 và trả absent.

Chỉ clear cache tại bước 4 chưa đủ: R có thể insert lại sau clear.
Điều kiện `snapshotGeneration == currentGeneration` tại insertion mới
đóng race này.

### 3. Model/API đề xuất

```go
type CacheKey struct {
    CanonicalRow CanonicalRowKey
}

type CachedAnswer struct {
    Winner     *Mutation
    Missing    bool
    Generation uint64
    Charge     uint64
}

type ReadSnapshot struct {
    Generation uint64
    Memtables  []PinnedMemtable
    Files      []PinnedFile
}

type RowCache interface {
    Lookup(key CacheKey, generation uint64, readAt int64) (Answer, bool)
    TryInsert(key CacheKey, answer CachedAnswer, snapshotGeneration uint64) bool
    Invalidate(nextGeneration uint64)
}
```

`Winner` là bản copy immutable của mutation thắng, gồm ID, Row, Version,
Kind, Value và ExpiresAt. Delete/expired cũng được giữ đầy đủ.
`Missing=true` chỉ khi complete merge snapshot không tìm thấy mutation;
không dùng nó cho read error, Bloom unavailable hoặc cancellation.
`Charge` tính key bytes, payload bytes và accounting overhead cố định.
`ReadAt` là UTC microseconds, lấy đúng một lần khi request bắt đầu.

Key bao gồm table, partition và clustering identity theo codec Feature 01.
Cache chỉ phục vụ point reads; range result không được cache bằng prefix.

### 4. Ai sở hữu generation?

Shard owner của Feature 05 sở hữu cache, counter và generation.
Lookup, pin snapshot, publication/invalidation và TryInsert được serialize
trên owner hoặc critical section tương đương. Không giữ lock qua disk I/O.

Pin snapshot đồng thời capture generation và immutable memtable/file views.
Nếu memtable mutable, snapshot phải dùng frozen view/copy hoặc visibility
boundary thực sự; chỉ copy một pointer rồi đọc nó không tạo snapshot.

Một successful mutation bao gồm normal write, delete, replay/repair apply
khi shard đang phục vụ requests. Owner tăng generation khi mutation trở
nên read-visible, trước ACK, kể cả incoming version thấp hơn winner.
Conservative invalidation này đơn giản hơn chứng minh write không ảnh hưởng.

Duplicate immutable mutation đã được deduplicate mà không apply state mới
có thể không bump. Nếu ID trùng nhưng nội dung khác thì fail consistency.
Failed write chưa apply không cần bump; uncertain outcome không được ACK
success, và cache phải invalidated nếu state có khả năng đã thay đổi.

### 5. Read algorithm và publication race

```text
owner:
    readAt = clock.NowMicros()
    if cache.Lookup(key, currentGeneration, readAt) hits:
        return visible(cached winner, readAt)
    snapshot = pin data sources and currentGeneration atomically

outside owner:
    candidates = read all relevant sources from snapshot
    winner = max by (Logical, Delete > Upsert, WriterID, ID)
    answer = winner or verified missing

owner:
    if snapshot.Generation == currentGeneration and read succeeded:
        TryInsert(copy(answer), snapshot.Generation)
    return visible(answer, readAt)
finally:
    release all snapshot pins
```

Insertion recheck và insert phải là cùng owner operation. Check trước khi
enqueue insert vẫn cho phép write chen giữa check và insert.
Current generation không wrap: khi counter sắp overflow, stop serving,
clear/reinitialize trong controlled lifecycle; không tái dùng số đang pin.

### 6. Expiry trên mỗi hit

Cache chứa upsert v21 có ExpiresAt=1,000 và một upsert cũ v15 ở SSTable.

```text
readAt=999  -> hit v21 -> live value
readAt=1000 -> hit v21 -> absent
readAt=1001 -> hit v21 -> absent
```

Expiry boundary là `readAt >= ExpiresAt`; không cần write hoặc generation
bump lúc đồng hồ đi qua boundary. Chọn winner trước, xét expiry sau.
Không evict v21 rồi trả v15 từ cache/storage như một fallback.

Lab không đổi expired upsert thành một Delete mutation mới, vì thay Kind
có thể thay tie-break. Metadata gốc, gồm expiry và Value, vẫn immutable.
Clock được inject và theo contract Feature 04; benchmark dùng logical clock.

### 7. Flush, compaction và restart

Flush/compaction không thay logical winner nhưng đổi source snapshot.
Thiết kế đầu tiên tăng generation và clear cache khi **manifest publish
thành công**, cùng shard-owner transaction với source swap.

Một job viết xong temporary outputs nhưng chưa publish không invalidate.
Publish fail giữ snapshot cũ; vẫn có thể clear cache thừa mà không sai,
nhưng counters phải ghi đúng reason.

Restart tạo cache rỗng, chạy recovery xong mới phục vụ reads.
Cache không persist; generation mới chỉ có hiệu lực trong shard process
lifecycle đó, không so với generation của process đã chết.

### 8. Budget, ownership và counters

Mỗi shard có `MaxCacheBytes`, `MaxEntries` và LRU đơn giản.
Cache chỉ sở hữu copies; caller nhận copy/value view bất biến, không được
sửa shared bytes. Entry không giữ file pin sau insert.

Nếu một entry lớn hơn budget, bypass insertion; query vẫn thành công.
Trước insert, evict LRU tới khi đủ chỗ, kiểm tra integer overflow.
Overwrite cùng key trừ charge cũ trước khi cộng mới; clear đưa usage về 0.
Negative/deleted entries vẫn tính key, metadata và overhead.

| Counter | Khi tăng |
| --- | --- |
| lookup/hit/miss | mỗi lookup, đúng một hit hoặc miss |
| expired-hit | hit có winner upsert expired tại ReadAt |
| generation-reject | insert từ snapshot generation cũ |
| eviction/oversize-bypass | loại LRU hoặc không nhận entry quá lớn |
| invalidation-by-reason | mutation, flush, compaction, lifecycle |
| resident-bytes/entries | gauge sau mỗi mutation của cache |

Expired-hit là một hit hợp lệ trả absent, không cộng thêm miss.
Verified-missing hit cũng là hit; report tách live/absent hits để giải thích.

### 9. Failures và invariants

Cache miss, budget thiếu hoặc eviction không làm query fail.
Storage corruption/I/O error không tạo negative cache entry.
Cancel giữa scan không insert partial winner vì chưa đọc đủ sources.

Invariants: mọi hit cùng generation hiện tại; cached winner xuất phát từ
complete merge; mỗi hit áp dụng ReadAt; successful mutation invalidate trước
ACK; cache memory không vượt budget; insert không mang theo reader pins.

### 10. Acceptance tests

**A. Race sau ACK:** dùng barriers tái hiện timeline mục 2. R trả v10 theo
S40, TryInsert trả false, generation-reject tăng 1. Read sau W ACK absent.

**B. TTL:** cache v21 trước expiry. Tại 999 trả live, tại 1000 và 1001 absent
không đọc storage và không lấy v15. Kiểm tra ID/Kind/ExpiresAt vẫn nguyên.

**C. Table identity:** hai tables có cùng partition/clustering chứa values
khác nhau; warm cache từng key không cross-hit.

**D. Publish:** giữ một miss đang chạy, publish compaction rồi release read.
Old-snapshot insertion bị reject; new read bằng merge reader không cache.

**E. Read error:** inject failure ở SSTable cuối trong nhiều sources. Không
cache winner tạm từ sources đã đọc; lần đọc sau retry đủ toàn bộ sources.

**F. Budget:** budget cho hai entries; đọc ba keys evict đúng LRU, usage
không âm/overflow. Oversized value bypass nhưng vẫn trả đủ value.

**G. Ownership:** sửa byte slice nhận được từ caller không thay cached value.
Sau evict/clear không còn file pins hoặc memory charge bị giữ lại.

### 11. Chi phí, dependencies và ngoài phạm vi

Hit tránh disk/merge nhưng vẫn copy payload, LRU update và kiểm tra expiry.
Invalidate toàn shard O(entries) có thể làm hit rate thấp khi writes nhiều;
UC-04 phải đo điều đó, không giả định cache luôn thắng.
Feature 03 snapshot correctness, Feature 04 clock và Feature 05 owner là
prerequisites. Không có global cache, distributed invalidation hoặc MVCC
time-travel cache; per-key generations là cải tiến sau khi contract này đúng.
