import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankTeams, classScore, mixerRanking } from '../js/core/standings.js';
import { DEFAULT_SETTINGS } from '../js/core/settings.js';

const CLASSES = ['CEO 110', 'CEO 111'];
const side = (id, cls) => ({ teamId: id, players: [`${id}1`, `${id}2`], name: id, cls });
const done = (stage, a, b, sa, sb, extra = {}) => ({
  stage, status: 'done', a, b, games: [{ a: sa, b: sb }], winner: sa > sb ? 'A' : 'B', countsForClass: a.cls !== b.cls, ...extra,
});
const X = side('X', 'CEO 110');
const Y = side('Y', 'CEO 111');
const Z = side('Z', 'CEO 110');
const W = side('W', 'CEO 111');
const teams = [X, Y, Z, W].map((s) => ({ id: s.teamId, name: s.name, cls: s.cls }));

test('ba cặp bằng số trận thắng: xét hiệu số', () => {
  const ms = [done('pool', X, Y, 11, 9), done('pool', Y, Z, 11, 2), done('pool', Z, X, 11, 8)];
  assert.deepEqual(rankTeams(ms, teams.slice(0, 3)).map((r) => r.id), ['Y', 'X', 'Z']);
});

test('hai cặp bằng nhau: đối đầu quyết định trước hiệu số', () => {
  // W 2 thắng, X và Y mỗi cặp 1 thắng (X thắng Y nhưng hiệu số kém hơn), Z 0 thắng.
  const ms = [done('pool', X, Y, 11, 10), done('pool', Y, Z, 11, 0), done('pool', X, W, 2, 11), done('pool', W, Z, 11, 9)];
  const ranked = rankTeams(ms, teams);
  const iX = ranked.findIndex((r) => r.id === 'X');
  const iY = ranked.findIndex((r) => r.id === 'Y');
  assert.ok(iX < iY, 'X thắng Y nên đứng trên dù hiệu số kém hơn');
});

test('trận xử thua tính tỷ số mặc định đã lưu', () => {
  const ms = [{ ...done('pool', X, Y, 11, 0), status: 'walkover' }];
  const [first] = rankTeams(ms, teams.slice(0, 2));
  assert.deepEqual([first.id, first.pf, first.diff], ['X', 11, 11]);
});

test('bằng nhau hoàn toàn thì báo cần bốc thăm, có thứ tự bốc thăm thì theo đó', () => {
  const ms = [done('pool', X, Y, 11, 5), done('pool', Z, W, 11, 5)];
  const ranked = rankTeams(ms, teams);
  assert.deepEqual(ranked.find((r) => r.id === 'X').tiedWith, ['Z']);
  const drawn = rankTeams(ms, teams, ['pool'], { Z: 0, X: 1 });
  assert.deepEqual(drawn.slice(0, 2).map((r) => r.id), ['Z', 'X']);
});

test('điểm lớp: vòng bảng, bán kết, chung kết; trận không tính điểm lớp thì bỏ qua', () => {
  const cp = DEFAULT_SETTINGS.classPoints;
  const ms = [
    done('pool', X, Y, 11, 4),
    done('pool', Y, X, 11, 7),
    done('pool', X, Z, 11, 3),
    done('semi', X, W, 11, 9),
    done('final', X, Y, 8, 11),
    { ...done('pool', X, Y, 11, 1), status: 'live', winner: null },
  ];
  const s = classScore(ms, cp, CLASSES);
  assert.equal(s['CEO 110'].total, cp.pool + cp.semi);
  assert.equal(s['CEO 111'].total, cp.pool + cp.final);
  assert.equal(s['CEO 110'].wins, 1);
});

test('điểm lớp: thắng siêu kinh điển', () => {
  const p = (cls, k) => ({ players: [`${k}1`, `${k}2`], name: k, cls });
  const clash = [0, 1, 2, 3].map((i) => done('clash', p('CEO 110', `a${i}`), p('CEO 111', `b${i}`), i < 3 ? 11 : 5, i < 3 ? 6 : 11));
  const s = classScore(clash, DEFAULT_SETTINGS.classPoints, CLASSES);
  assert.equal(s['CEO 110'].clash, DEFAULT_SETTINGS.classPoints.clash);
  assert.equal(s['CEO 111'].total, 0);
});

test('điểm cá nhân phần khởi động', () => {
  const players = ['p1', 'p2', 'q1', 'q2'].map((id) => ({ id, name: id }));
  const m = (a, b, sa, sb) => ({ stage: 'warmup', status: 'done', a: { players: a }, b: { players: b }, games: [{ a: sa, b: sb }], winner: sa > sb ? 'A' : 'B' });
  const r = mixerRanking([m(['p1', 'q1'], ['p2', 'q2'], 11, 5), m(['p1', 'q2'], ['p2', 'q1'], 11, 9)], players);
  assert.equal(r[0].id, 'p1');
  assert.deepEqual([r[0].wins, r[0].diff], [2, 8]);
  assert.equal(r.at(-1).id, 'p2');
});
