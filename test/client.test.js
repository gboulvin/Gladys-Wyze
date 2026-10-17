import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WyzeAuthError, WyzeClient, WyzeError, hashPassword } from '../src/wyze/client.js';
import { createMemoryStore } from '../src/wyze/sessionStore.js';
import { AUTH_URL, API_BASE_URL } from '../src/wyze/constants.js';

const md5 = (text) => createHash('md5').update(text).digest('hex');

// A fake Wyze cloud: `routes[url]` answers the JSON body, the requests are recorded.
function fakeFetch(routes) {
  const requests = [];
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    requests.push({ url, headers: options.headers, body });
    const route = routes[url];
    if (!route) {
      throw new Error(`unexpected request ${url}`);
    }
    const json = typeof route === 'function' ? route(body, requests) : route;
    return { ok: true, status: 200, json: async () => json };
  };
  return { fetch, requests };
}

const LOGIN_OK = { access_token: 'access-1', refresh_token: 'refresh-1', user_id: 'u1' };
const credentials = {
  email: 'me@example.com',
  password: 'p4ssword',
  keyId: 'key-id',
  apiKey: 'api-key',
};

test('hashPassword applies MD5 three times, as the Wyze app does', () => {
  assert.equal(hashPassword('p4ssword'), md5(md5(md5('p4ssword'))));
});

test('login sends the hashed password with the developer API key headers', async () => {
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/v2/home_page/get_object_list`]: {
      code: '1',
      data: { device_list: [{ mac: 'A' }] },
    },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  const devices = await client.getDeviceList();
  assert.deepEqual(devices, [{ mac: 'A' }]);

  const [login, list] = requests;
  assert.equal(login.headers.keyid, 'key-id');
  assert.equal(login.headers.apikey, 'api-key');
  assert.deepEqual(login.body, { email: 'me@example.com', password: hashPassword('p4ssword') });
  assert.equal(list.body.access_token, 'access-1');
  assert.equal(list.body.phone_id, client.phoneId);
});

test('a saved session is reused after a restart, without logging in again', async () => {
  const store = createMemoryStore();
  const routes = {
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/v2/home_page/get_object_list`]: { code: '1', data: { device_list: [] } },
  };
  const first = fakeFetch(routes);
  await new WyzeClient({ ...credentials, fetch: first.fetch, store }).getDeviceList();

  const second = fakeFetch(routes);
  const restarted = new WyzeClient({ ...credentials, fetch: second.fetch, store });
  await restarted.getDeviceList();
  assert.equal(second.requests.filter((r) => r.url === AUTH_URL).length, 0);
  assert.equal(restarted.phoneId, store.read().phone_id, 'the phone id stays stable');
});

test('a session of another account is not reused', async () => {
  const store = createMemoryStore({
    email: 'other@example.com',
    key_id: 'key-id',
    access_token: 'x',
    refresh_token: 'y',
    refresh_at: Date.now() + 1e6,
  });
  const client = new WyzeClient({ ...credentials, store });
  assert.equal(client.connected, false);
});

test('an expired access token is refreshed and the call retried once', async () => {
  let listCalls = 0;
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/user/refresh_token`]: {
      code: '1',
      data: { access_token: 'access-2', refresh_token: 'refresh-2' },
    },
    [`${API_BASE_URL}/app/v2/home_page/get_object_list`]: () => {
      listCalls += 1;
      return listCalls === 1
        ? { code: '2001', msg: 'AccessTokenError' }
        : { code: '1', data: { device_list: [] } };
    },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  await client.getDeviceList();
  const refresh = requests.find((r) => r.url.endsWith('/refresh_token'));
  assert.equal(refresh.body.refresh_token, 'refresh-1');
  assert.equal(requests.at(-1).body.access_token, 'access-2');
});

test('the token is refreshed proactively after 23 hours', async () => {
  let now = 1_000_000;
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/user/refresh_token`]: {
      code: '1',
      data: { access_token: 'access-2', refresh_token: 'refresh-2' },
    },
    [`${API_BASE_URL}/app/v2/home_page/get_object_list`]: { code: '1', data: { device_list: [] } },
  });
  const client = new WyzeClient({
    ...credentials,
    fetch,
    store: createMemoryStore(),
    now: () => now,
  });
  await client.getDeviceList();
  now += 24 * 60 * 60 * 1000;
  await client.getDeviceList();
  assert.equal(requests.filter((r) => r.url.endsWith('/refresh_token')).length, 1);
});

test('a refused login is an auth error, and is not retried right away', async () => {
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: { errorCode: 1000, description: 'UserNameOrPasswordError' },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  await assert.rejects(client.getDeviceList(), WyzeAuthError);
  await assert.rejects(client.getDeviceList(), WyzeAuthError);
  assert.equal(requests.length, 1, 'Wyze locks accounts that log in too often');
});

test('missing credentials fail without any request', async () => {
  const { fetch, requests } = fakeFetch({});
  const client = new WyzeClient({ email: 'me@example.com', fetch, store: createMemoryStore() });
  assert.equal(client.configured, false);
  await assert.rejects(client.getDeviceList(), WyzeAuthError);
  assert.equal(requests.length, 0);
});

test('an offline device answers null, any other error code throws', async () => {
  const { fetch } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/v2/device/set_property`]: { code: '3019', msg: 'offline' },
    [`${API_BASE_URL}/app/v2/auto/run_action`]: { code: '1001', msg: 'parameter error' },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  const device = { mac: 'A', product_model: 'WLPP1CFH' };
  assert.equal(await client.setProperty(device, 'P3', 1), null);
  await assert.rejects(client.runAction(device, 'siren_on'), (err) => {
    assert.ok(err instanceof WyzeError);
    assert.equal(err.code, '1001');
    return true;
  });
});

test('getProperties maps the property list by pid', async () => {
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/v2/device/get_property_list`]: {
      code: '1',
      data: {
        property_list: [
          { pid: 'P3', value: '1' },
          { pid: 'P1501', value: '80' },
        ],
      },
    },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  const props = await client.getProperties({ mac: 'A', product_model: 'WLPA19' });
  assert.deepEqual(props, { P3: '1', P1501: '80' });
  assert.equal(requests.at(-1).body.device_mac, 'A');
});

test('the bulk endpoint carries its own signature pair', async () => {
  const { fetch, requests } = fakeFetch({
    [AUTH_URL]: LOGIN_OK,
    [`${API_BASE_URL}/app/v2/device_list/set_property_list`]: { code: '1', data: {} },
  });
  const client = new WyzeClient({ ...credentials, fetch, store: createMemoryStore() });
  await client.setDeviceListPropertyList({ mac: 'A', product_model: 'WLPA19' }, [
    { pid: 'P3', pvalue: '1' },
  ]);
  const { body } = requests.at(-1);
  assert.equal(body.sv, 'ddb9baef0d7f44379cd6bfaa8698e682');
  assert.deepEqual(body.device_list[0].property_list, [{ pid: 'P3', pvalue: '1' }]);
});
