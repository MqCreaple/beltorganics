import { describe, expect, it } from 'vitest';
import { generateMoleculeGeometry, idealBondLength, parseSmiles } from '../src/chem';
import type { AtomId, Molecule, Point3D } from '../src/chem';

function subtract(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Point3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

function signedVolume(a: Point3D, b: Point3D, c: Point3D, d: Point3D): number {
  const first = subtract(b, a);
  const second = subtract(c, a);
  const third = subtract(d, a);
  return dot(first, {
    x: second.y * third.z - second.z * third.y,
    y: second.z * third.x - second.x * third.z,
    z: second.x * third.y - second.y * third.x,
  });
}

function angleDegrees(a: Point3D, center: Point3D, b: Point3D): number {
  const first = subtract(a, center);
  const second = subtract(b, center);
  return (Math.acos(dot(first, second) / (length(first) * length(second))) * 180) / Math.PI;
}

function atomOf(molecule: Molecule, element: 'C' | 'H' | 'O' | 'N'): AtomId {
  return molecule.atoms().find((atom) => molecule.getAtom(atom).element === element)!;
}

describe('topology-derived 3D molecular geometry', () => {
  it('produces one finite coordinate per atom and keeps bonds near their target lengths', () => {
    const molecule = parseSmiles('CC(=O)O');
    const { positions } = generateMoleculeGeometry(molecule);
    expect(positions.size).toBe(molecule.atomCount);
    for (const point of positions.values()) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
      expect(Number.isFinite(point.z)).toBe(true);
    }
    for (const id of molecule.bonds()) {
      const bond = molecule.getBond(id);
      const actual = length(subtract(positions.get(bond.source)!, positions.get(bond.target)!));
      const target = idealBondLength(
        molecule.getAtom(bond.source).element,
        molecule.getAtom(bond.target).element,
        bond.order,
      );
      expect(actual).toBeGreaterThan(target * 0.72);
      expect(actual).toBeLessThan(target * 1.28);
    }
  });

  it('lays out an sp center linearly', () => {
    const molecule = parseSmiles('O=C=O');
    const carbon = atomOf(molecule, 'C');
    const [first, second] = molecule.neighbors(carbon);
    const { positions } = generateMoleculeGeometry(molecule);
    const angle = angleDegrees(positions.get(first!)!, positions.get(carbon)!, positions.get(second!)!);
    expect(angle).toBeGreaterThan(170);
  });

  it('lays out an sp3 center in three dimensions', () => {
    const molecule = parseSmiles('C');
    const carbon = atomOf(molecule, 'C');
    const hydrogens = molecule.neighbors(carbon);
    const { positions } = generateMoleculeGeometry(molecule);
    const volume = signedVolume(
      positions.get(hydrogens[0]!)!,
      positions.get(hydrogens[1]!)!,
      positions.get(hydrogens[2]!)!,
      positions.get(hydrogens[3]!)!,
    );
    expect(Math.abs(volume)).toBeGreaterThan(0.1);
  });

  it('renders opposite tetrahedral labels as opposite handed conformers', () => {
    const volumes = ['N[C@@H](C)C(=O)O', 'N[C@H](C)C(=O)O'].map((smiles) => {
      const molecule = parseSmiles(smiles);
      const center = molecule.atoms().find((atom) => molecule.getAtom(atom).stereo?.bonds !== undefined)!;
      // Compare against the same graph-neighbour ordering. The stereo label's
      // own bond order intentionally has one parity for both enantiomers; it
      // is the spatial arrangement of these fixed neighbours that must flip.
      const neighbors = molecule.neighbors(center).sort((a, b) => a.localeCompare(b));
      const { positions } = generateMoleculeGeometry(molecule);
      return signedVolume(
        positions.get(neighbors[0]!)!,
        positions.get(neighbors[1]!)!,
        positions.get(neighbors[2]!)!,
        positions.get(neighbors[3]!)!,
      );
    });
    expect(Math.sign(volumes[0]!)).toBe(-Math.sign(volumes[1]!));
  });

  it('keeps cis and trans double-bond substituents on the stored sides', () => {
    for (const [smiles, expectedSign] of [
      ['C/C=C\\C', 1],
      ['C/C=C/C', -1],
    ] as const) {
      const molecule = parseSmiles(smiles);
      const doubleBond = molecule.bonds().map((bond) => molecule.getBond(bond)).find((bond) => bond.stereo === (expectedSign > 0 ? 'cis' : 'trans'))!;
      const { source, target } = doubleBond;
      const sourceSubstituent = molecule.neighbors(source).find((atom) => atom !== target && molecule.getAtom(atom).element !== 'H')!;
      const targetSubstituent = molecule.neighbors(target).find((atom) => atom !== source && molecule.getAtom(atom).element !== 'H')!;
      const { positions } = generateMoleculeGeometry(molecule);
      const axis = subtract(positions.get(target)!, positions.get(source)!);
      const axisLengthSquared = dot(axis, axis);
      const side = (center: AtomId, substituent: AtomId) => {
        const raw = subtract(positions.get(substituent)!, positions.get(center)!);
        const projection = {
          x: axis.x * dot(raw, axis) / axisLengthSquared,
          y: axis.y * dot(raw, axis) / axisLengthSquared,
          z: axis.z * dot(raw, axis) / axisLengthSquared,
        };
        return subtract(raw, projection);
      };
      expect(Math.sign(dot(side(source, sourceSubstituent), side(target, targetSubstituent)))).toBe(expectedSign);
    }
  });

  it('is deterministic for repeated renders', () => {
    const molecule = parseSmiles('c1ccccc1O');
    const first = generateMoleculeGeometry(molecule);
    const second = generateMoleculeGeometry(molecule);
    expect([...second.positions]).toEqual([...first.positions]);
  });
});
