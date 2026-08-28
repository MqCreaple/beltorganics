# Research notes — game-related design & tooling for BeltOrganics

Curated references and decisions for the game layer: design precedents, tooling choices, and the world/game-shell decisions. Chemistry-engine research (molecules, bonds, charges, orbitals, thermodynamics, stereochemistry, naming, algorithm notes) lives in `docs/research-chemistry.md`. Links were gathered 2026-08-27; if a link dies, search for the title.

## 6. Game-design precedents (chemistry + factory/puzzle)

- **SpaceChem (Zachtronics)** https://en.wikipedia.org/wiki/SpaceChem The canonical "molecule factory puzzle": build molecules atom-by-atom in reactors, form/break bonds, program waldoes, hit output quotas. Closest existing precedent for *reacting molecules as the core mechanic*.

- **Opus Magnum (Zachtronics)** https://store.steampowered.com/app/558990/Opus_Magnum/ https://www.rockpapershotgun.com/have-you-played-opus-magnum Alchemy-engine puzzles: transmute molecules on a hex grid with arms/pistons. A polished take on "fake science" chemistry automation — good inspiration for UX and problem structure (loop correctness, side-product handling).

- **Factorio — transport belt physics** https://wiki.factorio.com/Transport_belts/Physics Concrete belt model: density (4 items/tile/lane), speed (tiles/sec), throughput = density × speed, compression, two independent lanes, per-tile item accounting. Directly applicable when simulating molecule belts.

- **Alembic (Steam, 2026)** https://store.steampowered.com/app/4933990/Alembic/ Falling-sand sandbox on the real periodic table: reactions *emerge* from physical/chemical properties (no recipe book), with pipes, fans, **filters that separate phases**, conveyors for loose matter, thermal plates. The "phase separation + typed transport" idea matches the design's multiple-output ports and solubility-based leaving rates.

- **Alchemy Factory (2025)** http://feed.ilidea.com/index.php/Index/details.html?id=13149587 A chemistry-themed 3D factory game where you build alchemy plants with conveyor belts and machines (voxel building) — evidence that "chemistry + conveyor factory" is a viable genre mix.

- **Берлога: Химзавод ("Chemical Plant")** https://platform.kruzhok.org/chemicalplant A production simulator that runs a real chemical plant (formulas, reactions, installations) — useful for how to present reaction/synthesis flows understandably.

- **Fandomium — fictional elements wiki** https://fandomium.fandom.com/wiki/Spirogen Community precedent for invented elements with pseudo-chemistry (e.g. "spirogen" as a pseudo-carbon with pseudo-hydrogen analogues, named after alkanes). Nice worldbuilding reference for the "different universe" flavour.


## 10. Tooling decisions (2026-08-27)

Libraries evaluated for storing molecule structures, and the choices made for the TypeScript/Vite web app.

### Molecule-structure libraries on npm (evaluated, not adopted)

- **openchemlib** (https://www.npmjs.com/package/openchemlib) - mature JS port of the OpenChemLib Java library (maintained by Zakodium): molecular graph, stereochemistry (R/S, E/Z), canonical SMILES, descriptors. Not adopted: hardwired to the real periodic table and real chemical heuristics; GWT-transpiled Java is heavy and not idiomatic TypeScript.
- **@rdkit/rdkit** (https://www.npmjs.com/package/@rdkit/rdkit) - the official RDKit WASM build. Extremely capable, but a large asynchronously-loaded WASM module; same "real chemistry, not pseudo-chemistry" mismatch.
- **openchem** (https://www.npmjs.com/package/openchem) - new (2026) TypeScript-native cheminformatics library with tetrahedral and E/Z stereo support and canonical SMILES. Promising, but still real-chemistry-oriented (periodic table, SMILES, RDKit parity) and young.

All three encode the real periodic table and real functional-group behaviour, while the game needs invented elements (Cardinium, Habitium, Obligium, Naturium) with custom parameters, custom canonical naming, and cheap property computation. Adopting one would fight the pseudo-chemistry design, so the molecule structure is built on a general graph library instead.

### Graph-storage library (adopted)

- **graphology** (https://github.com/graphology/graphology) - actively maintained (~1M weekly downloads), ships TypeScript types, supports attributes on nodes and edges (element/charge/stereo on atoms, bond order/stereo on bonds), is event-driven, and has a standard library (traversals, connected components, ...) that will serve ring perception and conjugated-pi detection later. Molecule graphs are graphology graphs; chemistry semantics live in `src/chem/` on top of the plain graph, so the storage layer can be swapped without touching the chemistry code.

### Game engine (adopted 2026-08-28: Phaser 4.2.1)

- **Phaser 4** (https://phaser.io/) - the current 2D web game framework (v4.2.1, July 2026), TypeScript declarations, scenes/tilemaps/sprites/input out of the box; a good fit for the planned 2D top-down conveyor-belt factory. Alternatives: PixiJS v8 (rendering only, more plumbing) and Excalibur (TypeScript-native but smaller ecosystem). Phaser 4.2.1 was added as a dependency when the game layer started (2026-08-28); the chemistry and world engines stay framework-free so they run in Node tests and the browser alike.

### Toolchain

- TypeScript + Vite for the web app (`npm run dev` / `npm run build`), Vitest for tests (`npm test`). `src/chem/` is pure logic with no DOM dependency, so the engine is testable in Node and usable in the browser.

### SMILES generation for canonical names (roadmap step 2, 2026-08-27)

Evaluation for turning the molecule graph into canonical, stereo-aware names - separate from the storage decision above, since this only concerns string output. Full note and verified sample outputs: `docs/smiles-naming.md`.

- **openchem** (https://www.npmjs.com/package/openchem) - recommended. New (2026) TypeScript-native library, MIT, no runtime dependencies, browser and Node. `generateSMILES({ atoms, bonds }, true)` returns an order-independent canonical SMILES from a plain object that maps 1:1 onto the graphology graph; tetrahedral `@`/`@@` via `atom.chiral`, E/Z via `bond.stereo` up/down on the adjacent single bonds; handles bracket atoms (charge, explicit H), disconnected components, ring closures. Morgan-based canonicalization with RDKit-style tie-breaking (author reports 100% agreement on a 325-molecule set). Caveats: canonical flavour starts at hetero atoms (ethanol `OCC` vs the `CCO` promised in the player docs), it aromatizes kekule benzene (`c1ccccc1`), and it is young (0.2.x, single maintainer) - keep it behind a thin adapter (`src/chem/naming.ts`) and pin the version. It still encodes real-chemistry heuristics (periodic table, valence, aromaticity), which is acceptable for *string output* because the game's elements already use the real letters C/H/O/N and SMILES does not encode hybridization; all game semantics stay in `src/chem/`.

Scale limits found by stress-testing (2026-08-28, `test/smiles.test.ts`): openchem's canonical writer caps the nesting depth of chiral branches at ~42 (a single chain with >~42 chiral centres loses tokens: 42 of 98 survive at length 100), and its E/Z canonicalisation corrupts conjugated chains with >= 3 double bonds (cis rewritten to trans). Non-conjugated double bonds and chains up to 42 chiral centres round-trip losslessly; the conversion algorithm is O(n) per pass (iterative-refinement matching + a bounded per-centre correction loop; E/Z tokens solved as constraints along chains).

Implemented 2026-08-27: `src/chem/smiles.ts` (`toSmiles`/`parseSmiles`) + `src/chem/tetrahedral.ts` (local-chirality label conversion: order indicator, direction-from-bond, token derivation). `src/chem/canonical.ts` was removed - stereo no longer needs Morgan ordering because the label is self-contained. Structure-preservation tests live in `test/smiles.test.ts`; the geometric conversion tests are in `test/tetrahedral.test.ts`. Caveat found in practice: openchem's canonicalisation does not re-derive tetrahedral `@`/`@@` tokens when it reorders atoms (the same enantiomer written differently can canonicalize to different tokens), so `toSmiles` learns the emitted neighbour order from a single achiral canonical pass and derives the token with `tokenForOrder`; E/Z is order-independent and round-trips directly. As part of this work, `Molecule.bondBetween` was made order-independent (graphology's `edge()` lookup turned out to be order-sensitive even for undirected graphs).
- **openchemlib** (https://www.npmjs.com/package/openchemlib) - fallback. Mature; `toSmiles()`/`toIsomericSmiles()`, and its flavour matches the player docs (`CCO`). But GWT-transpiled Java (heavy), API quirks (bond-order argument handling, `CC(O)=O` flavour for acetic acid), and canonical SMILES is not its cleanest path.
- **@rdkit/rdkit** - not considered further: heavy async WASM, real-chemistry only.



## 11. World layer & game shell decisions (2026-08-28)

Decisions for the world groundwork (roadmap step 5 start) and the first playable canvas. Player-facing summary: `docs/game-world.md`.

### Infinite grid recorded in 16x16 chunks

- The map is an infinite grid of cells addressed by integers; it is stored in **chunks of 16x16 cells** (`src/world/chunk.ts`), each chunk a flat 256-element array indexed `y * 16 + x`. A cell holds at most one block.
- Chunk coordinates use floor division (`⌊x/16⌋`), so negative coordinates map correctly into negative chunk coordinates (chunk `-1` covers `-16..-1`).
- Only chunks that contain something exist (`src/world/world.ts` keeps a `Map<"cx,cy", Chunk>`); the world starts empty, and rendering visits only the chunks overlapping the viewport (`forEachChunkInRect`). Rationale: infinite world with O(visible) rendering, natural unit for future save/load and machine activation, and it maps onto tilemaps when Phaser 4 arrives.

### Molecules stored as SMILES strings + global registry

- Within the game every molecule is stored as its **SMILES string**, and a global `MoleculeRegistry` (`src/chem/registry.ts`) maps each SMILES string to its cached `Molecule` graph (parsed once via `parseSmiles` on first use).
- Rationale: identity/equality reduces to string comparison, canonical names come from the existing chemistry engine, one graph object per substance is shared by all systems, and blocks carry just a string property (the chemical source's single property is its formula).

### Camera: zoom = px per world unit, pan speed scales with zoom

- `Camera` (`src/game/camera.ts`) stores center (world coords) + zoom (px per world unit; default 40, clamped 0.04..160). `zoomAt` keeps the world point under the cursor fixed (scroll-to-zoom-at-cursor).
- WASD pan: world units per second = panSpeedPx / zoom, so the **on-screen** pan speed is constant at any zoom level (movement magnitude depends on the current scaling, as requested). Drag pans by screen delta / zoom.

### Game shell: Phaser 4 (installed 2026-08-28)

- The game shell runs on **Phaser 4** (`src/game/game.ts` wraps a `Phaser.Game` sharing the `World`; `src/game/scene.ts` is the scene). A `Graphics` object redrawn each frame draws the gray grid lines (thinned adaptively when cells are < ~10 px so zooming out never draws unbounded lines), slightly brighter chunk borders every 16 cells (thinned the same way at low zoom), and block squares (green for chemical sources); a small pool of `Text` objects (one per occupied cell, scale-compensated for zoom) draws the SMILES labels.
- The camera view model (`src/game/camera.ts`) stays framework-free and is pushed into Phaser's camera every frame (`setZoom` + `centerOn`), so all zoom/pan math remains unit-tested in Node while Phaser owns the world -> screen transform and the visible-bounds queries (`camera.getWorldPoint`). Input: wheel -> `camera.zoomAt` (zoom toward the cursor), left-drag pan, and WASD via Phaser keyboard events; pan speed in world units scales inversely with zoom so the on-screen speed stays constant.
- `npm run build` notes: openchem imports Node's `fs` in a browser-externalized path (Vite warns; harmless), and reads `process.env.*` (Node) at module scope - the web entry loads `src/process-shim.ts` first to install a minimal `process` global in the browser. The bundle is ~2.5 MB minified (Phaser + openchem) - fine for a dev-stage game, revisit with code-splitting later.

### Blocks

- `Block` interface + `ChemicalSourceBlock` (`src/world/blocks.ts`): one block per cell; the source carries only its formula (SMILES). Belts/chambers come later; the block API is designed so they slot in as new kinds.

### Block UI panels & the UI framework (2026-08-28)

- `Block` gains an optional `ui?: BlockUI` where `BlockUI = () => HTMLElement` (`src/world/types.ts`): the world engine only *carries* the function and never calls it, so it stays framework-free; game-layer code builds the DOM. A block with a UI is clickable: the scene shows a pointer cursor over it (`#app canvas.block-hover`), and a press+release without meaningful movement (5 px threshold distinguishes click from drag) opens its panel.
- The UI framework is **Preact 10 + @preact/preset-vite** (JSX/TSX, ~4 kB, hooks): chosen over React for the game's small footprint while keeping JSX and modular, reusable components. Vite config adds the preset plugin; tsconfig sets `jsx: react-jsx`, `jsxImportSource: preact`.
- The overlay (`src/game/ui/block-panel.tsx`) is a DOM layer above the canvas: a full-screen backdrop with a centered, non-full-screen panel (`width: min(560px, ...)`); clicking the backdrop or the close button dismisses it, clicks inside the panel are stopped from propagating. While open, the backdrop swallows pointer/wheel input so the camera cannot pan or zoom behind it.
- `src/game/ui/source-block-ui.tsx` builds a source's `BlockUI` by rendering a Preact panel into a host element; `molecule-panel.tsx` is the (empty) molecule-visualization placeholder - the structure rendering from `MoleculeRegistry` comes in a later step.
