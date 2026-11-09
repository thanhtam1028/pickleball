import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchList, watchEvent, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { STATUS_LABEL, isFinished, isOnCourt, courtName, sideLabel, srcLabel, scoreText, sortMatches } from '../match-format.js';

// Lịch thi đấu cho mọi người: lọc theo lớp và sân, ô "Tìm tên tôi" để xem trận của mình và còn bao nhiêu trận trước mình.
export function render(el) {
  el.innerHTML = '<h1>Lịch thi đấu</h1>';
  const fs = firestore();
  if (!fs) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>');
    return null;
  }

  let settings = withDefaults();
  let players = [];
  let matches = [];
  const filter = { cls: '', court: '', q: '' };

  el.insertAdjacentHTML('beforeend', `
    <div class="stack">
      <section class="card stack">
        <input type="search" id="me" placeholder="Tìm tên tôi" aria-label="Tìm trận theo tên người chơi">
        <div class="filters">
          <select id="f-cls" aria-label="Lọc theo lớp"><option value="">Tất cả lớp</option>${CLASSES.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
          <select id="f-court" aria-label="Lọc theo sân"></select>
        </div>
      </section>
      <section id="mine"></section>
      <section class="card" id="list"></section>
    </div>`);
  const $ = (s) => el.querySelector(s);

  const ids = (m) => [...(m.a?.players || []), ...(m.b?.players || [])];
  const clsOf = (m) => [m.a?.cls, m.b?.cls];

  // Số trận chưa xong xếp trước trận này ở cùng sân.
  function queueAhead(m) {
    return matches.filter((x) => x.court === m.court && !isFinished(x) && x.id !== m.id && (x.slot ?? 0) < (m.slot ?? 0)).length;
  }

  function row(m, showQueue) {
    const ahead = showQueue && m.status === 'scheduled' ? queueAhead(m) : null;
    return `
      <li class="match-row status-${m.status}">
        <span class="match-time"><b>${esc(m.startAt)}</b><span class="muted small">${esc(courtName(settings.courts, m.court))}</span></span>
        <a class="match-body match-link" href="#/tran/${esc(m.id)}">
          <span class="muted small">${esc(m.label)}</span>
          <span>${sideLabel(m.a, srcLabel(m.srcA))} <span class="muted">vs</span> ${sideLabel(m.b, srcLabel(m.srcB))}</span>
          <span class="small">${isOnCourt(m) ? `<span class="pill live">${STATUS_LABEL[m.status]}</span>` : STATUS_LABEL[m.status]}${scoreText(m) ? ` · ${esc(scoreText(m))}` : ''}
            ${ahead !== null ? ` · ${ahead === 0 ? '<b>Trận kế tiếp ở sân này</b>' : `còn ${ahead} trận trước`}` : ''}</span>
        </a>
      </li>`;
  }

  function draw() {
    $('#f-court').innerHTML = `<option value="">Tất cả sân</option>${settings.courts.map((c) => `<option value="${esc(c.id)}" ${filter.court === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}`;

    const q = filter.q.trim().toLowerCase();
    const found = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : [];
    if (q) {
      const mine = sortMatches(matches.filter((m) => ids(m).some((id) => found.some((p) => p.id === id))));
      $('#mine').innerHTML = `<div class="card"><h2>Trận của ${found.length === 1 ? esc(found[0].name) : 'bạn'}</h2>
        ${!found.length ? '<p class="muted">Không tìm thấy tên này.</p>'
          : found.length > 3 ? '<p class="muted">Có nhiều người trùng tên, gõ thêm để thu hẹp.</p>'
          : mine.length ? `<ul class="list match-list">${mine.map((m) => row(m, true)).join('')}</ul>` : '<p class="muted">Chưa có trận nào.</p>'}</div>`;
    } else {
      $('#mine').innerHTML = '';
    }

    const list = sortMatches(matches.filter((m) => (!filter.cls || clsOf(m).includes(filter.cls)) && (!filter.court || m.court === filter.court)));
    if (!list.length) {
      $('#list').innerHTML = `<p class="muted">${matches.length ? 'Không có trận nào khớp bộ lọc.' : 'Ban tổ chức chưa xếp lịch.'}</p>`;
      return;
    }
    const groups = new Map();
    list.forEach((m) => groups.set(m.startAt, [...(groups.get(m.startAt) || []), m]));
    $('#list').innerHTML = [...groups].map(([time, ms]) => `
      <h3 class="slot-head">${esc(time)}</h3><ul class="list match-list">${ms.map((m) => row(m, false)).join('')}</ul>`).join('');
  }

  el.addEventListener('input', (e) => {
    if (e.target.id === 'me') { filter.q = e.target.value; draw(); }
  });
  el.addEventListener('change', (e) => {
    if (e.target.id === 'f-cls') { filter.cls = e.target.value; draw(); }
    if (e.target.id === 'f-court') { filter.court = e.target.value; draw(); }
  });

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    watchList(fs, 'matches', (list) => { matches = list; draw(); }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
