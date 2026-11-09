// Thành phần hiển thị dùng chung cho trang chủ, trang Xếp hạng và màn hình TV.
import { esc } from './dom.js';
import { STATUS_LABEL, courtName, sideLabel, srcLabel, scoreText, isFinished, sortMatches } from './match-format.js';

const clsKey = (cls, classes) => (cls === classes[0] ? 'c110' : cls === classes[1] ? 'c111' : 'cx');

// Thanh so điểm hai lớp kiểu kéo co.
export function classBar(score, classes, big = false) {
  const [c1, c2] = classes;
  const s1 = score[c1]?.total || 0;
  const s2 = score[c2]?.total || 0;
  const share = s1 + s2 ? (s1 / (s1 + s2)) * 100 : 50;
  return `
    <div class="classbar ${big ? 'big' : ''}">
      <div class="versus">
        <div class="cls c110"><span>${esc(c1)}</span><b class="cls-score">${s1}</b></div>
        <div class="vs">VS</div>
        <div class="cls c111"><b class="cls-score">${s2}</b><span>${esc(c2)}</span></div>
      </div>
      <div class="tug" role="img" aria-label="${esc(c1)} ${s1} điểm, ${esc(c2)} ${s2} điểm">
        <span style="flex:${share}"></span><span style="flex:${100 - share}"></span>
      </div>
    </div>`;
}

const playerNames = (side, players) => (side?.players || []).map((id) => players.find((p) => p.id === id)?.name).filter(Boolean);

// Thẻ một sân: trận đang đánh hoặc đã gọi, tỷ số và người giao.
export function courtCard(court, match, next, { settings, players, classes }) {
  if (!match) {
    return `<div class="live-card idle">
      <div class="live-head"><b>${esc(court.name)}</b><span class="muted small">Sân trống</span></div>
      ${next ? `<p class="muted small">Kế tiếp: ${sideLabel(next.a)} vs ${sideLabel(next.b)}</p>` : ''}
    </div>`;
  }
  const sc = match.score;
  const live = match.status === 'live';
  const row = (t) => {
    const side = match[t.toLowerCase()];
    const serving = live && sc?.server === t;
    return `<div class="live-row ${clsKey(side?.cls, classes)}">
      <span class="live-name">${serving ? '<span class="ball" aria-label="đang giao"></span>' : ''}${sideLabel(side)}
        <span class="muted small">${esc(playerNames(side, players).join(', '))}</span></span>
      <b class="live-score">${live ? (t === 'A' ? sc?.a ?? 0 : sc?.b ?? 0) : ''}</b>
    </div>`;
  };
  return `<a class="live-card" href="#/tran/${esc(match.id)}">
    <div class="live-head"><b>${esc(court.name)}</b>
      <span class="pill ${live ? 'live' : ''}">${live ? 'Đang đánh' : STATUS_LABEL[match.status]}</span></div>
    <p class="muted small live-label">${esc(match.label)}${live && sc ? ` · ván ${sc.gameNo} · đọc điểm ${esc(sc.callout)}` : ''}</p>
    ${row('A')}${row('B')}
    ${match.games?.length ? `<p class="muted small">Các ván: ${esc(scoreText(match))}</p>` : ''}
  </a>`;
}

export function courtsGrid(matches, nextFor, ctx) {
  return `<div class="live-grid">${ctx.settings.courts.map((c) => {
    const m = matches.find((x) => x.court === c.id && (x.status === 'live' || x.status === 'called'));
    return courtCard(c, m, m ? null : nextFor(c.id), ctx);
  }).join('')}</div>`;
}

// Kết quả vừa xong, mới nhất trước.
export function recentResults(matches, n = 6) {
  return matches
    .filter(isFinished)
    .sort((x, y) => (y.updatedAt?.seconds || 0) - (x.updatedAt?.seconds || 0) || (y.slot ?? 0) - (x.slot ?? 0))
    .slice(0, n);
}

// Dòng kết quả ghi điểm đội thắng trước, ví dụ "Phát & Linh thắng Cặp B 11–6".
export function resultLine(m) {
  const winA = m.winner === 'A';
  const w = winA ? m.a : m.b;
  const l = winA ? m.b : m.a;
  const games = (m.games || []).map((g) => (winA ? `${g.a}–${g.b}` : `${g.b}–${g.a}`)).join(', ');
  return `${esc(w?.name || '')} thắng ${esc(l?.name || '')} ${esc(games)}`;
}

// Nhánh đấu loại trực tiếp vẽ bằng CSS grid: mỗi vòng một cột.
const ROUNDS = [
  { stage: 'quarter', label: 'Tứ kết' },
  { stage: 'semi', label: 'Bán kết' },
  { stage: 'final', label: 'Chung kết' },
];

function bracketMatch(m) {
  const sideRow = (t) => {
    const side = m[t.toLowerCase()];
    const won = isFinished(m) && m.winner === t;
    const pts = (m.games || []).map((g) => g[t.toLowerCase()]).join(' ');
    return `<div class="br-side ${won ? 'won' : ''}"><span>${sideLabel(side, srcLabel(m[`src${t}`]))}</span><b>${esc(pts)}</b></div>`;
  };
  return `<a class="br-match ${m.status === 'live' ? 'is-live' : ''}" href="#/tran/${esc(m.id)}">
    <span class="muted small">${esc(m.label)}${m.status === 'live' ? ' <span class="live-dot" aria-label="đang đánh"></span>' : ''}</span>
    ${sideRow('A')}${sideRow('B')}
  </a>`;
}

export function bracketHtml(matches) {
  const cols = ROUNDS.map((r) => ({ ...r, list: sortMatches(matches.filter((m) => m.stage === r.stage)) })).filter((r) => r.list.length);
  const third = matches.find((m) => m.stage === 'third');
  if (!cols.length) return '<p class="muted">Chưa có vòng chung kết. Ban tổ chức tạo khi vòng bảng xong.</p>';
  return `<div class="bracket" style="grid-template-columns: repeat(${cols.length}, minmax(180px, 1fr))">
    ${cols.map((c) => `<div class="br-col"><h3>${esc(c.label)}</h3><div class="br-list">${c.list.map(bracketMatch).join('')}</div></div>`).join('')}
  </div>
  ${third ? `<div class="br-third"><h3>Tranh hạng ba</h3>${bracketMatch(third)}</div>` : ''}`;
}

export { courtName };
