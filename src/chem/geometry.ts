import { hybridizationOf } from './hybridization';
import type { AtomId, BondOrder, ElementSymbol } from './types';
import type { Molecule } from './molecule';

/** Framework-free 3D coordinate used by the chemistry and renderer layers. */
export interface Point3D {
  x: number;
  y: number;
  z: number;
}

/** A fast topology-derived conformer suitable for the interactive inspector. */
export interface MoleculeGeometry {
  positions: Map<AtomId, Point3D>;
}

const COVALENT_RADIUS: Record<ElementSymbol, number> = {
  H: 0.31,
  C: 0.76,
  N: 0.71,
  O: 0.66,
};

const TETRAHEDRAL_DIRECTIONS: readonly Point3D[] = [
  normalize({ x: 1, y: 1, z: 1 }),
  normalize({ x: 1, y: -1, z: -1 }),
  normalize({ x: -1, y: 1, z: -1 }),
  normalize({ x: -1, y: -1, z: 1 }),
];

function add(a: Point3D, b: Point3D): Point3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Point3D, factor: number): Point3D {
  return { x: v.x * factor, y: v.y * factor, z: v.z * factor };
}

function dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function length(v: Point3D): number {
  return Math.hypot(v.x, v.y, v.z);
}

function normalize(v: Point3D): Point3D {
  const magnitude = length(v);
  return magnitude < 1e-10 ? { x: 1, y: 0, z: 0 } : scale(v, 1 / magnitude);
}

/** A stable axis that is not parallel to `direction`. */
function perpendicular(direction: Point3D): Point3D {
  const reference = Math.abs(direction.z) < 0.8 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  return normalize(cross(direction, reference));
}

/** Rotate `point` by the shortest rotation that maps `from` onto `to`. */
function rotateFromTo(point: Point3D, from: Point3D, to: Point3D): Point3D {
  const source = normalize(from);
  const target = normalize(to);
  const cosine = Math.max(-1, Math.min(1, dot(source, target)));
  if (cosine > 0.999999) return point;
  if (cosine < -0.999999) {
    const axis = perpendicular(source);
    // A 180-degree Rodrigues rotation.
    return subtract(scale(axis, 2 * dot(axis, point)), point);
  }
  const axis = normalize(cross(source, target));
  const sine = Math.sqrt(1 - cosine * cosine);
  return add(
    add(scale(point, cosine), scale(cross(axis, point), sine)),
    scale(axis, dot(axis, point) * (1 - cosine)),
  );
}

/** Approximate equilibrium bond length in ångström-like display units. */
export function idealBondLength(
  first: ElementSymbol,
  second: ElementSymbol,
  order: BondOrder,
): number {
  const orderFactor = order === 1 ? 1 : order === 2 ? 0.9 : 0.82;
  return (COVALENT_RADIUS[first] + COVALENT_RADIUS[second]) * orderFactor;
}

function bondLength(molecule: Molecule, first: AtomId, second: AtomId): number {
  const bond = molecule.bondBetween(first, second);
  if (bond === undefined) return 1.4;
  return idealBondLength(
    molecule.getAtom(first).element,
    molecule.getAtom(second).element,
    molecule.getBond(bond).order,
  );
}

function regularDirections(count: number, phase: number): Point3D[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 1, y: 0, z: 0 }];
  if (count === 2) return [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }];
  if (count === 3) {
    return [0, 1, 2].map((index) => ({
      x: Math.cos(phase + (index * Math.PI * 2) / 3),
      y: Math.sin(phase + (index * Math.PI * 2) / 3),
      z: 0,
    }));
  }
  return TETRAHEDRAL_DIRECTIONS.slice(0, count);
}

/** Directions for all neighbours, respecting local tetrahedral parity. */
function neighborDirections(
  molecule: Molecule,
  atom: AtomId,
  parent: AtomId | undefined,
  positions: ReadonlyMap<AtomId, Point3D>,
): Map<AtomId, Point3D> {
  const neighbors = molecule.neighbors(atom);
  const current = positions.get(atom)!;
  const toParent = parent === undefined ? undefined : normalize(subtract(positions.get(parent)!, current));
  const stereoBonds = molecule.getAtom(atom).stereo?.bonds;
  if (stereoBonds !== undefined) {
    const parentBond = parent === undefined ? undefined : molecule.bondBetween(atom, parent);
    const parentIndex = parentBond === undefined ? -1 : stereoBonds.indexOf(parentBond);
    const rotated =
      parentIndex < 0 || toParent === undefined
        ? TETRAHEDRAL_DIRECTIONS
        : TETRAHEDRAL_DIRECTIONS.map((direction) =>
            rotateFromTo(direction, TETRAHEDRAL_DIRECTIONS[parentIndex]!, toParent),
          );
    const result = new Map<AtomId, Point3D>();
    for (const neighbor of neighbors) {
      const bond = molecule.bondBetween(atom, neighbor)!;
      const index = stereoBonds.indexOf(bond);
      result.set(neighbor, rotated[Math.max(0, index)]!);
    }
    return result;
  }

  const hybridization = hybridizationOf(molecule, atom);
  const phase = ((Number.parseInt(atom.replace(/\D/g, ''), 10) || 0) * 2.399963) % (Math.PI * 2);
  let directions: Point3D[];
  if (parent === undefined || toParent === undefined) {
    directions =
      hybridization === 'sp'
        ? regularDirections(neighbors.length, phase)
        : hybridization === 'sp2'
          ? regularDirections(neighbors.length, phase)
          : TETRAHEDRAL_DIRECTIONS.slice(0, neighbors.length);
  } else {
    const axis = perpendicular(toParent);
    const secondAxis = normalize(cross(toParent, axis));
    const children = neighbors.length - 1;
    const childDirections: Point3D[] = [];
    if (hybridization === 'sp') {
      childDirections.push(scale(toParent, -1));
    } else if (hybridization === 'sp2') {
      for (let index = 0; index < children; index += 1) {
        const sign = index % 2 === 0 ? 1 : -1;
        childDirections.push(
          normalize(add(scale(toParent, -0.5), scale(axis, sign * Math.sqrt(3) / 2))),
        );
      }
    } else {
      for (let index = 0; index < children; index += 1) {
        const angle = phase + (index * Math.PI * 2) / Math.max(1, children);
        const radial = add(scale(axis, Math.cos(angle)), scale(secondAxis, Math.sin(angle)));
        childDirections.push(
          normalize(add(scale(toParent, -1 / 3), scale(radial, (2 * Math.sqrt(2)) / 3))),
        );
      }
    }
    directions = [toParent, ...childDirections];
  }

  const result = new Map<AtomId, Point3D>();
  let childIndex = parent === undefined ? 0 : 1;
  for (const neighbor of neighbors) {
    if (neighbor === parent && toParent !== undefined) result.set(neighbor, toParent);
    else result.set(neighbor, directions[childIndex++] ?? regularDirections(1, phase)[0]!);
  }
  orientDoubleBondSubstituents(molecule, atom, parent, positions, result);
  return result;
}

/** Honor the stored cis/trans side relation while placing the second alkene end. */
function orientDoubleBondSubstituents(
  molecule: Molecule,
  atom: AtomId,
  parent: AtomId | undefined,
  positions: ReadonlyMap<AtomId, Point3D>,
  directions: Map<AtomId, Point3D>,
): void {
  if (parent === undefined) return;
  const doubleBond = molecule.bondBetween(atom, parent);
  if (doubleBond === undefined) return;
  const stereo = molecule.getBond(doubleBond).stereo;
  if (stereo !== 'cis' && stereo !== 'trans') return;
  const atomSubstituent = molecule
    .neighbors(atom)
    .find((neighbor) => neighbor !== parent && molecule.getAtom(neighbor).element !== 'H');
  const parentSubstituent = molecule
    .neighbors(parent)
    .find((neighbor) => neighbor !== atom && molecule.getAtom(neighbor).element !== 'H');
  if (atomSubstituent === undefined || parentSubstituent === undefined) return;
  const atomPosition = positions.get(atom);
  const parentPosition = positions.get(parent);
  const parentSubstituentPosition = positions.get(parentSubstituent);
  if (atomPosition === undefined || parentPosition === undefined || parentSubstituentPosition === undefined) return;

  const axis = normalize(subtract(atomPosition, parentPosition));
  const parentSideRaw = subtract(parentSubstituentPosition, parentPosition);
  const parentSide = subtract(parentSideRaw, scale(axis, dot(parentSideRaw, axis)));
  const atomDirection = directions.get(atomSubstituent)!;
  const atomSide = subtract(atomDirection, scale(axis, dot(atomDirection, axis)));
  const currentlySameSide = dot(parentSide, atomSide) > 0;
  const shouldBeSameSide = stereo === 'cis';
  if (currentlySameSide === shouldBeSameSide) return;

  // Reflect every substituent direction across the double-bond axis. This
  // flips its side without changing the angle to the C=C bond.
  for (const neighbor of molecule.neighbors(atom)) {
    if (neighbor === parent) continue;
    const direction = directions.get(neighbor)!;
    directions.set(neighbor, subtract(scale(axis, 2 * dot(direction, axis)), direction));
  }
}

function componentRoots(molecule: Molecule): AtomId[] {
  const unseen = new Set(molecule.atoms());
  const roots: AtomId[] = [];
  while (unseen.size > 0) {
    const component: AtomId[] = [];
    const start = unseen.values().next().value as AtomId;
    const queue = [start];
    unseen.delete(start);
    for (let index = 0; index < queue.length; index += 1) {
      const atom = queue[index]!;
      component.push(atom);
      for (const neighbor of molecule.neighbors(atom)) {
        if (unseen.delete(neighbor)) queue.push(neighbor);
      }
    }
    component.sort((a, b) => {
      const aStereo = molecule.getAtom(a).stereo?.bonds === undefined ? 0 : 1;
      const bStereo = molecule.getAtom(b).stereo?.bonds === undefined ? 0 : 1;
      const aHeavy = molecule.getAtom(a).element === 'H' ? 0 : 1;
      const bHeavy = molecule.getAtom(b).element === 'H' ? 0 : 1;
      return bStereo - aStereo || bHeavy - aHeavy || molecule.neighborCount(b) - molecule.neighborCount(a) || a.localeCompare(b);
    });
    roots.push(component[0]!);
  }
  return roots;
}

function initializePositions(molecule: Molecule): Map<AtomId, Point3D> {
  const positions = new Map<AtomId, Point3D>();
  const visited = new Set<AtomId>();
  componentRoots(molecule).forEach((root, componentIndex) => {
    positions.set(root, { x: componentIndex * 4, y: 0, z: 0 });
    visited.add(root);
    const queue: Array<{ atom: AtomId; parent?: AtomId }> = [{ atom: root }];
    for (let index = 0; index < queue.length; index += 1) {
      const { atom, parent } = queue[index]!;
      const directions = neighborDirections(molecule, atom, parent, positions);
      for (const neighbor of molecule.neighbors(atom)) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        const direction = directions.get(neighbor)!;
        positions.set(
          neighbor,
          add(positions.get(atom)!, scale(direction, bondLength(molecule, atom, neighbor))),
        );
        queue.push({ atom: neighbor, parent: atom });
      }
    }
  });
  return positions;
}

function targetAngleCosine(molecule: Molecule, atom: AtomId): number {
  const hybridization = hybridizationOf(molecule, atom);
  if (hybridization === 'sp') return -1;
  if (hybridization === 'sp2') return -0.5;
  return -1 / 3;
}

function relax(molecule: Molecule, positions: Map<AtomId, Point3D>): void {
  const atoms = molecule.atoms();
  const iterations = atoms.length <= 60 ? 180 : atoms.length <= 150 ? 80 : 30;
  const bonded = new Set<string>();
  for (const bond of molecule.bonds()) {
    const { source, target } = molecule.getBond(bond);
    bonded.add(source < target ? `${source}|${target}` : `${target}|${source}`);
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = new Map(atoms.map((atom) => [atom, { x: 0, y: 0, z: 0 }]));
    const applyPairSpring = (first: AtomId, second: AtomId, target: number, strength: number) => {
      const delta = subtract(positions.get(second)!, positions.get(first)!);
      const distance = Math.max(1e-5, length(delta));
      const force = scale(delta, (strength * (distance - target)) / distance);
      forces.set(first, add(forces.get(first)!, force));
      forces.set(second, subtract(forces.get(second)!, force));
    };

    for (const bond of molecule.bonds()) {
      const { source, target } = molecule.getBond(bond);
      applyPairSpring(source, target, bondLength(molecule, source, target), 0.28);
    }

    // Neighbor-neighbor springs impose the ideal sp/sp2/sp3 bond angle while
    // leaving the molecule free to rotate as a whole.
    for (const center of atoms) {
      const neighbors = molecule.neighbors(center);
      const cosine = targetAngleCosine(molecule, center);
      for (let first = 0; first < neighbors.length; first += 1) {
        for (let second = first + 1; second < neighbors.length; second += 1) {
          const a = neighbors[first]!;
          const b = neighbors[second]!;
          const firstLength = bondLength(molecule, center, a);
          const secondLength = bondLength(molecule, center, b);
          const target = Math.sqrt(
            firstLength * firstLength + secondLength * secondLength - 2 * firstLength * secondLength * cosine,
          );
          applyPairSpring(a, b, target, 0.055);
        }
      }
    }

    for (let first = 0; first < atoms.length; first += 1) {
      for (let second = first + 1; second < atoms.length; second += 1) {
        const a = atoms[first]!;
        const b = atoms[second]!;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (bonded.has(key)) continue;
        const delta = subtract(positions.get(b)!, positions.get(a)!);
        const distance = Math.max(0.08, length(delta));
        const minimum = (COVALENT_RADIUS[molecule.getAtom(a).element] + COVALENT_RADIUS[molecule.getAtom(b).element]) * 0.72;
        const strength = distance < minimum ? 0.06 * (minimum - distance) : 0.004 / (distance * distance);
        const force = scale(delta, strength / distance);
        forces.set(a, subtract(forces.get(a)!, force));
        forces.set(b, add(forces.get(b)!, force));
      }
    }

    const step = 0.12 * (1 - iteration / iterations) + 0.015;
    for (const atom of atoms) {
      const force = forces.get(atom)!;
      const magnitude = length(force);
      const bounded = magnitude > 0.3 ? scale(force, 0.3 / magnitude) : force;
      positions.set(atom, add(positions.get(atom)!, scale(bounded, step)));
    }
  }
}

function centerPositions(positions: Map<AtomId, Point3D>): void {
  if (positions.size === 0) return;
  let center = { x: 0, y: 0, z: 0 };
  for (const point of positions.values()) center = add(center, point);
  center = scale(center, 1 / positions.size);
  for (const [atom, point] of positions) positions.set(atom, subtract(point, center));
}

/**
 * Generate a deterministic, inexpensive 3D conformer from graph topology.
 *
 * The initializer observes sp/sp2/sp3 local geometry, stored tetrahedral
 * parity, and cis/trans double-bond geometry. A bounded spring relaxation
 * closes rings, restores bond lengths and prevents non-bonded overlap. It is
 * intentionally a display conformer, not a quantum or force-field geometry
 * optimization.
 */
export function generateMoleculeGeometry(molecule: Molecule): MoleculeGeometry {
  const positions = initializePositions(molecule);
  relax(molecule, positions);
  centerPositions(positions);
  return { positions };
}
