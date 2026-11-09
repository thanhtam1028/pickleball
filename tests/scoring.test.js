import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rulesFor, initialState, applyEvent, replay, callout, serveSide, parseGamesText } from '../js/core/scoring.js';
import { DEFAULT_SETTINGS } from '../js/core/settings.js';

const sideout = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'sideout', pointCap: null, gamesPerMatch: 1 });
const rally = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'rally', pointCap: null });
const R = (w) => ({ type: 'rally', winner: w });
const seq = (str) => [...str].map(R);
const run = (rules, events, first = 'A') => replay(rules, first, events);

test('truyền thống: đầu ván đọc "0 – 0 – 2", đội giao thua pha đầu thì đổi sang đội kia "0 – 0 – 1"', () => {
  assert.equal(callout(initialState(sideout, 'A')), '0 – 0 – 2');
  const s = run(sideout, seq('B'));
  assert.equal(s.server, 'B');
  assert.equal(callout(s), '0 – 0 – 1');
});

test('truyền thống: chuỗi A, A, B, B, B đọc điểm đúng sau từng pha', () => {
  const expected = ['1 – 0 – 2', '2 – 0 – 2', '0 – 2 – 1', '1 – 2 – 1', '2 – 2 – 1'];
  let s = initialState(sideout, 'A');
  seq('AABBB').forEach((ev, i) => {
    s = applyEvent(s, ev);
    assert.equal(callout(s), expected[i], `sau pha ${i + 1}`);
  });
});

test('truyền thống: người số 1 mất pha thì người số 2 cùng đội giao, rồi mới đổi đội', () => {
  let s = run(sideout, seq('B'));
  s = applyEvent(s, R('A'));
  assert.equal(s.server, 'B');
  assert.equal(callout(s), '0 – 0 – 2');
  s = applyEvent(s, R('A'));
  assert.equal(s.server, 'A');
  assert.equal(callout(s), '0 – 0 – 1');
});

test('người giao đứng ô phải khi điểm đội giao chẵn, đổi ô với đồng đội khi ghi điểm', () => {
  let s = initialState(rally, 'A');
  assert.equal(serveSide(s), 'right');
  const before = s.serverIdx;
  s = applyEvent(s, R('A'));
  assert.equal(serveSide(s), 'left');
  assert.equal(s.serverIdx, before, 'cùng người giao tiếp');
  assert.equal(s.right.A, 1, 'đồng đội sang ô phải');
});

test('10–10 tới 11 chưa thắng; 12–10 thắng', () => {
  const tenTen = seq('AB'.repeat(10));
  let s = run(rally, [...tenTen, R('A')]);
  assert.equal(s.matchOver, false);
  assert.deepEqual([s.a, s.b], [11, 10]);
  s = run(rally, [...tenTen, R('A'), R('A')]);
  assert.equal(s.matchOver, true);
  assert.equal(s.winner, 'A');
  assert.deepEqual(s.games, [{ a: 12, b: 10 }]);
});

test('điểm tối đa 15: 15–14 thắng', () => {
  const capped = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'rally', pointCap: 15 });
  const s = run(capped, [...seq('AB'.repeat(14)), R('A')]);
  assert.equal(s.matchOver, true);
  assert.deepEqual(s.games, [{ a: 15, b: 14 }]);
});

test('thắng 2 trong 3 ván: hết ván 1 sang ván 2, đội nhận ở ván 1 giao trước ván 2', () => {
  const bo3 = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'rally', pointCap: null, gamesPerMatch: 3 });
  let s = run(bo3, seq('A'.repeat(11)), 'A');
  assert.equal(s.matchOver, false);
  assert.equal(s.gameNo, 2);
  assert.deepEqual(s.games, [{ a: 11, b: 0 }]);
  assert.equal(s.server, 'B');
  assert.deepEqual([s.a, s.b], [0, 0]);
  s = run(bo3, seq('A'.repeat(22)), 'A');
  assert.equal(s.matchOver, true);
  assert.equal(s.winner, 'A');
});

test('ván quyết định tới 11: nhắc đổi sân đúng một lần khi một đội đạt 6', () => {
  let s = initialState(rally, 'A');
  const switchAt = [];
  seq('AAAAAABBBBBBA').forEach((ev, i) => {
    s = applyEvent(s, ev);
    if (s.alerts.includes('switch')) switchAt.push(i + 1);
  });
  assert.deepEqual(switchAt, [6]);
});

test('thắng 2 trong 3: ván 1 không nhắc đổi sân, ván 3 có', () => {
  const bo3 = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'rally', pointCap: null, gamesPerMatch: 3 });
  let s = initialState(bo3, 'A');
  const alerts = [];
  [...seq('A'.repeat(11)), ...seq('B'.repeat(11)), ...seq('A'.repeat(6))].forEach((ev) => {
    s = applyEvent(s, ev);
    if (s.alerts.includes('switch')) alerts.push(`${s.gameNo}:${s.a}-${s.b}`);
  });
  assert.deepEqual(alerts, ['3:6-0']);
});

test('hoàn tác 3 pha cho trạng thái giống hệt trước 3 pha đó', () => {
  const base = seq('AABABBBA');
  const before = run(sideout, base);
  const after = run(sideout, [...base, ...seq('BAB'), { type: 'undo' }, { type: 'undo' }, { type: 'undo' }]);
  const strip = (s) => ({ ...s, alerts: [] });
  assert.deepEqual(strip(after), strip(before));
});

test('hội ý: trừ lượt, hết lượt thì không trừ nữa, sang ván mới được lại', () => {
  let s = initialState(rally, 'A');
  s = applyEvent(s, { type: 'timeout', team: 'B' });
  s = applyEvent(s, { type: 'timeout', team: 'B' });
  s = applyEvent(s, { type: 'timeout', team: 'B' });
  assert.equal(s.timeouts.B, 0);
  assert.equal(s.timeouts.A, 2);
});

test('mỗi pha một điểm: đội nhận thắng pha được điểm và giành quyền giao', () => {
  const s = run(rally, seq('B'));
  assert.deepEqual([s.a, s.b, s.server], [0, 1, 'B']);
  assert.equal(callout(s), '1 – 0');
});

test('mỗi pha một điểm có "thắng khi đang giao": đội nhận ở điểm quyết định chỉ giành quyền giao', () => {
  const freeze = rulesFor({ ...DEFAULT_SETTINGS, scoringMode: 'rally', pointCap: null, rallyWinOnServeOnly: true });
  // A dẫn 10–5 nhưng B đang giao. A thắng pha: pha này sẽ kết thúc ván nên A chỉ giành quyền giao.
  let s = run(freeze, [...seq('A'.repeat(10)), ...seq('B'.repeat(5))]);
  assert.deepEqual([s.a, s.b, s.server], [10, 5, 'B']);
  s = applyEvent(s, R('A'));
  assert.deepEqual([s.a, s.b, s.server, s.matchOver], [10, 5, 'A', false]);
  s = applyEvent(s, R('A'));
  assert.equal(s.matchOver, true);
  assert.deepEqual(s.games, [{ a: 11, b: 5 }]);
});

test('mỗi pha một điểm không bật "thắng khi đang giao": đội nhận thắng ván ngay', () => {
  const s = run(rally, [...seq('A'.repeat(10)), ...seq('B'.repeat(5)), R('A')]);
  assert.equal(s.matchOver, true);
  assert.deepEqual(s.games, [{ a: 11, b: 5 }]);
  const t = run(rally, [...seq('A'.repeat(10)), ...seq('B'.repeat(11))]);
  assert.equal(t.matchOver, false, '10–11 chưa hơn 2 điểm');
});

test('trận phân định: đánh đơn tới 21, nhắc đổi người mỗi 4 điểm', () => {
  const db = rulesFor(DEFAULT_SETTINGS, { stage: 'clash-db' });
  let s = initialState(db, 'A');
  const rotateAt = [];
  seq('ABABABAB').forEach((ev) => {
    s = applyEvent(s, ev);
    if (s.alerts.includes('rotate')) rotateAt.push(s.a + s.b);
  });
  assert.deepEqual(rotateAt, [4, 8]);
  assert.equal(callout(s).split('–').length, 2);
});

test('trận đã xong thì bấm thêm không đổi gì', () => {
  const s = run(rally, seq('A'.repeat(11)));
  assert.equal(applyEvent(s, R('B')), s);
});

test('đọc tỷ số gõ tay', () => {
  assert.deepEqual(parseGamesText('11-7'), { games: [{ a: 11, b: 7 }], winner: 'A' });
  assert.deepEqual(parseGamesText('11-7, 9 – 11, 5:11', 3), { games: [{ a: 11, b: 7 }, { a: 9, b: 11 }, { a: 5, b: 11 }], winner: 'B' });
  assert.ok(parseGamesText('').error);
  assert.ok(parseGamesText('11-11').error);
  assert.ok(parseGamesText('11-7, 7-11', 3).error);
  assert.ok(parseGamesText('mười-bảy').error);
});
