import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchList, watchEvent, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { classScore, rankTeams } from '../core/standings.js';
import { suggestNext } from '../core/scheduler.js';
import { classBar, courtsGrid, recentResults, resultLine, bracketHtml } from '../live.js';
import { courtName, sideLabel, isFinished } from '../match-format.js';

const SCREENS = [
  { id: 'courts', label: 'Các sân' },
  { id: 'rank', label: 'Xếp hạng' },
  { id: 'bracket', label: 'Nhánh đấu' },
];
const ROTATE_MS = 20000;

// Pháo giấy vẽ bằng canvas, chạy khoảng 5 giây.
function confetti(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  const w = (canvas.width = innerWidth);
  const h = (canvas.height = innerHeight);
  const colors = ['#d7e84a', '#2459d6', '#e2611b', '#ffffff', '#1f6b4f'];
  const bits = Array.from({ length: 180 }, () => ({
    x: Math.random() * w, y: -20 - Math.random() * h * 0.5, r: 4 + Math.random() * 6,
    vy: 2 + Math.random() * 4, vx: -1.5 + Math.random() * 3, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6,
  }));
  const start = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, w, h);
    bits.forEach((b) => {
      b.y += b.vy; b.x += b.vx; b.a += 0.1;
      ctx.fillStyle = b.c;
      ctx.fillRect(b.x, b.y, b.r, b.r * (0.5 + Math.abs(Math.sin(b.a))));
    });
    if (t - start < 5000) requestAnimationFrame(frame); else canvas.remove();
  })(start);
}

// Màn hình TV hoặc máy chiếu: toàn màn hình, tự xoay giữa Các sân, Xếp hạng, Nhánh đấu mỗi 20 giây.
// Thêm "?xoay=0" vào địa chỉ để giữ một màn, ví dụ #/tv?xoay=0.
export function render(el, { query = {} }) {
  document.body.classList.add('tv-mode');
  const fs = firestore();
  const rotate = query.xoay !== '0';
  let screen = 0;
  let settings = withDefaults();
  let event = null;
  let players = [];
  let teams = [];
  let matches = [];
  const knownStatus = new Map();
  let firstLoad = true;

  function screenBody(id) {
    if (id === 'courts') return courtsGrid(matches, (c) => suggestNext(matches, c), { settings, players, classes: CLASSES });
    if (id === 'bracket') return bracketHtml(matches);
    const ranked = rankTeams(matches, teams, ['pool'], event?.drawOrder || {}).slice(0, 10);
    return `<table class="rank tv-rank"><thead><tr><th>#</th><th>Cặp</th><th>Trận</th><th>Thắng</th><th>Hiệu số</th></tr></thead>
      <tbody>${ranked.map((r, i) => `<tr class="${r.cls === CLASSES[0] ? 'c110' : r.cls === CLASSES[1] ? 'c111' : ''}">
        <td>${i + 1}</td><td><b>${esc(r.name)}</b> <span class="muted">${esc(r.cls)}</span></td><td>${r.played}</td><td>${r.wins}</td><td>${r.diff > 0 ? '+' : ''}${r.diff}</td></tr>`).join('')}</tbody></table>`;
  }

  function draw() {
    const s = SCREENS[screen];
    const next = settings.courts.map((c) => {
      const m = matches.find((x) => x.court === c.id && (x.status === 'live' || x.status === 'called')) ? null : suggestNext(matches, c.id);
      return m ? `<span><b>${esc(courtName(settings.courts, c.id))}:</b> ${sideLabel(m.a)} vs ${sideLabel(m.b)}</span>` : '';
    }).filter(Boolean);
    const results = recentResults(matches, 8).map(resultLine);
    el.innerHTML = `
      <div class="tv">
        <header class="tv-top">
          <div class="tv-title">Đại chiến CEO 110 – CEO 111</div>
          ${classBar(classScore(matches, settings.classPoints, CLASSES), CLASSES, true)}
        </header>
        ${event?.announcement ? `<p class="tv-announce">${esc(event.announcement)}</p>` : ''}
        <main class="tv-main">
          <div class="tv-tabs">${SCREENS.map((x, i) => `<button data-screen="${i}" aria-selected="${i === screen}">${x.label}</button>`).join('')}
            <a class="tv-exit" href="#/">Thoát TV</a></div>
          <div class="tv-screen" data-screen-id="${s.id}">${screenBody(s.id)}</div>
        </main>
        <footer class="tv-bottom">
          ${next.length ? `<div class="tv-next"><b>Trận kế tiếp</b> ${next.join(' · ')}</div>` : ''}
          ${results.length ? `<div class="ticker"><div class="ticker-track">${[...results, ...results].map((r) => `<span>${r}</span>`).join('')}</div></div>` : ''}
        </footer>
      </div>`;
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-screen]');
    if (b) { screen = Number(b.dataset.screen); draw(); }
  });
  const timer = rotate ? setInterval(() => { screen = (screen + 1) % SCREENS.length; draw(); }, ROTATE_MS) : null;

  if (!fs) {
    draw();
    return () => { clearInterval(timer); document.body.classList.remove('tv-mode'); };
  }
  const unsubs = [
    watchEvent(fs, (ev) => { event = ev; settings = withDefaults(ev?.settings); draw(); }),
    watchList(fs, 'players', (list) => { players = list; draw(); }),
    watchList(fs, 'teams', (list) => { teams = list; draw(); }),
    watchList(fs, 'matches', (list) => {
      // Pháo giấy khi trận chung kết hoặc trận siêu kinh điển quyết định vừa kết thúc.
      const celebrate = !firstLoad && list.some((m) => ['final', 'clash-db'].includes(m.stage) && isFinished(m) && !isFinished({ status: knownStatus.get(m.id) }));
      list.forEach((m) => knownStatus.set(m.id, m.status));
      firstLoad = false;
      matches = list;
      draw();
      if (celebrate) confetti(document.body);
    }),
  ];
  draw();
  return () => {
    unsubs.forEach((u) => u());
    clearInterval(timer);
    document.body.classList.remove('tv-mode');
  };
}
