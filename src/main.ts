import './style.css';
import { Game } from './game';
import { ChemicalSourceBlock } from './world';
import { chemicalSourceUI } from './game/ui';
import { initRdkit, moleculeRegistry } from './chem';
import { DEMO_SOURCES } from './demo-sources';

/**
 * Web entry: a full-screen Phaser 4 game canvas.
 *
 * The world starts with a handful of chemical source blocks so the grid,
 * chunking and navigation are immediately visible. Each source stores its
 * substance as a SMILES string; the shared molecule graph is parsed on first
 * use from the global registry (src/chem/registry.ts). RDKit (WASM) is
 * initialized before the game starts - the chemistry engine needs it. See
 * docs/game-world.md.
 */
await initRdkit();

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) throw new Error('main: missing #app element');

const game = new Game({ parent: app });

// Demo world: chemical sources scattered around the origin. Labels show each
// substance's IUPAC name (looked up from PubChem / NCI CIR and cached in the
// registry) instead of the raw SMILES.
for (const [x, y, formula] of DEMO_SOURCES) {
  game.world.setBlock(x, y, new ChemicalSourceBlock(formula, chemicalSourceUI(formula)));
  moleculeRegistry.get(formula); // materialize the graph so the HUD substance count is live
}

game.start();
