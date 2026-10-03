export const habitatStorageKey = 'living-wall-space-habitat-v1';

export type SpaceHabitat = {
  id: string;
  name: string;
  anchorValue: string;
  anchorFormat: string;
  boundAt: string;
};

export function loadSpaceHabitat(storage: Storage | undefined): SpaceHabitat | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(habitatStorageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SpaceHabitat>;
    if (!value.anchorValue || !value.name || !value.id) return null;
    return {
      id: value.id,
      name: value.name,
      anchorValue: value.anchorValue,
      anchorFormat: value.anchorFormat ?? 'unknown',
      boundAt: value.boundAt ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveSpaceHabitat(storage: Storage | undefined, habitat: SpaceHabitat) {
  storage?.setItem(habitatStorageKey, JSON.stringify(habitat));
}

export function clearSpaceHabitat(storage: Storage | undefined) {
  storage?.removeItem(habitatStorageKey);
}

