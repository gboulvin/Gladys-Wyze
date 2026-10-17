# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Wyze account connection with the developer API key (no two-factor prompt),
  session kept across restarts and refreshed automatically.
- White bulbs, color bulbs and light strips: on/off, brightness, color
  temperature, and color for the color bulbs and light strips.
- Local control of the color bulbs and light strips when "Prefer the local
  connection" is on, with a fallback to the cloud reported as a degraded
  transport badge.
- Indoor and outdoor plugs: on/off.
- Cameras: latest image, motion, power, siren and motion detection (image and
  motion only for the Floodlight Pro, Battery Cam Pro, Cam OG and Pan v4).
- Wyze Sense contact and motion sensors, with their low battery state.
- Transport badge per device: local, cloud, or unreachable when Wyze reports
  the device offline.
- Scene triggers: "Wyze camera event" (event and recognized object filters)
  and "Wyze device online/offline".
- Scene actions: camera siren, camera motion detection, camera image and
  device refresh.
- Dashboard widgets: "Wyze overview" and "Wyze camera".
- Configuration actions: test the connection, synchronize now.
- English, French, German and Spanish texts and documentation.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/gboulvin/Gladys-Wyze/commits/main
