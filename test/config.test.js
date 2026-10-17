import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  POLL_FREQUENCY_MAX,
  POLL_FREQUENCY_MIN,
  credentialsKey,
  hasCredentials,
  normalizeConfig,
} from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig trims the identifiers, never the password', () => {
  const config = normalizeConfig({
    email: '  me@example.com ',
    password: ' secret ',
    key_id: ' id ',
    api_key: ' key ',
  });
  assert.equal(config.email, 'me@example.com');
  assert.equal(config.password, ' secret ');
  assert.equal(config.key_id, 'id');
  assert.equal(config.api_key, 'key');
});

test('normalizeConfig coerces and bounds the refresh interval', () => {
  assert.equal(normalizeConfig({ poll_frequency: '120' }).poll_frequency, 120);
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, POLL_FREQUENCY_MIN);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, POLL_FREQUENCY_MAX);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
});

test('GLADYS_PREFER_LOCAL defaults to true and only an explicit false disables it', () => {
  assert.equal(normalizeConfig().GLADYS_PREFER_LOCAL, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});

test('the four credentials are required, and identify the account', () => {
  const full = normalizeConfig({ email: 'a', password: 'b', key_id: 'c', api_key: 'd' });
  assert.equal(hasCredentials(full), true);
  assert.equal(hasCredentials({ ...full, api_key: '' }), false);
  assert.notEqual(credentialsKey(full), credentialsKey({ ...full, password: 'other' }));
  assert.equal(credentialsKey(full), credentialsKey({ ...full, poll_frequency: 300 }));
});
