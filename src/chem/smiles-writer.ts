import type { Molecule } from './molecule';
import type { AtomId, BondId } from './molecule';
import type { TetrahedralStereo } from './types';
import { tokenForOrder } from './tetrahedral';

/**
 * Custom SMILES writer (game graph -> SMILES string).
 *
 * RDKit.js has no graph->SMILES constructor, so the game serializes its own
 * graph into a *valid* (not necessarily canonical) SMILES with stereo tokens
 * and lets RDKit canonicalize it (`toSmiles` in `src/chem/smiles.ts`).
 *
 * The writer emits bracket atoms with explicit hydrogen counts and charges
 * (`[CH3]`, `[NH4+]`, `[O-]`) so every atom is unambiguous, folds implicit
 * hydrogens into those counts, uses ring-closure digits for non-tree bonds,
 * and encodes stereochemistry the way RDKit reads it:
 * - tetrahedral centres as `@`/`@@` inside the bracket, derived from the
 *   stored local-chirality label and the order its neighbours appear in this
 *   string (`tokenForOrder`). The neighbour order follows Daylight's rule:
 *   the atom the centre is reached from, any implicit hydrogen, the ring-
 *   closure neighbours in the order their digits appear on the chiral atom
 *   (right after the bracket), then branches in written order and finally
 *   the continuation. This also covers ring chiral centres (e.g. proline,
 *   cholesterol), so the game round-trips them like acyclic ones.
 * - double-bond geometry as `/` / `\` directional single bonds, derived from
 *   the stored cis-reference pair without ranking substituent groups.
 */

/** Nodes to emit: heavy atoms plus hydrogens with no heavy neighbour (H2). */
function emittableAtoms(molecule: Molecule): AtomId[] {
  return molecule
    .atoms()
    .filter((id) => {
      const element = molecule.getAtom(id).element;
      if (element === 'H') {
        return molecule.neighbors(id).every((n) => molecule.getAtom(n).element === 'H');
      }
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

/** Deterministic neighbour order for the DFS (heavy first, then by id). */
function neighborKey(molecule: Molecule, id: AtomId): string {
  const element = molecule.getAtom(id).element;
  return `${element === 'H' ? '1' : '0'}:${element}:${id}`;
}

function ringToken(ringNumber: number): string {
  return ringNumber <= 9 ? `${ringNumber}` : `%${ringNumber}`;
}

function chargeSuffix(charge: number): string {
  if (charge === 0) return '';
  if (charge === 1) return '+';
  if (charge === -1) return '-';
  return charge > 0 ? `+${charge}` : `${charge}`;
}

/**
 * A writable non-hydrogen substituent bond at one double-bond endpoint.
 * Substituted alkenes may have two choices; either is valid because tuple
 * membership determines its relation to the choice made at the other end.
 */
function writableSubstituentOn(
  molecule: Molecule,
  atom: AtomId,
  doubleBond: BondId,
  parent: ReadonlyMap<AtomId, AtomId | undefined>,
): BondId {
  const candidates = molecule.bondsOf(atom).filter((bondId) => {
    if (bondId === doubleBond || !isTreeEdge(molecule, bondId, parent)) return false;
    const bond = molecule.getBond(bondId);
    const other = bond.source === atom ? bond.target : bond.source;
    return molecule.getAtom(other).element !== 'H';
  });
  if (candidates.length === 0) {
    throw new Error(
      `smiles writer: double-bond stereo needs a writable non-hydrogen substituent on ${atom}`,
    );
  }
  return candidates.sort((a, b) => a.localeCompare(b))[0]!;
}

/**
 * One ring-closure digit on an atom: the bond it closes and the digit token
 * as written after the atom (e.g. `1`, `=2`, `%13`).
 */
interface RingClosure {
  bond: BondId;
  token: string;
}

/**
 * Builds the DFS tree (parents/children/ring digits) used by the emitter.
 * Hydrogens attached to a heavy atom are folded into the bracket H count and
 * never become tree nodes; hydrogens without a heavy neighbour (H2, [H]) do.
 */
function buildTree(molecule: Molecule): {
  parent: Map<AtomId, AtomId | undefined>;
  children: Map<AtomId, AtomId[]>;
  ringDigits: Map<AtomId, RingClosure[]>;
} {
  const parent = new Map<AtomId, AtomId | undefined>();
  const children = new Map<AtomId, AtomId[]>();
  const ringDigits = new Map<AtomId, RingClosure[]>();
  const ringBonds = new Map<BondId, number>();
  let nextRing = 1;

  const visited = new Set<AtomId>();
  const dfs = (u: AtomId, p: AtomId | undefined): void => {
    visited.add(u);
    parent.set(u, p);
    const kids: AtomId[] = [];
    children.set(u, kids);
    for (const v of molecule.neighbors(u).sort((a, b) => neighborKey(molecule, a).localeCompare(neighborKey(molecule, b)))) {
      if (v === p) continue;
      if (molecule.getAtom(v).element === 'H' && molecule.getAtom(u).element !== 'H') continue; // folded
      if (!visited.has(v)) {
        kids.push(v);
        dfs(v, u);
      } else if (!ringBonds.has(molecule.bondBetween(u, v)!)) {
        // Back edge closing a ring; the later-visited atom carries the bond
        // symbol (for double/triple ring bonds), both atoms carry the digit.
        const bond = molecule.bondBetween(u, v)!;
        const number = nextRing++;
        ringBonds.set(bond, number);
        const symbol = bondSymbol(molecule.getBond(bond).order);
        pushRing(ringDigits, u, { bond, token: symbol + ringToken(number) });
        pushRing(ringDigits, v, { bond, token: ringToken(number) });
      }
    }
  };

  const nodes = emittableAtoms(molecule);
  const chiral = new Set<AtomId>(
    nodes.filter((id) => molecule.getAtom(id).stereo !== undefined),
  );
  const roots = [...nodes].sort((a, b) => {
    const aChiral = chiral.has(a) ? 1 : 0;
    const bChiral = chiral.has(b) ? 1 : 0;
    return aChiral - bChiral || a.localeCompare(b);
  });
  for (const root of roots) {
    if (!visited.has(root)) dfs(root, undefined);
  }
  return { parent, children, ringDigits };
}

function pushRing(ringDigits: Map<AtomId, RingClosure[]>, atom: AtomId, closure: RingClosure): void {
  const list = ringDigits.get(atom);
  if (list === undefined) ringDigits.set(atom, [closure]);
  else list.push(closure);
}

function bondSymbol(order: number): string {
  if (order === 2) return '=';
  if (order === 3) return '#';
  return '';
}

/** +1 when a tree bond is emitted away from the endpoint, -1 when toward it. */
function emissionOrientation(
  molecule: Molecule,
  bondId: BondId,
  endpoint: AtomId,
  parent: ReadonlyMap<AtomId, AtomId | undefined>,
): 1 | -1 {
  const bond = molecule.getBond(bondId);
  const emittedFrom = parent.get(bond.target) === bond.source ? bond.source
    : parent.get(bond.source) === bond.target ? bond.target
      : undefined;
  if (emittedFrom === undefined) throw new Error('smiles writer: stereo reference is not a tree bond');
  return emittedFrom === endpoint ? 1 : -1;
}

/** Directional single-bond tokens around stereo double bonds. */
function ezTokens(
  molecule: Molecule,
  parent: ReadonlyMap<AtomId, AtomId | undefined>,
): Map<BondId, '/' | '\\'> {
  // Each edge says sign(other) = factor * sign(this), where slash is +1.
  const constraints = new Map<BondId, Array<{ other: BondId; factor: 1 | -1 }>>();
  const connect = (first: BondId, second: BondId, factor: 1 | -1): void => {
    const a = constraints.get(first) ?? [];
    a.push({ other: second, factor });
    constraints.set(first, a);
    const b = constraints.get(second) ?? [];
    b.push({ other: first, factor });
    constraints.set(second, b);
  };
  for (const id of molecule.bonds()) {
    const bond = molecule.getBond(id);
    if (bond.order !== 2 || bond.stereo === undefined) continue;
    const first = writableSubstituentOn(molecule, bond.source, id, parent);
    const second = writableSubstituentOn(molecule, bond.target, id, parent);
    const cis = bond.stereo.includes(first) === bond.stereo.includes(second);
    const firstOrientation = emissionOrientation(molecule, first, bond.source, parent);
    const secondOrientation = emissionOrientation(molecule, second, bond.target, parent);
    const factor = ((cis ? 1 : -1) * firstOrientation * secondOrientation) as 1 | -1;
    connect(first, second, factor);
  }

  const signs = new Map<BondId, 1 | -1>();
  for (const root of constraints.keys()) {
    if (signs.has(root)) continue;
    signs.set(root, 1);
    const queue = [root];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]!;
      for (const { other, factor } of constraints.get(current) ?? []) {
        const expected = (signs.get(current)! * factor) as 1 | -1;
        const existing = signs.get(other);
        if (existing !== undefined && existing !== expected) {
          throw new Error('smiles writer: inconsistent double-bond stereo constraints');
        }
        if (existing === undefined) {
          signs.set(other, expected);
          queue.push(other);
        }
      }
    }
  }

  const tokens = new Map<BondId, '/' | '\\'>();
  for (const [bond, sign] of signs) tokens.set(bond, sign === 1 ? '/' : '\\');
  return tokens;
}

/**
 * The string-order of the four neighbours of a chiral centre, as they appear
 * in this writer's output: [from, (H), ...ring closures in digit order,
 * ...branches, continuation] - the Daylight neighbour-order rule. The
 * ring-closure neighbours are placed where their digits appear on the chiral
 * atom: immediately after the bracket (and any implicit H), before the
 * branches and the continuation.
 */
function stringBondsFor(
  molecule: Molecule,
  centre: AtomId,
  parent: AtomId | undefined,
  children: readonly AtomId[],
  ringClosures: readonly RingClosure[],
): [BondId, BondId, BondId, BondId] {
  const order: BondId[] = [];
  if (parent !== undefined) {
    const from = molecule.bondBetween(centre, parent);
    if (from === undefined) throw new Error('smiles writer: missing parent bond for chiral centre');
    order.push(from);
  }
  // The implicit-H slot: the centre's explicit H bond (folded into the
  // bracket). A root centre with an H uses that bond as the "from" instead.
  const hydrogenBond = molecule
    .neighbors(centre)
    .filter((n) => molecule.getAtom(n).element === 'H')
    .map((n) => molecule.bondBetween(centre, n)!)[0];
  if (parent === undefined) {
    if (hydrogenBond === undefined) {
      throw new Error('smiles writer: a chiral centre cannot open the string without an implicit hydrogen');
    }
    order.push(hydrogenBond);
  } else if (hydrogenBond !== undefined) {
    order.push(hydrogenBond);
  }
  // Ring-closure neighbours in the order their digits appear on the centre
  // (the digit suffix of the bracket, so they come right after the H).
  for (const closure of ringClosures) {
    order.push(closure.bond);
  }
  // Branches (parenthesised children) in written order, then the continuation
  // (the first child, written inline).
  for (const child of children.slice(1)) {
    const bond = molecule.bondBetween(centre, child);
    if (bond === undefined) throw new Error('smiles writer: missing branch bond for chiral centre');
    order.push(bond);
  }
  const continuation = children[0];
  if (continuation !== undefined) {
    const bond = molecule.bondBetween(centre, continuation);
    if (bond === undefined) throw new Error('smiles writer: missing continuation bond for chiral centre');
    order.push(bond);
  }
  if (order.length !== 4) {
    throw new Error(
      `smiles writer: chiral centre ${centre} has ${order.length} string-ordered neighbours, expected 4`,
    );
  }
  return order as [BondId, BondId, BondId, BondId];
}

function atomToken(
  molecule: Molecule,
  atom: AtomId,
  parent: AtomId | undefined,
  children: readonly AtomId[],
  ringDigits: readonly RingClosure[],
): string {
  const view = molecule.getAtom(atom);
  if (view.element === 'H') return '[H]';

  const explicitH = molecule.neighbors(atom).filter((n) => molecule.getAtom(n).element === 'H').length;
  const hydrogenCount = explicitH + molecule.implicitHydrogens(atom);

  let token = '';
  const stereo = view.stereo;
  if (stereo !== undefined) {
    const stringBonds = stringBondsFor(molecule, atom, parent, children, ringDigits);
    token = tokenForOrder(stereo, stringBonds);
  }

  const ringSuffix = ringDigits.map((closure) => closure.token).join('');
  return (
    `[${view.element}${token}${hydrogenCount > 0 ? 'H' + (hydrogenCount === 1 ? '' : hydrogenCount) : ''}` +
    `${chargeSuffix(view.formalCharge)}]${ringSuffix}`
  );
}

/**
 * Serialize the game graph to a valid SMILES string (stereo-correct; not
 * necessarily canonical - canonicalization is RDKit's job in `toSmiles`).
 */
export function smilesFromMolecule(molecule: Molecule): string {
  const { parent, children, ringDigits } = buildTree(molecule);
  const tokens = ezTokens(molecule, parent);

  const roots = emittableAtoms(molecule).filter((id) => parent.get(id) === undefined);
  const components: string[] = [];
  for (const root of roots) {
    const chunks: string[] = [];
    const walk = (u: AtomId): void => {
      const p = parent.get(u);
      const kids = children.get(u) ?? [];
      chunks.push(atomToken(molecule, u, p, kids, ringDigits.get(u) ?? []));
      // Branches (parenthesised) come first, then the continuation written
      // inline - so a branch attaches to this atom, not to whatever follows.
      for (const child of kids.slice(1)) {
        chunks.push('(');
        chunks.push(treeBondSymbol(molecule, u, child, tokens));
        walk(child);
        chunks.push(')');
      }
      if (kids.length > 0) {
        chunks.push(treeBondSymbol(molecule, u, kids[0]!, tokens));
        walk(kids[0]!);
      }
    };
    walk(root);
    components.push(chunks.join(''));
  }
  return components.join('.');
}

function isTreeEdge(
  molecule: Molecule,
  bond: BondId,
  parent: ReadonlyMap<AtomId, AtomId | undefined>,
): boolean {
  const view = molecule.getBond(bond);
  return parent.get(view.source) === view.target || parent.get(view.target) === view.source;
}

function treeBondSymbol(
  molecule: Molecule,
  u: AtomId,
  v: AtomId,
  ez: Map<BondId, '/' | '\\'>,
): string {
  const bond = molecule.bondBetween(u, v);
  if (bond === undefined) throw new Error('smiles writer: missing bond between tree neighbours');
  const directional = ez.get(bond);
  if (directional !== undefined) return directional;
  return bondSymbol(molecule.getBond(bond).order);
}
