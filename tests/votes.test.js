import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyVotes } from '../js/core/votes.js';

const players = ['a', 'b', 'c'].map((id) => ({ id, name: `Người ${id}` }));

test('đếm phiếu, xếp theo số phiếu, bỏ phiếu tự bầu', () => {
  const r = tallyVotes([
    { mvp: 'a', fairplay: 'b' },
    { mvp: 'a', fairplay: 'c' },
    { mvp: 'b', fairplay: 'b', voterPlayerId: 'b' },
    { mvp: 'c', fairplay: 'b', voterPlayerId: 'a' },
  ], players);
  assert.equal(r.total, 4);
  assert.deepEqual(r.mvp.map((x) => [x.id, x.count]), [['a', 2], ['c', 1]]);
  assert.deepEqual(r.fairplay.map((x) => [x.id, x.count]), [['b', 2], ['c', 1]]);
});

test('không có phiếu', () => {
  assert.deepEqual(tallyVotes([], players), { mvp: [], fairplay: [], total: 0 });
});
