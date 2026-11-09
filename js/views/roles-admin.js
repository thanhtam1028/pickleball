import { esc } from '../dom.js';
import { firestore, ROLE_LABEL, createManagedAccount } from '../firebase.js';
import { validateUsername, validatePassword, generatePassword, normalizeUsername, MIN_PASSWORD } from '../core/accounts.js';

// Ban tổ chức duyệt người vừa đăng nhập, tạo tài khoản tên đăng nhập và mật khẩu cho người khác, và thu hồi quyền.
export function render(el, { session }) {
  el.innerHTML = '<h1>Phân quyền</h1>';
  const body = document.createElement('div');
  body.className = 'stack';
  el.append(body);

  if (session.role !== 'admin') {
    body.innerHTML = '<div class="card"><p class="muted">Chỉ ban tổ chức mới xem được trang này.</p></div>';
    return null;
  }
  const fs = firestore();
  if (!fs) {
    body.innerHTML = '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>';
    return null;
  }
  const { db, collection, doc, onSnapshot, writeBatch, deleteDoc } = fs;

  let pending = [];
  let roles = [];
  let created = null; // thông tin tài khoản vừa tạo, hiện một lần để gửi cho người dùng
  let formError = '';
  let busy = false;
  const keep = { name: '', username: '', password: '', role: 'admin' };

  function draw() {
    const pendingHtml = pending.length
      ? pending.map((p) => `
        <li class="list-item">
          <span><b>${esc(p.name)}</b><br><span class="muted">${esc(p.email)}</span></span>
          <span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-small" data-approve="${esc(p.id)}" data-role="referee">Trọng tài</button>
            <button class="btn btn-small" data-approve="${esc(p.id)}" data-role="admin">Ban tổ chức</button>
            <button class="btn btn-ghost btn-small" data-reject="${esc(p.id)}">Từ chối</button>
          </span>
        </li>`).join('')
      : '<p class="muted">Không có ai đang chờ.</p>';

    const rolesHtml = roles.length
      ? roles.map((r) => `
        <li class="list-item">
          <span><b>${esc(r.name)}</b><br><span class="muted">${r.username ? `Tên đăng nhập: ${esc(r.username)}` : esc(r.email)} · ${esc(ROLE_LABEL[r.role] || r.role)}</span></span>
          <button class="btn btn-ghost btn-small" data-revoke="${esc(r.id)}">Thu hồi</button>
        </li>`).join('')
      : '<p class="muted">Chưa duyệt ai.</p>';

    const createdHtml = created ? `
      <div class="note created-box">
        <b>Đã tạo tài khoản ${esc(ROLE_LABEL[created.role])}.</b> Gửi thông tin này cho người dùng. Mật khẩu chỉ hiện ở đây một lần, rời trang là mất.
        <dl class="cred">
          <dt>Địa chỉ</dt><dd>${esc(location.origin)}</dd>
          <dt>Tên đăng nhập</dt><dd><code>${esc(created.username)}</code></dd>
          <dt>Mật khẩu</dt><dd><code>${esc(created.password)}</code></dd>
        </dl>
        <div class="btn-row"><button class="btn btn-small" data-copy-cred>Chép thông tin</button>
          <button class="btn btn-ghost btn-small" data-close-created>Đã gửi, ẩn đi</button></div>
      </div>` : '';

    body.innerHTML = `
      <section class="card"><h2>Đang chờ duyệt</h2><ul class="list">${pendingHtml}</ul></section>
      <section class="card stack">
        <h2>Tạo tài khoản quản lý</h2>
        <p class="muted">Tạo tài khoản đăng nhập bằng tên và mật khẩu cho người không dùng Google. Bạn đặt mật khẩu (hoặc để website tạo ngẫu nhiên) rồi gửi cho họ.</p>
        ${createdHtml}
        <form class="stack" id="create-account" autocomplete="off">
          <label class="field"><span class="field-label">Tên hiển thị</span>
            <input name="name" required maxlength="40" placeholder="Ví dụ: Cô Lan, lớp trưởng CEO 111" value="${esc(keep.name)}"></label>
          <label class="field"><span class="field-label">Tên đăng nhập</span>
            <input name="username" required maxlength="30" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="ví dụ: colan" value="${esc(keep.username)}">
            <span class="field-help">3–30 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.</span></label>
          <label class="field"><span class="field-label">Mật khẩu</span>
            <span class="pw-row"><input name="password" type="text" required minlength="${MIN_PASSWORD}" autocomplete="off" spellcheck="false" value="${esc(keep.password)}">
              <button type="button" class="btn btn-ghost btn-small" data-gen-pw>Tạo ngẫu nhiên</button></span>
            <span class="field-help">Ít nhất ${MIN_PASSWORD} ký tự, có cả chữ và số, không chứa tên đăng nhập. Mật khẩu dễ đoán như "admin" sẽ bị từ chối.</span></label>
          <label class="field"><span class="field-label">Quyền</span>
            <select name="role">
              <option value="admin" ${keep.role === 'admin' ? 'selected' : ''}>Ban tổ chức (toàn quyền)</option>
              <option value="referee" ${keep.role === 'referee' ? 'selected' : ''}>Trọng tài (chỉ bấm điểm ở sân được phân)</option>
            </select></label>
          ${formError ? `<p class="note">${esc(formError)}</p>` : ''}
          <button class="btn" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
        </form>
      </section>
      <section class="card"><h2>Đã có quyền</h2><ul class="list">${rolesHtml}</ul>
        <p class="muted small">Thu hồi chỉ gỡ quyền: tên đăng nhập đó không còn vào được các trang quản lý, nhưng vẫn không thể tạo lại cùng tên. Muốn cấp lại, tạo tài khoản với tên đăng nhập khác.</p></section>`;
  }

  async function approve(id, role) {
    const p = pending.find((x) => x.id === id);
    if (!p) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'roles', id), { role, name: p.name, email: p.email, court: null });
    batch.delete(doc(db, 'pendingRoles', id));
    await batch.commit();
  }

  // Giữ nội dung đang gõ khi trang vẽ lại (dữ liệu vừa đổi).
  body.addEventListener('input', (e) => {
    if (e.target.form?.id === 'create-account') keep[e.target.name] = e.target.value;
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const name = keep.name.trim();
    const username = normalizeUsername(keep.username);
    const password = keep.password;
    formError = validateUsername(username) || validatePassword(password, username) || (name ? '' : 'Nhập tên hiển thị.');
    if (!formError && roles.some((r) => r.username === username)) formError = 'Tên đăng nhập này đã có người dùng. Chọn tên khác.';
    if (formError) { draw(); return; }
    busy = true;
    draw();
    const res = await createManagedAccount({ username, password, name, role: keep.role });
    busy = false;
    if (res.error) {
      formError = res.error;
    } else {
      created = { username, password, role: keep.role };
      Object.assign(keep, { name: '', username: '', password: '' });
    }
    draw();
  });

  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.genPw !== undefined) {
      keep.password = generatePassword(12);
      draw();
      return;
    }
    if (t.dataset.closeCreated !== undefined) { created = null; draw(); return; }
    if (t.dataset.copyCred !== undefined) {
      const text = `Địa chỉ: ${location.origin}\nTên đăng nhập: ${created.username}\nMật khẩu: ${created.password}`;
      try { await navigator.clipboard.writeText(text); t.textContent = 'Đã chép'; } catch { t.textContent = 'Không chép được, hãy chọn và chép tay'; }
      return;
    }
    try {
      if (t.dataset.approve) await approve(t.dataset.approve, t.dataset.role);
      if (t.dataset.reject) await deleteDoc(doc(db, 'pendingRoles', t.dataset.reject));
      if (t.dataset.revoke && confirm('Thu hồi quyền của người này?')) await deleteDoc(doc(db, 'roles', t.dataset.revoke));
    } catch (err) {
      alert(`Không lưu được: ${err.message}`);
    }
  });

  const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const unsubs = [
    onSnapshot(collection(db, 'pendingRoles'), (s) => { pending = toList(s); draw(); }),
    onSnapshot(collection(db, 'roles'), (s) => { roles = toList(s); draw(); }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
