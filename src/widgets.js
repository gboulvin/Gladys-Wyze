// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
//   - wyze_overview: the Wyze account at a glance — devices, online/offline,
//     open doors and windows, cloud status, last camera event, a sync button;
//   - wyze_camera: one camera chosen in the widget settings — its latest
//     image, live motion tile, connection, last event, siren buttons.
//
// The content is declarative (the core renders it with its own theme and
// translations); multi-language objects are picked by the core, the values
// computed here (relative times) use the `language` of the viewer.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import {
  camera,
  CAMERA_FEATURES,
  fetchThumbnail,
  hasAppControls,
  setSiren,
  thumbnailUrl,
} from './devices/camera.js';
import { blueprintFor, deviceExternalId } from './devices/index.js';
import { contactSensor, isOpen } from './devices/sensors.js';
import { join, t } from './i18n.js';

const logger = createLogger({ name: 'widgets' });

export const OVERVIEW_WIDGET = 'wyze_overview';
export const CAMERA_WIDGET = 'wyze_camera';

const OVERVIEW_ACTIONS = { SYNC: 'sync' };
const CAMERA_ACTIONS = { SIREN_ON: 'siren_on', SIREN_OFF: 'siren_off', REFRESH: 'refresh' };

// Widget images are cached one hour by key by the core.
const MAX_WIDGET_IMAGE_BYTES = 300 * 1024;
const MAX_STATUS_TEXT = 40;
const MAX_OFFLINE_ROWS = 5;

// Image key -> camera MAC, for onWidgetGetImage (one handler for every key).
const imageKeys = new Map();

function relativeTime(epochMs, language, now = Date.now()) {
  const seconds = Math.round((epochMs - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language || 'en', { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(seconds, 'second');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(Math.round(seconds / 86400), 'day');
}

const truncate = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

// "Motion (person)", in every language.
function describeEvent(event) {
  const kind = t(`event_${event.event}`);
  return event.object === 'none' ? kind : join([kind, ' (', t(`object_${event.object}`), ')']);
}

function cloudStatus(hub) {
  if (!hub) {
    return { value: t('overviewWaiting'), color: WIDGET_COLORS.NEUTRAL };
  }
  if (hub.lastError) {
    return { value: t('overviewError'), color: WIDGET_COLORS.DANGER };
  }
  if (!hub.lastSyncAt) {
    return { value: t('overviewWaiting'), color: WIDGET_COLORS.NEUTRAL };
  }
  return { value: t('overviewConnected'), color: WIDGET_COLORS.SUCCESS };
}

function latestEvent(hub) {
  let latest = null;
  for (const event of hub?.lastEvents.values() ?? []) {
    if (!latest || event.ts > latest.ts) {
      latest = event;
    }
  }
  return latest;
}

export function imageKeyFor(device, url) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  return `wyze-${device.mac.toLowerCase().replace(/[^a-z0-9]/g, '')}-${hash}`.slice(0, 64);
}

async function overviewContent(gladys, { hub, language }) {
  const summary = hub?.summary() ?? { created: 0, online: 0, offline: [] };
  const created = hub?.createdExternalIds() ?? new Set();
  const openContacts = (hub?.supportedDevices() ?? []).filter(
    (device) =>
      blueprintFor(device) === contactSensor && hub.isCreated(device, created) && isOpen(device),
  );
  const event = latestEvent(hub);

  const items = [
    { label: t('overviewCloud'), icon: 'cloud', ...cloudStatus(hub) },
    {
      label: t('overviewLastSync'),
      icon: 'refresh-cw',
      value: hub?.lastSyncAt ? relativeTime(hub.lastSyncAt, language) : t('overviewNever'),
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('overviewLastEvent'),
      icon: 'video',
      value: event
        ? truncate(
            `${hub.devices.get(event.mac)?.nickname ?? event.mac} · ${describeEvent(event)[language] ?? describeEvent(event).en}`,
          )
        : t('overviewNone'),
      color: event ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    },
    ...summary.offline.slice(0, MAX_OFFLINE_ROWS).map((device) => ({
      label: truncate(device.nickname || device.product_model),
      icon: 'wifi-off',
      value: t('overviewOffline'),
      color: WIDGET_COLORS.DANGER,
    })),
  ];

  return {
    // The sync nudges the widget when something it shows changed: the TTL is
    // only a safety net, and keeps the relative times fresh.
    ttl_seconds: 120,
    components: [
      { type: 'value', label: t('overviewDevices'), icon: 'grid', value: summary.created },
      {
        type: 'value',
        label: t('overviewOnline'),
        icon: 'wifi',
        value: summary.online,
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        label: t('overviewOffline'),
        icon: 'wifi-off',
        value: summary.offline.length,
        color: summary.offline.length > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        label: t('overviewOpen'),
        icon: 'unlock',
        value: openContacts.length,
        color: openContacts.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
      },
      { type: 'status', items },
      {
        type: 'button',
        label: t('syncNow'),
        icon: 'refresh-cw',
        style: 'secondary',
        action: { key: OVERVIEW_ACTIONS.SYNC },
      },
    ],
  };
}

async function cameraContent(gladys, { hub, settings, language }) {
  const device = hub?.findByExternalId(settings?.camera);
  if (!device || blueprintFor(device) !== camera) {
    return { ttl_seconds: 60, components: [{ type: 'text', text: t('cameraUnknown') }] };
  }
  const ids = gladys.externalIds(camera.key, device.mac);
  const components = [];

  const url = thumbnailUrl(hub, device);
  if (url) {
    const key = imageKeyFor(device, url);
    imageKeys.set(key, device.mac);
    components.push({ type: 'image', key, alt: t('cameraLatestImage'), fit: 'cover' });
  } else {
    components.push({ type: 'text', text: t('cameraNoImage'), variant: 'caption' });
  }

  // Live tile: follows the published motion state, no refresh needed.
  components.push({
    type: 'value',
    label: t('event_motion'),
    icon: 'activity',
    device_feature: ids.feature(CAMERA_FEATURES.MOTION),
  });

  const event = hub.lastEvents.get(device.mac);
  const online = hub.isOnline(device);
  components.push({
    type: 'status',
    items: [
      {
        label: t('cameraConnection'),
        icon: online ? 'wifi' : 'wifi-off',
        value: online ? t('overviewOnline') : t('overviewOffline'),
        color: online ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
      },
      {
        label: t('overviewLastEvent'),
        icon: 'video',
        value: event
          ? truncate(
              `${describeEvent(event)[language] ?? describeEvent(event).en} · ${relativeTime(event.ts, language)}`,
            )
          : t('overviewNone'),
        color: event ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
      },
    ],
  });

  if (hasAppControls(device)) {
    components.push(
      {
        type: 'button',
        label: t('sirenStart'),
        icon: 'bell',
        style: 'danger',
        action: { key: CAMERA_ACTIONS.SIREN_ON, confirm: true },
      },
      {
        type: 'button',
        label: t('sirenStop'),
        icon: 'bell-off',
        style: 'secondary',
        action: { key: CAMERA_ACTIONS.SIREN_OFF },
      },
    );
  }
  components.push({
    type: 'button',
    label: t('refreshImage'),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: CAMERA_ACTIONS.REFRESH },
  });

  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [OVERVIEW_WIDGET]: {
    get: overviewContent,
    async action(gladys, { actionKey, hub }) {
      if (actionKey !== OVERVIEW_ACTIONS.SYNC) {
        throw new Error(`Unknown widget action: ${actionKey}`);
      }
      if (!hub) {
        throw new Error('The Wyze account is not configured yet');
      }
      await hub.sync();
      const summary = hub.summary();
      return t('syncDone', { total: summary.total, created: summary.created });
    },
  },

  [CAMERA_WIDGET]: {
    get: cameraContent,
    async action(gladys, { actionKey, settings, hub }) {
      const device = hub?.findByExternalId(settings?.camera);
      if (!device || blueprintFor(device) !== camera) {
        throw new Error('Unknown Wyze camera');
      }
      logger.info(`Widget action ${actionKey} -> ${device.nickname}`);
      switch (actionKey) {
        case CAMERA_ACTIONS.SIREN_ON:
          await setSiren(hub, device, true);
          return t('sirenOn');
        case CAMERA_ACTIONS.SIREN_OFF:
          await setSiren(hub, device, false);
          return t('sirenOff');
        case CAMERA_ACTIONS.REFRESH:
          await hub.sync();
          await hub.publishCameraImage(device);
          return t('imageRefreshed');
        default:
          throw new Error(`Unknown widget action: ${actionKey}`);
      }
    },
  },
};

/**
 * onWidgetGetImage: the raw base64 of the image a camera widget declared.
 * The key holds the hash of the thumbnail URL, so a new thumbnail is a new key
 * and the one-hour cache of the core never shows a stale image.
 */
export async function getWidgetImage(hub, imageKey) {
  const mac = imageKeys.get(imageKey);
  const device = mac ? hub?.devices.get(mac) : undefined;
  if (!device) {
    throw new Error(`Unknown widget image ${imageKey}`);
  }
  const image = await fetchThumbnail(hub, device);
  if (!image) {
    throw new Error('No image for this camera');
  }
  if (image.length > MAX_WIDGET_IMAGE_BYTES) {
    throw new Error('The camera thumbnail is larger than the 300 KB a widget accepts');
  }
  return image.toString('base64');
}

/**
 * Ask the core to re-pull every widget now instead of waiting for the TTL:
 * after every (re)connection, configuration change and sync that changed
 * what they show. Rate-limited core-side, dropped silently while disconnected.
 */
export function refreshWidgets(gladys) {
  for (const key of Object.keys(WIDGETS)) {
    gladys.requestWidgetRefresh(key);
  }
}

// What the widgets show, to nudge them only when it changes.
export function widgetSignature(hub) {
  if (!hub) {
    return '';
  }
  const created = hub.createdExternalIds();
  return (
    JSON.stringify(
      hub
        .supportedDevices()
        .map((device) => [
          deviceExternalId(hub.gladys, device),
          hub.isCreated(device, created),
          hub.isOnline(device),
          blueprintFor(device) === contactSensor ? isOpen(device) : null,
          hub.lastEvents.get(device.mac)?.id ?? null,
        ]),
    ) + String(Boolean(hub.lastError))
  );
}
