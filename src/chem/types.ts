import type { Attributes } from 'graphology-types';

/**
 * Shared types for the BeltOrganics chemistry engine (`src/chem/`).
 *
 * A molecule is stored as a graph: atoms are nodes, bonds are edges. The graph
 * itself (adjacency, traversal) is handled by graphology; the chemistry
 * semantics (elements, valences, stereo labels, formula) live on top of it.
 */

/** The four game elements (invented names; real-world letters). */
export type ElementSymbol = 'C' | 'H' | 'O' | 'N';

export type BondOrder = 1 | 2 | 3;

/** Bond ids (the graphology edge keys) are `string`; defined here so the
 * stereo label can reference them without importing the Molecule class. */
export type AtomId = string;
export type BondId = string;

/**
 * Winding sense of three bonds around a tetrahedral centre, as seen looking
 * down the first bond (from the substituent toward the centre).
 */
export type TetrahedralDirection = 'clockwise' | 'counterclockwise';

/**
 * Tetrahedral (chiral-centre) configuration, stored as an explicit local
 * chirality specification: the four bonds incident to the centre in a given
 * order.
 *
 * The winding convention is fixed: looking down `bonds[0]` (from the
 * substituent toward the centre), the three trailing bonds
 * (bonds[1], bonds[2], bonds[3]) wind **counterclockwise**. The mirror-image
 * arrangement is expressed by an odd permutation of the order (swap any two
 * bonds), so no explicit direction field is needed - see
 * `src/chem/tetrahedral.ts` (`orderIndicator`, `directionFromBond`,
 * `sameTetrahedron`).
 *
 * The order is arbitrary (e.g. the order the neighbours appear in the SMILES
 * that produced the label). `bonds` is omitted when the centre is known to be
 * stereogenic but its configuration is unspecified.
 */
export interface TetrahedralStereo {
  /** The four bonds incident to the centre, in order; omitted when unspecified. */
  bonds?: [BondId, BondId, BondId, BondId];
}

/**
 * Double-bond geometry.
 *
 * The player-facing cis/trans interpretation, read directly from the SMILES
 * directional-bond tokens when parsing (see `src/chem/smiles.ts`).
 * 'either' = explicitly non-stereogenic double bond.
 */
export type BondGeometryStereo = 'cis' | 'trans' | 'either' | 'unspecified';

/** Static properties of one of the four game elements. */
export interface ElementInfo {
  symbol: ElementSymbol;
  /** Invented name (Cardinium, Habitium, Obligium, Naturium). */
  name: string;
  /** Number of hands: maximum number of single bonds. */
  valence: number;
  /** Number of lone pairs. */
  lonePairs: number;
  /**
   * Game "greediness" (electronegativity analogue). The ordering
   * O > N > C ≈ H must hold; the values are placeholders consistent with the
   * PEOE sp3 parameters documented in docs/research-chemistry.md §8 (step 3 will refine
   * these per hybridization).
   */
  electronegativity: number;
}

/**
 * Attributes stored on every atom node.
 *
 * `stereo` carries the tetrahedral local-chirality label; it is only
 * meaningful on 4-coordinate sp3 carbons (see `Molecule.isTetrahedralCenter`)
 * and references the four incident bonds, so the centre's hydrogens must be
 * explicit (or all four neighbours heavy) for the label to be valid.
 */
export interface AtomAttributes extends Attributes {
  element: ElementSymbol;
  formalCharge: number;
  stereo?: TetrahedralStereo;
}

/**
 * Attributes stored on every bond edge.
 *
 * `stereo` carries the double-bond geometry label; it is only meaningful on
 * order-2 bonds.
 */
export interface BondAttributes extends Attributes {
  order: BondOrder;
  stereo?: BondGeometryStereo;
}
