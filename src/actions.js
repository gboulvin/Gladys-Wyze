// -----------------------------------------------------------------------------
// Manifest `actions`: the buttons of the Configuration screen. Each handler
// resolves the multi-language message displayed under the button; throwing
// displays the error instead.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasCredentials } from './config.js';
import { blueprintFor } from './devices/index.js';
import { t } from './i18n.js';
import { WyzeAuthError } from './wyze/client.js';

const logger = createLogger({ name: 'actions' });

// Turn a Wyze failure into the message the user can act on.
export function errorMessage(err) {
  if (err instanceof WyzeAuthError) {
    return t('authFailed');
  }
  return t('cloudUnreachable');
}

export const ACTIONS = {
  // Log in and list the devices, without touching Gladys.
  async test_connection(gladys, { hub, config }) {
    if (!hub || !hasCredentials(config)) {
      return t('missingCredentials');
    }
    try {
      const { devices } = await hub.refreshDeviceList();
      const count = (key) => devices.filter((device) => blueprintFor(device).key === key).length;
      return t('connectionOk', {
        total: devices.length,
        lights: count('light'),
        plugs: count('plug'),
        cameras: count('camera'),
        sensors: count('contact-sensor') + count('motion-sensor'),
      });
    } catch (err) {
      logger.warn(`Connection test failed: ${err.message}`);
      return errorMessage(err);
    }
  },

  // Run a sync cycle now and publish the devices to the Discovery tab.
  async sync_now(gladys, { hub, config }) {
    if (!hub || !hasCredentials(config)) {
      return t('missingCredentials');
    }
    try {
      await hub.sync();
      await gladys.publishDiscoveredDevices(hub.buildDiscoveredDevices());
      const summary = hub.summary();
      return t('syncDone', { total: summary.total, created: summary.created });
    } catch (err) {
      logger.warn(`Manual sync failed: ${err.message}`);
      return errorMessage(err);
    }
  },
};
