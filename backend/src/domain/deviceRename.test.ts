import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DeviceRenameBodySchema } from './schemas.js';

describe('DeviceRenameBodySchema', () => {
  it('trims the name', () => {
    assert.equal(DeviceRenameBodySchema.parse({ name: '  Greenhouse 01  ' }).name, 'Greenhouse 01');
  });

  it('accepts unicode letters and punctuation', () => {
    assert.equal(DeviceRenameBodySchema.parse({ name: 'Serre №1 – Süd' }).name, 'Serre №1 – Süd');
  });

  it('rejects an empty or whitespace-only name', () => {
    assert.equal(DeviceRenameBodySchema.safeParse({ name: '' }).success, false);
    assert.equal(DeviceRenameBodySchema.safeParse({ name: '   ' }).success, false);
  });

  it('rejects more than 40 characters', () => {
    assert.equal(DeviceRenameBodySchema.safeParse({ name: 'x'.repeat(40) }).success, true);
    assert.equal(DeviceRenameBodySchema.safeParse({ name: 'x'.repeat(41) }).success, false);
  });

  it('rejects control characters (newlines would break titles and push text)', () => {
    assert.equal(DeviceRenameBodySchema.safeParse({ name: 'a\nb' }).success, false);
    assert.equal(DeviceRenameBodySchema.safeParse({ name: 'a\tb' }).success, false);
  });

  it('rejects unknown fields and a missing name', () => {
    assert.equal(DeviceRenameBodySchema.safeParse({ name: 'ok', id: 'gh-02' }).success, false);
    assert.equal(DeviceRenameBodySchema.safeParse({}).success, false);
  });
});
