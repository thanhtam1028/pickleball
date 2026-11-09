// Dựng bảng dữ liệu để xuất Excel/CSV. Mỗi trang tính là một mảng hàng, hàng đầu là tiêu đề.
import { rankTeams, classScore, isDone } from './standings.js';

const GENDER = { M: 'Nam', F: 'Nữ' };
const STATUS = { scheduled: 'Chờ', called: 'Đã gọi', live: 'Đang đánh', done: 'Xong', walkover: 'Xử thua' };

export function buildSheets({ players, teams, matches, settings, classes, drawOrder = {} }) {
  const nameOf = (id) => players.find((p) => p.id === id)?.name || '';
  const courtOf = (id) => settings.courts.find((c) => c.id === id)?.name || id || '';
  const sorted = [...matches].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || String(a.court).localeCompare(String(b.court)));
  const ranked = rankTeams(matches, teams, ['pool'], drawOrder);
  const score = classScore(matches, settings.classPoints, classes);

  return {
    'Người chơi': [
      ['Tên', 'Lớp', 'Giới tính', 'Trình độ', 'Đã đến'],
      ...[...players].sort((a, b) => a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name, 'vi'))
        .map((p) => [p.name, p.cls, GENDER[p.gender] || 'Chưa rõ', p.level, p.checkedIn ? 'Có' : 'Không']),
    ],
    'Cặp': [
      ['Tên cặp', 'Lớp', 'Người 1', 'Người 2'],
      ...teams.map((t) => [t.name, t.cls, nameOf(t.players[0]), nameOf(t.players[1])]),
    ],
    'Lịch và kết quả': [
      ['Giờ', 'Sân', 'Phần', 'Đội A', 'Đội B', 'Trạng thái', 'Tỷ số', 'Đội thắng', 'Tính điểm lớp', 'Ghi chú'],
      ...sorted.map((m) => [
        m.startAt, courtOf(m.court), m.label, m.a?.name || '', m.b?.name || '', STATUS[m.status] || m.status,
        (m.games || []).map((g) => `${g.a}-${g.b}`).join(', '),
        isDone(m) ? (m.winner === 'A' ? m.a?.name : m.b?.name) : '',
        m.countsForClass ? 'Có' : 'Không',
        m.walkoverReason || '',
      ]),
    ],
    'Xếp hạng': [
      ['Hạng', 'Cặp', 'Lớp', 'Số trận', 'Thắng', 'Thua', 'Hiệu số', 'Điểm ghi'],
      ...ranked.map((r, i) => [i + 1, r.name, r.cls, r.played, r.wins, r.losses, r.diff, r.pf]),
    ],
    'Điểm lớp': [
      ['Lớp', 'Vòng bảng', 'Tứ kết, bán kết', 'Chung kết', 'Siêu kinh điển', 'Tổng'],
      ...classes.map((c) => [c, score[c].pool, score[c].semi, score[c].final, score[c].clash, score[c].total]),
    ],
  };
}

// CSV có BOM để Excel đọc đúng tiếng Việt có dấu.
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}

// Nhà vô địch: đội thắng chung kết (nếu có) và lớp có tổng điểm cao hơn.
export function champions(matches, settings, classes) {
  const final = matches.find((m) => m.stage === 'final' && isDone(m));
  const score = classScore(matches, settings.classPoints, classes);
  const [c1, c2] = classes;
  const classWinner = score[c1].total === score[c2].total ? null : score[c1].total > score[c2].total ? c1 : c2;
  return {
    team: final ? (final.winner === 'A' ? final.a : final.b) : null,
    runnerUp: final ? (final.winner === 'A' ? final.b : final.a) : null,
    finalScore: final ? (final.games || []).map((g) => (final.winner === 'A' ? `${g.a}–${g.b}` : `${g.b}–${g.a}`)).join(', ') : '',
    classWinner,
    classScore: score,
  };
}
