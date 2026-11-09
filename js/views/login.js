import { esc } from '../dom.js';
import { ROLE_LABEL, signInWithAccount } from '../firebase.js';

// Trang đăng nhập: Google hoặc tên đăng nhập và mật khẩu do ban tổ chức cấp.
// Nút "Đăng nhập" ở góc trên và ở trang Thêm đều dẫn về đây.
export function render(el, { session }) {
  if (!session.configured) {
    el.innerHTML = '<h1>Đăng nhập</h1><div class="card"><p class="muted">Chế độ xem thử: chưa nối Firebase nên chưa đăng nhập được.</p></div>';
    return null;
  }
  if (!session.ready) {
    el.innerHTML = '<h1>Đăng nhập</h1><p class="muted">Đang kết nối…</p>';
    return null;
  }
  if (session.user) {
    // Đã đăng nhập xong thì về trang chủ; người đang chờ duyệt ở lại để đọc thông báo.
    if (session.role !== 'pending') {
      location.hash = '#/';
      return null;
    }
    el.innerHTML = `<h1>Đăng nhập</h1><div class="card stack">
      <p>Xin chào <b>${esc(session.user.name)}</b>. Tài khoản đang <b>chờ ban tổ chức duyệt</b> (${esc(ROLE_LABEL.pending)}). Sau khi được duyệt, tải lại trang.</p>
      <div class="btn-row"><button class="btn btn-ghost" data-action="sign-out">Đăng xuất</button></div></div>`;
    return null;
  }

  el.innerHTML = `
    <h1>Đăng nhập</h1>
    <div class="login-grid">
      <section class="card stack">
        <h2>Tên đăng nhập và mật khẩu</h2>
        <p class="muted">Dùng tài khoản do ban tổ chức cấp cho bạn.</p>
        <form class="login-form" id="account-login" autocomplete="on">
          <label class="field"><span class="field-label">Tên đăng nhập</span>
            <input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></label>
          <label class="field"><span class="field-label">Mật khẩu</span>
            <input name="password" type="password" autocomplete="current-password" required></label>
          <p class="note" id="login-err" hidden></p>
          <button class="btn" type="submit">Đăng nhập</button>
        </form>
      </section>
      <section class="card stack">
        <h2>Tài khoản Google</h2>
        <p class="muted">Ban tổ chức và trọng tài có tài khoản Google đã được duyệt đăng nhập ở đây. Lần đầu đăng nhập, bạn sẽ nằm trong danh sách chờ để ban tổ chức duyệt.</p>
        <button class="btn btn-ghost" data-action="sign-in">Đăng nhập bằng Google</button>
      </section>
    </div>
    <p class="muted small">Khán giả chỉ xem kết quả thì không cần đăng nhập.</p>`;

  el.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id !== 'account-login') return;
    e.preventDefault();
    const err = el.querySelector('#login-err');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    const msg = await signInWithAccount(f.elements.username.value, f.elements.password.value);
    btn.disabled = false;
    err.textContent = msg || '';
    err.hidden = !msg;
  });
  return null;
}
