import { parseSmiles } from './smiles';
import type { Molecule } from './molecule';

/**
 * Global mapping from SMILES strings to molecule graphs (world groundwork;
 * see docs/game-world.md).
 *
 * Within the game every molecule is stored as its SMILES string; the graph
 * object for a substance is materialized once, on first use, and cached here
 * so all systems (source blocks, later belts/chambers) share a single
 * Molecule instance per substance. The registry is the single source of
 * truth for string -> graph in the game.
 */
export class MoleculeRegistry {
  readonly #molecules = new Map<string, Molecule>();

  /** The molecule graph for a SMILES string, parsed on first use and cached. */
  get(smiles: string): Molecule {
    const cached = this.#molecules.get(smiles);
    if (cached !== undefined) return cached;
    const molecule = parseSmiles(smiles);
    this.#molecules.set(smiles, molecule);
    return molecule;
  }

  has(smiles: string): boolean {
    return this.#molecules.has(smiles);
  }

  /** Number of distinct SMILES strings materialized so far. */
  get size(): number {
    return this.#molecules.size;
  }

  clear(): void {
    this.#molecules.clear();
  }
}

/** The process-wide molecule registry used by the game. */
export const moleculeRegistry = new MoleculeRegistry();