import type { BlockKind, BlockUI } from './types';

/**
 * A block occupying a single grid cell (at most one block per cell).
 * Each block kind adds the properties of its kind.
 *
 * `ui` is optional: when present, the game shows a pointer cursor over the
 * block and opens the returned UI panel when the player clicks it.
 */
export interface Block {
  readonly kind: BlockKind;
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

  constructor(
    readonly formula: string,
    readonly ui?: BlockUI,
  ) {}
}

/** Type guard: is this block a chemical source? */
export function isSourceBlock(block: Block): block is ChemicalSourceBlock {
  return block.kind === 'source';
}