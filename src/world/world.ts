import { Chunk, chunkCoordsOf, localCoordsOf } from './chunk';
import type { Block } from './blocks';

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/**
 * The game world: an infinite grid of cells, recorded in 16x16 chunks.
 *
 * Only chunks that actually contain something exist (the world starts
 * empty), and rendering only visits the chunks overlapping the viewport, so
 * panning/zooming across the infinite plane stays cheap.
 */
export class World {
  readonly #chunks = new Map<string, Chunk>();

  /** The chunk at chunk coordinates, or undefined if it does not exist. */
  chunk(cx: number, cy: number): Chunk | undefined {
    return this.#chunks.get(chunkKey(cx, cy));
  }

  /** The chunk at chunk coordinates, creating it if needed. */
  chunkOrCreate(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    const existing = this.#chunks.get(key);
    if (existing !== undefined) return existing;
    const chunk = new Chunk(cx, cy);
    this.#chunks.set(key, chunk);
    return chunk;
  }

  /** The block on a grid cell, or undefined. */
  getBlock(gridX: number, gridY: number): Block | undefined {
    const { cx, cy } = chunkCoordsOf(gridX, gridY);
    const chunk = this.#chunks.get(chunkKey(cx, cy));
    if (chunk === undefined) return undefined;
    const { x, y } = localCoordsOf(gridX, gridY);
    return chunk.get(x, y);
  }

  /** Place a block on a grid cell (at most one per cell; replaces any previous). */
  setBlock(gridX: number, gridY: number, block: Block): void {
    const { cx, cy } = chunkCoordsOf(gridX, gridY);
    const chunk = this.chunkOrCreate(cx, cy);
    const { x, y } = localCoordsOf(gridX, gridY);
    chunk.set(x, y, block);
  }

  /** Remove whatever occupies a grid cell; returns the removed block, if any. */
  removeBlock(gridX: number, gridY: number): Block | undefined {
    const { cx, cy } = chunkCoordsOf(gridX, gridY);
    const chunk = this.#chunks.get(chunkKey(cx, cy));
    if (chunk === undefined) return undefined;
    const { x, y } = localCoordsOf(gridX, gridY);
    return chunk.clear(x, y);
  }

  /** Number of existing chunks. */
  get chunkCount(): number {
    return this.#chunks.size;
  }

  /** Number of occupied cells across the whole world. */
  get blockCount(): number {
    let count = 0;
    for (const chunk of this.#chunks.values()) count += chunk.blockCount;
    return count;
  }

  /** Calls `callback` for every existing chunk overlapping the inclusive grid rect. */
  forEachChunkInRect(
    minGridX: number,
    minGridY: number,
    maxGridX: number,
    maxGridY: number,
    callback: (chunk: Chunk) => void,
  ): void {
    const min = chunkCoordsOf(minGridX, minGridY);
    const max = chunkCoordsOf(maxGridX, maxGridY);
    for (let cy = min.cy; cy <= max.cy; cy++) {
      for (let cx = min.cx; cx <= max.cx; cx++) {
        const chunk = this.#chunks.get(chunkKey(cx, cy));
        if (chunk !== undefined) callback(chunk);
      }
    }
  }

  /** Calls `callback` for every block within the inclusive grid rect. */
  forEachBlockInRect(
    minGridX: number,
    minGridY: number,
    maxGridX: number,
    maxGridY: number,
    callback: (gridX: number, gridY: number, block: Block) => void,
  ): void {
    this.forEachChunkInRect(minGridX, minGridY, maxGridX, maxGridY, (chunk) => {
      chunk.forEachBlock((localX, localY, block) => {
        const gridX = chunk.gridX + localX;
        const gridY = chunk.gridY + localY;
        if (gridX < minGridX || gridX > maxGridX || gridY < minGridY || gridY > maxGridY) return;
        callback(gridX, gridY, block);
      });
    });
  }

  /** Removes every chunk (empty world). */
  clear(): void {
    this.#chunks.clear();
  }
}