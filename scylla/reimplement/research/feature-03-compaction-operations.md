# Research Feature 03: Compaction để vận hành ScyllaDB

Ngày đối chiếu: 2026-09-29. Phạm vi: gộp Feature 03 và Feature 08, ưu tiên
quyết định vận hành hơn phần cài đặt merge iterator. Chỉ dùng nguồn chính thức
của ScyllaDB cho các khẳng định về sản phẩm.

## 1. Cách đọc nguồn và giới hạn version

Các trang `manual/stable` được đọc trong lượt nghiên cứu chính hiển thị
nhánh 2026.3. Đây là alias có thể thay đổi, không phải xác nhận cluster của
người đọc đang chạy version đó. Với runbook thực tế phải lưu version/schema
và đọc reference tương ứng trước khi dùng command hoặc option.

Ngay các trang hiện hành cũng có chỗ không đồng nhất về default: KB/CQL
compaction ghi STCS, trong khi System Requirements và Production Readiness
gọi ICS là default. Vì thế bộ tài liệu không đoán strategy thực tế từ default;
phải kiểm tra schema bảng. Không suy availability của một bản OSS cũ từ
manual hiện tại.

Tham chiếu đối chiếu: [KB compaction](https://docs.scylladb.com/manual/stable/kb/compaction.html),
[CQL options](https://docs.scylladb.com/manual/stable/cql/compaction.html),
[System Requirements](https://docs.scylladb.com/manual/stable/getting-started/system-requirements.html)
và [Production Readiness](https://docs.scylladb.com/manual/stable/operating-scylla/procedures/tips/production-readiness.html).

## 2. Bản đồ nguồn cho cơ chế và chiến lược

| Nguồn chính thức | Dùng để đối chiếu | Nơi áp dụng |
| --- | --- | --- |
| [Compaction overview](https://docs.scylladb.com/manual/stable/kb/compaction.html) | LSM/SSTable, sorted runs, sự khác nhau giữa các strategy và chuyển đổi. | Overview, UC-02/03. |
| [Choose a Compaction Strategy](https://docs.scylladb.com/manual/stable/architecture/compaction/compaction-strategies.html) | Trade-off theo workload, không có strategy thắng mọi mặt. | UC-02. |
| [Compaction CQL Reference](https://docs.scylladb.com/manual/stable/cql/compaction.html) | Tên class/options và ý nghĩa window/threshold/target size. | UC-02/03. |
| [TTL and Compaction](https://docs.scylladb.com/manual/stable/kb/ttl-facts.html) | Fully expired SSTable vẫn có thể bị chặn drop do overlap. | UC-03/05. |
| [Tombstone GC options, 2026.3](https://docs.scylladb.com/manual/branch-2026.3/cql/ddl.html#tombstones-gc-options) | Các mode, repair/propagation delay và giới hạn RF/table type. | UC-05. |

Không chuyển ví dụ lịch sử về TTL/GC trong KB thành công thức purge tổng quát
cho mọi mode hiện hành. UC-05 dùng DDL đúng version để phân biệt policy và
giữ rõ trường hợp chưa có bằng chứng an toàn.

## 3. Nguồn để đo, giới hạn tài nguyên và can thiệp

| Nguồn | Điều cần kiểm chứng |
| --- | --- |
| [Metrics reference](https://docs.scylladb.com/manual/stable/reference/metrics.html) | Đơn vị/phạm vi pending tasks, backlog, normalized backlog; không tự quy đổi sang bytes. |
| [Heavy Compaction Advisor](https://monitoring.docs.scylladb.com/stable/use-monitoring/advisor/heavyCompaction.html) | Rủi ro khi chỉnh tài nguyên compaction; không lấy ví dụ static shares thành tuning mặc định. |
| [Disk space requirements](https://docs.scylladb.com/manual/stable/getting-started/system-requirements.html#disk-space) | Headroom phụ thuộc strategy; guidelines không thay phép tính peak của job thực tế. |
| [Snapshots and Disk Utilization](https://docs.scylladb.com/manual/stable/kb/disk-utilization.html) | Hard links có thể giữ blocks sau compaction. |
| [compactionstats](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/compactionstats.html) | Tiến độ công việc đang chạy. |
| [compactionhistory](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/compactionhistory.html) | Input/output và thông tin job đã hoàn tất; field phụ thuộc version. |
| [tablestats](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/tablestats.html) | Bối cảnh SSTable, space và hoạt động bảng. |
| [listsnapshots](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/listsnapshots.html) | Kiểm tra snapshot; không phải kiểm kê hoàn hảo mọi nguyên nhân giữ disk. |
| [compact](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/compact.html) | Phạm vi major compaction và flags chưa hỗ trợ. |
| [stop](https://docs.scylladb.com/manual/stable/operating-scylla/nodetool-commands/stop.html) | Dừng theo loại công việc; không giả định có `--id`. |
| [Nodetool alternatives cho Operator](https://operator.docs.scylladb.com/master/reference/nodetool-alternatives.html) | Ràng buộc khi dùng công cụ quản trị bên cạnh Operator; nguồn master phải đối chiếu release đang dùng. |

## 4. Những kết luận làm thay đổi thiết kế tài liệu

### Không đồng nhất mọi file nhỏ với ICS

Điểm cần học là thời điểm giải phóng input và bảo vệ dữ liệu qua crash.
Baseline lab publish cả batch, nên chưa thể dùng nó để chứng minh peak disk
giống ICS production. UC-02 giải thích điều khác biệt; UC-06 kiểm chứng đúng
protocol mà lab thực sự có.

### Không lấy elapsed TTL làm lệnh xoá file

Tách ba mốc: dữ liệu không còn hiển thị, được phép GC, và filesystem thực sự
trả blocks. UC-03 giải quyết retention layout; UC-05 giải quyết bằng chứng
an toàn; UC-04 xem reference và headroom. Ba vấn đề liên quan nhưng không
thay thế nhau.

### Không chọn strategy bằng số SSTable đơn lẻ

Phải nối file layout với query workload và chi phí tài nguyên. UC-01 định
nghĩa phép đo; UC-02 đưa ra giả thuyết; UC-06 đo cả chuyển đổi và steady state.
Giảm số file không tự chứng minh giảm latency hoặc tổng chi phí.

### Không đưa major compaction lên làm bước chữa bệnh mặc định

UC-06 yêu cầu lý do, target cụ thể, budget, guardrail và xác minh sau can thiệp.
Nó không khuyến nghị chạy major compaction định kỳ như một thủ tục bảo trì chung.

## 5. Đâu là nguồn, đâu là thiết kế và ví dụ của project?

- Các tên strategy, command và GC mode được đối chiếu nguồn phía trên.
- Bảng decision, observation record, budget worksheet, cách tổ chức thí nghiệm
  và guardrail là đề xuất của project, không phải API hoặc quy trình hỗ trợ
  chính thức của ScyllaDB.
- Các phép tính GiB, read fanout, tốc độ backlog và timeline là fixture học tập.
  Chúng không được đo từ cluster và không là capacity recommendation.
- Winner tuple, manifest, owner và WAL watermark thuộc mô hình Go ở Feature 02;
  không mô tả đầy đủ cell/range tombstone semantics hoặc metadata của ScyllaDB.
- Kiểm tra Markdown, liên kết và số học không thay thế benchmark, fault
  injection hoặc validation trên đúng version sản phẩm.

## 6. Phạm vi 80/20 sau khi gộp

Giữ: chẩn đoán → chọn strategy → retention → budget → purge safety → kiểm chứng.
Hạ xuống phụ lục: heap merge, tie-break và API reducer.
Lược bỏ khỏi đường chính: generic policy plugin framework, liệt kê mọi knob,
full ICS implementation, tự điều khiển scheduler ScyllaDB.

[Quay lại Feature 03](../feature/03-read-merge-and-basic-compaction.md).
