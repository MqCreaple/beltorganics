/** Scalar-field constants shared by all merged π surfaces. */
export const PI_SURFACE_ISOLATION = 50;
export const PI_SURFACE_SUBTRACT = 12;

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
