import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchList, watchEvent, subDoc, save } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { suggestNext } from '../core/scheduler.js';
import { rulesFor, initialState, summary } from '../core/scoring.js';
import { STATUS_LABEL, isFinished, isOnCourt, courtName, sideLabel, sortMatches } from '../match-format.js';

const COURT_KEY = 'pickleball-admin-court';
const readCourt = () => { try { return localStorage.getItem(COURT_KEY) || ''; } catch { return ''; } };
const writeCourt = (v) => { try { localStorage.setItem(COURT_KEY, v); } catch { /* bỏ qua khi trình duyệt chặn lưu */ } };

// Trang "Sân của tôi": trọng tài thấy trận đang được gọi ở sân mình và bắt đầu bấm điểm.
// Ban tổ chức cũng dùng được, chọn sân bằng ô chọn.
export function render(el, { session }) {
  el.innerHTML = '<h1>Sân của tôi</h1>';
  const fs = firestore();
  const isAdmin = session.role === 'admin';
  if (!fs || !(isAdmin || session.role === 'referee')) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Trang này dành cho trọng tài và ban tổ chức. Vào mục Thêm để đăng nhập.</p></div>');
    return null;
  }

  let settings = withDefaults();
  let matches = [];
  let court = isAdmin ? readCourt() : '';
  const uid = session.user.uid;
  const body = document.createElement('div');
  body.className = 'stack';
  el.append(body);
  el.insertAdjacentHTML('beforeend', `
    <dialog id="start-dialog"><form method="dialog" class="stack" id="start-form"></form></dialog>`);
  const dialog = el.querySelector('#start-dialog');
  let starting = null;

  function draw() {
    const picker = isAdmin ? `
      <label class="field"><span class="field-label">Bấm điểm cho sân</span>
        <select id="court-pick"><option value="">Chọn sân</option>
          ${settings.courts.map((c) => `<option value="${esc(c.id)}" ${c.id === court ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></label>` : '';
    if (!court) {
      body.innerHTML = `<section class="card">${picker || '<p class="muted">Ban tổ chức chưa phân sân cho bạn. Nhờ ban tổ chức chọn sân cho bạn ở trang Cài đặt giải.</p>'}</section>`;
      return;
    }
    const here = matches.filter((m) => m.court === court);
    const current = here.find(isOnCourt);
    const next = current ? null : suggestNext(matches, court);
    const upcoming = sortMatches(here.filter((m) => m.status === 'scheduled' && m.id !== next?.id)).slice(0, 5);

    let currentHtml;
    if (current?.status === 'live') {
      const mine = current.refereeUid === uid;
      currentHtml = `
        <span class="pill live">Đang đánh</span>
        <p class="big-line">${sideLabel(current.a)} <span class="muted">vs</span> ${sideLabel(current.b)}</p>
        <p class="muted">${esc(current.label)} · ${esc(current.score?.callout || '')}</p>
        ${mine || isAdmin ? `<a class="btn" href="#/bam-diem/${esc(current.id)}">${mine ? 'Tiếp tục bấm điểm' : 'Mở màn hình bấm điểm'}</a>` : '<p class="note">Trận này đang do trọng tài khác giữ.</p>'}
        ${isAdmin && current.refereeUid && !mine ? `<button class="btn btn-ghost" data-release="${esc(current.id)}">Chuyển trọng tài (để người khác nhận)</button>` : ''}`;
    } else if (current || next) {
      const m = current || next;
      currentHtml = `
        <span class="pill">${current ? STATUS_LABEL.called : 'Trận kế tiếp đề xuất'}</span>
        <p class="big-line">${sideLabel(m.a)} <span class="muted">vs</span> ${sideLabel(m.b)}</p>
        <p class="muted">${esc(m.label)} · lịch ${esc(m.startAt)}</p>
        <button class="btn" data-start="${esc(m.id)}">Bắt đầu trận</button>`;
    } else {
      currentHtml = '<p class="muted">Không còn trận nào chờ ở sân này.</p>';
    }

    const doneCount = here.filter(isFinished).length;
    body.innerHTML = `
      ${picker ? `<section class="card">${picker}</section>` : ''}
      <section class="card stack">
        <h2>${esc(courtName(settings.courts, court))}</h2>
        ${currentHtml}
      </section>
      <section class="card">
        <h2>Tiếp theo ở sân này</h2>
        ${upcoming.length ? `<ul class="list">${upcoming.map((m) => `
          <li class="list-item"><span><b>${esc(m.startAt)}</b> · ${sideLabel(m.a)} vs ${sideLabel(m.b)}<br><span class="muted small">${esc(m.label)}</span></span></li>`).join('')}</ul>`
          : '<p class="muted">Không còn trận nào.</p>'}
        <p class="muted small">Đã xong ${doneCount} trận ở sân này.</p>
      </section>`;
  }

  function openStart(m) {
    starting = m;
    el.querySelector('#start-form').innerHTML = `
      <h2>Đội nào giao bóng trước?</h2>
      <p class="muted">Thường hai đội tung đồng xu hoặc oẳn tù tì để chọn.</p>
      <div class="btn-row">
        <button class="btn" value="A">${esc(m.a.name)}</button>
        <button class="btn" value="B">${esc(m.b.name)}</button>
        <button class="btn btn-ghost" value="cancel">Hủy</button>
      </div>`;
    dialog.showModal();
  }

  // Nhận trận bằng giao dịch, để hai trọng tài không cùng giữ một trận.
  async function startMatch(m, firstServer) {
    const ref = subDoc(fs, 'matches', m.id);
    const ok = await save(() => fs.runTransaction(fs.db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (data.refereeUid && data.refereeUid !== uid) throw new Error('Trận này vừa được trọng tài khác nhận.');
      if (isFinished(data)) throw new Error('Trận này đã xong.');
      const state = initialState(rulesFor(settings, data), firstServer);
      tx.update(ref, {
        status: 'live',
        refereeUid: uid,
        firstServer,
        startedAt: fs.serverTimestamp(),
        updatedAt: fs.serverTimestamp(),
        rallyCount: 0,
        score: summary(state),
        games: [],
        winner: null,
        ...(isAdmin && data.court !== court ? { court } : {}),
      });
    }));
    if (ok) location.hash = `#/bam-diem/${m.id}`;
  }

  dialog.addEventListener('close', () => {
    const v = dialog.returnValue;
    if (starting && (v === 'A' || v === 'B')) startMatch(starting, v);
  });

  body.addEventListener('change', (e) => {
    if (e.target.id === 'court-pick') {
      court = e.target.value;
      writeCourt(court);
      draw();
    }
  });
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.start) openStart(matches.find((m) => m.id === t.dataset.start));
    if (t.dataset.release) save(() => fs.updateDoc(subDoc(fs, 'matches', t.dataset.release), { refereeUid: null }));
  });

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'matches', (list) => { matches = list; draw(); }),
  ];
  if (!isAdmin) {
    unsubs.push(fs.onSnapshot(fs.doc(fs.db, 'roles', uid), (snap) => { court = snap.data()?.court || ''; draw(); }));
  }
  draw();
  return () => unsubs.forEach((u) => u());
}
