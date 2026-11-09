import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent, watchList, eventDoc, sub, subDoc, save, CLASSES } from '../data.js';
import { tallyVotes } from '../core/votes.js';

const STATUS = { closed: 'Chưa mở', open: 'Đang mở', finished: 'Đã công bố' };

// Bình chọn sau giải: cầu thủ xuất sắc (MVP) và giải chơi đẹp (fair-play).
// Ban tổ chức mở và đóng cổng; mỗi tài khoản Google một phiếu; không bầu cho chính mình.
export function render(el, { session }) {
  el.innerHTML = '<h1>Bình chọn</h1>';
  const fs = firestore();
  if (!fs) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>');
    return null;
  }
  const isAdmin = session.role === 'admin';
  const uid = session.user?.uid;
  let event = null;
  let players = [];
  let myVote;
  let voteCount = null;
  const body = document.createElement('div');
  body.className = 'stack';
  el.append(body);

  const status = () => event?.voting?.status || 'closed';
  const options = (selected, exclude) => `<option value="">Chọn người</option>${CLASSES.map((c) => `
    <optgroup label="${esc(c)}">${players.filter((p) => p.cls === c && p.id !== exclude).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
      .map((p) => `<option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('')}`;

  function resultsHtml(r) {
    if (!r) return '';
    const list = (items) => (items.length ? `<ol class="vote-results">${items.map((x, i) => `<li class="${i === 0 ? 'top' : ''}"><b>${esc(x.name)}</b> · ${x.count} phiếu</li>`).join('')}</ol>` : '<p class="muted">Chưa có phiếu.</p>');
    return `<section class="card"><h2>Kết quả (${r.total} phiếu)</h2>
      <div class="grid"><div><h3>Cầu thủ xuất sắc</h3>${list(r.mvp)}</div><div><h3>Giải chơi đẹp</h3>${list(r.fairplay)}</div></div></section>`;
  }

  function voteForm() {
    if (!session.user) {
      return `<p>Đăng nhập bằng Google để bình chọn. Mỗi tài khoản được bầu một lần.</p>
        <button class="btn" data-action="sign-in">Đăng nhập bằng Google</button>`;
    }
    if (myVote === undefined) return '<p class="muted">Đang kiểm tra phiếu của bạn…</p>';
    if (myVote) return '<p><b>Cảm ơn bạn đã bình chọn!</b> Kết quả sẽ hiện khi ban tổ chức đóng cổng.</p>';
    return `<form class="stack" id="vote-form">
      <label class="field"><span class="field-label">Bạn là ai?</span>
        <select name="me"><option value="">Tôi không thi đấu</option>${options('', null).replace('<option value="">Chọn người</option>', '')}</select>
        <span class="field-help">Để website không cho bạn tự bầu cho mình.</span></label>
      <label class="field"><span class="field-label">Cầu thủ xuất sắc (MVP)</span><select name="mvp" required>${options('', null)}</select></label>
      <label class="field"><span class="field-label">Giải chơi đẹp (fair-play)</span><select name="fairplay" required>${options('', null)}</select>
        <span class="field-help">Người tôn trọng đối thủ, trọng tài và luật chơi nhất.</span></label>
      <p class="note" id="vote-err" hidden></p>
      <button class="btn" type="submit">Gửi phiếu</button>
    </form>`;
  }

  function adminHtml() {
    if (!isAdmin) return '';
    return `<section class="card">
      <h2>Ban tổ chức</h2>
      <p>Trạng thái: <b>${STATUS[status()]}</b>${voteCount !== null ? ` · đã có ${voteCount} phiếu` : ''}</p>
      <div class="btn-row">
        ${status() !== 'open' ? '<button class="btn" data-vote="open">Mở bình chọn</button>' : ''}
        ${status() === 'open' ? '<button class="btn" data-vote="finish">Đóng và công bố kết quả</button>' : ''}
        ${status() === 'finished' ? '<button class="btn btn-ghost" data-vote="hide">Ẩn kết quả, đóng cổng</button>' : ''}
      </div></section>`;
  }

  function draw() {
    const st = status();
    body.innerHTML = `
      ${adminHtml()}
      ${st === 'open' ? `<section class="card"><h2>Bình chọn đang mở</h2>${voteForm()}</section>` : ''}
      ${st === 'closed' ? '<section class="card"><p class="muted">Ban tổ chức chưa mở bình chọn. Cổng thường mở sau trận chung kết.</p></section>' : ''}
      ${st === 'finished' ? resultsHtml(event?.voteResults) : ''}`;
  }

  async function finish() {
    const snap = await fs.getDocs(sub(fs, 'votes'));
    const results = tallyVotes(snap.docs.map((d) => d.data()), players);
    await save(() => fs.setDoc(eventDoc(fs), { voting: { status: 'finished' }, voteResults: results }, { merge: true }));
  }

  body.addEventListener('click', async (e) => {
    const v = e.target.closest('[data-vote]')?.dataset.vote;
    if (v === 'open') await save(() => fs.setDoc(eventDoc(fs), { voting: { status: 'open' } }, { merge: true }));
    if (v === 'finish' && confirm('Đóng cổng bình chọn và công bố kết quả?')) await finish();
    if (v === 'hide') await save(() => fs.setDoc(eventDoc(fs), { voting: { status: 'closed' } }, { merge: true }));
  });

  body.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const me = f.elements.me.value || null;
    const err = body.querySelector('#vote-err');
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (!f.elements.mvp.value || !f.elements.fairplay.value) return fail('Chọn đủ hai hạng mục.');
    if (me && (f.elements.mvp.value === me || f.elements.fairplay.value === me)) return fail('Không bầu cho chính mình nhé.');
    const ok = await save(() => fs.setDoc(subDoc(fs, 'votes', uid), {
      mvp: f.elements.mvp.value,
      fairplay: f.elements.fairplay.value,
      voterPlayerId: me,
      voterName: session.user.name,
      at: fs.serverTimestamp(),
    }));
    if (ok) { myVote = true; draw(); }
  });

  const unsubs = [
    watchEvent(fs, (ev) => { event = ev; draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
  ];
  if (uid) {
    fs.getDoc(subDoc(fs, 'votes', uid)).then((s) => { myVote = s.exists(); draw(); }).catch(() => { myVote = false; draw(); });
  }
  if (isAdmin) unsubs.push(fs.onSnapshot(sub(fs, 'votes'), (s) => { voteCount = s.size; draw(); }));
  draw();
  return () => unsubs.forEach((u) => u());
}
