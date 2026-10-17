# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Wyze** external integration for Gladys Assistant: a Node.js service
(Node 22+, ESM, no build step) that runs in its own sandboxed Docker container
and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js).

It drives Wyze devices through the Wyze cloud API (the one the Wyze app uses,
with the official developer API key for the login), plus the LAN channel of
the color bulbs and light strips.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/hub.test.js              # one file
node --test --test-name-pattern "siren"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/hub.js                   WyzeHub: sync cycle (device list, events, states,
                             online/offline, transports), commands, images
src/wyze/client.js           Wyze cloud client: login, token refresh, app API calls
src/wyze/constants.js        app identification, property ids, models, event codes
src/wyze/localBulb.js        LAN commands of color bulbs / light strips (AES)
src/wyze/sessionStore.js     session file in /data
src/devices/index.js         registry: Wyze product_type -> blueprint
src/devices/<family>.js      light, plug, camera, sensors: buildDevice, readStates, setValue
src/devices/convert.js       Wyze <-> Gladys value conversions (mired, RGB...)
src/events.js                camera events -> `camera_event` trigger vocabulary
src/scenes.js                scene action handlers (manifest `scene_actions`)
src/widgets.js               dashboard widgets (manifest `widgets`)
src/actions.js               Configuration screen buttons (manifest `actions`)
src/i18n.js                  user-facing texts of the code, en/fr/de/es
src/config.js                DEFAULT_CONFIG (mirrors the manifest) + normalization
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys
test/                        node --test, against the SDK's fake Gladys and a fake Wyze client
```

## Rules

- **External ids are forever.** `gladys.externalIds(type, mac)`: the type
  namespaces (`light`, `plug`, `camera`, `contact-sensor`, `motion-sensor`),
  the feature keys, the manifest `config_schema` / `actions` / scene / widget
  keys and the trigger option values (`motion`, `person`...) are stored by
  users. Never rename one.
- **Never hammer the Wyze cloud.** One device list per cycle, one property
  call per CREATED device, one event list when a camera is created. Wyze locks
  accounts that log in too often: keep the saved session and the login
  back-off in `src/wyze/client.js`.
- **The container rootfs is read-only.** Write only under `/data`. Never log
  passwords, API keys, tokens or the session file.
- **Gladys conventions.** Opening sensors are 1 closed / 0 open (Wyze says
  the opposite); light temperatures are mireds; colors are RGB integers.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or the manifest, nor the `docker_image` tag, by
  hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md`. Never write a version heading.
- **Four languages.** Every manifest text is `{ en, fr, de, es }` (checked by
  `test/manifest.test.js`); the code's texts live in `src/i18n.js` (checked by
  `test/i18n.test.js`); `docs/en.md`, `fr.md`, `de.md`, `es.md` stay in sync.
- **Manifest and code move together.** `test/manifest.test.js` ties actions,
  scene triggers, scene actions, widgets and config defaults to the code.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.
