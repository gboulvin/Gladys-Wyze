// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` of the manifest; the SDK
// fetches it (`gladys.getConfig()`) and notifies every change
// (`gladys.onConfigUpdated()`). This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  key_id: '',
  api_key: '',
  // Seconds between two sync cycles with the Wyze cloud.
  poll_frequency: 60,
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' in its `transports` field, so Gladys shows a standard "Prefer
  // the local connection" toggle and sends the user's choice here. It drives
  // the LAN commands of the color bulbs and light strips. Read-only for the
  // integration; defaults to true.
  GLADYS_PREFER_LOCAL: true,
};

// Bounds of the sync interval: faster hammers the Wyze cloud, slower makes
// the sensors useless.
export const POLL_FREQUENCY_MIN = 30;
export const POLL_FREQUENCY_MAX = 3600;

const asString = (value) => (typeof value === 'string' ? value : '');

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    email: asString(raw.email).trim(),
    password: asString(raw.password),
    key_id: asString(raw.key_id).trim(),
    api_key: asString(raw.api_key).trim(),
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_MAX, Math.max(POLL_FREQUENCY_MIN, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

export function hasCredentials(config) {
  return Boolean(config.email && config.password && config.key_id && config.api_key);
}

// What identifies the Wyze account: a change of these needs a new session.
export function credentialsKey(config) {
  return JSON.stringify([config.email, config.password, config.key_id, config.api_key]);
}
