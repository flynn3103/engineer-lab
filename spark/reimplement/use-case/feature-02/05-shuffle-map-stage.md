# Feature 02: RDD dependencies và DAGScheduler planning

## UC-05: `ShuffleMapStage` tạo shuffle output trước

### 1. Mục đích và output của UC-05

Khi `ResultStage` gặp shuffle edge, dữ liệu nó cần vẫn chưa tồn tại. Lineage ở
phía trước edge phải chạy trước để tạo dữ liệu trung gian đã được chia vào các
shuffle buckets.

UC-05 tạo hoặc lấy lại stage đại diện cho phần việc đó: `ShuffleMapStage`.

Spark thường gọi phía tạo dữ liệu trung gian là **producer**. Trong tài liệu
này, dùng tên rõ nghĩa hơn: **stage tạo shuffle output**. Nó ở phía trước
shuffle; `ResultStage` ở phía sau shuffle sẽ đọc output của nó sau này.

Ví dụ:

```text
source -> map -> keyBy -> reduceByKey -> filter -> Count
                         ^
                         shuffle edge
```

`ShuffleMapStage` đại diện cho stage tạo shuffle output:

```text
source -> map -> keyBy
```

Nó hứa rằng future runtime sẽ tạo shuffle output cho `reduceByKey`.

**Output:** một `ShuffleMapStage` cho mỗi shuffle output cần có, gồm:

- map-side RDD: lineage sẽ tạo shuffle output;
- output partitioner: cách consumer `ReduceByKey` sẽ nhận data;
- upstream shuffle stages phải chạy trước;
- stable StageID để nhiều consumer có thể reuse cùng stage tạo shuffle output.

Nếu scheduler gặp lại đúng shuffle dependency, output là stage đã có trong
registry, không phải một stage duplicate.

UC-05 chưa đọc source, chưa chạy `map`/`keyBy`, chưa hash row và chưa ghi
shuffle output.

### 2. Stage giữ những gì?

```go
type ShuffleMapStage struct {
    ID                  StageID
    ShuffleRDDID        RDDID
    MapSideRDDID        RDDID
    OutputPartitioner   HashPartitioner
    ParentStageIDs      []StageID
}
```

| Field | Ý nghĩa |
| --- | --- |
| `ID` | identity stage do scheduler cấp; lifecycle chi tiết thuộc UC-07 |
| `ShuffleRDDID` | RDD consumer sở hữu shuffle dependency; key để reuse stage |
| `MapSideRDDID` | parent RDD mà map side sẽ xử lý để tạo shuffle output |
| `OutputPartitioner` | `HashPartitioner` của reduce/output partitions |
| `ParentStageIDs` | upstream shuffle stages phải hoàn thành trước stage này |

Trong Feature 02 hiện tại, một `ReduceByKey` RDD chỉ có một shuffle dependency.
Vì vậy `ShuffleRDDID` là shuffle identity đủ ổn định để registry dùng làm key.
Future transformation có nhiều shuffle edges phải có identity edge rõ ràng hơn;
UC-05 không giả định điều đó đã tồn tại.

### 3. Tạo hoặc reuse stage

Một shuffle output không được có hai `ShuffleMapStage` khác nhau trong cùng
scheduler lifecycle. Scheduler giữ registry:

```text
shuffleStages[ShuffleRDDID] -> ShuffleMapStage
```

Flow khái niệm:

```text
getOrCreateShuffleMapStage(shuffleDep):
    key = RDD ID của child sở hữu shuffleDep
    return registry[key] nếu đã có

    mapSideRDD = shuffleDep.parent
    parentDeps = findImmediateShuffleDependencies(mapSideRDD)
    parentStages = getOrCreateShuffleMapStage(each parentDep)

    create ShuffleMapStage(mapSideRDD, partitioner, parentStages)
    save vào registry[key]
    return stage
```

UC-02 cung cấp `findImmediateShuffleDependencies`. Với map-side RDD, helper
walk qua narrow lineage và chỉ trả các shuffle boundary xa hơn. Vì vậy UC-05
đệ quy stage graph theo đúng hướng upstream.

### 4. Ví dụ một shuffle

```text
source -> map -> keyBy -> reduceByKey -> filter -> Count
```

`reduceByKey -> keyBy` là shuffle edge. Scheduler tạo:

```text
ShuffleMapStage
  MapSideRDD:        keyBy
  OutputPartitioner: HashPartitioner(2)
  Parents:            []

ResultStage
  FinalRDD:           filter
  Parents:             [ShuffleMapStage]
```

`source -> map -> keyBy` đều narrow, nên không có stage object riêng cho từng
RDD đó. Chúng cùng thuộc stage tạo shuffle output.

### 5. Ví dụ shuffle nối tiếp nhau

Stage tạo shuffle output có thể lại phụ thuộc shuffle khác:

```text
source -> keyBy -> reduceByKey -> map -> keyBy -> reduceByKey -> Count
                       ^                         ^
                    shuffle A                 shuffle B
```

Stage graph là:

```text
ShuffleMapStage A -> ShuffleMapStage B -> ResultStage
```

Khi tạo stage B, UC-05 walk từ map-side RDD của B. Nó gặp shuffle A, nên tạo/lấy
stage A trước rồi link A vào `ParentStageIDs` của B. Result stage sau đó link B.

Stage order này là dependency order, không phải thứ tự RDD được tạo.

### 6. Reuse và deduplication

Hai downstream branches có thể cùng cần một shuffle output:

```text
map-side RDD -> reduceByKey -> branch A --\
                                      Union -> Count
map-side RDD -> reduceByKey -> branch B --/
```

Hai branches đều gặp cùng shuffle RDD. Registry trả cùng một
`ShuffleMapStage`, nên ResultStage chỉ có một parent stage ID cho shuffle đó.

Scheduler phải bảo vệ lookup/create bằng mutex hoặc cơ chế đồng bộ tương đương.
Nếu hai planning calls đồng thời yêu cầu cùng shuffle, chỉ một stage được
publish vào registry; caller còn lại nhận stage đã publish.

Parent stages được resolve theo map-side RDD ID tăng dần. Điều này làm topology
snapshot ổn định dù traversal dùng stack.

### 7. Validation và error contract

| Tình huống | Kết quả |
| --- | --- |
| dependency không phải `shuffle` | reject; không tạo `ShuffleMapStage` |
| map-side RDD không tồn tại/cùng Context | reject corrupted graph |
| shuffle không có `HashPartitioner` hợp lệ | reject trước stage creation |
| upstream stage graph có cycle | reject, không publish stage nửa vời |
| cùng `ShuffleRDDID` có metadata mâu thuẫn | reject corrupted registry/graph |
| recursive parent stage không tạo được | trả error, không publish child stage |

Stage chỉ được thêm vào registry sau khi toàn bộ parent stages hợp lệ. Nếu có
error, scheduler không để registry chứa stage thiếu parent hoặc thiếu
partitioner.

Không error nào ở đây được phép gây source I/O, closure invocation, task
creation hay shuffle write/fetch.

### 8. Tests chính

- Một shuffle dependency tạo `ShuffleMapStage` có map-side RDD và
  `HashPartitioner` đúng metadata của edge.
- Narrow chain trước shuffle không tạo thêm stages.
- Hai shuffle nối tiếp tạo parent stage trước child stage.
- Hai consumers cùng shuffle dependency nhận cùng stage ID, không duplicate.
- Parent stage IDs unique và có thứ tự deterministic.
- Corrupted dependency, missing partitioner hoặc cycle fail trước source I/O và
  không làm registry giữ stage nửa vời.
- Caller mutation của JobPlan snapshot không đổi stage registry nội bộ.

### 9. Ngoài phạm vi

- `ResultStage` của action và link từ final RDD; UC-04;
- task template, task attempts, worker/executor launch và stage completion;
- hash rows, write/read shuffle files, reducer execution và map-side combine;
- `JobID`/`StageID` counter lifecycle; UC-07;
- render `JobPlan`; UC-08.
