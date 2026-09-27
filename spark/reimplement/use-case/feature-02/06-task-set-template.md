# Feature 02: RDD dependencies và DAGScheduler planning

## UC-06: Mỗi stage cần chạy những partition nào?

### 1. Mục đích và output của UC-06

Sau khi scheduler có `ResultStage` và `ShuffleMapStage`, nó biết topology của
job. Nhưng future runtime còn cần biết mỗi stage có bao nhiêu đơn vị công việc.

UC-06 tạo `TaskSetTemplate`: danh sách partition IDs mà stage sẽ cần chạy.

Nó trả lời câu hỏi:

> Nếu stage này đã sẵn sàng, runtime sẽ phải tạo task cho những partition nào?

Ví dụ stage có 3 partitions:

```text
TaskSetTemplate
  StageID:      4
  Partitions:   [0, 1, 2]
```

**Output:** mỗi stage trong `JobPlan` có một `TaskSetTemplate` immutable:

```text
StageID:        stage mà template thuộc về
PartitionIDs:   [0, 1, ..., N-1]
ParentStageIDs: stages cần complete trước khi stage runnable
```

Output này nói runtime **sẽ cần** task nào, không nói task nào đang chạy hoặc
đã thành công.

Đây chưa phải ba task đang chạy. Nó không có TaskID, attempt, worker, thời
điểm chạy hay row input. Feature 03 mới biến template thành local task
specifications.

### 2. Template giữ những gì?

```go
type TaskSetTemplate struct {
    StageID        StageID
    PartitionIDs   []int
    ParentStageIDs []StageID
}
```

| Field | Ý nghĩa |
| --- | --- |
| `StageID` | stage mà template thuộc về |
| `PartitionIDs` | tất cả partition IDs từ `0` tới `N-1` của stage |
| `ParentStageIDs` | stages phải complete trước khi stage có thể runnable |

`ParentStageIDs` là snapshot tiện cho runtime; nó phải bằng parent relation của
stage, không tạo một dependency graph thứ hai khác với stage graph.

### 3. Partition count lấy từ đâu?

| Stage | Partition count dùng cho template |
| --- | --- |
| `ResultStage` | partition count của `FinalRDD` |
| `ShuffleMapStage` | partition count của `MapSideRDD` |

Ví dụ:

```text
keyBy có 3 partitions
ReduceByKey(..., 2) có 2 partitions
filter sau ReduceByKey có 2 partitions

ShuffleMapStage(keyBy) template: [0, 1, 2]
ResultStage(filter) template:    [0, 1]
```

Map side chạy theo map-side RDD partition count. Reduce/result side chạy theo
output partition count. Hai con số này có thể khác nhau; UC-06 không ép chúng
phải bằng nhau.

### 4. Khi nào một template runnable?

Template chỉ mô tả work. Runtime sau này xét parent relation:

```text
stage is runnable khi mọi ParentStageIDs đã complete successfully
```

Do đó stage không có parent stage là runnable đầu tiên:

```text
ShuffleMapStage A, parents=[]
    -> runnable ngay khi job được admitted

ResultStage, parents=[A]
    -> chỉ runnable sau khi A complete
```

UC-06 không lưu trạng thái `running`, `completed` hoặc `failed`. Những trạng
thái đó thuộc coordinator/runtime. Nó cũng không tự launch task khi một parent
được đánh dấu complete.

### 5. Empty partition set

RDD hợp lệ có thể có zero partitions, ví dụ Union của hai empty RDDs. Khi đó
stage vẫn có template:

```text
TaskSetTemplate
  StageID:    4
  Partitions: []
```

Empty template không phải error và không sinh “partition 0”. Future action
runtime quyết định cách hoàn thành action trên input rỗng; với `Count`, kết quả
có thể là zero. UC-06 chỉ giữ metadata chính xác là không có partition task
nào.

### 6. `JobPlan` chứa templates như thế nào?

Mỗi stage trong plan có đúng một template snapshot:

```text
JobPlan
  ShuffleMapStage 0
    template partitions: [0, 1, 2]
  ResultStage 1
    parent stages: [0]
    template partitions: [0, 1]
```

Templates và stages được output theo dependency order: parent stages trước,
result stage sau. Partition IDs luôn tăng dần. Điều này giúp tests và explain
output ổn định mà không dựa vào traversal stack order.

### 7. Snapshot và validation

| Rule | Lý do |
| --- | --- |
| Template có đúng một `StageID` đang tồn tại trong plan. | Không tạo work cho stage lạ. |
| `PartitionIDs` là `[0, 1, ..., N-1]`, không duplicate hay gap. | Mỗi stage partition có đúng một template entry. |
| `ParentStageIDs` unique và bằng parent relation của stage. | Readiness không mâu thuẫn stage graph. |
| Parent stage phải có trong cùng `JobPlan`. | Plan self-contained. |
| Caller chỉ nhận copy. | Sửa slice output không đổi scheduler state. |

Invalid stage metadata, dangling parent stage hoặc partition count âm là
planning error. Scheduler trả error trước task creation, source I/O hoặc user
closure invocation.

### 8. Tests chính

- Narrow-only ResultStage có template `[0..FinalRDD.Partitions-1]` và không có
  parent stage.
- ShuffleMapStage template dùng map-side RDD partition count, không dùng
  `HashPartitioner` output count.
- ResultStage sau `ReduceByKey(..., 2)` có template `[0, 1]`, dù map side có
  partition count khác.
- Templates giữ đúng parent stage IDs và được output theo dependency order.
- Empty RDD tạo template `[]`, không tạo phantom partition 0.
- Duplicate/gap partition ID, dangling parent stage hoặc caller mutation bị
  reject/không làm đổi internal plan.
- Lập template không đọc source, không tạo TaskID và không gọi closure.

### 9. Ngoài phạm vi

- tạo actual task, TaskID, task attempt, worker assignment hoặc task queue;
- stage completion/readiness state, retry, cancellation hoặc failure handling;
- source I/O, narrow execution, shuffle write/read và reducer execution;
- `JobID`/`StageID`/`StageAttemptID` lifecycle; UC-07;
- render plan/task template cho user; UC-08.
