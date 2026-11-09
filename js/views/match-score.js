import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent, watchList, subDoc, save } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { rulesFor, replay, effectiveEvents, callout, serveSide, summary, other } from '../core/scoring.js';
import { courtName, isFinished } from '../match-format.js';

const ALERT_TEXT = {
  switch: 'Đổi sân! Hai đội đổi bên.',
  gamepoint: 'Điểm quyết định ván',
  game: 'Hết ván. Sang ván mới.',
  match: 'Hết trận. Kiểm tra tỷ số rồi bấm Xác nhận kết quả.',
  rotate: 'Đổi người giao (đánh đơn xoay người).',
  timeout: 'Hội ý',
};
const pad = (n) => String(n).padStart(4, '0');

// Màn hình bấm điểm: trọng tài chỉ bấm "đội nào thắng pha". Luật do bộ tính điểm lo.
export function render(el, { session, params }) {
  const fs = firestore();
  const uid = session.user?.uid;
  if (!fs || !uid || !(session.role === 'admin' || session.role === 'referee')) {
    el.innerHTML = '<h1>Bấm điểm</h1><div class="card"><p class="muted">Trang này dành cho trọng tài. Vào mục Thêm để đăng nhập.</p></div>';
    return null;
  }

  const matchRef = subDoc(fs, 'matches', params.id);
  let settings = withDefaults();
  let match = null;
  let events = [];
  let players = [];
  let pending = false;
  let flipped = false;
  let lastSeenSeq = null;
  let wakeLock = null;
  let toastTimer = null;

  el.innerHTML = `
    <div class="scorer">
      <div id="sc-body"></div>
      <div class="toast" id="toast" role="status" aria-live="assertive" hidden></div>
    </div>
    <dialog id="end-dialog"><form method="dialog" class="stack" id="end-form"></form></dialog>`;
  const $ = (s) => el.querySelector(s);
  const dialog = $('#end-dialog');

  const name = (id) => players.find((p) => p.id === id)?.name || '';
  const canScore = () => match && (session.role === 'admin' || match.refereeUid === uid);
  const rules = () => rulesFor(settings, match);
  const state = () => replay(rules(), match.firstServer || 'A', events);

  function toast(alerts) {
    const text = alerts.map((a) => ALERT_TEXT[a]).filter(Boolean).join(' · ');
    if (!text) return;
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, alerts.includes('switch') || alerts.includes('match') ? 6000 : 3000);
    if (navigator.vibrate) navigator.vibrate(alerts.includes('switch') ? [120, 80, 120] : 60);
  }

  function serverName(s, side) {
    if (rules().singles) return side.name;
    return name(side.players[s.serverIdx]) || side.name;
  }

  // Sơ đồ sân nhỏ: mỗi đội một nửa, ô của người giao được tô màu.
  function courtSvg(s) {
    const leftTeam = flipped ? 'B' : 'A';
    const box = serveSide(s);
    // Đội bên trái nhìn sang phải: ô phải của họ ở dưới. Đội bên phải nhìn sang trái: ô phải ở trên.
    const serverOnLeft = s.server === leftTeam;
    const y = serverOnLeft ? (box === 'right' ? 50 : 0) : (box === 'right' ? 0 : 50);
    const x = serverOnLeft ? 0 : 130;
    return `<svg viewBox="0 0 200 100" class="court-svg" role="img" aria-label="Người giao đứng ô ${box === 'right' ? 'phải' : 'trái'}">
      <rect x="1" y="1" width="198" height="98" rx="4" class="c-line"/>
      <rect x="${x + 1}" y="${y + 1}" width="69" height="48" class="c-serve"/>
      <line x1="100" y1="0" x2="100" y2="100" class="c-net"/>
      <line x1="70" y1="0" x2="70" y2="100" class="c-kitchen"/><line x1="130" y1="0" x2="130" y2="100" class="c-kitchen"/>
      <line x1="0" y1="50" x2="70" y2="50" class="c-line"/><line x1="130" y1="50" x2="200" y2="50" class="c-line"/>
      <text x="35" y="96" class="c-label">${esc(match[leftTeam.toLowerCase()].cls || '')}</text>
      <text x="165" y="96" class="c-label">${esc(match[other(leftTeam).toLowerCase()].cls || '')}</text>
    </svg>`;
  }

  function teamButton(team, s) {
    const side = match[team.toLowerCase()];
    const cls = side.cls === 'CEO 110' ? 'c110' : side.cls === 'CEO 111' ? 'c111' : 'cx';
    return `<button class="rally-btn ${cls} ${s.server === team ? 'serving' : ''}" data-rally="${team}" ${s.matchOver || !canScore() ? 'disabled' : ''}>
      <span class="rally-score">${team === 'A' ? s.a : s.b}</span>
      <span class="rally-name">${esc(side.name)}</span>
      <span class="rally-hint">thắng pha này</span>
    </button>`;
  }

  function draw() {
    if (!match) {
      $('#sc-body').innerHTML = '<p class="muted">Đang tải trận…</p>';
      return;
    }
    if (!match.a || !match.b) {
      $('#sc-body').innerHTML = '<div class="card"><p class="muted">Trận này chưa biết đủ hai đội.</p></div>';
      return;
    }
    const s = state();
    const finished = isFinished(match);
    const effective = effectiveEvents(events).length;
    const order = flipped ? ['B', 'A'] : ['A', 'B'];
    const serverSide = match[s.server.toLowerCase()];
    $('#sc-body').innerHTML = `
      <div class="sc-head">
        <a href="#/san-cua-toi" class="muted small">‹ Sân của tôi</a>
        <span class="small">${esc(match.label)} · ${esc(courtName(settings.courts, match.court))}</span>
        <span class="sync ${pending ? 'pending' : ''}">${pending ? 'Đang chờ mạng, điểm vẫn được lưu trên máy' : 'Đã đồng bộ'}</span>
      </div>
      ${!canScore() ? '<p class="note">Bạn chỉ xem được: trận này do trọng tài khác giữ.</p>' : ''}
      <div class="callout" aria-live="polite">${esc(callout(s))}</div>
      <p class="server-line">Giao bóng: <b>${esc(serverName(s, serverSide))}</b>
        ${rules().scoringMode === 'sideout' && !rules().singles ? `(người số ${s.serverNum})` : ''} · ô ${serveSide(s) === 'right' ? 'phải' : 'trái'}</p>
      ${courtSvg(s)}
      <p class="muted small center">Ván ${s.gameNo}${s.games.length ? ` · các ván trước: ${s.games.map((g) => `${g.a}–${g.b}`).join(', ')}` : ''}</p>
      ${s.matchOver || finished ? `
        <div class="card done-box">
          <h2>${finished ? 'Đã xác nhận kết quả' : 'Hết trận'}</h2>
          <p class="big-line">${esc(match[(match.winner || s.winner).toLowerCase()].name)} thắng · ${(finished ? match.games || [] : s.games).map((g) => `${g.a}–${g.b}`).join(', ')}</p>
          ${finished ? '<a class="btn" href="#/san-cua-toi">Về Sân của tôi</a>'
            : '<button class="btn" data-act="confirm">Xác nhận kết quả</button>'}
        </div>` : `<div class="rally-row">${order.map((t) => teamButton(t, s)).join('')}</div>`}
      ${finished ? '' : `
        <div class="tool-row">
          <button class="btn btn-ghost" data-act="undo" ${effective && canScore() ? '' : 'disabled'}>Hoàn tác</button>
          ${order.map((t) => `<button class="btn btn-ghost" data-timeout="${t}" ${s.timeouts[t] > 0 && canScore() && !s.matchOver ? '' : 'disabled'}>Hội ý ${esc(match[t.toLowerCase()].name)} (${s.timeouts[t]})</button>`).join('')}
          <button class="btn btn-ghost" data-act="flip">Đổi bên màn hình</button>
          <button class="btn btn-ghost" data-act="end" ${canScore() ? '' : 'disabled'}>Kết thúc sớm</button>
        </div>`}`;
  }

  // Ghi một sự kiện: thêm dòng nhật ký và cập nhật tóm tắt điểm trong cùng một lô ghi.
  async function push(ev) {
    if (!canScore()) return;
    const seq = Math.max(match.rallyCount || 0, events.length) + 1;
    const next = replay(rules(), match.firstServer || 'A', [...events, ev]);
    const batch = fs.writeBatch(fs.db);
    batch.set(fs.doc(fs.db, matchRef.path, 'rallies', pad(seq)), { seq, ...ev, by: uid, at: fs.serverTimestamp() });
    batch.update(matchRef, {
      rallyCount: seq,
      score: summary(next),
      games: next.games,
      refereeUid: match.refereeUid || uid,
      updatedAt: fs.serverTimestamp(),
    });
    if (navigator.vibrate) navigator.vibrate(30);
    // Không chờ máy chủ trả lời: Firestore lưu tạm trên máy và tự gửi khi có mạng.
    batch.commit().catch((err) => alert(`Không lưu được: ${err.message}`));
  }

  function openEnd() {
    $('#end-form').innerHTML = `
      <h2>Kết thúc sớm</h2>
      <p class="muted">Dùng khi một đội chấn thương hoặc bỏ cuộc. Chọn đội thắng.</p>
      <label class="check"><input type="radio" name="w" value="A" required><span>${esc(match.a.name)} thắng</span></label>
      <label class="check"><input type="radio" name="w" value="B"><span>${esc(match.b.name)} thắng</span></label>
      <input name="reason" placeholder="Lý do, ví dụ: chấn thương">
      <div class="btn-row"><button class="btn" value="save">Kết thúc trận</button><button class="btn btn-ghost" value="cancel" formnovalidate>Hủy</button></div>`;
    dialog.showModal();
  }

  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'save') return;
    const f = $('#end-form');
    const w = f.querySelector('input[name=w]:checked')?.value;
    if (!w) return;
    const s = state();
    save(() => fs.updateDoc(matchRef, {
      status: 'walkover',
      winner: w,
      games: [...s.games, ...(s.a || s.b ? [{ a: s.a, b: s.b }] : [])],
      walkoverReason: `Kết thúc sớm: ${f.elements.reason.value.trim() || 'bỏ cuộc'}`,
      refereeUid: match.refereeUid || uid,
      updatedAt: fs.serverTimestamp(),
    }));
  });

  el.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || t.closest('dialog')) return;
    if (t.dataset.rally) push({ type: 'rally', winner: t.dataset.rally });
    else if (t.dataset.timeout) push({ type: 'timeout', team: t.dataset.timeout });
    else if (t.dataset.act === 'undo') push({ type: 'undo' });
    else if (t.dataset.act === 'flip') { flipped = !flipped; draw(); }
    else if (t.dataset.act === 'end') openEnd();
    else if (t.dataset.act === 'confirm') {
      const s = state();
      save(() => fs.updateDoc(matchRef, {
        status: 'done', winner: s.winner, games: s.games, score: summary(s),
        refereeUid: match.refereeUid || uid, updatedAt: fs.serverTimestamp(),
      }));
    }
  });

  // Giữ màn hình sáng khi đang bấm điểm.
  async function keepAwake() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* trình duyệt không hỗ trợ */ }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); };
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  const ralliesQuery = fs.query(fs.collection(fs.db, matchRef.path, 'rallies'), fs.orderBy('seq'));
  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    fs.onSnapshot(matchRef, { includeMetadataChanges: true }, (snap) => {
      match = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      pending = snap.metadata.hasPendingWrites;
      draw();
    }),
    fs.onSnapshot(ralliesQuery, { includeMetadataChanges: true }, (snap) => {
      events = snap.docs.map((d) => d.data());
      pending = pending || snap.metadata.hasPendingWrites;
      const last = events.at(-1);
      // Báo đổi sân, điểm quyết định, hết ván... khi có pha mới (không báo khi mở lại trang hay hoàn tác).
      if (match && last && lastSeenSeq !== null && last.seq > lastSeenSeq && last.type !== 'undo') toast(state().alerts);
      lastSeenSeq = last?.seq ?? 0;
      draw();
    }),
  ];
  draw();
  return () => {
    unsubs.forEach((u) => u());
    document.removeEventListener('visibilitychange', onVisible);
    wakeLock?.release?.();
    clearTimeout(toastTimer);
  };
}
