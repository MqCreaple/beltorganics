import { describe, expect, it } from 'vitest';
import {
  PI_SURFACE_ISOLATION,
  PI_SURFACE_SUBTRACT,
  metaballSupportRadius,
  piLobeOffset,
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
});
