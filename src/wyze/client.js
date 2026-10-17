// -----------------------------------------------------------------------------
// Wyze cloud client.
//
// One instance per set of credentials (index.js builds a new one whenever the
// configuration changes). It owns the session: login with the developer API
// key, refresh of the access token, retry once on an expired token, and the
// session kept on disk so a restart does not log in again (Wyze locks an
// account that logs in too often).
//
// Every app API call shares the same envelope (app identification, timestamp,
// access token) and answers `{ code, msg, data }`, `code` "1" meaning success.
// -----------------------------------------------------------------------------

import { createHash, randomUUID } from 'node:crypto';
import { createLogger } from '@gladysassistant/integration-sdk';
import { API_BASE_URL, APP, AUTH_URL, ENDPOINT_SIGNATURES, RESPONSE_CODES } from './constants.js';

const logger = createLogger({ name: 'wyze-client' });

// Wyze access tokens live 24 hours: refresh an hour before.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;
// After a refused login, wait before trying again: repeated failures lock the
// Wyze account. A configuration change builds a new client and retries at once.
const LOGIN_RETRY_DELAY_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
// Camera thumbnails are small JPEGs; anything bigger is not one.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export class WyzeError extends Error {
  constructor(message, { code } = {}) {
    super(message);
    this.name = 'WyzeError';
    this.code = code;
  }
}

// The credentials are wrong or the session cannot be renewed: retrying
// without a configuration change will not help.
export class WyzeAuthError extends WyzeError {
  constructor(message, options) {
    super(message, options);
    this.name = 'WyzeAuthError';
  }
}

/**
 * Wyze hashes the account password three times with MD5 before sending it.
 * A protocol requirement, not a security choice.
 */
export function hashPassword(password) {
  let hash = password;
  for (let i = 0; i < 3; i += 1) {
    hash = createHash('md5').update(hash).digest('hex');
  }
  return hash;
}

export class WyzeClient {
  /**
   * @param {object} options
   * @param {string} options.email Wyze account email
   * @param {string} options.password Wyze account password (plain text)
   * @param {string} options.keyId developer API key id
   * @param {string} options.apiKey developer API key
   * @param {{ read(): object|null, write(object): void }} [options.store] session storage
   * @param {typeof fetch} [options.fetch] HTTP implementation (tests)
   * @param {() => number} [options.now] clock (tests)
   */
  constructor({ email, password, keyId, apiKey, store, fetch: fetchImpl, now } = {}) {
    this.email = (email ?? '').trim();
    this.password = password ?? '';
    this.keyId = (keyId ?? '').trim();
    this.apiKey = (apiKey ?? '').trim();
    this.store = store;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.now = now ?? Date.now;
    this.session = this.restoreSession();
    this.phoneId = this.session?.phone_id ?? randomUUID();
    this.lastLoginFailure = null;
  }

  get configured() {
    return Boolean(this.email && this.password && this.keyId && this.apiKey);
  }

  get connected() {
    return Boolean(this.session?.access_token);
  }

  // A stored session only belongs to the same account and API key.
  restoreSession() {
    try {
      const saved = this.store?.read();
      if (saved?.email === this.email && saved?.key_id === this.keyId && saved.access_token) {
        return saved;
      }
    } catch (err) {
      logger.warn(`Unable to read the saved Wyze session: ${err.message}`);
    }
    return null;
  }

  saveSession(accessToken, refreshToken) {
    this.session = {
      email: this.email,
      key_id: this.keyId,
      phone_id: this.phoneId,
      access_token: accessToken,
      refresh_token: refreshToken,
      refresh_at: this.now() + TOKEN_TTL_MS,
    };
    try {
      this.store?.write(this.session);
    } catch (err) {
      logger.warn(`Unable to save the Wyze session: ${err.message}`);
    }
  }

  async httpJson(url, { method = 'POST', headers = {}, body } = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new WyzeError(`Wyze cloud unreachable: ${err.message}`);
    }
    let json;
    try {
      json = await response.json();
    } catch {
      throw new WyzeError(`Unexpected answer from the Wyze cloud (HTTP ${response.status})`);
    }
    return json;
  }

  async login() {
    if (!this.configured) {
      throw new WyzeAuthError('Wyze credentials are missing');
    }
    if (this.lastLoginFailure && this.now() - this.lastLoginFailure.at < LOGIN_RETRY_DELAY_MS) {
      throw this.lastLoginFailure.error;
    }
    logger.info('Logging in to the Wyze cloud');
    const json = await this.httpJson(AUTH_URL, {
      headers: { keyid: this.keyId, apikey: this.apiKey, 'User-Agent': 'gladys-wyze' },
      body: { email: this.email, password: hashPassword(this.password) },
    });
    if (json.errorCode !== undefined && json.errorCode !== null) {
      const error = new WyzeAuthError(`Wyze login refused: ${json.description ?? json.errorCode}`, {
        code: String(json.errorCode),
      });
      this.lastLoginFailure = { error, at: this.now() };
      throw error;
    }
    if (!json.access_token) {
      // An account with two-factor authentication answers `mfa_options`
      // instead of a token when the API key is not accepted.
      const error = new WyzeAuthError(
        json.mfa_options
          ? 'Wyze asks for a two-factor code: check the API key id and API key'
          : 'Wyze login answered without an access token',
      );
      this.lastLoginFailure = { error, at: this.now() };
      throw error;
    }
    this.lastLoginFailure = null;
    this.saveSession(json.access_token, json.refresh_token);
  }

  async refresh() {
    logger.debug('Refreshing the Wyze access token');
    const json = await this.httpJson(`${API_BASE_URL}/app/user/refresh_token`, {
      headers: { 'X-API-Key': APP.API_KEY },
      body: {
        ...this.envelope(),
        refresh_token: this.session.refresh_token,
      },
    });
    if (String(json.code) !== RESPONSE_CODES.SUCCESS || !json.data?.access_token) {
      throw new WyzeAuthError(`Wyze token refresh refused: ${json.msg ?? json.code}`, {
        code: String(json.code),
      });
    }
    this.saveSession(json.data.access_token, json.data.refresh_token);
  }

  async ensureSession({ force = false } = {}) {
    if (!this.session || !this.session.refresh_token) {
      await this.login();
      return;
    }
    if (force || this.now() >= this.session.refresh_at) {
      try {
        await this.refresh();
      } catch (err) {
        if (!(err instanceof WyzeAuthError)) {
          throw err;
        }
        logger.warn(`${err.message}, logging in again`);
        this.session = null;
        await this.login();
      }
    }
  }

  // Fields every app API request carries (`sc` / `sv` may be overridden per endpoint).
  envelope() {
    return {
      phone_system_type: APP.PHONE_SYSTEM_TYPE,
      app_version: APP.APP_VERSION,
      app_ver: APP.APP_VER,
      app_name: APP.APP_NAME,
      phone_id: this.phoneId,
      sc: APP.SC,
      sv: APP.SV,
      ts: Math.floor(this.now() / 1000),
    };
  }

  /**
   * Call an app API endpoint and resolve its `data`. A device offline answers
   * `null` instead of failing: the caller reports it as unreachable.
   */
  async call(path, payload = {}, { retried = false } = {}) {
    await this.ensureSession();
    const json = await this.httpJson(`${API_BASE_URL}${path}`, {
      body: {
        ...this.envelope(),
        ...ENDPOINT_SIGNATURES[path],
        access_token: this.session.access_token,
        ...payload,
      },
    });
    const code = String(json.code);
    if (code === RESPONSE_CODES.SUCCESS) {
      return json.data ?? {};
    }
    if (code === RESPONSE_CODES.ACCESS_TOKEN_ERROR && !retried) {
      await this.ensureSession({ force: true });
      return this.call(path, payload, { retried: true });
    }
    if (code === RESPONSE_CODES.DEVICE_OFFLINE) {
      return null;
    }
    if (code === RESPONSE_CODES.ACCESS_TOKEN_ERROR) {
      throw new WyzeAuthError('Wyze refused the access token', { code });
    }
    throw new WyzeError(`Wyze API error ${code} on ${path}: ${json.msg ?? 'unknown error'}`, {
      code,
    });
  }

  async getDeviceList() {
    const data = await this.call('/app/v2/home_page/get_object_list');
    return data?.device_list ?? [];
  }

  // Resolves `{ P3: '1', P1501: '80', ... }`.
  async getProperties(device) {
    const data = await this.call('/app/v2/device/get_property_list', {
      device_mac: device.mac,
      device_model: device.product_model,
      target_pid_list: [],
    });
    return Object.fromEntries((data?.property_list ?? []).map(({ pid, value }) => [pid, value]));
  }

  async setProperty(device, pid, value) {
    return this.call('/app/v2/device/set_property', {
      device_mac: device.mac,
      device_model: device.product_model,
      pid,
      pvalue: String(value),
    });
  }

  async setPropertyList(device, plist) {
    return this.call('/app/v2/device/set_property_list', {
      device_mac: device.mac,
      device_model: device.product_model,
      property_list: plist,
    });
  }

  // Current white bulb firmware only honors the power property through this
  // bulk endpoint (the single-device one answers success and does nothing).
  async setDeviceListPropertyList(device, plist) {
    return this.call('/app/v2/device_list/set_property_list', {
      device_list: [
        { device_mac: device.mac, device_model: device.product_model, property_list: plist },
      ],
    });
  }

  // Mesh bulbs and light strips are driven through actions.
  async runActionList(device, plist) {
    return this.call('/app/v2/auto/run_action_list', {
      action_list: [
        {
          instance_id: device.mac,
          provider_key: device.product_model,
          action_key: 'set_mesh_property',
          action_params: { list: [{ mac: device.mac, plist }] },
        },
      ],
    });
  }

  async runAction(device, actionKey) {
    return this.call('/app/v2/auto/run_action', {
      instance_id: device.mac,
      provider_key: device.product_model,
      action_key: actionKey,
      action_params: {},
      custom_string: '',
    });
  }

  /**
   * Latest camera events of the account, newest first.
   * @param {number} since epoch milliseconds
   */
  async getEvents(since, count = 20) {
    const data = await this.call('/app/v2/device/get_event_list', {
      begin_time: since,
      end_time: this.now(),
      count,
      order_by: 2,
      event_type: '',
      event_value_list: [],
      event_tag_list: [],
      device_mac_list: [],
      device_mac: '',
    });
    return data?.event_list ?? [];
  }

  // Thumbnails are signed URLs of the Wyze storage: no session involved.
  async fetchImage(url) {
    let response;
    try {
      response = await this.fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new WyzeError(`Thumbnail unreachable: ${err.message}`);
    }
    if (!response.ok) {
      throw new WyzeError(`Thumbnail download failed (HTTP ${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new WyzeError('Thumbnail too large');
    }
    return buffer;
  }
}
