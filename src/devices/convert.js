// -----------------------------------------------------------------------------
// Conversions between Wyze values and Gladys feature values.
// -----------------------------------------------------------------------------

// Wyze properties are strings ("1", "0"), device_params are numbers.
export function toBinary(value) {
  return String(value) === '1' || value === true ? 1 : 0;
}

export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Gladys light temperatures are in mireds (the Hue and Zigbee convention):
// the slider goes from cold (low) to warm (high). Wyze speaks kelvin.
export function kelvinToMired(kelvin) {
  return Math.round(1_000_000 / kelvin);
}

export function miredToKelvin(mired) {
  return Math.round(1_000_000 / mired);
}

// Gladys colors are RGB integers, Wyze colors "RRGGBB" strings.
export function hexToInt(hex) {
  const value = Number.parseInt(String(hex).replace(/^#/, ''), 16);
  return Number.isFinite(value) ? clamp(value, 0, 0xffffff) : null;
}

export function intToHex(value) {
  return clamp(Math.round(value), 0, 0xffffff).toString(16).padStart(6, '0').toUpperCase();
}
