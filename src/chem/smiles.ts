import { generateSMILES, kekulize, parseSMILES, BondType, StereoType } from 'openchem';
import type { Atom as OclAtom, Bond as OclBond, Molecule as OclMolecule } from 'openchem';
import { Molecule } from './molecule';
import type { AtomId, BondId } from './molecule';
import type { ElementSymbol, TetrahedralStereo } from './types';
import { tokenForOrder } from './tetrahedral';

/**
 * SMILES <-> game-graph conversion (roadmap step 2, identity & naming).
 *
 * Serialization delegates the string grammar and canonicalisation to the
 * `openchem` library (see docs/smiles-naming.md); the game graph stays the
 * source of truth.
 *
 * Tetrahedral stereochemistry is stored as an explicit local-chirality label
 * (`TetrahedralStereo`: the four incident bonds in an arbitrary order plus a
 * clockwise/counterclockwise winding sense). Parsing builds the label from the
 * Daylight neighbour-order rule (implicit H placement, branch order) and the
 * `@`/`@@` token; serialization derives the token directly with
 * `tokenForOrder` once it knows the order in which openchem will emit the
 * neighbours - learned deterministically from a single achiral canonical pass
 * (no search, no iteration cap). See `src/chem/tetrahedral.ts` and
 * `docs/smiles-naming.md`.
 *
 * Limitations (documented in docs/smiles-naming.md):
 * - Tetrahedral stereo on ring atoms is not supported yet (the ring-closure
 *   neighbour order is not derivable from atom order).
 * - Double-bond stereo needs exactly one non-hydrogen substituent on each end
 *   of the double bond (otherwise the game's plain cis/trans label is
 *   under-specified).
 */

// ---------------------------------------------------------------------------
// Vocabulary mapping
// ---------------------------------------------------------------------------

/** Directional single-bond token (E/Z), as openchem expects it. */
type UpDown = StereoType.UP | StereoType.DOWN;

const ATOMIC_NUMBER: Record<ElementSymbol, number> = { C: 6, H: 1, O: 8, N: 7 };
const ELEMENT_FROM_NUMBER: Record<number, ElementSymbol> = { 6: 'C', 1: 'H', 8: 'O', 7: 'N' };

function bondTypeForOrder(order: 1 | 2 | 3): OclBond['type'] {
  if (order === 1) return BondType.SINGLE;
  if (order === 2) return BondType.DOUBLE;
  return BondType.TRIPLE;
}

function orderForBondType(type: OclBond['type']): 1 | 2 | 3 {
  if (type === BondType.SINGLE) return 1;
  if (type === BondType.DOUBLE) return 2;
  if (type === BondType.TRIPLE) return 3;
  throw new Error(`parseSmiles: bond type "${type}" is not supported (only single/double/triple)`);
}

// ---------------------------------------------------------------------------
// toSmiles
// ---------------------------------------------------------------------------

export interface ToSmilesOptions {
  /** Emit canonical SMILES (unique, order-independent). Default true. */
  canonical?: boolean;
}

/**
 * Serialize a molecule to (canonical) SMILES.
 *
 * The canonical form is openchem's canonical SMILES. Tetrahedral tokens are
 * derived deterministically: an achiral canonical pass reveals the neighbour
 * order openchem will emit, `tokenForOrder` converts the stored local-chirality
 * label to that viewpoint, and the result is verified by parsing the final
 * string back.
 */
export function toSmiles(molecule: Molecule, options: ToSmilesOptions = {}): string {
  const canonical = options.canonical ?? true;

  // Only labels with a defined bond order carry a token; an unspecified label
  // (bonds omitted) means "no chirality claim" and emits nothing.
  const centres = new Map<AtomId, TetrahedralStereo>();
  for (const id of molecule.atoms()) {
    const stereo = molecule.getAtom(id).stereo;
    if (stereo === undefined || stereo.bonds === undefined) continue;
    if (isInRing(molecule, id)) {
      throw new Error('toSmiles: specified tetrahedral stereo on a ring atom is not supported yet');
    }
    centres.set(id, stereo);
  }

  const doubleBonds = new Map<BondId, 'cis' | 'trans'>();
  for (const id of molecule.bonds()) {
    const stereo = molecule.getBond(id).stereo;
    if (stereo === 'cis' || stereo === 'trans') doubleBonds.set(id, stereo);
  }

  // Canonical labels (heavy skeleton) drive both the cis-phase choice and the
  // chiral-centre matching; computed once.
  const labels = refineCanonicalLabels(molecule);
  const bondStereo = provisionalBondStereo(molecule, doubleBonds, labels);
  const centreIds = [...centres.keys()];

  if (centreIds.length === 0) {
    return generateSMILES(buildOclMolecule(molecule, new Map(), bondStereo), canonical);
  }

  // Tetrahedral tokens: learn the neighbour order openchem emits from the
  // achiral canonical string, then derive each token directly (no search, no
  // iteration cap). Matching uses global iterative refinement so regular
  // chains (where every centre looks identical locally) still match.
  const achiral = generateSMILES(buildOclMolecule(molecule, new Map(), bondStereo), canonical);
  const chiral = new Map<AtomId, '@' | '@@'>();
  for (const id of centreIds) {
    const matched = matchCentres(molecule, centreIds, achiral, labels).get(id);
    if (matched === undefined) throw new Error('toSmiles: chiral centre missing from the achiral string');
    chiral.set(id, tokenForOrder(centres.get(id)!, matched.stringBonds));
  }
  let smiles = generateSMILES(buildOclMolecule(molecule, chiral, bondStereo), canonical);

  // Verify and correct per centre. Matching is only determined up to graph
  // automorphisms (e.g. the reflection of a symmetric chain, or the end
  // centres of a chain whose terminal CH3 and side chain are swapped), so a
  // few centres may carry the wrong token on the first pass. Flipping a token
  // does not change openchem's canonical atom order, so correcting the
  // mismatched centres (re-learning the match from the current string each
  // pass) converges in one or two passes.
  const maxCorrections = 8;
  for (let pass = 0; pass < maxCorrections; pass++) {
    const matched = matchCentres(molecule, centreIds, smiles, labels);
    const flips: AtomId[] = [];
    for (const id of centreIds) {
      const m = matched.get(id);
      if (m === undefined) throw new Error('toSmiles: chiral centre missing from the generated string');
      if (tokenForOrder(centres.get(id)!, m.stringBonds) !== m.token) flips.push(id);
    }
    if (flips.length === 0) return smiles;
    for (const id of flips) chiral.set(id, chiral.get(id) === '@' ? '@@' : '@');
    smiles = generateSMILES(buildOclMolecule(molecule, chiral, bondStereo), canonical);
  }
  throw new Error('toSmiles: could not encode tetrahedral stereochemistry faithfully');
}
// ---------------------------------------------------------------------------
// parseSmiles
// ---------------------------------------------------------------------------

/**
 * Parse a SMILES string into the game's molecule graph.
 *
 * The resulting graph contains explicit hydrogens (cations keep theirs), and
 * aromatic rings are stored in kekulé form (alternating single/double bonds)
 * to match the game's current representation. Tetrahedral stereo is stored as
 * a `TetrahedralStereo` label: the four bonds in the Daylight string order,
 * with the winding sense read directly from the `@`/`@@` token, so the label
 * does not depend on canonicalisation.
 */
export function parseSmiles(smiles: string): Molecule {
  const result = parseSMILES(smiles);
  if (result.errors.length > 0 || result.molecules.length === 0) {
    const detail = result.errors.map((e) => e.message).join('; ');
    throw new Error(`parseSmiles: invalid SMILES "${smiles}"${detail.length > 0 ? `: ${detail}` : ''}`);
  }

  // openchem returns one Molecule per dot-separated component; merge them
  // into a single (possibly disconnected) game graph.
  const molecule = new Molecule();
  for (const parsed of result.molecules) addComponent(molecule, parsed, smiles);
  return molecule;
}

/** Adds one connected component (openchem Molecule) into the game graph. */
function addComponent(molecule: Molecule, parsed: OclMolecule, source: string): Map<number, AtomId> {
  let ocl = parsed;

  // The game stores aromatic rings in kekulé form (no aromatic flags).
  const hasAromatic = ocl.atoms.some((a) => a.aromatic) || ocl.bonds.some((b) => b.type === BondType.AROMATIC);
  if (hasAromatic) ocl = kekulize(ocl);

  const gameIds = new Map<number, AtomId>();
  for (const atom of ocl.atoms) {
    const element = ELEMENT_FROM_NUMBER[atom.atomicNumber];
    if (element === undefined) {
      throw new Error(`parseSmiles: element with atomic number ${atom.atomicNumber} is not in the game (only C, H, O, N)`);
    }
    gameIds.set(atom.id, molecule.addAtom(element, { formalCharge: atom.charge }));
  }

  for (const bond of ocl.bonds) {
    const sourceId = gameIds.get(bond.atom1);
    const target = gameIds.get(bond.atom2);
    if (sourceId === undefined || target === undefined) {
      throw new Error('parseSmiles: bond references an unknown atom');
    }
    molecule.addBond(sourceId, target, orderForBondType(bond.type));
  }

  // Materialise the parsed hydrogens as explicit atoms.
  for (const atom of ocl.atoms) {
    const element = ELEMENT_FROM_NUMBER[atom.atomicNumber];
    if (element === undefined || element === 'H') continue;
    const gameId = gameIds.get(atom.id);
    if (gameId === undefined) continue;
    for (let i = 0; i < atom.hydrogens; i++) {
      molecule.addBond(gameId, molecule.addAtom('H'));
    }
  }

  // Tetrahedral labels. The winding convention is fixed (the stored order
  // winds counterclockwise looking down bonds[0]), so '@' (already
  // counterclockwise) is stored as-is while '@@' (clockwise) needs an odd
  // permutation (swap two trailing bonds) to keep the convention.
  for (const atom of ocl.atoms) {
    if (atom.chiral !== '@' && atom.chiral !== '@@') continue;
    const gameId = gameIds.get(atom.id);
    if (gameId === undefined) continue;
    if (!molecule.isTetrahedralCenter(gameId)) continue;
    if (isInRing(molecule, gameId)) {
      // Ring-closure neighbour order is not derivable from atom order.
      molecule.setAtomStereo(gameId, {});
      continue;
    }
    const slots = stringOrderSlots(ocl, atom);
    if (slots.length !== 4) continue;
    const bonds = slots.map((slot) => slotToGameBondLocal(molecule, gameId, gameIds, slot));
    const order = atom.chiral === '@' ? bonds : [bonds[0], bonds[2], bonds[1], bonds[3]];
    molecule.setAtomStereo(gameId, { bonds: order as [BondId, BondId, BondId, BondId] });
  }

  // Double-bond geometry from the directional single bonds.
  for (const bond of ocl.bonds) {
    if (bond.type !== BondType.DOUBLE) continue;
    const sourceId = gameIds.get(bond.atom1);
    const target = gameIds.get(bond.atom2);
    if (sourceId === undefined || target === undefined) continue;
    const gameBond = molecule.bondBetween(sourceId, target);
    if (gameBond === undefined) continue;
    const geometry = doubleBondGeometry(ocl, bond);
    if (geometry !== undefined) molecule.setBondStereo(gameBond, geometry);
  }

  return gameIds;
}

// ---------------------------------------------------------------------------
// Graph -> openchem molecule
// ---------------------------------------------------------------------------

function buildOclMolecule(
  molecule: Molecule,
  chiral: ReadonlyMap<AtomId, '@' | '@@'>,
  bondStereo: ReadonlyMap<BondId, UpDown>,
): OclMolecule {
  const oclIndex = new Map<AtomId, number>();
  const keptH = new Map<AtomId, number>();
  const atoms: OclAtom[] = [];

  const addOclAtom = (
    element: ElementSymbol,
    charge: number,
    hydrogens: number,
    token: '@' | '@@' | null,
  ): number => {
    const id = atoms.length;
    atoms.push({
      id,
      symbol: element,
      atomicNumber: ATOMIC_NUMBER[element],
      charge,
      hydrogens,
      isotope: null,
      aromatic: false,
      chiral: token,
      isBracket: charge !== 0 || token !== null || element === 'H',
      atomClass: 0,
    });
    return id;
  };

  // Heavy atoms first. Total hydrogens = explicit H neighbours folded in +
  // implicit H still missing (needed on bracket atoms, e.g. [C@H], [NH4+]).
  for (const id of molecule.atoms()) {
    const atom = molecule.getAtom(id);
    if (atom.element === 'H') continue;
    const explicitH = molecule.neighbors(id).filter((n) => molecule.getAtom(n).element === 'H').length;
    const token = chiral.get(id) ?? null;
    oclIndex.set(id, addOclAtom(atom.element, atom.formalCharge, explicitH + molecule.implicitHydrogens(id), token));
  }

  // Hydrogens without a heavy neighbour (H2, isolated [H]) stay explicit.
  for (const id of molecule.atoms()) {
    if (molecule.getAtom(id).element !== 'H') continue;
    const heavy = molecule.neighbors(id).find((n) => molecule.getAtom(n).element !== 'H');
    if (heavy === undefined) keptH.set(id, addOclAtom('H', 0, 0, null));
  }

  const bonds: OclBond[] = [];
  for (const id of molecule.bonds()) {
    const bond = molecule.getBond(id);
    const source = oclIndex.get(bond.source) ?? keptH.get(bond.source);
    const target = oclIndex.get(bond.target) ?? keptH.get(bond.target);
    if (source === undefined || target === undefined) continue; // H folded into a heavy atom
    bonds.push({
      atom1: source,
      atom2: target,
      type: bondTypeForOrder(bond.order),
      stereo: bondStereo.get(id) ?? StereoType.NONE,
    });
  }

  return { atoms, bonds };
}

/**
 * Directional-bond assignment for double-bond geometry. Same value on both
 * sides emits trans, different values emit cis (verified against openchem:
 * up/up -> C/C=C/C, up/down -> C/C=C\C).
 */
/**
 * Directional-bond assignment for double-bond geometry.
 *
 * In a conjugated chain a single bond is shared by two double bonds, so the
 * tokens cannot be set per double bond independently (the later write would
 * corrupt the earlier one). Instead the cis/trans constraints are solved along
 * each connected component: token(second) = token(first) XOR (cis ? 1 : 0).
 * Isolated double bonds are their own component. The phase (which bond starts
 * "up") is chosen canonically (smallest canonical bond key), so a re-parsed
 * graph produces the same token pattern. Verified against openchem:
 * equal values on both sides emit trans (C/C=C/C), different emit cis
 * (C/C=C\C).
 */
function provisionalBondStereo(
  molecule: Molecule,
  doubleBonds: ReadonlyMap<BondId, 'cis' | 'trans'>,
  labels: ReadonlyMap<AtomId, string>,
): Map<BondId, UpDown> {
  interface Constraint {
    first: BondId;
    second: BondId;
    flip: boolean; // cis => tokens differ
  }
  const constraints: Constraint[] = [];
  for (const [id, geometry] of doubleBonds) {
    const bond = molecule.getBond(id);
    const [onSource, onTarget] = substituentBonds(molecule, id);
    // Canonical orientation of the constraint (not id-dependent).
    const keySource = atomKey(molecule, bond.source, labels);
    const keyTarget = atomKey(molecule, bond.target, labels);
    const [first, second] = keySource <= keyTarget ? [onSource, onTarget] : [onTarget, onSource];
    constraints.push({ first, second, flip: geometry === 'cis' });
  }

  const adjacency = new Map<BondId, { other: BondId; flip: boolean }[]>();
  for (const c of constraints) {
    pushTo(adjacency, c.first, { other: c.second, flip: c.flip });
    pushTo(adjacency, c.second, { other: c.first, flip: c.flip });
  }

  // Solve each component; start from the bond with the smallest canonical key
  // (deterministic across graph instances) with value UP.
  const value = new Map<BondId, boolean>(); // false = UP, true = DOWN
  const sortedBonds = [...adjacency.keys()].sort(
    (a, b) => canonicalBondKey(molecule, labels, a).localeCompare(canonicalBondKey(molecule, labels, b)),
  );
  for (const start of sortedBonds) {
    if (value.has(start)) continue;
    value.set(start, false);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentValue = value.get(current)!;
      for (const { other, flip } of adjacency.get(current) ?? []) {
        const expected = flip ? !currentValue : currentValue;
        const existing = value.get(other);
        if (existing === undefined) {
          value.set(other, expected);
          queue.push(other);
        } else if (existing !== expected) {
          throw new Error('toSmiles: inconsistent double-bond geometry (conjugated cycle)');
        }
      }
    }
  }

  const result = new Map<BondId, UpDown>();
  for (const [id, v] of value) result.set(id, v ? StereoType.DOWN : StereoType.UP);
  return result;
}

/** Canonical (molecule-determined) key for a bond, used to fix the E/Z phase. */
function canonicalBondKey(
  molecule: Molecule,
  labels: ReadonlyMap<AtomId, string>,
  bondId: BondId,
): string {
  const bond = molecule.getBond(bondId);
  const ka = atomKey(molecule, bond.source, labels);
  const kb = atomKey(molecule, bond.target, labels);
  return [ka, kb].sort().join('|');
}

function substituentBonds(molecule: Molecule, doubleBond: BondId): [BondId, BondId] {
  const bond = molecule.getBond(doubleBond);
  return [substituentOn(molecule, bond.source, bond.target), substituentOn(molecule, bond.target, bond.source)];
}

function substituentOn(molecule: Molecule, atom: AtomId, otherDoubleAtom: AtomId): BondId {
  const candidates = molecule.neighbors(atom).filter((n) => n !== otherDoubleAtom && molecule.getAtom(n).element !== 'H');
  if (candidates.length !== 1) {
    throw new Error(
      `toSmiles: double-bond stereo needs exactly one non-hydrogen substituent on each end ` +
        `(found ${candidates.length} on ${atom}); not supported`,
    );
  }
  const bond = molecule.bondBetween(atom, candidates[0]!);
  if (bond === undefined) throw new Error('toSmiles: missing substituent bond');
  return bond;
}

// ---------------------------------------------------------------------------
// Daylight neighbour order + label helpers
// ---------------------------------------------------------------------------

/** One of the four neighbours of a chiral centre, in Daylight string order. */
type NeighborSlot = { kind: 'atom'; oclId: number } | { kind: 'hydrogen' };

/**
 * The four neighbours of `chiral` in Daylight order (theory.smiles.html
 * §3.3.3): the "from" atom (written before the chiral atom), then the implicit
 * hydrogen (if the chiral atom is not first and has one), then the branches in
 * written order and the right-hand continuation. If the chiral atom opens the
 * string, the implicit hydrogen is the "from" atom. Returns fewer than four
 * slots if the atom is not a tetrahedral centre.
 */
function stringOrderSlots(ocl: OclMolecule, chiral: OclAtom): NeighborSlot[] {
  const heavyNeighbours: number[] = [];
  for (const bond of ocl.bonds) {
    if (bond.atom1 === chiral.id) heavyNeighbours.push(bond.atom2);
    else if (bond.atom2 === chiral.id) heavyNeighbours.push(bond.atom1);
  }
  if (heavyNeighbours.length + chiral.hydrogens !== 4) return [];

  const from = heavyNeighbours.find((n) => n < chiral.id);
  const rest = heavyNeighbours.filter((n) => n !== from).sort((a, b) => a - b);
  const slots: NeighborSlot[] = [];
  if (from !== undefined) {
    slots.push({ kind: 'atom', oclId: from });
    if (chiral.hydrogens > 0) slots.push({ kind: 'hydrogen' });
  } else if (chiral.hydrogens > 0) {
    slots.push({ kind: 'hydrogen' });
  }
  for (const n of rest) slots.push({ kind: 'atom', oclId: n });
  return slots;
}

/** Maps one slot to the corresponding bond of `centre` in the local game graph. */
function slotToGameBondLocal(
  molecule: Molecule,
  centre: AtomId,
  gameIds: ReadonlyMap<number, AtomId>,
  slot: NeighborSlot,
): BondId {
  const neighbour =
    slot.kind === 'hydrogen'
      ? molecule.neighbors(centre).find((n) => molecule.getAtom(n).element === 'H')
      : gameIds.get(slot.oclId);
  if (neighbour === undefined) {
    throw new Error('parseSmiles: chiral centre neighbour missing');
  }
  const bond = molecule.bondBetween(centre, neighbour);
  if (bond === undefined) throw new Error('parseSmiles: missing chiral centre bond');
  return bond;
}

/**
 * Parses a generated SMILES string and returns, for the given chiral centre of
 * the game graph, the four bonds in the order the neighbours appear in the
 * string (mapped back onto game bonds) plus the `@`/`@@` token openchem read
 * from that string. Used by toSmiles to learn the emitted neighbour order
 * (achiral pass) and to verify the final token.
 */
interface CentreInString {
  stringBonds: [BondId, BondId, BondId, BondId];
  token: '@' | '@@' | null;
}

/**
 * Parses a generated SMILES string once and, for every game chiral centre,
 * returns the four bonds in the order the neighbours appear in the string
 * (mapped back onto game bonds) plus the `@`/`@@` token openchem read there.
 *
 * Matching uses canonical labels from iterative refinement (see
 * `refineCanonicalLabels`): local fingerprints are identical for every centre
 * of a regular chain, so global refinement is required. Centres that are
 * automorphic (e.g. the two halves of a symmetric chain) share a label; within
 * a class they are matched in atom-id order, which is one globally consistent
 * assignment (the other, the graph automorphism itself, flips every token and
 * is corrected by `toSmiles`' verification).
 */
function matchCentres(
  molecule: Molecule,
  centres: AtomId[],
  smiles: string,
  gameLabels: ReadonlyMap<AtomId, string>,
): Map<AtomId, CentreInString> {
  const result = parseSMILES(smiles);
  if (result.errors.length > 0 || result.molecules.length === 0) {
    throw new Error(`toSmiles: could not reparse "${smiles}"`);
  }
  const gameByClass = new Map<string, AtomId[]>();
  for (const id of centres) pushTo(gameByClass, atomKey(molecule, id, gameLabels), id);

  const found = new Map<AtomId, CentreInString>();
  for (const ocl of result.molecules) {
    const temp = new Molecule();
    const oclToGame = addComponent(temp, ocl, smiles);
    const tempLabels = refineCanonicalLabels(temp);

    const tempByClass = new Map<string, AtomId[]>();
    for (const id of temp.atoms()) {
      if (temp.getAtom(id).element !== 'H') pushTo(tempByClass, atomKey(temp, id, tempLabels), id);
    }

    const matchedTemp = new Map<AtomId, AtomId>(); // game centre -> temp centre
    for (const [key, gameList] of gameByClass) {
      const tempList = (tempByClass.get(key) ?? []).sort();
      if (tempList.length !== gameList.length) {
        throw new Error('toSmiles: chiral centre class size mismatch in the generated string');
      }
      const sortedGame = [...gameList].sort();
      sortedGame.forEach((gameCentre, k) => matchedTemp.set(gameCentre, tempList[k]!));
    }

    for (const [gameCentre, tempCentre] of matchedTemp) {
      let chiralOclId: number | undefined;
      for (const [oclId, gameId] of oclToGame) {
        if (gameId === tempCentre) {
          chiralOclId = oclId;
          break;
        }
      }
      if (chiralOclId === undefined) throw new Error('toSmiles: chiral centre missing from parsed string');
      const chiralOcl = ocl.atoms.find((a) => a.id === chiralOclId);
      if (chiralOcl === undefined) throw new Error('toSmiles: chiral centre missing from parsed string');

      const slots = stringOrderSlots(ocl, chiralOcl);
      if (slots.length !== 4) {
        throw new Error('toSmiles: chiral centre is not tetrahedral in the parsed string');
      }

      const stringBonds = slots.map((slot) => {
        if (slot.kind === 'hydrogen') {
          const h = molecule.neighbors(gameCentre).find((n) => molecule.getAtom(n).element === 'H');
          if (h === undefined) throw new Error('toSmiles: expected a hydrogen neighbour on the chiral centre');
          const bond = molecule.bondBetween(gameCentre, h);
          if (bond === undefined) throw new Error('toSmiles: missing hydrogen bond');
          return bond;
        }
        const parsedNeighbour = oclToGame.get(slot.oclId);
        if (parsedNeighbour === undefined) throw new Error('toSmiles: chiral neighbour missing from parsed string');
        const neighbourKey = atomKey(temp, parsedNeighbour, tempLabels);
        const gameNeighbours = molecule
          .neighbors(gameCentre)
          .filter((n) => atomKey(molecule, n, gameLabels) === neighbourKey)
          .sort();
        if (gameNeighbours.length !== 1) {
          throw new Error(
            'toSmiles: cannot match a chiral neighbour in the generated string ' +
              '(automorphic substituents are not supported)',
          );
        }
        const bond = molecule.bondBetween(gameCentre, gameNeighbours[0]!);
        if (bond === undefined) throw new Error('toSmiles: missing chiral neighbour bond');
        return bond;
      });

      const token = chiralOcl.chiral === '@@' ? ('@@' as const) : chiralOcl.chiral === '@' ? ('@' as const) : null;
      found.set(gameCentre, {
        stringBonds: stringBonds as [BondId, BondId, BondId, BondId],
        token,
      });
    }
  }

  if (found.size !== centres.length) {
    throw new Error('toSmiles: chiral centres not found in the generated string');
  }
  return found;
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function atomKey(molecule: Molecule, id: AtomId, labels: ReadonlyMap<AtomId, string>): string {
  const a = molecule.getAtom(id);
  return `${labels.get(id) ?? ''}:${a.element}:${a.formalCharge}`;
}

/** Mix a 32-bit integer (splitmix32-style). */
function hashInt(input: number): number {
  let h = Math.imul(input ^ 0x9e3779b1, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Canonical atom ranking by Weisfeiler-Lehman / Morgan refinement with hashed
 * labels. Needed to match atoms between the game graph and a re-parsed
 * canonical string: local fingerprints are ambiguous for regular chains, where
 * every centre (and its neighbours) looks identical locally.
 *
 * Labels are 53-bit integers (two mixed 32-bit lanes), so collisions are
 * negligible even for thousands of atoms. A fixed pass count (atoms.length)
 * makes the final labels comparable across two instances of the same molecule;
 * early termination would leave each graph at a different pass with different
 * hashes.
 */
function refineCanonicalLabels(molecule: Molecule): Map<AtomId, string> {
  // Refine on the heavy-atom skeleton (ignore hydrogens) so a heavy-atom-only
  // game graph and a parsed graph with explicit hydrogens get the same labels.
  const atoms = molecule.atoms().filter((id) => molecule.getAtom(id).element !== 'H');
  const adjacency = new Map<AtomId, AtomId[]>();
  for (const id of atoms) {
    adjacency.set(
      id,
      molecule.neighbors(id).filter((n) => molecule.getAtom(n).element !== 'H'),
    );
  }

  let labels = new Map<AtomId, number>();
  for (const id of atoms) {
    const a = molecule.getAtom(id);
    labels.set(id, hashInt(a.element.charCodeAt(0) * 31 + a.formalCharge));
  }

  for (let pass = 0; pass < atoms.length; pass++) {
    const next = new Map<AtomId, number>();
    for (const id of atoms) {
      const neighbourLabels = (adjacency.get(id) ?? [])
        .map((n) => labels.get(n) ?? 0)
        .sort((x, y) => x - y);
      const previous = labels.get(id) ?? 0;
      let h1 = hashInt(previous ^ 0x1234abcd);
      let h2 = hashInt(previous ^ 0xdeadbeef);
      for (const nb of neighbourLabels) {
        h1 = hashInt(h1 ^ nb);
        h2 = hashInt(h2 ^ Math.imul(nb, 31));
      }
      // Combine two 32-bit lanes into an exact 53-bit integer.
      next.set(id, (h1 >>> 0) * 2097152 + (h2 >>> 11));
    }
    labels = next;
  }

  const result = new Map<AtomId, string>();
  for (const [id, label] of labels) result.set(id, `${label}`);
  return result;
}
// ---------------------------------------------------------------------------
// Double-bond geometry
// ---------------------------------------------------------------------------

/**
 * Double-bond geometry (cis/trans) from openchem's directional single bonds.
 * Same direction on both sides is trans, different directions is cis
 * (F/C=C/F and F\C=C\F are trans; F/C=C\F and F\C=C/F are cis).
 */
function doubleBondGeometry(ocl: OclMolecule, doubleBond: OclBond): 'cis' | 'trans' | undefined {
  const tokens: StereoType[][] = [];
  for (const end of [doubleBond.atom1, doubleBond.atom2]) {
    const other = end === doubleBond.atom1 ? doubleBond.atom2 : doubleBond.atom1;
    const endTokens: StereoType[] = [];
    for (const bond of ocl.bonds) {
      if (bond.type !== BondType.SINGLE) continue;
      if (bond.stereo !== StereoType.UP && bond.stereo !== StereoType.DOWN) continue;
      if ((bond.atom1 === end && bond.atom2 !== other) || (bond.atom2 === end && bond.atom1 !== other)) {
        endTokens.push(bond.stereo);
      }
    }
    tokens.push(endTokens);
  }
  const a = tokens[0];
  const b = tokens[1];
  if (a === undefined || b === undefined || a.length !== 1 || b.length !== 1) return undefined;
  return a[0] === b[0] ? 'trans' : 'cis';
}

// ---------------------------------------------------------------------------
// Fingerprints and small graph helpers
// ---------------------------------------------------------------------------

/** True if the atom lies on a ring (two neighbours connected without it). */
function isInRing(molecule: Molecule, atom: AtomId): boolean {
  const neighbours = molecule.neighbors(atom);
  for (let i = 0; i < neighbours.length; i++) {
    for (let j = i + 1; j < neighbours.length; j++) {
      if (connectedWithout(molecule, neighbours[i]!, neighbours[j]!, atom)) return true;
    }
  }
  return false;
}

function connectedWithout(molecule: Molecule, from: AtomId, to: AtomId, excluded: AtomId): boolean {
  const seen = new Set<AtomId>([excluded]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of molecule.neighbors(current)) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return false;
}
