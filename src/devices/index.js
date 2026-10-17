// -----------------------------------------------------------------------------
// Device registry.
//
// One blueprint per family of Wyze devices, matched on the `product_type` of
// the Wyze device list. Each blueprint exposes:
//   - key                                 : device type namespace of the external ids
//   - productTypes                        : the Wyze `product_type` values it handles
//   - buildDevice(gladys, device)         : the discovery payload sent to Gladys
//   - readStates(hub, device)             : current values, `{ featureKey: number }`
//   - setValue(hub, device, key, value)   (optional): run a command, resolve the
//     confirmed value
//   - getImage(hub, device)               (optional): fresh camera image
//   - transport(hub, device)              (optional): effective channel, when the
//     device can use another one than the cloud
//
// External ids are built from the device MAC, the unique id Wyze gives every
// device: `ext:<selector>:<type>:<mac>[:<feature>]`. They are forever.
// -----------------------------------------------------------------------------

import { light } from './light.js';
import { plug } from './plug.js';
import { camera } from './camera.js';
import { contactSensor, motionSensor } from './sensors.js';

export const DEVICE_BLUEPRINTS = [light, plug, camera, contactSensor, motionSensor];

export function blueprintFor(device) {
  return DEVICE_BLUEPRINTS.find((bp) => bp.productTypes.includes(device?.product_type));
}

export function isSupported(device) {
  return Boolean(device?.mac) && blueprintFor(device) !== undefined;
}

export function deviceExternalId(gladys, device) {
  return gladys.externalIds(blueprintFor(device).key, device.mac).device;
}

/**
 * Feature key of a feature external id (`...:<mac>:<key>` -> `<key>`), or
 * null when the feature does not belong to the device.
 */
export function featureKeyOf(gladys, device, featureExternalId) {
  const prefix = `${deviceExternalId(gladys, device)}:`;
  return featureExternalId?.startsWith(prefix) ? featureExternalId.slice(prefix.length) : null;
}
