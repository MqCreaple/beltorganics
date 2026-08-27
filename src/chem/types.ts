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

/**
 * Tetrahedral (chiral-centre) parity.
 *
 * A sign that records which way the four substituents are arranged relative to
 * a fixed, canonical ordering of the neighbours (see docs/research.md §7).
 * Perceiving the parity from 2D/3D input is a later step; here we only store
 * the label on any 4-coordinate sp3 carbon.
 */
export type TetrahedralStereo = 'plus' | 'minus' | 'unspecified';

/**
 * Double-bond geometry.
 *
 * The player-facing cis/trans interpretation. The canonical parity form
 * (relative to the canonical neighbour ordering) is computed in the naming
 * step (roadmap step 2). 'either' = explicitly non-stereogenic double bond.
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
   * PEOE sp3 parameters documented in docs/research.md §8 (step 3 will refine
   * these per hybridization).
   */
  electronegativity: number;
}

/**
 * Attributes stored on every atom node.
 *
 * `stereo` carries the tetrahedral parity label; it is only meaningful on
 * 4-coordinate sp3 carbons (see `Molecule.isTetrahedralCenter`).
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
