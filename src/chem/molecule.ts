import Graph from 'graphology';
import { ELEMENTS, isElementSymbol } from './elements';
import type {
  AtomAttributes,
  BondAttributes,
  BondGeometryStereo,
  BondOrder,
  ElementSymbol,
  TetrahedralStereo,
} from './types';

export type AtomId = string;
export type BondId = string;

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

  /** The bond between two atoms, if any. */
  bondBetween(source: AtomId, target: AtomId): BondId | undefined {
    return this.#graph.edge(source, target);
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
    if (this.#graph.hasEdge(source, target)) {
      throw new Error(`addBond: a bond already exists between ${source} and ${target}`);
    }
    const id = `b${this.#nextBond++}`;
    const attrs: BondAttributes = { order };
    if (options.stereo !== undefined) attrs.stereo = options.stereo;
    this.#graph.addEdgeWithKey(id, source, target, attrs);
    return id;
  }

  removeAtom(atom: AtomId): void {
    this.#graph.dropNode(atom);
  }

  removeBond(bond: BondId): void {
    this.#graph.dropEdge(bond);
  }

  // ---------------------------------------------------------------------
  // Attribute mutation
  // ---------------------------------------------------------------------

  setFormalCharge(atom: AtomId, charge: number): void {
    this.#graph.setNodeAttribute(atom, 'formalCharge', charge);
  }

  setAtomStereo(atom: AtomId, stereo: TetrahedralStereo | undefined): void {
    if (stereo === undefined) this.#graph.removeNodeAttribute(atom, 'stereo');
    else this.#graph.setNodeAttribute(atom, 'stereo', stereo);
  }

  setBondOrder(bond: BondId, order: BondOrder): void {
    this.#graph.setEdgeAttribute(bond, 'order', order);
  }

  setBondStereo(bond: BondId, stereo: BondGeometryStereo | undefined): void {
    if (stereo === undefined) this.#graph.removeEdgeAttribute(bond, 'stereo');
    else this.#graph.setEdgeAttribute(bond, 'stereo', stereo);
  }

  // ---------------------------------------------------------------------
  // Chemistry helpers
  // ---------------------------------------------------------------------

  /**
   * Is this atom a 4-coordinate sp3 carbon (a *candidate* stereo centre)?
   *
   * True for any carbon with exactly four single-bond neighbours. Whether the
   * centre is actually chiral (four distinct substituents) is perceived during
   * canonicalisation (roadmap step 2); the stereo label stored here is the
   * parity relative to the canonical neighbour ordering.
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
   * Molecular formula in Hill order (C, H, then N, O), counting explicit
   * atoms plus implicit hydrogens needed to saturate neutral atoms.
   */
  molecularFormula(): string {
    const heavy = new Map<Exclude<ElementSymbol, 'H'>, number>();
    let hydrogens = 0;
    for (const id of this.atoms()) {
      const { element } = this.getAtom(id);
      if (element === 'H') hydrogens += 1;
      else heavy.set(element, (heavy.get(element) ?? 0) + 1);
      hydrogens += this.implicitHydrogens(id);
    }
    const parts: string[] = [];
    const push = (symbol: ElementSymbol, count: number): void => {
      parts.push(count === 1 ? symbol : `${symbol}${count}`);
    };
    // Hill order: C first, then H, then the rest alphabetically (N, O).
    const carbon = heavy.get('C');
    if (carbon !== undefined && carbon > 0) push('C', carbon);
    if (hydrogens > 0) push('H', hydrogens);
    for (const symbol of ['N', 'O'] as const) {
      const count = heavy.get(symbol);
      if (count !== undefined && count > 0) push(symbol, count);
    }
    return parts.join('');
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
      if (view.stereo !== undefined && !this.isTetrahedralCenter(atom)) {
        issues.push({
          code: 'stereo-on-non-tetrahedral',
          atom,
          message: `stereo label "${view.stereo}" on ${atom} is not a 4-coordinate sp3 carbon`,
        });
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
    const remap = new Map<AtomId, AtomId>();
    for (const atom of data.atoms) {
      const id = molecule.addAtom(atom.element, {
        formalCharge: atom.formalCharge,
        ...(atom.stereo !== undefined ? { stereo: atom.stereo } : {}),
      });
      remap.set(atom.id, id);
    }
    for (const bond of data.bonds) {
      const source = remap.get(bond.source);
      const target = remap.get(bond.target);
      if (source === undefined || target === undefined) {
        throw new Error(`fromJSON: bond ${bond.id} references unknown atoms`);
      }
      molecule.addBond(
        source,
        target,
        bond.order,
        bond.stereo !== undefined ? { stereo: bond.stereo } : {},
      );
    }
    return molecule;
  }

  clone(): Molecule {
    return Molecule.fromJSON(this.toJSON());
  }
}
