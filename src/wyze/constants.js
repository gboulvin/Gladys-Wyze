// -----------------------------------------------------------------------------
// Wyze cloud API constants.
//
// Wyze publishes no official device API: these values are the ones the Wyze
// mobile app sends, as documented by the open-source clients the community
// maintains (wyzeapy, wyze-sdk). The login itself uses the official
// developer API key (https://developer-api-console.wyze.com), which also
// spares the account the two-factor prompt.
// -----------------------------------------------------------------------------

export const AUTH_URL = 'https://auth-prod.api.wyze.com/api/user/login';
export const API_BASE_URL = 'https://api.wyzecam.com';

export const APP = {
  PHONE_SYSTEM_TYPE: '1',
  API_KEY: 'WMXHYf79Nr5gIlt3r0r7p9Tcw5bvs6BB4U8O8nGJ',
  APP_VERSION: '2.18.43',
  APP_VER: 'com.hualai.WyzeCam___2.18.43',
  APP_NAME: 'com.hualai.WyzeCam',
  SC: '9f275790cab94a72bd206c8876429f3c',
  SV: '9d74946e652647e9b6c9d59326aef104',
};

// Some endpoints check their own `sc` / `sv` pair.
export const ENDPOINT_SIGNATURES = {
  '/app/v2/device_list/set_property_list': {
    sc: 'a626948714654991afd3c0dbd7cdb901',
    sv: 'ddb9baef0d7f44379cd6bfaa8698e682',
  },
  '/app/v2/device/get_event_list': { sv: '782ced6909a44d92a1f70d582bbe88be' },
};

// `code` of the app API answers.
export const RESPONSE_CODES = {
  SUCCESS: '1',
  PARAMETER_ERROR: '1001',
  ACCESS_TOKEN_ERROR: '2001',
  DEVICE_OFFLINE: '3019',
};

// Property ids (`pid`) of the app API.
export const PIDS = {
  NOTIFICATION: 'P1',
  ON: 'P3',
  AVAILABLE: 'P5',
  BRIGHTNESS: 'P1501', // 0-100
  COLOR_TEMP: 'P1502', // kelvin
  COLOR: 'P1507', // RRGGBB
  COLOR_MODE: 'P1508', // 1 color, 2 white, 3 effect
  MOTION_DETECTION_TOGGLE: 'P1001',
  WCO_MOTION_DETECTION: 'P1029',
  MOTION_DETECTION: 'P1047',
  CAMERA_SIREN: 'P1049',
};

// `product_type` values of the device list.
export const PRODUCT_TYPES = {
  LIGHT: 'Light',
  MESH_LIGHT: 'MeshLight',
  LIGHT_STRIP: 'LightStrip',
  PLUG: 'Plug',
  OUTDOOR_PLUG: 'OutdoorPlug',
  CAMERA: 'Camera',
  CONTACT_SENSOR: 'ContactSensor',
  MOTION_SENSOR: 'MotionSensor',
};

// Cameras driven by the newer "device management" API: their power, siren and
// detection settings are not reachable through the app API properties.
export const DEVICEMGMT_CAMERA_MODELS = ['LD_CFP', 'AN_RSCW', 'GW_GC1', 'HL_PAN4'];

// Outdoor cameras keep their detection switch on a dedicated property.
export const OUTDOOR_CAMERA_MODELS = ['WVOD1', 'HL_WCO2'];

// Color temperature range (kelvin) per light family.
export const COLOR_TEMP_RANGE = {
  [PRODUCT_TYPES.LIGHT]: { min: 2700, max: 6500 },
  [PRODUCT_TYPES.MESH_LIGHT]: { min: 1800, max: 6500 },
  [PRODUCT_TYPES.LIGHT_STRIP]: { min: 1800, max: 6500 },
};

// Camera event `event_value` codes, grouped by what the scene author picks.
export const EVENT_VALUES = {
  motion: ['1', '6', '7', '13'],
  sound: ['2'],
  smoke: ['4'],
  co: ['5'],
  doorbell: ['10'],
  face: ['12'],
};

// Camera event AI `tag_list` codes (Cam Plus).
export const EVENT_TAGS = {
  101: 'person',
  102: 'vehicle',
  103: 'pet',
  104: 'package',
};
