import { CHUNK_SIZE } from './types';
import type { Block } from './blocks';

/** Grid coordinate -> chunk coordinate (floor division; correct for negatives). */
export function chunkCoordsOf(gridX: number, gridY: number): { cx: number; cy: number } {
  return {
    cx: Math.floor(gridX / CHUNK_SIZE),
    cy: Math.floor(gridY / CHUNK_SIZE),
  };
}

/** Grid coordinate -> coordinate within its chunk (0..CHUNK_SIZE-1). */
export function localCoordsOf(gridX: number, gridY: number): { x: number; y: number } {
  const { cx, cy } = chunkCoordsOf(gridX, gridY);
  return { x: gridX - cx * CHUNK_SIZE, y: gridY - cy * CHUNK_SIZE };
}

/**
 * One 16x16 chunk of the infinite grid. Cells are stored in a flat array
 * indexed `y * CHUNK_SIZE + x`; a cell holds at most one block.
 */
export class Chunk {
  readonly #cells: (Block | undefined)[] = new Array<Block | undefined>(CHUNK_SIZE * CHUNK_SIZE);

  constructor(
    readonly cx: number,
    readonly cy: number,
  ) {}

  /** World-grid x of the chunk's left edge. */
  get gridX(): number {
    return this.cx * CHUNK_SIZE;
  }

  /** World-grid y of the chunk's top edge. */
  get gridY(): number {
    return this.cy * CHUNK_SIZE;
  }

  #assertLocal(x: number, y: number): void {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= CHUNK_SIZE ||
      y >= CHUNK_SIZE
    ) {
      throw new Error(
        `Chunk: local coordinates (${x}, ${y}) out of range for a ${CHUNK_SIZE}x${CHUNK_SIZE} chunk`,
      );
    }
  }

  /** The block at a local cell, or undefined. */
  get(x: number, y: number): Block | undefined {
    this.#assertLocal(x, y);
    return this.#cells[y * CHUNK_SIZE + x];
  }

  /** Place a block in a local cell, replacing whatever was there. */
  set(x: number, y: number, block: Block): void {
    this.#assertLocal(x, y);
    this.#cells[y * CHUNK_SIZE + x] = block;
  }

  /** Remove the block in a local cell; returns it, if there was one. */
  clear(x: number, y: number): Block | undefined {
    this.#assertLocal(x, y);
    const index = y * CHUNK_SIZE + x;
    const previous = this.#cells[index];
    this.#cells[index] = undefined;
    return previous;
  }

  /** Number of occupied cells in this chunk. */
  get blockCount(): number {
    let count = 0;
    for (const cell of this.#cells) {
      if (cell !== undefined) count++;
    }
    return count;
  }

  /** Calls `callback` for every occupied local cell in row-major order. */
  forEachBlock(callback: (localX: number, localY: number, block: Block) => void): void {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const block = this.#cells[y * CHUNK_SIZE + x];
        if (block !== undefined) callback(x, y, block);
      }
    }
  }
}