import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { poolConfig } from './pgPool.js';

describe('poolConfig', () => {
  it('a local database without sslmode uses plain TCP', () => {
    const c = poolConfig('postgresql://postgres:pw@localhost:5432/greenhouse_test');
    assert.equal(c.ssl, undefined);
    assert.equal(c.connectionString, 'postgresql://postgres:pw@localhost:5432/greenhouse_test');
    assert.equal(c.allowExitOnIdle, true);
  });

  it('a remote database (Neon) always uses verified TLS; sslmode/channel_binding are applied, not passed on', () => {
    const c = poolConfig(
      'postgresql://u:pw@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
    );
    assert.deepEqual(c.ssl, { rejectUnauthorized: true });
    assert.equal(c.enableChannelBinding, true);
    assert.equal(
      c.connectionString,
      'postgresql://u:pw@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb',
    );
  });

  it('TLS even when a remote URL has no sslmode', () => {
    const c = poolConfig('postgresql://u:pw@db.example.com/app');
    assert.deepEqual(c.ssl, { rejectUnauthorized: true });
  });

  it('sslmode=disable turns TLS off (explicit opt-out only)', () => {
    const c = poolConfig('postgresql://u:pw@db.internal/app?sslmode=disable');
    assert.equal(c.ssl, undefined);
  });

  it('a local database that asks for TLS gets it', () => {
    const c = poolConfig('postgresql://u:pw@127.0.0.1/app_test?sslmode=require');
    assert.deepEqual(c.ssl, { rejectUnauthorized: true });
  });
});
