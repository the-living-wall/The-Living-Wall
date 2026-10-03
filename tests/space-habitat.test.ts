import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSpaceHabitat, habitatStorageKey, loadSpaceHabitat, saveSpaceHabitat, type SpaceHabitat } from '../lib/space-habitat.ts';

const store = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } as unknown as Storage;
};

void test('space habitat persists and restores a verified anchor', () => {
  const storage = store();
  const habitat: SpaceHabitat = { id: 'one', name: '床头', anchorValue: 'bedside-anchor', anchorFormat: 'qr_code', boundAt: '2026-10-03T00:00:00.000Z' };
  saveSpaceHabitat(storage, habitat);
  assert.deepEqual(loadSpaceHabitat(storage), habitat);
  assert.match(storage.getItem(habitatStorageKey) ?? '', /bedside-anchor/);
});

void test('invalid or cleared habitat is unavailable', () => {
  const storage = store();
  storage.setItem(habitatStorageKey, '{"name":"床头"}');
  assert.equal(loadSpaceHabitat(storage), null);
  clearSpaceHabitat(storage);
  assert.equal(loadSpaceHabitat(storage), null);
});
