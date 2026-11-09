// Nạp thư viện ngoài từ CDN khi cần (phiên bản cố định), để trang đầu tải nhanh.
const loaded = new Map();

export function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => {
        loaded.delete(src);
        reject(new Error(`Không tải được thư viện ${globalName}. Kiểm tra mạng rồi thử lại.`));
      };
      document.head.append(s);
    }));
  }
  return loaded.get(src);
}

export const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
export const XLSX_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

// Địa chỉ công khai của website. Khi đang chạy thử trên máy (localhost), mã QR vẫn trỏ về địa chỉ thật
// để in ra dùng được ngay; còn khi đã đưa lên mạng thì dùng đúng địa chỉ đang mở.
export const PUBLIC_BASE = 'https://pickleball.tcaoadm.com/';
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export function siteUrl(hash = '') {
  return `${isLocal() ? PUBLIC_BASE : `${location.origin}${location.pathname}`}${hash}`;
}
