import { session, onSession, initFirebase, signIn, signOutUser, ROLE_LABEL, firestore } from './firebase.js';
import { startAutoAdvance } from './auto-advance.js';
import { isTestEvent, switchEvent, MAIN_EVENT_ID } from './data.js';
import { esc, icon } from './dom.js';
import * as home from './views/home.js';
import * as more from './views/more.js';
import * as rolesAdmin from './views/roles-admin.js';
import * as adminSettings from './views/admin-settings.js';
import * as adminPlayers from './views/admin-players.js';
import * as adminSchedule from './views/admin-schedule.js';
import * as schedule from './views/schedule.js';
import * as referee from './views/referee.js';
import * as matchScore from './views/match-score.js';
import * as matchView from './views/match-view.js';
import * as standings from './views/standings.js';
import * as tv from './views/tv.js';
import * as rules from './views/rules.js';
import * as qr from './views/qr.js';
import * as courtLive from './views/court-live.js';
import * as vote from './views/vote.js';
import * as exporter from './views/export.js';
import * as audit from './views/audit.js';

// Bốn mục của thanh menu chính.
const TABS = [
  { path: '/', label: 'Trực tiếp', icon: 'live' },
  { path: '/lich', label: 'Lịch', icon: 'calendar' },
  { path: '/xep-hang', label: 'Xếp hạng', icon: 'trophy' },
  { path: '/them', label: 'Thêm', icon: 'more' },
];

const ROUTES = {
  '/': { view: home, tab: '/' },
  '/lich': { view: schedule, tab: '/lich' },
  '/xep-lich': { view: adminSchedule, tab: '/them' },
  '/xep-hang': { view: standings, tab: '/xep-hang' },
  '/them': { view: more, tab: '/them' },
  '/phan-quyen': { view: rolesAdmin, tab: '/them' },
  '/cai-dat': { view: adminSettings, tab: '/them' },
  '/nguoi-choi': { view: adminPlayers, tab: '/them' },
  '/san-cua-toi': { view: referee, tab: '/them' },
  '/bam-diem': { view: matchScore, tab: '/them', param: true },
  '/tran': { view: matchView, tab: '/', param: true },
  '/tv': { view: tv, tab: '/them' },
  '/luat': { view: rules, tab: '/them' },
  '/qr': { view: qr, tab: '/them' },
  '/san': { view: courtLive, tab: '/', param: true },
  '/binh-chon': { view: vote, tab: '/them' },
  '/xuat': { view: exporter, tab: '/them' },
  '/nhat-ky': { view: audit, tab: '/them', param: true },
};

const viewEl = document.getElementById('view');
let cleanup = null;

// Đường dẫn "#/tran/abc" khớp trang "/tran" với tham số id = "abc".
// Phần sau dấu "?" là tham số, ví dụ "#/tv?xoay=0".
function currentRoute() {
  const [rawPath, qs = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  const path = rawPath || '/';
  const query = Object.fromEntries(new URLSearchParams(qs));
  if (ROUTES[path]) return { route: ROUTES[path], params: {}, query };
  const [, base, id] = path.match(/^(\/[^/]+)\/(.+)$/) || [];
  if (base && ROUTES[base]?.param) return { route: ROUTES[base], params: { id: decodeURIComponent(id) }, query };
  return { route: ROUTES['/'], params: {}, query };
}

function renderNav() {
  const active = currentRoute().route.tab;
  const html = TABS.map((t) => `
    <a class="tab" href="#${t.path}" ${t.path === active ? 'aria-current="page"' : ''}>
      ${icon(t.icon)}<span>${t.label}</span>
    </a>`).join('');
  document.getElementById('tabbar').innerHTML = html;
  document.getElementById('nav').innerHTML = html;
}

function accountHtml() {
  if (!session.configured) return '<span class="pill">Chế độ xem thử</span>';
  if (!session.ready) return '';
  if (!session.user) return '<button class="btn btn-ghost btn-small" data-action="sign-in">Đăng nhập</button>';
  const u = session.user;
  return `
    <div class="account">
      ${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : ''}
      <div class="who"><b>${esc(u.name)}</b>${esc(ROLE_LABEL[session.role] || session.role)}</div>
      <button class="btn btn-ghost btn-small" data-action="sign-out">Thoát</button>
    </div>`;
}

function renderChrome() {
  const html = accountHtml();
  document.getElementById('topbar-account').innerHTML = html;
  document.getElementById('sidebar-account').innerHTML = html;

  const banner = document.getElementById('banner');
  if (session.error) {
    banner.textContent = session.error;
    banner.hidden = false;
  } else if (!session.configured) {
    banner.innerHTML = '<b>Đang xem thử trên máy.</b> Website chưa nối với Firebase nên chưa đăng nhập hay lưu dữ liệu được. Làm theo hướng dẫn tạo Firebase rồi dán cấu hình vào <code>js/firebase-config.js</code>.';
    banner.hidden = false;
  } else if (isTestEvent()) {
    banner.innerHTML = '<b>Đang ở GIẢI THỬ.</b> Mọi thao tác ở đây không ảnh hưởng giải thật. <button class="btn btn-small" data-action="main-event">Về giải thật</button>';
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

function renderView() {
  if (cleanup) cleanup();
  cleanup = null;
  const { route, params, query } = currentRoute();
  // Mỗi lần mở trang dùng một khung mới: các bộ bắt sự kiện của trang cũ mất theo khung cũ,
  // nên không bị chạy chồng khi người dùng đi qua lại giữa các trang.
  const host = document.createElement('div');
  viewEl.replaceChildren(host);
  cleanup = route.view.render(host, { session, props: route.props, params, query }) || null;
  renderNav();
}

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'sign-in') signIn();
  if (action === 'sign-out') signOutUser();
  if (action === 'main-event') switchEvent(MAIN_EVENT_ID);
});

window.addEventListener('hashchange', () => {
  renderView();
  viewEl.focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

// Ban tổ chức đang mở trang nào thì máy đó lo tự điền nhánh đấu.
let stopAutoAdvance = null;
onSession(() => {
  if (session.role === 'admin' && !stopAutoAdvance && firestore()) stopAutoAdvance = startAutoAdvance(firestore());
  if (session.role !== 'admin' && stopAutoAdvance) { stopAutoAdvance(); stopAutoAdvance = null; }
  renderChrome();
  renderView();
});

renderChrome();
renderView();
initFirebase();
