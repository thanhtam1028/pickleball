import { esc } from './dom.js';
import { toMin } from './core/time.js';

export const STATUS_LABEL = {
  scheduled: 'Chờ',
  called: 'Đã gọi vào sân',
  live: 'Đang đánh',
  done: 'Xong',
  walkover: 'Xử thua',
};

export const STAGES = [
  { id: 'warmup', label: 'Khởi động' },
  { id: 'pool', label: 'Vòng bảng' },
  { id: 'playoff', label: 'Chung kết', stages: ['quarter', 'semi', 'final', 'third'] },
  { id: 'clash', label: 'Siêu kinh điển', stages: ['clash', 'clash-db'] },
];

// Nhóm giai đoạn (trên giao diện) mà một trận thuộc về.
export function stageGroup(stage) {
  return STAGES.find((s) => s.id === stage || s.stages?.includes(stage))?.id || stage;
}

export const isFinished = (m) => m.status === 'done' || m.status === 'walkover';
export const isOnCourt = (m) => m.status === 'called' || m.status === 'live';

export function courtName(courts, id) {
  return courts.find((c) => c.id === id)?.name || id || '—';
}

export function sideLabel(side, srcLabel) {
  if (side) return esc(side.name);
  return `<span class="muted">${esc(srcLabel || 'Chờ kết quả')}</span>`;
}

const SRC_TEXT = { winner: 'Thắng', loser: 'Thua' };
const KEY_TEXT = { 'semi-1': 'bán kết 1', 'semi-2': 'bán kết 2', 'qf-1': 'tứ kết 1', 'qf-2': 'tứ kết 2', 'qf-3': 'tứ kết 3', 'qf-4': 'tứ kết 4' };
export const srcLabel = (src) => (src ? `${SRC_TEXT[src.take]} ${KEY_TEXT[src.key] || src.key}` : '');

export function scoreText(m) {
  if (!m.games?.length) return '';
  return m.games.map((g) => `${g.a}–${g.b}`).join(', ');
}

export const sortMatches = (list) => [...list].sort((x, y) => (x.slot ?? 0) - (y.slot ?? 0) || String(x.court).localeCompare(String(y.court)));

// Giờ kết thúc của trận muộn nhất đã xếp, để phần sau nối tiếp.
export function lastEnd(matches, minutesPerMatch) {
  return matches.reduce((mx, m) => Math.max(mx, toMin(m.startAt) + minutesPerMatch), 0);
}
