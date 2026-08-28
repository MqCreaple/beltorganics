import { describe, expect, it } from 'vitest';
import {
  CHUNK_SIZE,
  Chunk,
  ChemicalSourceBlock,
  World,
  chunkCoordsOf,
  isSourceBlock,
  localCoordsOf,
} from '../src/world';
import { MoleculeRegistry, moleculeRegistry } from '../src/chem/registry';
import { Camera, DEFAULT_ZOOM } from '../src/game/camera';

describe('chunk coordinates', () => {
  it('maps grid coordinates to chunk coordinates (including negatives)', () => {
    expect(chunkCoordsOf(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkCoordsOf(15, 15)).toEqual({ cx: 0, cy: 0 });
    expect(chunkCoordsOf(16, 0)).toEqual({ cx: 1, cy: 0 });
    expect(chunkCoordsOf(-1, 0)).toEqual({ cx: -1, cy: 0 });
    expect(chunkCoordsOf(-16, -16)).toEqual({ cx: -1, cy: -1 });
    expect(chunkCoordsOf(17, -1)).toEqual({ cx: 1, cy: -1 });
  });

  it('local coordinates round-trip through chunk coordinates', () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [15, 15],
      [16, 0],
      [-1, -1],
      [-17, 3],
      [123, -456],
    ];
    for (const [gx, gy] of samples) {
      const { cx, cy } = chunkCoordsOf(gx, gy);
      const { x, y } = localCoordsOf(gx, gy);
      expect(cx * CHUNK_SIZE + x).toBe(gx);
      expect(cy * CHUNK_SIZE + y).toBe(gy);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(CHUNK_SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(CHUNK_SIZE);
    }
  });
});

describe('Chunk', () => {
  it('stores blocks in cells, replaces them and counts occupancy', () => {
    const chunk = new Chunk(2, -1);
    expect(chunk.gridX).toBe(32);
    expect(chunk.gridY).toBe(-16);

    const water = new ChemicalSourceBlock('O');
    chunk.set(3, 4, water);
    expect(chunk.get(3, 4)).toBe(water);
    expect(chunk.blockCount).toBe(1);

    chunk.set(3, 4, new ChemicalSourceBlock('CCO'));
    expect(chunk.get(3, 4)?.kind).toBe('source');
    expect(chunk.blockCount).toBe(1);

    expect(chunk.clear(3, 4)).not.toBeUndefined();
    expect(chunk.get(3, 4)).toBeUndefined();
    expect(chunk.blockCount).toBe(0);
  });

  it('rejects out-of-range local coordinates', () => {
    const chunk = new Chunk(0, 0);
    expect(() => chunk.get(-1, 0)).toThrow(/out of range/);
    expect(() => chunk.set(16, 0, new ChemicalSourceBlock('O'))).toThrow(/out of range/);
    expect(() => chunk.clear(0, 16)).toThrow(/out of range/);
  });

  it('iterates occupied cells', () => {
    const chunk = new Chunk(0, 0);
    chunk.set(0, 0, new ChemicalSourceBlock('O'));
    chunk.set(15, 15, new ChemicalSourceBlock('N'));
    const seen: string[] = [];
    chunk.forEachBlock((x, y) => seen.push(`${x},${y}`));
    expect(seen).toEqual(['0,0', '15,15']);
  });
});

describe('World', () => {
  it('starts empty and tracks counts', () => {
    const world = new World();
    expect(world.chunkCount).toBe(0);
    expect(world.blockCount).toBe(0);
    expect(world.getBlock(5, 5)).toBeUndefined();
  });

  it('places, reads, overwrites and removes blocks at negative coordinates', () => {
    const world = new World();
    const water = new ChemicalSourceBlock('O');
    world.setBlock(-1, -1, water);
    expect(world.chunkCount).toBe(1);
    expect(world.blockCount).toBe(1);
    expect(world.getBlock(-1, -1)).toBe(water);
    expect(world.getBlock(15, -1)).toBeUndefined(); // same chunk, different cell

    world.setBlock(-1, -1, new ChemicalSourceBlock('CCO'));
    expect(world.blockCount).toBe(1);
    expect(world.getBlock(-1, -1)?.kind).toBe('source');

    expect(world.removeBlock(-1, -1)).not.toBeUndefined();
    expect(world.getBlock(-1, -1)).toBeUndefined();
    expect(world.blockCount).toBe(0);
  });

  it('spreads cells across chunks and reports chunk count', () => {
    const world = new World();
    world.setBlock(0, 0, new ChemicalSourceBlock('O'));
    world.setBlock(16, 0, new ChemicalSourceBlock('CCO')); // +x chunk
    world.setBlock(0, 16, new ChemicalSourceBlock('N')); // +y chunk
    world.setBlock(-1, 0, new ChemicalSourceBlock('O=C=O')); // -x chunk
    expect(world.chunkCount).toBe(4);
    expect(world.blockCount).toBe(4);
  });

  it('iterates only the chunks and blocks inside a grid rect', () => {
    const world = new World();
    world.setBlock(0, 0, new ChemicalSourceBlock('O'));
    world.setBlock(15, 15, new ChemicalSourceBlock('N'));
    world.setBlock(16, 0, new ChemicalSourceBlock('CCO'));
    world.setBlock(100, 100, new ChemicalSourceBlock('CC(=O)O'));

    const seen: string[] = [];
    world.forEachBlockInRect(-2, -2, 17, 17, (gx, gy) => seen.push(`${gx},${gy}`));
    expect(seen.sort()).toEqual(['0,0', '15,15', '16,0']);

    let chunkCount = 0;
    world.forEachChunkInRect(-2, -2, 17, 17, () => chunkCount++);
    expect(chunkCount).toBe(2);
  });

  it('clear removes every chunk', () => {
    const world = new World();
    world.setBlock(0, 0, new ChemicalSourceBlock('O'));
    world.clear();
    expect(world.chunkCount).toBe(0);
    expect(world.blockCount).toBe(0);
  });
});

describe('blocks', () => {
  it('a chemical source carries only its formula (SMILES)', () => {
    const source = new ChemicalSourceBlock('CCO');
    expect(source.kind).toBe('source');
    expect(source.formula).toBe('CCO');
    expect(isSourceBlock(source)).toBe(true);
  });

  it('a chemical source may carry an optional block UI', () => {
    const ui = () => ({ tagName: 'DIV' }) as HTMLElement;
    const source = new ChemicalSourceBlock('CCO', ui);
    expect(source.ui).toBe(ui);
    expect(new ChemicalSourceBlock('O').ui).toBeUndefined();
  });
});

describe('MoleculeRegistry', () => {
  it('parses SMILES on first use and caches the graph', () => {
    const registry = new MoleculeRegistry();
    const water = registry.get('O');
    expect(water.molecularFormula()).toBe('H2O');
    expect(registry.get('O')).toBe(water); // cached: same instance
    expect(registry.has('O')).toBe(true);
    expect(registry.size).toBe(1);

    expect(registry.get('CCO').molecularFormula()).toBe('C2H6O');
    expect(registry.get('c1ccccc1').molecularFormula()).toBe('C6H6');
    expect(registry.get('O=C=O').molecularFormula()).toBe('CO2');
    expect(registry.get('CC(=O)O').molecularFormula()).toBe('C2H4O2');
    expect(registry.get('N').molecularFormula()).toBe('H3N'); // Hill order: H before N when there is no carbon
    expect(registry.size).toBe(6);
  });

  it('throws on invalid SMILES and does not cache it', () => {
    const registry = new MoleculeRegistry();
    expect(() => registry.get('')).toThrow(/invalid SMILES/);
    expect(registry.has('')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('exposes a global singleton', () => {
    expect(moleculeRegistry).toBeInstanceOf(MoleculeRegistry);
    moleculeRegistry.clear();
  });
});

describe('Camera', () => {
  it('defaults to 40 px per world unit', () => {
    const camera = new Camera(800, 600);
    expect(camera.zoom).toBe(DEFAULT_ZOOM);
  });

  it('converts between world and screen coordinates', () => {
    const camera = new Camera(800, 600);
    camera.panByWorld(12.5, -7.25);
    const wx = 3.25;
    const wy = -2.5;
    const sx = camera.worldToScreenX(wx);
    const sy = camera.worldToScreenY(wy);
    expect(camera.screenToWorldX(sx)).toBeCloseTo(wx, 10);
    expect(camera.screenToWorldY(sy)).toBeCloseTo(wy, 10);
  });

  it('clamps zoom to the configured range', () => {
    const camera = new Camera(800, 600);
    camera.zoom = 1e9;
    expect(camera.zoom).toBe(camera.maxZoom);
    camera.zoom = 1e-9;
    expect(camera.zoom).toBe(camera.minZoom);
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const camera = new Camera(800, 600);
    camera.panByWorld(10, 20);
    const sx = 200;
    const sy = 150;
    const beforeX = camera.screenToWorldX(sx);
    const beforeY = camera.screenToWorldY(sy);
    camera.zoomAt(sx, sy, 2.5);
    expect(camera.screenToWorldX(sx)).toBeCloseTo(beforeX, 10);
    expect(camera.screenToWorldY(sy)).toBeCloseTo(beforeY, 10);
  });

  it('panByScreen moves the view by delta / zoom world units', () => {
    const camera = new Camera(800, 600, { zoom: 40 });
    camera.panByScreen(80, 40);
    expect(camera.centerX).toBeCloseTo(-2, 10);
    expect(camera.centerY).toBeCloseTo(-1, 10);
  });
});
