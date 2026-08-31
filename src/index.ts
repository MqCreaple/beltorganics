/**
 * BeltOrganics — library entry point.
 *
 * The web entry (`src/main.ts`) and tests import from here. The chemistry
 * engine lives in `src/chem/` and the world simulation (chunked grid, blocks)
 * in `src/world/` — both are DOM- and Phaser-free. The Phaser 4 game shell lives in
 * `src/game/` and is deliberately *not* re-exported here so the library stays
 * importable in Node (Phaser needs a browser).
 */
export * from './chem';
export * from './world';

export const PROJECT_NAME = 'BeltOrganics';
