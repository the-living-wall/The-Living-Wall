export type CreatureVisibilityInput = {
  active: boolean;
  handOpen: boolean;
  hasHabitat: boolean;
  anchorMatches: boolean;
  hasAnchor: boolean;
  hasSceneTarget: boolean;
};

/**
 * A saved habitat is a strict home boundary: seeing another object must not
 * make Xiaoying appear in the wrong room. Without a saved habitat, the MVP
 * may invite her from a palm, a QR anchor, or a detected surface.
 */
export function shouldShowCreature(input: CreatureVisibilityInput): boolean {
  if (!input.active) return false;
  if (input.hasHabitat) return input.anchorMatches;
  return input.handOpen || input.hasAnchor || input.hasSceneTarget;
}
