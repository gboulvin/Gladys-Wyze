// -----------------------------------------------------------------------------
// Device type: PLUG
//
// Indoor (Plug) and outdoor (OutdoorPlug) smart plugs: one relay, through the
// cloud. An outdoor plug shows up as one device per outlet, each with its own
// MAC in the Wyze device list.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { PIDS, PRODUCT_TYPES } from '../wyze/constants.js';
import { toBinary } from './convert.js';

const DEVICE_TYPE = 'plug';

export const PLUG_FEATURES = { POWER: 'power' };

export const plug = {
  key: DEVICE_TYPE,
  productTypes: [PRODUCT_TYPES.PLUG, PRODUCT_TYPES.OUTDOOR_PLUG],

  buildDevice(gladys, device) {
    const ids = gladys.externalIds(DEVICE_TYPE, device.mac);
    return {
      name: device.nickname || device.product_model,
      external_id: ids.device,
      model: device.product_model,
      features: [
        {
          name: 'Power',
          external_id: ids.feature(PLUG_FEATURES.POWER),
          category: DEVICE_FEATURE_CATEGORIES.SWITCH,
          type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
          read_only: false,
          has_feedback: true,
          keep_history: true,
          min: 0,
          max: 1,
        },
      ],
    };
  },

  async readStates(hub, device) {
    const props = await hub.client.getProperties(device);
    if (props[PIDS.ON] === undefined) {
      return {};
    }
    return { [PLUG_FEATURES.POWER]: toBinary(props[PIDS.ON]) };
  },

  async setValue(hub, device, featureKey, value) {
    if (featureKey !== PLUG_FEATURES.POWER) {
      throw new Error(`Unknown plug feature: ${featureKey}`);
    }
    const on = value === 1 ? 1 : 0;
    await hub.client.setProperty(device, PIDS.ON, on);
    return on;
  },
};
