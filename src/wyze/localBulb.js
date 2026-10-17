// -----------------------------------------------------------------------------
// Local (LAN) control of Wyze mesh bulbs and light strips.
//
// Color bulbs and light strips accept commands on port 88 of their LAN
// address, encrypted with the per-device key (`enr`) the device list carries.
// Reads still go through the cloud; local commands are faster and keep working
// when the Wyze cloud is slow. Any failure falls back to the cloud (see
// src/devices/light.js), which reports it as a degraded transport.
//
// The scheme mirrors the Wyze app: AES-128-CBC with the key as IV, the clear
// text padded with 0x05 bytes, base64 with escaped slashes.
// -----------------------------------------------------------------------------

import { createCipheriv } from 'node:crypto';

const LOCAL_PORT = 88;
const LOCAL_TIMEOUT_MS = 3_000;
const PADDING_BYTE = 0x05;
const BLOCK_SIZE = 16;

// A device can be driven locally when the cloud gave both its LAN address and
// a 16-character key.
export function supportsLocalControl(device) {
  return (
    typeof device?.enr === 'string' &&
    device.enr.length === BLOCK_SIZE &&
    typeof device?.device_params?.ip === 'string' &&
    device.device_params.ip !== ''
  );
}

export function encrypt(key, text) {
  const clear = Buffer.from(text, 'ascii');
  const padLength = BLOCK_SIZE - (clear.length % BLOCK_SIZE);
  const padded = Buffer.concat([clear, Buffer.alloc(padLength, PADDING_BYTE)]);
  const keyBytes = Buffer.from(key, 'ascii');
  const cipher = createCipheriv('aes-128-cbc', keyBytes, keyBytes);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

export function buildLocalRequest(device, plist, now = Date.now()) {
  const characteristics = JSON.stringify({
    mac: device.mac.toUpperCase(),
    index: '1',
    ts: String(now),
    plist,
  });
  const encrypted = encrypt(device.enr, characteristics);
  // The bulb expects the slashes of the base64 escaped, as the app sends them.
  return JSON.stringify({
    request: 'set_status',
    isSendQueue: 0,
    characteristics: encrypted,
  }).replace(encrypted, encrypted.replaceAll('/', '\\/'));
}

export async function sendLocalCommand(
  device,
  plist,
  { fetch: fetchImpl = globalThis.fetch } = {},
) {
  const response = await fetchImpl(
    `http://${device.device_params.ip}:${LOCAL_PORT}/device_request`,
    {
      method: 'POST',
      body: buildLocalRequest(device, plist),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Local command refused (HTTP ${response.status})`);
  }
}
