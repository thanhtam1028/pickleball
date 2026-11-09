import { esc } from '../dom.js';

const PUBLIC_LINKS = [
  ['#/luat', 'Luật cho người mới'],
  ['#/tv', 'Màn hình TV'],
  ['#/qr', 'Mã QR cho sân'],
  ['#/binh-chon', 'Bình chọn MVP'],
  ['#/xuat', 'Xuất kết quả'],
];

// Trang "Thêm": các mục cho mọi người, không cần đăng nhập. Đăng nhập và quản lý nằm ở nút "Quản trị".
export function render(el) {
  el.innerHTML = `
    <div class="stack">
      <h1>Thêm</h1>
      <section class="card"><ul class="list">${PUBLIC_LINKS.map(([href, label]) => `
        <li><a class="list-item" href="${href}"><span>${esc(label)}</span><span class="chev">›</span></a></li>`).join('')}</ul></section>
      <p class="muted small">Ban tổ chức và trọng tài: vào mục <a href="#/quan-tri"><b>Quản trị</b></a> để đăng nhập.</p>
    </div>`;
}
