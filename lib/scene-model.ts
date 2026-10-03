export type SceneModelKind = 'household' | 'generic';

export type SceneModelDefinition = {
  id: string;
  name: string;
  version: string;
  kind: SceneModelKind;
  path: string;
  available?: boolean;
};

export type SceneModelConfig = {
  models: SceneModelDefinition[];
};

export const genericSceneModel: SceneModelDefinition = {
  id: 'efficientdet-lite0',
  name: '通用物体模型',
  version: 'coco-80',
  kind: 'generic',
  path: '/models/efficientdet_lite0.tflite',
  available: true,
};

export const defaultSceneModelConfig: SceneModelConfig = {
  models: [genericSceneModel],
};

/**
 * Household models are intentionally listed before the generic fallback. A
 * trained model can be enabled by changing the manifest, without touching the
 * camera, tracking, or placement code. Unavailable entries are ignored.
 */
export function selectSceneModels(config: SceneModelConfig): SceneModelDefinition[] {
  const models = config.models.filter((model) => model.available !== false && model.path.trim());
  const deduped = models.filter((model, index) => models.findIndex((candidate) => candidate.id === model.id) === index);
  const fallback = deduped.find((model) => model.kind === 'generic') ?? genericSceneModel;
  return [...deduped.filter((model) => model.kind === 'household'), fallback];
}

export function parseSceneModelConfig(value: unknown): SceneModelConfig {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { models?: unknown }).models)) {
    return defaultSceneModelConfig;
  }
  const models = (value as { models: unknown[] }).models.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const candidate = entry as Partial<SceneModelDefinition>;
    if (typeof candidate.id !== 'string' || typeof candidate.name !== 'string' || typeof candidate.version !== 'string' || typeof candidate.path !== 'string' || (candidate.kind !== 'household' && candidate.kind !== 'generic')) return [];
    return [{ id: candidate.id, name: candidate.name, version: candidate.version, path: candidate.path, kind: candidate.kind, available: candidate.available !== false }];
  });
  return models.length ? { models } : defaultSceneModelConfig;
}

export async function loadSceneModelConfig(fetcher: typeof fetch = fetch): Promise<SceneModelConfig> {
  try {
    const response = await fetcher('/models/scene-model.json', { cache: 'no-store' });
    if (!response.ok) return defaultSceneModelConfig;
    return parseSceneModelConfig(await response.json());
  } catch {
    return defaultSceneModelConfig;
  }
}
