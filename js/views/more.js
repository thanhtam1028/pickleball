import { esc, icon } from '../dom.js';
import { ROLE_LABEL } from '../firebase.js';

const ADMIN_LINKS = [
  ['#/cai-dat', 'Cài đặt giải'],
  ['#/nguoi-choi', 'Người chơi và cặp'],
  ['#/xep-lich', 'Xếp lịch và điều hành sân'],
  ['#/phan-quyen', 'Phân quyền'],
];
const REFEREE_LINKS = [['#/san-cua-toi', 'Sân của tôi (bấm điểm)']];
const PUBLIC_LINKS = [
  ['#/luat', 'Luật cho người mới'],
  ['#/tv', 'Màn hình TV'],
  ['#/qr', 'Mã QR cho sân'],
  ['#/binh-chon', 'Bình chọn MVP'],
  ['#/xuat', 'Xuất kết quả'],
];

function list(links, locked) {
  return `<ul class="list">${links.map(([href, label]) => `
    <li><a class="list-item" href="${href}">
      <span>${esc(label)}</span>
      ${locked ? `<span class="pill">${icon('lock').replace('<svg', '<svg width="12" height="12"')} Cần quyền</span>` : '<span class="chev">›</span>'}
    </a></li>`).join('')}</ul>`;
}

export function render(el, { session }) {
  const role = session.role;
  const isAdmin = role === 'admin';
  const isReferee = role === 'referee' || isAdmin;

  let account;
  if (!session.configured) {
    account = '<p class="muted">Chế độ xem thử: chưa nối Firebase nên chưa đăng nhập được.</p>';
  } else if (!session.user) {
    account = `<p class="muted">Ban tổ chức và trọng tài đăng nhập bằng Google. Khán giả không cần đăng nhập.</p>
      <button class="btn" data-action="sign-in">Đăng nhập bằng Google</button>`;
  } else if (role === 'pending') {
    account = `<p>Xin chào <b>${esc(session.user.name)}</b>. Tài khoản đang <b>chờ ban tổ chức duyệt</b>. Sau khi được duyệt, tải lại trang.</p>`;
  } else {
    account = `<p>Xin chào <b>${esc(session.user.name)}</b> · ${esc(ROLE_LABEL[role])}</p>
      <button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button>`;
  }

  el.innerHTML = `
    <div class="stack">
      <h1>Thêm</h1>
      <section class="card"><h2>Tài khoản</h2>${account}</section>
      <section class="card"><h2>Ban tổ chức</h2>${list(ADMIN_LINKS, !isAdmin)}</section>
      <section class="card"><h2>Trọng tài</h2>${list(REFEREE_LINKS, !isReferee)}</section>
      <section class="card"><h2>Cho mọi người</h2>${list(PUBLIC_LINKS, false)}</section>
    </div>`;
}
