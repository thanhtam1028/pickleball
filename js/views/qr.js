import { esc } from '../dom.js';
import { firestore } from '../firebase.js';
import { watchEvent } from '../data.js';
import { withDefaults } from '../core/settings.js';
import { loadScript, QR_LIB, siteUrl } from '../lib-loader.js';

// Trang in mã QR: mỗi sân một mã dẫn tới trang trực tiếp của sân đó, thêm mã cho trang chủ và lịch.
export function render(el) {
  let settings = withDefaults();
  let qrFactory = null;
  let error = '';

  const qrSvg = (url) => {
    if (!qrFactory) return '<div class="qr-placeholder">Đang tạo mã…</div>';
    const qr = qrFactory(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  };

  function card(title, sub, hash) {
    const url = siteUrl(hash);
    return `<figure class="qr-card">
      <figcaption><b>${esc(title)}</b><span class="muted small">${esc(sub)}</span></figcaption>
      <div class="qr-img">${qrSvg(url)}</div>
      <span class="qr-url small">${esc(url)}</span>
    </figure>`;
  }

  function draw() {
    el.innerHTML = `
      <div class="row-between no-print"><h1>Mã QR</h1><button class="btn" data-act="print">In trang này</button></div>
      <p class="muted no-print">In ra và dán ở từng sân. Khán giả quét mã là thấy tỷ số trực tiếp của sân đó, không cần đăng nhập.</p>
      ${error ? `<p class="note">${esc(error)}</p>` : ''}
      <div class="qr-grid">
        ${settings.courts.map((c) => card(c.name, 'Tỷ số trực tiếp của sân', `#/san/${c.id}`)).join('')}
        ${card('Đại chiến CEO 110 – CEO 111', 'Trang chủ: điểm hai lớp, các sân', '#/')}
        ${card('Lịch thi đấu', 'Tìm tên mình để xem trận', '#/lich')}
      </div>`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="print"]')) window.print();
  });

  loadScript(QR_LIB, 'qrcode').then((f) => { qrFactory = f; draw(); }).catch((err) => { error = err.message; draw(); });
  draw();
  const fs = firestore();
  if (!fs) return null;
  return watchEvent(fs, (ev) => { settings = withDefaults(ev?.settings); draw(); });
}
