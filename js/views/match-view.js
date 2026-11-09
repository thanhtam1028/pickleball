import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent, watchList, subDoc } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { STATUS_LABEL, courtName, sideLabel, srcLabel, scoreText } from '../match-format.js';

// Xem một trận cho khán giả: tỷ số lớn, ván, người giao, cập nhật trực tiếp.
// Chỉ lắng nghe tài liệu trận (không đọc nhật ký từng pha) để nhẹ cho điện thoại và cho Firestore.
export function render(el, { params, session }) {
  const fs = firestore();
  if (!fs) {
    el.innerHTML = '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>';
    return null;
  }
  let settings = withDefaults();
  let match = null;
  let players = [];
  const name = (id) => players.find((p) => p.id === id)?.name || '';

  function draw() {
    if (!match) {
      el.innerHTML = '<h1>Trận đấu</h1><div class="card"><p class="muted">Đang tải hoặc không tìm thấy trận.</p></div>';
      return;
    }
    const sc = match.score;
    const live = match.status === 'live';
    const side = (t) => match[t.toLowerCase()];
    const serving = (t) => live && sc?.server === t;
    const serverName = sc && side(sc.server) ? (name(side(sc.server).players?.[sc.serverIdx]) || side(sc.server).name) : '';
    const block = (t) => `
      <div class="mv-team ${serving(t) ? 'serving' : ''} ${match.winner === t ? 'winner' : ''}">
        <span class="mv-name">${sideLabel(side(t), srcLabel(match[`src${t}`]))}</span>
        <span class="muted small">${esc(side(t)?.cls || '')}${side(t)?.players ? ` · ${side(t).players.map(name).filter(Boolean).map(esc).join(', ')}` : ''}</span>
        <span class="mv-score">${live || sc ? (t === 'A' ? sc?.a ?? 0 : sc?.b ?? 0) : '–'}</span>
      </div>`;
    el.innerHTML = `
      <p class="muted small"><a href="#/lich">‹ Lịch thi đấu</a></p>
      <h1>${esc(match.label)}</h1>
      <p class="muted">${esc(courtName(settings.courts, match.court))} · lịch ${esc(match.startAt)} ·
        ${live ? '<span class="pill live">Đang đánh</span>' : esc(STATUS_LABEL[match.status] || '')}</p>
      <section class="card mv">
        ${block('A')}
        <div class="mv-vs">vs</div>
        ${block('B')}
      </section>
      ${live && sc ? `<p class="center">Đọc điểm: <b class="mv-callout">${esc(sc.callout)}</b> · ván ${sc.gameNo} · giao: ${esc(serverName)}</p>` : ''}
      ${match.games?.length ? `<p class="center muted">Các ván: ${esc(scoreText(match))}</p>` : ''}
      ${match.walkoverReason ? `<p class="center muted">${esc(match.walkoverReason)}</p>` : ''}
      ${session?.role === 'admin' ? `<p class="center"><a class="btn btn-ghost btn-small" href="#/nhat-ky/${esc(match.id)}">Nhật ký trận</a></p>` : ''}`;
  }

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    fs.onSnapshot(subDoc(fs, 'matches', params.id), (snap) => {
      match = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      draw();
    }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
