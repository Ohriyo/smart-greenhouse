import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reconnectDelay } from './client.js';

describe('reconnectDelay', () => {
  it('doubles from 1 s and caps at 30 s, with jitter between 50 % and 100 %', () => {
    const low = () => 0;
    const high = () => 1;
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 10].map((a) => reconnectDelay(a, high)),
      [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000],
    );
    assert.equal(reconnectDelay(3, low), 4000);
    assert.equal(reconnectDelay(10, low), 15000);
  });
});
