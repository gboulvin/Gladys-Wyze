// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// Each handler receives the RESOLVED `fields` (a `"source": "devices"` field
// is the chosen device external_id) and resolves the declared scalar
// `outputs`. A device that cannot do what is asked is an output
// (`success: false`), not a failure: a scene action is never a condition, the
// scene author gates the next actions on the output. A Wyze cloud error
// throws: the scene logs it and goes on.
//
// The scene TRIGGERS (`camera_event`, `device_connection`) are fired by the
// sync, see src/hub.js. Never fire one from an action: a scene bound to it
// would loop through the integration.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { camera, hasAppControls, setMotionDetection, setSiren } from './devices/camera.js';
import { blueprintFor } from './devices/index.js';

const logger = createLogger({ name: 'scenes' });

// The Wyze camera behind a device external_id, or null.
function findCamera(hub, externalId) {
  const device = hub?.findByExternalId(externalId);
  return device && blueprintFor(device) === camera ? device : null;
}

export const SCENE_ACTIONS = {
  async camera_siren(gladys, { fields, hub }) {
    const device = findCamera(hub, fields.device);
    if (!device || !hasAppControls(device)) {
      return { success: false };
    }
    const on = fields.state !== 'off';
    logger.info(`Scene action camera_siren -> ${device.nickname}: ${on ? 'on' : 'off'}`);
    await setSiren(hub, device, on);
    return { success: true };
  },

  async camera_motion_detection(gladys, { fields, hub }) {
    const device = findCamera(hub, fields.device);
    if (!device || !hasAppControls(device)) {
      return { success: false };
    }
    const on = fields.state !== 'off';
    logger.info(`Scene action camera_motion_detection -> ${device.nickname}: ${on ? 'on' : 'off'}`);
    await setMotionDetection(hub, device, on);
    return { success: true };
  },

  // Publish the latest image on the camera device, for the core's "send a
  // camera image" action that follows in the scene.
  async camera_snapshot(gladys, { fields, hub }) {
    const device = findCamera(hub, fields.device);
    if (!device) {
      return { published: false };
    }
    try {
      const image = await camera.getImage(hub, device);
      await gladys.publishCameraImage(fields.device, image);
      return { published: true };
    } catch (err) {
      logger.warn(`Scene action camera_snapshot -> ${device.nickname}: ${err.message}`);
      return { published: false };
    }
  },

  async refresh_devices(gladys, { hub }) {
    if (!hub) {
      return { devices: 0, online: 0 };
    }
    await hub.sync();
    const summary = hub.summary();
    return { devices: summary.total, online: summary.online };
  },
};
