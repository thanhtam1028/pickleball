import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { rulesFor, initialState, applyEvent, callout, serveSide } from '../core/scoring.js';

// Sơ đồ sân nhìn từ trên xuống: lưới ở giữa, vùng bếp sát lưới, ô giao bóng phải và trái.
const COURT_SVG = `
<svg viewBox="0 0 320 160" class="rule-svg" role="img" aria-label="Sơ đồ sân Pickleball nhìn từ trên xuống">
  <rect x="10" y="10" width="300" height="140" class="r-court"/>
  <rect x="124" y="10" width="36" height="140" class="r-kitchen"/>
  <rect x="160" y="10" width="36" height="140" class="r-kitchen"/>
  <line x1="160" y1="4" x2="160" y2="156" class="r-net"/>
  <line x1="10" y1="80" x2="124" y2="80" class="r-line"/>
  <line x1="196" y1="80" x2="310" y2="80" class="r-line"/>
  <text x="160" y="84" class="r-text strong">Lưới</text>
  <text x="142" y="30" class="r-text small">Bếp</text><text x="178" y="30" class="r-text small">Bếp</text>
  <text x="67" y="48" class="r-text">Ô trái</text><text x="67" y="118" class="r-text">Ô phải</text>
  <text x="253" y="48" class="r-text">Ô phải</text><text x="253" y="118" class="r-text">Ô trái</text>
</svg>`;

// Giao bóng chéo sân: bóng đi từ ô phải bên này sang ô chéo bên kia, phải qua khỏi vùng bếp.
const SERVE_SVG = `
<svg viewBox="0 0 320 160" class="rule-svg" role="img" aria-label="Giao bóng chéo sân, bóng phải rơi qua khỏi vùng bếp">
  <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" class="r-arrowhead"/></marker></defs>
  <rect x="10" y="10" width="300" height="140" class="r-court"/>
  <rect x="124" y="10" width="72" height="140" class="r-kitchen"/>
  <line x1="160" y1="4" x2="160" y2="156" class="r-net"/>
  <line x1="10" y1="80" x2="124" y2="80" class="r-line"/><line x1="196" y1="80" x2="310" y2="80" class="r-line"/>
  <circle cx="18" cy="118" r="7" class="r-player"/>
  <path d="M26 114 Q160 20 262 44" class="r-path" marker-end="url(#arrow)"/>
  <rect x="196" y="10" width="114" height="70" class="r-target"/>
  <text x="253" y="68" class="r-text strong">Bóng rơi ở đây</text>
  <text x="18" y="142" class="r-text small">Người giao</text>
</svg>`;

// Luật hai lần nảy: bóng giao nảy một lần, bóng trả giao nảy một lần, sau đó mới được đánh trên không.
const BOUNCE_SVG = `
<svg viewBox="0 0 320 120" class="rule-svg" role="img" aria-label="Luật hai lần nảy">
  <line x1="10" y1="100" x2="310" y2="100" class="r-line"/>
  <line x1="160" y1="40" x2="160" y2="100" class="r-net"/>
  <path d="M20 60 Q110 0 220 100" class="r-path"/><circle cx="220" cy="100" r="5" class="r-bounce"/>
  <path d="M220 100 Q250 60 290 70" class="r-path"/>
  <path d="M290 70 Q190 10 100 100" class="r-path alt"/><circle cx="100" cy="100" r="5" class="r-bounce"/>
  <text x="220" y="116" class="r-text small">Nảy 1</text><text x="100" y="116" class="r-text small">Nảy 2</text>
  <text x="160" y="20" class="r-text">Sau 2 lần nảy mới được đánh vô lê</text>
</svg>`;

function eventRulesText(s) {
  const mode = s.scoringMode === 'rally' ? 'mỗi pha một điểm (ai thắng pha thì được điểm)' : 'chỉ đội giao bóng mới được điểm (cách truyền thống)';
  return `
    <ul class="rule-list">
      <li>Cách tính điểm: <b>${mode}</b>.</li>
      <li>Mỗi ván chơi tới <b>${s.pointsToWin}</b> điểm, phải hơn <b>${s.winBy}</b> điểm${s.pointCap ? `, tối đa <b>${s.pointCap}</b> điểm (ai chạm trước thắng)` : ''}.</li>
      <li>Mỗi trận: <b>${s.gamesPerMatch === 3 ? 'thắng 2 trong 3 ván' : '1 ván'}</b>. Mỗi đội được hội ý <b>${s.timeoutsPerGame}</b> lần mỗi ván.</li>
      ${s.scoringMode === 'rally' && s.rallyWinOnServeOnly ? '<li>Điểm quyết định ván phải thắng khi đang giao bóng.</li>' : ''}
      <li>Ở ván quyết định, hai đội đổi sân khi một đội đạt <b>${Math.ceil(s.pointsToWin / 2)}</b> điểm. Trọng tài sẽ nhắc.</li>
    </ul>`;
}

export function render(el) {
  let settings = withDefaults();
  let demo = null;
  let demoLog = [];

  const resetDemo = () => {
    demo = initialState(rulesFor(settings), 'A');
    demoLog = [];
  };

  function demoHtml() {
    const sideout = settings.scoringMode === 'sideout';
    return `
      <p class="muted">Bấm thử để xem cách đọc điểm theo luật của giải này. Câu đọc điểm luôn bắt đầu bằng điểm của <b>đội đang giao</b>${sideout ? ', số cuối là người giao thứ mấy của đội đó (1 hoặc 2)' : ''}.</p>
      <div class="demo-callout">${esc(callout(demo))}</div>
      <p class="center small">Đội ${demo.server === 'A' ? 'Xanh' : 'Cam'} đang giao, người giao đứng <b>ô ${serveSide(demo) === 'right' ? 'phải' : 'trái'}</b>.</p>
      <div class="btn-row demo-btns">
        <button class="btn demo-a" data-demo="A">Đội Xanh thắng pha</button>
        <button class="btn demo-b" data-demo="B">Đội Cam thắng pha</button>
        <button class="btn btn-ghost" data-demo="reset">Làm lại</button>
      </div>
      ${demoLog.length ? `<p class="muted small">Đã bấm: ${demoLog.map((x) => (x === 'A' ? 'Xanh' : 'Cam')).join(', ')}</p>` : ''}
      ${sideout ? '<p class="muted small">Đầu ván đọc "0 – 0 – 2" vì lượt đầu tiên đội giao trước chỉ có 1 người giao.</p>' : ''}`;
  }

  function draw() {
    if (!demo) resetDemo();
    el.innerHTML = `
      <h1>Luật cho người mới</h1>
      <div class="rule-grid">
        <section class="card"><h2>1. Sân và vùng bếp</h2>${COURT_SVG}
          <p>Sân nhỏ cỡ sân cầu lông đôi. Sát lưới mỗi bên có <b>vùng bếp</b> (non-volley zone) rộng khoảng 2,1 m. Đứng trong bếp thì <b>không được đánh bóng khi bóng chưa chạm đất</b>. Bóng đã nảy thì vào bếp đánh thoải mái.</p></section>
        <section class="card"><h2>2. Giao bóng</h2>${SERVE_SVG}
          <p>Giao bóng <b>từ dưới lên</b>, tay chạm bóng thấp hơn thắt lưng, đứng sau vạch cuối sân. Bóng đi <b>chéo sân</b> và phải rơi <b>qua khỏi vùng bếp</b> bên kia. Người giao đứng ô phải khi điểm đội mình là số chẵn, ô trái khi là số lẻ.</p></section>
        <section class="card"><h2>3. Luật hai lần nảy</h2>${BOUNCE_SVG}
          <p>Bóng giao phải nảy một lần trước khi đội nhận đánh trả. Bóng trả giao cũng phải nảy một lần. Sau hai lần nảy đó hai bên mới được <b>đánh vô lê</b> (đánh bóng trên không).</p></section>
        <section class="card"><h2>4. Cách đọc điểm (bấm thử)</h2><div id="demo">${demoHtml()}</div></section>
        <section class="card"><h2>5. Lỗi thường gặp</h2>
          <ul class="rule-list">
            <li>Đánh vô lê khi chân đang chạm vạch hoặc ở trong vùng bếp.</li>
            <li>Đánh vô lê quả trả giao bóng (chưa đủ hai lần nảy).</li>
            <li>Giao bóng rơi vào vùng bếp hoặc sai ô chéo.</li>
            <li>Bóng ra ngoài vạch biên (bóng chạm vạch vẫn là bóng trong, trừ quả giao chạm vạch bếp).</li>
            <li>Bóng chạm người hoặc quần áo của mình.</li>
          </ul></section>
        <section class="card"><h2>6. Luật của giải này</h2>${eventRulesText(settings)}
          <p class="muted small">Trọng tài bấm điểm trên điện thoại, website tự đọc điểm và nhắc đổi sân.</p></section>
      </div>`;
  }

  el.addEventListener('click', (e) => {
    const v = e.target.closest('[data-demo]')?.dataset.demo;
    if (!v) return;
    if (v === 'reset') resetDemo();
    else if (!demo.matchOver) {
      demo = applyEvent(demo, { type: 'rally', winner: v });
      demoLog.push(v);
    }
    el.querySelector('#demo').innerHTML = demoHtml();
  });

  const fs = firestore();
  draw();
  if (!fs) return null;
  const unsub = watchEvent(fs, (ev) => {
    const next = withDefaults(ev?.settings);
    const changed = next.scoringMode !== settings.scoringMode;
    settings = next;
    if (changed) resetDemo();
    draw();
  });
  return unsub;
}
