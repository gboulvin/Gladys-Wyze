// -----------------------------------------------------------------------------
// User-facing texts of the code (action messages, widget labels, toasts,
// connection status), in the four languages of the Gladys UI. Gladys picks
// the user's language from these objects, English being the fallback.
//
// `t(key, vars)` returns the multi-language object of a key, with `{name}`
// placeholders replaced by `vars.name`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  missingCredentials: {
    en: 'Fill in your Wyze email, password, API key id and API key.',
    fr: 'Renseignez votre e-mail Wyze, votre mot de passe, l’identifiant et la clé d’API.',
    de: 'Geben Sie Ihre Wyze-E-Mail, Ihr Passwort, die API-Key-ID und den API-Key ein.',
    es: 'Introduzca su correo de Wyze, su contraseña, el ID y la clave de API.',
  },
  authFailed: {
    en: 'Wyze refused the login: check your credentials and API key.',
    fr: 'Wyze a refusé la connexion : vérifiez vos identifiants et votre clé d’API.',
    de: 'Wyze hat die Anmeldung abgelehnt: Prüfen Sie Zugangsdaten und API-Key.',
    es: 'Wyze rechazó el inicio de sesión: revise sus credenciales y su clave de API.',
  },
  cloudUnreachable: {
    en: 'The Wyze cloud does not answer, retrying at the next sync.',
    fr: 'Le cloud Wyze ne répond pas, nouvel essai à la prochaine synchronisation.',
    de: 'Die Wyze-Cloud antwortet nicht, neuer Versuch bei der nächsten Synchronisation.',
    es: 'La nube de Wyze no responde, se reintentará en la próxima sincronización.',
  },
  connectionOk: {
    en: 'Connected to Wyze: {total} supported devices found ({lights} lights, {plugs} plugs, {cameras} cameras, {sensors} sensors).',
    fr: 'Connecté à Wyze : {total} appareils compatibles trouvés ({lights} lampes, {plugs} prises, {cameras} caméras, {sensors} capteurs).',
    de: 'Mit Wyze verbunden: {total} unterstützte Geräte gefunden ({lights} Lampen, {plugs} Steckdosen, {cameras} Kameras, {sensors} Sensoren).',
    es: 'Conectado a Wyze: {total} dispositivos compatibles encontrados ({lights} luces, {plugs} enchufes, {cameras} cámaras, {sensors} sensores).',
  },
  syncDone: {
    en: 'Synchronized: {total} Wyze devices, {created} added to Gladys.',
    fr: 'Synchronisé : {total} appareils Wyze, dont {created} ajoutés à Gladys.',
    de: 'Synchronisiert: {total} Wyze-Geräte, davon {created} in Gladys hinzugefügt.',
    es: 'Sincronizado: {total} dispositivos Wyze, {created} añadidos a Gladys.',
  },
  sirenOn: {
    en: 'Siren started.',
    fr: 'Sirène déclenchée.',
    de: 'Sirene ausgelöst.',
    es: 'Sirena activada.',
  },
  sirenOff: {
    en: 'Siren stopped.',
    fr: 'Sirène arrêtée.',
    de: 'Sirene gestoppt.',
    es: 'Sirena detenida.',
  },
  detectionOn: {
    en: 'Motion detection enabled.',
    fr: 'Détection de mouvement activée.',
    de: 'Bewegungserkennung aktiviert.',
    es: 'Detección de movimiento activada.',
  },
  detectionOff: {
    en: 'Motion detection disabled.',
    fr: 'Détection de mouvement désactivée.',
    de: 'Bewegungserkennung deaktiviert.',
    es: 'Detección de movimiento desactivada.',
  },
  imageRefreshed: {
    en: 'Latest image fetched.',
    fr: 'Dernière image récupérée.',
    de: 'Letztes Bild abgerufen.',
    es: 'Última imagen obtenida.',
  },
  // Widget texts.
  overviewDevices: { en: 'Devices', fr: 'Appareils', de: 'Geräte', es: 'Dispositivos' },
  overviewOnline: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  overviewOffline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  overviewOpen: { en: 'Open', fr: 'Ouverts', de: 'Offen', es: 'Abiertos' },
  overviewCloud: { en: 'Wyze cloud', fr: 'Cloud Wyze', de: 'Wyze-Cloud', es: 'Nube de Wyze' },
  overviewLastSync: {
    en: 'Last sync',
    fr: 'Dernière synchro',
    de: 'Letzte Synchronisation',
    es: 'Última sincronización',
  },
  overviewLastEvent: {
    en: 'Last camera event',
    fr: 'Dernier événement caméra',
    de: 'Letztes Kameraereignis',
    es: 'Último evento de cámara',
  },
  overviewNever: { en: 'Never', fr: 'Jamais', de: 'Nie', es: 'Nunca' },
  overviewNone: { en: 'None', fr: 'Aucun', de: 'Keines', es: 'Ninguno' },
  overviewConnected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  overviewError: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  overviewWaiting: { en: 'Waiting', fr: 'En attente', de: 'Wartend', es: 'En espera' },
  syncNow: {
    en: 'Sync now',
    fr: 'Synchroniser',
    de: 'Jetzt synchron.',
    es: 'Sincronizar',
  },
  cameraPower: { en: 'Power', fr: 'Alimentation', de: 'Stromversorgung', es: 'Encendido' },
  cameraDetection: {
    en: 'Motion detection',
    fr: 'Détection de mouvement',
    de: 'Bewegungserkennung',
    es: 'Detección de movimiento',
  },
  cameraSiren: { en: 'Siren', fr: 'Sirène', de: 'Sirene', es: 'Sirena' },
  cameraConnection: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
  cameraNoImage: {
    en: 'No image yet: Wyze keeps one per event.',
    fr: 'Pas encore d’image : Wyze en garde une par événement.',
    de: 'Noch kein Bild: Wyze speichert eines pro Ereignis.',
    es: 'Aún no hay imagen: Wyze guarda una por evento.',
  },
  cameraUnknown: {
    en: 'Pick a Wyze camera in the widget settings.',
    fr: 'Choisissez une caméra Wyze dans les réglages du widget.',
    de: 'Wählen Sie eine Wyze-Kamera in den Widget-Einstellungen.',
    es: 'Elija una cámara Wyze en los ajustes del widget.',
  },
  cameraLatestImage: {
    en: 'Latest image',
    fr: 'Dernière image',
    de: 'Letztes Bild',
    es: 'Última imagen',
  },
  sirenStart: { en: 'Siren', fr: 'Sirène', de: 'Sirene', es: 'Sirena' },
  sirenStop: { en: 'Stop siren', fr: 'Stop sirène', de: 'Sirene aus', es: 'Parar sirena' },
  refreshImage: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  on: { en: 'On', fr: 'Activé', de: 'An', es: 'Activado' },
  off: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  // Camera event kinds and recognized objects.
  event_motion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
  event_sound: { en: 'Sound', fr: 'Son', de: 'Geräusch', es: 'Sonido' },
  event_smoke: {
    en: 'Smoke alarm',
    fr: 'Alarme fumée',
    de: 'Rauchalarm',
    es: 'Alarma de humo',
  },
  event_co: { en: 'CO alarm', fr: 'Alarme CO', de: 'CO-Alarm', es: 'Alarma de CO' },
  event_doorbell: { en: 'Doorbell', fr: 'Sonnette', de: 'Türklingel', es: 'Timbre' },
  event_face: { en: 'Face', fr: 'Visage', de: 'Gesicht', es: 'Cara' },
  event_other: { en: 'Event', fr: 'Événement', de: 'Ereignis', es: 'Evento' },
  object_person: { en: 'person', fr: 'personne', de: 'Person', es: 'persona' },
  object_vehicle: { en: 'vehicle', fr: 'véhicule', de: 'Fahrzeug', es: 'vehículo' },
  object_pet: { en: 'pet', fr: 'animal', de: 'Haustier', es: 'mascota' },
  object_package: { en: 'package', fr: 'colis', de: 'Paket', es: 'paquete' },
};

export function t(key, vars = {}) {
  const entry = MESSAGES[key];
  if (!entry) {
    throw new Error(`Unknown message: ${key}`);
  }
  return Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      entry[lang].replace(/\{(\w+)\}/g, (match, name) =>
        vars[name] === undefined ? match : String(vars[name]),
      ),
    ]),
  );
}

// Combine multi-language objects language by language: `join([a, ' - ', b])`.
export function join(parts) {
  return Object.fromEntries(
    LANGUAGES.map((lang) => [
      lang,
      parts.map((part) => (typeof part === 'string' ? part : part[lang])).join(''),
    ]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const messages = MESSAGES;
