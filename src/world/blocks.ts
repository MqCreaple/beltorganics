import type { BlockKind, BlockUI } from './types';

/**
 * A block occupying a single grid cell (at most one block per cell).
 * Each block kind adds the properties of its kind.
 *
 * `title` is an abstract read-only property: every block kind provides the
 * short title shown in its UI panel header (implemented as a getter so
 * subclasses can override it).
 *
 * `ui` is optional: when present, the game shows a pointer cursor over the
 * block and opens the returned UI panel when the player clicks it.
 */
export interface Block {
  readonly kind: BlockKind;
  /** Short title shown in the block's UI panel header. */
  readonly title: string;
  readonly ui?: BlockUI;
}

/**
 * A chemical source: a reservoir of one substance that (once belts exist)
 * can be drawn out of. Its only property is the molecular formula of the
 * substance it contains, stored as a SMILES string - the game stores every
 * molecule as its SMILES string and materializes the graph on demand from
 * the global registry (src/chem/registry.ts).
 */
export class ChemicalSourceBlock implements Block {
  readonly kind = 'source' as const;

  /**
   * Panel title: just the kind, without the formula - formulas (especially
   * long IUPAC names) make the panel header too wide.
   */
  get title(): string {
    return 'Chemical Source';
  }

  constructor(
    readonly formula: string,
    readonly ui?: BlockUI,
  ) {}
}

/** Type guard: is this block a chemical source? */
export function isSourceBlock(block: Block): block is ChemicalSourceBlock {
  return block.kind === 'source';
}