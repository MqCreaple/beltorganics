import { describe, expect, it } from 'vitest';
import { Molecule, formulaToString, hybridizationOf, hybridizations } from '../src/chem';

describe('hybridization: cases that align with VSEPR', () => {
  it('methane: sp3 carbon', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    for (let i = 0; i < 4; i++) m.addBond(c, m.addAtom('H'));
    m.addImplicitHydrogens();
    expect(hybridizationOf(m, c)).toBe('sp3');
  });

  it('ethene: sp2 carbons', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    m.addBond(a, b, 2);
    m.addImplicitHydrogens();
    expect(hybridizationOf(m, a)).toBe('sp2');
    expect(hybridizationOf(m, b)).toBe('sp2');
  });

  it('ethyne: sp carbons', () => {
    const m = new Molecule();
    const a = m.addAtom('C');
    const b = m.addAtom('C');
    m.addBond(a, b, 3);
    m.addImplicitHydrogens();
    expect(hybridizationOf(m, a)).toBe('sp');
    expect(hybridizationOf(m, b)).toBe('sp');
  });

  it('water: sp3 oxygen', () => {
    const m = new Molecule();
    const o = m.addAtom('O');
    m.addBond(o, m.addAtom('H'));
    m.addBond(o, m.addAtom('H'));
    expect(hybridizationOf(m, o)).toBe('sp3');
  });

  it('ammonia: sp3 nitrogen', () => {
    const m = new Molecule();
    const n = m.addAtom('N');
    for (let i = 0; i < 3; i++) m.addBond(n, m.addAtom('H'));
    expect(hybridizationOf(m, n)).toBe('sp3');
  });

  it('ammonium: sp3 nitrogen despite four bonds', () => {
    const m = new Molecule();
    const n = m.addAtom('N', { formalCharge: 1 });
    for (let i = 0; i < 4; i++) m.addBond(n, m.addAtom('H'));
    expect(hybridizationOf(m, n)).toBe('sp3');
  });

  it('does not hybridize an isolated iodide ion', () => {
    const m = new Molecule();
    const iodide = m.addAtom('I', { formalCharge: -1 });
    expect(hybridizationOf(m, iodide)).toBeUndefined();
    expect(hybridizations(m).has(iodide)).toBe(false);
  });

  it('methyl anion (simple carbanion): sp3, pyramidal', () => {
    // VSEPR: 3 sigma bonds + 1 lone pair = 4 domains => sp3. CH3- is
    // pyramidal (lone pair in an sp3 orbital); carbanions are sp2 only under
    // the same conjugated-lone-pair criterion as N/O, see the allyl anion
    // test in the VSEPR-defying block.
    const m = new Molecule();
    const c = m.addAtom('C', { formalCharge: -1 });
    for (let i = 0; i < 3; i++) m.addBond(c, m.addAtom('H'));
    expect(hybridizationOf(m, c)).toBe('sp3');
    expect(m.validate()).toHaveLength(0);
  });

  it('methanol: sp3 carbon and sp3 oxygen', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c, o);
    m.addImplicitHydrogens();
    expect(hybridizationOf(m, c)).toBe('sp3');
    expect(hybridizationOf(m, o)).toBe('sp3');
  });

  it('carbon dioxide: sp carbon, sp2 oxygens', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    m.addBond(c, m.addAtom('O'), 2);
    m.addBond(c, m.addAtom('O'), 2);
    expect(hybridizationOf(m, c)).toBe('sp');
    for (const o of m.atoms().filter((id) => m.getAtom(id).element === 'O')) {
      expect(hybridizationOf(m, o)).toBe('sp2');
    }
  });

  it('benzene (kekulé): all sp2 carbons', () => {
    const m = new Molecule();
    const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
    for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
    m.addImplicitHydrogens();
    for (const c of ring) expect(hybridizationOf(m, c)).toBe('sp2');
    expect(formulaToString(m.molecularFormula())).toBe('C6H6');
  });
});

describe('hybridization: cases that defy VSEPR (conjugated lone pairs)', () => {
  it('amide nitrogen (peptide bond) is sp2, not sp3', () => {
    // N-methylacetamide: CH3-C(=O)-NH-CH3
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
    // VSEPR (3 sigma bonds + 1 lone pair) would say sp3...
    expect(hybridizationOf(m, n)).toBe('sp2');
    // ...but the rest of the molecule is as expected.
    expect(hybridizationOf(m, carbonyl)).toBe('sp2');
    expect(hybridizationOf(m, oxy)).toBe('sp2');
    expect(hybridizationOf(m, methyl)).toBe('sp3');
    expect(formulaToString(m.molecularFormula())).toBe('C3H7NO');
  });

  it('furan oxygen is sp2, not sp3', () => {
    // Furan: five-membered ring O-C=C-C=C, two double bonds (kekulé form).
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
    // VSEPR (2 sigma bonds + 2 lone pairs) would say sp3...
    expect(hybridizationOf(m, o)).toBe('sp2');
    for (const c of [c2, c3, c4, c5]) expect(hybridizationOf(m, c)).toBe('sp2');
    expect(formulaToString(m.molecularFormula())).toBe('C4H4O');
  });

  it('carboxylate anion: both oxygens are sp2', () => {
    // Acetate: CH3-C(=O)(O-), drawn as one C=O double bond and one C-O single
    // bond (no resonance handling yet).
    const m = new Molecule();
    const methyl = m.addAtom('C');
    const carbonyl = m.addAtom('C');
    const oxyDouble = m.addAtom('O');
    const oxySingle = m.addAtom('O', { formalCharge: -1 });
    m.addBond(methyl, carbonyl);
    m.addBond(carbonyl, oxyDouble, 2);
    m.addBond(carbonyl, oxySingle);
    m.addImplicitHydrogens();
    // The C=O oxygen is sp2 by the double-bond rule; the C-O- oxygen is sp2
    // because its lone pair is conjugated into the neighbouring carbonyl
    // (VSEPR would call it sp3).
    expect(hybridizationOf(m, oxyDouble)).toBe('sp2');
    expect(hybridizationOf(m, oxySingle)).toBe('sp2');
    expect(hybridizationOf(m, carbonyl)).toBe('sp2');
    expect(formulaToString(m.molecularFormula())).toBe('C2H3O2');
    // addImplicitHydrogens must not have protonated the anionic oxygen.
    expect(m.bondOrderSum(oxySingle)).toBe(1);
    expect(m.implicitHydrogens(oxySingle)).toBe(0);
  });

  it('carbocation (methyl cation) is sp2, not sp3', () => {
    // CH3+: three sigma bonds but an empty p orbital => trigonal planar sp2.
    const m = new Molecule();
    const c = m.addAtom('C', { formalCharge: 1 });
    for (let i = 0; i < 3; i++) m.addBond(c, m.addAtom('H'));
    expect(hybridizationOf(m, c)).toBe('sp2');
    expect(m.validate()).toHaveLength(0);
  });

  it('conjugated carbanion (allyl anion) is sp2, not sp3', () => {
    // CH2=CH-CH2-: the terminal CH2- has a lone pair, and it is sp2 under the
    // same criterion as N/O - the lone pair sits next to the C=C pi system
    // (VSEPR alone would say sp3).
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C', { formalCharge: -1 });
    m.addBond(c1, c2, 2);
    m.addBond(c2, c3);
    m.addImplicitHydrogens();
    expect(hybridizationOf(m, c1)).toBe('sp2');
    expect(hybridizationOf(m, c2)).toBe('sp2');
    expect(hybridizationOf(m, c3)).toBe('sp2');
    expect(formulaToString(m.molecularFormula())).toBe('C3H5');
  });

  it('hybridizations() covers every bonded non-hydrogen atom', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    const o = m.addAtom('O');
    m.addBond(c, o, 2);
    m.addImplicitHydrogens();
    const map = hybridizations(m);
    expect(map.size).toBe(2); // only C and O; hydrogens are excluded
    expect([...map.values()].sort()).toEqual(['sp2', 'sp2']);
  });
});
