import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_HOLD_MS, SCENE_TRIGGERS } from '../src/hub.js';
import { CAMERA_FEATURES } from '../src/devices/camera.js';
import { SENSOR_FEATURES } from '../src/devices/sensors.js';
import { WyzeAuthError } from '../src/wyze/client.js';
import { DEVICES, FakeWyzeClient, createHub, externalIdOf, featureIdOf } from './helpers.js';

const cameraEvent = (id, overrides = {}) => ({
  event_id: id,
  device_mac: DEVICES.camera.mac,
  event_value: '1',
  event_ts: 1_700_000_000_000,
  tag_list: [],
  file_list: [{ type: 1, url: `https://wyze.example/${id}.jpg` }],
  ...overrides,
});

test('the first sync publishes the supported devices to the Discovery tab', async () => {
  const { gladys, hub } = createHub();
  await hub.sync();
  const published = gladys.fake.discoveredDevices.map((device) => device.external_id);
  assert.equal(published.length, 7, 'the scale is not supported');
  assert.ok(published.includes(externalIdOf(gladys, DEVICES.camera)));
});

test('states are only read and published for the devices created in Gladys', async () => {
  const client = new FakeWyzeClient({
    properties: { [DEVICES.plug.mac]: { P3: '1' }, [DEVICES.whiteBulb.mac]: { P3: '1' } },
  });
  const { gladys, hub } = createHub({ client, created: ['plug', 'contact'] });
  await hub.sync();
  assert.deepEqual(
    client.callsOf('getProperties').map((call) => call.args[0]),
    [DEVICES.plug.mac],
    'the bulb is not created: not read',
  );
  const published = new Map(
    gladys.fake.states.map(({ device_feature_external_id: id, state }) => [id, state]),
  );
  assert.equal(published.get(featureIdOf(gladys, DEVICES.plug, 'power')), 1);
  assert.equal(published.get(featureIdOf(gladys, DEVICES.contact, SENSOR_FEATURES.OPENING)), 0);
  assert.equal(published.has(featureIdOf(gladys, DEVICES.whiteBulb, 'power')), false);
});

test('unchanged values are not published again', async () => {
  const client = new FakeWyzeClient({ properties: { [DEVICES.plug.mac]: { P3: '1' } } });
  const { gladys, hub } = createHub({ client, created: ['plug'] });
  await hub.sync();
  const count = gladys.fake.states.length;
  await hub.sync();
  assert.equal(gladys.fake.states.length, count);
});

test('camera events of the first sync are history: they fire nothing', async () => {
  const client = new FakeWyzeClient({ events: [cameraEvent('e1')] });
  const { gladys, hub } = createHub({ client });
  await hub.sync();
  assert.equal(gladys.fake.sceneEvents.length, 0);
  assert.equal(hub.lastEvents.get(DEVICES.camera.mac).id, 'e1', 'it still sets the last event');
});

test('a new camera event fires camera_event, raises motion and publishes the image', async () => {
  let now = 1_700_000_000_000;
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client, now: () => now });
  await hub.sync();

  client.events = [cameraEvent('e2', { tag_list: [101] })];
  now += 60_000;
  await hub.sync();

  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.CAMERA_EVENT,
      data: { device: externalIdOf(gladys, DEVICES.camera), event: 'motion', object: 'person' },
    },
  ]);
  const motionId = featureIdOf(gladys, DEVICES.camera, CAMERA_FEATURES.MOTION);
  assert.equal(gladys.fake.lastState(motionId), 1);
  assert.equal(client.callsOf('fetchImage').at(-1).args[0], 'https://wyze.example/e2.jpg');
  assert.equal(gladys.fake.cameraImages.length, 1);

  // The same event read again (lookback window) fires nothing new.
  now += MOTION_HOLD_MS + 1;
  await hub.sync();
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.equal(gladys.fake.lastState(motionId), 0, 'motion is lowered once the hold ends');
});

test('events of a camera not created in Gladys fire nothing', async () => {
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client, created: ['plug', 'camera'] });
  await hub.sync();
  client.events = [cameraEvent('e3', { device_mac: DEVICES.floodlightPro.mac })];
  await hub.sync();
  assert.equal(gladys.fake.sceneEvents.length, 0);
});

test('a device going offline fires device_connection and turns its badge unreachable', async () => {
  const client = new FakeWyzeClient();
  const { gladys, hub } = createHub({ client });
  await hub.sync();
  assert.equal(gladys.fake.sceneEvents.length, 0, 'the first cycle only learns the states');

  client.deviceList.find((device) => device.mac === DEVICES.plug.mac).conn_state = 0;
  await hub.sync();
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.DEVICE_CONNECTION,
    data: { device: externalIdOf(gladys, DEVICES.plug), status: 'offline' },
  });
  const badge = gladys.fake.transports.findLast(
    (entry) => entry.device_external_id === externalIdOf(gladys, DEVICES.plug),
  );
  assert.equal(badge.transport, 'unreachable');
});

test('the transport badge: mesh lights local, the rest cloud', async () => {
  const { gladys, hub } = createHub();
  await hub.sync();
  const badge = (device) =>
    gladys.fake.transports.find(
      (entry) => entry.device_external_id === externalIdOf(gladys, device),
    ).transport;
  assert.equal(badge(DEVICES.colorBulb), 'local');
  assert.equal(badge(DEVICES.whiteBulb), 'cloud');
  assert.equal(badge(DEVICES.camera), 'cloud');
});

test('setValue routes a Gladys command to the right device and publishes the result', async () => {
  const { gladys, hub, client } = createHub();
  await hub.sync();
  const device = { external_id: externalIdOf(gladys, DEVICES.plug) };
  const feature = { external_id: featureIdOf(gladys, DEVICES.plug, 'power') };
  await hub.setValue(device, feature, 1);
  assert.deepEqual(client.callsOf('setProperty').at(-1).args, [DEVICES.plug.mac, 'P3', '1']);
  assert.equal(gladys.fake.lastState(feature.external_id), 1);
  await assert.rejects(hub.setValue({ external_id: 'ext:test-integration:x:y' }, feature, 1));
});

test('a failed cycle keeps the error for the connection status', async () => {
  const client = new FakeWyzeClient();
  client.failWith = new WyzeAuthError('refused');
  const { hub } = createHub({ client });
  await assert.rejects(hub.sync(), WyzeAuthError);
  assert.ok(hub.lastError instanceof WyzeAuthError);
  client.failWith = null;
  await hub.sync();
  assert.equal(hub.lastError, null);
});

test('two syncs asked together run once', async () => {
  const { hub, client } = createHub();
  await Promise.all([hub.sync(), hub.sync()]);
  assert.equal(client.callsOf('getDeviceList').length, 1);
});

test('the loop syncs, reports each cycle and stops', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hub, client } = createHub();
  const cycles = [];
  hub.start((err) => cycles.push(err));
  t.mock.timers.tick(0);
  await hub.running;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(cycles, [null]);
  hub.stop();
  t.mock.timers.tick(hub.config.poll_frequency * 1000);
  assert.equal(client.callsOf('getDeviceList').length, 1);
});
