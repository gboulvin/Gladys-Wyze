import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS } from '../src/actions.js';
import { normalizeConfig } from '../src/config.js';
import { WyzeAuthError, WyzeError } from '../src/wyze/client.js';
import { FakeWyzeClient, createHub } from './helpers.js';

const config = normalizeConfig({ email: 'a', password: 'b', key_id: 'c', api_key: 'd' });

test('test_connection counts the supported devices per family', async () => {
  const { gladys, hub } = createHub();
  const message = await ACTIONS.test_connection(gladys, { hub, config });
  assert.equal(
    message.en,
    'Connected to Wyze: 7 supported devices found (2 lights, 1 plugs, 2 cameras, 2 sensors).',
  );
  assert.ok(message.es.startsWith('Conectado a Wyze'));
});

test('test_connection explains a refused login or an unreachable cloud', async () => {
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client });
  client.failWith = new WyzeAuthError('refused');
  assert.match((await ACTIONS.test_connection(gladys, { hub, config })).en, /refused the login/);
  client.failWith = new WyzeError('timeout');
  assert.match((await ACTIONS.test_connection(gladys, { hub, config })).en, /does not answer/);
});

test('the actions ask for the credentials first', async () => {
  const { gladys } = createHub();
  for (const action of Object.values(ACTIONS)) {
    const message = await action(gladys, { hub: null, config: normalizeConfig() });
    assert.match(message.fr, /Renseignez/);
  }
});

test('sync_now syncs and republishes the discovered devices', async () => {
  const { gladys, hub } = createHub();
  const message = await ACTIONS.sync_now(gladys, { hub, config });
  assert.equal(message.en, 'Synchronized: 7 Wyze devices, 7 added to Gladys.');
  assert.equal(gladys.fake.discoveredDevices.length, 7);
});
