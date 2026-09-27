# Feature 02: RDD dependencies và DAGScheduler planning

## UC-08: Nhìn `JobPlan` mà không chạy job

### 1. Mục đích và output của UC-08

Sau khi `PlanJob` tạo stage graph, caller cần cách kiểm tra plan trước khi có
runtime. UC-08 cung cấp inspect output side-effect-free.

Nó trả lời câu hỏi:

> Action này có những stages nào, stage nào chờ stage nào, và mỗi stage có bao
> nhiêu partitions cần chạy?

Ví dụ:

```text
Job 7

ShuffleMapStage 3
  map-side RDD: keyBy (RDD 4)
  partitions:   [0, 1, 2]
  parents:      []

ResultStage 4
  final RDD:    filter (RDD 6)
  action:       count
  partitions:   [0, 1]
  parents:      [3]
```

**Output:** một `JobPlanView` immutable và text representation, cho thấy:

- ResultStage nào trả kết quả action;
- tất cả ShuffleMapStages mà plan cần;
- parent-to-child stage edges;
- partition IDs template của từng stage.

Caller có thể dùng output này để debug topology trước runtime mà không làm đổi
plan hoặc scheduler state.

Inspect chỉ đọc `JobPlan` snapshot. Nó không mở source, gọi closure, tạo task
hay kiểm tra shuffle output tồn tại hay chưa.

### 2. Input và output

API minh hoạ:

```go
func ExplainJobPlan(plan JobPlan) (JobPlanView, error)
func (view JobPlanView) Text() string
```

`JobPlanView` là projection immutable của plan:

```go
type JobPlanView struct {
    JobID         JobID
    ResultStageID StageID
    Stages        []StageView
    Edges         []StageEdgeView
}

type StageView struct {
    ID             StageID
    Kind           string // shuffle_map hoặc result
    RDDID          RDDID
    Partitions     []int
    ParentStageIDs []StageID
    Action         *ActionSpec       // chỉ ResultStage
    Partitioner    *HashPartitioner  // chỉ ShuffleMapStage
}
```

Public output chỉ chứa planning metadata. Nó không chứa row payload, source
paths, closure body/captured values, reducer function hoặc scheduler pointers.

### 3. Stage graph được render thế nào?

`Stages` được sắp xếp dependency order: tất cả parent stages đứng trước child
stage; ResultStage luôn đứng cuối. `Edges` dùng chiều:

```text
parent stage -> child stage
```

Với một shuffle:

```text
ShuffleMapStage 3 -> ResultStage 4
```

Với hai stages tạo shuffle output của Union:

```text
ShuffleMapStage 3 --\
                      -> ResultStage 5
ShuffleMapStage 4 --/
```

Stage IDs là giá trị của snapshot hiện tại. Hai runs có topology giống nhau có
thể có JobID/StageID khác; inspect giữ stable ordering cho cùng plan, không hứa
text bằng nhau giữa hai scheduler lifecycles.

### 4. Text output tối thiểu

Text output ưu tiên đọc nhanh, không phải Spark UI:

```text
Job 7

ShuffleMapStage 3
  map-side RDD: 4
  partitioner: HashPartitioner(2)
  partitions: [0, 1, 2]
  parents: []

ResultStage 4
  final RDD: 6
  action: count
  partitions: [0, 1]
  parents: [3]
```

`TaskSetTemplate` của UC-06 là nguồn cho dòng `partitions`. Inspect không tự
tính partitions bằng cách chạy RDD lineage.

Feature 06 sau này xây public `Explain` đầy đủ, JSON rendering, redaction và
output limits trên metadata này. UC-08 chỉ định nghĩa projection stage graph
cho Feature 02.

### 5. Snapshot và safety

`ExplainJobPlan` deep-copy các slices/maps cần thiết từ `JobPlan` trước khi
return view. Caller có thể sửa `view.Stages[0].Partitions` mà không làm đổi
plan hay scheduler registry.

Inspect được phép validate snapshot consistency, nhưng không được mutate:

```text
allowed:    verify parent ID exists, sort copied stage views
forbidden:  allocate ID, create stage, register shuffle stage, create task
```

Vì vậy gọi explain nhiều lần trên cùng plan không thay đổi JobID, StageID,
stage registry hay task template.

### 6. Validation và error contract

| Tình huống | Kết quả |
| --- | --- |
| plan không có ResultStage | return error, không render partial graph |
| stage ID duplicate | return corrupted plan error |
| parent stage ID không có trong plan | return dangling edge error |
| graph có cycle | return invalid stage graph error |
| template StageID/parent IDs không khớp stage | return inconsistent plan error |
| unsupported stage kind | return error thay vì bỏ qua stage |

Lỗi inspect chỉ là metadata error. Nó không được fallback sang source I/O hay
closure execution để “tự sửa” plan.

### 7. Tests chính

- Narrow-only plan render một ResultStage, no edges và đúng partition list.
- One-shuffle plan render stage tạo shuffle output trước result stage và một parent edge.
- Union có hai map sides render hai parent edges theo thứ tự stable.
- Partitions đến từ TaskSetTemplate và map-side view hiển thị partitioner.
- Explain cùng plan hai lần trả topology/text cùng thứ tự và không đổi IDs.
- Caller mutation của returned view không đổi original plan/scheduler state.
- Missing ResultStage, duplicate stage, dangling parent, cycle hoặc inconsistent
  template return error trước source I/O/closure invocation.

### 8. Ngoài phạm vi

- Spark UI, live dashboard, event log, task metrics hoặc runtime status;
- JSON persistence, output-size limits, redaction policy và public CLI;
  Feature 06;
- tạo/reuse stage, task template hay scheduler IDs; UC-05 đến UC-07;
- task execution, source I/O, shuffle data và reducer execution.
