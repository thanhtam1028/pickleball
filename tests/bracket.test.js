import { test } from 'node:test';
import assert from 'node:assert/strict';
import { singleElimination, resolveBracket, teamClash, clashResult, dreamBreaker } from '../js/core/bracket.js';
import { assignCourts } from '../js/core/scheduler.js';
import { rankTeams } from '../js/core/standings.js';

const side = (n) => ({ teamId: `t${n}`, players: [`p${n}a`, `p${n}b`], name: `Cặp ${n}`, cls: 'CEO 110' });

test('4 hạt giống: 1 gặp 4, 2 gặp 3, chung kết và tranh hạng ba chờ bán kết', () => {
  const ms = singleElimination([side(1), side(2), side(3), side(4)]);
  assert.deepEqual(ms.map((m) => m.key), ['semi-1', 'semi-2', 'final', 'third']);
  assert.equal(ms[0].b.teamId, 't4');
  assert.equal(ms[1].a.teamId, 't2');
  assert.equal(ms[2].a, null);
});

test('8 hạt giống có tứ kết, 2 hạt giống chỉ có chung kết', () => {
  assert.equal(singleElimination([1, 2, 3, 4, 5, 6, 7, 8].map(side)).length, 8);
  assert.equal(singleElimination([side(1), side(2)]).length, 1);
});

test('chung kết được xếp sau bán kết', () => {
  const ms = singleElimination([side(1), side(2), side(3), side(4)]);
  const r = assignCourts(ms, [{ id: 's1' }, { id: 's2' }], 12, 600);
  const slot = Object.fromEntries(r.matches.map((m) => [m.key, m.slot]));
  assert.ok(slot.final > slot['semi-1'] && slot.final > slot['semi-2']);
});

test('điền đội vào chung kết khi bán kết xong', () => {
  const ms = singleElimination([side(1), side(2), side(3), side(4)]).map((m, i) => ({ ...m, id: `m${i}` }));
  ms[0].status = 'done'; ms[0].winner = 'B';
  let ups = resolveBracket(ms);
  assert.deepEqual(ups.map((u) => [u.id, Object.keys(u.patch)]), [['m2', ['a']], ['m3', ['a']]]);
  assert.equal(ups[0].patch.a.teamId, 't4');
  assert.equal(ups[1].patch.a.teamId, 't1');
  ms[1].status = 'walkover'; ms[1].winner = 'A';
  ups = resolveBracket(ms);
  assert.equal(ups.find((u) => u.id === 'm2').patch.b.teamId, 't2');
});

test('siêu kinh điển: 4 trận, hòa 2–2 thì cần trận phân định', () => {
  const p = (id) => ({ id, name: `Người ${id}` });
  const l1 = { men: [p('a1'), p('a2')], women: [p('a3'), p('a4')] };
  const l2 = { men: [p('b1'), p('b2')], women: [p('b3'), p('b4')] };
  const ms = teamClash('CEO 110', l1, 'CEO 111', l2);
  assert.equal(ms.length, 4);
  assert.deepEqual(ms[2].a.players, ['a1', 'a3']);
  ms.forEach((m, i) => { m.status = 'done'; m.winner = i % 2 ? 'B' : 'A'; });
  const r = clashResult(ms);
  assert.equal(r.needBreaker, true);
  const db = dreamBreaker(ms);
  assert.equal(db.a.players.length, 4);
  assert.equal(clashResult([...ms, { ...db, status: 'done', winner: 'B' }]).winner, 'B');
});

test('xếp hạng: số trận thắng, rồi đối đầu, rồi hiệu số', () => {
  const teams = [1, 2, 3].map((n) => ({ id: `t${n}`, name: `Cặp ${n}`, cls: 'CEO 110' }));
  const m = (a, b, sa, sb) => ({ stage: 'pool', status: 'done', a: { teamId: `t${a}` }, b: { teamId: `t${b}` }, games: [{ a: sa, b: sb }], winner: sa > sb ? 'A' : 'B' });
  // Ba cặp cùng 1 trận thắng nên xét hiệu số: t2 +7, t1 −1, t3 −6.
  const ranked = rankTeams([m(1, 2, 11, 9), m(2, 3, 11, 2), m(3, 1, 11, 8)], teams);
  assert.deepEqual(ranked.map((r) => r.id), ['t2', 't1', 't3']);
  const two = rankTeams([m(1, 2, 11, 9), m(2, 1, 11, 3)], teams.slice(0, 2));
  assert.deepEqual(two.map((r) => r.id), ['t2', 't1']);
});
