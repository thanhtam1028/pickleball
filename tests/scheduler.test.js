import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixerRounds, crossClassPool, roundRobin, assignCourts, suggestFormat, suggestNext } from '../js/core/scheduler.js';
import { DEFAULT_SETTINGS } from '../js/core/settings.js';
import { toMin } from '../js/core/time.js';

const mkTeams = (cls, n) => Array.from({ length: n }, (_, i) => ({
  id: `${cls}-t${i}`, cls, name: `${cls} cặp ${i + 1}`, players: [`${cls}-p${2 * i}`, `${cls}-p${2 * i + 1}`],
}));
const mkPlayers = (cls, n) => Array.from({ length: n }, (_, i) => ({ id: `${cls}-p${i}`, name: `Người ${cls} ${i}`, cls }));
const courts = (n) => Array.from({ length: n }, (_, i) => ({ id: `san-${i + 1}`, name: `Sân ${i + 1}` }));

const perTeam = (matches) => {
  const c = new Map();
  matches.forEach((m) => [m.a.teamId, m.b.teamId].forEach((id) => c.set(id, (c.get(id) || 0) + 1)));
  return c;
};

function assertNoClash(slotted) {
  const bySlot = new Map();
  slotted.forEach((m) => {
    const s = bySlot.get(m.slot) || { courts: new Set(), people: new Set() };
    assert.ok(!s.courts.has(m.court), `trùng sân ${m.court} ở khung ${m.slot}`);
    s.courts.add(m.court);
    [...m.a.players, ...m.b.players].forEach((p) => {
      assert.ok(!s.people.has(p), `${p} đánh hai trận ở khung ${m.slot}`);
      s.people.add(p);
    });
    bySlot.set(m.slot, s);
  });
}

test('vòng bảng 8 cặp mỗi lớp, 3 trận mỗi cặp, toàn trận khác lớp', () => {
  const { matches, short } = crossClassPool(mkTeams('CEO 110', 8), mkTeams('CEO 111', 8), 3);
  assert.equal(matches.length, 24);
  assert.deepEqual(short, []);
  perTeam(matches).forEach((n) => assert.equal(n, 3));
  assert.ok(matches.every((m) => m.countsForClass && m.a.cls !== m.b.cls));
});

test('vòng bảng 5 cặp và 4 cặp: ai cũng đủ trận, trận cùng lớp không tính điểm lớp', () => {
  const { matches, short } = crossClassPool(mkTeams('CEO 110', 5), mkTeams('CEO 111', 4), 3);
  assert.equal(short.length <= 1, true, `thiếu trận: ${short}`);
  const counts = perTeam(matches);
  assert.ok([...counts.values()].every((n) => n >= 2 && n <= 3));
  matches.forEach((m) => assert.equal(m.countsForClass, m.a.cls !== m.b.cls));
  const pairs = matches.map((m) => [m.a.teamId, m.b.teamId].sort().join());
  assert.equal(new Set(pairs).size, pairs.length, 'có cặp gặp nhau hai lần');
});

test('vòng tròn 5 cặp: 10 trận, mỗi cặp 4 trận', () => {
  const matches = roundRobin(mkTeams('CEO 110', 5));
  assert.equal(matches.length, 10);
  perTeam(matches).forEach((n) => assert.equal(n, 4));
});

test('xếp sân: 24 trận, 2 sân, 15 phút: 12 khung, kết thúc sau 3 giờ, không trùng', () => {
  const { matches } = crossClassPool(mkTeams('CEO 110', 8), mkTeams('CEO 111', 8), 3);
  const r = assignCourts(matches, courts(2), 15, toMin('08:00'));
  assert.equal(r.matches.length, 24);
  assert.equal(r.slots, 12);
  assert.equal(r.endMin, toMin('11:00'));
  assertNoClash(r.matches);
});

test('xếp sân 3 sân: không ai đánh hai khung liền nhau khi còn lựa chọn', () => {
  const { matches } = crossClassPool(mkTeams('CEO 110', 8), mkTeams('CEO 111', 8), 3);
  const r = assignCourts(matches, courts(3), 12, toMin('08:00'));
  assertNoClash(r.matches);
  const slotsOf = new Map();
  r.matches.forEach((m) => [m.a.teamId, m.b.teamId].forEach((t) => slotsOf.set(t, [...(slotsOf.get(t) || []), m.slot])));
  let backToBack = 0;
  slotsOf.forEach((s) => { s.sort((x, y) => x - y); for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1] + 1) backToBack++; });
  assert.ok(backToBack <= 2, `${backToBack} lần đánh liền nhau`);
});

test('khởi động xoay cặp: mỗi đội 1 người mỗi lớp, không trùng người trong vòng, người dư nghỉ luân phiên', () => {
  const p110 = mkPlayers('CEO 110', 10);
  const p111 = mkPlayers('CEO 111', 8);
  const matches = mixerRounds(p110, p111, 3, 2);
  assert.equal(matches.length, 6);
  matches.forEach((m) => [m.a, m.b].forEach((s) => {
    assert.ok(s.players[0].startsWith('CEO 110') && s.players[1].startsWith('CEO 111'));
  }));
  const played = new Map();
  matches.forEach((m) => [...m.a.players, ...m.b.players].forEach((p) => played.set(p, (played.get(p) || 0) + 1)));
  const counts110 = p110.map((p) => played.get(p.id) || 0);
  assert.ok(Math.max(...counts110) - Math.min(...counts110) <= 1, `chênh lệch số trận ${counts110}`);
  assertNoClash(assignCourts(matches, courts(2), 12, 480).matches);
});

test('hàng chờ: không gọi người đang ở sân khác, ưu tiên người đã nghỉ', () => {
  const s = (id, ...players) => ({ teamId: id, players, name: id });
  const ms = [
    { id: 'm1', slot: 0, court: 'san-1', status: 'done', a: s('A', 'a1'), b: s('B', 'b1') },
    { id: 'm2', slot: 0, court: 'san-2', status: 'live', a: s('C', 'c1'), b: s('D', 'd1') },
    { id: 'm3', slot: 1, court: 'san-1', status: 'scheduled', a: s('A', 'a1'), b: s('E', 'e1') },
    { id: 'm4', slot: 1, court: 'san-2', status: 'scheduled', a: s('C', 'c1'), b: s('F', 'f1') },
    { id: 'm5', slot: 2, court: 'san-2', status: 'scheduled', a: s('E', 'e1'), b: s('F', 'f1') },
  ];
  assert.equal(suggestNext(ms, 'san-1').id, 'm5');
  ms[4].status = 'done';
  assert.equal(suggestNext(ms, 'san-1').id, 'm3');
});

const base = { ...DEFAULT_SETTINGS, startTime: '08:00', endTime: '12:00' };
const g = (male, female) => ({ male, female });

test('trợ lý: 16 người, 2 sân, 4 giờ', () => {
  const s = suggestFormat({ teamCounts: [4, 4], genderCounts: [g(5, 3), g(4, 4)], playerCounts: [8, 8], courtCount: 2, settings: base });
  assert.equal(s.fits, true);
  assert.ok(s.matchesPerTeam >= 3);
  assert.ok(toMin(s.endTime) <= toMin('12:00'));
});

test('trợ lý: 10 người, 1 sân, 2 giờ', () => {
  const s = suggestFormat({ teamCounts: [3, 2], genderCounts: [g(3, 3), g(2, 2)], playerCounts: [6, 4], courtCount: 1, settings: { ...base, endTime: '10:00' } });
  assert.equal(s.fits, true);
  assert.equal(s.pointsToWin, 11);
  assert.ok(toMin(s.endTime) <= toMin('10:00'));
});

test('trợ lý: 24 người, 4 sân, 3 giờ', () => {
  const s = suggestFormat({ teamCounts: [6, 6], genderCounts: [g(6, 6), g(6, 6)], playerCounts: [12, 12], courtCount: 4, settings: { ...base, endTime: '11:00' } });
  assert.equal(s.fits, true);
  assert.ok(s.matchesPerTeam >= 3);
  assert.ok(toMin(s.endTime) <= toMin('11:00'));
});

test('trợ lý: lớp không có nữ thì không xếp siêu kinh điển', () => {
  const s = suggestFormat({ teamCounts: [4, 4], genderCounts: [g(8, 0), g(4, 4)], playerCounts: [8, 8], courtCount: 2, settings: { ...base, stages: { ...base.stages, clash: true } } });
  assert.equal(s.clash, false);
  assert.ok(s.reasons.some((r) => r.includes('siêu kinh điển')));
});

test('trợ lý: khung giờ quá ngắn thì báo không kịp và gợi ý', () => {
  const s = suggestFormat({ teamCounts: [8, 8], genderCounts: [g(8, 8), g(8, 8)], playerCounts: [16, 16], courtCount: 1, settings: { ...base, endTime: '08:20' } });
  assert.equal(s.fits, false);
  assert.ok(s.reasons.at(-1).includes('Không đủ thời gian'));
});

test('trợ lý: chưa có cặp thì nhắc ghép cặp', () => {
  const s = suggestFormat({ teamCounts: [0, 4], genderCounts: [g(0, 0), g(4, 4)], playerCounts: [10, 8], courtCount: 2, settings: base });
  assert.equal(s.fits, false);
  assert.ok(s.reasons.at(-1).includes('ghép cặp'));
});
