import './process-shim'; // MUST be first: defines process before openchem loads
import './style.css';
import { Game } from './game';
import { ChemicalSourceBlock } from './world';
import { chemicalSourceUI } from './game/ui';
import { moleculeRegistry } from './chem';

/**
 * Web entry: a full-screen Phaser 4 game canvas.
 *
 * The world starts with a handful of chemical source blocks so the grid,
 * chunking and navigation are immediately visible. Each source stores its
 * substance as a SMILES string; the shared molecule graph is parsed on first
 * use from the global registry (src/chem/registry.ts). See docs/game-world.md.
 */
const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) throw new Error('main: missing #app element');

const game = new Game({ parent: app });

// Demo world: a few chemical sources scattered around the origin.
const DEMO_SOURCES: ReadonlyArray<readonly [number, number, string]> = [
  [0, 0, 'O'], // water (dihabitium obligide)
  [3, 0, 'CCO'], // ethanol
  [0, 3, 'c1ccccc1'], // benzene
  [-3, 2, 'O=C=O'], // cardinium diobligide (carbon dioxide)
  [2, -3, 'CC(=O)O'], // acetic acid
  [-4, -2, 'N'], // ammonia (trihabitium naturide)
];
for (const [x, y, formula] of DEMO_SOURCES) {
  game.world.setBlock(x, y, new ChemicalSourceBlock(formula, chemicalSourceUI(formula)));
  moleculeRegistry.get(formula); // materialize the graph so the HUD substance count is live
}

game.start();