/** Size of one chunk, in grid cells (both axes). */
export const CHUNK_SIZE = 16;

/** The kinds of blocks that can occupy a grid cell. */
export type BlockKind = 'source';

/**
 * Optional UI renderer for a block.
 *
 * Returns the DOM element that should be shown when the player activates the
 * block (e.g. clicks it). The world engine stays framework-free: it only
 * carries the function; game-layer code (see `src/game/ui/`) builds the
 * actual DOM, e.g. with Preact/JSX.
 */
export interface BlockUIElement extends HTMLElement {
  /** Release framework/rendering resources before the host is detached. */
  dispose?: () => void;
}

export type BlockUI = () => BlockUIElement;
