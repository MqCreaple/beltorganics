import { describe, expect, it } from 'vitest';
import { Molecule } from '../src/chem';

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

  it('stores, mutates and clears tetrahedral parity', () => {
    const m = new Molecule();
    const c = m.addAtom('C', { stereo: 'plus' });
    m.addBond(c, m.addAtom('H'));
    m.addBond(c, m.addAtom('O'));
    m.addBond(c, m.addAtom('N'));
    m.addBond(c, m.addAtom('C'));
    expect(m.getAtom(c).stereo).toBe('plus');
    expect(m.validate()).toHaveLength(0);

    m.setAtomStereo(c, 'minus');
    expect(m.getAtom(c).stereo).toBe('minus');

    m.setAtomStereo(c, undefined);
    expect(m.getAtom(c).stereo).toBeUndefined();
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
