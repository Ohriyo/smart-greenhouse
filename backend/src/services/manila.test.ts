import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activityWindow } from './fanActivity.js';
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

describe('fan activity window', () => {
  it('24h: 24 hourly buckets, the last one containing now', () => {
    const w = activityWindow('24h', NOW);
    assert.equal(w.count, 24);
    assert.equal(w.from + 23 * w.sizeMs, manilaFloor(NOW, HOUR_MS));
  });

  it('7d: 28 buckets of 6 h aligned to Manila 00/06/12/18', () => {
    const w = activityWindow('7d', NOW);
    assert.equal(w.sizeMs, 6 * HOUR_MS);
    // Last bucket starts 18:00 Manila = 10:00 UTC.
    assert.equal(new Date(w.from + 27 * w.sizeMs).toISOString(), '2026-11-09T10:00:00.000Z');
  });

  it('30d: 30 daily buckets ending today (Manila)', () => {
    const w = activityWindow('30d', NOW);
    assert.equal(w.count, 30);
    assert.equal(w.from + 29 * DAY_MS, manilaFloor(NOW, DAY_MS));
  });
});
