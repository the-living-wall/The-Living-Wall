import { Creature } from './creature.ts';

export const normalArchiveKey = 'fragment-growth-v1';
export const depthArchiveKey = 'fragment-growth-depth-experiment-v1';
type ArchiveStore = Pick<Storage, 'getItem' | 'setItem'>;

export function saveCreatureArchive(
  store: ArchiveStore,
  key: string,
  creature: Creature,
) {
  store.setItem(key, JSON.stringify(creature.archive()));
}

export function switchCreatureArchive(
  store: ArchiveStore,
  creature: Creature,
  from: string,
  to: string,
) {
  saveCreatureArchive(store, from, creature);
  const next = new Creature();
  const saved = store.getItem(to);
  if (saved) next.restore(JSON.parse(saved));
  return next;
}
