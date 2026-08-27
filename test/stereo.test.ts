import { describe, expect, it } from 'vitest';
import { Molecule } from '../src/chem';
import type { TetrahedralStereo } from '../src/chem';

describe('tetrahedral stereo centres', () => {
  it('detects a 4-coordinate sp3 carbon', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    for (let i = 0; i < 4; i++) m.addBond(c, m.addAtom('H'));
    expect(m.isTetrahedralCenter(c)).toBe(true);
  });

  it('does not flag oxygen or sp2 carbons', () => {
    const water = new Molecule();
    const o = water.addAtom('O');
    water.addBond(o, water.addAtom('H'));
    water.addBond(o, water.addAtom('H'));
    expect(water.isTetrahedralCenter(o)).toBe(false);

    const alkene = new Molecule();
    const c1 = alkene.addAtom('C');
    const c2 = alkene.addAtom('C');
    alkene.addBond(c1, c2, 2);
    alkene.addBond(c1, alkene.addAtom('H'));
    alkene.addBond(c1, alkene.addAtom('H'));
    expect(alkene.isTetrahedralCenter(c1)).toBe(false);
  });

  it('stores, mutates and clears tetrahedral stereo labels', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    m.addBond(c, m.addAtom('H'));
    m.addBond(c, m.addAtom('O'));
    m.addBond(c, m.addAtom('N'));
    m.addBond(c, m.addAtom('C'));
    const label: TetrahedralStereo = { bonds: m.bondsOf(c) as [string, string, string, string] };
    m.setAtomStereo(c, label);
    expect(m.getAtom(c).stereo).toEqual(label);
    expect(m.validate()).toHaveLength(0);

    // The mirror image is an odd permutation of the order (swap two bonds).
    const [b0, b1, b2, b3] = m.bondsOf(c);
    m.setAtomStereo(c, { bonds: [b0!, b1!, b3!, b2!] });
    expect(m.validate()).toHaveLength(0);

    m.setAtomStereo(c, undefined);
    expect(m.getAtom(c).stereo).toBeUndefined();
  });

  it('accepts an unspecified label (no bonds) on a valid centre and rejects it elsewhere', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    m.addBond(c, m.addAtom('H'));
    m.addBond(c, m.addAtom('O'));
    m.addBond(c, m.addAtom('N'));
    m.addBond(c, m.addAtom('C'));
    m.setAtomStereo(c, {});
    expect(m.validate()).toHaveLength(0);

    const o = m.addAtom('O', { stereo: {} });
    expect(m.validate().some((i) => i.code === 'stereo-on-non-tetrahedral')).toBe(true);
    void o;
  });

  it('flags a tetrahedral label that does not match the incident bonds', () => {
    const m = new Molecule();
    const c = m.addAtom('C');
    m.addBond(c, m.addAtom('H'));
    m.addBond(c, m.addAtom('O'));
    m.addBond(c, m.addAtom('N'));
    m.addBond(c, m.addAtom('C'));
    m.setAtomStereo(c, { bonds: ['zz0', 'zz1', 'zz2', 'zz3'] });
    const issues = m.validate();
    expect(issues.some((i) => i.code === 'stereo-bonds-mismatch')).toBe(true);
  });
});

describe('double-bond geometry', () => {
  it('stores and mutates cis/trans labels on a double bond', () => {
    const m = new Molecule();
    const c1 = m.addAtom('C');
    const c2 = m.addAtom('C');
    const c3 = m.addAtom('C');
    const c4 = m.addAtom('C');
    m.addBond(c1, c2, 1);
    const db = m.addBond(c2, c3, 2, { stereo: 'trans' });
    m.addBond(c3, c4, 1);
    expect(m.getBond(db).stereo).toBe('trans');
    expect(m.validate()).toHaveLength(0);

    m.setBondStereo(db, 'cis');
    expect(m.getBond(db).stereo).toBe('cis');
  });
});
