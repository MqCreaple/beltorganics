import Graph from 'graphology';
import { ELEMENTS, isElementSymbol } from './elements';
import type { MolecularFormula } from './formula';
import { smilesFromMolecule } from './smiles-writer';
import { getRdkitModule } from './rdkit';
import type { RDMolecule } from './rdkit';
import type {
  AtomAttributes,
  AtomId,
  BondAttributes,
  BondGeometryStereo,
  BondId,
  BondOrder,
  ElementSymbol,
  TetrahedralStereo,
} from './types';

export type { AtomId, BondId } from './types';

export interface AddAtomOptions {
  formalCharge?: number;
  stereo?: TetrahedralStereo;
}

export interface AddBondOptions {
  stereo?: BondGeometryStereo;
}

/** Read-only snapshot of an atom node. */
export interface AtomView {
  id: AtomId;
  element: ElementSymbol;
  formalCharge: number;
  stereo?: TetrahedralStereo;
}

/** Read-only snapshot of a bond edge. */
export interface BondView {
  id: BondId;
  source: AtomId;
  target: AtomId;
  order: BondOrder;
  stereo?: BondGeometryStereo;
}

/** Plain-object serialization of a molecule (used by toJSON/fromJSON). */
export interface SerializedMolecule {
  atoms: AtomView[];
  bonds: BondView[];
}

export type MoleculeIssueCode =
  | 'unknown-atom'
  | 'unknown-bond'
  | 'self-loop'
  | 'parallel-bond'
  | 'bad-bond-order'
  | 'valence-exceeded'
  | 'stereo-on-non-tetrahedral'
  | 'stereo-bonds-mismatch'
  | 'stereo-on-non-double';

export interface MoleculeIssue {
  code: MoleculeIssueCode;
  atom?: AtomId;
  bond?: BondId;
  message: string;
}

/**
 * A molecule: a graph whose nodes are atoms (element + formal charge +
 * optional tetrahedral stereo label) and whose edges are bonds (bond order +
 * optional double-bond geometry label).
 *
 * The graph is undirected, with no self-loops and no parallel edges. Storage
 * and adjacency queries are delegated to graphology; every chemistry semantic
 * (valences, implicit hydrogens, formula, stereo perception helpers) lives
 * here on top of the plain graph.
 *
 * Roadmap: this is step 1 (molecule data structure). Canonical naming,
 * substructure queries and property computation build on this class.
 */
export class Molecule {
  readonly #graph = new Graph<AtomAttributes, BondAttributes>();
  #nextAtom = 0;
  #nextBond = 0;

  // Lazy RDKit representation (see getRdkitMolecule).
  #rdkit: RDMolecule | null = null;
  /** False whenever the graph changed after #rdkit was built. */
  #rdkitSynchronized = false;

  // ---------------------------------------------------------------------
  // Structural queries
  // ---------------------------------------------------------------------

  get atomCount(): number {
    return this.#graph.order;
  }

  get bondCount(): number {
    return this.#graph.size;
  }

  hasAtom(atom: AtomId): boolean {
    return this.#graph.hasNode(atom);
  }

  hasBond(bond: BondId): boolean {
    return this.#graph.hasEdge(bond);
  }

  atoms(): AtomId[] {
    return this.#graph.nodes();
  }

  bonds(): BondId[] {
    return this.#graph.edges();
  }

  getAtom(atom: AtomId): AtomView {
    const attrs = this.#graph.getNodeAttributes(atom);
    const view: AtomView = { id: atom, element: attrs.element, formalCharge: attrs.formalCharge };
    if (attrs.stereo !== undefined) view.stereo = attrs.stereo;
    return view;
  }

  getBond(bond: BondId): BondView {
    const attrs = this.#graph.getEdgeAttributes(bond);
    const [source, target] = this.#graph.extremities(bond);
    const view: BondView = { id: bond, source, target, order: attrs.order };
    if (attrs.stereo !== undefined) view.stereo = attrs.stereo;
    return view;
  }

  /** Ids of the atoms directly bonded to `atom`. */
  neighbors(atom: AtomId): AtomId[] {
    return this.#graph.neighbors(atom);
  }

  /** Ids of all bonds incident to `atom`. */
  bondsOf(atom: AtomId): BondId[] {
    const bonds: BondId[] = [];
    this.#graph.forEachEdge((edge, _attrs, source, target) => {
      if (source === atom || target === atom) bonds.push(edge);
    });
    return bonds;
  }

  /** The bond between two atoms, if any (order-independent for undirected graphs). */
  bondBetween(source: AtomId, target: AtomId): BondId | undefined {
    // graphology's edge() lookup is order-sensitive even for undirected
    // graphs, so try both directions.
    return this.#graph.edge(source, target) ?? this.#graph.edge(target, source);
  }

  /** Number of distinct bonded neighbours. */
  neighborCount(atom: AtomId): number {
    return this.#graph.degree(atom);
  }

  /** Hands used by bonds around an atom (sum of incident bond orders). */
  bondOrderSum(atom: AtomId): number {
    let sum = 0;
    this.#graph.forEachEdge((edge, attrs, source, target) => {
      if (source === atom || target === atom) sum += attrs.order;
    });
    return sum;
  }

  // ---------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------

  addAtom(element: ElementSymbol, options: AddAtomOptions = {}): AtomId {
    if (!isElementSymbol(element)) {
      throw new Error(`addAtom: unknown element "${String(element)}"`);
    }
    const id = `a${this.#nextAtom++}`;
    const attrs: AtomAttributes = { element, formalCharge: options.formalCharge ?? 0 };
    if (options.stereo !== undefined) attrs.stereo = options.stereo;
    this.#graph.addNode(id, attrs);
    this.#markRdkitStale();
    return id;
  }

  addBond(
    source: AtomId,
    target: AtomId,
    order: BondOrder = 1,
    options: AddBondOptions = {},
  ): BondId {
    if (!this.hasAtom(source) || !this.hasAtom(target)) {
      throw new Error(`addBond: unknown atom (${source}, ${target})`);
    }
    if (source === target) {
      throw new Error('addBond: self-loops are not allowed in a molecule');
    }
    if (!Number.isInteger(order) || order < 1 || order > 3) {
      throw new Error(`addBond: bond order must be 1, 2 or 3 (got ${String(order)})`);
    }
    if (this.#graph.hasEdge(source, target) || this.#graph.hasEdge(target, source)) {
      throw new Error(`addBond: a bond already exists between ${source} and ${target}`);
    }
    const id = `b${this.#nextBond++}`;
    const attrs: BondAttributes = { order };
    if (options.stereo !== undefined) attrs.stereo = options.stereo;
    this.#graph.addEdgeWithKey(id, source, target, attrs);
    this.#markRdkitStale();
    return id;
  }

  removeAtom(atom: AtomId): void {
    this.#graph.dropNode(atom);
    this.#markRdkitStale();
  }

  removeBond(bond: BondId): void {
    this.#graph.dropEdge(bond);
    this.#markRdkitStale();
  }

  // ---------------------------------------------------------------------
  // Attribute mutation
  // ---------------------------------------------------------------------

  setFormalCharge(atom: AtomId, charge: number): void {
    this.#graph.setNodeAttribute(atom, 'formalCharge', charge);
    this.#markRdkitStale();
  }

  setAtomStereo(atom: AtomId, stereo: TetrahedralStereo | undefined): void {
    if (stereo === undefined) this.#graph.removeNodeAttribute(atom, 'stereo');
    else this.#graph.setNodeAttribute(atom, 'stereo', stereo);
    this.#markRdkitStale();
  }

  setBondOrder(bond: BondId, order: BondOrder): void {
    this.#graph.setEdgeAttribute(bond, 'order', order);
    this.#markRdkitStale();
  }

  setBondStereo(bond: BondId, stereo: BondGeometryStereo | undefined): void {
    if (stereo === undefined) this.#graph.removeEdgeAttribute(bond, 'stereo');
    else this.#graph.setEdgeAttribute(bond, 'stereo', stereo);
    this.#markRdkitStale();
  }

  // ---------------------------------------------------------------------
  // Chemistry helpers
  // ---------------------------------------------------------------------

  /**
   * Is this atom a 4-coordinate sp3 carbon (a *candidate* stereo centre)?
   *
   * True for any carbon with exactly four single-bond neighbours. Whether the
   * centre is actually chiral (four distinct substituents) is perceived later
   * (roadmap step 2); the stereo label stored here is an explicit local
   * chirality specification (`TetrahedralStereo`) referencing the four bonds.
   */
  isTetrahedralCenter(atom: AtomId): boolean {
    const view = this.getAtom(atom);
    if (view.element !== 'C') return false;
    if (this.neighborCount(atom) !== 4) return false;
    for (const neighbor of this.neighbors(atom)) {
      const bond = this.bondBetween(atom, neighbor);
      if (bond === undefined || this.getBond(bond).order !== 1) return false;
    }
    return true;
  }

  /**
   * The RDKit (WASM) representation of this molecule, built lazily and cached.
   *
   * The molecule is constructed from a SMILES serialized by the game's own
   * writer (`src/chem/smiles-writer.ts`) so RDKit perceives the stored
   * stereochemistry. The cached value is rebuilt only after a structural
   * mutation (any change to atoms, bonds, charges or stereo flips the sync
   * flag), so rapid round-trips (toSmiles, the registry's rendered SVG) share
   * a single RDKit molecule. The old handle is `.delete()`d on rebuild.
   *
   * Requires `initRdkit()` to have been awaited first (see `src/chem/rdkit.ts`).
   */
  getRdkitMolecule(): RDMolecule {
    if (this.#rdkit === null || !this.#rdkitSynchronized) {
      const smiles = smilesFromMolecule(this);
      const next = getRdkitModule().get_mol(smiles);
      if (next === null) {
        throw new Error(`getRdkitMolecule: RDKit rejected the serialized molecule "${smiles}"`);
      }
      if (this.#rdkit !== null) this.#rdkit.delete();
      this.#rdkit = next;
      this.#rdkitSynchronized = true;
    }
    return this.#rdkit;
  }

  /** Marks the cached RDKit representation stale after a mutation. */
  #markRdkitStale(): void {
    this.#rdkitSynchronized = false;
  }
  /**
   * Target bond-order sum ("capacity") an atom would need to be saturated,
   * used to derive implicit hydrogens.
   *
   * - Neutral atoms saturate to their valence (hands): C 4, N 3, O 2, H 1.
   * - Anionic atoms saturate to the octet-based capacity
   *   (valence + formal charge): a carboxylate O- with one bond needs no
   *   hydrogen, and a carbanion C- keeps its three bonds.
   * - Positively charged atoms are assumed to be drawn with explicit
   *   hydrogens (the SMILES-style convention) and receive none here.
   */
  #hydrogenCapacity(atom: AtomId): number {
    const { element, formalCharge } = this.getAtom(atom);
    if (formalCharge > 0) return 0;
    if (formalCharge < 0) return ELEMENTS[element].valence + formalCharge;
    return ELEMENTS[element].valence;
  }

  /**
   * Number of implicit hydrogens that would saturate an atom, following the
   * charge rules of #hydrogenCapacity (hydrogens themselves return 0).
   */
  implicitHydrogens(atom: AtomId): number {
    if (this.getAtom(atom).element === 'H') return 0;
    return Math.max(0, this.#hydrogenCapacity(atom) - this.bondOrderSum(atom));
  }

  /**
   * Fills every under-saturated atom with explicit hydrogen atoms and single
   * H-X bonds. Returns the ids of the added hydrogens.
   *
   * Charged atoms follow #hydrogenCapacity: anionic oxygens such as a
   * carboxylate O- are left alone, and cations are assumed to already carry
   * their hydrogens explicitly.
   */
  addImplicitHydrogens(): AtomId[] {
    const added: AtomId[] = [];
    for (const atom of this.atoms()) {
      if (this.getAtom(atom).element === 'H') continue;
      const missing = this.implicitHydrogens(atom);
      for (let i = 0; i < missing; i++) {
        const hydrogen = this.addAtom('H');
        this.addBond(atom, hydrogen);
        added.push(hydrogen);
      }
    }
    return added;
  }

  /**
   * Molecular formula as an element -> count dictionary (only elements
   * actually present, e.g. `{ C: 2, H: 6, O: 1 }` for ethanol), counting
   * explicit atoms plus implicit hydrogens needed to saturate neutral atoms.
   * Serialization (Hill order, subscripts) is a rendering concern - see
   * `src/chem/formula.ts` (`formulaToString`, `formulaParts`).
   */
  molecularFormula(): MolecularFormula {
    const formula: MolecularFormula = {};
    for (const id of this.atoms()) {
      const { element } = this.getAtom(id);
      formula[element] = (formula[element] ?? 0) + 1;
      if (element === 'H') continue; // hydrogens carry no implicit hydrogens
      const implicit = this.implicitHydrogens(id);
      if (implicit > 0) formula.H = (formula.H ?? 0) + implicit;
    }
    return formula;
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  /** Reports structural issues. Does not throw. */
  validate(): MoleculeIssue[] {
    const issues: MoleculeIssue[] = [];
    for (const atom of this.atoms()) {
      const view = this.getAtom(atom);
      const used = this.bondOrderSum(atom);
      if (used > ELEMENTS[view.element].valence) {
        issues.push({
          code: 'valence-exceeded',
          atom,
          message:
            `${view.element} uses ${used} hands but has valence ` +
            `${ELEMENTS[view.element].valence} (may be intentional for a charged species)`,
        });
      }
      if (view.stereo !== undefined) {
        if (!this.isTetrahedralCenter(atom)) {
          issues.push({
            code: 'stereo-on-non-tetrahedral',
            atom,
            message: `stereo label on ${atom} is not a 4-coordinate sp3 carbon`,
          });
        } else if (view.stereo.bonds !== undefined) {
          const incident = new Set(this.bondsOf(atom));
          const { bonds } = view.stereo;
          const invalid =
            bonds.length !== 4 || new Set(bonds).size !== 4 || bonds.some((b) => !incident.has(b));
          if (invalid) {
            issues.push({
              code: 'stereo-bonds-mismatch',
              atom,
              message:
                `tetrahedral stereo on ${atom} references bonds ` +
                `${bonds.join(',')} but its incident bonds are ${[...incident].sort().join(',')}`,
            });
          }
        }
      }
    }
    for (const bond of this.bonds()) {
      const view = this.getBond(bond);
      if (view.stereo !== undefined && view.order !== 2) {
        issues.push({
          code: 'stereo-on-non-double',
          bond,
          message:
            `geometry label "${view.stereo}" on a bond of order ${view.order} ` +
            '(only double bonds carry geometry)',
        });
      }
    }
    return issues;
  }

  // ---------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------

  toJSON(): SerializedMolecule {
    return {
      atoms: this.atoms().map((id) => this.getAtom(id)),
      bonds: this.bonds().map((id) => this.getBond(id)),
    };
  }

  static fromJSON(data: SerializedMolecule): Molecule {
    const molecule = new Molecule();
    const atomRemap = new Map<AtomId, AtomId>();
    for (const atom of data.atoms) {
      const id = molecule.addAtom(atom.element, { formalCharge: atom.formalCharge });
      atomRemap.set(atom.id, id);
    }
    const bondRemap = new Map<BondId, BondId>();
    for (const bond of data.bonds) {
      const source = atomRemap.get(bond.source);
      const target = atomRemap.get(bond.target);
      if (source === undefined || target === undefined) {
        throw new Error(`fromJSON: bond ${bond.id} references unknown atoms`);
      }
      const id = molecule.addBond(
        source,
        target,
        bond.order,
        bond.stereo !== undefined ? { stereo: bond.stereo } : {},
      );
      bondRemap.set(bond.id, id);
    }
    // Tetrahedral labels reference bond ids, which fromJSON regenerates.
    for (const atom of data.atoms) {
      if (atom.stereo === undefined) continue;
      const newAtom = atomRemap.get(atom.id);
      if (newAtom === undefined) throw new Error(`fromJSON: atom ${atom.id} is missing`);
      molecule.setAtomStereo(newAtom, remapTetrahedralStereo(atom.stereo, bondRemap));
    }
    return molecule;
  }

  clone(): Molecule {
    return Molecule.fromJSON(this.toJSON());
  }
}

/** Re-target a tetrahedral label's bond ids through a remap (used by fromJSON). */
function remapTetrahedralStereo(
  stereo: TetrahedralStereo,
  bondRemap: ReadonlyMap<BondId, BondId>,
): TetrahedralStereo {
  if (stereo.bonds === undefined) return {};
  const bonds = stereo.bonds.map((id) => {
    const mapped = bondRemap.get(id);
    if (mapped === undefined) {
      throw new Error(`fromJSON: tetrahedral label references unknown bond ${id}`);
    }
    return mapped;
  });
  return { bonds: bonds as [BondId, BondId, BondId, BondId] };
}
