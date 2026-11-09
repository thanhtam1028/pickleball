import { esc, icon } from '../dom.js';
import { ROLE_LABEL, firestore, changeMyPassword } from '../firebase.js';
import { validatePassword } from '../core/accounts.js';
import { isTestEvent, switchEvent, MAIN_EVENT_ID, TEST_EVENT_ID, sub, eventDoc, save } from '../data.js';

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
    account = `<p class="muted">Ban tổ chức và trọng tài đăng nhập bằng tên đăng nhập hoặc Google. Khán giả không cần đăng nhập.</p>
      <a class="btn" href="#/dang-nhap">Đăng nhập</a>`;
  } else if (role === 'pending') {
    account = `<p>Xin chào <b>${esc(session.user.name)}</b>. Tài khoản đang <b>chờ ban tổ chức duyệt</b>. Sau khi được duyệt, tải lại trang.</p>
      <button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button>`;
  } else {
    account = `<p>Xin chào <b>${esc(session.user.name)}</b> · ${esc(ROLE_LABEL[role])}</p>
      <div class="btn-row"><button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button></div>
      ${session.user.username ? `
      <details class="add-box" style="margin-top:12px"><summary>Đổi mật khẩu</summary>
        <form class="login-form" id="change-pw" autocomplete="off">
          <label class="field"><span class="field-label">Mật khẩu hiện tại</span><input name="current" type="password" autocomplete="current-password" required></label>
          <label class="field"><span class="field-label">Mật khẩu mới</span><input name="next" type="password" autocomplete="new-password" required></label>
          <p class="note" id="pw-msg" hidden></p>
          <button class="btn" type="submit">Đổi mật khẩu</button>
        </form></details>` : ''}`;
  }

  el.innerHTML = `
    <div class="stack">
      <h1>Thêm</h1>
      <section class="card"><h2>Tài khoản</h2>${account}</section>
      <section class="card"><h2>Ban tổ chức</h2>${list(ADMIN_LINKS, !isAdmin)}</section>
      <section class="card"><h2>Trọng tài</h2>${list(REFEREE_LINKS, !isReferee)}</section>
      <section class="card"><h2>Cho mọi người</h2>${list(PUBLIC_LINKS, false)}</section>
      ${isAdmin ? `<section class="card stack">
        <h2>Giải thử</h2>
        <p class="muted">Một bộ dữ liệu riêng để tập dượt: nạp người chơi mẫu, xếp lịch, bấm điểm thử mà không ảnh hưởng giải thật. Chỉ trình duyệt này chuyển sang giải thử.</p>
        ${isTestEvent()
          ? `<div class="btn-row"><button class="btn" data-event="main">Về giải thật</button>
             <button class="btn btn-danger" data-event="wipe">Xóa toàn bộ dữ liệu giải thử</button></div>`
          : '<button class="btn btn-ghost" data-event="test">Chuyển sang giải thử</button>'}
      </section>` : ''}
    </div>`;

  el.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id === 'change-pw') {
      e.preventDefault();
      const box = el.querySelector('#pw-msg');
      const show = (text) => { box.textContent = text; box.hidden = false; };
      const weak = validatePassword(f.elements.next.value, session.user.username);
      if (weak) return show(weak);
      const msg = await changeMyPassword(f.elements.current.value, f.elements.next.value);
      show(msg || 'Đã đổi mật khẩu.');
      if (!msg) f.reset();
    }
  });

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-event]')?.dataset.event;
    if (act === 'test') switchEvent(TEST_EVENT_ID);
    if (act === 'main') switchEvent(MAIN_EVENT_ID);
    if (act === 'wipe' && isTestEvent() && confirm('Xóa toàn bộ người chơi, cặp, trận, phiếu của GIẢI THỬ?')) {
      const btn = e.target.closest('button');
      btn.disabled = true;
      btn.textContent = 'Đang xóa…';
      await save(() => wipeTestEvent(firestore()));
      btn.textContent = 'Đã xóa';
    }
  });
}

// Xóa sạch giải thử (kể cả nhật ký từng pha). Chỉ chạy khi đang ở giải thử.
async function wipeTestEvent(fs) {
  if (!isTestEvent()) return;
  const refs = [];
  for (const name of ['players', 'teams', 'votes']) {
    (await fs.getDocs(sub(fs, name))).docs.forEach((d) => refs.push(d.ref));
  }
  for (const m of (await fs.getDocs(sub(fs, 'matches'))).docs) {
    (await fs.getDocs(fs.collection(fs.db, m.ref.path, 'rallies'))).docs.forEach((d) => refs.push(d.ref));
    refs.push(m.ref);
  }
  refs.push(eventDoc(fs));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = fs.writeBatch(fs.db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}
