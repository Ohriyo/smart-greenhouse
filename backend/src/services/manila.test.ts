import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DAY_MS, HOUR_MS, manilaDayLabel, manilaFloor } from './manila.js';

// 2026-11-09 13:20:00 UTC = 21:20 in Manila (Monday).
const NOW = Date.UTC(2026, 10, 9, 13, 20);

describe('Manila calendar math', () => {
  it('floors to the Manila hour', () => {
    assert.equal(new Date(manilaFloor(NOW, HOUR_MS)).toISOString(), '2026-11-09T13:00:00.000Z');
  });

  it('floors to Manila midnight (16:00 UTC the day before)', () => {
    assert.equal(new Date(manilaFloor(NOW, DAY_MS)).toISOString(), '2026-11-08T16:00:00.000Z');
  });

  it('labels the Manila day', () => {
    assert.deepEqual(manilaDayLabel(manilaFloor(NOW, DAY_MS)), {
      date: '2026-11-09',
      weekday: 'Mon',
    });
  });

  it('just after Manila midnight is already the next day', () => {
    const t = Date.UTC(2026, 10, 9, 16, 5); // 00:05 Tue in Manila
    assert.deepEqual(manilaDayLabel(manilaFloor(t, DAY_MS)), {
      date: '2026-11-10',
      weekday: 'Tue',
    });
  });
});
