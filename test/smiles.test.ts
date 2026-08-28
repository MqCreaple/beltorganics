import { describe, expect, it } from 'vitest';
import { Molecule, formulaToString, getRdkitModule, parseSmiles, toSmiles } from '../src/chem';

// ---------------------------------------------------------------------------
// Small structure helpers (deliberately not atom-identity based)
// ---------------------------------------------------------------------------

function formula(m: Molecule): string {
  return formulaToString(m.molecularFormula());
}

function heavyAtoms(m: Molecule): number {
  return m.atoms().filter((id) => m.getAtom(id).element !== 'H').length;
}

function bondOrders(m: Molecule): number[] {
  return m.bonds().map((id) => m.getBond(id).order).sort((a, b) => a - b);
}

/** Bond orders restricted to heavy-atom pairs (excludes C-H bonds). */
function heavyBondOrders(m: Molecule): number[] {
  return m
    .bonds()
    .filter((id) => {
      const bond = m.getBond(id);
      return m.getAtom(bond.source).element !== 'H' && m.getAtom(bond.target).element !== 'H';
    })
    .map((id) => m.getBond(id).order)
    .sort((a, b) => a - b);
}

function connectedComponents(m: Molecule): number {
  const seen = new Set<string>();
  let count = 0;
  for (const id of m.atoms()) {
    if (seen.has(id)) continue;
    count++;
    seen.add(id);
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of m.neighbors(current)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
  }
  return count;
}

function atomWith(m: Molecule, element: string, charge = 0): string {
  const id = m.atoms().find((a) => m.getAtom(a).element === element && m.getAtom(a).formalCharge === charge);
  if (id === undefined) throw new Error(`no ${element} atom with charge ${charge}`);
  return id;
}

function neighborElements(m: Molecule, atom: string): string[] {
  return m.neighbors(atom).map((n) => m.getAtom(n).element).sort();
}

function hydrogenCount(m: Molecule, atom: string): number {
  return m.neighbors(atom).filter((n) => m.getAtom(n).element === 'H').length;
}

function doubleBondStereo(m: Molecule): string | undefined {
  const id = m.bonds().find((b) => m.getBond(b).order === 2);
  return id === undefined ? undefined : m.getBond(id).stereo;
}


// ---------------------------------------------------------------------------
// parseSmiles
// ---------------------------------------------------------------------------

describe('parseSmiles', () => {
  it('ethanol: formula, connectivity and no validation issues', () => {
    const m = parseSmiles('CCO');
    expect(formula(m)).toBe('C2H6O');
    expect(heavyAtoms(m)).toBe(3);
    expect(neighborElements(m, atomWith(m, 'O'))).toEqual(['C', 'H']);
    expect(m.validate()).toHaveLength(0);
  });

  it('dimethyl ether and ethanol are different structures', () => {
    const ether = parseSmiles('COC');
    expect(formula(ether)).toBe('C2H6O');
    expect(neighborElements(ether, atomWith(ether, 'O'))).toEqual(['C', 'C']);
    // ethanol's oxygen is bonded to C and H instead
    const alcohol = parseSmiles('CCO');
    expect(neighborElements(alcohol, atomWith(alcohol, 'O'))).toEqual(['C', 'H']);
  });

  it('benzene: C6H6, alternating single/double bonds, one H per carbon', () => {
    const m = parseSmiles('c1ccccc1');
    expect(formula(m)).toBe('C6H6');
    expect(heavyBondOrders(m)).toEqual([1, 1, 1, 2, 2, 2]);
    for (const id of m.atoms().filter((a) => m.getAtom(a).element !== 'H')) {
      expect(m.getAtom(id).element).toBe('C');
      expect(hydrogenCount(m, id)).toBe(1);
    }
    expect(m.validate()).toHaveLength(0);
  });

  it('kekule and aromatic benzene produce the same graph', () => {
    const aromatic = parseSmiles('c1ccccc1');
    const kekule = parseSmiles('C1=CC=CC=C1');
    expect(formula(aromatic)).toBe(formula(kekule));
    expect(heavyBondOrders(aromatic)).toEqual(heavyBondOrders(kekule));
    expect(toSmiles(aromatic)).toBe('c1ccccc1');
    expect(toSmiles(kekule)).toBe('c1ccccc1');
  });

  it('cyclohexane: C6H12, all single bonds', () => {
    const m = parseSmiles('C1CCCCC1');
    expect(formula(m)).toBe('C6H12');
    expect(heavyBondOrders(m)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('charges and explicit hydrogens survive ([NH3+]CC(=O)[O-])', () => {
    const m = parseSmiles('[NH3+]CC(=O)[O-]');
    expect(formula(m)).toBe('C2H5NO2');
    expect(hydrogenCount(m, atomWith(m, 'N', 1))).toBe(3);
    expect(hydrogenCount(m, atomWith(m, 'O', -1))).toBe(0);
  });

  it('cis / trans double bonds', () => {
    expect(doubleBondStereo(parseSmiles('C/C=C\\C'))).toBe('cis');
    expect(doubleBondStereo(parseSmiles('C/C=C/C'))).toBe('trans');
  });

  it('the same enantiomer written differently maps to the same canonical name', () => {
    // All five Daylight L-alanine forms (incl. explicit-[H] and centre-first)
    // must canonicalize to one string; all D forms to the other.
    const l = ['N[C@@H](C)C(=O)O', 'N[C@H](C(=O)O)C', 'N[C@@]([H])(C)C(=O)O', '[C@H](N)(C)C(=O)O', '[H][C@](N)(C)C(=O)O'].map(
      (s) => toSmiles(parseSmiles(s)),
    );
    for (const c of l) expect(c).toBe(l[0]);
    expect(l[0]).toBe('C[C@H](N)C(=O)O'); // conventional L-alanine (RDKit canonical)
    const d = ['N[C@H](C)C(=O)O', 'N[C@@H](C(=O)O)C'].map((s) => toSmiles(parseSmiles(s)));
    expect(d[0]).toBe(d[1]);
    expect(d[0]).toBe('C[C@@H](N)C(=O)O'); // conventional D-alanine (RDKit canonical)
    expect(d[0]).not.toBe(l[0]);
  });

  it('hydrogen molecule is two bonded H atoms', () => {
    const m = parseSmiles('[H][H]');
    expect(heavyAtoms(m)).toBe(0);
    expect(m.atoms()).toHaveLength(2);
    expect(m.bonds()).toHaveLength(1);
    expect(formula(m)).toBe('H2');
  });

  it('disconnected components stay disconnected', () => {
    const m = parseSmiles('C.O');
    expect(connectedComponents(m)).toBe(2);
  });

  it('throws on invalid or unsupported input', () => {
    expect(() => parseSmiles('not a smiles')).toThrow();
    expect(() => parseSmiles('F')).toThrow(); // fluorine is not a game element
  });
});

// ---------------------------------------------------------------------------
// toSmiles
// ---------------------------------------------------------------------------

function ethanol(): Molecule {
  const m = new Molecule();
  const c1 = m.addAtom('C');
  const c2 = m.addAtom('C');
  const o = m.addAtom('O');
  m.addBond(c1, c2);
  m.addBond(c2, o);
  return m;
}

function ethanolReversed(): Molecule {
  const m = new Molecule();
  const o = m.addAtom('O');
  const c2 = m.addAtom('C');
  const c1 = m.addAtom('C');
  m.addBond(c1, c2);
  m.addBond(c2, o);
  return m;
}

function cyclohexane(): Molecule {
  const m = new Molecule();
  const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
  for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!);
  return m;
}

function benzene(): Molecule {
  const m = new Molecule();
  const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
  for (let i = 0; i < 6; i++) m.addBond(ring[i]!, ring[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
  return m;
}

function butene(geometry: 'cis' | 'trans'): Molecule {
  const m = new Molecule();
  const c1 = m.addAtom('C');
  const c2 = m.addAtom('C');
  const c3 = m.addAtom('C');
  const c4 = m.addAtom('C');
  m.addBond(c1, c2);
  m.addBond(c2, c3, 2, { stereo: geometry });
  m.addBond(c3, c4);
  return m;
}

function alanine(mirror: boolean): Molecule {
  const m = new Molecule();
  const n = m.addAtom('N');
  const c = m.addAtom('C');
  const methyl = m.addAtom('C');
  const carboxyl = m.addAtom('C');
  const o1 = m.addAtom('O');
  const o2 = m.addAtom('O');
  m.addBond(n, c);
  m.addBond(c, methyl);
  m.addBond(c, carboxyl);
  m.addBond(carboxyl, o1, 2);
  m.addBond(carboxyl, o2);
  // A tetrahedral label references the four incident bonds, so the centre's
  // hydrogen must be explicit before the label can be set.
  m.addImplicitHydrogens();
  const bonds = m.bondsOf(c);
  // The mirror image is an odd permutation of the order (swap two bonds).
  const order = mirror ? [bonds[0], bonds[1], bonds[3], bonds[2]] : [bonds[0], bonds[1], bonds[2], bonds[3]];
  m.setAtomStereo(c, { bonds: order as [string, string, string, string] });
  return m;
}

describe('toSmiles', () => {
  it('is canonical and independent of construction order (ethanol)', () => {
    const a = toSmiles(ethanol());
    const b = toSmiles(ethanolReversed());
    expect(a).toBe(b);
    expect(a).toBe('CCO'); // RDKit's canonical flavour (matches the player docs)
    const back = parseSmiles(a);
    expect(formula(back)).toBe('C2H6O');
    expect(neighborElements(back, atomWith(back, 'O'))).toEqual(['C', 'H']);
  });

  it('cyclohexane and benzene', () => {
    expect(toSmiles(cyclohexane())).toBe('C1CCCCC1');
    expect(toSmiles(benzene())).toBe('c1ccccc1');
  });

  it('cis / trans round-trip and remain distinct', () => {
    const cis = toSmiles(butene('cis'));
    const trans = toSmiles(butene('trans'));
    expect(cis).not.toBe(trans);
    expect(cis).toBe('C/C=C\\C');
    expect(trans).toBe('C/C=C/C');
    expect(doubleBondStereo(parseSmiles(cis))).toBe('cis');
    expect(doubleBondStereo(parseSmiles(trans))).toBe('trans');
  });

  it('enantiomers round-trip to distinct canonical names and keep their chirality', () => {
    const l = toSmiles(alanine(false));
    const d = toSmiles(alanine(true));
    expect(l).not.toBe(d);
    // Round-trip is a fixed point, i.e. the stored chirality survives.
    expect(toSmiles(parseSmiles(l))).toBe(l);
    expect(toSmiles(parseSmiles(d))).toBe(d);
  });

  it('hydrogen molecule', () => {
    const m = new Molecule();
    const h1 = m.addAtom('H');
    const h2 = m.addAtom('H');
    m.addBond(h1, h2);
    expect(toSmiles(m)).toBe('[H][H]');
  });

  it('charged species round-trip', () => {
    const original = parseSmiles('[NH3+]CC(=O)[O-]');
    const roundTripped = parseSmiles(toSmiles(original));
    expect(formula(roundTripped)).toBe('C2H5NO2');
    expect(hydrogenCount(roundTripped, atomWith(roundTripped, 'N', 1))).toBe(3);
    expect(hydrogenCount(roundTripped, atomWith(roundTripped, 'O', -1))).toBe(0);
  });

  it('parse -> toSmiles is stable (canonical form is a fixed point)', () => {
    const inputs = [
      'CCO',
      'COC',
      'CC(=O)O',
      'C1CCCCC1',
      'c1ccccc1',
      'C/C=C\\C',
      'C/C=C/C',
      'N[C@@H](C)C(=O)O',
      '[NH3+]CC(=O)[O-]',
      '[H][H]',
      'C.O',
    ];
    for (const input of inputs) {
      const first = toSmiles(parseSmiles(input));
      const second = toSmiles(parseSmiles(first));
      expect(second).toBe(first);
    }
  });
});

describe('stress: very long molecules', () => {
  it('round-trips a chain of 248 chiral centres (~750 heavy atoms)', () => {
    // An ethyl side group on every non-terminal carbon makes each of them a
    // (constitutionally) chiral centre: left chain, right chain, ethyl, H.
    // (A methyl side group would leave the end-adjacent carbons non-chiral,
    // because their terminal CH3 and the side-group CH3 are identical
    // substituents.)
    //
    // Scale limit (RDKit.js, measured 2026-08-28 with fresh wasm instances):
    // canonical get_smiles overflows the JS stack somewhere in the ~500-800
    // atom range depending on the structure - a linear chain overflows around
    // 550-800 atoms, while this shallow-branching chiral chain still
    // round-trips at 2696 heavy atoms (backbone 900, ~900 centres). The
    // E/Z stress below is the binding constraint. This test uses length 250
    // (~746 heavy atoms, 248 centres) to sit inside the documented limit
    // while exercising performance/correctness at scale (measured ~0.5 s for
    // the full round-trip).
    const length = 250;
    const m = new Molecule();
    const chain: string[] = [];
    for (let i = 0; i < length; i++) chain.push(m.addAtom('C'));
    for (let i = 0; i < length - 1; i++) m.addBond(chain[i]!, chain[i + 1]!);
    for (let i = 1; i < length - 1; i++) {
      const ethyl = m.addAtom('C');
      m.addBond(chain[i]!, ethyl);
      m.addBond(ethyl, m.addAtom('C'));
    }
    m.addImplicitHydrogens();

    // Random chirality per centre: swap two bonds = an odd permutation = the
    // mirror image, under the fixed counterclockwise convention.
    let seed = 123456789;
    const nextBit = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 2 === 0;
    };
    let centres = 0;
    for (let i = 1; i < length - 1; i++) {
      const bonds = m.bondsOf(chain[i]!);
      const order = [bonds[0]!, bonds[1]!, bonds[2]!, bonds[3]!];
      if (nextBit()) [order[1], order[2]] = [order[2]!, order[1]!];
      m.setAtomStereo(chain[i]!, { bonds: order as [string, string, string, string] });
      centres++;
    }
    expect(m.validate()).toHaveLength(0);

    const started = performance.now();
    const smiles = toSmiles(m);
    const back = parseSmiles(smiles);
    // Every centre survives, and the round-trip is a fixed point (i.e. the
    // whole random chirality pattern is preserved).
    expect(back.atoms().filter((id) => back.getAtom(id).stereo?.bonds !== undefined).length).toBe(centres);
    expect(toSmiles(back)).toBe(smiles);
    // Performance guard: the measured round-trip is ~0.5 s; the generous
    // bound catches pathological (e.g. quadratic) regressions, not timing
    // noise.
    expect(performance.now() - started).toBeLessThan(60000);
  }, 120000);

  it('round-trips 180 non-conjugated double bonds (~540 heavy atoms)', () => {
    // C=C-C-C=C-C-C=C-... : double bonds separated by two single bonds, so
    // every double bond is an independent E/Z centre (a conjugated pattern
    // would couple neighbouring geometries).
    //
    // Scale limit (RDKit.js, measured 2026-08-28 with fresh wasm instances):
    // canonical get_smiles overflows the JS stack for this E/Z chain at 559
    // heavy atoms (dbs=186); 550 (dbs=183) still works. dbs=180 (541 heavy
    // atoms) is just under the measured ceiling, so this pushes the
    // round-trip to the edge of the safe range (measured ~0.26 s).
    const dbs = 180;
    const m = new Molecule();
    const count = 3 * dbs + 1;
    const chain: string[] = [];
    for (let i = 0; i < count; i++) chain.push(m.addAtom('C'));
    let seed = 987654321;
    const nextBit = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % 2 === 0;
    };
    let stereogenic = 0;
    for (let i = 0; i < count - 1; i++) {
      if (i % 3 === 0) {
        // Double bond C(3k)=C(3k+1); stereogenic only when both ends have a
        // heavy single-bond substituent (skip the terminal one at i = 0).
        const geometry = i > 0 && i + 2 < count ? (nextBit() ? 'cis' : 'trans') : undefined;
        if (geometry !== undefined) stereogenic++;
        m.addBond(chain[i]!, chain[i + 1]!, 2, geometry !== undefined ? { stereo: geometry } : {});
      } else {
        m.addBond(chain[i]!, chain[i + 1]!);
      }
    }
    m.addImplicitHydrogens();

    const doubleBonds = m.bonds().filter((id) => m.getBond(id).order === 2).length;
    const started = performance.now();
    const smiles = toSmiles(m);
    const back = parseSmiles(smiles);
    // Every double bond survives, every geometry survives (fixed point).
    expect(back.bonds().filter((id) => back.getBond(id).order === 2).length).toBe(doubleBonds);
    expect(
      back.bonds().filter((id) => {
        const b = back.getBond(id);
        return b.order === 2 && (b.stereo === 'cis' || b.stereo === 'trans');
      }).length,
    ).toBe(stereogenic);
    expect(toSmiles(back)).toBe(smiles);
    // Performance guard (measured ~0.26 s; generous bound for robustness).
    expect(performance.now() - started).toBeLessThan(60000);
  }, 120000);
});

// ---------------------------------------------------------------------------
// Ring chiral centres (proline, cholesterol, morphine, ...)
// ---------------------------------------------------------------------------

/**
 * The game's parse -> write round-trip must reproduce RDKit's own canonical
 * SMILES for the same input (same chirality at every centre). Ring chiral
 * centres are the hard case: the writer's neighbour order differs from the
 * input string's, and RDKit's 'cw'/'ccw' JSON sense is not canonical, so the
 * parser orders each centre's neighbours by RDKit's canonical CIP ranks (see
 * src/chem/smiles.ts).
 */
describe('ring chiral centres', () => {
  const RING_CHIRAL_CASES: ReadonlyArray<readonly [string, string]> = [
    ['L-proline', 'C1C[C@H](NC1)C(=O)O'],
    ['D-proline', 'C1C[C@@H](NC1)C(=O)O'],
    [
      'cholesterol',
      'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C',
    ],
    [
      'cholesterol mirror',
      'C[C@@H](CCCC(C)C)[C@@H]1CC[C@H]2[C@]1(CC[C@@H]3[C@@H]2CC=C4[C@]3(CC[C@H](C4)O)C)C',
    ],
    ['morphine', 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O'],
    ['morphine mirror', 'CN1CC[C@@]23[C@H]4[C@@H]1CC5=C2C(=C(C=C5)O)O[C@@H]3[C@@H](C=C4)O'],
    ['2-methyl-THF', 'C[C@H]1CCCCO1'],
    ['2-methyl-THF mirror', 'C[C@@H]1CCCCO1'],
    ['methyl-decalin', 'C[C@H]1CCCC[C@@H]2CCCC[C@H]12'],
    ['methyl-decalin mirror', 'C[C@@H]1CCCC[C@H]2CCCC[C@@H]12'],
  ];

  it('round-trips every ring chiral centre (matches RDKit canonical)', () => {
    const RDKit = getRdkitModule();
    for (const [name, smiles] of RING_CHIRAL_CASES) {
      const direct = RDKit.get_mol(smiles)!.get_smiles();
      expect(toSmiles(parseSmiles(smiles)), name).toBe(direct);
    }
  });

  it('stores explicit labels on ring chiral centres', () => {
    const m = parseSmiles('C1C[C@H](NC1)C(=O)O');
    const labelled = m.atoms().filter((id) => m.getAtom(id).stereo?.bonds !== undefined);
    expect(labelled).toHaveLength(1);
    expect(m.validate()).toHaveLength(0);
  });

  it('keeps enantiomers distinct and round-trip stable', () => {
    for (const [name, smiles] of RING_CHIRAL_CASES) {
      const first = toSmiles(parseSmiles(smiles));
      const second = toSmiles(parseSmiles(first));
      expect(second, name).toBe(first);
    }
    const lPro = toSmiles(parseSmiles('C1C[C@H](NC1)C(=O)O'));
    const dPro = toSmiles(parseSmiles('C1C[C@@H](NC1)C(=O)O'));
    expect(lPro).not.toBe(dPro);
  });
});
