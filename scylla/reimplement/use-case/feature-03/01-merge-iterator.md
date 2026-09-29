# Feature 03 — Phụ lục A: Merge iterator cho một partition

> Nội dung nền cho người triển khai lab, không phải UC-01 của bộ vận hành mới.
> Đường đọc chính bắt đầu ở [Feature 03](../../feature/03-read-merge-and-basic-compaction.md).

> **Trạng thái: Thiết kế chi tiết; chưa triển khai.** API Go bên dưới là đề
> xuất. Bảng test mô tả kết quả phải có khi implement, chưa phải test đã chạy.

## 1. Vấn đề cần giải quyết

Một range của partition có thể nằm trong active memtable, frozen memtables
và nhiều SSTables. Nếu nối output của các nguồn, caller nhận duplicate và sai
thứ tự; nếu sort cả partition sau khi đọc hết, RAM tăng theo partition width.

Ta cần stream các row theo comparator của schema, gom mọi phiên bản của một
row trước khi emit và dùng limit trên **row hiển thị**, không trên mutation.
Việc này phải đúng khi flush hoặc compaction xảy ra đồng thời với read.

## 2. Input và output cụ thể

Ví dụ dùng schema riêng `events_by_device`, partition `device_id text`,
clustering `event_id int64 ASC`. Tất cả records sau thuộc device `D7`.

```text
S1: (10, v1, old-A), (20, v2, B), (40, v4, D)
S2: (10, v8, new-A), (30, v3, C)
M : (20, v9, new-B), (50, v5, E)

request: partition=D7, range=[10,50), direction=forward, limit=3
ReadTime=1_000_000 UTC micros
output: (10,new-A), (20,new-B), (30,C)
```

Ở event 10, heap có hai candidates. Reader phải consume cả S1 và S2 cho
event 10 trước khi chọn v8. Ở event 20, memtable thắng S1. Event 40 chưa cần
emit vì đã đủ ba row; event 50 bị loại bởi upper bound exclusive.

Nếu event 20 là Delete v9, output phải thành `10,30,40`: delete không chiếm
một slot limit. Nếu range rỗng hợp lệ, output rỗng và không mở data block.

## 3. Snapshot cục bộ cần chụp những gì?

Chỉ lấy danh sách pointers đến active memtable là chưa đủ: write sau đó có
thể thay nội dung iterator đang xem. Owner phải chụp immutable view của active
memtable, danh sách frozen memtables và manifest generation dưới cùng một
publication boundary. Có thể dùng persistent tree hoặc copy-on-write view;
baseline không bắt buộc đóng băng cả active memtable mỗi request.

```text
snapshot S:
  immutable memtable view at owner sequence 81
  frozen view F7
  manifest generation 12 -> files [A,B]
  ReadTime=1_000_000
```

Flush F7 publish thành C đúng lúc này có hai trạng thái hợp lệ: S thấy F7 và
manifest 12; snapshot sau thấy C trong manifest 13. Không được thấy khoảng
trống không có F7 lẫn C. Duplicate cùng ID nếu có phải deduplicate, nhưng
không dùng dedup để che một handoff có thể bỏ sót dữ liệu.

## 4. API đề xuất

```go
type ReadSnapshot struct {
    OwnerID       string
    VisibleSeq    uint64
    ManifestGen   uint64
    ReadTime      int64
    Sources       []PinnedSource
}
type MergeReadSpec struct {
    Table         TableID
    Partition     CanonicalPartitionKey
    Bounds        ClusteringBounds
    Direction     ReadDirection
    Limit         int
}
type MergedRow struct {
    Row           RowIdentity
    Winner        Mutation
}
type MutationIterator interface {
    Next(context.Context) (Mutation, bool, error)
    Close() error
}
func AcquireReadSnapshot(context.Context, MergeReadSpec) (*ReadSnapshot, error)
func MergeRead(context.Context, *ReadSnapshot, MergeReadSpec,
    func(MergedRow) error) error
func ReleaseReadSnapshot(*ReadSnapshot) error
```

| Field | Ý nghĩa và ownership |
| --- | --- |
| `OwnerID` | Owner của read, không phải danh sách replica. |
| `VisibleSeq` | Ranh giới local apply đã được snapshot chứa; không phải version winner. |
| `ManifestGen` | Generation file list được pin đến release. |
| `ReadTime` | Clock đọc một lần khi request bắt đầu; tất cả TTL dùng cùng số này. |
| `Sources` | Handles đã pin, chứa views bất biến và file metadata. |
| `Bounds` | Bound theo comparator clustering của Feature 01, giữ inclusive/exclusive. |
| `Direction` | Forward/reverse theo schema order, không đảo version order. |
| `Limit` | Số row còn hiển thị tối đa, bắt buộc dương. |
| `Winner` | Bản copy hoặc immutable handle còn valid trong callback. |

Caller muốn giữ payload sau callback phải copy. Reader sở hữu việc đóng
iterators; người gọi sở hữu snapshot release bằng defer ngay sau acquire.

## 5. Thuật toán heap merge

Mỗi nguồn seek tới bound đầu theo direction. Heap chứa tối đa một head trên
mỗi nguồn, xếp theo full row identity rồi tie theo source ID để debug ổn định.
Thứ tự tie source không tham gia chọn version winner.

```text
mergeRead(snapshot, spec, emit):
    validate spec belongs to snapshot owner/table/partition
    open bounded iterator for each pinned source
    defer close every opened iterator
    prime heap with one head per nonempty iterator
    emitted = 0

    while heap not empty and emitted < spec.Limit:
        check cancellation
        row = heap.smallestRowInRequestedDirection()
        winner = none
        while heap has head for row:
            candidate = heap.pop()
            winner = reconcile(winner, candidate.mutation)
            advance candidate.iterator and push its next head
        if visible(winner, snapshot.ReadTime):
            emit(copyOrBorrowImmutable(row, winner))
            emitted++
```

Một source có nhiều versions liên tiếp cùng row phải được advance lặp đến
khi đổi row; chỉ pop một candidate mỗi source rồi emit sẽ bỏ sót winner trong
chính source đó. Checksum hoặc decoding error khi advance phải fail read.

## 6. Point read, reverse và boundary

Point read dùng range chứa chính xác full clustering key và limit 1. Nó vẫn
phải xét mọi nguồn có thể chứa row, kể cả khi một nguồn đã có candidate.
Feature 07 mới cung cấp skip từ Bloom/index; skip chỉ là tối ưu có bằng chứng.

Reverse đảo comparator giữa các row; nó không khiến version nhỏ hơn thắng.
Với range `[10,50)`, reverse limit 2 trả `40,30`. Với schema có component
DESC, forward là thứ tự schema, không mặc định số tăng hoặc thời gian tăng.

Bound kiểm tra trước visibility. Row của partition khác không bao giờ được
gom vào nhóm, ngay cả khi clustering bytes giống nhau. Không decode rồi so
raw canonical bytes khi schema comparator có quy tắc ASC/DESC riêng.

## 7. Handoff khi compaction chạy đồng thời

Giả sử reader R pin manifest 12, compactor publish manifest 13 thay A+B bằng C.
R tiếp tục đọc A+B. Reader R2 bắt đầu sau publish đọc C. Garbage collector chỉ
unlink A/B khi không còn manifest hiện hành tham chiếu và pin count bằng 0.

Snapshot không được tự chuyển nguồn giữa chừng sang C. Làm vậy có thể emit
row từ A rồi emit lại row đó từ C, hoặc bỏ qua phần range chưa đọc của B.
Release được gọi đúng một lần về logic; implementation nên cho release lặp
an toàn để error cleanup không làm refcount âm.

## 8. Lỗi và recovery

| Tình huống | Kết quả và xử lý |
| --- | --- |
| Thiếu partition, limit 0, bound sai kiểu | Invalid request trước acquire/open file. |
| Acquire thất bại giữa lúc pin | Hoàn tác tất cả pin đã lấy, không trả snapshot nửa chừng. |
| SSTable mất/checksum lỗi | Read error có generation/source/offset; không coi là source rỗng. |
| Conflicting ID | Fail read; giữ lỗi từ Phụ lục B, không emit candidate tranh chấp. |
| Callback error | Dừng ngay, close iterators và release theo ownership. |
| Cancel giữa heap loop | Dừng tại check tiếp theo, trả context error. |
| Flush/compact publish | Không phải read error; tiếp tục snapshot đã pin. |

API callback có thể đã emit prefix trước một lỗi I/O muộn. Caller phải coi
error là read không hoàn thành; không dùng prefix như một trang đầy đủ.
Retry là request mới với snapshot và ReadTime mới, không hứa nối tiếp prefix.

## 9. Điều kiện luôn đúng

Mỗi emitted row xuất hiện đúng một lần, bởi nhóm row đã được consume hết
trước emit. Không candidate cùng row trong một source bị bỏ lại sau head.

Các rows emit tăng hoặc giảm theo comparator request. `Limit` chỉ đếm winner
đang hiển thị, vì số phiên bản cũ không phải số row mà ứng dụng nhìn thấy.

Tất cả candidate của read thuộc một snapshot local đã pin. Mutation đến sau
snapshot không thể đột ngột đổi row chưa đọc của cùng request.

Winner và TTL dùng chung reconciliation với compaction. Files được unlink
chỉ sau release; mọi error path đều trả handles đã acquire về trạng thái sạch.

## 10. Test vectors và expected output

| Fixture/thao tác | Expected chính xác |
| --- | --- |
| Fixture mục 2, forward `[10,50)`, limit 3 | `(10,new-A),(20,new-B),(30,C)`. |
| Fixture mục 2, reverse, limit 2 | `(40,D),(30,C)`. |
| Đổi M/event20 thành Delete v9 | Forward limit 3 trả `10,30,40`. |
| Cùng row có v1,v8,v12 trong S1; S2 có v9 | Chỉ emit v12. |
| Point event10 | Một row `new-A`, không `old-A`. |
| Point event999 | Zero callbacks, nil error. |
| Snapshot seq81 rồi write seq82 event15 | Read cũ không có event15; read mới có event15. |
| Pin gen12, publish gen13 giữa read | R dùng A+B đến hết; R2 dùng C; cùng rows nếu ReadTime bằng nhau. |
| Corrupt block chứa winner event20 | Non-nil corruption error; không fallback về B. |
| Cancel sau callback đầu | Một callback, context error, mọi source closed. |
| Callback trả sentinel ở row30 | Sentinel được bảo toàn; không callback row40. |

Thêm phép thử hoán vị source order và flush boundaries: cùng tập mutation,
cùng range và ReadTime phải cho cùng rows. Instrument open/close/pin/unpin để
assert counts cân bằng cả khi lỗi xảy ra trước lần heap push đầu tiên.

## 11. Chi phí, phụ thuộc và ngoài phạm vi

Với K nguồn và N candidates đã đọc, heap merge tốn `O(N log K)` comparator,
heap `O(K)`, cộng buffers decoder và metadata conflict-ID của Phụ lục B.
Không thể hứa `O(limit)` I/O: một row winner có thể bị ẩn và có nhiều versions.
Snapshot memtable copy-on-write cũng có memory cost khi writes kéo dài.

Phụ thuộc Feature 01 comparator/bounds, Feature 02 pinned immutable views và
manifest, [Phụ lục B](02-version-reconciliation.md) winner, Feature 04 visibility.
UC này không tự flush, không tự compact, không cursor paging qua nhiều request,
không global scan, không snapshot xuyên owner hoặc consistency quorum.
