import type { SceneBox } from './scene-tracking';

export type SceneSupport = 'recognized' | 'planned' | 'unknown';
export type SceneRole = 'surface' | 'companion' | 'room-fixture' | 'person' | 'pet' | 'portable' | 'unknown';

export type SceneVocabularyEntry = {
  canonical: string;
  displayName: string;
  aliases: string[];
  role: SceneRole;
  support: SceneSupport;
};

// "recognized" means the current generic model has a matching label. "planned"
// reserves the product vocabulary for the household model without pretending
// that the current model can already detect it.
const entries: SceneVocabularyEntry[] = [
  { canonical: 'bed', displayName: '床', aliases: ['bed'], role: 'surface', support: 'recognized' },
  { canonical: 'sofa', displayName: '沙发', aliases: ['couch', 'sofa'], role: 'surface', support: 'recognized' },
  { canonical: 'chair', displayName: '椅子', aliases: ['chair'], role: 'surface', support: 'recognized' },
  { canonical: 'table', displayName: '桌子', aliases: ['dining table', 'table', 'desk', 'bench'], role: 'surface', support: 'recognized' },
  { canonical: 'television', displayName: '电视', aliases: ['tv', 'television'], role: 'room-fixture', support: 'recognized' },
  { canonical: 'laptop', displayName: '电脑', aliases: ['laptop'], role: 'portable', support: 'recognized' },
  { canonical: 'cat', displayName: '猫', aliases: ['cat'], role: 'pet', support: 'recognized' },
  { canonical: 'dog', displayName: '狗', aliases: ['dog'], role: 'pet', support: 'recognized' },
  { canonical: 'person', displayName: '人', aliases: ['person'], role: 'person', support: 'recognized' },
  { canonical: 'pillow', displayName: '枕头', aliases: ['pillow'], role: 'surface', support: 'planned' },
  { canonical: 'wardrobe', displayName: '衣柜', aliases: ['wardrobe', 'closet'], role: 'room-fixture', support: 'planned' },
  { canonical: 'mirror', displayName: '镜子', aliases: ['mirror'], role: 'room-fixture', support: 'planned' },
  { canonical: 'kitchen', displayName: '厨房', aliases: ['kitchen'], role: 'room-fixture', support: 'planned' },
  { canonical: 'door', displayName: '门', aliases: ['door'], role: 'room-fixture', support: 'planned' },
  { canonical: 'window', displayName: '窗户', aliases: ['window'], role: 'room-fixture', support: 'planned' },
];

const byAlias = new Map(entries.flatMap((entry) => entry.aliases.map((alias) => [alias, entry] as const)));

export function getSceneVocabulary(): readonly SceneVocabularyEntry[] {
  return entries;
}

export function resolveSceneVocabulary(label: string): SceneVocabularyEntry {
  const normalized = label.trim().toLowerCase();
  return byAlias.get(normalized) ?? {
    canonical: normalized,
    displayName: label,
    aliases: [normalized],
    role: 'unknown',
    support: 'unknown',
  };
}

export type SemanticSceneBox = SceneBox & {
  canonicalLabel: string;
  displayName: string;
  role: SceneRole;
  support: SceneSupport;
};

export function enrichSceneBox(box: SceneBox): SemanticSceneBox {
  const vocabulary = resolveSceneVocabulary(box.label);
  return {
    ...box,
    canonicalLabel: vocabulary.canonical,
    displayName: vocabulary.displayName,
    role: vocabulary.role,
    support: vocabulary.support,
  };
}
