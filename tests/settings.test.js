import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMinutes, withDefaults, resizeCourts, PRESETS, DEFAULT_SETTINGS } from '../js/core/settings.js';

test('ước tính phút mỗi trận', () => {
  assert.equal(estimateMinutes({ pointsToWin: 11, gamesPerMatch: 1 }), 12);
  assert.equal(estimateMinutes({ pointsToWin: 15, gamesPerMatch: 1 }), 16);
  assert.equal(estimateMinutes({ pointsToWin: 11, gamesPerMatch: 3 }), 30);
});

test('gộp cài đặt đã lưu với mặc định', () => {
  const s = withDefaults({ pointsToWin: 15, classPoints: { pool: 3 } });
  assert.equal(s.pointsToWin, 15);
  assert.equal(s.classPoints.pool, 3);
  assert.equal(s.classPoints.final, DEFAULT_SETTINGS.classPoints.final);
  assert.equal(s.courts.length, 2);
});

test('đổi số sân giữ tên sân cũ', () => {
  const courts = resizeCourts([{ id: 'san-1', name: 'Sân VIP' }], 3);
  assert.deepEqual(courts.map((c) => c.name), ['Sân VIP', 'Sân 2', 'Sân 3']);
  assert.equal(resizeCourts(courts, 0).length, 1);
});

test('mẫu luật Người mới là mặc định', () => {
  for (const [k, v] of Object.entries(PRESETS.beginner.values)) assert.equal(DEFAULT_SETTINGS[k], v, k);
});
