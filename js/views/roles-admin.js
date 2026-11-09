import { esc } from '../dom.js';
import { firestore, ROLE_LABEL } from '../firebase.js';

// Ban tổ chức duyệt người vừa đăng nhập thành trọng tài hoặc ban tổ chức, và thu hồi quyền.
// Việc phân trọng tài vào sân làm ở giai đoạn 2.
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
          <span><b>${esc(r.name)}</b><br><span class="muted">${esc(r.email)} · ${esc(ROLE_LABEL[r.role] || r.role)}</span></span>
          <button class="btn btn-ghost btn-small" data-revoke="${esc(r.id)}">Thu hồi</button>
        </li>`).join('')
      : '<p class="muted">Chưa duyệt ai.</p>';

    body.innerHTML = `
      <section class="card"><h2>Đang chờ duyệt</h2><ul class="list">${pendingHtml}</ul></section>
      <section class="card"><h2>Đã có quyền</h2><ul class="list">${rolesHtml}</ul></section>`;
  }

  async function approve(id, role) {
    const p = pending.find((x) => x.id === id);
    if (!p) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'roles', id), { role, name: p.name, email: p.email, court: null });
    batch.delete(doc(db, 'pendingRoles', id));
    await batch.commit();
  }

  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
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
