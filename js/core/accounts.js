// Quy tắc cho tài khoản đăng nhập bằng tên đăng nhập và mật khẩu. Hàm thuần, không đụng Firebase.
// Firebase Authentication cần địa chỉ email, nên tên đăng nhập được đổi thành một email giả
// chỉ dùng nội bộ; không ai nhận thư ở địa chỉ này.

export const ACCOUNT_DOMAIN = 'taikhoan.pickleball.local';
export const MIN_PASSWORD = 8;

export function normalizeUsername(value) {
  return String(value ?? '').trim().toLowerCase();
}

export const usernameToEmail = (username) => `${normalizeUsername(username)}@${ACCOUNT_DOMAIN}`;

export const isAccountEmail = (email) => String(email ?? '').endsWith(`@${ACCOUNT_DOMAIN}`);

export const emailToUsername = (email) => String(email ?? '').replace(`@${ACCOUNT_DOMAIN}`, '');

// Trả về chuỗi lỗi tiếng Việt, hoặc null nếu hợp lệ.
export function validateUsername(value) {
  const u = normalizeUsername(value);
  if (!/^[a-z0-9._-]{3,30}$/.test(u)) return 'Tên đăng nhập gồm 3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
  return null;
}

const WEAK = ['admin', 'password', 'matkhau', 'qwerty', 'abc123', '12345678', '123456789', '1234567890', '11111111', 'pickleball', 'iloveyou'];

export function validatePassword(password, username = '') {
  const p = String(password ?? '');
  const u = normalizeUsername(username);
  if (p.length < MIN_PASSWORD) return `Mật khẩu cần ít nhất ${MIN_PASSWORD} ký tự.`;
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Mật khẩu cần có cả chữ và số.';
  const lower = p.toLowerCase();
  if (u && lower.includes(u)) return 'Mật khẩu không được chứa tên đăng nhập.';
  if (WEAK.some((w) => lower.includes(w))) return 'Mật khẩu này quá dễ đoán. Hãy chọn mật khẩu khác hoặc dùng nút tạo ngẫu nhiên.';
  return null;
}

// Mật khẩu ngẫu nhiên dễ đọc: bỏ các ký tự dễ nhầm (0/O, 1/l/I). Nhận hàm sinh số ngẫu nhiên để test được.
export function generatePassword(length = 12, randomInt = defaultRandomInt) {
  const letters = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function defaultRandomInt(max) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}

// Lỗi Firebase sang lời nhắn dễ hiểu.
export function authErrorText(code) {
  return {
    'auth/invalid-credential': 'Sai tên đăng nhập hoặc mật khẩu.',
    'auth/wrong-password': 'Sai tên đăng nhập hoặc mật khẩu.',
    'auth/user-not-found': 'Sai tên đăng nhập hoặc mật khẩu.',
    'auth/too-many-requests': 'Thử sai quá nhiều lần. Đợi vài phút rồi thử lại.',
    'auth/email-already-in-use': 'Tên đăng nhập này đã có người dùng. Chọn tên khác.',
    'auth/weak-password': 'Mật khẩu quá yếu.',
    'auth/operation-not-allowed': 'Đăng nhập bằng tài khoản chưa được bật trên Firebase.',
    'auth/network-request-failed': 'Mất mạng. Kiểm tra kết nối rồi thử lại.',
    'auth/requires-recent-login': 'Hãy đăng xuất, đăng nhập lại rồi đổi mật khẩu.',
  }[code] || 'Không thực hiện được. Thử lại sau.';
}
