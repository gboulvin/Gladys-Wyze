import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_BLUEPRINTS,
  blueprintFor,
  featureKeyOf,
  isSupported,
} from '../src/devices/index.js';
import { light, LIGHT_FEATURES } from '../src/devices/light.js';
import { plug } from '../src/devices/plug.js';
import { camera, CAMERA_FEATURES } from '../src/devices/camera.js';
import { contactSensor, motionSensor, SENSOR_FEATURES } from '../src/devices/sensors.js';
import { hexToInt, intToHex, kelvinToMired, miredToKelvin } from '../src/devices/convert.js';
import { DEVICES, FakeWyzeClient, createHub } from './helpers.js';

test('every supported Wyze family has a blueprint, the others are skipped', () => {
  assert.equal(blueprintFor(DEVICES.whiteBulb), light);
  assert.equal(blueprintFor(DEVICES.colorBulb), light);
  assert.equal(blueprintFor(DEVICES.plug), plug);
  assert.equal(blueprintFor(DEVICES.camera), camera);
  assert.equal(blueprintFor(DEVICES.contact), contactSensor);
  assert.equal(blueprintFor(DEVICES.motion), motionSensor);
  assert.equal(isSupported(DEVICES.scale), false);
});

test('Gladys accepts the discovery payload of every device', async () => {
  const gladys = createFakeGladys();
  const devices = Object.values(DEVICES)
    .filter(isSupported)
    .map((device) => blueprintFor(device).buildDevice(gladys, device));
  // The fake Gladys refuses an unknown category, type or unit with a 400.
  await gladys.publishDiscoveredDevices(devices);
  assert.equal(gladys.fake.discoveredDevices.length, devices.length);
  for (const device of devices) {
    assert.match(device.external_id, /^ext:test-integration:[a-z-]+:[0-9A-Z.]+$/);
  }
});

test('external ids are built from the MAC, never from the name', () => {
  const gladys = createFakeGladys();
  const renamed = { ...DEVICES.plug, nickname: 'Renamed' };
  assert.equal(
    plug.buildDevice(gladys, renamed).external_id,
    plug.buildDevice(gladys, DEVICES.plug).external_id,
  );
});

test('only the mesh lights get a color feature', () => {
  const gladys = createFakeGladys();
  const keys = (device) =>
    light
      .buildDevice(gladys, device)
      .features.map((feature) => featureKeyOf(gladys, device, feature.external_id));
  assert.ok(keys(DEVICES.colorBulb).includes(LIGHT_FEATURES.COLOR));
  assert.ok(!keys(DEVICES.whiteBulb).includes(LIGHT_FEATURES.COLOR));
});

test('device-management cameras only expose their image and motion', () => {
  const gladys = createFakeGladys();
  const keys = camera
    .buildDevice(gladys, DEVICES.floodlightPro)
    .features.map((feature) => featureKeyOf(gladys, DEVICES.floodlightPro, feature.external_id));
  assert.deepEqual(keys, [CAMERA_FEATURES.IMAGE, CAMERA_FEATURES.MOTION]);
});

test('conversions between Wyze and Gladys values', () => {
  assert.equal(kelvinToMired(6500), 154);
  assert.equal(kelvinToMired(2700), 370);
  assert.equal(miredToKelvin(370), 2703);
  assert.equal(hexToInt('FF8000'), 0xff8000);
  assert.equal(intToHex(0x00ff00), '00FF00');
  assert.equal(hexToInt('zz'), null);
});

test('light states are read from the Wyze properties', async () => {
  const client = new FakeWyzeClient({
    properties: {
      [DEVICES.colorBulb.mac]: { P3: '1', P1501: '42', P1502: '4000', P1507: 'FF0000' },
    },
  });
  const { hub } = createHub({ client });
  const states = await light.readStates(hub, DEVICES.colorBulb);
  assert.deepEqual(states, {
    [LIGHT_FEATURES.POWER]: 1,
    [LIGHT_FEATURES.BRIGHTNESS]: 42,
    [LIGHT_FEATURES.TEMPERATURE]: 250,
    [LIGHT_FEATURES.COLOR]: 0xff0000,
  });
});

test('a white bulb is powered through the bulk endpoint, dimmed through the property list', async () => {
  const { hub, client } = createHub();
  assert.equal(await light.setValue(hub, DEVICES.whiteBulb, LIGHT_FEATURES.POWER, 1), 1);
  assert.equal(await light.setValue(hub, DEVICES.whiteBulb, LIGHT_FEATURES.BRIGHTNESS, 150), 100);
  assert.deepEqual(client.callsOf('setDeviceListPropertyList')[0].args, [
    DEVICES.whiteBulb.mac,
    [{ pid: 'P3', pvalue: '1' }],
  ]);
  assert.deepEqual(client.callsOf('setPropertyList')[0].args, [
    DEVICES.whiteBulb.mac,
    [{ pid: 'P1501', pvalue: '100' }],
  ]);
});

test('the color temperature is sent in kelvin, within the bulb range', async () => {
  const { hub, client } = createHub();
  // 1000 mireds = 1000 K, below the 2700 K of a white bulb: clamped.
  const confirmed = await light.setValue(hub, DEVICES.whiteBulb, LIGHT_FEATURES.TEMPERATURE, 1000);
  assert.equal(confirmed, 370);
  assert.deepEqual(client.callsOf('setPropertyList')[0].args[1], [
    { pid: 'P1502', pvalue: '2703' },
  ]);
});

test('a mesh bulb is driven on the LAN when local is preferred', async () => {
  const requests = [];
  const { hub, client } = createHub({
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, status: 200 };
    },
  });
  await light.setValue(hub, DEVICES.colorBulb, LIGHT_FEATURES.COLOR, 0x00ff00);
  assert.equal(requests.length, 1);
  assert.equal(client.callsOf('runActionList').length, 0);
  assert.deepEqual(light.transport(hub, DEVICES.colorBulb), { transport: 'local' });
});

test('a failed LAN command falls back to the cloud and flags the transport degraded', async () => {
  const { hub, client } = createHub({
    fetch: async () => {
      throw new Error('connect ETIMEDOUT');
    },
  });
  await light.setValue(hub, DEVICES.colorBulb, LIGHT_FEATURES.POWER, 1);
  assert.deepEqual(client.callsOf('runActionList')[0].args, [
    DEVICES.colorBulb.mac,
    [{ pid: 'P3', pvalue: '1' }],
  ]);
  const transport = light.transport(hub, DEVICES.colorBulb);
  assert.equal(transport.transport, 'cloud');
  assert.equal(transport.degraded, true);
  for (const lang of ['en', 'fr', 'de', 'es']) {
    assert.ok(transport.message[lang].length <= 200);
  }
});

test('a mesh bulb stays on the cloud when the user prefers it', async () => {
  let lanCalls = 0;
  const { hub, client } = createHub({
    config: { GLADYS_PREFER_LOCAL: false },
    fetch: async () => {
      lanCalls += 1;
      return { ok: true };
    },
  });
  await light.setValue(hub, DEVICES.colorBulb, LIGHT_FEATURES.BRIGHTNESS, 30);
  assert.equal(lanCalls, 0);
  assert.equal(client.callsOf('runActionList').length, 1);
  assert.deepEqual(light.transport(hub, DEVICES.colorBulb), { transport: 'cloud' });
});

test('plugs read and set their relay', async () => {
  const client = new FakeWyzeClient({ properties: { [DEVICES.plug.mac]: { P3: '0' } } });
  const { hub } = createHub({ client });
  assert.deepEqual(await plug.readStates(hub, DEVICES.plug), { power: 0 });
  assert.equal(await plug.setValue(hub, DEVICES.plug, 'power', 1), 1);
  assert.deepEqual(client.callsOf('setProperty')[0].args, [DEVICES.plug.mac, 'P3', '1']);
});

test('camera switches map to the Wyze actions and properties', async () => {
  const client = new FakeWyzeClient({
    properties: { [DEVICES.camera.mac]: { P3: '1', P1049: '0', P1047: '1' } },
  });
  const { hub } = createHub({ client });
  assert.deepEqual(await camera.readStates(hub, DEVICES.camera), {
    [CAMERA_FEATURES.MOTION]: 0,
    [CAMERA_FEATURES.POWER]: 1,
    [CAMERA_FEATURES.SIREN]: 0,
    [CAMERA_FEATURES.MOTION_DETECTION]: 1,
  });
  await camera.setValue(hub, DEVICES.camera, CAMERA_FEATURES.SIREN, 1);
  await camera.setValue(hub, DEVICES.camera, CAMERA_FEATURES.POWER, 0);
  await camera.setValue(hub, DEVICES.camera, CAMERA_FEATURES.MOTION_DETECTION, 0);
  assert.deepEqual(
    client.callsOf('runAction').map((call) => call.args[1]),
    ['siren_on', 'power_off'],
  );
  assert.deepEqual(
    client.callsOf('setProperty').map((call) => call.args.slice(1)),
    [
      ['P1047', '0'],
      ['P1001', '0'],
    ],
  );
  await assert.rejects(
    camera.setValue(hub, DEVICES.camera, CAMERA_FEATURES.MOTION, 1),
    /read-only/,
  );
});

test('the camera image is the latest thumbnail, in the Gladys format', async () => {
  const { hub, client } = createHub();
  const image = await camera.getImage(hub, DEVICES.camera);
  assert.match(image, /^image\/jpg;base64,\/9j\//);
  assert.equal(client.callsOf('fetchImage')[0].args[0], 'https://wyze.example/thumb-1.jpg');

  client.image = Buffer.alloc(200 * 1024);
  await assert.rejects(camera.getImage(hub, DEVICES.camera), /150 KB/);
  await assert.rejects(camera.getImage(hub, DEVICES.floodlightPro), /no image/);
});

test('contact sensors follow the Gladys convention: 1 closed, 0 open', async () => {
  const { hub } = createHub();
  assert.deepEqual(await contactSensor.readStates(hub, DEVICES.contact), {
    [SENSOR_FEATURES.OPENING]: 0,
    [SENSOR_FEATURES.BATTERY_LOW]: 0,
  });
  const closed = { ...DEVICES.contact, device_params: { open_close_state: 0 } };
  assert.deepEqual(await contactSensor.readStates(hub, closed), { [SENSOR_FEATURES.OPENING]: 1 });
  assert.deepEqual(await motionSensor.readStates(hub, DEVICES.motion), {
    [SENSOR_FEATURES.MOTION]: 0,
    [SENSOR_FEATURES.BATTERY_LOW]: 1,
  });
});

test('every blueprint declares the families it handles', () => {
  for (const blueprint of DEVICE_BLUEPRINTS) {
    assert.ok(blueprint.productTypes.length > 0, blueprint.key);
    assert.equal(typeof blueprint.buildDevice, 'function');
    assert.equal(typeof blueprint.readStates, 'function');
  }
});
