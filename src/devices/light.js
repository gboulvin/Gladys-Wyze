// -----------------------------------------------------------------------------
// Device type: LIGHT
//
// White bulbs (Light), color bulbs (MeshLight) and light strips (LightStrip):
// on/off, brightness, color temperature, and color for the mesh families.
//
// Color bulbs and light strips are the only Wyze devices with a local channel:
// when the user prefers the local connection, their commands go to the bulb
// on the LAN (src/wyze/localBulb.js) and fall back to the cloud on failure,
// which the transport badge reports as degraded. White bulbs and every read
// go through the cloud.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  DEVICE_TRANSPORTS,
} from '@gladysassistant/integration-sdk';
import { COLOR_TEMP_RANGE, PIDS, PRODUCT_TYPES } from '../wyze/constants.js';
import { sendLocalCommand, supportsLocalControl } from '../wyze/localBulb.js';
import {
  clamp,
  hexToInt,
  intToHex,
  kelvinToMired,
  miredToKelvin,
  toBinary,
  toNumber,
} from './convert.js';

const DEVICE_TYPE = 'light';

const logger = createLogger({ name: DEVICE_TYPE });

export const LIGHT_FEATURES = {
  POWER: 'power',
  BRIGHTNESS: 'brightness',
  TEMPERATURE: 'temperature',
  COLOR: 'color',
};

// After a failed local command, stay on the cloud for a while instead of
// waiting for the LAN timeout on every command.
const LOCAL_RETRY_DELAY_MS = 5 * 60 * 1000;

const isMesh = (device) =>
  device.product_type === PRODUCT_TYPES.MESH_LIGHT ||
  device.product_type === PRODUCT_TYPES.LIGHT_STRIP;

function temperatureRange(device) {
  const kelvin = COLOR_TEMP_RANGE[device.product_type] ?? COLOR_TEMP_RANGE[PRODUCT_TYPES.LIGHT];
  // Mireds go the other way round: the warmest kelvin is the highest mired.
  return { min: kelvinToMired(kelvin.max), max: kelvinToMired(kelvin.min), kelvin };
}

// Whether a command for this light should try the LAN first.
function shouldUseLocal(hub, device) {
  if (!isMesh(device) || hub.config.GLADYS_PREFER_LOCAL === false) {
    return false;
  }
  if (!supportsLocalControl(device)) {
    return false;
  }
  const failure = hub.localFailures.get(device.mac);
  return !failure || hub.now() - failure.at > LOCAL_RETRY_DELAY_MS;
}

async function sendPlist(hub, device, plist) {
  if (device.product_type === PRODUCT_TYPES.LIGHT) {
    const power = plist.filter((item) => item.pid === PIDS.ON);
    const others = plist.filter((item) => item.pid !== PIDS.ON);
    if (power.length > 0) {
      await hub.client.setDeviceListPropertyList(device, power);
    }
    if (others.length > 0) {
      await hub.client.setPropertyList(device, others);
    }
    return;
  }
  if (shouldUseLocal(hub, device)) {
    try {
      await sendLocalCommand(device, plist, { fetch: hub.fetch });
      hub.localFailures.delete(device.mac);
      return;
    } catch (err) {
      logger.warn(`Local command to ${device.nickname} failed (${err.message}), using the cloud`);
      hub.localFailures.set(device.mac, { at: hub.now(), message: err.message });
      hub.transportsChanged = true;
    }
  }
  await hub.client.runActionList(device, plist);
}

export const light = {
  key: DEVICE_TYPE,
  productTypes: [PRODUCT_TYPES.LIGHT, PRODUCT_TYPES.MESH_LIGHT, PRODUCT_TYPES.LIGHT_STRIP],

  buildDevice(gladys, device) {
    const ids = gladys.externalIds(DEVICE_TYPE, device.mac);
    const range = temperatureRange(device);
    const features = [
      {
        name: 'Power',
        external_id: ids.feature(LIGHT_FEATURES.POWER),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        min: 0,
        max: 1,
      },
      {
        name: 'Brightness',
        external_id: ids.feature(LIGHT_FEATURES.BRIGHTNESS),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        read_only: false,
        has_feedback: true,
        keep_history: true,
        min: 1,
        max: 100,
      },
      {
        name: 'Color temperature',
        external_id: ids.feature(LIGHT_FEATURES.TEMPERATURE),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.TEMPERATURE,
        read_only: false,
        has_feedback: true,
        keep_history: false,
        min: range.min,
        max: range.max,
      },
    ];
    if (isMesh(device)) {
      features.push({
        name: 'Color',
        external_id: ids.feature(LIGHT_FEATURES.COLOR),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.COLOR,
        read_only: false,
        has_feedback: true,
        keep_history: false,
        min: 0,
        max: 0xffffff,
      });
    }
    return {
      name: device.nickname || device.product_model,
      external_id: ids.device,
      model: device.product_model,
      features,
    };
  },

  async readStates(hub, device) {
    const props = await hub.client.getProperties(device);
    const states = {};
    if (props[PIDS.ON] !== undefined) {
      states[LIGHT_FEATURES.POWER] = toBinary(props[PIDS.ON]);
    }
    const brightness = toNumber(props[PIDS.BRIGHTNESS]);
    if (brightness !== null) {
      states[LIGHT_FEATURES.BRIGHTNESS] = clamp(Math.round(brightness), 1, 100);
    }
    const kelvin = toNumber(props[PIDS.COLOR_TEMP]);
    if (kelvin) {
      const range = temperatureRange(device);
      states[LIGHT_FEATURES.TEMPERATURE] = clamp(kelvinToMired(kelvin), range.min, range.max);
    }
    if (isMesh(device) && props[PIDS.COLOR]) {
      const color = hexToInt(props[PIDS.COLOR]);
      if (color !== null) {
        states[LIGHT_FEATURES.COLOR] = color;
      }
    }
    return states;
  },

  async setValue(hub, device, featureKey, value) {
    switch (featureKey) {
      case LIGHT_FEATURES.POWER: {
        const on = value === 1 ? 1 : 0;
        await sendPlist(hub, device, [{ pid: PIDS.ON, pvalue: String(on) }]);
        return on;
      }
      case LIGHT_FEATURES.BRIGHTNESS: {
        const level = clamp(Math.round(value), 1, 100);
        await sendPlist(hub, device, [{ pid: PIDS.BRIGHTNESS, pvalue: String(level) }]);
        return level;
      }
      case LIGHT_FEATURES.TEMPERATURE: {
        const range = temperatureRange(device);
        const mired = clamp(Math.round(value), range.min, range.max);
        const kelvin = clamp(miredToKelvin(mired), range.kelvin.min, range.kelvin.max);
        await sendPlist(hub, device, [{ pid: PIDS.COLOR_TEMP, pvalue: String(kelvin) }]);
        return mired;
      }
      case LIGHT_FEATURES.COLOR: {
        if (!isMesh(device)) {
          throw new Error('This Wyze bulb has no color');
        }
        await sendPlist(hub, device, [{ pid: PIDS.COLOR, pvalue: intToHex(value) }]);
        return clamp(Math.round(value), 0, 0xffffff);
      }
      default:
        throw new Error(`Unknown light feature: ${featureKey}`);
    }
  },

  // Effective channel of the light, shown as a badge in Gladys.
  transport(hub, device) {
    if (!shouldUseLocal(hub, device)) {
      const failure = hub.localFailures.get(device.mac);
      if (failure && hub.config.GLADYS_PREFER_LOCAL !== false && isMesh(device)) {
        return {
          transport: DEVICE_TRANSPORTS.CLOUD,
          degraded: true,
          message: {
            en: 'Local command failed, using the Wyze cloud.',
            fr: 'Commande locale en échec, passage par le cloud Wyze.',
            de: 'Lokaler Befehl fehlgeschlagen, Nutzung der Wyze-Cloud.',
            es: 'Fallo del comando local, se usa la nube de Wyze.',
          },
        };
      }
      return { transport: DEVICE_TRANSPORTS.CLOUD };
    }
    return { transport: DEVICE_TRANSPORTS.LOCAL };
  },
};
