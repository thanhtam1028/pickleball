import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent, watchList, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { suggestNext } from '../core/scheduler.js';
import { courtCard, resultLine } from '../live.js';
import { sortMatches, isFinished } from '../match-format.js';

// Trang một sân (mã QR dán ở sân dẫn tới đây): trận đang đánh, trận kế tiếp, các trận đã xong ở sân.
export function render(el, { params }) {
  const fs = firestore();
  if (!fs) {
    el.innerHTML = '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>';
    return null;
  }
  let settings = withDefaults();
  let players = [];
  let matches = [];

  function draw() {
    const court = settings.courts.find((c) => c.id === params.id);
    if (!court) {
      el.innerHTML = '<h1>Sân</h1><div class="card"><p class="muted">Không tìm thấy sân này.</p></div>';
      return;
    }
    const here = matches.filter((m) => m.court === court.id);
    const current = here.find((m) => m.status === 'live' || m.status === 'called');
    const next = current ? null : suggestNext(matches, court.id);
    const done = sortMatches(here.filter(isFinished)).reverse().slice(0, 6);
    el.innerHTML = `
      <p class="muted small"><a href="#/">‹ Trang chủ</a></p>
      <h1>${esc(court.name)}</h1>
      ${courtCard(court, current, next, { settings, players, classes: CLASSES })}
      ${done.length ? `<section class="card" style="margin-top:16px"><h2>Đã xong ở sân này</h2>
        <ul class="list">${done.map((m) => `<li class="list-item small"><a class="match-link" href="#/tran/${esc(m.id)}">${resultLine(m)}</a></li>`).join('')}</ul></section>` : ''}`;
  }

  const unsubs = [
    watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    watchList(fs, 'matches', (list) => { matches = list; draw(); }),
  ];
  draw();
  return () => unsubs.forEach((u) => u());
}
