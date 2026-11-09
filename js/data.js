import { firestore } from './firebase.js';
import { CROSS_CLASS } from './core/pairing.js';

export { CROSS_CLASS };

// Website hiện phục vụ một giải. Đổi EVENT_ID để tổ chức giải mới mà dữ liệu giải cũ vẫn giữ nguyên.
export const EVENT_ID = 'dai-chien-ceo';
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
