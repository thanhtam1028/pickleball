import { firestore } from '../firebase.js';
import { watchEvent, watchList, CLASSES } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { buildSheets, toCsv, champions } from '../core/export.js';
import { loadScript, XLSX_LIB } from '../lib-loader.js';

const today = () => new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Ngắt chữ dài thành nhiều dòng vừa khung.
function wrap(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  });
  if (line) lines.push(line);
  return lines;
}

// Ảnh chúc mừng 1080×1350 để đăng nhóm lớp.
function drawCertificate(canvas, info) {
  const ctx = canvas.getContext('2d');
  const W = 1080;
  const H = 1350;
  canvas.width = W;
  canvas.height = H;
  const font = (w, s) => `${w} ${s}px "Be Vietnam Pro", system-ui, sans-serif`;
  ctx.fillStyle = '#0f3d2e';
  ctx.fillRect(0, 0, W, H);
  // Quả bóng trang trí
  ctx.fillStyle = '#d7e84a';
  ctx.beginPath(); ctx.arc(W - 150, 170, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  [[-30, -25], [25, -10], [-5, 30], [35, 35], [-40, 15]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(W - 150 + dx, 170 + dy, 9, 0, Math.PI * 2); ctx.fill(); });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = font(600, 40);
  ctx.fillText('ĐẠI CHIẾN PICKLEBALL', W / 2, 340);
  ctx.font = font(800, 64);
  ctx.fillText('CEO 110 – CEO 111', W / 2, 420);
  ctx.fillStyle = '#d7e84a';
  ctx.fillRect(W / 2 - 80, 470, 160, 6);

  let y = 580;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = font(600, 36);
  ctx.fillText('CẶP VÔ ĐỊCH', W / 2, y);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 84);
  wrap(ctx, info.team?.name || 'Chưa có chung kết', W - 160).forEach((l) => { y += 100; ctx.fillText(l, W / 2, y); });
  if (info.players.length) {
    ctx.font = font(500, 38);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    y += 64;
    ctx.fillText(info.players.join(' · '), W / 2, y);
  }
  if (info.finalScore) {
    ctx.font = font(700, 44);
    ctx.fillStyle = '#d7e84a';
    y += 76;
    ctx.fillText(`Chung kết ${info.finalScore}`, W / 2, y);
  }

  y = Math.max(y + 130, 1040);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = font(600, 36);
  ctx.fillText('LỚP VÔ ĐỊCH', W / 2, y);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 72);
  ctx.fillText(info.classWinner || 'Hòa', W / 2, y + 84);
  ctx.font = font(500, 34);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText(info.classLine, W / 2, y + 140);
  ctx.font = font(500, 28);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.fillText(info.date, W / 2, H - 50);
}

// Xuất kết quả: Excel 5 trang tính, CSV dự phòng, ảnh chúc mừng nhà vô địch.
export function render(el) {
  el.innerHTML = '<h1>Xuất kết quả</h1>';
  const fs = firestore();
  if (!fs) {
    el.insertAdjacentHTML('beforeend', '<div class="card"><p class="muted">Chưa kết nối Firebase.</p></div>');
    return null;
  }
  let event = null;
  let settings = withDefaults();
  let players = [];
  let teams = [];
  let matches = [];

  el.insertAdjacentHTML('beforeend', `
    <div class="stack">
      <section class="card">
        <h2>Bảng kết quả</h2>
        <p class="muted">File Excel gồm 5 trang tính: Người chơi, Cặp, Lịch và kết quả, Xếp hạng, Điểm lớp.</p>
        <div class="btn-row">
          <button class="btn" data-act="xlsx">Tải Excel</button>
          <button class="btn btn-ghost" data-act="csv">Tải CSV lịch và kết quả</button>
        </div>
        <p class="note" id="export-err" hidden></p>
      </section>
      <section class="card">
        <h2>Ảnh chúc mừng</h2>
        <p class="muted" id="cert-note"></p>
        <canvas id="cert" class="cert-canvas" aria-label="Ảnh chúc mừng nhà vô địch"></canvas>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn" data-act="save-img">Lưu ảnh</button>
          <button class="btn btn-ghost" data-act="share-img" hidden>Chia sẻ</button>
        </div>
      </section>
    </div>`);
  const $ = (s) => el.querySelector(s);
  if (navigator.canShare) $('[data-act="share-img"]').hidden = false;

  const sheets = () => buildSheets({ players, teams, matches, settings, classes: CLASSES, drawOrder: event?.drawOrder || {} });
  const fileBase = () => `ket-qua-dai-chien-ceo-${new Date().toISOString().slice(0, 10)}`;

  function certInfo() {
    const c = champions(matches, settings, CLASSES);
    return {
      ...c,
      players: (c.team?.players || []).map((id) => players.find((p) => p.id === id)?.name).filter(Boolean),
      classLine: CLASSES.map((x) => `${x}: ${c.classScore[x].total} điểm`).join('   ·   '),
      date: today(),
    };
  }

  function drawCert() {
    const info = certInfo();
    $('#cert-note').textContent = info.team
      ? 'Ảnh tự cập nhật theo kết quả chung kết và điểm lớp.'
      : 'Chưa có trận chung kết nào xong. Ảnh sẽ tự điền khi có kết quả.';
    drawCertificate($('#cert'), info);
  }

  const canvasBlob = () => new Promise((resolve) => $('#cert').toBlob(resolve, 'image/png'));

  el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const err = $('#export-err');
    err.hidden = true;
    try {
      if (act === 'xlsx') {
        const XLSX = await loadScript(XLSX_LIB, 'XLSX');
        const wb = XLSX.utils.book_new();
        Object.entries(sheets()).forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name));
        XLSX.writeFile(wb, `${fileBase()}.xlsx`);
      } else if (act === 'csv') {
        download(new Blob([toCsv(sheets()['Lịch và kết quả'])], { type: 'text/csv;charset=utf-8' }), `${fileBase()}.csv`);
      } else if (act === 'save-img') {
        download(await canvasBlob(), 'chuc-mung-vo-dich.png');
      } else if (act === 'share-img') {
        const file = new File([await canvasBlob()], 'chuc-mung-vo-dich.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Đại chiến CEO 110 – CEO 111' });
        else download(file, file.name);
      }
    } catch (ex) {
      if (ex.name === 'AbortError') return;
      err.textContent = ex.message;
      err.hidden = false;
    }
  });

  const unsubs = [
    watchEvent(fs, (ev) => { event = ev; settings = withDefaults(ev?.settings); drawCert(); }),
    watchList(fs, 'players', (list) => { players = list; drawCert(); }),
    watchList(fs, 'teams', (list) => { teams = list; }),
    watchList(fs, 'matches', (list) => { matches = list; drawCert(); }),
  ];
  // Vẽ lại khi phông chữ tải xong để chữ trên ảnh đúng kiểu.
  document.fonts?.ready.then(drawCert);
  drawCert();
  return () => unsubs.forEach((u) => u());
}

