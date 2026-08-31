import { describe, expect, it } from 'vitest';
import {
  conjugatedPiSystems,
  generateMoleculeGeometry,
  parseSmiles,
  piSystemNormals,
} from '../src/chem';
import { DEMO_SOURCES } from '../src/demo-sources';
import {
  PI_SURFACE_ISOLATION,
  PI_SURFACE_MAX_GRID_SPACING,
  PI_SURFACE_MIN_RESOLUTION,
  PI_SURFACE_SUBTRACT,
  metaballSupportRadius,
  piLobeOffset,
  piSurfaceResolution,
} from '../src/game/ui/pi-surface-math';

describe('merged pi surface geometry', () => {
  it('separates opposite lobe centers by one diameter', () => {
    const radius = 0.58;
    expect(piLobeOffset(radius) * 2).toBeCloseTo(radius * 2);
  });

  it('bounds the complete metaball support rather than only the isosurface', () => {
    const radius = 0.58;
    const support = metaballSupportRadius(radius);
    expect(support).toBeCloseTo(radius * Math.sqrt(
      (PI_SURFACE_ISOLATION + PI_SURFACE_SUBTRACT) / PI_SURFACE_SUBTRACT,
    ));
    expect(support).toBeGreaterThan(radius * 2.2);
  });

  it('keeps a fixed physical grid spacing as a pi system becomes long', () => {
    expect(piSurfaceResolution(4)).toBe(PI_SURFACE_MIN_RESOLUTION);
    const betaCaroteneScaleExtent = 30;
    const resolution = piSurfaceResolution(betaCaroteneScaleExtent);
    expect(resolution).toBeGreaterThan(PI_SURFACE_MIN_RESOLUTION);
    expect(betaCaroteneScaleExtent / resolution).toBeLessThanOrEqual(PI_SURFACE_MAX_GRID_SPACING);
  });

  it('raises the field resolution for the beta-carotene pi chain', () => {
    const source = DEMO_SOURCES.at(-1)![2];
    const molecule = parseSmiles(source);
    const geometry = generateMoleculeGeometry(molecule);
    const systems = conjugatedPiSystems(molecule);
    const systemIndex = systems.reduce(
      (largest, system, index) => system.atoms.length > systems[largest]!.atoms.length ? index : largest,
      0,
    );
    const system = systems[systemIndex]!;
    const normal = piSystemNormals(molecule, systems, geometry.positions)[systemIndex]!;
    const offset = piLobeOffset(0.58);
    const coordinates = system.atoms.map((atom) => {
      const point = geometry.positions.get(atom)!;
      return {
        x: point.x + normal.x * offset,
        y: point.y + normal.y * offset,
        z: point.z + normal.z * offset,
      };
    });
    const supportPadding = metaballSupportRadius(0.58) * 1.05 * 2;
    const extent = Math.max(
      1.8,
      ...(['x', 'y', 'z'] as const).map((axis) => (
        Math.max(...coordinates.map((point) => point[axis]))
        - Math.min(...coordinates.map((point) => point[axis]))
        + supportPadding
      )),
    );
    const resolution = piSurfaceResolution(extent);
    expect(system.atoms.length).toBeGreaterThan(15);
    expect(resolution).toBeGreaterThan(PI_SURFACE_MIN_RESOLUTION);
    expect(extent / resolution).toBeLessThanOrEqual(PI_SURFACE_MAX_GRID_SPACING);
  });

  it('rejects invalid physical extents and grid spacing', () => {
    expect(() => piSurfaceResolution(0)).toThrow(RangeError);
    expect(() => piSurfaceResolution(5, Number.NaN)).toThrow(RangeError);
  });
});
