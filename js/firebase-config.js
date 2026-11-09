// Cấu hình dự án Firebase. Dán đoạn "firebaseConfig" lấy từ Firebase Console vào đây
// (xem docs/pickleball-huong-dan.md). Đoạn này là công khai theo thiết kế của Firebase;
// quyền ghi dữ liệu được bảo vệ bởi firestore.rules, không phải bởi việc giấu cấu hình.
// Để null thì website chạy ở chế độ xem thử: xem được giao diện, chưa đăng nhập hay lưu dữ liệu.
export const firebaseConfig = {
  apiKey: 'AIzaSyCTAWpr1KQLv-4HWygU1abY7p0wESYD9kg',
  authDomain: 'dai-chien-ceo-pickleball.firebaseapp.com',
  projectId: 'dai-chien-ceo-pickleball',
  storageBucket: 'dai-chien-ceo-pickleball.firebasestorage.app',
  messagingSenderId: '863991892332',
  appId: '1:863991892332:web:118a8e211242e52b33cb49',
};

// Tài khoản Google luôn là ban tổ chức (admin). Phải trùng với email trong firestore.rules.
export const ADMIN_EMAIL = 'tcaoadm@gmail.com';
