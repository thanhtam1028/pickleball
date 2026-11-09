import { firestore } from './firebase.js';
import { CROSS_CLASS } from './core/pairing.js';

export { CROSS_CLASS };

// Giải thật. Đổi mã này để tổ chức giải mới mà dữ liệu giải cũ vẫn giữ nguyên.
export const MAIN_EVENT_ID = 'dai-chien-ceo';
// Giải thử: bộ dữ liệu riêng để ban tổ chức tập dượt, không ảnh hưởng giải thật.
export const TEST_EVENT_ID = 'giai-thu';
const EVENT_KEY = 'pickleball-event';

function readEventId() {
  try {
    return localStorage.getItem(EVENT_KEY) === TEST_EVENT_ID ? TEST_EVENT_ID : MAIN_EVENT_ID;
  } catch {
    return MAIN_EVENT_ID;
  }
}

// Mỗi trình duyệt tự chọn đang xem giải nào; mặc định là giải thật.
export const EVENT_ID = readEventId();
export const isTestEvent = () => EVENT_ID === TEST_EVENT_ID;

export function switchEvent(id) {
  try {
    if (id === TEST_EVENT_ID) localStorage.setItem(EVENT_KEY, id); else localStorage.removeItem(EVENT_KEY);
  } catch { /* trình duyệt chặn lưu thì vẫn ở giải thật */ }
  location.hash = '#/';
  location.reload();
}

export const CLASSES = ['CEO 110', 'CEO 111'];

export const eventDoc = (fs) => fs.doc(fs.db, 'events', EVENT_ID);
export const sub = (fs, name) => fs.collection(fs.db, 'events', EVENT_ID, name);
export const subDoc = (fs, name, id) => fs.doc(fs.db, 'events', EVENT_ID, name, id);

const withId = (d) => ({ id: d.id, ...d.data() });

export function watchList(fs, name, cb) {
  return fs.onSnapshot(sub(fs, name), (snap) => cb(snap.docs.map(withId)), (err) => console.error(name, err));
}

export function watchEvent(fs, cb) {
  return fs.onSnapshot(eventDoc(fs), (snap) => cb(snap.exists() ? snap.data() : null), (err) => console.error(err));
}

// Trang chỉ dành cho ban tổ chức: trả về Firestore, hoặc hiện lời nhắc và trả về null.
export function requireAdmin(el, session) {
  if (session.role !== 'admin') {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chỉ ban tổ chức mới dùng được trang này. Vào mục Thêm để đăng nhập.</p></div>');
    return null;
  }
  const fs = firestore();
  if (!fs) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>');
    return null;
  }
  return fs;
}

// Chạy một thao tác ghi, báo lỗi dễ hiểu nếu không lưu được.
export async function save(fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    alert(`Không lưu được: ${err.message}`);
    return false;
  }
}
