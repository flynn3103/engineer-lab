# Feature 02: RDD dependencies và DAGScheduler planning

## UC-07: ID nào đại diện cho job, stage và lần chạy stage?

### 1. Mục đích và output của UC-07

RDD ID, JobID và StageID không cùng nghĩa.

```text
RDD ID   -> node trong lineage
JobID   -> một lần caller submit action
StageID -> một stage object do scheduler tạo
```

UC-07 định nghĩa khi scheduler cấp các ID này, để caller và future runtime
không dùng nhầm RDD ID hoặc content hash làm job/stage identity.

Nó cũng định nghĩa `StageAttemptID`: số thứ tự của lần runtime thử chạy một
stage. Feature 02 chỉ mô tả nó; không tạo attempt vì Feature 02 chưa chạy stage.

**Output:** một lifecycle contract không mơ hồ:

- mỗi `PlanJob` reserve một `JobID` mới;
- mỗi ResultStage/ShuffleMapStage mới nhận một `StageID` mới; stage reuse giữ ID;
- future runtime dùng cặp `(StageID, StageAttemptID)` cho mỗi lần chạy stage;
- `TaskID` không được suy ra từ các ID planning này.

Output là quy tắc cấp ID và snapshot IDs trong `JobPlan`, không phải task attempt
hay execution state.

### 2. Ba loại ID

```go
type JobID uint64
type StageID uint64
type StageAttemptID uint32
```

| ID | Scope | Cấp khi nào? | Ví dụ |
| --- | --- | --- | --- |
| `RDDID` | `Context` lineage | tạo RDD | `filter` luôn là RDD 9 |
| `JobID` | một `PlanJob` submission | scheduler bắt đầu plan action | hai lần `Count` có JobID khác |
| `StageID` | scheduler stage registry | tạo ResultStage hoặc ShuffleMapStage mới | producer stage 3, result stage 4 |
| `StageAttemptID` | một `StageID` | runtime bắt đầu/retry stage | attempt 0, retry attempt 1 |

`StageAttemptID` chỉ có nghĩa khi ghép với `StageID`. Attempt 0 của stage 3 và
attempt 0 của stage 4 là hai attempt khác nhau.

### 3. JobID lifecycle

Mỗi call bắt đầu `PlanJob(finalRDD, action)` reserve đúng một JobID mới từ
scheduler counter. Counter bắt đầu tại 0 và chỉ tăng; nó không dùng final RDD
ID, action value, content hash hay topology hash.

```text
PlanJob(filter, Count)   -> JobID 0
PlanJob(filter, Count)   -> JobID 1
PlanJob(other, Collect)  -> JobID 2
```

Hai plan có thể có topology giống hệt nhưng vẫn là hai action submissions khác
nhau. Nếu planning fail sau khi ID đã được reserve, ID đó vẫn bị consume; gap
trong sequence hợp lệ và tránh reuse ID đã xuất hiện trong log/error.

### 4. StageID lifecycle

Scheduler có một `nextStageID` counter riêng, cũng bắt đầu tại 0.

- Mỗi `ResultStage` mới nhận một StageID mới. Hai JobPlan submissions luôn có
  result stage IDs khác nhau.
- Một `ShuffleMapStage` mới nhận một StageID mới khi UC-05 publish nó vào
  shuffle-stage registry.
- Khi registry reuse cùng `ShuffleMapStage`, scheduler giữ nguyên StageID cũ.
- Parent producer stages được tạo trước child producer stage; result stage được
  tạo sau khi parent stages đã resolve.

Ví dụ hai lần submit cùng lineage có một shuffle:

```text
Job 0: ShuffleMapStage 0 -> ResultStage 1
Job 1: reuse ShuffleMapStage 0 -> ResultStage 2
```

JobID và StageID là hai counter độc lập. Không suy ra JobID từ StageID hay
ngược lại.

### 5. StageAttemptID thuộc future runtime

Khi runtime sau này chạy stage lần đầu, nó dùng:

```text
(StageID, StageAttemptID=0)
```

Nếu retry stage đó, runtime tạo attempt tiếp theo:

```text
(StageID, StageAttemptID=1)
```

Feature 02 không cấp `StageAttemptID`, không retry và không quyết định retry
policy. Feature 05 sẽ định nghĩa retry execution. UC-07 chỉ chốt rằng attempt
number tăng theo **một stage**, không phải global counter chung cho mọi stage.

`TaskID` và task attempt ID còn sâu hơn: chúng thuộc actual task execution,
không phải stage planning. Không được lấy `TaskID` từ `StageID * partitions +
partitionID`, vì retry/speculation có thể tạo nhiều task attempts cho cùng
partition.

### 6. Atomicity và snapshot

Counter allocation và shuffle-stage registry phải nằm trong cùng scheduler lock
hoặc cơ chế atomic tương đương.

```text
lock scheduler
  reserve JobID / StageID
  inspect or update stage registry
unlock scheduler
```

Điều này bảo đảm hai concurrent submissions không nhận cùng ID hay publish hai
producer stages cho cùng shuffle identity.

`JobPlan` chỉ trả value snapshot. Caller không thể sửa StageID trong snapshot
để đổi counter hoặc registry của scheduler.

### 7. Validation và error contract

| Tình huống | Kết quả |
| --- | --- |
| counter overflow | trả scheduler error, không wrap về 0 |
| stage registry có same shuffle key nhưng stage metadata khác | reject corrupted registry |
| caller dùng RDDID thay StageID để reference stage | reject invalid plan/reference |
| planning fail sau JobID reserve | error có thể mang JobID; ID không được reuse |
| runtime request StageAttemptID trong planning | reject; Feature 02 không tạo attempt |

Không validation nào ở UC-07 được chạy source, closure, task hay shuffle I/O.

### 8. Tests chính

- Hai calls `PlanJob` liên tiếp có JobID tăng, dù final RDD giống nhau.
- Failed planning sau reservation không làm JobID bị reuse.
- Result stages mới có StageID tăng.
- Cùng shuffle dependency qua nhiều jobs reuse một `ShuffleMapStage` và giữ
  StageID cũ.
- New shuffle dependencies có StageID mới; parent producer stage được cấp trước
  child stage và result stage.
- Concurrent planning không duplicate JobID/StageID hoặc shuffle stage.
- StageAttemptID không xuất hiện trong JobPlan và không thể dùng làm TaskID.

### 9. Ngoài phạm vi

- task ID, task attempt ID, retry, speculative execution và failure recovery;
- stage/task start/completion runtime state;
- source I/O, transformation/reducer execution và shuffle data;
- render ID/topology cho user; UC-08.
