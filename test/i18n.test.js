import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LANGUAGES, MESSAGE_KEYS, join, messages, t } from '../src/i18n.js';

test('every message exists in English, French, German and Spanish', () => {
  for (const key of MESSAGE_KEYS) {
    assert.deepEqual(Object.keys(messages[key]).sort(), [...LANGUAGES].sort(), key);
  }
});

test('placeholders are the same in every language', () => {
  const placeholders = (text) => (text.match(/\{\w+\}/g) ?? []).sort();
  for (const key of MESSAGE_KEYS) {
    const expected = placeholders(messages[key].en);
    for (const lang of LANGUAGES) {
      assert.deepEqual(placeholders(messages[key][lang]), expected, `${key}.${lang}`);
    }
  }
});

test('t substitutes the variables and join combines texts per language', () => {
  const text = t('syncDone', { total: 3, created: 2 });
  assert.equal(text.fr, 'Synchronisé : 3 appareils Wyze, dont 2 ajoutés à Gladys.');
  assert.equal(join([t('event_motion'), ' (', t('object_person'), ')']).de, 'Bewegung (Person)');
  assert.throws(() => t('nope'));
});

test('the user documentation exists in the four languages', async () => {
  for (const lang of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${lang}.md`, import.meta.url), 'utf8');
    // The store indexes a documentation of at least 300 characters.
    assert.ok(doc.length >= 300, `docs/${lang}.md is too short`);
  }
});
