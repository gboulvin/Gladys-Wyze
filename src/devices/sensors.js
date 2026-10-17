// -----------------------------------------------------------------------------
// Device types: CONTACT SENSOR and MOTION SENSOR (Wyze Sense).
//
// Their state travels in the device list itself (`device_params`), which the
// sync reads once per cycle for the whole account: no call per sensor.
//
// Gladys opening sensors read 1 when closed and 0 when open; Wyze says the
// opposite (`open_close_state` 1 = open).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { PRODUCT_TYPES } from '../wyze/constants.js';
import { toBinary } from './convert.js';

export const SENSOR_FEATURES = {
  OPENING: 'opening',
  MOTION: 'motion',
  BATTERY_LOW: 'battery-low',
};

const batteryLowFeature = (ids) => ({
  name: 'Low battery',
  external_id: ids.feature(SENSOR_FEATURES.BATTERY_LOW),
  category: DEVICE_FEATURE_CATEGORIES.BATTERY_LOW,
  type: DEVICE_FEATURE_TYPES.BATTERY_LOW.BINARY,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 1,
});

function batteryLowState(device) {
  const value = device.device_params?.is_low_battery;
  return value === undefined || value === null
    ? {}
    : { [SENSOR_FEATURES.BATTERY_LOW]: toBinary(value) };
}

// Whether a contact sensor reads open, from the device list entry.
export function isOpen(device) {
  return toBinary(device.device_params?.open_close_state) === 1;
}

export const contactSensor = {
  key: 'contact-sensor',
  productTypes: [PRODUCT_TYPES.CONTACT_SENSOR],

  buildDevice(gladys, device) {
    const ids = gladys.externalIds(this.key, device.mac);
    return {
      name: device.nickname || device.product_model,
      external_id: ids.device,
      model: device.product_model,
      features: [
        {
          name: 'Contact',
          external_id: ids.feature(SENSOR_FEATURES.OPENING),
          category: DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1,
        },
        batteryLowFeature(ids),
      ],
    };
  },

  async readStates(_hub, device) {
    const states = batteryLowState(device);
    if (device.device_params?.open_close_state !== undefined) {
      states[SENSOR_FEATURES.OPENING] = isOpen(device) ? 0 : 1;
    }
    return states;
  },
};

export const motionSensor = {
  key: 'motion-sensor',
  productTypes: [PRODUCT_TYPES.MOTION_SENSOR],

  buildDevice(gladys, device) {
    const ids = gladys.externalIds(this.key, device.mac);
    return {
      name: device.nickname || device.product_model,
      external_id: ids.device,
      model: device.product_model,
      features: [
        {
          name: 'Motion',
          external_id: ids.feature(SENSOR_FEATURES.MOTION),
          category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
          type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
          read_only: true,
          has_feedback: false,
          keep_history: true,
          min: 0,
          max: 1,
        },
        batteryLowFeature(ids),
      ],
    };
  },

  async readStates(_hub, device) {
    const states = batteryLowState(device);
    if (device.device_params?.motion_state !== undefined) {
      states[SENSOR_FEATURES.MOTION] = toBinary(device.device_params.motion_state);
    }
    return states;
  },
};
