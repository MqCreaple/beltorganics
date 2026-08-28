import './style.css';
import { Game } from './game';
import { ChemicalSourceBlock } from './world';
import { chemicalSourceUI } from './game/ui';
import { initRdkit, moleculeRegistry } from './chem';

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
const DEMO_SOURCES: ReadonlyArray<readonly [number, number, string]> = [
  [0, 0, 'O'], // water (dihabitium obligide)
  [3, 0, 'CCO'], // ethanol
  [0, 3, 'c1ccccc1'], // benzene
  [-3, 2, 'O=C=O'], // cardinium diobligide (carbon dioxide)
  [2, -3, 'CC(=O)O'], // acetic acid
  [-4, -2, 'N'], // ammonia (trihabitium naturide)
  [5, 3, 'Oc1ccccc1'], // phenol
  [6, -2, 'c1ccc2ccccc2c1'], // naphthalene
  [-6, 3, 'C1C[C@H](NC1)C(=O)O'], // L-proline (pyrrolidine-2-carboxylic acid; chiral)
  [4, 5, 'Nc1ncnc2[nH]cnc12'], // adenine
  [-5, 5, 'Cc1c[nH]c(=O)[nH]c1=O'], // thymine
  [8, 4, 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C'], // cholesterol (8 chiral centres)
  [-8, -4, 'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O'], // morphine (5 chiral centres)
  [-6, -4, 'N[C@@H](C)C(=O)O'], // L-alanine (chiral: shows a wedge bond)
];
for (const [x, y, formula] of DEMO_SOURCES) {
  game.world.setBlock(x, y, new ChemicalSourceBlock(formula, chemicalSourceUI(formula)));
  moleculeRegistry.get(formula); // materialize the graph so the HUD substance count is live
}

game.start();
