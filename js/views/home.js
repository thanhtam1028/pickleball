import { esc, icon } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchList, watchEvent, eventDoc, save, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { classScore } from '../core/standings.js';
import { suggestNext } from '../core/scheduler.js';
import { classBar, courtsGrid, recentResults, resultLine } from '../live.js';
import { sideLabel, sortMatches, courtName } from '../match-format.js';

// Trang chủ cho khán giả: điểm hai lớp, các sân đang đánh, trận sắp tới, kết quả vừa xong.
export function render(el, { session } = {}) {
  const fs = firestore();
  const isAdmin = session?.role === 'admin';
  let draft = null;
  let settings = withDefaults();
  let players = [];
  let matches = [];
  let announcement = '';

  function draw() {
    const score = classScore(matches, settings.classPoints, CLASSES);
    const anyLive = matches.some((m) => m.status === 'live' || m.status === 'called');
    const upcoming = sortMatches(matches.filter((m) => m.status === 'scheduled' && m.a && m.b)).slice(0, 4);
    const recent = recentResults(matches, 4);
    el.innerHTML = `
      <div class="stack">
        ${announcement ? `<p class="note announce">${esc(announcement)}</p>` : ''}
        ${isAdmin && fs ? `<section class="card admin-announce">
          <label class="field"><span class="field-label">Thông báo ghim (hiện ở trang chủ và màn hình TV)</span>
            <input id="announce-input" maxlength="140" placeholder="Ví dụ: Nghỉ giải lao 10 phút, chung kết lúc 16:00" value="${esc(draft ?? announcement)}"></label>
          <div class="btn-row"><button class="btn btn-small" data-announce="set">Ghim</button>
            ${announcement ? '<button class="btn btn-ghost btn-small" data-announce="clear">Gỡ thông báo</button>' : ''}</div>
        </section>` : ''}
        <section class="card">
          <p class="muted" style="margin:0 0 8px">Đại chiến Pickleball</p>
          ${classBar(score, CLASSES)}
          ${!matches.length ? '<p class="muted center" style="margin:10px 0 0">Giải chưa bắt đầu. Điểm của hai lớp sẽ hiện ở đây.</p>' : ''}
        </section>
        <section class="card">
          <div class="row-between"><h2>Các sân</h2><a class="muted small" href="#/lich">Tìm trận của tôi ›</a></div>
          ${matches.length && anyLive ? courtsGrid(matches, (c) => suggestNext(matches, c), { settings, players, classes: CLASSES })
            : `<div class="empty">${icon('live')}<p class="muted">Chưa có trận nào trên sân.</p></div>`}
        </section>
        <div class="grid">
          ${upcoming.length ? `<section class="card"><h2>Sắp tới</h2><ul class="list">${upcoming.map((m) => `
            <li class="list-item small"><a class="match-link" href="#/tran/${esc(m.id)}"><b>${esc(m.startAt)}</b> · ${esc(courtName(settings.courts, m.court))}<br>${sideLabel(m.a)} vs ${sideLabel(m.b)}</a></li>`).join('')}</ul></section>` : ''}
          ${recent.length ? `<section class="card"><h2>Vừa xong</h2><ul class="list">${recent.map((m) => `
            <li class="list-item small"><a class="match-link" href="#/tran/${esc(m.id)}">${resultLine(m)}</a></li>`).join('')}</ul></section>` : ''}
          <section class="card">
            <h2>Lần đầu chơi Pickleball?</h2>
            <p class="muted">Xem nhanh luật chơi, vùng bếp, cách giao bóng và cách đọc điểm.</p>
            <a class="btn" href="#/luat">Xem luật cho người mới</a>
          </section>
        </div>
      </div>`;
  }

  if (!fs) {
    draw();
    return null;
  }
  el.addEventListener('input', (e) => { if (e.target.id === 'announce-input') draft = e.target.value; });
  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-announce]')?.dataset.announce;
    if (!act) return;
    const text = act === 'set' ? (draft ?? announcement).trim() : '';
    if (await save(() => fs.setDoc(eventDoc(fs), { announcement: text }, { merge: true }))) draft = null;
  });
  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); announcement = ev?.announcement || ''; draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    watchList(fs, 'matches', (list) => { matches = list; draw(); }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
