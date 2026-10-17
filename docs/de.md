# Wyze

Steuern Sie Ihre [Wyze](https://www.wyze.com)-Geräte mit Gladys Assistant:
Lampen, LED-Streifen, Steckdosen, Kameras und Wyze-Sense-Sensoren, mit
Szenen-Auslösern und -Aktionen sowie zwei Dashboard-Widgets.

## Unterstützte Geräte

| Wyze-Gerät                                            | In Gladys                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Weiße Lampe (WLPA19, HL_HWB2)                         | Ein/Aus, Helligkeit, Farbtemperatur                                      |
| Farblampe (WLPA19C, BR30) und LED-Streifen (HL_LSL)   | Ein/Aus, Helligkeit, Farbtemperatur, Farbe — **lokale Steuerung** im LAN |
| Steckdose und Außensteckdose (WLPP1, WLPP1CFH, WLPPO) | Ein/Aus (ein Gerät pro Ausgang)                                          |
| Kameras (Cam v2/v3/v4, Pan, Outdoor, Doorbell...)     | Letztes Bild, Bewegung, Stromversorgung, Sirene, Bewegungserkennung      |
| Floodlight Pro, Battery Cam Pro, Cam OG, Pan v4       | Letztes Bild und Bewegung (ihre Steuerung nutzt eine andere Wyze-API)    |
| Wyze-Sense-Kontaktsensor (DWS3U, DWS2U)               | Offen/geschlossen, Batterie schwach                                      |
| Wyze-Sense-Bewegungsmelder (PIR3U, PIR2U)             | Bewegung, Batterie schwach                                               |

Andere Wyze-Geräte (Schlösser, Thermostat, Staubsauger, Waagen...) werden
ignoriert.

## Vorbereitung: einen Wyze-API-Key erstellen

Wyze lässt Drittanwendungen nur mit einem persönlichen API-Key zusätzlich zu
E-Mail und Passwort zu. Der Key erspart auch den Zwei-Faktor-Code.

1. Öffnen Sie die [Wyze-Entwicklerkonsole](https://developer-api-console.wyze.com/#/apikey/view)
   und melden Sie sich mit Ihrem Wyze-Konto an.
2. Erstellen Sie einen API-Key. Kopieren Sie die **KEY ID** und den
   **API KEY**: Der API KEY wird nur einmal angezeigt.
3. Bewahren Sie beide für die Konfiguration auf. Sie können den Key jederzeit
   in derselben Konsole widerrufen.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie Ihre Wyze-**E-Mail**, Ihr **Passwort**, die **API-Key-ID** und
   den **API-Key** ein.
3. Ändern Sie bei Bedarf das **Aktualisierungsintervall** (standardmäßig 60
   Sekunden, mindestens 30): wie oft Zustände und Kameraereignisse gelesen
   werden.
4. Speichern Sie und klicken Sie auf **Verbindung testen**: Die Integration
   meldet sich an und zeigt, wie viele kompatible Geräte sie gefunden hat.
5. Öffnen Sie den Reiter **Erkennung** und fügen Sie die gewünschten Geräte in
   Gladys hinzu.

Nur die hinzugefügten Geräte werden bei jeder Aktualisierung gelesen, das
schont die Wyze-Cloud. **Jetzt synchronisieren** erzwingt eine Aktualisierung.

## Lokale Steuerung

Wyze ist ein Cloud-Dienst, mit einer Ausnahme: Farblampen und LED-Streifen
nehmen Befehle im lokalen Netzwerk an. Wenn **Lokale Verbindung bevorzugen**
aktiv ist (Standard), gehen ihre Befehle direkt an die Lampe; die Zustände
werden weiterhin aus der Cloud gelesen.

Das Abzeichen jedes Geräts zeigt den genutzten Kanal: _lokal_, _Cloud_ oder
_nicht erreichbar_, wenn Wyze das Gerät als offline meldet. Ein orangefarbener
Punkt bedeutet, dass ein lokaler Befehl fehlgeschlagen ist und die Lampe über
die Cloud angesteuert wurde; Gladys versucht es nach 5 Minuten wieder lokal.
Gladys muss die Lampe über TCP-Port 88 erreichen können (gleiches Netzwerk,
keine Client-Isolation im WLAN).

## Kameras

Die Wyze-Cloud bietet kein Live-Video: Das Kamerabild in Gladys ist das
letzte Vorschaubild, das Wyze speichert, meist das des letzten Ereignisses. Es
wird bei jedem neuen Ereignis aktualisiert. Gladys akzeptiert nur Bilder bis
150 KB; ein größeres Vorschaubild wird übersprungen (siehe Logs).

Die Funktion **Bewegung** einer Kamera steht etwa 30 Sekunden lang auf 1, wenn
die Kamera ein Bewegungsereignis aufzeichnet, und dann wieder auf 0. Die
Erkennung hängt von den Kameraeinstellungen in der Wyze-App ab
(Erkennungszonen, Empfindlichkeit, Benachrichtigungen). Die Objekte (Person,
Fahrzeug, Haustier, Paket) erfordern ein Cam-Plus-Abonnement.

## Szenen

Die Integration fügt dem Szeneneditor eigene Karten hinzu (Gladys 5.1 oder
neuer).

Auslöser:

- **Wyze-Kameraereignis** — eine Kamera hat ein Ereignis aufgezeichnet.
  Filtern Sie nach Kamera, Ereignis (Bewegung, Geräusch, Rauchalarm,
  CO-Alarm, Türklingel, Gesicht, andere) und erkanntem Objekt (Person,
  Fahrzeug, Haustier, Paket, nichts). Leere Filter passen auf alles. Die
  folgenden Aktionen können `{{triggerEvent.data.event}}` und
  `{{triggerEvent.data.object}}` lesen.
- **Wyze-Gerät online/offline** — ein Gerät hat die Cloud-Verbindung verloren
  oder wiederhergestellt. Variable: `{{triggerEvent.data.status}}`
  (`offline` / `online`).

Aktionen:

- **Sirene der Wyze-Kamera** — startet oder stoppt die Sirene einer Kamera.
- **Wyze-Bewegungserkennung** — aktiviert oder deaktiviert die
  Bewegungserkennung einer Kamera (zum Beispiel bei scharfer Alarmanlage).
- **Bild der Wyze-Kamera** — veröffentlicht das letzte Bild einer Kamera, um
  es danach mit der Gladys-Aktion „Kamerabild senden“ zu verschicken.
- **Wyze-Geräte aktualisieren** — liest die Geräte sofort; liefert die Anzahl
  der Geräte und der Geräte online.

Eine Kamera, die eine Aktion nicht ausführen kann (Floodlight Pro...), liefert
`false`, statt fehlzuschlagen, damit die folgenden Aktionen davon abhängen
können.

## Dashboard

Im Dashboard-Editor stehen zwei Widgets zur Verfügung:

- **Wyze-Übersicht** — Geräte, online und offline, offene Türen und Fenster,
  Cloud-Status, letzte Aktualisierung, letztes Kameraereignis und eine
  Schaltfläche **Jetzt synchron.**.
- **Wyze-Kamera** — wählen Sie eine Kamera in den Widget-Einstellungen:
  letztes Bild, Live-Bewegung, Verbindung, letztes Ereignis und
  Sirenen-Schaltflächen (die Sirene fragt nach einer Bestätigung).

## Fehlerbehebung

- **„Wyze hat die Anmeldung abgelehnt“** — prüfen Sie E-Mail und Passwort und
  ob API-Key-ID und API-Key zum selben Key gehören. Nach einer Ablehnung
  wartet Gladys 15 Minuten vor dem nächsten Versuch (Wyze sperrt Konten, die
  sich zu oft anmelden); das Speichern der Konfiguration versucht es sofort
  erneut.
- **Ein Gerät aktualisiert sich nicht** — prüfen Sie in der Wyze-App, ob es
  online ist; die Zustände werden in jedem Aktualisierungsintervall gelesen.
- **Eine Farblampe bleibt in der Cloud** — prüfen Sie, ob Gladys die Lampe
  über TCP-Port 88 erreicht, oder deaktivieren Sie **Lokale Verbindung
  bevorzugen**.
- **Logs** — öffnen Sie die Logs der Integration in Gladys (oder
  `docker logs`), mit `LOG_LEVEL=debug` für Details. Passwörter und Tokens
  werden nie protokolliert.

## Datenschutz

Ihre Zugangsdaten speichert Gladys in seiner Konfiguration. Die Wyze-Sitzung
(Zugriffs- und Aktualisierungstoken) liegt im privaten Volume der
Integration, damit ein Neustart keine neue Anmeldung auslöst. Die Integration
spricht nur mit der Wyze-Cloud und mit Ihren Farblampen im lokalen Netzwerk.

Diese Integration ist nicht mit Wyze Labs verbunden. Sie nutzt dieselbe
Cloud-API wie die Wyze-App, die Wyze ohne Vorankündigung ändern kann.
