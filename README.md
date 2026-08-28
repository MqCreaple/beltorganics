# BeltOrganics

A factory-style game with an organic-chemistry-inspired **pseudo-chemistry**,
built with TypeScript and Vite for the web.

Instead of moving objects between deterministic machines, you move **molecules**
on **conveyor belts**, react them in **reaction chambers**, cope with
**unexpected side reactions**, and **separate** the products you actually want.

The chemistry is a simplified, internally consistent invented system (see
`AGENTS.md` for the full spec): four elements for now - **Cardinium (C)**,
**Habitium (H)**, **Obligium (O)**, **Naturium (N)** - with bond-energy
thermodynamics, temperature-driven Gibbs free energy, phase/solvent-typed
belts, and solubility-based separation.

## Status

Chemistry engine started. The molecule data structure (roadmap step 1 in
`AGENTS.md`) is implemented in `src/chem/`: a molecular graph stored on
[graphology](https://graphology.github.io/) with element and formal charge on
atoms, bond order on edges, tetrahedral stereo labels on 4-coordinate sp3
carbons, and cis/trans labels on double bonds. It can fill implicit
hydrogens (`addImplicitHydrogens`) and label hybridization of every
non-hydrogen atom (`src/chem/hybridization.ts`), including the non-VSEPR
cases (amide N, furan O, carboxylate, carbocations, conjugated carbanions), and detects conjugated π systems with their electron counts (incl. separate systems for the two perpendicular π bonds of a triple bond). The web shell (Vite +
TypeScript) is scaffolded. Canonical naming and stereo-aware SMILES conversion (roadmap step 2) are substantially implemented in `src/chem/smiles.ts` (see `docs/smiles-naming.md`).

The game layer runs on **Phaser 4** (4.2.1, added as a dependency 2026-08-28;
see `docs/research-game.md` section 10 for the decision).

The world groundwork is in place too: an infinite grid recorded in 16x16 chunks
(`src/world/`), chemical source blocks that hold a substance's SMILES formula, a
global SMILES-to-molecule-graph registry (`src/chem/registry.ts`), and a playable
**Phaser 4** shell (`src/game/`) with a gray grid, scroll zoom, and drag/WASD panning. Chemical sources are clickable: they open a centered block-UI panel (built with Preact/TSX); the molecule visualization is a placeholder for now.
See `docs/game-world.md`.

## Quickstart

```sh
npm install     # graphology + dev tooling
npm test        # vitest
npm run dev     # vite dev server
npm run build   # typecheck + production build (dist/)
```

## Layout

- `AGENTS.md` - design spec and agent conventions (read this first)
- `docs/` - design and player docs (Typst), research notes (`docs/research-chemistry.md`, `docs/research-game.md`)
- `src/index.ts` - library entry
- `src/main.ts` - web app entry (full-screen game canvas)
- `src/chem/` - chemistry engine (molecule data structure; naming, properties,
  thermodynamics planned)
- `src/world/` - world simulation (infinite chunked grid, blocks; belts, chambers, ports next)
- `src/game/` - Phaser 4 game shell (grid, camera, input, HUD)
- `test/` - Vitest suites
