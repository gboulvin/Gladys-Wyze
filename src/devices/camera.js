// -----------------------------------------------------------------------------
// Device type: CAMERA
//
// Every Wyze camera gets:
//   - an image: the latest thumbnail the Wyze cloud holds (event capture or
//     periodic cloud thumbnail). The cloud API offers no live frame, so the
//     image follows the events, not the second;
//   - a motion sensor, raised by the camera events (src/sync.js) and lowered
//     once no event came for MOTION_HOLD_MS.
// Cameras driven by the app API (most models) also get their power, siren and
// motion detection switches. The models of the newer "device management" API
// (Floodlight Pro, Battery Cam Pro, OG, Pan v4) keep the image and the motion
// sensor only.
// -----------------------------------------------------------------------------

import {
  createLogger,
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
} from '@gladysassistant/integration-sdk';
import {
  DEVICEMGMT_CAMERA_MODELS,
  OUTDOOR_CAMERA_MODELS,
  PIDS,
  PRODUCT_TYPES,
} from '../wyze/constants.js';
import { toBinary } from './convert.js';

const DEVICE_TYPE = 'camera';

const logger = createLogger({ name: DEVICE_TYPE });

export const CAMERA_FEATURES = {
  IMAGE: 'image',
  MOTION: 'motion',
  POWER: 'power',
  SIREN: 'siren',
  MOTION_DETECTION: 'motion-detection',
};

// Gladys refuses camera images over 150 KB.
const MAX_GLADYS_IMAGE_BYTES = 150 * 1024;

export function hasAppControls(device) {
  return !DEVICEMGMT_CAMERA_MODELS.includes(device.product_model);
}

// URL of the freshest thumbnail: the last event seen by the sync, or the
// cloud thumbnail of the device list.
export function thumbnailUrl(hub, device) {
  return (
    hub.lastEvents.get(device.mac)?.imageUrl ??
    device.device_params?.camera_thumbnails?.thumbnails_url ??
    null
  );
}

/**
 * Download the latest thumbnail of a camera.
 * @returns {Promise<Buffer|null>} null when the cloud has none
 */
export async function fetchThumbnail(hub, device) {
  const url = thumbnailUrl(hub, device);
  if (!url) {
    return null;
  }
  return hub.client.fetchImage(url);
}

export async function setSiren(hub, device, on) {
  if (!hasAppControls(device)) {
    throw new Error(`The siren of a ${device.product_model} is not supported`);
  }
  await hub.client.runAction(device, on ? 'siren_on' : 'siren_off');
}

export async function setMotionDetection(hub, device, on) {
  if (!hasAppControls(device)) {
    throw new Error(`The motion detection of a ${device.product_model} is not supported`);
  }
  const value = on ? 1 : 0;
  if (OUTDOOR_CAMERA_MODELS.includes(device.product_model)) {
    await hub.client.setPropertyList(device, [
      { pid: PIDS.WCO_MOTION_DETECTION, pvalue: String(value) },
    ]);
    return;
  }
  await hub.client.setProperty(device, PIDS.MOTION_DETECTION, value);
  await hub.client.setProperty(device, PIDS.MOTION_DETECTION_TOGGLE, value);
}

export const camera = {
  key: DEVICE_TYPE,
  productTypes: [PRODUCT_TYPES.CAMERA],

  buildDevice(gladys, device) {
    const ids = gladys.externalIds(DEVICE_TYPE, device.mac);
    const features = [
      {
        name: 'Image',
        external_id: ids.feature(CAMERA_FEATURES.IMAGE),
        category: DEVICE_FEATURE_CATEGORIES.CAMERA,
        type: DEVICE_FEATURE_TYPES.CAMERA.IMAGE,
        read_only: true,
        has_feedback: false,
        keep_history: false,
      },
      {
        name: 'Motion',
        external_id: ids.feature(CAMERA_FEATURES.MOTION),
        category: DEVICE_FEATURE_CATEGORIES.MOTION_SENSOR,
        type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        read_only: true,
        has_feedback: false,
        keep_history: true,
        min: 0,
        max: 1,
      },
    ];
    if (hasAppControls(device)) {
      features.push(
        {
          name: 'Power',
          external_id: ids.feature(CAMERA_FEATURES.POWER),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 1,
        },
        {
          name: 'Siren',
          external_id: ids.feature(CAMERA_FEATURES.SIREN),
          category: DEVICE_FEATURE_CATEGORIES.SIREN,
          type: DEVICE_FEATURE_TYPES.SIREN.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 1,
        },
        {
          name: 'Motion detection',
          external_id: ids.feature(CAMERA_FEATURES.MOTION_DETECTION),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 1,
        },
      );
    }
    return {
      name: device.nickname || device.product_model,
      external_id: ids.device,
      model: device.product_model,
      features,
    };
  },

  async readStates(hub, device) {
    const states = { [CAMERA_FEATURES.MOTION]: hub.isMotionActive(device.mac) ? 1 : 0 };
    if (!hasAppControls(device)) {
      return states;
    }
    const props = await hub.client.getProperties(device);
    if (props[PIDS.ON] !== undefined) {
      states[CAMERA_FEATURES.POWER] = toBinary(props[PIDS.ON]);
    }
    if (props[PIDS.CAMERA_SIREN] !== undefined) {
      states[CAMERA_FEATURES.SIREN] = toBinary(props[PIDS.CAMERA_SIREN]);
    }
    const detectionPid = OUTDOOR_CAMERA_MODELS.includes(device.product_model)
      ? PIDS.WCO_MOTION_DETECTION
      : PIDS.MOTION_DETECTION;
    if (props[detectionPid] !== undefined) {
      states[CAMERA_FEATURES.MOTION_DETECTION] = toBinary(props[detectionPid]);
    }
    return states;
  },

  async setValue(hub, device, featureKey, value) {
    const on = value === 1;
    switch (featureKey) {
      case CAMERA_FEATURES.POWER:
        if (!hasAppControls(device)) {
          throw new Error(`The power of a ${device.product_model} is not supported`);
        }
        await hub.client.runAction(device, on ? 'power_on' : 'power_off');
        return on ? 1 : 0;
      case CAMERA_FEATURES.SIREN:
        await setSiren(hub, device, on);
        return on ? 1 : 0;
      case CAMERA_FEATURES.MOTION_DETECTION:
        await setMotionDetection(hub, device, on);
        return on ? 1 : 0;
      default:
        throw new Error(`Feature ${featureKey} of a camera is read-only`);
    }
  },

  // Fresh image asked by Gladys (dashboard, chat): the latest cloud thumbnail.
  async getImage(hub, device) {
    const image = await fetchThumbnail(hub, device);
    if (!image) {
      throw new Error('The Wyze cloud holds no image of this camera yet');
    }
    return toGladysImage(image);
  },
};

/**
 * The `image/jpg;base64,...` string Gladys expects, or an error when the
 * thumbnail exceeds what Gladys accepts.
 */
export function toGladysImage(buffer) {
  if (buffer.length > MAX_GLADYS_IMAGE_BYTES) {
    logger.warn(`Thumbnail of ${buffer.length} bytes is over the 150 KB Gladys accepts`);
    throw new Error('The camera thumbnail is larger than the 150 KB Gladys accepts');
  }
  return `image/jpg;base64,${buffer.toString('base64')}`;
}
