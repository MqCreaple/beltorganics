import { Vector3 } from 'three';
import {
  angleDegrees,
  applyDistanceConstraint,
  bestFitPlane,
  canonicalNormal,
  centerPointMap,
  flattenPointMap,
  normalized,
  perpendicular,
  rotateAroundAxis,
  rotateFromTo,
  segmentDistance,
  spreadAround,
} from '../math';
import type { DistanceConstraint } from '../math';
import { conjugatedPiSystems } from './conjugation';
import { hybridizationOf } from './hybridization';
import { orderIndicator } from './tetrahedral';
import type { Molecule } from './molecule';
import type { AtomId, BondId, BondOrder, ElementSymbol } from './types';

export interface MoleculeGeometry { positions: Map<AtomId, Vector3> }
export interface GeometryIssue {
  kind: 'bond-length' | 'bond-angle' | 'planarity' | 'atom-overlap' | 'atom-bond' | 'bond-crossing';
  atoms: AtomId[];
  actual: number;
  expected: number;
}

const COVALENT_RADIUS: Record<ElementSymbol, number> = { H: 0.31, C: 0.76, N: 0.71, O: 0.66 };
const TYPICAL_BOND_LENGTHS = new Map<string, number>([
  ['C-C-1', 1.54], ['C-C-2', 1.34], ['C-C-3', 1.20], ['C-H-1', 1.09],
  ['C-O-1', 1.43], ['C-O-2', 1.23], ['H-O-1', 0.96], ['O-O-1', 1.48],
  ['C-N-1', 1.47], ['C-N-2', 1.28], ['C-N-3', 1.16], ['H-N-1', 1.01],
]);

const atomNumber = (atom: AtomId): number => Number.parseInt(atom.replace(/\D/g, ''), 10) || 0;
const pairKey = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;

const TETRAHEDRAL: readonly Vector3[] = [
  new Vector3(1, 1, 1).normalize(), new Vector3(1, -1, -1).normalize(),
  new Vector3(-1, 1, -1).normalize(), new Vector3(-1, -1, 1).normalize(),
];

function bondKey(a: ElementSymbol, b: ElementSymbol, order: BondOrder): string {
  return `${a < b ? a : b}-${a < b ? b : a}-${order}`;
}

/** Review-specified typical bond length in ångströms; covalent-radius estimate otherwise. */
export function idealBondLength(first: ElementSymbol, second: ElementSymbol, order: BondOrder): number {
  const listed = TYPICAL_BOND_LENGTHS.get(bondKey(first, second, order));
  if (listed !== undefined) return listed;
  return (COVALENT_RADIUS[first] + COVALENT_RADIUS[second]) * (order === 1 ? 1 : order === 2 ? 0.9 : 0.82);
}

function lengthOfBond(molecule: Molecule, a: AtomId, b: AtomId, adjusted: ReadonlyMap<BondId, number>): number {
  const bondId = molecule.bondBetween(a, b)!;
  const resonanceLength = adjusted.get(bondId);
  if (resonanceLength !== undefined) return resonanceLength;
  const bond = molecule.getBond(bondId);
  return idealBondLength(molecule.getAtom(a).element, molecule.getAtom(b).element, bond.order);
}

/**
 * Effective lengths for bonds exchanged by equivalent resonance forms.
 *
 * Compact game rule:
 * 1. Bonds in an alternating 4n+2 conjugated cycle are averaged by element
 *    pair. External substituents do not cancel aromaticity, so a benzene ring
 *    remains equalized inside substituted/fused structures such as morphine.
 * 2. Single/double bonds from one conjugated center to terminal substituents
 *    are averaged only when those substituents have the same element and the
 *    same hydrogen/heavy-neighbor environment. Thus acetate is symmetric,
 *    while protonated acetic acid is not.
 */
export function resonanceAdjustedBondLengths(molecule: Molecule): Map<BondId, number> {
  const result = new Map<BondId, number>();
  const systems = conjugatedPiSystems(molecule).filter((system) => system.atoms.length >= 3);

  for (const system of systems) {
    const atoms = new Set(system.atoms);
    for (const cycleBonds of alternatingAromaticCycles(molecule, atoms)) {
      for (const bondId of cycleBonds) {
        const bond = molecule.getBond(bondId);
        result.set(bondId, averageSingleDoubleLength(
          molecule.getAtom(bond.source).element,
          molecule.getAtom(bond.target).element,
        ));
      }
    }

    for (const center of system.atoms) {
      const candidates = molecule.neighbors(center).filter((neighbor) => atoms.has(neighbor));
      const groups = new Map<string, AtomId[]>();
      for (const neighbor of candidates) {
        const otherNeighbors = molecule.neighbors(neighbor).filter((atom) => atom !== center);
        const hydrogenCount = otherNeighbors.filter((atom) => molecule.getAtom(atom).element === 'H').length;
        const heavyElements = otherNeighbors
          .filter((atom) => molecule.getAtom(atom).element !== 'H')
          .map((atom) => molecule.getAtom(atom).element)
          .sort()
          .join('');
        const key = `${molecule.getAtom(neighbor).element}|H${hydrogenCount}|${heavyElements}`;
        const group = groups.get(key) ?? [];
        group.push(neighbor);
        groups.set(key, group);
      }
      for (const equivalent of groups.values()) {
        const orders = new Set(equivalent.map((neighbor) => molecule.getBond(molecule.bondBetween(center, neighbor)!).order));
        if (!orders.has(1) || !orders.has(2)) continue;
        for (const neighbor of equivalent) {
          const bondId = molecule.bondBetween(center, neighbor)!;
          result.set(bondId, averageSingleDoubleLength(
            molecule.getAtom(center).element,
            molecule.getAtom(neighbor).element,
          ));
        }
      }
    }
  }
  return result;
}

/**
 * Find bounded, alternating 4n+2 cycles inside a perceived conjugated system.
 * Ring membership and alternating π bonds establish aromatic equalization;
 * substituents outside the ring deliberately do not have to match. This keeps
 * a benzene ring aromatic inside fused/substituted structures such as
 * morphine, while avoiding an exponential all-cycle search on huge graphs.
 */
function alternatingAromaticCycles(
  molecule: Molecule,
  allowed: ReadonlySet<AtomId>,
): BondId[][] {
  const found = new Map<string, BondId[]>();
  const maximumRingSize = 12;

  const visit = (start: AtomId, current: AtomId, path: AtomId[], used: Set<AtomId>): void => {
    if (path.length > maximumRingSize) return;
    for (const neighbor of molecule.neighbors(current)) {
      if (!allowed.has(neighbor)) continue;
      const bondId = molecule.bondBetween(current, neighbor)!;
      if (molecule.getBond(bondId).order > 2) continue;
      if (neighbor === start) {
        if (path.length < 4 || path.length % 2 !== 0) continue;
        const bondIds = path.map((atom, index) => molecule.bondBetween(atom, path[(index + 1) % path.length]!)!);
        const orders = bondIds.map((id) => molecule.getBond(id).order);
        if (!orders.every((order, index) => order !== orders[(index + 1) % orders.length])) continue;
        const electronCount = orders.filter((order) => order === 2).length * 2;
        if ((electronCount - 2) % 4 !== 0) continue;
        const key = [...bondIds].sort().join('|');
        found.set(key, bondIds);
        continue;
      }
      if (used.has(neighbor) || path.length === maximumRingSize) continue;
      used.add(neighbor);
      visit(start, neighbor, [...path, neighbor], used);
      used.delete(neighbor);
    }
  };

  for (const start of allowed) visit(start, start, [start], new Set([start]));
  return [...found.values()];
}

function averageSingleDoubleLength(first: ElementSymbol, second: ElementSymbol): number {
  return (idealBondLength(first, second, 1) + idealBondLength(first, second, 2)) / 2;
}

/** VSEPR angle target, including lone-pair compression for water-like O and ammonia-like N. */
export function idealBondAngle(molecule: Molecule, center: AtomId): number {
  const hybridization = hybridizationOf(molecule, center);
  if (hybridization === 'sp') return 180;
  if (hybridization === 'sp2') return 120;
  const { element } = molecule.getAtom(center);
  if (element === 'O' && molecule.neighborCount(center) === 2) return 104.5;
  if (element === 'N' && molecule.neighborCount(center) === 3) return 107;
  return 109.4712206;
}

/** Lone pairs drawn as localized electron domains (a conjugated p pair is excluded). */
export function displayedLonePairCount(molecule: Molecule, atom: AtomId): number {
  const { element, formalCharge } = molecule.getAtom(atom);
  let count = Math.max(0, ({ H: 0, C: 0, N: 1, O: 2 } satisfies Record<ElementSymbol, number>)[element] - formalCharge);
  const hasOwnPiBond = molecule.bondsOf(atom).some((bondId) => molecule.getBond(bondId).order > 1);
  const donatesPairToPiSystem = !hasOwnPiBond
    && hybridizationOf(molecule, atom) === 'sp2'
    && conjugatedPiSystems(molecule).some((system) => system.atoms.includes(atom));
  if (donatesPairToPiSystem) count -= 1;
  return Math.max(0, count);
}

/** VSEPR directions for the localized lone pairs shown by the viewer. */
export function lonePairDirections(
  molecule: Molecule,
  atom: AtomId,
  positions: ReadonlyMap<AtomId, Vector3>,
): Vector3[] {
  const count = displayedLonePairCount(molecule, atom);
  if (count === 0) return [];
  const center = positions.get(atom)!;
  const bonds = molecule.neighbors(atom).map((neighbor) => (
    normalized(positions.get(neighbor)!.clone().sub(center))
  ));
  const hybridization = hybridizationOf(molecule, atom);
  let away = bonds.reduce((result, direction) => result.sub(direction), new Vector3());
  if (away.length() < 1e-7) away = perpendicular(bonds[0] ?? new Vector3(1, 0, 0), atomNumber(atom));
  away = normalized(away);

  if (hybridization === 'sp2') {
    const normal = localPiPlaneNormal(molecule, atom, positions, bonds);
    if (count === 2 && bonds.length === 1) {
      return [rotateAroundAxis(bonds[0]!, normal, 2 * Math.PI / 3), rotateAroundAxis(bonds[0]!, normal, -2 * Math.PI / 3)];
    }
    const planarAway = normalized(away.clone().addScaledVector(normal, -away.dot(normal)));
    if (count === 1) return [planarAway];
    return spreadAround(planarAway, normal, count, 2 * Math.PI / 3);
  }

  if (count === 2 && bonds.length >= 2) {
    const rawNormal = new Vector3().crossVectors(bonds[0]!, bonds[1]!);
    const normal = rawNormal.length() < 1e-7
      ? perpendicular(away, atomNumber(atom))
      : normalized(rawNormal);
    return [
      away.clone().multiplyScalar(Math.sqrt(1 / 3)).addScaledVector(normal, Math.sqrt(2 / 3)).normalize(),
      away.clone().multiplyScalar(Math.sqrt(1 / 3)).addScaledVector(normal, -Math.sqrt(2 / 3)).normalize(),
    ];
  }
  if (count === 1) return [away];

  const axis = bonds[0] ?? away.clone().multiplyScalar(-1);
  const radial1 = perpendicular(axis, atomNumber(atom));
  const radial2 = new Vector3().crossVectors(axis, radial1).normalize();
  return Array.from({ length: count }, (_, index) => {
    const azimuth = index * 2 * Math.PI / count;
    const radial = radial1.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(radial2, Math.sin(azimuth));
    return axis.clone().multiplyScalar(-1 / 3).addScaledVector(radial, 2 * Math.sqrt(2) / 3).normalize();
  });
}

function localPiPlaneNormal(
  molecule: Molecule,
  atom: AtomId,
  positions: ReadonlyMap<AtomId, Vector3>,
  bondDirections: readonly Vector3[],
): Vector3 {
  const group = conjugatedPlanarGroups(molecule).find((candidate) => candidate.includes(atom));
  if (group !== undefined && group.length >= 3) return bestFitPlane(group.map((id) => positions.get(id)!)).normal;
  if (bondDirections.length >= 2) {
    const normal = new Vector3().crossVectors(bondDirections[0]!, bondDirections[1]!);
    if (normal.length() > 1e-7) return normal.normalize();
  }
  return perpendicular(bondDirections[0] ?? new Vector3(1, 0, 0), atomNumber(atom));
}

/**
 * Unit normal of the molecular plane carrying one perceived π system.
 *
 * Extended systems obtain it from three non-collinear participating atoms.
 * A lone C=C has only two participating atoms, so its attached substituent
 * defines the local molecular plane; using a global-axis fallback here was
 * the source of cholesterol's π lobes being rotated by 90 degrees.
 */
export function piSystemNormal(
  molecule: Molecule,
  atoms: readonly AtomId[],
  positions: ReadonlyMap<AtomId, Vector3>,
  systemIndex = 0,
): Vector3 {
  for (let first = 0; first < atoms.length - 2; first += 1) {
    const origin = positions.get(atoms[first]!)!;
    for (let second = first + 1; second < atoms.length - 1; second += 1) {
      const a = positions.get(atoms[second]!)!.clone().sub(origin);
      for (let third = second + 1; third < atoms.length; third += 1) {
        const normal = new Vector3().crossVectors(a, positions.get(atoms[third]!)!.clone().sub(origin));
        if (normal.length() > 1e-6) return canonicalNormal(normal);
      }
    }
  }

  const first = atoms[0];
  const second = atoms[1];
  if (first === undefined || second === undefined) return new Vector3(0, 0, 1);
  const axis = normalized(positions.get(second)!.clone().sub(positions.get(first)!));
  const participating = new Set(atoms);
  for (const center of [first, second]) {
    for (const neighbor of molecule.neighbors(center)) {
      if (participating.has(neighbor)) continue;
      const normal = new Vector3().crossVectors(axis, positions.get(neighbor)!.clone().sub(positions.get(center)!));
      if (normal.length() > 1e-6) return canonicalNormal(normal);
    }
  }

  const firstNormal = perpendicular(axis, 0);
  return systemIndex % 2 === 0
    ? canonicalNormal(firstNormal)
    : canonicalNormal(new Vector3().crossVectors(axis, firstNormal));
}

/**
 * Plane normals for all perceived π systems, coordinated across triple bonds.
 * The two π systems sharing a C≡C/C≡N bond must be mutually perpendicular;
 * deriving each independently fails when one is part of a longer conjugated
 * system (for example divinylacetylene).
 */
export function piSystemNormals(
  molecule: Molecule,
  systems: readonly { atoms: readonly AtomId[] }[],
  positions: ReadonlyMap<AtomId, Vector3>,
): Vector3[] {
  const normals: Vector3[] = [];
  systems.forEach((system, index) => {
    let normal = piSystemNormal(molecule, system.atoms, positions, index);
    for (let previous = 0; previous < index; previous += 1) {
      const shared = system.atoms.filter((atom) => systems[previous]!.atoms.includes(atom));
      if (shared.length !== 2) continue;
      const sharedBond = molecule.bondBetween(shared[0]!, shared[1]!);
      if (sharedBond === undefined || molecule.getBond(sharedBond).order !== 3) continue;
      const axis = normalized(positions.get(shared[1]!)!.clone().sub(positions.get(shared[0]!)!));
      const perpendicularNormal = new Vector3().crossVectors(axis, normals[previous]!);
      if (perpendicularNormal.length() > 1e-6) normal = canonicalNormal(perpendicularNormal);
      break;
    }
    normals.push(normal);
  });
  return normals;
}

function componentRoots(molecule: Molecule): AtomId[] {
  const unseen = new Set(molecule.atoms()); const roots: AtomId[] = [];
  while (unseen.size > 0) {
    const start = unseen.values().next().value as AtomId; const component: AtomId[] = []; const queue = [start]; unseen.delete(start);
    for (let i = 0; i < queue.length; i += 1) {
      const atom = queue[i]!; component.push(atom);
      for (const neighbor of molecule.neighbors(atom)) if (unseen.delete(neighbor)) queue.push(neighbor);
    }
    component.sort((a, b) => {
      const stereo = Number(molecule.getAtom(b).stereo !== undefined) - Number(molecule.getAtom(a).stereo !== undefined);
      const heavy = Number(molecule.getAtom(b).element !== 'H') - Number(molecule.getAtom(a).element !== 'H');
      return stereo || heavy || molecule.neighborCount(b) - molecule.neighborCount(a) || a.localeCompare(b);
    });
    roots.push(component[0]!);
  }
  return roots;
}

function orientDoubleBond(molecule: Molecule, atom: AtomId, parent: AtomId, positions: ReadonlyMap<AtomId, Vector3>, directions: Map<AtomId, Vector3>): void {
  const stereo = molecule.getBond(molecule.bondBetween(atom, parent)!).stereo;
  if (stereo === undefined) return;
  const here = molecule.neighbors(atom).find((n) => n !== parent && molecule.getAtom(n).element !== 'H');
  const there = molecule.neighbors(parent).find((n) => n !== atom && molecule.getAtom(n).element !== 'H');
  if (here === undefined || there === undefined || positions.get(there) === undefined) return;
  const axis = normalized(positions.get(atom)!.clone().sub(positions.get(parent)!));
  const rawOther = positions.get(there)!.clone().sub(positions.get(parent)!);
  const otherSide = rawOther.clone().addScaledVector(axis, -rawOther.dot(axis));
  const thisDirection = directions.get(here)!;
  const thisSide = thisDirection.clone().addScaledVector(axis, -thisDirection.dot(axis));
  const hereBond = molecule.bondBetween(atom, here)!;
  const thereBond = molecule.bondBetween(parent, there)!;
  const cis = stereo.includes(hereBond) === stereo.includes(thereBond);
  if ((otherSide.dot(thisSide) > 0) === cis) return;
  for (const neighbor of molecule.neighbors(atom)) if (neighbor !== parent) {
    const direction = directions.get(neighbor)!;
    directions.set(neighbor, axis.clone().multiplyScalar(2 * direction.dot(axis)).sub(direction));
  }
}

function seedDirections(molecule: Molecule, atom: AtomId, parent: AtomId | undefined, positions: ReadonlyMap<AtomId, Vector3>): Map<AtomId, Vector3> {
  const neighbors = molecule.neighbors(atom); const result = new Map<AtomId, Vector3>();
  const parentDirection = parent === undefined
    ? undefined
    : normalized(positions.get(parent)!.clone().sub(positions.get(atom)!));
  const stereo = molecule.getAtom(atom).stereo;
  if (stereo !== undefined) {
    const parentBond = parent === undefined ? undefined : molecule.bondBetween(atom, parent);
    const parentIndex = parentBond === undefined ? -1 : stereo.indexOf(parentBond);
    const directions = parentIndex < 0 || parentDirection === undefined
      ? TETRAHEDRAL.map((direction) => direction.clone())
      : TETRAHEDRAL.map((direction) => rotateFromTo(direction, TETRAHEDRAL[parentIndex]!, parentDirection));
    for (const neighbor of neighbors) result.set(neighbor, directions[stereo.indexOf(molecule.bondBetween(atom, neighbor)!)]!);
    return result;
  }
  const hybridization = hybridizationOf(molecule, atom);
  if (parentDirection === undefined) {
    if (hybridization === 'sp') neighbors.forEach((neighbor, index) => result.set(neighbor, new Vector3(index === 0 ? 1 : -1, 0, 0)));
    else if (hybridization === 'sp2') neighbors.forEach((neighbor, index) => result.set(neighbor, new Vector3(Math.cos(index * 2 * Math.PI / 3), Math.sin(index * 2 * Math.PI / 3), 0)));
    else neighbors.forEach((neighbor, index) => result.set(neighbor, (TETRAHEDRAL[index] ?? TETRAHEDRAL[0]!).clone()));
    return result;
  }
  result.set(parent!, parentDirection);
  const children = neighbors.filter((neighbor) => neighbor !== parent);
  const axis1 = perpendicular(parentDirection, atomNumber(atom));
  const axis2 = new Vector3().crossVectors(parentDirection, axis1).normalize();
  const theta = idealBondAngle(molecule, atom) * Math.PI / 180;
  children.forEach((child, i) => {
    const azimuth = 2 * Math.PI * i / Math.max(1, children.length) + atomNumber(atom) * 2.399963;
    const radial = axis1.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(axis2, Math.sin(azimuth));
    result.set(child, parentDirection.clone().multiplyScalar(Math.cos(theta)).addScaledVector(radial, Math.sin(theta)).normalize());
  });
  orientDoubleBond(molecule, atom, parent!, positions, result);
  return result;
}

function seedPositions(molecule: Molecule, adjusted: ReadonlyMap<BondId, number>): Map<AtomId, Vector3> {
  const positions = new Map<AtomId, Vector3>(); const visited = new Set<AtomId>();
  componentRoots(molecule).forEach((root, component) => {
    positions.set(root, new Vector3(component * 5, 0, 0)); visited.add(root);
    const queue: Array<{ atom: AtomId; parent?: AtomId }> = [{ atom: root }];
    for (let i = 0; i < queue.length; i += 1) {
      const { atom, parent } = queue[i]!; const directions = seedDirections(molecule, atom, parent, positions);
      for (const neighbor of molecule.neighbors(atom)) if (!visited.has(neighbor)) {
        visited.add(neighbor);
        positions.set(neighbor, positions.get(atom)!.clone().addScaledVector(
          directions.get(neighbor)!,
          lengthOfBond(molecule, atom, neighbor, adjusted),
        ));
        queue.push({ atom: neighbor, parent: atom });
      }
    }
  });
  seedFromRdkitDepiction(molecule, positions, adjusted);
  return positions;
}

/**
 * RDKit's mature crossing-free 2D depiction is used only as a topology seed.
 * The constraint pass below replaces its arbitrary drawing lengths, lifts
 * sp3 centers into 3D, and remains the authority for every final coordinate.
 */
function seedFromRdkitDepiction(molecule: Molecule, positions: Map<AtomId, Vector3>, adjusted: ReadonlyMap<BondId, number>): void {
  let molblock: string;
  try { molblock = molecule.getRdkitMolecule().get_new_coords(); } catch { return; }
  const lines = molblock.split(/\r?\n/);
  const countsIndex = lines.findIndex((line) => /^\s*\d+\s+\d+\s+/.test(line));
  if (countsIndex < 0) return;
  const atomCount = Number.parseInt(lines[countsIndex]!.trim().split(/\s+/)[0]!, 10);
  const bondCount = Number.parseInt(lines[countsIndex]!.trim().split(/\s+/)[1]!, 10);
  const heavy = molecule.atoms().filter((atom) => molecule.getAtom(atom).element !== 'H');
  if (atomCount !== heavy.length) return;
  const depictedElements: ElementSymbol[] = [];
  const depictedBonds: Array<{ a: number; b: number; order: number }> = [];
  for (let index = 0; index < atomCount; index += 1) depictedElements.push(lines[countsIndex + 1 + index]!.trim().split(/\s+/)[3] as ElementSymbol);
  for (let index = 0; index < bondCount; index += 1) {
    const fields = lines[countsIndex + 1 + atomCount + index]!.trim().split(/\s+/);
    depictedBonds.push({ a: Number(fields[0]) - 1, b: Number(fields[1]) - 1, order: Number(fields[2]) });
  }
  const mapping = mapDepictionAtoms(molecule, heavy, depictedElements, depictedBonds);
  if (mapping === undefined) return;
  for (let index = 0; index < atomCount; index += 1) {
    const fields = lines[countsIndex + 1 + index]!.trim().split(/\s+/);
    const atom = mapping[index]!;
    const x = Number(fields[0]); const y = Number(fields[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const sp3Lift = hybridizationOf(molecule, atom) === 'sp3' ? Math.sin((atomNumber(atom) + 1) * 2.17) * 0.24 : 0;
    positions.set(atom, new Vector3(x, y, sp3Lift));
  }
  for (const center of heavy) placeHydrogenSeeds(molecule, center, positions, adjusted);
  seedTetrahedralParity(molecule, positions);
}

function seedTetrahedralParity(molecule: Molecule, positions: Map<AtomId, Vector3>): void {
  for (const center of molecule.atoms()) {
    const stereo = molecule.getAtom(center).stereo;
    if (stereo === undefined) continue;
    const neighbors = molecule.neighbors(center);
    const movable = neighbors.find((atom) => molecule.getAtom(atom).element === 'H')
      ?? neighbors.reduce((best, atom) => molecule.neighborCount(atom) < molecule.neighborCount(best) ? atom : best);
    const point = positions.get(movable)!; const origin = positions.get(center)!;
    positions.set(movable, point.clone().setZ(origin.z + orderIndicator(stereo) * 0.82));
  }
}

function mapDepictionAtoms(
  molecule: Molecule,
  heavy: readonly AtomId[],
  elements: readonly ElementSymbol[],
  bonds: ReadonlyArray<{ a: number; b: number; order: number }>,
): AtomId[] | undefined {
  const adjacency = elements.map(() => new Map<number, number>());
  for (const bond of bonds) { adjacency[bond.a]!.set(bond.b, bond.order); adjacency[bond.b]!.set(bond.a, bond.order); }
  const heavyDegree = (atom: AtomId) => molecule.neighbors(atom).filter((neighbor) => molecule.getAtom(neighbor).element !== 'H').length;
  const signature = (atom: AtomId) => molecule.neighbors(atom)
    .filter((neighbor) => molecule.getAtom(neighbor).element !== 'H')
    .map((neighbor) => molecule.getAtom(neighbor).element).sort().join(',');
  const depictedSignature = (index: number) => [...adjacency[index]!].map(([neighbor]) => elements[neighbor]).sort().join(',');
  const candidates = elements.map((element, index) => heavy.filter((atom) => molecule.getAtom(atom).element === element && heavyDegree(atom) === adjacency[index]!.size && signature(atom) === depictedSignature(index)));
  const order = elements.map((_, index) => index).sort((a, b) => candidates[a]!.length - candidates[b]!.length || adjacency[b]!.size - adjacency[a]!.size || a - b);
  const result: AtomId[] = []; const used = new Set<AtomId>();
  const search = (depth: number): boolean => {
    if (depth === order.length) return true;
    const index = order[depth]!;
    for (const atom of candidates[index]!) {
      if (used.has(atom)) continue;
      let compatible = true;
      for (const [otherIndex] of adjacency[index]!) {
        const otherAtom = result[otherIndex];
        if (otherAtom === undefined) continue;
        const gameBond = molecule.bondBetween(atom, otherAtom);
        if (gameBond === undefined) { compatible = false; break; }
      }
      if (!compatible) continue;
      result[index] = atom; used.add(atom);
      if (search(depth + 1)) return true;
      used.delete(atom); delete result[index];
    }
    return false;
  };
  return search(0) ? result : undefined;
}

function placeHydrogenSeeds(molecule: Molecule, center: AtomId, positions: Map<AtomId, Vector3>, adjusted: ReadonlyMap<BondId, number>): void {
  const hydrogens = molecule.neighbors(center).filter((atom) => molecule.getAtom(atom).element === 'H');
  if (hydrogens.length === 0) return;
  const origin = positions.get(center)!;
  const heavyDirections = molecule.neighbors(center)
    .filter((atom) => molecule.getAtom(atom).element !== 'H')
    .map((atom) => normalized(positions.get(atom)!.clone().sub(origin)));
  let away = heavyDirections.reduce((result, direction) => result.sub(direction), new Vector3());
  if (away.length() < 1e-5) away = perpendicular(heavyDirections[0] ?? new Vector3(1, 0, 0), atomNumber(center));
  away = normalized(away);
  const side = perpendicular(away, atomNumber(center));
  const otherSide = new Vector3().crossVectors(away, side).normalize();
  const hybridization = hybridizationOf(molecule, center);
  hydrogens.forEach((hydrogen, index) => {
    let direction: Vector3;
    if (hydrogens.length === 1) direction = away;
    else if (hybridization === 'sp2') {
      const offset = (index === 0 ? -1 : 1) * Math.PI / 3;
      direction = away.clone().multiplyScalar(Math.cos(offset)).addScaledVector(side, Math.sin(offset)).normalize();
    } else {
      const azimuth = 2 * Math.PI * index / hydrogens.length;
      const radial = side.clone().multiplyScalar(Math.cos(azimuth)).addScaledVector(otherSide, Math.sin(azimuth));
      direction = away.clone().multiplyScalar(0.45).addScaledVector(radial, 0.893).normalize();
    }
    positions.set(hydrogen, origin.clone().addScaledVector(
      direction,
      lengthOfBond(molecule, center, hydrogen, adjusted),
    ));
  });
}

function constraints(molecule: Molecule, adjusted: ReadonlyMap<BondId, number>): DistanceConstraint<AtomId>[] {
  const result: DistanceConstraint<AtomId>[] = [];
  for (const id of molecule.bonds()) { const { source, target } = molecule.getBond(id); result.push({ a: source, b: target, distance: lengthOfBond(molecule, source, target, adjusted), strength: adjusted.has(id) ? 1.6 : 1 }); }
  for (const center of molecule.atoms()) {
    const neighbors = molecule.neighbors(center); const cosine = Math.cos(idealBondAngle(molecule, center) * Math.PI / 180);
    for (let i = 0; i < neighbors.length; i += 1) for (let j = i + 1; j < neighbors.length; j += 1) {
      const a = neighbors[i]!; const b = neighbors[j]!; const first = lengthOfBond(molecule, center, a, adjusted); const second = lengthOfBond(molecule, center, b, adjusted);
      result.push({ a, b, distance: Math.sqrt(first * first + second * second - 2 * first * second * cosine), strength: 0.32 });
    }
  }
  return result;
}

/** A conjugated system and substituents directly bonded to its sp2 atoms share a plane. */
export function conjugatedPlanarGroups(molecule: Molecule): AtomId[][] {
  return conjugatedPiSystems(molecule).filter((system) => system.atoms.length >= 3).map((system) => {
    const group = new Set(system.atoms);
    for (const atom of system.atoms) for (const neighbor of molecule.neighbors(atom)) group.add(neighbor);
    return [...group];
  });
}

function applyDistance(positions: Map<AtomId, Vector3>, item: DistanceConstraint<AtomId>): void {
  applyDistanceConstraint(
    positions,
    item,
    new Vector3(atomNumber(item.a) + 1, atomNumber(item.b) + 2, 0.37),
  );
}

function applyDistanceToHydrogens(
  molecule: Molecule,
  positions: Map<AtomId, Vector3>,
  item: DistanceConstraint<AtomId>,
): void {
  const firstMovable = molecule.getAtom(item.a).element === 'H';
  const secondMovable = molecule.getAtom(item.b).element === 'H';
  if (!firstMovable && !secondMovable) return;
  const first = positions.get(item.a)!; const second = positions.get(item.b)!;
  let delta = second.clone().sub(first); let length = delta.length();
  if (length < 1e-8) {
    delta = normalized(new Vector3(atomNumber(item.a) + 1, atomNumber(item.b) + 2, 0.37));
    length = 1;
  }
  const movableCount = Number(firstMovable) + Number(secondMovable);
  const correction = delta.multiplyScalar(
    ((length - item.distance) / length) * item.strength / movableCount,
  );
  if (firstMovable) positions.set(item.a, first.clone().add(correction));
  if (secondMovable) positions.set(item.b, second.clone().sub(correction));
}

function bondedPairs(molecule: Molecule): Set<string> {
  const result = new Set<string>(); for (const id of molecule.bonds()) { const { source, target } = molecule.getBond(id); result.add(pairKey(source, target)); } return result;
}

function separateAtoms(molecule: Molecule, positions: Map<AtomId, Vector3>, bonded: ReadonlySet<string>, strength: number): void {
  const atoms = molecule.atoms();
  for (let i = 0; i < atoms.length; i += 1) for (let j = i + 1; j < atoms.length; j += 1) {
    const a = atoms[i]!; const b = atoms[j]!; if (bonded.has(pairKey(a, b))) continue;
    const first = positions.get(a)!; const second = positions.get(b)!;
    let delta = second.clone().sub(first); let distance = delta.length();
    const minimum = (COVALENT_RADIUS[molecule.getAtom(a).element] + COVALENT_RADIUS[molecule.getAtom(b).element]) * 0.72;
    if (distance >= minimum) continue;
    if (distance < 1e-8) {
      delta = normalized(new Vector3(atomNumber(a) + 1, atomNumber(b) + 3, 0.73));
      distance = 1;
    }
    const correction = delta.multiplyScalar(((minimum - distance) / distance) * 0.5 * strength);
    positions.set(a, first.clone().sub(correction)); positions.set(b, second.clone().add(correction));
  }
}

function separateHydrogens(molecule: Molecule, positions: Map<AtomId, Vector3>, bonded: ReadonlySet<string>, strength: number): void {
  const atoms = molecule.atoms();
  for (let i = 0; i < atoms.length; i += 1) for (let j = i + 1; j < atoms.length; j += 1) {
    const a = atoms[i]!; const b = atoms[j]!;
    if (bonded.has(pairKey(a, b))) continue;
    const aMovable = molecule.getAtom(a).element === 'H';
    const bMovable = molecule.getAtom(b).element === 'H';
    if (!aMovable && !bMovable) continue;
    const first = positions.get(a)!; const second = positions.get(b)!;
    let delta = second.clone().sub(first); let distance = delta.length();
    const minimum = (COVALENT_RADIUS[molecule.getAtom(a).element] + COVALENT_RADIUS[molecule.getAtom(b).element]) * 0.72;
    if (distance >= minimum) continue;
    if (distance < 1e-8) {
      delta = normalized(new Vector3(atomNumber(a) + 1, atomNumber(b) + 3, 0.73));
      distance = 1;
    }
    const movableCount = Number(aMovable) + Number(bMovable);
    const correction = delta.multiplyScalar(((minimum - distance) / distance) * strength / movableCount);
    if (aMovable) positions.set(a, first.clone().sub(correction));
    if (bMovable) positions.set(b, second.clone().add(correction));
  }
}

function separateCrossings(molecule: Molecule, positions: Map<AtomId, Vector3>, strength: number): void {
  const bonds = molecule.bonds().map((id) => molecule.getBond(id));
  for (let i = 0; i < bonds.length; i += 1) for (let j = i + 1; j < bonds.length; j += 1) {
    const first = bonds[i]!; const second = bonds[j]!; if ([first.source, first.target].some((atom) => atom === second.source || atom === second.target)) continue;
    const closest = segmentDistance(positions.get(first.source)!, positions.get(first.target)!, positions.get(second.source)!, positions.get(second.target)!); const minimum = 0.16;
    if (closest.distance >= minimum) continue;
    let direction = normalized(closest.delta);
    if (closest.distance < 1e-7) {
      const firstAxis = positions.get(first.target)!.clone().sub(positions.get(first.source)!);
      const secondAxis = positions.get(second.target)!.clone().sub(positions.get(second.source)!);
      const normal = new Vector3().crossVectors(firstAxis, secondAxis);
      direction = normal.length() < 1e-7 ? perpendicular(firstAxis, i + j) : normal.normalize();
    }
    const shift = direction.multiplyScalar((minimum - closest.distance) * 0.5 * strength);
    positions.set(first.source, positions.get(first.source)!.clone().addScaledVector(shift, 1 - closest.firstT));
    positions.set(first.target, positions.get(first.target)!.clone().addScaledVector(shift, closest.firstT));
    positions.set(second.source, positions.get(second.source)!.clone().addScaledVector(shift, -(1 - closest.secondT)));
    positions.set(second.target, positions.get(second.target)!.clone().addScaledVector(shift, -closest.secondT));
  }
}

function separateAtomBonds(molecule: Molecule, positions: Map<AtomId, Vector3>, strength: number): void {
  const bonds = molecule.bonds().map((id) => molecule.getBond(id));
  for (const atom of molecule.atoms()) for (const bond of bonds) {
    if (bond.source === atom || bond.target === atom) continue;
    const closest = segmentDistance(positions.get(atom)!, positions.get(atom)!, positions.get(bond.source)!, positions.get(bond.target)!);
    const minimum = COVALENT_RADIUS[molecule.getAtom(atom).element] * 0.48 + 0.06;
    if (closest.distance >= minimum) continue;
    const bondAxis = positions.get(bond.target)!.clone().sub(positions.get(bond.source)!);
    const direction = closest.distance < 1e-7
      ? perpendicular(bondAxis, atomNumber(atom))
      : normalized(closest.delta);
    const shift = direction.multiplyScalar((minimum - closest.distance) * 0.5 * strength);
    positions.set(atom, positions.get(atom)!.clone().add(shift));
    positions.set(bond.source, positions.get(bond.source)!.clone().addScaledVector(shift, -(1 - closest.secondT)));
    positions.set(bond.target, positions.get(bond.target)!.clone().addScaledVector(shift, -closest.secondT));
  }
}

function optimize(molecule: Molecule, positions: Map<AtomId, Vector3>, adjusted: ReadonlyMap<BondId, number>): void {
  const rules = constraints(molecule, adjusted); const planes = conjugatedPlanarGroups(molecule); const bonded = bondedPairs(molecule); const iterations = molecule.atomCount < 40 ? 900 : 600;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (iteration % 2 === 0) for (const rule of rules) applyDistance(positions, rule); else for (let i = rules.length-1; i >= 0; i -= 1) applyDistance(positions,rules[i]!);
    for (const plane of planes) flattenPointMap(positions, plane, 0.72);
    separateAtoms(molecule,positions,bonded,0.5);
    if (iteration % 3 === 0) {
      if (iteration > iterations / 2 && iteration % 6 === 0) separateAtomBonds(molecule,positions,0.2);
      separateCrossings(molecule,positions,0.65);
    }
  }
  if (molecule.atomCount >= 80) {
    // Large explicit-H molecules converge more reliably in two stages. First
    // settle the heavy skeleton without peripheral hydrogens pulling it out
    // of shape, then rebuild/relax only the hydrogen positions while treating
    // the heavy coordinates as anchors.
    const heavyRules = rules.filter(({ a, b }) => molecule.getAtom(a).element !== 'H' && molecule.getAtom(b).element !== 'H');
    const heavyPlanes = planes.map((plane) => plane.filter((atom) => molecule.getAtom(atom).element !== 'H'));
    for (let iteration = 0; iteration < 300; iteration += 1) {
      for (const rule of heavyRules) applyDistance(positions, { ...rule, strength: rule.strength * 0.72 });
      for (const plane of heavyPlanes) flattenPointMap(positions, plane, 1);
      if (iteration % 3 === 0) separateAtoms(molecule, positions, bonded, 0.18);
      if (iteration % 6 === 0) separateCrossings(molecule, positions, 0.2);
    }
    for (const atom of molecule.atoms()) if (molecule.getAtom(atom).element !== 'H') {
      placeHydrogenSeeds(molecule, atom, positions, adjusted);
    }
    const hydrogenRules = rules.filter(({ a, b }) => molecule.getAtom(a).element === 'H' || molecule.getAtom(b).element === 'H');
    for (let iteration = 0; iteration < 160; iteration += 1) {
      for (const rule of hydrogenRules) applyDistanceToHydrogens(molecule, positions, { ...rule, strength: rule.strength * 0.55 });
      separateHydrogens(molecule, positions, bonded, 0.35);
    }
    for (const plane of planes) flattenPointMap(positions, plane, 1);
    separateHydrogens(molecule, positions, bonded, 1);
  } else {
    for (let iteration = 0; iteration < 100; iteration += 1) { for (const rule of rules) applyDistance(positions,{...rule,strength:rule.strength*0.7}); for (const plane of planes) flattenPointMap(positions, plane, 1); }
  }
}

/** Deterministic constrained display conformer (not a quantum/force-field optimization). */
export function generateMoleculeGeometry(molecule: Molecule): MoleculeGeometry {
  const adjusted = resonanceAdjustedBondLengths(molecule);
  const positions = seedPositions(molecule, adjusted); optimize(molecule,positions,adjusted); centerPointMap(positions); return { positions };
}

/** Validate bond lengths, local geometry, conjugated planes and intersections. */
export function geometryIssues(molecule: Molecule, geometry: MoleculeGeometry): GeometryIssue[] {
  const issues: GeometryIssue[]=[]; const {positions}=geometry; const adjusted=resonanceAdjustedBondLengths(molecule);
  for (const id of molecule.bonds()) { const {source,target}=molecule.getBond(id); const actual=positions.get(source)!.distanceTo(positions.get(target)!); const expected=lengthOfBond(molecule,source,target,adjusted); if(Math.abs(actual-expected)>0.08) issues.push({kind:'bond-length',atoms:[source,target],actual,expected}); }
  for (const center of molecule.atoms()) { const neighbors=molecule.neighbors(center); if(neighbors.length<2||molecule.getAtom(center).element==='H') continue; const expected=idealBondAngle(molecule,center); for(let i=0;i<neighbors.length;i+=1) for(let j=i+1;j<neighbors.length;j+=1){const actual=angleDegrees(positions.get(neighbors[i]!)!,positions.get(center)!,positions.get(neighbors[j]!)!); if(Math.abs(actual-expected)>(expected===180?12:20)) issues.push({kind:'bond-angle',atoms:[neighbors[i]!,center,neighbors[j]!],actual,expected});}}
  for(const group of conjugatedPlanarGroups(molecule)){const plane=bestFitPlane(group.map((atom)=>positions.get(atom)!)); for(const atom of group){const actual=Math.abs(positions.get(atom)!.clone().sub(plane.center).dot(plane.normal)); if(actual>0.08) issues.push({kind:'planarity',atoms:[atom],actual,expected:0});}}
  const bonded=bondedPairs(molecule); const atoms=molecule.atoms(); for(let i=0;i<atoms.length;i+=1) for(let j=i+1;j<atoms.length;j+=1){const a=atoms[i]!,b=atoms[j]!; if(bonded.has(pairKey(a,b)))continue; const actual=positions.get(a)!.distanceTo(positions.get(b)!); const expected=(COVALENT_RADIUS[molecule.getAtom(a).element]+COVALENT_RADIUS[molecule.getAtom(b).element])*0.64; if(actual<expected)issues.push({kind:'atom-overlap',atoms:[a,b],actual,expected});}
  const bonds=molecule.bonds().map((id)=>molecule.getBond(id)); for(let i=0;i<bonds.length;i+=1) for(let j=i+1;j<bonds.length;j+=1){const a=bonds[i]!,b=bonds[j]!;if([a.source,a.target].some((atom)=>atom===b.source||atom===b.target))continue;const actual=segmentDistance(positions.get(a.source)!,positions.get(a.target)!,positions.get(b.source)!,positions.get(b.target)!).distance;if(actual<0.1)issues.push({kind:'bond-crossing',atoms:[a.source,a.target,b.source,b.target],actual,expected:0.1});}
  for(const atom of atoms)for(const bond of bonds){if(bond.source===atom||bond.target===atom)continue;const actual=segmentDistance(positions.get(atom)!,positions.get(atom)!,positions.get(bond.source)!,positions.get(bond.target)!).distance;const expected=COVALENT_RADIUS[molecule.getAtom(atom).element]*0.48+0.06;if(actual<expected)issues.push({kind:'atom-bond',atoms:[atom,bond.source,bond.target],actual,expected});}
  return issues;
}
