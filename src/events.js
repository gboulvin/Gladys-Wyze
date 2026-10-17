// -----------------------------------------------------------------------------
// Camera events of the Wyze cloud, in the vocabulary of the `camera_event`
// scene trigger.
//
// `event` says what the camera noticed (motion, sound, smoke alarm...),
// `object` what the Wyze AI recognized in it (person, vehicle...; Cam Plus),
// `none` when nothing was recognized. Both values are the `options` of the
// trigger filters in the manifest: keys are forever.
// -----------------------------------------------------------------------------

import { EVENT_TAGS, EVENT_VALUES } from './wyze/constants.js';

export const EVENT_KINDS = ['motion', 'sound', 'smoke', 'co', 'doorbell', 'face', 'other'];
export const EVENT_OBJECTS = ['person', 'vehicle', 'pet', 'package', 'none'];

// Events that mean something moved in front of the camera: they raise the
// camera motion sensor.
const MOTION_KINDS = ['motion', 'face', 'doorbell'];

function eventKind(value) {
  const code = String(value);
  return Object.keys(EVENT_VALUES).find((kind) => EVENT_VALUES[kind].includes(code)) ?? 'other';
}

function eventObject(tagList) {
  for (const tag of tagList ?? []) {
    const code = typeof tag === 'object' && tag !== null ? (tag.tag ?? tag.id) : tag;
    const object = EVENT_TAGS[Number(code)];
    if (object) {
      return object;
    }
  }
  return 'none';
}

// The image of an event (`type` 1), when the cloud kept one.
function eventImageUrl(fileList) {
  const image = (fileList ?? []).find((file) => Number(file.type) === 1 && file.url);
  return image?.url ?? null;
}

/**
 * Normalize one entry of `get_event_list`.
 * @returns {{ id: string, mac: string, ts: number, event: string, object: string,
 *   imageUrl: string|null, isMotion: boolean }|null}
 */
export function normalizeEvent(raw) {
  if (!raw?.event_id || !raw?.device_mac) {
    return null;
  }
  const event = eventKind(raw.event_value);
  const object = eventObject(raw.tag_list);
  return {
    id: String(raw.event_id),
    mac: raw.device_mac,
    ts: Number(raw.event_ts) || 0,
    event,
    object,
    imageUrl: eventImageUrl(raw.file_list),
    isMotion: MOTION_KINDS.includes(event) || object !== 'none',
  };
}
