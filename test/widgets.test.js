import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  CAMERA_WIDGET,
  OVERVIEW_WIDGET,
  WIDGETS,
  getWidgetImage,
  refreshWidgets,
  widgetSignature,
} from '../src/widgets.js';
import { DEVICES, FakeWyzeClient, createHub, externalIdOf } from './helpers.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

async function contentOf(key, { gladys, hub }, settings = {}, language = 'en') {
  return WIDGETS[key].get(gladys, { settings, language, units: 'metric', hub });
}

test('the overview is rendered exactly as sent, in every language', async () => {
  const context = createHub();
  await context.hub.sync();
  for (const language of LANGUAGES) {
    const content = await contentOf(OVERVIEW_WIDGET, context, {}, language);
    assert.deepEqual(validateWidgetContent(content), [], language);
  }
});

test('the overview counts the devices and the open contacts', async () => {
  const client = new FakeWyzeClient();
  client.deviceList.find((device) => device.mac === DEVICES.plug.mac).conn_state = 0;
  const context = createHub({ client });
  await context.hub.sync();
  const content = await contentOf(OVERVIEW_WIDGET, context);
  const tiles = content.components.filter((component) => component.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.value),
    [7, 6, 1, 1],
  );
  const status = content.components.find((component) => component.type === 'status');
  assert.ok(status.items.some((item) => item.label === DEVICES.plug.nickname));
});

test('the overview renders before the first sync and without an account', async () => {
  const gladys = createFakeGladys();
  const content = await WIDGETS[OVERVIEW_WIDGET].get(gladys, { language: 'fr', hub: null });
  assert.deepEqual(validateWidgetContent(content), []);
});

test('the camera widget is valid, with and without image controls', async () => {
  const context = createHub();
  await context.hub.sync();
  for (const device of [DEVICES.camera, DEVICES.floodlightPro]) {
    const settings = { camera: externalIdOf(context.gladys, device) };
    const content = await contentOf(CAMERA_WIDGET, context, settings, 'de');
    assert.deepEqual(validateWidgetContent(content), [], device.nickname);
  }
  const unknown = await contentOf(CAMERA_WIDGET, context, { camera: 'nope' });
  assert.deepEqual(validateWidgetContent(unknown), []);
});

test('the camera image key changes with the thumbnail and serves a valid image', async () => {
  const context = createHub();
  await context.hub.sync();
  const settings = { camera: externalIdOf(context.gladys, DEVICES.camera) };
  const imageOf = async () =>
    (await contentOf(CAMERA_WIDGET, context, settings)).components.find(
      (component) => component.type === 'image',
    );
  const first = await imageOf();
  assert.match(first.key, /^[a-z0-9][a-z0-9-]{0,63}$/);
  assert.deepEqual(validateWidgetImage(await getWidgetImage(context.hub, first.key)), []);

  context.hub.lastEvents.set(DEVICES.camera.mac, {
    id: 'e9',
    mac: DEVICES.camera.mac,
    ts: Date.now(),
    event: 'motion',
    object: 'none',
    imageUrl: 'https://wyze.example/e9.jpg',
  });
  const second = await imageOf();
  assert.notEqual(second.key, first.key, 'a new image needs a new key: the core caches by key');
  await assert.rejects(getWidgetImage(context.hub, 'unknown-key'));
});

test('the live tile of the camera widget is bound to a published feature', async () => {
  const context = createHub();
  await context.hub.sync();
  const settings = { camera: externalIdOf(context.gladys, DEVICES.camera) };
  const featureIds = new Set(
    context.hub
      .buildDiscoveredDevices()
      .flatMap((device) => device.features.map((feature) => feature.external_id)),
  );
  const tiles = (await contentOf(CAMERA_WIDGET, context, settings)).components.filter(
    (component) => component.device_feature,
  );
  assert.ok(tiles.length > 0);
  for (const tile of tiles) {
    assert.ok(featureIds.has(tile.device_feature), tile.device_feature);
  }
});

test('every button of the widgets is handled and answers a short toast', async () => {
  const context = createHub();
  await context.hub.sync();
  const cases = [
    [OVERVIEW_WIDGET, {}],
    [CAMERA_WIDGET, { camera: externalIdOf(context.gladys, DEVICES.camera) }],
  ];
  for (const [key, settings] of cases) {
    const buttons = (await contentOf(key, context, settings)).components.filter(
      (component) => component.type === 'button' && component.action,
    );
    assert.ok(buttons.length > 0);
    for (const { action } of buttons) {
      const message = await WIDGETS[key].action(context.gladys, {
        actionKey: action.key,
        params: action.params ?? {},
        settings,
        hub: context.hub,
      });
      for (const language of LANGUAGES) {
        assert.ok(message[language].length <= 200, `${key}.${action.key} ${language}`);
      }
    }
  }
  assert.deepEqual(
    context.client.callsOf('runAction').map((call) => call.args[1]),
    ['siren_on', 'siren_off'],
  );
});

test('an unknown widget action fails, so the user sees the error', async () => {
  const context = createHub();
  await assert.rejects(
    WIDGETS[OVERVIEW_WIDGET].action(context.gladys, {
      actionKey: 'unknown',
      settings: {},
      hub: context.hub,
    }),
    /Unknown widget action/,
  );
});

test('refreshWidgets nudges every widget, the signature follows what they show', async () => {
  const fresh = createFakeGladys();
  refreshWidgets(fresh);
  assert.deepEqual(fresh.fake.widgetRefreshes, Object.keys(WIDGETS));

  const client = new FakeWyzeClient();
  const { hub } = createHub({ client });
  await hub.sync();
  const before = widgetSignature(hub);
  await hub.sync();
  assert.equal(widgetSignature(hub), before, 'nothing changed: no nudge');
  client.deviceList.find((device) => device.mac === DEVICES.contact.mac).device_params = {
    open_close_state: 0,
  };
  await hub.sync();
  assert.notEqual(widgetSignature(hub), before);
});
