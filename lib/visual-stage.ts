import type { GrowthStage } from './creature';

/**
 * Visual expression of each growth stage. These values describe a gradual
 * change in the same life form; they are deliberately separate from the
 * behaviour model so visual tuning does not alter care or trust rules.
 */
export type VisualStageParams = {
  stage: GrowthStage;
  /** Multiplier on the existing maturity-based body size. */
  bodyScale: number;
  /** Multiplier on the body's radial envelope. */
  bodyRadius: number;
  /** Multiplier on the core's radius. */
  coreScale: number;
  /** Number of visible fragments, from the deterministic particle pool. */
  particleLimit: number;
  /** Multiplier on fragment size. */
  fragmentScale: number;
  /** Multiplier on attending scout/feeler reach. */
  scoutScale: number;
  /** Base colour in HSL; saturation remains restrained on the black canvas. */
  hue: number;
  saturation: number;
  hueRange: number;
};

export const VISUAL_STAGE_PARAMS: readonly VisualStageParams[] = [
  {
    stage: 0,
    bodyScale: 0.9,
    bodyRadius: 0.84,
    coreScale: 0.82,
    particleLimit: 150,
    fragmentScale: 0.86,
    scoutScale: 0.55,
    hue: 195,
    saturation: 3,
    hueRange: 12,
  },
  {
    stage: 1,
    bodyScale: 0.95,
    bodyRadius: 0.92,
    coreScale: 0.9,
    particleLimit: 170,
    fragmentScale: 0.92,
    scoutScale: 0.72,
    hue: 169,
    saturation: 22,
    hueRange: 20,
  },
  {
    stage: 2,
    bodyScale: 1,
    bodyRadius: 1,
    coreScale: 1,
    particleLimit: 190,
    fragmentScale: 1,
    scoutScale: 0.9,
    hue: 181,
    saturation: 38,
    hueRange: 28,
  },
  {
    stage: 3,
    bodyScale: 1.06,
    bodyRadius: 1.07,
    coreScale: 1.06,
    particleLimit: 204,
    fragmentScale: 1.04,
    scoutScale: 1.05,
    hue: 199,
    saturation: 50,
    hueRange: 38,
  },
  {
    stage: 4,
    bodyScale: 1.12,
    bodyRadius: 1.13,
    coreScale: 1.1,
    particleLimit: 210,
    fragmentScale: 1.08,
    scoutScale: 1.15,
    hue: 218,
    saturation: 62,
    hueRange: 48,
  },
] as const;

export function getVisualStageParams(stage: GrowthStage): VisualStageParams {
  return VISUAL_STAGE_PARAMS[stage] ?? VISUAL_STAGE_PARAMS[0];
}
