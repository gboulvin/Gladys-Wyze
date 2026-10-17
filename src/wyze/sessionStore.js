// -----------------------------------------------------------------------------
// Wyze session storage.
//
// The container rootfs is read-only: the session lives in /data, the one
// writable volume (WYZE_DATA_DIR overrides it, for local runs). The file holds
// the access and refresh tokens: it is written with owner-only permissions and
// never logged.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SESSION_FILE = 'wyze-session.json';

export function createFileStore(dir = process.env.WYZE_DATA_DIR ?? '/data') {
  const file = join(dir, SESSION_FILE);
  return {
    read() {
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }
        throw err;
      }
    },
    write(session) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(session), { mode: 0o600 });
    },
  };
}

// In-memory store (tests, or when /data is not writable).
export function createMemoryStore(initial = null) {
  let session = initial;
  return {
    read: () => session,
    write: (value) => {
      session = value;
    },
  };
}
