/** Scalar-field constants shared by all merged π surfaces. */
export const PI_SURFACE_ISOLATION = 50;
export const PI_SURFACE_SUBTRACT = 12;
/** Keep marching-cubes cells no wider than this many ångströms. */
export const PI_SURFACE_MAX_GRID_SPACING = 0.25;
export const PI_SURFACE_MIN_RESOLUTION = 28;
/** Guard against unbounded cubic allocations for user-created macromolecules. */
export const PI_SURFACE_MAX_RESOLUTION = 160;
export const SIGMA_LOBE_AXIAL_SCALE = 1.35;
export const SIGMA_ANTIBONDING_NODE_GAP = 0.12;
export const SIGMA_BONDING_INWARD_SHIFT = 0.15;
export const SIGMA_ANTIBONDING_OUTWARD_SHIFT = 0.12;
export const SIGMA_SURFACE_AXIAL_RATIO = 1.8;

export function sigmaBondingCenterOffset(bondLength: number): number {
  return Math.max(0, bondLength / 2 - Math.min(SIGMA_BONDING_INWARD_SHIFT, bondLength * 0.2));
}

export function sigmaAntibondingCenterOffset(bondLength: number): number {
  return bondLength / 2 + SIGMA_ANTIBONDING_OUTWARD_SHIFT;
}

/** Keep each antibonding lobe on its own side of the nodal gap. */
export function cappedAntibondingSigmaLobeSize(
  requestedSize: number,
  bondLength: number,
): number {
  const availableDiameter = Math.max(0, bondLength - SIGMA_ANTIBONDING_NODE_GAP);
  return Math.min(requestedSize, availableDiameter / (2 * SIGMA_LOBE_AXIAL_SCALE));
}

/** Opposite phases barely meet when each center is one lobe radius away. */
export function piLobeOffset(radius: number): number {
  return radius;
}

/**
 * Full positive support of a Three.js MarchingCubes metaball.
 * This is larger than the requested isosurface radius and must fit inside the
 * field cube or the generated mesh will be cut off at its bounds.
 */
export function metaballSupportRadius(
  radius: number,
  isolation = PI_SURFACE_ISOLATION,
  subtract = PI_SURFACE_SUBTRACT,
): number {
  return radius * Math.sqrt((isolation + subtract) / subtract);
}

/**
 * Choose the cubic field resolution from physical size, rather than assigning
 * every molecule the same number of cells. Long polyenes therefore retain the
 * same surface detail as compact aromatic systems.
 */
export function piSurfaceResolution(
  extent: number,
  maxGridSpacing = PI_SURFACE_MAX_GRID_SPACING,
): number {
  if (!Number.isFinite(extent) || extent <= 0) throw new RangeError('Pi-surface extent must be positive and finite.');
  if (!Number.isFinite(maxGridSpacing) || maxGridSpacing <= 0) {
    throw new RangeError('Pi-surface grid spacing must be positive and finite.');
  }
  return Math.min(
    PI_SURFACE_MAX_RESOLUTION,
    Math.max(PI_SURFACE_MIN_RESOLUTION, Math.ceil(extent / maxGridSpacing)),
  );
}
