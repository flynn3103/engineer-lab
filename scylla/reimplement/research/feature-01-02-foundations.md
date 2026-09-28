# Cơ sở nghiên cứu và kết quả review Feature 01–02

Ngày đối chiếu web: 2026-09-28.

Tài liệu này ghi lại nguồn chính thức được dùng để sửa nền tảng giải thích.
Các API, fixture, thresholds và protocol của project là thiết kế học tập,
không phải bản sao implementation của ScyllaDB, LevelDB hay RocksDB.

## 1. Những vấn đề tìm thấy trong bản trước

| Vấn đề | Hệ quả với người học | Sửa trong bản mới |
| --- | --- | --- |
| F01 chỉ có các ranges tuyến tính | Chưa hiểu vì sao gọi là consistent hashing hoặc khi nào wrap | Endpoint ring, successor lookup, khoảng (previous,current], ví dụ thêm/xoá node. |
| Không so với hash moduloN | Chưa thấy bài toán placement khi cluster đổi size | Bảng hash 0..11, modulo 3→4 và fixture ring trước/sau. |
| Token/owner có vẻ là identity | Có thể gộp hai partition khi hash collision | Full table+partition identity ở read và metrics. |
| UC-03 còn quyết định mở về tuple/Reverse | Mâu thuẫn với schema UC-01 đã hỗ trợ tuple DESC | Full tuple bounds, Forward theo comparator; latest-N rõ theo schema. |
| UC-04 nói skew nhưng không đo remap | Chưa kiểm chứng mục tiêu của consistent hashing | Coverage, key/byte remap rate, hot và wide tách riêng. |
| F02 liệt kê WAL/memtable/SSTable nhưng thiếu cơ chế LSM | Học tên thành phần mà chưa hiểu vì sao gom ghi | Ordered RAM, sorted runs overlap, write/read paths và vai trò compaction. |
| Ví dụ ACK và algorithm dùng thứ tự khác nhau | Không biết success hứa gì | Lab thống nhất append→sync→apply→ACK. |
| Coi mọi ACK như đã fsync | Có thể nhầm lab với các sync mode thực tế | Nêu policy sync-before-ACK riêng; đối chiếu periodic/batch của ScyllaDB. |
| Dùng “max sequence file mới” như checkpoint | Có thể xoá log có dữ liệu chưa flush | Prefix liên tục; case generation flush lệch thứ tự. |
| Throughput/latency không tính backlog | Dễ kết luận write nhanh trong khi dồn nợ I/O nền | Ingest ratio, coalescing, flush debt và pha drain. |

## 2. Nguồn cho consistent hashing, key và ring

### ScyllaDB Ring Architecture

[Ring Architecture — tài liệu chính thức](https://docs.scylladb.com/manual/stable/architecture/ringarchitecture/).

Dùng để đối chiếu thuật ngữ partitioner/token và ring/vnode. Bản lab giải thích
placement bằng endpoint successor và fixture 0..99; các endpoint cụ thể là ví
dụ tự xây để kiểm tra boundary và remapping.

Không lấy các mô tả vnode lịch sử làm bằng chứng rằng mọi deployment ScyllaDB
hiện tại chỉ dùng vnode. Đọc thêm tablet documentation ở dưới.

### ScyllaDB Data Definition

[Data Definition — primary key, partition và clustering](https://docs.scylladb.com/manual/stable/cql/ddl.html).

Dùng để phân biệt nhóm row của partition với thứ tự clustering. Canonical codec,
uint64 token, type set và giới hạn request là lựa chọn của project; không hứa
tương thích CQL serialization.

### ScyllaDB Tablets

[Data Distribution with Tablets](https://docs.scylladb.com/manual/stable/architecture/tablets.html).

Dùng để phân biệt nền tảng hashing/range với placement tablet theo table và
migration. Feature 01 giải thích lookup và remapping giả định; Feature 09 mới
xử lý chuyển dữ liệu thật. Lab không suy rằng sửa owner map đồng nghĩa dữ liệu
đã tới destination.

## 3. Nguồn cho nền tảng LSM và durability

### RocksDB Overview

[RocksDB Overview — tài liệu của dự án](https://github.com/facebook/rocksdb/wiki/RocksDB-Overview).

Đối chiếu vai trò memtable, WAL, SST và flush/compaction. Bản lab dùng worked
example nhỏ để thấy cùng key tồn tại ở nhiều runs và cần reconciliation.

Lab không mặc định rằng mọi LSM đều có cùng policy levels, cùng cách reclaim
versions hoặc cùng layout SSTable.

### LevelDB Implementation

[LevelDB implementation notes](https://raw.githubusercontent.com/google/leveldb/main/doc/impl.md).

Đối chiếu sorted tables, manifest và recovery. Manifest replace, prefix watermark
và owner admission trong lab là protocol riêng; không mô tả lại byte format
MANIFEST/CURRENT của LevelDB.

### RocksDB WAL

[Write Ahead Log](https://github.com/facebook/rocksdb/wiki/Write-Ahead-Log-%28WAL%29).

Đối chiếu vì sao WAL bảo vệ phần state chưa được flush. Bản lab tách rõ log
append order và ordered data run; log không là query index của read path.

### RocksDB Write Stalls

[Write Stalls](https://github.com/facebook/rocksdb/wiki/Write-Stalls).

Đối chiếu nhu cầu điều tiết khi memtable hoặc file backlog tăng. Thí nghiệm
của lab dùng budgets/speeds giả định để quan sát stalls, không đưa ra tuning
recommendation cho production.

### ScyllaDB Commitlog Configuration

[Commit log settings](https://docs.scylladb.com/manual/stable/reference/configuration-parameters.html#commit-log-settings).

Nguồn phân biệt chế độ periodic với batch về việc chờ sync trước ACK.
Lab chọn strict sync-before-ACK, cộng local apply trước trả receipt.
Đây là contract có chủ đích để kiểm chứng crash, không khẳng định cấu hình
mặc định của một cluster người đọc đang vận hành.

## 4. Những quyết định riêng của mô hình

| Quyết định | Vì sao dùng trong lab? | Không được suy thành gì? |
| --- | --- | --- |
| SHA256 prefix 64, uint64 ring | Dễ test codec/hash/endianness và giữ ring lookup rõ | Không phải token Murmur3 tương thích ScyllaDB. |
| Endpoint(previous,current] | Boundary và wrap-around tính được bằng tay | Không tự là migration protocol. |
| RingSnapshot immutable | Tách correctness lookup khỏi topology concurrency | Không tự phát hiện/recover node down. |
| Một primary owner ở F01 | Học placement trước replication | Không cung cấp availability khi node mất. |
| Ordered memtable winner-only | Hiểu batching và flush trong baseline | Không phải MVCC nhiều snapshot lịch sử. |
| Một flush tạo một SSTable/run | Quan hệ freeze→publish dễ quan sát | Không bắt buộc mọi LSM run phải là một file. |
| Sync mỗi write trước ACK | Durable boundary đơn giản, testable | Không luôn đạt throughput production tối ưu. |
| Manifest replace nguyên tử | Dễ xây crash matrix | Không phải format metadata LevelDB/ScyllaDB. |
| Winner tuple do lab định nghĩa | Reconcile/replay cho kết quả xác định | Không tái tạo đầy đủ timestamp/cell semantics CQL. |

## 5. Cách kiểm chứng bộ tài liệu

Các ví dụ ring có thể kiểm tra bằng một successor lookup nhỏ: boundary, wrap,
thêm D35 chỉ đổi21..35 và bỏ B50 chỉ đổi36..50 trong fixture đã mô tả.

Các ví dụ LSM dùng oracle map theo full row identity và version winner. So kết
quả sau mỗi flush/replay với oracle; kiểm tra sorted order bằng schema comparator,
không dùng tên file hoặc append sequence để chọn version.

Kiểm tra Markdown/link bảo vệ khả năng đọc tài liệu; nó không chứng minh engine
đã implement hoặc vượt qua fault injection. Khi triển khai, phải chạy test
crash/I/O/concurrency được ghi trong từng use case.

Quay lại [Feature 01](../feature/01-partition-keys-and-static-token-routing.md)
và [Feature 02](../feature/02-commitlog-memtable-and-sstable.md).
