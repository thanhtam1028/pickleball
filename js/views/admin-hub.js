import { esc, icon } from '../dom.js';
import { ROLE_LABEL, firestore, changeMyPassword } from '../firebase.js';
import { validatePassword } from '../core/accounts.js';
import { isTestEvent, switchEvent, MAIN_EVENT_ID, TEST_EVENT_ID, sub, eventDoc, save } from '../data.js';
import * as login from './login.js';

const ADMIN_LINKS = [
  ['#/cai-dat', 'Cài đặt giải'],
  ['#/nguoi-choi', 'Người chơi và cặp'],
  ['#/xep-lich', 'Xếp lịch và điều hành sân'],
  ['#/phan-quyen', 'Phân quyền và tạo tài khoản'],
];
const REFEREE_LINKS = [['#/san-cua-toi', 'Sân của tôi (bấm điểm)']];

const list = (links) => `<ul class="list">${links.map(([href, label]) => `
  <li><a class="list-item" href="${href}"><span>${esc(label)}</span><span class="chev">›</span></a></li>`).join('')}</ul>`;

// Nút "Quản trị" trên menu: chưa đăng nhập thì là trang đăng nhập, đăng nhập rồi thì là bảng quản lý theo quyền.
export function render(el, ctx) {
  const { session } = ctx;
  if (!session.user) return login.render(el, ctx);

  const role = session.role;
  const isAdmin = role === 'admin';
  const isReferee = role === 'referee';

  if (role === 'pending') {
    el.innerHTML = `<h1>Quản trị</h1><div class="card stack">
      <p>Xin chào <b>${esc(session.user.name)}</b>. Tài khoản đang <b>chờ ban tổ chức duyệt</b>. Sau khi được duyệt, tải lại trang.</p>
      <div class="btn-row"><button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button></div></div>`;
    return null;
  }

  el.innerHTML = `
    <div class="stack">
      <h1>Quản trị</h1>
      <section class="card stack">
        <h2>Tài khoản</h2>
        <p>Xin chào <b>${esc(session.user.name)}</b> · ${esc(ROLE_LABEL[role] || role)}</p>
        <div class="btn-row"><button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button></div>
        ${session.user.username ? `
        <details class="add-box"><summary>Đổi mật khẩu</summary>
          <form class="login-form" id="change-pw" autocomplete="off">
            <label class="field"><span class="field-label">Mật khẩu hiện tại</span><input name="current" type="password" autocomplete="current-password" required></label>
            <label class="field"><span class="field-label">Mật khẩu mới</span><input name="next" type="password" autocomplete="new-password" required></label>
            <p class="note" id="pw-msg" hidden></p>
            <button class="btn" type="submit">Đổi mật khẩu</button>
          </form></details>` : ''}
      </section>
      ${isAdmin ? `<section class="card"><h2>Ban tổ chức</h2>${list(ADMIN_LINKS)}</section>` : ''}
      <section class="card"><h2>Trợ giúp</h2>${list([['huong-dan.html', 'Hướng dẫn sử dụng (có hình, từng bước)']])}</section>
      ${isAdmin || isReferee ? `<section class="card"><h2>Trọng tài</h2>${list(REFEREE_LINKS)}</section>` : ''}
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
    if (f.id !== 'change-pw') return;
    e.preventDefault();
    const box = el.querySelector('#pw-msg');
    const show = (text) => { box.textContent = text; box.hidden = false; };
    const weak = validatePassword(f.elements.next.value, session.user.username);
    if (weak) return show(weak);
    const msg = await changeMyPassword(f.elements.current.value, f.elements.next.value);
    show(msg || 'Đã đổi mật khẩu.');
    if (!msg) f.reset();
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
  return null;
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
