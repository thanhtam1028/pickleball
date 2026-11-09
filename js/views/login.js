import { esc } from '../dom.js';
import { signInWithAccount } from '../firebase.js';

// Phần đăng nhập của nút "Quản trị": tên đăng nhập và mật khẩu do ban tổ chức cấp, hoặc Google.
// Chỉ được gọi khi chưa đăng nhập; trang Quản trị (admin-hub.js) lo phần đã đăng nhập.
export function render(el, { session }) {
  if (!session.configured) {
    el.innerHTML = '<h1>Đăng nhập</h1><div class="card"><p class="muted">Chế độ xem thử: chưa nối Firebase nên chưa đăng nhập được.</p></div>';
    return null;
  }
  if (!session.ready) {
    el.innerHTML = '<h1>Đăng nhập</h1><p class="muted">Đang kết nối…</p>';
    return null;
  }
  el.innerHTML = `
    <h1>Quản trị: đăng nhập</h1>
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
    <p class="muted small">Khán giả chỉ xem kết quả thì không cần đăng nhập.</p>
    <p><a class="btn btn-ghost" href="huong-dan.html">Hướng dẫn sử dụng (có hình, từng bước)</a></p>`;

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
