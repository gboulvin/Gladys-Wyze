// -----------------------------------------------------------------------------
// Wyze hub: the runtime state of the integration for one Wyze account.
//
// One sync cycle, every `poll_frequency` seconds:
//   1. read the device list (one call for the whole account: names, online
//      state, sensor states);
//   2. read the camera events since the last cycle -> camera motion sensors,
//      `camera_event` scene trigger, camera image;
//   3. read the properties of the CREATED lights, plugs and cameras (one call
//      each) and publish the values that changed;
//   4. fire `device_connection` when a device goes offline or comes back, and
//      publish the transport badges.
// Only the devices the user created in Gladys are read and published: Gladys
// drops the states of the others, and the Wyze API is spared.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import {
  blueprintFor,
  deviceExternalId,
  featureKeyOf,
  isSupported,
  DEVICE_BLUEPRINTS,
} from './devices/index.js';
import { camera, fetchThumbnail, toGladysImage } from './devices/camera.js';
import { normalizeEvent } from './events.js';
import { PRODUCT_TYPES } from './wyze/constants.js';

const logger = createLogger({ name: 'hub' });

export const SCENE_TRIGGERS = {
  CAMERA_EVENT: 'camera_event',
  DEVICE_CONNECTION: 'device_connection',
};

// How long a camera event keeps the camera motion sensor raised.
export const MOTION_HOLD_MS = 30_000;
// The cloud indexes events with a delay: look a bit further back than the
// previous cycle, the event ids deduplicate.
const EVENT_LOOKBACK_MS = 5 * 60 * 1000;
const MAX_SEEN_EVENTS = 500;
// An unchanged value is re-sent every 30 minutes so it stays recently dated.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

export class WyzeHub {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {import('./wyze/client.js').WyzeClient} options.client
   * @param {object} options.config normalized configuration
   * @param {typeof fetch} [options.fetch] HTTP implementation of the LAN commands
   * @param {() => number} [options.now] clock (tests)
   */
  constructor({ gladys, client, config, fetch: fetchImpl, now }) {
    this.gladys = gladys;
    this.client = client;
    this.config = config;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.now = now ?? Date.now;

    this.devices = new Map(); // mac -> Wyze device list entry
    this.lastEvents = new Map(); // mac -> last normalized event
    this.motionUntil = new Map(); // mac -> epoch ms
    this.localFailures = new Map(); // mac -> { at, message }
    this.online = new Map(); // mac -> boolean
    this.seenEvents = new Set();
    this.eventsSince = null;
    this.transportsChanged = true;
    // Publish the discovered devices at the next cycle, even if the list did
    // not change (first cycle, reconnection).
    this.discoveryPending = true;

    this.lastSyncAt = null;
    this.lastError = null;
    this.timer = null;
    this.running = null;
  }

  // --- Device catalog ----------------------------------------------------------

  supportedDevices() {
    return [...this.devices.values()];
  }

  createdExternalIds() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  isCreated(device, created = this.createdExternalIds()) {
    return created.has(deviceExternalId(this.gladys, device));
  }

  findByExternalId(externalId) {
    return this.supportedDevices().find(
      (device) => deviceExternalId(this.gladys, device) === externalId,
    );
  }

  buildDiscoveredDevices() {
    return this.supportedDevices().map((device) =>
      blueprintFor(device).buildDevice(this.gladys, device),
    );
  }

  isOnline(device) {
    // `conn_state` is absent on some sub-devices: assume online then.
    return device.conn_state === undefined || Number(device.conn_state) === 1;
  }

  isMotionActive(mac) {
    return (this.motionUntil.get(mac) ?? 0) > this.now();
  }

  async refreshDeviceList() {
    const list = await this.client.getDeviceList();
    const supported = list.filter(isSupported);
    const unsupported = list.filter((device) => !isSupported(device));
    if (unsupported.length > 0) {
      logger.debug(
        `Unsupported Wyze devices skipped: ${unsupported.map((d) => d.product_type).join(', ')}`,
      );
    }
    const before = new Set(this.devices.keys());
    this.devices = new Map(supported.map((device) => [device.mac, device]));
    const changed =
      before.size !== this.devices.size || supported.some((device) => !before.has(device.mac));
    return { devices: supported, changed };
  }

  // --- Sync cycle --------------------------------------------------------------

  /**
   * Run one sync cycle. Never runs twice at the same time: a cycle asked while
   * another one runs waits for it.
   */
  async sync() {
    if (this.running) {
      return this.running;
    }
    this.running = this.runSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async runSync() {
    try {
      const { changed } = await this.refreshDeviceList();
      if (changed || this.discoveryPending) {
        // New devices show up in the Discovery tab without a manual scan.
        await this.gladys.publishDiscoveredDevices(this.buildDiscoveredDevices());
        this.discoveryPending = false;
      }
      const created = this.createdExternalIds();
      await this.syncEvents(created);
      await this.syncStates(created);
      await this.syncConnections(created);
      await this.publishTransports();
      this.lastSyncAt = this.now();
      this.lastError = null;
    } catch (err) {
      this.lastError = err;
      throw err;
    }
  }

  async syncStates(created) {
    const states = [];
    for (const device of this.supportedDevices()) {
      if (!this.isCreated(device, created) || !this.isOnline(device)) {
        continue;
      }
      const blueprint = blueprintFor(device);
      try {
        const values = await blueprint.readStates(this, device);
        const ids = this.gladys.externalIds(blueprint.key, device.mac);
        for (const [featureKey, state] of Object.entries(values)) {
          states.push({ device_feature_external_id: ids.feature(featureKey), state });
        }
      } catch (err) {
        // One device failing must not hide the others.
        logger.warn(`Unable to read ${device.nickname} (${device.product_model}): ${err.message}`);
      }
    }
    if (states.length > 0) {
      await this.gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  async syncEvents(created) {
    const cameras = this.supportedDevices().filter(
      (device) => device.product_type === PRODUCT_TYPES.CAMERA && this.isCreated(device, created),
    );
    if (cameras.length === 0) {
      return;
    }
    const firstRun = this.eventsSince === null;
    const since = (this.eventsSince ?? this.now()) - EVENT_LOOKBACK_MS;
    this.eventsSince = this.now();
    const events = (await this.client.getEvents(since))
      .map(normalizeEvent)
      .filter((event) => event && this.devices.has(event.mac))
      .sort((a, b) => a.ts - b.ts);

    const newestPerCamera = new Map();
    for (const event of events) {
      if (this.seenEvents.has(event.id)) {
        continue;
      }
      this.rememberEvent(event.id);
      this.lastEvents.set(event.mac, event);
      newestPerCamera.set(event.mac, event);
      // Events older than the start of the integration are history: they set
      // the latest thumbnail, they fire nothing.
      if (firstRun) {
        continue;
      }
      const device = this.devices.get(event.mac);
      if (!this.isCreated(device, created)) {
        continue;
      }
      if (event.isMotion) {
        this.motionUntil.set(event.mac, this.now() + MOTION_HOLD_MS);
      }
      await this.fireSceneEvent(SCENE_TRIGGERS.CAMERA_EVENT, {
        device: deviceExternalId(this.gladys, device),
        event: event.event,
        object: event.object,
      });
    }
    if (!firstRun) {
      for (const event of newestPerCamera.values()) {
        await this.publishCameraImage(this.devices.get(event.mac));
      }
    }
  }

  // A refused event (rate limit...) must not stop the cycle: the states
  // still have to be published.
  async fireSceneEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  rememberEvent(id) {
    this.seenEvents.add(id);
    if (this.seenEvents.size > MAX_SEEN_EVENTS) {
      // Sets iterate in insertion order: drop the oldest.
      this.seenEvents.delete(this.seenEvents.values().next().value);
    }
  }

  async publishCameraImage(device) {
    try {
      const image = await fetchThumbnail(this, device);
      if (image) {
        await this.gladys.publishCameraImage(
          deviceExternalId(this.gladys, device),
          toGladysImage(image),
        );
      }
    } catch (err) {
      logger.warn(`No image published for ${device.nickname}: ${err.message}`);
    }
  }

  async syncConnections(created) {
    for (const device of this.supportedDevices()) {
      const online = this.isOnline(device);
      const before = this.online.get(device.mac);
      this.online.set(device.mac, online);
      if (before === undefined || before === online) {
        continue;
      }
      this.transportsChanged = true;
      if (this.isCreated(device, created)) {
        logger.info(`${device.nickname} is ${online ? 'back online' : 'offline'}`);
        await this.fireSceneEvent(SCENE_TRIGGERS.DEVICE_CONNECTION, {
          device: deviceExternalId(this.gladys, device),
          status: online ? 'online' : 'offline',
        });
      }
    }
  }

  // --- Transport badge ---------------------------------------------------------

  transportEntries() {
    return this.supportedDevices().map((device) => {
      const blueprint = blueprintFor(device);
      let entry = { transport: DEVICE_TRANSPORTS.CLOUD };
      if (!this.isOnline(device)) {
        entry = { transport: DEVICE_TRANSPORTS.UNREACHABLE };
      } else if (typeof blueprint.transport === 'function') {
        entry = blueprint.transport(this, device);
      }
      return { external_id: deviceExternalId(this.gladys, device), ...entry };
    });
  }

  async publishTransports({ force = false } = {}) {
    if (!force && !this.transportsChanged) {
      return;
    }
    const entries = this.transportEntries();
    // publishTransports takes at most 100 entries per request.
    for (let i = 0; i < entries.length; i += 100) {
      await this.gladys.publishTransports(entries.slice(i, i + 100));
    }
    this.transportsChanged = false;
  }

  // --- Commands ------------------------------------------------------------------

  async setValue(gladysDevice, feature, value) {
    const device = this.findByExternalId(gladysDevice.external_id);
    if (!device) {
      throw new Error(`Unknown Wyze device ${gladysDevice.external_id}`);
    }
    const blueprint = blueprintFor(device);
    const featureKey = featureKeyOf(this.gladys, device, feature.external_id);
    if (typeof blueprint.setValue !== 'function' || !featureKey) {
      throw new Error(`${device.nickname} cannot be controlled`);
    }
    const state = await blueprint.setValue(this, device, featureKey, value);
    if (state !== undefined) {
      await this.gladys.publishChangedStates([
        { device_feature_external_id: feature.external_id, state },
      ]);
    }
    await this.publishTransports();
  }

  async getImage(gladysDevice) {
    const device = this.findByExternalId(gladysDevice.external_id);
    if (!device || blueprintFor(device) !== camera) {
      throw new Error(`No Wyze camera behind ${gladysDevice.external_id}`);
    }
    return camera.getImage(this, device);
  }

  // --- Loop ----------------------------------------------------------------------

  start(onCycle) {
    this.stop();
    const loop = async () => {
      try {
        await this.sync();
        await onCycle?.(null);
      } catch (err) {
        logger.error(`Wyze sync failed: ${err.message}`);
        await onCycle?.(err);
      }
      if (this.timer !== null) {
        this.timer = setTimeout(loop, this.config.poll_frequency * 1000);
      }
    };
    this.timer = setTimeout(loop, 0);
  }

  stop() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // Counters of the overview widget and the connection test.
  summary() {
    const created = this.createdExternalIds();
    const devices = this.supportedDevices();
    const createdDevices = devices.filter((device) => this.isCreated(device, created));
    return {
      total: devices.length,
      created: createdDevices.length,
      online: createdDevices.filter((device) => this.isOnline(device)).length,
      offline: createdDevices.filter((device) => !this.isOnline(device)),
      byFamily: Object.fromEntries(
        DEVICE_BLUEPRINTS.map((bp) => [
          bp.key,
          devices.filter((device) => blueprintFor(device) === bp).length,
        ]),
      ),
    };
  }
}
