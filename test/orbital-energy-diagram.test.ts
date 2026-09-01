import { describe, expect, it } from 'vitest';
import { parseSmiles, molecularOrbitals } from '../src/chem';
import { groupOrbitalEnergyLevels, orbitalLabel } from '../src/game/ui/orbital-energy-diagram';

describe('orbital energy diagram', () => {
  it('groups degenerate benzene pi orbitals at shared levels', () => {
    const pi = molecularOrbitals(parseSmiles('c1ccccc1')).orbitals.filter((orbital) => orbital.kind === 'pi');
    const levels = groupOrbitalEnergyLevels(pi);
    expect(levels.map((level) => level.orbitals.length)).toEqual([1, 2, 2, 1]);
  });

  it('keeps sigma, pi and lone-pair modes in the complete diagram', () => {
    const orbitals = molecularOrbitals(parseSmiles('C=O')).orbitals;
    expect(new Set(orbitals.map((orbital) => orbital.kind))).toEqual(new Set(['sigma', 'pi', 'lone-pair']));
    expect(orbitals.every((orbital) => Number.isFinite(orbital.energyEv))).toBe(true);
    expect(orbitalLabel(orbitals.find((orbital) => orbital.kind === 'sigma')!)).toMatch(/^σ/);
  });
});
