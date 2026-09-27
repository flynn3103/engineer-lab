# Feature 02: RDD dependencies và DAGScheduler planning

## UC-04: `ResultStage` của action đang chờ gì?

### 1. Mục đích và output của UC-04

Khi caller gọi action như `Count` trên một final RDD, scheduler cần một object
đại diện cho **stage cuối cùng** sẽ tạo kết quả cho action đó.

UC-04 tạo object này: `ResultStage`.

Nó trả lời hai câu hỏi:

1. action này kết thúc ở RDD nào?
2. trước khi chạy phần cuối đó, những `ShuffleMapStage` nào phải hoàn thành?

Ví dụ lineage:

```text
source -> map -> keyBy -> reduceByKey -> filter -> Count
```

`filter` là final RDD của action. `ResultStage` đại diện cho phần consumer:

```text
reduceByKey -> filter -> Count
```

Nó phải chờ `ShuffleMapStage` sản xuất shuffle output cho `keyBy`:

```text
ShuffleMapStage: source -> map -> keyBy
                         |
                         | shuffle output
                         v
ResultStage:     reduceByKey -> filter -> Count
```

**Output:** đúng một `ResultStage` cho action submission, chứa:

- final RDD mà action lấy kết quả;
- action cần thực hiện, như `count`;
- danh sách `ShuffleMapStage` phải hoàn thành trước nó.

Narrow-only lineage vẫn có `ResultStage`, nhưng parent stage list rỗng. Lineage
có shuffle thì list này chứa các stages tạo shuffle output cần chờ.

UC-04 chỉ tạo metadata. Nó không tạo task, không chạy stage, không đọc source
và không gọi closure của user.

### 2. Input và output

Input là final RDD và action đã được validated ở `PlanJob`:

```go
plan, err := scheduler.PlanJob(finalRDD, CountAction)
```

Output là một `ResultStage` trong `JobPlan`:

```text
JobPlan
  ResultStage
    FinalRDD: filter
    Action:   count
    Parents:  [ShuffleMapStage for keyBy]
```

Nếu lineage chỉ có narrow transformations:

```text
source -> map -> filter -> Count
```

thì không có stage tạo shuffle output phải chờ:

```text
JobPlan
  ResultStage
    FinalRDD: filter
    Action:   count
    Parents:  []
```

Vẫn luôn có đúng một `ResultStage` cho mỗi action submission, kể cả khi nó
không có parent stage.

### 3. `ResultStage` giữ những gì?

Shape minh hoạ:

```go
type ResultStage struct {
    ID             StageID
    FinalRDDID     RDDID
    Action         ActionSpec
    ParentStageIDs []StageID
}
```

| Field | Ý nghĩa |
| --- | --- |
| `ID` | identity của stage trong scheduler; UC-07 mô tả lifecycle/counter chi tiết |
| `FinalRDDID` | RDD cuối cùng mà action cần kết quả từ đó |
| `Action` | `count`, `collect` hoặc action được hỗ trợ sau này |
| `ParentStageIDs` | các stages tạo shuffle output phải hoàn thành trước result stage |

`ResultStage` không cần liệt kê mọi RDD narrow phía trước nó. `FinalRDDID` cùng
lineage metadata đã đủ để future runtime biết chain narrow thuộc result stage.
Ví dụ `filter -> reduceByKey` là narrow nên cả hai thuộc result side; scheduler
chỉ giữ parent stage ở điểm shuffle `reduceByKey -> keyBy`.

`ResultStage` cũng không giữ rows, task attempt, worker state, reducer closure
hay shuffle file location.

### 4. Tìm parent stages

UC-02 đã có helper:

```text
findImmediateShuffleDependencies(finalRDD)
```

Helper này walk ngược qua tất cả narrow edge của result side và dừng ở mỗi
shuffle edge. Kết quả là các map-side RDD phải tạo shuffle output trước action.

UC-04 dùng kết quả đó theo flow:

```text
createResultStage(finalRDD, action):
    shuffleDeps = findImmediateShuffleDependencies(finalRDD)
    parentStages = resolve one ShuffleMapStage for each shuffleDep
    return ResultStage(finalRDD, action, parentStages)
```

`resolve` là contract với UC-05:

- cùng một shuffle dependency luôn resolve tới cùng một `ShuffleMapStage` trong
  scheduler lifecycle;
- UC-05 chịu trách nhiệm tạo/reuse stage tạo shuffle output và tìm upstream stages;
- UC-04 chỉ link các stage đã resolve làm parents của result stage.

Vì vậy trách nhiệm được tách rõ:

| Use case | Việc làm |
| --- | --- |
| UC-02 | tìm immediate shuffle dependencies của một stage |
| UC-04 | tạo result stage cho final RDD và link các parents |
| UC-05 | tạo/reuse `ShuffleMapStage` cho mỗi shuffle dependency |

### 5. Một, không, hoặc nhiều parent stages

**Không có shuffle:** result stage không chờ stage nào.

```text
source -> map -> filter -> Count

ResultStage(filter, count, parents=[])
```

**Một shuffle:** result stage chờ một stage tạo shuffle output.

```text
source -> keyBy -> reduceByKey -> filter -> Count

ShuffleMapStage(keyBy) -> ResultStage(filter, count)
```

**Nhiều shuffle:** final RDD có thể reach nhiều shuffle boundaries qua các
nhánh narrow, ví dụ một Union của hai reduce results. Result stage chờ tất cả
stages tạo shuffle output đó:

```text
left source  -> reduceByKey --\
                             Union -> Count
right source -> reduceByKey --/

ShuffleMapStage(left map side)  -> ResultStage(Union, count)
ShuffleMapStage(right map side) -> ResultStage(Union, count)
```

Mỗi parent stage chỉ xuất hiện một lần trong `ParentStageIDs`, kể cả nếu graph
đến cùng shuffle dependency qua nhiều narrow branches. Danh sách parents phải
deterministic; planner sắp xếp shuffle dependencies theo map-side RDD ID trước
khi resolve chúng.

### 6. Stage boundary có nghĩa gì?

`ResultStage` không phải “chỉ chạy final RDD”. Nó chứa toàn bộ computation
narrow reachable từ final RDD cho đến khi gặp shuffle boundary.

```text
source -> map -> keyBy -> reduceByKey -> filter -> Count
                         ^               ^
                         |               |
                 shuffle boundary     final RDD
```

Result stage bắt đầu logic ở `reduceByKey`, vì data từ `keyBy` chỉ sẵn sàng sau
stage tạo shuffle output. `filter` ở sau `reduceByKey` vẫn là narrow nên nằm
cùng result stage.

Điều này ngăn scheduler tạo nhầm một stage riêng cho mỗi `Map` hoặc `Filter`.
Chỉ shuffle mới cắt stage; narrow edge chỉ kéo lineage vào cùng stage.

### 7. Snapshot và ownership

`PlanJob` trả snapshot của plan, không trả scheduler state mutable.

```text
Scheduler owns:  ResultStage internal state và stage registry
Caller receives: copy của JobPlan, ResultStage và ParentStageIDs
```

Caller sửa `ParentStageIDs` trong output không được làm thay đổi result stage
mà scheduler đang giữ. Tương tự, caller không thể đổi `FinalRDDID`, action hay
parent relation sau khi plan đã được tạo.

Một lần gọi `PlanJob` tạo một result stage mới cho action submission đó. Hai
actions trên cùng final RDD có thể có final RDD ID giống nhau nhưng JobID và
ResultStage ID khác nhau. UC-07 định nghĩa chính xác counter/lifecycle của các
ID này.

### 8. Validation và error contract

| Tình huống | Kết quả |
| --- | --- |
| `finalRDD` là `nil` | `PlanJob` trả error trước khi tạo ResultStage |
| action không hợp lệ | trả error trước khi tạo ResultStage |
| final RDD không thuộc scheduler context | trả error |
| dependency graph bị corrupt | fail trong traversal/validation, không tạo plan nửa vời |
| shuffle dependency thiếu partitioner hợp lệ | fail trước khi resolve parent stage |
| resolver không tạo được stage tạo shuffle output | trả error, không publish ResultStage |
| cùng parent stage xuất hiện nhiều lần | deduplicate trước khi tạo ResultStage |

Mọi error ở UC-04 là planning error. Không source I/O, user closure, task hay
shuffle data write/fetch nào được phép xảy ra trước error.

### 9. Tests chính

- Narrow-only lineage tạo đúng một `ResultStage`, `ParentStageIDs` rỗng và
  `FinalRDDID` đúng final RDD.
- Một `ReduceByKey` tạo result stage có đúng một parent `ShuffleMapStage`.
- Transformations narrow sau shuffle vẫn giữ `FinalRDDID` ở result side, không
  tạo stage bổ sung.
- Union có hai stages tạo shuffle output tạo result stage có hai parent IDs theo thứ
  tự deterministic.
- Shared ancestor/shuffle chỉ xuất hiện một lần trong parent list.
- Invalid final RDD, action, dependency hoặc parent resolver fail trước source
  I/O và trước mọi user closure invocation.
- Caller mutation của `JobPlan.ResultStage.ParentStageIDs` không làm đổi
  scheduler state.
- Hai action submissions trên cùng final RDD có result stages khác ID.

### 10. Ngoài phạm vi

- thuật toán tạo/reuse `ShuffleMapStage` và các upstream shuffle stages; UC-05;
- tạo task template, task attempt, worker/executor launch, retry hoặc locality;
- source I/O, narrow execution, reducer execution hoặc shuffle read/write;
- JobID/StageID counter, stage attempt lifecycle và TaskID; UC-07;
- render/format `JobPlan` để inspect; UC-08.
