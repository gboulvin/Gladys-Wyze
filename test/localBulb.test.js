import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import {
  buildLocalRequest,
  encrypt,
  sendLocalCommand,
  supportsLocalControl,
} from '../src/wyze/localBulb.js';
import { DEVICES } from './helpers.js';

const KEY = 'abcdefghijklmnop';

function decrypt(key, base64) {
  const keyBytes = Buffer.from(key, 'ascii');
  const decipher = createDecipheriv('aes-128-cbc', keyBytes, keyBytes);
  decipher.setAutoPadding(false);
  const clear = Buffer.concat([decipher.update(Buffer.from(base64, 'base64')), decipher.final()]);
  let end = clear.length;
  while (end > 0 && clear[end - 1] === 0x05) {
    end -= 1;
  }
  return clear.subarray(0, end).toString('ascii');
}

test('encrypt is AES-128-CBC with the key as IV and 0x05 padding', () => {
  const text = '{"mac":"2CAA8E000002"}';
  const encrypted = encrypt(KEY, text);
  assert.equal(decrypt(KEY, encrypted), text);
  // A block-aligned text still gets a full block of padding.
  assert.equal(Buffer.from(encrypt(KEY, 'x'.repeat(16)), 'base64').length, 32);
});

test('the local request carries the encrypted characteristics with escaped slashes', () => {
  const body = buildLocalRequest(DEVICES.colorBulb, [{ pid: 'P3', pvalue: '1' }], 1700000000000);
  const parsed = JSON.parse(body);
  assert.equal(parsed.request, 'set_status');
  assert.equal(parsed.isSendQueue, 0);
  assert.ok(!/[^\\]\//.test(body.split('"characteristics":')[1]), 'slashes are escaped');
  assert.deepEqual(JSON.parse(decrypt(KEY, parsed.characteristics)), {
    mac: '2CAA8E000002',
    index: '1',
    ts: '1700000000000',
    plist: [{ pid: 'P3', pvalue: '1' }],
  });
});

test('local control needs a LAN address and a 16-character key', () => {
  assert.equal(supportsLocalControl(DEVICES.colorBulb), true);
  assert.equal(supportsLocalControl(DEVICES.whiteBulb), false);
  assert.equal(supportsLocalControl({ ...DEVICES.colorBulb, enr: 'short' }), false);
  assert.equal(supportsLocalControl({ ...DEVICES.colorBulb, device_params: {} }), false);
});

test('sendLocalCommand posts to port 88 of the bulb and fails on an HTTP error', async () => {
  const requests = [];
  const fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: requests.length === 1, status: requests.length === 1 ? 200 : 500 };
  };
  await sendLocalCommand(DEVICES.colorBulb, [{ pid: 'P3', pvalue: '0' }], { fetch });
  assert.equal(requests[0].url, 'http://192.168.1.21:88/device_request');
  assert.equal(requests[0].options.method, 'POST');
  await assert.rejects(
    sendLocalCommand(DEVICES.colorBulb, [{ pid: 'P3', pvalue: '0' }], { fetch }),
    /HTTP 500/,
  );
});
