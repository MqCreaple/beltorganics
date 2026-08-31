import { conjugatedPiSystems } from './conjugation';
import { hybridizationOf } from './hybridization';
import { orderIndicator } from './tetrahedral';
import type { Molecule } from './molecule';
import type { AtomId, BondOrder, ElementSymbol } from './types';

export interface Point3D { x: number; y: number; z: number }
export interface MoleculeGeometry { positions: Map<AtomId, Point3D> }
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

const add = (a: Point3D, b: Point3D): Point3D => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Point3D, b: Point3D): Point3D => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: Point3D, n: number): Point3D => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a: Point3D, b: Point3D): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Point3D, b: Point3D): Point3D => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const magnitude = (a: Point3D): number => Math.hypot(a.x, a.y, a.z);
function unit(a: Point3D): Point3D { const length = magnitude(a); return length < 1e-9 ? { x: 1, y: 0, z: 0 } : mul(a, 1 / length); }
const atomNumber = (atom: AtomId): number => Number.parseInt(atom.replace(/\D/g, ''), 10) || 0;
const pairKey = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;

const TETRAHEDRAL: readonly Point3D[] = [
  unit({ x: 1, y: 1, z: 1 }), unit({ x: 1, y: -1, z: -1 }),
  unit({ x: -1, y: 1, z: -1 }), unit({ x: -1, y: -1, z: 1 }),
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

function lengthOfBond(molecule: Molecule, a: AtomId, b: AtomId): number {
  const bond = molecule.getBond(molecule.bondBetween(a, b)!);
  return idealBondLength(molecule.getAtom(a).element, molecule.getAtom(b).element, bond.order);
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

function perpendicular(axis: Point3D, salt = 0): Point3D {
  const references: Point3D[] = [{ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }];
  let reference = references[salt % references.length]!;
  if (Math.abs(dot(unit(axis), reference)) > 0.85) reference = references[(salt + 1) % references.length]!;
  return unit(cross(axis, reference));
}

function rotateFromTo(point: Point3D, from: Point3D, to: Point3D): Point3D {
  const source = unit(from); const target = unit(to);
  const cosine = Math.max(-1, Math.min(1, dot(source, target)));
  if (cosine > 0.999999) return point;
  if (cosine < -0.999999) { const axis = perpendicular(source); return sub(mul(axis, 2 * dot(axis, point)), point); }
  const axis = unit(cross(source, target)); const sine = Math.sqrt(1 - cosine * cosine);
  return add(add(mul(point, cosine), mul(cross(axis, point), sine)), mul(axis, dot(axis, point) * (1 - cosine)));
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
      const stereo = Number(molecule.getAtom(b).stereo?.bonds !== undefined) - Number(molecule.getAtom(a).stereo?.bonds !== undefined);
      const heavy = Number(molecule.getAtom(b).element !== 'H') - Number(molecule.getAtom(a).element !== 'H');
      return stereo || heavy || molecule.neighborCount(b) - molecule.neighborCount(a) || a.localeCompare(b);
    });
    roots.push(component[0]!);
  }
  return roots;
}

function orientDoubleBond(molecule: Molecule, atom: AtomId, parent: AtomId, positions: ReadonlyMap<AtomId, Point3D>, directions: Map<AtomId, Point3D>): void {
  const stereo = molecule.getBond(molecule.bondBetween(atom, parent)!).stereo;
  if (stereo !== 'cis' && stereo !== 'trans') return;
  const here = molecule.neighbors(atom).find((n) => n !== parent && molecule.getAtom(n).element !== 'H');
  const there = molecule.neighbors(parent).find((n) => n !== atom && molecule.getAtom(n).element !== 'H');
  if (here === undefined || there === undefined || positions.get(there) === undefined) return;
  const axis = unit(sub(positions.get(atom)!, positions.get(parent)!));
  const rawOther = sub(positions.get(there)!, positions.get(parent)!);
  const otherSide = sub(rawOther, mul(axis, dot(rawOther, axis)));
  const thisDirection = directions.get(here)!; const thisSide = sub(thisDirection, mul(axis, dot(thisDirection, axis)));
  if ((dot(otherSide, thisSide) > 0) === (stereo === 'cis')) return;
  for (const neighbor of molecule.neighbors(atom)) if (neighbor !== parent) {
    const direction = directions.get(neighbor)!;
    directions.set(neighbor, sub(mul(axis, 2 * dot(direction, axis)), direction));
  }
}

function seedDirections(molecule: Molecule, atom: AtomId, parent: AtomId | undefined, positions: ReadonlyMap<AtomId, Point3D>): Map<AtomId, Point3D> {
  const neighbors = molecule.neighbors(atom); const result = new Map<AtomId, Point3D>();
  const parentDirection = parent === undefined ? undefined : unit(sub(positions.get(parent)!, positions.get(atom)!));
  const stereo = molecule.getAtom(atom).stereo?.bonds;
  if (stereo !== undefined) {
    const parentBond = parent === undefined ? undefined : molecule.bondBetween(atom, parent);
    const parentIndex = parentBond === undefined ? -1 : stereo.indexOf(parentBond);
    const directions = parentIndex < 0 || parentDirection === undefined ? [...TETRAHEDRAL] : TETRAHEDRAL.map((d) => rotateFromTo(d, TETRAHEDRAL[parentIndex]!, parentDirection));
    for (const neighbor of neighbors) result.set(neighbor, directions[stereo.indexOf(molecule.bondBetween(atom, neighbor)!)]!);
    return result;
  }
  const hybridization = hybridizationOf(molecule, atom);
  if (parentDirection === undefined) {
    if (hybridization === 'sp') neighbors.forEach((neighbor, i) => result.set(neighbor, { x: i === 0 ? 1 : -1, y: 0, z: 0 }));
    else if (hybridization === 'sp2') neighbors.forEach((neighbor, i) => result.set(neighbor, { x: Math.cos(i * 2 * Math.PI / 3), y: Math.sin(i * 2 * Math.PI / 3), z: 0 }));
    else neighbors.forEach((neighbor, i) => result.set(neighbor, TETRAHEDRAL[i] ?? TETRAHEDRAL[0]!));
    return result;
  }
  result.set(parent!, parentDirection);
  const children = neighbors.filter((neighbor) => neighbor !== parent);
  const axis1 = perpendicular(parentDirection, atomNumber(atom)); const axis2 = unit(cross(parentDirection, axis1));
  const theta = idealBondAngle(molecule, atom) * Math.PI / 180;
  children.forEach((child, i) => {
    const azimuth = 2 * Math.PI * i / Math.max(1, children.length) + atomNumber(atom) * 2.399963;
    const radial = add(mul(axis1, Math.cos(azimuth)), mul(axis2, Math.sin(azimuth)));
    result.set(child, unit(add(mul(parentDirection, Math.cos(theta)), mul(radial, Math.sin(theta)))));
  });
  orientDoubleBond(molecule, atom, parent!, positions, result);
  return result;
}

function seedPositions(molecule: Molecule): Map<AtomId, Point3D> {
  const positions = new Map<AtomId, Point3D>(); const visited = new Set<AtomId>();
  componentRoots(molecule).forEach((root, component) => {
    positions.set(root, { x: component * 5, y: 0, z: 0 }); visited.add(root);
    const queue: Array<{ atom: AtomId; parent?: AtomId }> = [{ atom: root }];
    for (let i = 0; i < queue.length; i += 1) {
      const { atom, parent } = queue[i]!; const directions = seedDirections(molecule, atom, parent, positions);
      for (const neighbor of molecule.neighbors(atom)) if (!visited.has(neighbor)) {
        visited.add(neighbor);
        positions.set(neighbor, add(positions.get(atom)!, mul(directions.get(neighbor)!, lengthOfBond(molecule, atom, neighbor))));
        queue.push({ atom: neighbor, parent: atom });
      }
    }
  });
  seedFromRdkitDepiction(molecule, positions);
  return positions;
}

/**
 * RDKit's mature crossing-free 2D depiction is used only as a topology seed.
 * The constraint pass below replaces its arbitrary drawing lengths, lifts
 * sp3 centers into 3D, and remains the authority for every final coordinate.
 */
function seedFromRdkitDepiction(molecule: Molecule, positions: Map<AtomId, Point3D>): void {
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
    positions.set(atom, { x, y, z: sp3Lift });
  }
  for (const center of heavy) placeHydrogenSeeds(molecule, center, positions);
  seedTetrahedralParity(molecule, positions);
}

function seedTetrahedralParity(molecule: Molecule, positions: Map<AtomId, Point3D>): void {
  for (const center of molecule.atoms()) {
    const stereo = molecule.getAtom(center).stereo?.bonds;
    if (stereo === undefined) continue;
    const neighbors = molecule.neighbors(center);
    const movable = neighbors.find((atom) => molecule.getAtom(atom).element === 'H')
      ?? neighbors.reduce((best, atom) => molecule.neighborCount(atom) < molecule.neighborCount(best) ? atom : best);
    const point = positions.get(movable)!; const origin = positions.get(center)!;
    positions.set(movable, { ...point, z: origin.z + orderIndicator(stereo) * 0.82 });
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

function placeHydrogenSeeds(molecule: Molecule, center: AtomId, positions: Map<AtomId, Point3D>): void {
  const hydrogens = molecule.neighbors(center).filter((atom) => molecule.getAtom(atom).element === 'H');
  if (hydrogens.length === 0) return;
  const origin = positions.get(center)!;
  const heavyDirections = molecule.neighbors(center)
    .filter((atom) => molecule.getAtom(atom).element !== 'H')
    .map((atom) => unit(sub(positions.get(atom)!, origin)));
  let away = { x: 0, y: 0, z: 0 };
  for (const direction of heavyDirections) away = sub(away, direction);
  if (magnitude(away) < 1e-5) away = perpendicular(heavyDirections[0] ?? { x: 1, y: 0, z: 0 }, atomNumber(center));
  away = unit(away);
  const side = perpendicular(away, atomNumber(center));
  const otherSide = unit(cross(away, side));
  const hybridization = hybridizationOf(molecule, center);
  hydrogens.forEach((hydrogen, index) => {
    let direction: Point3D;
    if (hydrogens.length === 1) direction = away;
    else if (hybridization === 'sp2') {
      const offset = (index === 0 ? -1 : 1) * Math.PI / 3;
      direction = unit(add(mul(away, Math.cos(offset)), mul(side, Math.sin(offset))));
    } else {
      const azimuth = 2 * Math.PI * index / hydrogens.length;
      const radial = add(mul(side, Math.cos(azimuth)), mul(otherSide, Math.sin(azimuth)));
      direction = unit(add(mul(away, 0.45), mul(radial, 0.893)));
    }
    positions.set(hydrogen, add(origin, mul(direction, lengthOfBond(molecule, center, hydrogen))));
  });
}

interface DistanceConstraint { a: AtomId; b: AtomId; distance: number; strength: number }
function constraints(molecule: Molecule): DistanceConstraint[] {
  const result: DistanceConstraint[] = [];
  for (const id of molecule.bonds()) { const { source, target } = molecule.getBond(id); result.push({ a: source, b: target, distance: lengthOfBond(molecule, source, target), strength: 1 }); }
  for (const center of molecule.atoms()) {
    const neighbors = molecule.neighbors(center); const cosine = Math.cos(idealBondAngle(molecule, center) * Math.PI / 180);
    for (let i = 0; i < neighbors.length; i += 1) for (let j = i + 1; j < neighbors.length; j += 1) {
      const a = neighbors[i]!; const b = neighbors[j]!; const first = lengthOfBond(molecule, center, a); const second = lengthOfBond(molecule, center, b);
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

function applyDistance(positions: Map<AtomId, Point3D>, item: DistanceConstraint): void {
  const first = positions.get(item.a)!; const second = positions.get(item.b)!; let delta = sub(second, first); let length = magnitude(delta);
  if (length < 1e-8) { delta = unit({ x: atomNumber(item.a) + 1, y: atomNumber(item.b) + 2, z: 0.37 }); length = 1; }
  const correction = mul(delta, (length - item.distance) / length * 0.5 * item.strength);
  positions.set(item.a, add(first, correction)); positions.set(item.b, sub(second, correction));
}

function bestPlane(points: readonly Point3D[]): { center: Point3D; normal: Point3D } {
  let center = { x: 0, y: 0, z: 0 }; for (const point of points) center = add(center, point); center = mul(center, 1 / points.length);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const point of points) { const p = sub(point, center); xx += p.x*p.x; xy += p.x*p.y; xz += p.x*p.z; yy += p.y*p.y; yz += p.y*p.z; zz += p.z*p.z; }
  let normal = unit(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
  for (let i = 0; i < 12; i += 1) {
    const scale = Math.max(xx + yy + zz, 1); const old = normal;
    normal = unit({ x: old.x - (xx*old.x + xy*old.y + xz*old.z)/scale, y: old.y - (xy*old.x + yy*old.y + yz*old.z)/scale, z: old.z - (xz*old.x + yz*old.y + zz*old.z)/scale });
  }
  return { center, normal };
}

function flattenGroup(positions: Map<AtomId, Point3D>, group: readonly AtomId[], strength: number): void {
  const plane = bestPlane(group.map((atom) => positions.get(atom)!));
  for (const atom of group) { const point = positions.get(atom)!; positions.set(atom, sub(point, mul(plane.normal, dot(sub(point, plane.center), plane.normal) * strength))); }
}

function bondedPairs(molecule: Molecule): Set<string> {
  const result = new Set<string>(); for (const id of molecule.bonds()) { const { source, target } = molecule.getBond(id); result.add(pairKey(source, target)); } return result;
}

function separateAtoms(molecule: Molecule, positions: Map<AtomId, Point3D>, bonded: ReadonlySet<string>, strength: number): void {
  const atoms = molecule.atoms();
  for (let i = 0; i < atoms.length; i += 1) for (let j = i + 1; j < atoms.length; j += 1) {
    const a = atoms[i]!; const b = atoms[j]!; if (bonded.has(pairKey(a, b))) continue;
    const first = positions.get(a)!; const second = positions.get(b)!; let delta = sub(second, first); let distance = magnitude(delta);
    const minimum = (COVALENT_RADIUS[molecule.getAtom(a).element] + COVALENT_RADIUS[molecule.getAtom(b).element]) * 0.72;
    if (distance >= minimum) continue;
    if (distance < 1e-8) { delta = unit({ x: atomNumber(a) + 1, y: atomNumber(b) + 3, z: 0.73 }); distance = 1; }
    const correction = mul(delta, (minimum - distance) / distance * 0.5 * strength);
    positions.set(a, sub(first, correction)); positions.set(b, add(second, correction));
  }
}

interface SegmentDistance { distance: number; firstT: number; secondT: number; delta: Point3D }
function segmentDistance(a0: Point3D, a1: Point3D, b0: Point3D, b1: Point3D): SegmentDistance {
  const u = sub(a1, a0); const v = sub(b1, b0); const w = sub(a0, b0);
  const aa = dot(u,u); const bb = dot(u,v); const cc = dot(v,v); const dd = dot(u,w); const ee = dot(v,w); const denominator = aa*cc - bb*bb;
  let s = denominator < 1e-10 ? 0.5 : (bb*ee - cc*dd)/denominator; let t = denominator < 1e-10 ? 0.5 : (aa*ee - bb*dd)/denominator;
  s = Math.max(0, Math.min(1, s)); t = Math.max(0, Math.min(1, t)); s = Math.max(0, Math.min(1, (bb*t-dd)/Math.max(aa,1e-10))); t = Math.max(0, Math.min(1, (bb*s+ee)/Math.max(cc,1e-10)));
  const delta = sub(add(a0,mul(u,s)), add(b0,mul(v,t))); return { distance: magnitude(delta), firstT: s, secondT: t, delta };
}

function separateCrossings(molecule: Molecule, positions: Map<AtomId, Point3D>, strength: number): void {
  const bonds = molecule.bonds().map((id) => molecule.getBond(id));
  for (let i = 0; i < bonds.length; i += 1) for (let j = i + 1; j < bonds.length; j += 1) {
    const first = bonds[i]!; const second = bonds[j]!; if ([first.source, first.target].some((atom) => atom === second.source || atom === second.target)) continue;
    const closest = segmentDistance(positions.get(first.source)!, positions.get(first.target)!, positions.get(second.source)!, positions.get(second.target)!); const minimum = 0.16;
    if (closest.distance >= minimum) continue;
    let direction = unit(closest.delta);
    if (closest.distance < 1e-7) { const firstAxis = sub(positions.get(first.target)!, positions.get(first.source)!); const secondAxis = sub(positions.get(second.target)!, positions.get(second.source)!); direction = magnitude(cross(firstAxis, secondAxis)) < 1e-7 ? perpendicular(firstAxis, i+j) : unit(cross(firstAxis, secondAxis)); }
    const shift = mul(direction, (minimum-closest.distance)*0.5*strength);
    positions.set(first.source, add(positions.get(first.source)!,mul(shift,1-closest.firstT))); positions.set(first.target, add(positions.get(first.target)!,mul(shift,closest.firstT)));
    positions.set(second.source, sub(positions.get(second.source)!,mul(shift,1-closest.secondT))); positions.set(second.target, sub(positions.get(second.target)!,mul(shift,closest.secondT)));
  }
}

function separateAtomBonds(molecule: Molecule, positions: Map<AtomId, Point3D>, strength: number): void {
  const bonds = molecule.bonds().map((id) => molecule.getBond(id));
  for (const atom of molecule.atoms()) for (const bond of bonds) {
    if (bond.source === atom || bond.target === atom) continue;
    const closest = segmentDistance(positions.get(atom)!, positions.get(atom)!, positions.get(bond.source)!, positions.get(bond.target)!);
    const minimum = COVALENT_RADIUS[molecule.getAtom(atom).element] * 0.48 + 0.06;
    if (closest.distance >= minimum) continue;
    const bondAxis = sub(positions.get(bond.target)!, positions.get(bond.source)!);
    const direction = closest.distance < 1e-7 ? perpendicular(bondAxis, atomNumber(atom)) : unit(closest.delta);
    const shift = mul(direction, (minimum - closest.distance) * 0.5 * strength);
    positions.set(atom, add(positions.get(atom)!, shift));
    positions.set(bond.source, sub(positions.get(bond.source)!, mul(shift, 1 - closest.secondT)));
    positions.set(bond.target, sub(positions.get(bond.target)!, mul(shift, closest.secondT)));
  }
}

function optimize(molecule: Molecule, positions: Map<AtomId, Point3D>): void {
  const rules = constraints(molecule); const planes = conjugatedPlanarGroups(molecule); const bonded = bondedPairs(molecule); const iterations = molecule.atomCount < 40 ? 900 : 600;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (iteration % 2 === 0) for (const rule of rules) applyDistance(positions, rule); else for (let i = rules.length-1; i >= 0; i -= 1) applyDistance(positions,rules[i]!);
    for (const plane of planes) flattenGroup(positions,plane,0.72);
    separateAtoms(molecule,positions,bonded,0.5);
    if (iteration % 3 === 0) {
      if (iteration > iterations / 2 && iteration % 6 === 0) separateAtomBonds(molecule,positions,0.2);
      separateCrossings(molecule,positions,0.65);
    }
  }
  for (let iteration = 0; iteration < 100; iteration += 1) { for (const rule of rules) applyDistance(positions,{...rule,strength:rule.strength*0.7}); for (const plane of planes) flattenGroup(positions,plane,1); }
}

function centerPositions(positions: Map<AtomId, Point3D>): void {
  if (positions.size === 0) return; let center = { x: 0, y: 0, z: 0 }; for (const point of positions.values()) center = add(center,point); center = mul(center,1/positions.size); for (const [atom,point] of positions) positions.set(atom,sub(point,center));
}

/** Deterministic constrained display conformer (not a quantum/force-field optimization). */
export function generateMoleculeGeometry(molecule: Molecule): MoleculeGeometry {
  const positions = seedPositions(molecule); optimize(molecule,positions); centerPositions(positions); return { positions };
}

function angle(a: Point3D, center: Point3D, b: Point3D): number {
  const first=sub(a,center), second=sub(b,center); return Math.acos(Math.max(-1,Math.min(1,dot(first,second)/(magnitude(first)*magnitude(second)))))*180/Math.PI;
}

/** Validate bond lengths, local geometry, conjugated planes and intersections. */
export function geometryIssues(molecule: Molecule, geometry: MoleculeGeometry): GeometryIssue[] {
  const issues: GeometryIssue[]=[]; const {positions}=geometry;
  for (const id of molecule.bonds()) { const {source,target}=molecule.getBond(id); const actual=magnitude(sub(positions.get(source)!,positions.get(target)!)); const expected=lengthOfBond(molecule,source,target); if(Math.abs(actual-expected)>0.08) issues.push({kind:'bond-length',atoms:[source,target],actual,expected}); }
  for (const center of molecule.atoms()) { const neighbors=molecule.neighbors(center); if(neighbors.length<2||molecule.getAtom(center).element==='H') continue; const expected=idealBondAngle(molecule,center); for(let i=0;i<neighbors.length;i+=1) for(let j=i+1;j<neighbors.length;j+=1){const actual=angle(positions.get(neighbors[i]!)!,positions.get(center)!,positions.get(neighbors[j]!)!); if(Math.abs(actual-expected)>(expected===180?12:20)) issues.push({kind:'bond-angle',atoms:[neighbors[i]!,center,neighbors[j]!],actual,expected});}}
  for(const group of conjugatedPlanarGroups(molecule)){const plane=bestPlane(group.map((atom)=>positions.get(atom)!)); for(const atom of group){const actual=Math.abs(dot(sub(positions.get(atom)!,plane.center),plane.normal)); if(actual>0.08) issues.push({kind:'planarity',atoms:[atom],actual,expected:0});}}
  const bonded=bondedPairs(molecule); const atoms=molecule.atoms(); for(let i=0;i<atoms.length;i+=1) for(let j=i+1;j<atoms.length;j+=1){const a=atoms[i]!,b=atoms[j]!; if(bonded.has(pairKey(a,b)))continue; const actual=magnitude(sub(positions.get(a)!,positions.get(b)!)); const expected=(COVALENT_RADIUS[molecule.getAtom(a).element]+COVALENT_RADIUS[molecule.getAtom(b).element])*0.64; if(actual<expected)issues.push({kind:'atom-overlap',atoms:[a,b],actual,expected});}
  const bonds=molecule.bonds().map((id)=>molecule.getBond(id)); for(let i=0;i<bonds.length;i+=1) for(let j=i+1;j<bonds.length;j+=1){const a=bonds[i]!,b=bonds[j]!;if([a.source,a.target].some((atom)=>atom===b.source||atom===b.target))continue;const actual=segmentDistance(positions.get(a.source)!,positions.get(a.target)!,positions.get(b.source)!,positions.get(b.target)!).distance;if(actual<0.1)issues.push({kind:'bond-crossing',atoms:[a.source,a.target,b.source,b.target],actual,expected:0.1});}
  for(const atom of atoms)for(const bond of bonds){if(bond.source===atom||bond.target===atom)continue;const actual=segmentDistance(positions.get(atom)!,positions.get(atom)!,positions.get(bond.source)!,positions.get(bond.target)!).distance;const expected=COVALENT_RADIUS[molecule.getAtom(atom).element]*0.48+0.06;if(actual<expected)issues.push({kind:'atom-bond',atoms:[atom,bond.source,bond.target],actual,expected});}
  return issues;
}
