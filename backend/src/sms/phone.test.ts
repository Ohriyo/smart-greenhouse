import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { maskPhone, maskPhonesInText, normalizePhMobile, parsePhoneList, toE164 } from './phone.js';

describe('normalizePhMobile (Semaphore wants 09XXXXXXXXX)', () => {
  it('accepts the common ways of writing a PH mobile number', () => {
    for (const input of [
      '09171234567',
      '9171234567',
      '639171234567',
      '+639171234567',
      '+63 917 123 4567',
      '+63-917-123-4567',
      '0917 123 4567',
      '(0917) 123.4567',
      '  09171234567  ',
    ]) {
      assert.equal(normalizePhMobile(input), '09171234567', input);
    }
  });

  it('rejects anything that is not a PH mobile number', () => {
    for (const input of [
      '',
      'abc',
      '0817 123 4567', // not a 09 mobile prefix
      '0917123456', // 10 digits
      '091712345678', // 12 digits
      '+6309171234567', // +63 followed by the local 0
      '+1 415 555 0100', // not Philippine
      '0917-123-456x',
    ]) {
      assert.equal(normalizePhMobile(input), null, JSON.stringify(input));
    }
  });
});

describe('toE164 (textbee wants +639XXXXXXXXX)', () => {
  it('turns a normalized number into E.164', () => {
    assert.equal(toE164('09171234567'), '+639171234567');
    assert.equal(toE164(normalizePhMobile('+63 917-123-4567') ?? ''), '+639171234567');
  });
});

describe('parsePhoneList (ALERT_PHONE_NUMBERS)', () => {
  it('splits on commas or semicolons, normalizes and removes duplicates', () => {
    assert.deepEqual(parsePhoneList('09171234567, +63 918 765 4321; 639171234567'), {
      numbers: ['09171234567', '09187654321'],
      invalidPositions: [],
    });
  });

  it('reports the positions of invalid entries (never the numbers themselves)', () => {
    assert.deepEqual(parsePhoneList('09171234567,12345,,+1 415 555 0100'), {
      numbers: ['09171234567'],
      invalidPositions: [2, 3],
    });
  });

  it('an empty value means no recipients', () => {
    assert.deepEqual(parsePhoneList(''), { numbers: [], invalidPositions: [] });
    assert.deepEqual(parsePhoneList(' , '), { numbers: [], invalidPositions: [] });
  });
});

describe('masking', () => {
  it('keeps only the start and the last 4 digits', () => {
    assert.equal(maskPhone('09171234567'), '091••••4567');
    assert.equal(maskPhone('+639171234567'), '639•••••4567');
    assert.equal(maskPhone('123'), '••••');
  });

  it('masks every phone number inside free text (provider answers)', () => {
    assert.equal(
      maskPhonesInText('[{"recipient":"639171234567","status":"Queued"}]'),
      '[{"recipient":"639•••••4567","status":"Queued"}]',
    );
    assert.equal(maskPhonesInText('message_id 12345 ok'), 'message_id 12345 ok');
  });
});
