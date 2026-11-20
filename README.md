# IELTS Shadowing Lab

Ứng dụng web chạy trên trình duyệt (React + TypeScript + Vite), không cần tài khoản hay backend.

## Chạy

```bash
npm install
npm run dev        # chạy thử
npm run build      # kiểm tra kiểu và build bản production (dist/)
npm test           # unit test: điểm shadowing, parser transcript, mốc audio
```

## Thêm bài mới (giáo viên)

1. Mở tab **Tạo bài luyện**.
2. Điền tiêu đề, độ khó, Part, trọng tâm, cụm từ giao tiếp và câu hỏi IELTS.
3. Chọn một trong hai cách:
   - **Dán transcript**: mỗi dòng là một câu. Muốn bật tự chấm, thêm gợi ý theo dạng
     `Câu đầy đủ || cụm 1 / cụm 2 / cụm 3 || TỪ_CẦN_NHẤN`.
   - **Dùng file audio hoặc video**: chọn file (video chỉ dùng phần âm thanh; nên dùng clip giọng người thật), nhập mốc bắt đầu/kết thúc (giây) cho từng câu, rồi tick xác nhận giọng Anh–Mỹ.
4. Bấm **Lưu bài**. Bài được lưu trên thiết bị này.

## Giới hạn

- Dữ liệu (bài, tiến độ, điểm) lưu trong trình duyệt của từng thiết bị; không đồng bộ giữa các máy.
- Bản thu của học sinh chỉ giữ trong phiên hiện tại, không tải lên máy chủ.
- File audio/video của giáo viên lưu trong IndexedDB. File trên 150 MB có thể không lưu được; nên cắt clip ngắn. Nếu trình duyệt không giữ được, ứng dụng sẽ báo khi lưu bài.
- Giọng đọc tổng hợp phụ thuộc giọng en-US mà hệ điều hành cung cấp. Nếu thiết bị không có, transcript vẫn dùng được.
- Điểm tự đánh giá chỉ là công cụ luyện shadowing, không quy đổi thành IELTS band.
