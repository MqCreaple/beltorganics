import { describe, expect, it } from 'vitest';
import { Molecule, conjugatedPiSystemOf, conjugatedPiSystems, formulaToString } from '../src/chem';
import type { ConjugatedPiSystem } from '../src/chem';

function electronSummary(systems: ConjugatedPiSystem[]): string {
  return systems
    .map((s) => `${s.atoms.length}a/${s.electronCount}e`)
    .sort()
    .join(', ');
}

describe('conjugated π systems', () => {
  it('formaldehyde: one 2-atom, 2-electron system (C=O)', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c, o, 2);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(2);
    expect(systems[0]!.electronCount).toBe(2);
  });

  it('butadiene: one 4-atom, 4-electron system across the central single bond', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addBond(c3, c4, 2);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(4);
    expect(systems[0]!.electronCount).toBe(4);
  });

  it('1,4-pentadiene: two separate 2-electron systems (sp3 spacer breaks conjugation)', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    const c5 = m.addAtom('C');
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addBond(c3, c4);
    m.addBond(c4, c5, 2);
    m.addImplicitHydrogens();
    expect(electronSummary(conjugatedPiSystems(m))).toBe('2a/2e, 2a/2e');
  });

  it('benzene (kekulé): one 6-atom, 6-electron system', () => {
    const m = new Molecule();
    const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
    for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(6);
    expect(systems[0]!.electronCount).toBe(6);
  });

  it('furan: one 5-atom, 6-electron system (O lone pair counts)', () => {
    const m = new Molecule();
    const o = m.addAtom('O');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    const c5 = m.addAtom('C');
    m.addBond(o, c2);
    m.addBond(c2, c3, 2);
    m.addBond(c3, c4);
    m.addBond(c4, c5, 2);
    m.addBond(c5, o);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(5);
    expect(systems[0]!.electronCount).toBe(6);
  });

  it('acetate: one 3-atom, 4-electron system (C=O + O- lone pair)', () => {
    const m = new Molecule();
    const methyl = m.addAtom('C');
    const carbonyl = m.addAtom('C');
    const o1 = m.addAtom('O');
    const o2 = m.addAtom('O', { formalCharge: -1 });
    m.addBond(methyl, carbonyl);
    m.addBond(carbonyl, o1, 2);
    m.addBond(carbonyl, o2);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(3);
    expect(systems[0]!.electronCount).toBe(4);
  });

  it('amide (N-methylacetamide): one 3-atom, 4-electron system (N lone pair counts)', () => {
    const m = new Molecule();
    const methyl = m.addAtom('C');
    const carbonyl = m.addAtom('C');
    const oxy = m.addAtom('O');
    const n = m.addAtom('N');
    const nMe = m.addAtom('C');
    m.addBond(methyl, carbonyl);
    m.addBond(carbonyl, oxy, 2);
    m.addBond(carbonyl, n);
    m.addBond(n, nMe);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(3);
    expect(systems[0]!.electronCount).toBe(4);
  });

  it('allyl cation: 3 atoms, 2 electrons (empty p orbital on C+)', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C', { formalCharge: 1 });
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(3);
    expect(systems[0]!.electronCount).toBe(2);
  });

  it('allyl anion: 3 atoms, 4 electrons (C- lone pair counts)', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C', { formalCharge: -1 });
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addImplicitHydrogens();
    const systems = conjugatedPiSystems(m);
    expect(systems).toHaveLength(1);
    expect(systems[0]!.atoms).toHaveLength(3);
    expect(systems[0]!.electronCount).toBe(4);
  });

  it('ethyne: two separate 2-atom, 2-electron systems (perpendicular π bonds)', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    m.addBond(c1, c2, 3);
    m.addImplicitHydrogens();
    // The two π bonds of a triple bond are mutually perpendicular (sp carbon),
    // so they never conjugate with each other: each stays its own localized
    // 2-electron system.
    expect(electronSummary(conjugatedPiSystems(m))).toBe('2a/2e, 2a/2e');
  });

  it('vinylacetylene HC≡C-CH=CH2: one 4-atom, 4-electron system + one localized 2-atom system', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    m.addBond(c1, c2, 3); // C≡C
    m.addBond(c2, c3); // sp-sp2 single bond carries the conjugation
    m.addBond(c3, c4, 2); // C=C
    m.addImplicitHydrogens();
    expect(formulaToString(m.molecularFormula())).toBe('C4H4');
    // The alkyne contributes only one of its two π bonds to the chain (the
    // one coplanar with the C=C); the other stays localized on the alkyne.
    expect(electronSummary(conjugatedPiSystems(m))).toBe('2a/2e, 4a/4e');
  });

  it('divinylacetylene H2C=CH-C≡C-CH=CH2: both double bonds use the SAME alkyne π bond', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    const c5 = m.addAtom('C');
    const c6 = m.addAtom('C');
    m.addBond(c1, c2, 2); // C=C
    m.addBond(c2, c3); // sp2-sp single bond
    m.addBond(c3, c4, 3); // C≡C
    m.addBond(c4, c5); // sp-sp2 single bond
    m.addBond(c5, c6, 2); // C=C
    m.addImplicitHydrogens();
    expect(formulaToString(m.molecularFormula())).toBe('C6H6');
    // The two π bonds of the triple bond are perpendicular. The game assumes
    // the planar, maximally conjugated conformer, so only one alkyne π bond is
    // "chain-active": both double bonds conjugate with it, giving one extended
    // 6-atom, 6-electron system + one localized 2-atom, 2-electron system.
    // (Real divinylacetylene rotates almost freely; the 90°-twisted conformer
    // — two separate 4-electron systems — is only ~0.5 kcal/mol higher, see
    // docs/research-chemistry.md §8.)
    expect(electronSummary(conjugatedPiSystems(m))).toBe('2a/2e, 6a/6e');
  });

  it('allene H2C=C=CH2: two separate 2-electron systems (perpendicular π bonds)', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3, 2);
    m.addImplicitHydrogens();
    expect(formulaToString(m.molecularFormula())).toBe('C3H4');
    // The two double bonds share a carbon but their π orbitals are mutually
    // perpendicular (allene), so each stays its own 2-electron system.
    expect(electronSummary(conjugatedPiSystems(m))).toBe('2a/2e, 2a/2e');
  });

  it('ethanol: no conjugated π systems', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c1, c2);
    m.addBond(c2, o);
    m.addImplicitHydrogens();
    expect(conjugatedPiSystems(m)).toHaveLength(0);
  });

  it('conjugatedPiSystemOf resolves membership and rejects sp3 atoms', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C'); // sp3 spacer
    const c4 = m.addAtom('C');
    const c5 = m.addAtom('C');
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addBond(c3, c4);
    m.addBond(c4, c5, 2);
    m.addImplicitHydrogens();
    const system = conjugatedPiSystemOf(m, c1)!;
    expect(system.atoms).toContain(c1);
    expect(system.atoms).toContain(c2);
    expect(system.atoms).not.toContain(c3);
    expect(conjugatedPiSystemOf(m, c3)).toBeUndefined();
  });
});
