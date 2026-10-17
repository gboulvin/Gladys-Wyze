import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SCENE_ACTIONS } from '../src/scenes.js';
import { SCENE_TRIGGERS } from '../src/hub.js';
import { EVENT_KINDS, EVENT_OBJECTS, normalizeEvent } from '../src/events.js';
import { DEVICES, FakeWyzeClient, createHub, externalIdOf } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function assertDeclaredOutputs(actionKey, outputs) {
  const declared = keysOf(declarationOf('scene_actions', actionKey).outputs);
  for (const key of Object.keys(outputs)) {
    assert.ok(declared.includes(key), `output "${key}" of ${actionKey} is not declared`);
  }
}

test('camera_siren starts and stops the siren of the chosen camera', async () => {
  const { gladys, hub, client } = createHub();
  await hub.sync();
  const device = externalIdOf(gladys, DEVICES.camera);
  const outputs = await SCENE_ACTIONS.camera_siren(gladys, {
    fields: { device, state: 'on' },
    hub,
  });
  await SCENE_ACTIONS.camera_siren(gladys, { fields: { device, state: 'off' }, hub });
  assert.deepEqual(outputs, { success: true });
  assertDeclaredOutputs('camera_siren', outputs);
  assert.deepEqual(
    client.callsOf('runAction').map((call) => call.args[1]),
    ['siren_on', 'siren_off'],
  );
});

test('a device that cannot run the action is an output, not a failure', async () => {
  const { gladys, hub } = createHub();
  await hub.sync();
  for (const device of [DEVICES.plug, DEVICES.floodlightPro]) {
    const outputs = await SCENE_ACTIONS.camera_siren(gladys, {
      fields: { device: externalIdOf(gladys, device), state: 'on' },
      hub,
    });
    assert.deepEqual(outputs, { success: false });
  }
  assert.deepEqual(
    await SCENE_ACTIONS.camera_motion_detection(gladys, {
      fields: { device: 'ext:test-integration:camera:unknown', state: 'off' },
      hub,
    }),
    { success: false },
  );
});

test('camera_motion_detection switches the detection', async () => {
  const { gladys, hub, client } = createHub();
  await hub.sync();
  const outputs = await SCENE_ACTIONS.camera_motion_detection(gladys, {
    fields: { device: externalIdOf(gladys, DEVICES.camera), state: 'off' },
    hub,
  });
  assert.deepEqual(outputs, { success: true });
  assertDeclaredOutputs('camera_motion_detection', outputs);
  assert.deepEqual(client.callsOf('setProperty')[0].args, [DEVICES.camera.mac, 'P1047', '0']);
});

test('camera_snapshot publishes the latest image on the camera device', async () => {
  const { gladys, hub } = createHub();
  await hub.sync();
  const device = externalIdOf(gladys, DEVICES.camera);
  const outputs = await SCENE_ACTIONS.camera_snapshot(gladys, { fields: { device }, hub });
  assert.deepEqual(outputs, { published: true });
  assertDeclaredOutputs('camera_snapshot', outputs);
  assert.equal(gladys.fake.cameraImages.at(-1).device_external_id, device);

  const none = await SCENE_ACTIONS.camera_snapshot(gladys, {
    fields: { device: externalIdOf(gladys, DEVICES.floodlightPro) },
    hub,
  });
  assert.deepEqual(none, { published: false });
});

test('refresh_devices syncs and counts the devices', async () => {
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client });
  const outputs = await SCENE_ACTIONS.refresh_devices(gladys, { fields: {}, hub });
  assert.deepEqual(outputs, { devices: 7, online: 7 });
  assertDeclaredOutputs('refresh_devices', outputs);
  assert.deepEqual(await SCENE_ACTIONS.refresh_devices(gladys, { fields: {}, hub: null }), {
    devices: 0,
    online: 0,
  });
});

test('camera_event data only carries keys and values the trigger declares', async () => {
  const trigger = declarationOf('scene_triggers', SCENE_TRIGGERS.CAMERA_EVENT);
  const options = (key) =>
    trigger.fields.find((field) => field.key === key).options.map((option) => option.value);
  assert.deepEqual(options('event'), EVENT_KINDS);
  assert.deepEqual(options('object'), EVENT_OBJECTS);

  let now = 1_700_000_000_000;
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client, now: () => now });
  await hub.sync();
  client.events = [
    { event_id: 'a', device_mac: DEVICES.camera.mac, event_value: '2', event_ts: 1 },
    {
      event_id: 'b',
      device_mac: DEVICES.camera.mac,
      event_value: '1',
      event_ts: 2,
      tag_list: [104],
    },
  ];
  now += 60_000;
  await hub.sync();

  const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
  assert.equal(gladys.fake.sceneEvents.length, 2, 'one event per Wyze event');
  for (const { data } of gladys.fake.sceneEvents) {
    for (const [key, value] of Object.entries(data)) {
      assert.ok(declared.includes(key), `data.${key} is not declared, the core would drop it`);
      assert.notEqual(typeof value, 'object', `data.${key} must be a primitive`);
    }
  }
  assert.deepEqual(
    gladys.fake.sceneEvents.map(({ data }) => [data.event, data.object]),
    [
      ['sound', 'none'],
      ['motion', 'package'],
    ],
  );
});

test('device_connection data matches its declaration', () => {
  const trigger = declarationOf('scene_triggers', SCENE_TRIGGERS.DEVICE_CONNECTION);
  const statuses = trigger.fields.find((field) => field.key === 'status').options;
  assert.deepEqual(statuses.map((option) => option.value).sort(), ['offline', 'online']);
  assert.ok(keysOf(trigger.variables).includes('status'));
});

test('normalizeEvent classifies the Wyze event codes', () => {
  const base = { event_id: 'x', device_mac: 'M', event_ts: 5 };
  assert.equal(normalizeEvent({ ...base, event_value: '13' }).event, 'motion');
  assert.equal(normalizeEvent({ ...base, event_value: '4' }).event, 'smoke');
  assert.equal(normalizeEvent({ ...base, event_value: '10' }).isMotion, true);
  assert.equal(normalizeEvent({ ...base, event_value: '2' }).isMotion, false);
  assert.equal(normalizeEvent({ ...base, event_value: '99' }).event, 'other');
  assert.equal(normalizeEvent({ ...base, event_value: '2', tag_list: ['103'] }).object, 'pet');
  assert.equal(normalizeEvent({ ...base, event_value: '2', tag_list: [101] }).isMotion, true);
  assert.equal(normalizeEvent({ device_mac: 'M' }), null);
});
