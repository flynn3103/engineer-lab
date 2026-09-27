# Feature 03: Local worker runtime và actions

## UC-07: Khi job bị cancel hoặc một task lỗi thì dừng thế nào?

### 1. Mục đích và output của UC-07

Nếu caller cancel context hoặc một task return error, coordinator không thể cứ
để queue và worker khác tiếp tục chạy. Nó cũng không được publish partial
`Collect` hay JSONL output.

UC-07 trả lời:

> Làm sao một terminal signal dừng toàn job, dừng work còn lại và trả error có
> đủ context?

**Output:** job kết thúc ở một terminal state duy nhất:

```text
succeeded | failed | canceled
```

Với `failed`/`canceled`, caller nhận contextual `JobError` và không nhận action
result thành công hay final output directory. Temporary output của job được
cleanup.

### 2. Một nguồn cancellation chung

UC-01 đã tạo child context và cancel function trong `JobContext`. UC-07 dùng
nó làm single cancellation signal cho coordinator, queued tasks và active tasks:

```text
caller context canceled
task returns error
      -> coordinator calls job cancel
      -> active task checks context and stops
      -> coordinator waits for workers to return
      -> job becomes failed or canceled
```

Worker/closure/source reader phải check context trong streaming loop. Coordinator
ngừng dispatch task mới ngay khi thấy terminal signal.

### 3. Terminal state ownership

Coordinator là owner duy nhất được chuyển `JobContext.State`:

```text
planned -> running -> succeeded
                  -> failed
                  -> canceled
```

Signal đầu tiên quyết định terminal reason:

- caller cancellation trước task error: `canceled`;
- task/source/closure/sink error trước cancellation: `failed`;
- mọi task/stage required success: `succeeded`.

Late task result sau terminal state bị bỏ qua; không được overwrite error hay
được publish output. Feature 05 mở rộng rule này cho retries và attempts.

### 4. `JobError`

Error trả caller phải giữ tối thiểu:

```text
JobID
StageID (nếu có)
PartitionID (nếu có)
Cause
Terminal state: failed hoặc canceled
```

Ví dụ:

```text
job 7 stage 4 partition 2 failed: map function: invalid amount
```

Cancellation trả context cause để caller phân biệt deadline exceeded và explicit
cancel. Không wrap error thành success result hay nuốt original cause.

### 5. Cleanup boundary

Khi job fail/cancel, coordinator:

1. ngừng queue và signal active tasks;
2. chờ workers close source readers/sinks;
3. gọi cleanup cho temporary JSONL directory của job;
4. discard partial Count/Collect buffers;
5. return one terminal result.

Chỉ temporary paths do chính JobID tạo mới được xóa. UC-07 không xóa caller
destination, source input hay output committed của job khác.

### 6. Ví dụ: một partition lỗi khi ghi JSONL

Job `7` ghi ba partition của stage `4` với `Workers = 2`. Partition `0` và
`1` đang chạy; partition `2` còn trong queue. Partition `0` gặp lỗi trong
`Map` (`invalid amount`) trước khi caller cancel:

```mermaid
sequenceDiagram
    participant P0 as Worker: partition 0
    participant C as Coordinator
    participant P1 as Worker: partition 1
    participant Q as Queue: partition 2
    participant T as Temporary JSONL
    P0-->>C: Map returns "invalid amount"
    C->>C: Giữ reason đầu tiên: failed
    C->>Q: Ngừng dispatch; bỏ partition 2
    C->>P1: Cancel job context
    P1-->>C: Check context, abort writer, close reader, return
    C->>T: Chờ workers xong rồi cleanup temp của job 7
    C-->>C: Discard partial results; không publish destination
```

Caller nhận `JobError` cho job `7`, stage `4`, partition `0`, với cause
`invalid amount`. Partition `2` không được dispatch sau signal; result đến muộn
từ partition `1` không thể đổi state `failed`.
Nếu caller cancel trước lỗi của partition `0`, cùng luồng dừng và cleanup diễn
ra, nhưng terminal state là `canceled` và cause là lỗi context.

### 7. Không retry trong UC-07

Một task error làm job fail ở Feature 03. UC-07 không phân loại retryable error,
không cấp TaskAttemptID và không chạy lại task. Những quyết định đó thuộc
Feature 05.

```text
Feature 03: first error -> stop job
Feature 05: error class + attempt policy -> retry or stop
```

### 8. Tests chính

- Caller cancel trước admission hoặc trong task stream kết thúc job `canceled`.
- Task source/closure/sink error kết thúc job `failed` với Job/Stage/Partition
  context.
- Terminal signal ngừng dispatch queued tasks và active tasks quan sát context.
- Late result không đổi terminal state hoặc publish output.
- Failed/canceled Count/Collect không return partial success result.
- Failed/canceled JSONL removes only job temporary path, không overwrite/delete
  destination có sẵn.
- Không có retry hoặc TaskAttemptID được tạo trong Feature 03.

### 9. Ngoài phạm vi

- retry, speculative execution, attempt history và retry classification; Feature 05;
- task source/closure execution implementation; UC-03;
- atomic JSONL publish mechanics; UC-06;
- process/remote worker cancellation protocol.
