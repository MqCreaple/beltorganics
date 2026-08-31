import { describe, expect, it } from 'vitest';
import {
  conjugatedPiSystems,
  displayedLonePairCount,
  generateMoleculeGeometry,
  geometryIssues,
  hybridizationOf,
  idealBondLength,
  lonePairDirections,
  parseSmiles,
  piSystemNormal,
  piSystemNormals,
  resonanceAdjustedBondLengths,
} from '../src/chem';
import { DEMO_SOURCES } from '../src/demo-sources';
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
      const center = molecule.atoms().find((atom) => molecule.getAtom(atom).stereo !== undefined)!;
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
      const doubleBond = molecule.bonds().map((bond) => molecule.getBond(bond)).find((bond) => bond.order === 2 && bond.stereo !== undefined)!;
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

  it('makes benzene a regular hexagon with resonance-equalized C-C bonds', () => {
    const molecule = parseSmiles('c1ccccc1');
    const positions = generateMoleculeGeometry(molecule).positions;
    const carbons = molecule.atoms().filter((atom) => molecule.getAtom(atom).element === 'C');
    const lengths = molecule.bonds()
      .map((bond) => molecule.getBond(bond))
      .filter(({ source, target }) => carbons.includes(source) && carbons.includes(target))
      .map(({ source, target }) => length(subtract(positions.get(source)!, positions.get(target)!)));
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.03);
    expect(lengths[0]).toBeCloseTo((1.54 + 1.34) / 2, 1);
    for (const carbon of carbons) {
      const carbonNeighbors = molecule.neighbors(carbon).filter((atom) => molecule.getAtom(atom).element === 'C');
      expect(angleDegrees(positions.get(carbonNeighbors[0]!)!, positions.get(carbon)!, positions.get(carbonNeighbors[1]!)!)).toBeCloseTo(120, 0);
    }
  });

  it('recognizes the substituted benzene ring embedded in morphine', () => {
    const molecule = parseSmiles('CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O');
    const adjusted = resonanceAdjustedBondLengths(molecule);
    const aromaticCarbonBonds = [...adjusted].filter(([bondId, target]) => {
      const bond = molecule.getBond(bondId);
      return molecule.getAtom(bond.source).element === 'C'
        && molecule.getAtom(bond.target).element === 'C'
        && Math.abs(target - (1.54 + 1.34) / 2) < 1e-9;
    });
    expect(aromaticCarbonBonds).toHaveLength(6);

    const positions = generateMoleculeGeometry(molecule).positions;
    const lengths = aromaticCarbonBonds.map(([bondId]) => {
      const { source, target } = molecule.getBond(bondId);
      return length(subtract(positions.get(source)!, positions.get(target)!));
    });
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.05);
  });

  it('orients cholesterol pi lobes perpendicular to the local alkene plane', () => {
    const molecule = parseSmiles('C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C');
    const geometry = generateMoleculeGeometry(molecule);
    const system = conjugatedPiSystems(molecule).find((candidate) => candidate.atoms.length === 2)!;
    const [first, second] = system.atoms;
    const substituent = molecule.neighbors(first!).find((atom) => atom !== second)!;
    const axis = subtract(geometry.positions.get(second!)!, geometry.positions.get(first!)!);
    const side = subtract(geometry.positions.get(substituent)!, geometry.positions.get(first!)!);
    const normal = piSystemNormal(molecule, system.atoms, geometry.positions);
    expect(Math.abs(dot(normal, axis) / length(axis))).toBeLessThan(1e-6);
    expect(Math.abs(dot(normal, side) / length(side))).toBeLessThan(1e-6);
  });

  it.each(['C#C', 'C=CC#CC=C'])('keeps the two triple-bond pi systems orthogonal in %s', (smiles) => {
    const molecule = parseSmiles(smiles);
    const geometry = generateMoleculeGeometry(molecule);
    const systems = conjugatedPiSystems(molecule);
    const triple = molecule.bonds().map((bond) => molecule.getBond(bond)).find((bond) => bond.order === 3)!;
    const sharing = systems.map((system, index) => ({ system, index })).filter(({ system }) =>
      system.atoms.includes(triple.source) && system.atoms.includes(triple.target));
    expect(sharing).toHaveLength(2);
    const normals = piSystemNormals(molecule, systems, geometry.positions);
    expect(Math.abs(dot(normals[sharing[0]!.index]!, normals[sharing[1]!.index]!))).toBeLessThan(1e-6);
  });

  it('keeps acetic acid C-O bonds distinct but equalizes acetate', () => {
    const oxygenBondLengths = (smiles: string): number[] => {
      const molecule = parseSmiles(smiles);
      const positions = generateMoleculeGeometry(molecule).positions;
      const carbon = molecule.atoms().find((atom) => molecule.getAtom(atom).element === 'C'
        && molecule.neighbors(atom).filter((neighbor) => molecule.getAtom(neighbor).element === 'O').length === 2)!;
      return molecule.neighbors(carbon)
        .filter((atom) => molecule.getAtom(atom).element === 'O')
        .map((oxygen) => length(subtract(positions.get(carbon)!, positions.get(oxygen)!)));
    };
    const acid = oxygenBondLengths('CC(=O)O');
    const acetate = oxygenBondLengths('CC(=O)[O-]');
    expect(Math.abs(acid[0]! - acid[1]!)).toBeGreaterThan(0.12);
    expect(Math.abs(acetate[0]! - acetate[1]!)).toBeLessThan(0.03);
  });

  it('places water bonds and localized lone pairs as four tetrahedral electron domains', () => {
    const molecule = parseSmiles('O');
    const oxygen = atomOf(molecule, 'O');
    const geometry = generateMoleculeGeometry(molecule);
    const bondDirections = molecule.neighbors(oxygen).map((hydrogen) => subtract(geometry.positions.get(hydrogen)!, geometry.positions.get(oxygen)!));
    const pairs = lonePairDirections(molecule, oxygen, geometry.positions);
    expect(displayedLonePairCount(molecule, oxygen)).toBe(2);
    expect(pairs).toHaveLength(2);
    const domains = [...bondDirections, ...pairs];
    for (let first = 0; first < domains.length; first += 1) for (let second = first + 1; second < domains.length; second += 1) {
      const angle = Math.acos(dot(domains[first]!, domains[second]!) / (length(domains[first]!) * length(domains[second]!))) * 180 / Math.PI;
      expect(angle).toBeGreaterThan(100);
      expect(angle).toBeLessThan(116);
    }
    expect(Math.abs(signedVolume({ x: 0, y: 0, z: 0 }, ...domains.slice(0, 3) as [Point3D, Point3D, Point3D]))).toBeGreaterThan(0.1);
  });

  it('moves a donor lone pair into the pi system but retains double-bonded O lone pairs', () => {
    const formamide = parseSmiles('C(=O)N');
    const amideNitrogen = formamide.atoms().find((atom) => formamide.getAtom(atom).element === 'N')!;
    expect(displayedLonePairCount(formamide, amideNitrogen)).toBe(0);

    const formaldehyde = parseSmiles('C=O');
    const oxygen = atomOf(formaldehyde, 'O');
    const geometry = generateMoleculeGeometry(formaldehyde);
    const pairs = lonePairDirections(formaldehyde, oxygen, geometry.positions);
    const bond = subtract(geometry.positions.get(formaldehyde.neighbors(oxygen)[0]!)!, geometry.positions.get(oxygen)!);
    expect(displayedLonePairCount(formaldehyde, oxygen)).toBe(2);
    expect(angleDegrees(pairs[0]!, { x: 0, y: 0, z: 0 }, bond)).toBeCloseTo(120, 5);
    expect(angleDegrees(pairs[1]!, { x: 0, y: 0, z: 0 }, bond)).toBeCloseTo(120, 5);

    const adenine = parseSmiles('Nc1ncnc2[nH]cnc12');
    const donorNitrogens = adenine.atoms().filter((atom) => adenine.getAtom(atom).element === 'N'
      && hybridizationOf(adenine, atom) === 'sp2'
      && adenine.bondsOf(atom).every((bondId) => adenine.getBond(bondId).order === 1));
    expect(donorNitrogens).toHaveLength(2);
    expect(donorNitrogens.map((atom) => displayedLonePairCount(adenine, atom))).toEqual([0, 0]);
  });

  it.each(DEMO_SOURCES.map(([, , smiles]) => [smiles]))('satisfies the geometry rules for demo molecule %s', (smiles) => {
    const molecule = parseSmiles(smiles);
    const issues = geometryIssues(molecule, generateMoleculeGeometry(molecule));
    expect(issues, JSON.stringify(issues.slice(0, 12), null, 2)).toEqual([]);
  });
});
