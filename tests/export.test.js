import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSheets, toCsv, champions } from '../js/core/export.js';
import { DEFAULT_SETTINGS } from '../js/core/settings.js';

const CLASSES = ['CEO 110', 'CEO 111'];
const players = [
  { id: 'p1', name: 'An', cls: 'CEO 110', gender: 'M', level: 3, checkedIn: true },
  { id: 'p2', name: 'Bình', cls: 'CEO 110', gender: null, level: 2 },
  { id: 'p3', name: 'Chi', cls: 'CEO 111', gender: 'F', level: 4 },
  { id: 'p4', name: 'Dũng', cls: 'CEO 111', gender: 'M', level: 1 },
];
const teams = [
  { id: 't1', name: 'An & Bình', cls: 'CEO 110', players: ['p1', 'p2'] },
  { id: 't2', name: 'Chi & Dũng', cls: 'CEO 111', players: ['p3', 'p4'] },
];
const side = (t) => ({ teamId: t.id, players: t.players, name: t.name, cls: t.cls });
const matches = [
  { stage: 'pool', label: 'Vòng bảng', slot: 0, court: 'san-1', startAt: '08:00', status: 'done', a: side(teams[0]), b: side(teams[1]), games: [{ a: 11, b: 7 }], winner: 'A', countsForClass: true },
  { stage: 'final', label: 'Chung kết', slot: 1, court: 'san-1', startAt: '08:12', status: 'done', a: side(teams[0]), b: side(teams[1]), games: [{ a: 9, b: 11 }], winner: 'B', countsForClass: false },
];

test('đủ 5 trang tính, đúng tiêu đề và dữ liệu', () => {
  const s = buildSheets({ players, teams, matches, settings: DEFAULT_SETTINGS, classes: CLASSES });
  assert.deepEqual(Object.keys(s), ['Người chơi', 'Cặp', 'Lịch và kết quả', 'Xếp hạng', 'Điểm lớp']);
  assert.equal(s['Người chơi'].length, 5);
  assert.equal(s['Người chơi'][2][2], 'Chưa rõ');
  assert.deepEqual(s['Lịch và kết quả'][1].slice(0, 8), ['08:00', 'Sân 1', 'Vòng bảng', 'An & Bình', 'Chi & Dũng', 'Xong', '11-7', 'An & Bình']);
  assert.deepEqual(s['Điểm lớp'][1], ['CEO 110', 2, 0, 0, 0, 2]);
  assert.deepEqual(s['Điểm lớp'][2], ['CEO 111', 0, 0, 5, 0, 5]);
});

test('CSV có BOM, bọc ô có dấu phẩy hoặc ngoặc kép', () => {
  const csv = toCsv([['a', 'b,c'], ['x "y"', 1]]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv.slice(1), 'a,"b,c"\r\n"x ""y""",1');
});

test('nhà vô địch: đội thắng chung kết, tỷ số ghi điểm đội thắng trước, lớp vô địch', () => {
  const c = champions(matches, DEFAULT_SETTINGS, CLASSES);
  assert.equal(c.team.name, 'Chi & Dũng');
  assert.equal(c.finalScore, '11–9');
  assert.equal(c.classWinner, 'CEO 111');
});
