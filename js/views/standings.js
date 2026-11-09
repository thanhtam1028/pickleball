import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchList, watchEvent, eventDoc, save, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { rankTeams, classScore, mixerRanking } from '../core/standings.js';
import { classBar, bracketHtml } from '../live.js';
import { sideLabel, scoreText, isFinished, sortMatches } from '../match-format.js';

const TABS = [
  { id: 'teams', label: 'Cặp' },
  { id: 'classes', label: 'Lớp' },
  { id: 'bracket', label: 'Nhánh đấu' },
  { id: 'mixer', label: 'Cá nhân' },
];

export function render(el, { session }) {
  el.innerHTML = '<h1>Xếp hạng</h1>';
  const fs = firestore();
  if (!fs) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>');
    return null;
  }
  const isAdmin = session.role === 'admin';
  let event = null;
  let settings = withDefaults();
  let teams = [];
  let players = [];
  let matches = [];
  let tab = 'teams';
  let openTeam = null;

  el.insertAdjacentHTML('beforeend', `
    <div class="stack">
      <div class="segmented four" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
      <section class="card" id="panel"></section>
    </div>`);
  const panel = el.querySelector('#panel');

  function teamHistory(teamId) {
    const list = sortMatches(matches.filter((m) => m.a?.teamId === teamId || m.b?.teamId === teamId));
    if (!list.length) return '<p class="muted small">Chưa có trận.</p>';
    return `<ul class="list">${list.map((m) => `<li class="list-item small">
      <a class="match-link" href="#/tran/${esc(m.id)}">${esc(m.startAt)} · ${esc(m.label)}: ${sideLabel(m.a)} vs ${sideLabel(m.b)}</a>
      <span>${isFinished(m) ? esc(scoreText(m)) : '<span class="muted">chưa đánh</span>'}</span></li>`).join('')}</ul>`;
  }

  function teamsPanel() {
    const ranked = rankTeams(matches, teams, ['pool'], event?.drawOrder || {});
    const anyPlayed = ranked.some((r) => r.played);
    const tied = isAdmin && ranked.some((r) => r.tiedWith.length && r.played);
    return `
      <p class="muted small">Xếp theo số trận thắng, rồi đối đầu (khi đúng 2 cặp bằng nhau), rồi hiệu số, rồi tổng điểm ghi được. Chỉ tính vòng bảng.</p>
      ${tied ? '<p class="note">Có cặp bằng nhau hoàn toàn. <button class="btn btn-small" data-act="draw">Bốc thăm thứ tự</button></p>' : ''}
      ${!anyPlayed ? '<p class="muted">Chưa có trận vòng bảng nào xong.</p>' : ''}
      <div class="table-wrap"><table class="rank">
        <thead><tr><th>#</th><th>Cặp</th><th title="Số trận">Tr</th><th title="Thắng">T</th><th title="Thua">B</th><th title="Hiệu số">HS</th><th title="Điểm ghi">Đ</th></tr></thead>
        <tbody>${ranked.map((r, i) => `
          <tr class="${r.cls === CLASSES[0] ? 'c110' : r.cls === CLASSES[1] ? 'c111' : ''}" data-team="${esc(r.id)}" tabindex="0">
            <td>${i + 1}</td><td><b>${esc(r.name)}</b><br><span class="muted small">${esc(r.cls)}</span></td>
            <td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td><td>${r.pf}</td>
          </tr>
          ${openTeam === r.id ? `<tr class="history"><td colspan="7">${teamHistory(r.id)}</td></tr>` : ''}`).join('')}
        </tbody></table></div>`;
  }

  function classesPanel() {
    const sc = classScore(matches, settings.classPoints, CLASSES);
    const row = (label, key) => `<tr><td>${label}</td>${CLASSES.map((c) => `<td>${sc[c][key]}</td>`).join('')}</tr>`;
    return `${classBar(sc, CLASSES)}
      <table class="rank compact" style="margin-top:16px">
        <thead><tr><th></th>${CLASSES.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>
          ${row(`Vòng bảng (${settings.classPoints.pool} điểm/trận thắng)`, 'pool')}
          ${row(`Tứ kết, bán kết (${settings.classPoints.semi})`, 'semi')}
          ${row(`Chung kết (${settings.classPoints.final})`, 'final')}
          ${row(`Siêu kinh điển (${settings.classPoints.clash})`, 'clash')}
          <tr class="total">${['Tổng', ...CLASSES.map((c) => sc[c].total)].map((v) => `<td>${v}</td>`).join('')}</tr>
        </tbody></table>
      <p class="muted small">Trận liên lớp, trận cùng lớp và phần khởi động không tính điểm lớp.</p>`;
  }

  function mixerPanel() {
    const list = mixerRanking(matches, players);
    if (!list.length) return '<p class="muted">Chưa có trận khởi động nào xong.</p>';
    return `<p class="muted small">Phần khởi động xoay cặp: mỗi người cộng số trận thắng và hiệu số của đội mình.</p>
      <table class="rank"><thead><tr><th>#</th><th>Người chơi</th><th>Tr</th><th>T</th><th>HS</th></tr></thead>
      <tbody>${list.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)} <span class="muted small">${esc(r.cls || '')}</span></td><td>${r.played}</td><td>${r.wins}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td></tr>`).join('')}</tbody></table>`;
  }

  function draw() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    panel.innerHTML = tab === 'teams' ? teamsPanel() : tab === 'classes' ? classesPanel() : tab === 'bracket' ? bracketHtml(matches) : mixerPanel();
  }

  async function drawLots() {
    const ranked = rankTeams(matches, teams, ['pool'], {});
    const order = { ...(event?.drawOrder || {}) };
    const seen = new Set();
    ranked.forEach((r) => {
      if (!r.tiedWith.length || seen.has(r.id)) return;
      const group = [r.id, ...r.tiedWith].sort(() => Math.random() - 0.5);
      group.forEach((id, i) => { order[id] = i; seen.add(id); });
    });
    await save(() => fs.setDoc(eventDoc(fs), { drawOrder: order }, { merge: true }));
  }

  el.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; draw(); return; }
    if (e.target.closest('[data-act="draw"]')) { drawLots(); return; }
    const row = e.target.closest('tr[data-team]');
    if (row) { openTeam = openTeam === row.dataset.team ? null : row.dataset.team; draw(); }
  });
  el.addEventListener('keydown', (e) => {
    const row = e.target.closest?.('tr[data-team]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
  });

  const unsubs = [
    watchEvent(fs, (ev) => { event = ev; settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'teams', (list) => { teams = list; draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    watchList(fs, 'matches', (list) => { matches = list; draw(); }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
