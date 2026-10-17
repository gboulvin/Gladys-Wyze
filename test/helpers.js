// Fixtures shared by the tests: a Wyze account with one device of each
// family, and an in-memory Wyze client recording the calls it receives.

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { WyzeHub } from '../src/hub.js';
import { normalizeConfig } from '../src/config.js';
import { blueprintFor } from '../src/devices/index.js';

export const DEVICES = {
  whiteBulb: {
    mac: '7C78B2000001',
    product_type: 'Light',
    product_model: 'WLPA19',
    nickname: 'Desk bulb',
    conn_state: 1,
    device_params: { ip: '192.168.1.20' },
  },
  colorBulb: {
    mac: '2CAA8E000002',
    product_type: 'MeshLight',
    product_model: 'WLPA19C',
    nickname: 'Living room bulb',
    conn_state: 1,
    enr: 'abcdefghijklmnop',
    device_params: { ip: '192.168.1.21' },
  },
  plug: {
    mac: '2CAA8E000003',
    product_type: 'Plug',
    product_model: 'WLPP1CFH',
    nickname: 'Coffee plug',
    conn_state: 1,
    device_params: {},
  },
  camera: {
    mac: '2CAA8E000004',
    product_type: 'Camera',
    product_model: 'HL_CAM4',
    nickname: 'Garden cam',
    conn_state: 1,
    device_params: {
      camera_thumbnails: { thumbnails_url: 'https://wyze.example/thumb-1.jpg' },
    },
  },
  floodlightPro: {
    mac: '2CAA8E000005',
    product_type: 'Camera',
    product_model: 'LD_CFP',
    nickname: 'Driveway floodlight',
    conn_state: 1,
    device_params: {},
  },
  contact: {
    mac: '777A000006',
    product_type: 'ContactSensor',
    product_model: 'DWS3U',
    nickname: 'Front door',
    conn_state: 1,
    device_params: { open_close_state: 1, is_low_battery: 0 },
  },
  motion: {
    mac: '777A000007',
    product_type: 'MotionSensor',
    product_model: 'PIR3U',
    nickname: 'Hallway motion',
    conn_state: 1,
    device_params: { motion_state: 0, is_low_battery: 1 },
  },
  scale: {
    mac: 'JA000008',
    product_type: 'WyzeScale',
    product_model: 'JA.SC2',
    nickname: 'Scale',
    conn_state: 1,
    device_params: {},
  },
};

// A tiny valid JPEG (1x1 pixel).
export const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAAR' +
    'CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
    'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
    'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWG' +
    'h4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl' +
    '5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCwooor8/P3E//Z',
  'base64',
);

const clone = (value) => JSON.parse(JSON.stringify(value));

// In-memory Wyze client: same methods as src/wyze/client.js.
export class FakeWyzeClient {
  constructor({ devices = Object.values(DEVICES), properties = {}, events = [] } = {}) {
    this.deviceList = clone(devices);
    this.properties = properties; // mac -> { pid: value }
    this.events = events;
    this.calls = [];
    this.image = JPEG;
    this.failWith = null;
  }

  record(name, ...args) {
    this.calls.push({ name, args });
    if (this.failWith) {
      throw this.failWith;
    }
  }

  callsOf(name) {
    return this.calls.filter((call) => call.name === name);
  }

  async getDeviceList() {
    this.record('getDeviceList');
    return clone(this.deviceList);
  }

  async getProperties(device) {
    this.record('getProperties', device.mac);
    return { ...(this.properties[device.mac] ?? {}) };
  }

  async setProperty(device, pid, value) {
    this.record('setProperty', device.mac, pid, String(value));
  }

  async setPropertyList(device, plist) {
    this.record('setPropertyList', device.mac, plist);
  }

  async setDeviceListPropertyList(device, plist) {
    this.record('setDeviceListPropertyList', device.mac, plist);
  }

  async runActionList(device, plist) {
    this.record('runActionList', device.mac, plist);
  }

  async runAction(device, actionKey) {
    this.record('runAction', device.mac, actionKey);
  }

  async getEvents(since) {
    this.record('getEvents', since);
    return clone(this.events);
  }

  async fetchImage(url) {
    this.record('fetchImage', url);
    return this.image;
  }
}

/**
 * A hub on a fake Gladys and a fake Wyze client.
 * @param {object} [options]
 * @param {string[]} [options.created] keys of DEVICES created in Gladys (default: all)
 */
export function createHub({
  created,
  client = new FakeWyzeClient(),
  config = {},
  fetch,
  now,
} = {}) {
  const gladys = createFakeGladys();
  const hub = new WyzeHub({
    gladys,
    client,
    config: normalizeConfig({
      email: 'me@example.com',
      password: 'secret',
      key_id: 'key-id',
      api_key: 'api-key',
      ...config,
    }),
    fetch: fetch ?? (async () => ({ ok: true, status: 200 })),
    now,
  });
  const keys = created ?? Object.keys(DEVICES);
  gladys.devices = keys
    .map((key) => DEVICES[key])
    .filter((device) => blueprintFor(device))
    .map((device) => blueprintFor(device).buildDevice(gladys, device));
  return { gladys, hub, client };
}

export function externalIdOf(gladys, device) {
  return gladys.externalIds(blueprintFor(device).key, device.mac).device;
}

export function featureIdOf(gladys, device, featureKey) {
  return gladys.externalIds(blueprintFor(device).key, device.mac).feature(featureKey);
}
