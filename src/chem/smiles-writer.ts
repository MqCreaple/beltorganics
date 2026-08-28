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
 * - double-bond geometry as `/` / `\` directional single bonds (equal tokens
 *   on both sides = trans, different = cis, matching RDKit).
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
 * One non-hydrogen substituent bond of a double-bond atom (the bond to the
 * single non-H neighbour other than the other double-bond atom). The game's
 * plain cis/trans label requires exactly one per end.
 */
function substituentOn(molecule: Molecule, atom: AtomId, otherDoubleAtom: AtomId): BondId {
  const candidates = molecule
    .neighbors(atom)
    .filter((n) => n !== otherDoubleAtom && molecule.getAtom(n).element !== 'H');
  if (candidates.length !== 1) {
    throw new Error(
      `smiles writer: double-bond stereo needs exactly one non-hydrogen substituent on each end ` +
        `(found ${candidates.length} on ${atom}); not supported`,
    );
  }
  const bond = molecule.bondBetween(atom, candidates[0]!);
  if (bond === undefined) throw new Error('smiles writer: missing substituent bond');
  return bond;
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
    nodes.filter((id) => molecule.getAtom(id).stereo?.bonds !== undefined),
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

/** Directional single-bond tokens around stereo double bonds. */
function ezTokens(molecule: Molecule): Map<BondId, '/' | '\\'> {
  const tokens = new Map<BondId, '/' | '\\'>();
  for (const id of molecule.bonds()) {
    const bond = molecule.getBond(id);
    if (bond.order !== 2 || (bond.stereo !== 'cis' && bond.stereo !== 'trans')) continue;
    const first = substituentOn(molecule, bond.source, bond.target);
    const second = substituentOn(molecule, bond.target, bond.source);
    if (bond.stereo === 'trans') {
      tokens.set(first, '/');
      tokens.set(second, '/');
    } else {
      // Different tokens on the two sides => cis (C/C=C\C).
      tokens.set(first, '/');
      tokens.set(second, '\\');
    }
  }
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
  if (stereo !== undefined && stereo.bonds !== undefined) {
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
  const tokens = ezTokens(molecule);

  // Reject E/Z whose substituent bond is a ring closure (not representable
  // with this writer's directional-bond tokens).
  for (const bond of tokens.keys()) {
    if (!isTreeEdge(molecule, bond, parent)) {
      throw new Error('smiles writer: double-bond stereo on a ring substituent is not supported yet');
    }
  }

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
  parent: Map<AtomId, AtomId | undefined>,
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
