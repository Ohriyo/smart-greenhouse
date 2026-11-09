import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { thinEvenly } from './recent.js';

describe('thinEvenly', () => {
  it('returns short lists unchanged (as a copy)', () => {
    const items = [1, 2, 3];
    const out = thinEvenly(items, 5);
    assert.deepEqual(out, [1, 2, 3]);
    assert.notEqual(out, items);
  });

  it('keeps exactly max items, first and last included', () => {
    const items = Array.from({ length: 720 }, (_, i) => i);
    const out = thinEvenly(items, 360);
    assert.equal(out.length, 360);
    assert.equal(out[0], 0);
    assert.equal(out.at(-1), 719);
  });

  it('keeps order and spaces items evenly', () => {
    const out = thinEvenly(
      Array.from({ length: 11 }, (_, i) => i),
      6,
    );
    assert.deepEqual(out, [0, 2, 4, 6, 8, 10]);
  });

  it('handles max of 1 by keeping the newest item', () => {
    assert.deepEqual(thinEvenly([1, 2, 3], 1), [3]);
  });
});
