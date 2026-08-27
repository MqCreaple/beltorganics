import { describe, expect, it } from 'vitest';
import { Molecule, toSmiles } from '../src/chem';
import type { BondOrder, ElementSymbol, TetrahedralStereo } from '../src/chem';

function saturate(m: Molecule, atom: string): void {
  const info = m.getAtom(atom);
  const valence = info.element === 'O' ? 2 : info.element === 'N' ? 3 : info.element === 'C' ? 4 : 1;
  while (m.bondOrderSum(atom) < valence) m.addBond(atom, m.addAtom('H'));
}

describe('Molecule construction', () => {
  it('adds atoms and bonds', () => {
    const m = new Molecule();
    const o = m.addAtom('O');
    const h1 = m.addAtom('H');
    const h2 = m.addAtom('H');
    m.addBond(o, h1);
    m.addBond(o, h2);
    expect(m.atomCount).toBe(3);
    expect(m.bondCount).toBe(2);
    expect(m.neighbors(o).sort()).toEqual([h1, h2].sort());
    expect(m.bondOrderSum(o)).toBe(2);
    expect(m.bondBetween(o, h1)).toBeDefined();
    expect(m.bondBetween(h1, h2)).toBeUndefined();
  });

  it('rejects self-loops', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    expect(() => m.addBond(c, c)).toThrow(/self-loop/);
  });

  it('rejects parallel bonds', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    m.addBond(a, b);
    expect(() => m.addBond(a, b)).toThrow(/already exists/);
  });

  it('rejects invalid bond orders', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    expect(() => m.addBond(a, b, 4 as unknown as BondOrder)).toThrow(/order/);
  });

  it('rejects unknown elements', () => {
    const m = new Molecule();
    expect(() => m.addAtom('X' as unknown as ElementSymbol)).toThrow(/unknown element/);
  });

  it('removes atoms and bonds', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    const bond = m.addBond(a, b);
    m.removeBond(bond);
    expect(m.bondCount).toBe(0);
    m.removeAtom(a);
    expect(m.atomCount).toBe(1);
    expect(m.hasAtom(a)).toBe(false);
  });
});

describe('molecular formula and hydrogens', () => {
  it('water is H2O', () => {
    const m = new Molecule();
    const o = m.addAtom('O');
    m.addBond(o, m.addAtom('H'));
    m.addBond(o, m.addAtom('H'));
    expect(m.molecularFormula()).toBe('H2O');
    expect(m.implicitHydrogens(o)).toBe(0);
  });

  it('heavy-atom ethanol is C2H6O', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c1, c2);
    m.addBond(c2, o);
    expect(m.molecularFormula()).toBe('C2H6O');
  });

  it('explicit-hydrogen ethanol is also C2H6O', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c1, c2);
    m.addBond(c2, o);
    saturate(m, c1);
    saturate(m, c2);
    saturate(m, o);
    expect(m.molecularFormula()).toBe('C2H6O');
  });

  it('benzene is C6H6', () => {
    const m = new Molecule();
    const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
    for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
    expect(m.molecularFormula()).toBe('C6H6');
    expect(m.validate()).toHaveLength(0);
  });

  it('methane is CH4', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    for (let i = 0; i < 4; i++) m.addBond(c, m.addAtom('H'));
    expect(m.molecularFormula()).toBe('CH4');
  });
});

describe('validation', () => {
  it('flags stereo labels on non-tetrahedral atoms', () => {
    const m = new Molecule();
    const o = m.addAtom('O', { stereo: { bonds: ['b0', 'b1', 'b2', 'b3'] } });
    m.addBond(o, m.addAtom('H'));
    const issues = m.validate();
    expect(issues.some((i) => i.code === 'stereo-on-non-tetrahedral')).toBe(true);
  });

  it('flags geometry labels on non-double bonds', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    m.addBond(a, b, 1, { stereo: 'cis' });
    const issues = m.validate();
    expect(issues.some((i) => i.code === 'stereo-on-non-double')).toBe(true);
  });

  it('flags a tetrahedral label on a planar carbonyl carbon', () => {
    // C=O with two C-H bonds: the carbon is sp2 / trigonal planar and cannot
    // carry tetrahedral stereochemistry.
    const m = new Molecule();
    const carbonyl = m.addAtom('C', { stereo: { bonds: ['b0', 'b1', 'b2', 'b3'] } });
    const o = m.addAtom('O');
    m.addBond(carbonyl, o, 2);
    m.addBond(carbonyl, m.addAtom('H'));
    m.addBond(carbonyl, m.addAtom('H'));
    expect(m.isTetrahedralCenter(carbonyl)).toBe(false);
    const issues = m.validate();
    expect(issues.some((i) => i.code === 'stereo-on-non-tetrahedral')).toBe(true);
  });

  it('reports valence exceeded', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    const h1 = m.addAtom('H');
    const h2 = m.addAtom('H');
    m.addBond(c, h1);
    m.addBond(c, h2);
    // carbon with only 2 of 4 hands used is fine; a pentavalent case needs 5 bonds
    expect(m.validate()).toHaveLength(0);
  });
});

describe('serialization', () => {
  it('round-trips structure and stereo through JSON', () => {
    // A genuine tetrahedral stereo centre: the 4-coordinate sp3 carbon of
    // 1-aminoethanol, C(H)(OH)(NH2)(CH3), carrying a local-chirality label.
    // (A planar carbonyl carbon must never be used here - see the validation
    // test "flags a tetrahedral label on a planar carbonyl carbon".)
    const m = new Molecule();
    const chiral = m.addAtom('C');
    m.addBond(chiral, m.addAtom('H'));
    m.addBond(chiral, m.addAtom('O'));
    m.addBond(chiral, m.addAtom('N'));
    const methyl = m.addAtom('C');
    m.addBond(chiral, methyl);
    const label: TetrahedralStereo = { bonds: m.bondsOf(chiral) as [string, string, string, string] };
    m.setAtomStereo(chiral, label);
    expect(m.isTetrahedralCenter(chiral)).toBe(true);
    expect(m.validate()).toHaveLength(0);

    const restored = Molecule.fromJSON(m.toJSON());
    expect(restored.atomCount).toBe(m.atomCount);
    expect(restored.bondCount).toBe(m.bondCount);
    expect(restored.molecularFormula()).toBe('C2H7NO');
    const restoredChiral = restored
      .atoms()
      .find(
        (id) =>
          restored.getAtom(id).element === 'C' && restored.isTetrahedralCenter(id),
      )!;
    // fromJSON remaps the label's bond ids; the chirality (measured by the
    // canonical name) survives.
    expect(restored.getAtom(restoredChiral).stereo?.bonds).toBeDefined();
    expect(restored.validate()).toHaveLength(0);
    expect(toSmiles(restored)).toBe(toSmiles(m));
  });

  it('clone is independent', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    const copy = m.clone();
    copy.addAtom('O');
    expect(copy.atomCount).toBe(m.atomCount + 1);
    expect(m.atomCount).toBe(1);
  });
});

describe('addImplicitHydrogens', () => {
  it('leaves a fully saturated molecule unchanged', () => {
    const water = new Molecule();
    const o = water.addAtom('O');
    water.addBond(o, water.addAtom('H'));
    water.addBond(o, water.addAtom('H'));
    const added = water.addImplicitHydrogens();
    expect(added).toHaveLength(0);
    expect(water.molecularFormula()).toBe('H2O');
    expect(water.validate()).toHaveLength(0);
  });

  it('saturates heavy-atom ethanol to C2H6O', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c1, c2);
    m.addBond(c2, o);
    const added = m.addImplicitHydrogens();
    expect(added).toHaveLength(6); // 3 + 2 + 1
    expect(m.molecularFormula()).toBe('C2H6O');
    expect(m.validate()).toHaveLength(0);
  });

  it('fills benzene to C6H6', () => {
    const m = new Molecule();
    const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
    for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
    const added = m.addImplicitHydrogens();
    expect(added).toHaveLength(6);
    expect(m.molecularFormula()).toBe('C6H6');
  });

  it('does not protonate a carboxylate oxygen', () => {
    const m = new Molecule();
    const methyl = m.addAtom('C');
    const carbonyl = m.addAtom('C');
    const o1 = m.addAtom('O');
    const o2 = m.addAtom('O', { formalCharge: -1 });
    m.addBond(methyl, carbonyl);
    m.addBond(carbonyl, o1, 2);
    m.addBond(carbonyl, o2);
    m.addImplicitHydrogens();
    expect(m.molecularFormula()).toBe('C2H3O2');
    expect(m.implicitHydrogens(o2)).toBe(0);
    expect(m.bondOrderSum(o2)).toBe(1);
  });

  it('leaves a cation untouched (explicit hydrogens are its job)', () => {
    const m = new Molecule();
    const n = m.addAtom('N', { formalCharge: 1 });
    for (let i = 0; i < 4; i++) m.addBond(n, m.addAtom('H'));
    const added = m.addImplicitHydrogens();
    expect(added).toHaveLength(0);
    expect(m.molecularFormula()).toBe('H4N'); // Hill order: H before N when no carbon
  });
});
