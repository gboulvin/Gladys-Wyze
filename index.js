// -----------------------------------------------------------------------------
// Entry point of the Wyze integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the Wyze hub (src/hub.js). It holds no
// Wyze logic. It only:
//   1. instantiates the SDK (connection, auth, reconnection: handled by it);
//   2. registers the event handlers BEFORE connect();
//   3. builds a Wyze client + hub for the configured account, and rebuilds
//      them when the credentials change.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { credentialsKey, hasCredentials, normalizeConfig } from './src/config.js';
import { ACTIONS, errorMessage } from './src/actions.js';
import { WyzeHub } from './src/hub.js';
import { t } from './src/i18n.js';
import { SCENE_ACTIONS } from './src/scenes.js';
import { WIDGETS, getWidgetImage, refreshWidgets, widgetSignature } from './src/widgets.js';
import { WyzeClient } from './src/wyze/client.js';
import { createFileStore } from './src/wyze/sessionStore.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();
// Hub of the configured Wyze account, null until the credentials are filled in.
let hub = null;
let hubCredentials = null;
// Last connection status sent, to report changes only.
let lastStatus = null;
let lastWidgetSignature = null;

async function reportStatus(connected, message) {
  const key = JSON.stringify([connected, message ?? null]);
  if (key === lastStatus) {
    return;
  }
  lastStatus = key;
  await gladys
    .setConnectionStatus(connected, message)
    .catch((err) => logger.warn(`setConnectionStatus failed: ${err.message}`));
}

// Called after every sync cycle, successful (err = null) or not.
async function onCycle(err) {
  await reportStatus(err === null, err ? errorMessage(err) : undefined);
  const signature = widgetSignature(hub);
  if (signature !== lastWidgetSignature) {
    lastWidgetSignature = signature;
    refreshWidgets(gladys);
  }
}

// Build (or rebuild) the hub for the configured account and start syncing.
async function applyConfig() {
  if (!hasCredentials(config)) {
    hub?.stop();
    hub = null;
    hubCredentials = null;
    await reportStatus(false, t('missingCredentials'));
    refreshWidgets(gladys);
    return;
  }
  const key = credentialsKey(config);
  if (hub && key === hubCredentials) {
    // Same account: the new interval applies from the next cycle, the
    // local/cloud preference from the next command.
    hub.config = config;
    hub.transportsChanged = true;
    await hub.publishTransports().catch((err) => logger.warn(err.message));
    return;
  }
  hub?.stop();
  const client = new WyzeClient({
    email: config.email,
    password: config.password,
    keyId: config.key_id,
    apiKey: config.api_key,
    store: createFileStore(),
  });
  hub = new WyzeHub({ gladys, client, config });
  hubCredentials = key;
  lastWidgetSignature = null;
  hub.start(onCycle);
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  if (!hub) {
    logger.warn('Scan requested without Wyze credentials');
    return;
  }
  await hub.refreshDeviceList();
  logger.info(`onScanRequest -> ${hub.devices.size} Wyze devices`);
  await gladys.publishDiscoveredDevices(hub.buildDiscoveredDevices());
});

// --- Command: the user acts on a controllable feature ------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  if (!hub) {
    throw new Error('The Wyze account is not configured');
  }
  await hub.setValue(device, feature, value);
});

// --- Camera: Gladys needs a fresh image (dashboard, chat) --------------------
gladys.onGetImage(async (device) => {
  if (!hub) {
    throw new Error('The Wyze account is not configured');
  }
  return hub.getImage(device);
});

// --- A device was added in Gladys: read it now rather than at the next cycle -
gladys.onDeviceCreated(async () => {
  hub?.sync().catch((err) => logger.warn(`Sync after creation failed: ${err.message}`));
});

// --- Manifest actions: buttons of the Configuration screen -------------------
for (const [actionKey, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(actionKey, () => handler(gladys, { hub, config }));
}

// --- Scene actions ------------------------------------------------------------
for (const [actionKey, handler] of Object.entries(SCENE_ACTIONS)) {
  gladys.onSceneAction(actionKey, (fields) => handler(gladys, { fields, hub }));
}

// --- Dashboard widgets --------------------------------------------------------
for (const [widgetKey, widget] of Object.entries(WIDGETS)) {
  gladys.onWidgetGet(widgetKey, (request) => widget.get(gladys, { ...request, hub }));
  gladys.onWidgetAction(widgetKey, (actionKey, params, { settings }) =>
    widget.action(gladys, { actionKey, params, settings, hub }),
  );
}
gladys.onWidgetGetImage((imageKey) => getWidgetImage(hub, imageKey));

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  await applyConfig();
});

// --- Connection lifecycle ----------------------------------------------------
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    // The status and the widgets must be re-sent after a reconnection.
    lastStatus = null;
    lastWidgetSignature = null;
    if (hub && credentialsKey(config) === hubCredentials) {
      hub.config = config;
      hub.transportsChanged = true;
      hub.discoveryPending = true;
      hub.start(onCycle);
    } else {
      await applyConfig();
    }
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await reportStatus(false, {
      en: 'Initialization failed, check the integration logs.',
      fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
      de: 'Initialisierung fehlgeschlagen, prüfen Sie die Logs der Integration.',
      es: 'La inicialización falló, revise los registros de la integración.',
    });
  }
});

gladys.on('disconnected', () => {
  hub?.stop();
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  hub?.stop();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Wyze integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
