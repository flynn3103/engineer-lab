# Feature 03 — Phụ lục B: Chọn winner không phụ thuộc arrival order

> Nội dung nền cho lab, không phải UC-02 về strategy của bộ vận hành mới.
> Đường đọc chính bắt đầu ở [Feature 03](../../feature/03-read-merge-and-basic-compaction.md).

> **Trạng thái: Thiết kế chi tiết; chưa triển khai.** Kiểu và test dưới đây
> là hợp đồng đề xuất cho read, memtable và compaction cùng sử dụng.

## 1. Vấn đề cần giải quyết

Hai mutation cho cùng row có thể đến owner ngược thứ tự, được replay nhiều
lần hoặc rơi vào SSTables khác nhau. Nếu chọn cái đọc sau, kết quả phụ thuộc
thứ tự file. Nếu chỉ so logical version, hai writer cùng logical value tạo
kết quả mơ hồ. Delete còn cần một vị trí rõ ràng trong tie-break.

Mục tiêu là một phép chọn winner xác định, dùng ở mọi đường của engine.
Version không đo thời gian thực và không xác định write đã durable hay chưa;
nó chỉ phục vụ thứ tự giải quyết xung đột trên cùng row.

## 2. Ví dụ đầy đủ

Các mutation sau cùng row `orders/C123/O-900`:

| ID | Logical | Kind | WriterID | Value |
| --- | --- | --- | --- | --- |
| m1 | 8 | Upsert | z | pending |
| m2 | 9 | Upsert | a | paid |
| m3 | 9 | Upsert | b | shipped |
| m4 | 9 | Delete | a | empty |
| m5 | 10 | Upsert | a | reopened |

```text
reconcile(m1,m2)       => m2 (logical 9 > 8)
reconcile(m2,m3)       => m3 (writer b > a)
reconcile(m3,m4)       => m4 (Delete > Upsert trước khi xét writer)
reconcile(m1..m5)      => m5 (logical 10 > 9)
reconcile(m4,m4)       => m4 (retry không sinh row mới)
```

Nếu bỏ m5, row bị ẩn bởi m4. Delete không thắng mọi write tương lai: write
logical 10 là cập nhật mới có chủ ý, nên có thể làm row xuất hiện trở lại.

## 3. Mutation chuẩn và API

```go
type Version struct {
    Logical  uint64
    WriterID string
}
type Mutation struct {
    ID        string
    Row       RowIdentity
    Version   Version
    Kind      MutationKind
    Value     []byte
    ExpiresAt *int64
}
type ReconcileResult struct {
    Winner     Mutation
    Duplicates uint64
    Superseded uint64
}
func CompareMutationOrder(left, right Mutation) (int, error)
func ReconcileRow(candidates []Mutation) (ReconcileResult, error)
func WinnerVisible(winner Mutation, readTime int64) bool
```

| Field | Ý nghĩa |
| --- | --- |
| `ID` | Định danh mutation immutable, retry phải dùng lại cùng ID và nội dung. |
| `Row` | Table, partition và clustering identity chuẩn từ Feature 01. |
| `Logical` | Số thứ tự logic của caller/clock logic; không là epoch micros. |
| `WriterID` | Định danh writer ổn định, không rỗng; so theo bytes. |
| `Kind` | Chỉ Upsert hoặc Delete ở baseline row-level. |
| `Value` | Full-row opaque payload; Delete yêu cầu empty. |
| `ExpiresAt` | Optional UTC micros cho Upsert; nil là không hết TTL. |
| `Duplicates` | Số bản lặp exact ID+content ngoài bản đầu trong nhóm. |
| `Superseded` | Số mutation IDs khác nhau thua winner. |

Slice trong API minh hoạ dễ đọc; implementation stream có thể reduce nhóm
incrementally. Phát hiện conflicting ID khi các bản được đối chiếu với nhau;
không giả định Feature 02 có một global identity ledger lưu mọi ID mãi mãi.
Nhóm read phải phát hiện ID conflict nó gặp, không giữ toàn database trong RAM.

## 4. Tuple ordering duy nhất

```text
order(m) = (
    m.Version.Logical,
    kindRank(m.Kind),        // Upsert=0, Delete=1
    bytes(m.Version.WriterID),
    bytes(m.ID)
)
winner = max(order(m))
```

Đặt kind trước WriterID có hệ quả rõ: Upsert writer `z` và Delete writer `a`
cùng logical 9 thì Delete thắng. Chuyển kind xuống sau writer sẽ đổi contract,
vì vậy test phải có chính ví dụ này thay vì chỉ test hai writer giống nhau.

ID là tie-break cuối cho hai mutation khác nhau cùng logical/kind/writer.
Payload không tham gia so sánh; không chọn value lớn hơn theo bytes.
Các chuỗi so bytewise, không locale, không Unicode case folding.

## 5. ID collision khác version conflict

Version conflict hợp lệ nghĩa là hai IDs khác nhau cạnh tranh trên một row.
ID collision nghĩa là một ID tuyên bố hai nội dung khác nhau và phải lỗi.

```text
ID=m9, logical=20, value=paid
ID=m9, logical=20, value=cancelled
=> ErrConflictingMutationID, không chọn một payload
```

Content equality bao gồm Row, Logical, WriterID, Kind, exact Value bytes và
presence/value của ExpiresAt. Thay TTL trong retry cũng là đổi nội dung.
Encoding so sánh phải canonical; không dùng string dump của Go struct.

Không được bỏ một candidate cũ trước khi kiểm tra ID conflict chỉ vì version
của nó đã thua. Hai m9 có thể thua m10 nhưng vẫn cho biết dữ liệu không hợp lệ.
Caller có trách nhiệm không reuse ID cho nội dung khác. Local row reducer
không thể chứng minh uniqueness ở row hoặc lịch sử nó chưa từng đọc; đây
không phải cam kết global deduplication vô thời hạn.

## 6. Pseudocode reconciliation

```text
reconcileRow(candidates):
    require candidates is nonempty
    expectedRow = candidates.first.Row
    seen = map mutation ID -> canonical immutable content
    winner = none
    duplicates = 0

    for m in candidates:
        validate m and require m.Row == expectedRow
        if seen contains m.ID:
            require seen[m.ID] == content(m), else conflicting-ID error
            duplicates++
            continue
        seen[m.ID] = content(m)
        if winner is none or order(m) > order(winner):
            winner = m

    return immutable(winner), duplicates, len(seen)-1
```

`CompareMutationOrder` yêu cầu cùng row, nhưng row grouping vẫn có nhiệm vụ
validate. Với dữ liệu hợp lệ, streaming max tương đương max của cả slice.
Với dữ liệu không hợp lệ, thuật toán không trả “winner tạm thời thành công”.

## 7. TTL chỉ được xét sau winner

```text
old: ID=o, logical=1, value=old, ExpiresAt=nil
new: ID=n, logical=2, value=new, ExpiresAt=100

ReadTime=99:  winner=new, visible=true
ReadTime=100: winner=new, visible=false
ReadTime=101: winner=new, visible=false
```

Nếu bỏ expired candidate trước reconcile thì logical 1 thắng và old sống
lại. Vì vậy output của reconciliation giữ nguyên expired winner đầy đủ ID,
version, payload và expiry. Visibility không tạo một Delete có version mới.

```text
visible(m, readTime):
    if m.Kind == Delete: return false
    if m.ExpiresAt != nil and readTime >= *m.ExpiresAt: return false
    return true
```

`ReadTime` không phải bộ lọc version lịch sử. Nó chỉ quyết định TTL của winner
trên snapshot đã được chụp. Caller không thể dùng nó để hỏi row ở logical 1.

## 8. Áp dụng ở write, read và compaction

Memtable apply có thể giữ winner mỗi row và kiểm tra ID trong phạm vi các
mutation đang được đối chiếu theo contract Feature 02.
Read hợp nhất winner từ memtable với candidates trong files. Compaction lấy
max trên input files, giữ đầy đủ marker và không áp ReadTime để xoá output.

Với dữ liệu hợp lệ, `max(max(A),max(B)) = max(A∪B)`. Tính chất này cho phép
compaction chỉ xử lý một nhóm file mà vẫn đúng khi merge với file ngoài nhóm.
Các candidate đang hiện diện phải được kiểm tra trước khi loser bị bỏ. Phép
max không bảo toàn bằng chứng conflicting ID đã bị discard trong lịch sử;
không hứa phát hiện xung đột không còn bằng chứng để đối chiếu.

WAL sequence chỉ xác định thứ tự durable record của owner. Seq mới hơn không
đảm bảo Logical mới hơn; replay không được dùng sequence thay version tuple.

## 9. Lỗi và recovery

| Lỗi | Hành vi yêu cầu |
| --- | --- |
| Unknown Kind, ID/WriterID rỗng | Validation error trước append hoặc lỗi corruption khi decode. |
| Delete có TTL/payload | Reject malformed mutation. |
| Nhóm chứa hai RowIdentity | ErrMixedRowGroup; không chọn max xuyên row. |
| Cùng ID khác content | ErrConflictingMutationID; dừng read/compaction có context nguồn. |
| Expiry overflow ở tầng build | Reject trước tạo mutation; reducer không tự wrap số. |

Retry lỗi I/O dùng cùng ID và content. Sau outcome unknown, không sửa version
để “thắng cho chắc”; làm vậy biến retry thành một nghiệp vụ write mới.
Corruption cần recovery/repair nguồn đúng quy trình Feature 02, không thể chữa
bằng đổi comparator hoặc bỏ record lỗi.

## 10. Điều kiện luôn đúng

Với mutation hợp lệ, winner độc lập arrival, file order, flush order và cách
chia nhóm compaction. Mọi code path gọi cùng luật hoặc test equivalence.

Reconcile cùng mutation nhiều lần không đổi winner. Tính lặp này giữ retry
và replay không sinh kết quả mới, nhưng không hứa request được execute once.

Delete cùng logical thắng Upsert bất kể WriterID. Logical lớn hơn vẫn thắng
Delete cũ. TTL không làm mutation tự có logical version lớn hơn.

## 11. Tests với expected cụ thể

| Input | Expected |
| --- | --- |
| m1..m5 mục 2, mọi hoán vị | Winner m5, duplicates=0, superseded=4. |
| m3,m4 | m4 dù writer a nhỏ hơn b. |
| Same logical/kind/writer, IDs a và b | ID b. |
| m4,m4,m4 exact | m4, duplicates=2, superseded=0. |
| Same ID, chỉ khác ExpiresAt nil/100 | ErrConflictingMutationID. |
| Hai m9 conflicting cùng thua m10 | Error, không success m10. |
| old/new mục 7, ReadTime=100 | Winner n, visible=false, không old. |
| max(A∪B) so với max(max(A),max(B)) | Cùng ID winner với mọi tập hợp lệ. |
| Seq90 logical3, seq91 logical2 | Logical3 thắng. |
| Same logical Upsert writer `Z`/`a` | Writer `a` thắng theo bytes ASCII. |

## 12. Chi phí, phụ thuộc và ngoài phạm vi

So tuple có chi phí so logical rồi tối đa độ dài WriterID/ID. Reduce N
candidates tốn O(N) comparisons; exact conflict checking trong nhóm cần
O(U) metadata cho U IDs đang xét. Nếu vượt budget phải fail rõ hoặc dùng
external validation; không giả định bộ nhớ luôn hữu hạn mà vẫn giữ mọi ID.

Phụ thuộc canonical row identity Feature 01 và immutable mutation Feature 02.
[Phụ lục A](01-merge-iterator.md) lo traversal;
[UC-06](06-safe-maintenance-and-validation.md) lo durable publish của lab;
Feature 04 lo delete/TTL. Không có column-level reconciliation,
wall-clock last-write-wins, vector clock, causal consistency hay transaction.
