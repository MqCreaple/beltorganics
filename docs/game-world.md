# Game World — the infinite factory floor

This document describes the world layer of BeltOrganics: the grid you stand on,
the chunks the map is recorded in, the blocks you place, and how the game talks
about molecules. It is written for players and for anyone reading the code.

## The grid

The factory floor is an **infinite rectangular grid** of cells. Every cell is a
square of the same size and is addressed by integer coordinates `(x, y)`, with
`x` increasing to the right and `y` increasing downward (screen convention).

- The grid never ends. You can zoom out, pan, and keep going in any direction.
- One grid cell is the atomic unit of the world: everything that occupies the
  floor sits on exactly one cell.
- Grid lines are drawn in gray; every 16 cells a slightly brighter line marks a
  chunk border (see below).

## Chunks: how the infinite map is recorded

An infinite grid cannot be stored cell-by-cell in one array, so the map is
recorded in **chunks of 16×16 cells**. Each chunk has its own chunk coordinate
`(cx, cy)`; a grid cell `(x, y)` lives in chunk `(⌊x/16⌋, ⌊y/16⌋)` at the local
position `(x mod 16, y mod 16)` (modulo handled correctly for negative
coordinates).

- Only chunks that contain something exist. The world starts empty, and a new
  chunk is created the first time a block is placed inside it.
- Rendering only visits the chunks that overlap the screen, so the map can be
  arbitrarily large while the game stays fast.
- Chunks are the natural unit for future work: saving/loading the map,
  activating/deactivating machines, and (later) tile-based drawing.

## Blocks: one per cell

A **block** is anything the player puts on the floor. Rules:

- A cell holds **at most one block**. Placing a block on an occupied cell
  replaces whatever was there.
- A block has a **kind** that defines what it is, plus the properties of that
  kind.
- A block may carry an optional **UI panel** (`BlockUI`): the cursor becomes a
  pointer over such blocks, and clicking one opens a centered HUD showing the
  block's panel (click outside the panel to close it).

### Chemical source

The first block in the game is the **chemical source**: a reservoir of one
substance that, once belts arrive, can be drawn out of.

- It occupies one cell and is drawn as a green square (real textures come
  later).
- It carries exactly **one property: the molecular formula of the substance it
  contains**. Zooming in shows the substance's name next to the square: the
  common name when PubChem has one (its `Title`), otherwise the IUPAC name
  (NCI Chemical Identifier Resolver as fallback; resolved names are persisted
  in the browser's localStorage, so reloads reuse them without the network);
  the raw SMILES is the fallback label until the name arrives.
- It carries a UI panel that opens when you click it: the substance's name
  (common, else IUPAC) as the title, a table with the common name, IUPAC name,
  chemical formula (with subscripted counts), and SMILES string (missing
  values show "none"), and the
  structure formula as an SVG rendered by the chemistry engine and cached in
  the molecule registry (the first render parses and lays the molecule out;
  later opens reuse the cached diagram).

## Molecules are SMILES strings

Inside the game, a molecule is **never stored as an object** — it is stored as
its **SMILES string** (for example water is `O`, ethanol is `CCO`, benzene is
`c1ccccc1`). The molecular graph is real, though: the game keeps a **global
registry that maps each SMILES string to its molecule graph** (`Molecule` in
`src/chem/`).

- The first time a substance appears, its graph is parsed from the SMILES
  string and cached; every later use shares that one graph.
- Because identity is just a string, comparing two substances is cheap and
  orientation-independent, and canonical names come for free from the chemistry
  engine.
- The block's formula property is such a SMILES string; the graph for it can be
  looked up from the registry at any time.
- The registry also looks up and caches each substance's **name**
  (`fetchSubstanceName` / `substanceName`): the common name from PubChem's
  `Title` property when available, else the IUPAC name, with the NCI Chemical
  Identifier Resolver filling any missing field. Each name records its source
  (PubChem or CIR) and is persisted to localStorage, so reloads reuse the
  mapping without the network; a CIR-sourced name is re-checked against
  PubChem on the next lookup and upgraded once PubChem answers. Names are
  sanitized (Markush markup rejected) before caching; source labels show the
  name instead of the raw SMILES once it resolves.

## Moving around the world

The camera floats over the infinite grid:

- **Scroll** zooms in and out, keeping the point under your cursor fixed.
  Zoom is clamped to a sane range (a cell from a speck to a billboard).
- **Drag** with the left mouse button pans the view.
- **W/A/S/D** pan the view continuously. The movement magnitude depends on the
  current zoom: the world distance moved per second scales inversely with zoom,
  so the *on-screen* pan speed feels the same whether you are zoomed in or out.

## What you see on screen

- **Gray grid lines** — the infinite grid, drawn only where visible.
- **Chunk borders** — a slightly brighter gray line every 16 cells, so you can
  see how the map is recorded.
- **Blocks** — colored squares on their cells (chemical sources are green).
- **Labels** — zooming in on a source shows its name (PubChem common/IUPAC,
  cached in the registry), falling back to the SMILES while the name loads.
- **Block UI** — hover a source (the cursor turns into a pointer) and click it
  to open a centered panel with the block's UI; click outside the panel to
  close it.
- **HUD** (top-left) — current zoom, the grid cell under the cursor, and live
  counts of chunks, blocks, and distinct substances loaded.

## Running the game

```sh
npm install   # once
npm run dev   # start the dev server, open http://localhost:5173
npm test      # run the test suite
npm run build # typecheck + production build into dist/
```

## Where things live in the code

- `src/chem/` — the chemistry engine (molecule graphs, SMILES, properties).
- `src/chem/registry.ts` — the global SMILES → molecule-graph registry (plus the
  lazily rendered structure-diagram SVG and the IUPAC-name cache).
- `src/world/` — the engine of the world: `types.ts` (chunk size, block kinds),
  `blocks.ts` (chemical source), `chunk.ts` (16×16 chunk + coordinate math),
  `world.ts` (the infinite chunked map and block placement).
- `src/game/` — the Phaser 4 game shell: `camera.ts` (zoom/pan math),
  `scene.ts` (the scene: grid/blocks rendering, input, HUD), `game.ts`
  (wraps the Phaser.Game and shares the world).
- `src/game/ui/` — Preact/TSX UI: `block-panel.tsx` (the centered HUD overlay
  and its open/close), `molecule-panel.tsx` (structure-diagram SVG viewer for
  a substance), `source-block-ui.tsx` (builds the `BlockUI` for sources).
- `src/main.ts` — web entry; creates the game (Phaser canvas) in `#app`, a
  demo world with a few chemical sources, and starts it.

## Design notes and next steps

- The world and chemistry engines are framework-free (no DOM, no game engine),
  so they run in Node tests and stay portable. The game shell runs on
  **Phaser 4** (installed 2026-08-28). The structure-diagram SVG already
  renders in the block panels (RDKit via the registry); a 3D molecule view
  in Phaser can come later, fed by the same registry.
- Block UI panels are built with **Preact** (JSX/TSX via @preact/preset-vite)
  so components stay modular and reusable; the world engine only carries a
  `BlockUI` function and never touches the UI framework.
- Next on the floor: **belts** that carry substances out of source blocks,
  chambers that react them, and separation of mixtures — each building on the
  chunked grid and the SMILES registry described here.