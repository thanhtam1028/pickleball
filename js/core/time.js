// Đổi giờ "HH:MM" sang số phút trong ngày và ngược lại.
export function toMin(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fmtMin(total) {
  const t = Math.max(0, Math.round(total));
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
