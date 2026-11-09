import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlayerLines, autoPair, teamLevel, teamName, countSummary, parseGender } from '../js/core/pairing.js';
import { SAMPLE_PLAYERS } from '../js/sample-data.js';

const sample = (cls) => parsePlayerLines(SAMPLE_PLAYERS[cls], cls).players
  .map((p, i) => ({ ...p, id: `${cls}-${i}` }));

test('đọc đủ 8 người mỗi lớp từ dữ liệu mẫu, không lỗi', () => {
  for (const cls of ['CEO 110', 'CEO 111']) {
    const { players, errors } = parsePlayerLines(SAMPLE_PLAYERS[cls], cls);
    assert.equal(players.length, 8);
    assert.deepEqual(errors, []);
  }
});

test('đọc giới tính và trình độ, báo dòng sai', () => {
  const { players, errors } = parsePlayerLines('An, nam, 9\nBình, Nữ\nCường, ?, 2\n, Nam, 3', 'CEO 110');
  assert.deepEqual(players.map((p) => [p.name, p.gender, p.level]), [['An', 'M', 5], ['Bình', 'F', 3]]);
  assert.equal(errors.length, 2);
  assert.equal(parseGender('Nu'), 'F');
});

test('danh sách đánh số, chỉ có tên: bỏ số thứ tự, giới tính chưa rõ, trình độ 3', () => {
  const { players, errors } = parsePlayerLines('1. Nguyễn An\n2) Bình\n10. Chung Cường', 'CEO 110');
  assert.deepEqual(errors, []);
  assert.deepEqual(players.map((p) => [p.name, p.gender, p.level]), [
    ['Nguyễn An', null, 3], ['Bình', null, 3], ['Chung Cường', null, 3],
  ]);
});

test('người chưa rõ giới tính vẫn được ghép khi ưu tiên đôi nam nữ', () => {
  const list = [
    { id: 'a', name: 'A', gender: 'M', level: 3 },
    { id: 'b', name: 'B', gender: 'F', level: 3 },
    { id: 'c', name: 'C', gender: null, level: 3 },
    { id: 'd', name: 'D', gender: null, level: 3 },
  ];
  const { teams, leftover } = autoPair(list, { preferMixed: true });
  assert.equal(teams.length, 2);
  assert.equal(leftover.length, 0);
});

test('ghép mạnh với yếu: đủ cặp, chênh lệch tổng trình độ không quá 2', () => {
  for (const cls of ['CEO 110', 'CEO 111']) {
    const { teams, leftover } = autoPair(sample(cls));
    assert.equal(teams.length, 4);
    assert.equal(leftover.length, 0);
    const levels = teams.map(teamLevel);
    assert.ok(Math.max(...levels) - Math.min(...levels) <= 2, `chênh lệch ${levels}`);
  }
});

test('số người lẻ thì báo đúng một người lẻ', () => {
  const { teams, leftover } = autoPair(sample('CEO 110').slice(0, 7));
  assert.equal(teams.length, 3);
  assert.equal(leftover.length, 1);
});

test('ưu tiên đôi nam nữ tạo tối đa số cặp nam nữ', () => {
  const { teams } = autoPair(sample('CEO 111'), { preferMixed: true });
  const mixed = teams.filter(([a, b]) => a.gender !== b.gender);
  assert.equal(mixed.length, 4);
  const levels = teams.map(teamLevel);
  assert.ok(Math.max(...levels) - Math.min(...levels) <= 2, `chênh lệch ${levels}`);
});

test('mỗi người chỉ nằm trong một cặp', () => {
  const { teams } = autoPair(sample('CEO 110'), { preferMixed: true });
  const ids = teams.flat().map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('tên cặp và bảng đếm', () => {
  assert.equal(teamName({ name: 'Nguyễn Minh Khang' }, { name: 'Hồ Mỹ Duyên' }), 'Khang & Duyên');
  const players = [...sample('CEO 110'), ...sample('CEO 111')];
  players[0].checkedIn = true;
  const teams = [{ cls: 'CEO 110', players: [players[0].id, players[1].id] }];
  const [c110, c111] = countSummary(players, teams, ['CEO 110', 'CEO 111']);
  assert.deepEqual(c110, { cls: 'CEO 110', total: 8, male: 5, female: 3, unknownGender: 0, checkedIn: 1, teams: 1, unpaired: 6 });
  assert.equal(c111.female, 4);
});
