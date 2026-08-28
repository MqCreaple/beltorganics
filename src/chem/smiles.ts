import { Molecule } from './molecule';
import type { AtomId, BondId } from './molecule';
import type { ElementSymbol, TetrahedralStereo } from './types';
import { smilesFromMolecule } from './smiles-writer';
import { getRdkitModule } from './rdkit';
import type { RDKitModule } from './rdkit';

/**
 * SMILES <-> game-graph conversion (roadmap step 2, identity & naming),
 * backed by RDKit.js (see docs/smiles-naming.md).
 *
 * - `parseSmiles` asks RDKit for the molecule, reads its JSON representation
 *   (atoms with element/charge/implicit-H, bonds with order and stereo, atom
 *   stereo 'cw'/'ccw', bond stereo 'cis'/'trans') and builds the game graph
 *   from it. Implicit hydrogens are materialised as explicit atoms, matching
 *   the game's convention.
 * - `toSmiles` serializes the game graph with the game's own SMILES writer
 *   (stereo tokens included) and lets RDKit canonicalize it
 *   (`Molecule.getRdkitMolecule().get_smiles()`).
 *
 * The canonical flavour is RDKit's (ethanol `CCO`), matching the player docs.
 */

const ELEMENT_FROM_NUMBER: Record<number, ElementSymbol> = { 6: 'C', 1: 'H', 8: 'O', 7: 'N' };

export interface ToSmilesOptions {
  /** Emit canonical SMILES (unique, order-independent). Default true. */
  canonical?: boolean;
}

/**
 * Serialize a molecule to (canonical) SMILES.
 *
 * The canonical form is RDKit's canonical SMILES. When `canonical` is false,
 * the game's own serialization is returned (valid, but not canonical).
 */
export function toSmiles(molecule: Molecule, options: ToSmilesOptions = {}): string {
  const canonical = options.canonical ?? true;
  if (!canonical) return smilesFromMolecule(molecule);
  return molecule.getRdkitMolecule().get_smiles();
}

/** RDKit's molecule JSON (the subset the game reads). */
interface RdkitJsonAtom {
  z?: number;
  impHs?: number;
  chg?: number;
  stereo?: string;
}
interface RdkitJsonBond {
  atoms: [number, number];
  bo?: number;
  stereo?: string;
  stereoAtoms?: number[];
}
/** The `rdkitRepresentation` extension: canonical CIP data per atom. */
interface RdkitJsonExtension {
  name?: string;
  /** CIP priority rank per local atom index (higher = higher priority). */
  cipRanks?: number[];
  /** Canonical CIP labels as [local atom index, "(R)"|"(S)"]. */
  cipCodes?: Array<[number, string]>;
}
interface RdkitJson {
  molecules: Array<{
    atoms: RdkitJsonAtom[];
    bonds: RdkitJsonBond[];
    extensions?: RdkitJsonExtension[];
  }>;
}

/**
 * Parse a SMILES string into the game's molecule graph.
 *
 * The resulting graph contains explicit hydrogens (materialised from RDKit's
 * implicit-H counts), aromatic rings in kekulé form (alternating single/double
 * bonds, as RDKit's JSON reports them), tetrahedral stereo as a
 * `TetrahedralStereo` local-chirality label derived from RDKit's canonical
 * CIP sense ('R'/'S' plus per-atom CIP ranks, from the JSON's
 * `rdkitRepresentation` extension) - a representation-independent reference,
 * so ring chiral centres (proline, cholesterol, morphine, ...) round-trip
 * without a second parse - and double-bond geometry as plain 'cis'/'trans'
 * labels.
 *
 * Requires `initRdkit()` to have been awaited first.
 */
export function parseSmiles(smiles: string): Molecule {
  const RDKit = getRdkitModule();
  let mol: ReturnType<RDKitModule['get_mol']> = null;
  try {
    mol = RDKit.get_mol(smiles);
  } catch {
    mol = null;
  }
  if (mol === null) {
    throw new Error(`parseSmiles: invalid SMILES "${smiles}"`);
  }
  let json: string;
  try {
    json = mol.get_json();
  } catch {
    throw new Error(`parseSmiles: invalid SMILES "${smiles}"`);
  }
  try {
    const parsed = JSON.parse(json) as RdkitJson;
    const molecule = new Molecule();
    let offset = 0;
    for (const data of parsed.molecules) {
      if (data.atoms.length === 0) continue;
      addJsonMolecule(molecule, data, offset, smiles);
      offset += data.atoms.length;
    }
    if (molecule.atomCount === 0) {
      throw new Error(`parseSmiles: invalid SMILES "${smiles}"`);
    }
    return molecule;
  } finally {
    try {
      mol.delete();
    } catch {
      // The engine may have already freed the handle (e.g. invalid input).
    }
  }
}

/** Adds one RDKit JSON molecule (component set) into the game graph. */
function addJsonMolecule(
  molecule: Molecule,
  data: RdkitJson['molecules'][number],
  offset: number,
  source: string,
): void {
  const gameByJson = new Map<number, AtomId>();
  const jsonByGame = new Map<AtomId, number>();

  // Atoms in JSON order (heavy + any explicit H, e.g. [H][H]); the JSON folds
  // most hydrogens into the heavy atom's impHs count.
  for (const [localIdx, atom] of data.atoms.entries()) {
    const idx = localIdx + offset;
    const z = atom.z ?? 6;
    const element = ELEMENT_FROM_NUMBER[z];
    if (element === undefined) {
      throw new Error(`parseSmiles: element with atomic number ${z} is not in the game (only C, H, O, N)`);
    }
    const id = molecule.addAtom(element, { formalCharge: atom.chg ?? 0 });
    gameByJson.set(idx, id);
    jsonByGame.set(id, idx);
  }

  for (const bond of data.bonds) {
    const a = gameByJson.get(bond.atoms[0] + offset);
    const b = gameByJson.get(bond.atoms[1] + offset);
    if (a === undefined || b === undefined) {
      throw new Error(`parseSmiles: bond references an unknown atom in "${source}"`);
    }
    molecule.addBond(a, b, bondOrder(bond.bo ?? 1, source));
  }

  // Materialise the parsed implicit hydrogens as explicit atoms.
  for (const [localIdx, atom] of data.atoms.entries()) {
    const idx = localIdx + offset;
    const gameId = gameByJson.get(idx);
    if (gameId === undefined) continue;
    const z = atom.z ?? 6;
    if (ELEMENT_FROM_NUMBER[z] === 'H') continue; // explicit H entries stay as-is
    for (let i = 0; i < (atom.impHs ?? 0); i++) {
      molecule.addBond(gameId, molecule.addAtom('H'));
    }
  }

  // Tetrahedral labels.
  //
  // RDKit's JSON 'cw'/'ccw' sense is relative to the *input string's*
  // neighbour order, so it is not a canonical descriptor (the same
  // enantiomer can parse to either sense). The canonical CIP data in the
  // JSON's `rdkitRepresentation` extension is representation-independent:
  // `cipCodes` gives the R/S sense and `cipRanks` the CIP priority of every
  // atom (higher = higher priority). Ordering a centre's four neighbours by
  // CIP priority (implicit H last) yields a canonical reference order, so a
  // fixed mapping from R/S to the local label is correct for every centre,
  // ring chiral centres (proline, cholesterol, morphine, ...) included - no
  // second pass is needed. Centres without CIP data fall back to the old
  // 'cw'/'ccw' heuristic (works for acyclic centres).
  const extension = data.extensions?.find((e) => e.cipRanks !== undefined || e.cipCodes !== undefined);
  const cipRanks = extension?.cipRanks;
  const cipCodes = new Map(extension?.cipCodes ?? []);
  for (const [localIdx, atom] of data.atoms.entries()) {
    if (atom.stereo !== 'cw' && atom.stereo !== 'ccw') continue;
    const gameId = gameByJson.get(localIdx + offset);
    if (gameId === undefined) continue;
    if (!molecule.isTetrahedralCenter(gameId)) continue;
    const sense = cipCodes.get(localIdx);
    if ((sense === 'R' || sense === 'S') && cipRanks !== undefined) {
      molecule.setAtomStereo(gameId, labelFromCipRanks(molecule, gameId, sense, cipRanks, jsonByGame, offset));
    } else {
      molecule.setAtomStereo(gameId, tetrahedralLabelFromSense(molecule, gameId, atom.stereo, jsonByGame));
    }
  }

  // Double-bond geometry from the JSON bond stereo.
  for (const bond of data.bonds) {
    if (bond.stereo !== 'cis' && bond.stereo !== 'trans') continue;
    const a = gameByJson.get(bond.atoms[0] + offset);
    const b = gameByJson.get(bond.atoms[1] + offset);
    if (a === undefined || b === undefined) continue;
    const gameBond = molecule.bondBetween(a, b);
    if (gameBond === undefined) continue;
    molecule.setBondStereo(gameBond, bond.stereo);
  }
}

function bondOrder(bo: number, source: string): 1 | 2 | 3 {
  if (bo === 1 || bo === 2 || bo === 3) return bo;
  throw new Error(`parseSmiles: unsupported bond order ${bo} in "${source}"`);
}

/**
 * Tetrahedral label from RDKit's canonical CIP sense and ranks.
 *
 * Reference order: the four neighbours sorted by CIP priority (JSON
 * `cipRanks`, higher = higher priority), implicit hydrogen last. This is a
 * canonical, representation-independent order - unlike the JSON 'cw'/'ccw'
 * sense, which is relative to the input string's neighbour order. Pinned
 * empirically by the stereo round-trip tests: an (R) centre is the mirror of
 * the reference (swap the last two) and (S) is the reference as-is.
 */
function labelFromCipRanks(
  molecule: Molecule,
  atom: AtomId,
  sense: 'R' | 'S',
  cipRanks: readonly number[],
  jsonByGame: ReadonlyMap<AtomId, number>,
  offset: number,
): TetrahedralStereo {
  const bonds = molecule.bondsOf(atom);
  const reference = [...bonds].sort((x, y) => {
    const rx = cipRankOfBond(molecule, atom, x, cipRanks, jsonByGame, offset);
    const ry = cipRankOfBond(molecule, atom, y, cipRanks, jsonByGame, offset);
    if (rx !== ry) return ry - rx; // higher rank first (higher priority)
    return x.localeCompare(y); // stable tie-break (chiral centres have distinct ranks)
  }) as [BondId, BondId, BondId, BondId];
  if (sense === 'R') return { bonds: [reference[0]!, reference[1]!, reference[3]!, reference[2]!] };
  return { bonds: reference };
}

/** CIP rank of the other endpoint of `bond` (implicit H is lowest). */
function cipRankOfBond(
  molecule: Molecule,
  atom: AtomId,
  bond: BondId,
  cipRanks: readonly number[],
  jsonByGame: ReadonlyMap<AtomId, number>,
  offset: number,
): number {
  const view = molecule.getBond(bond);
  const other = view.source === atom ? view.target : view.source;
  if (molecule.getAtom(other).element === 'H') return -Infinity;
  const localIdx = (jsonByGame.get(other) ?? offset) - offset;
  return cipRanks[localIdx] ?? -Infinity;
}

/** Sort key of a neighbour for the tetrahedral reference order: heavy atoms
 * by their JSON index ascending, hydrogens last. */
function neighborJsonRank(
  molecule: Molecule,
  atom: AtomId,
  bond: BondId,
  jsonByGame: ReadonlyMap<AtomId, number>,
): number {
  const view = molecule.getBond(bond);
  const other = view.source === atom ? view.target : view.source;
  if (molecule.getAtom(other).element === 'H') return 1000;
  return jsonByGame.get(other) ?? 1001;
}

/**
 * Tetrahedral label from RDKit's JSON sense.
 *
 * Reference order: heavy neighbours by JSON atom index ascending, then the
 * hydrogen. Empirically (pinned by the stereo round-trip tests, ring and
 * non-ring alike) RDKit's 'ccw' corresponds to that reference order and 'cw'
 * to its mirror (swap the last two entries). Both are arbitrary-but-fixed
 * local chirality specs; the game's `sameTetrahedron`/`tokenForOrder` treat
 * them consistently.
 */
function tetrahedralLabelFromSense(
  molecule: Molecule,
  atom: AtomId,
  sense: 'cw' | 'ccw',
  jsonByGame: ReadonlyMap<AtomId, number>,
): TetrahedralStereo {
  const bonds = molecule.bondsOf(atom);
  const ordered = [...bonds].sort(
    (x, y) => neighborJsonRank(molecule, atom, x, jsonByGame) - neighborJsonRank(molecule, atom, y, jsonByGame),
  );
  const reference = ordered as [BondId, BondId, BondId, BondId];
  if (sense === 'ccw') return { bonds: reference };
  return { bonds: [reference[0]!, reference[1]!, reference[3]!, reference[2]!] };
}


