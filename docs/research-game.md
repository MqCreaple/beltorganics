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

### Molecule-structure libraries on npm (storage: evaluated, not adopted)

- **openchemlib** (https://www.npmjs.com/package/openchemlib) - mature JS port of the OpenChemLib Java library (maintained by Zakodium): molecular graph, stereochemistry (R/S, E/Z), canonical SMILES, descriptors. Not adopted for storage: hardwired to the real periodic table and real chemical heuristics; GWT-transpiled Java is heavy and not idiomatic TypeScript.
- **@rdkit/rdkit** (https://www.npmjs.com/package/@rdkit/rdkit) - the official RDKit WASM build. Not adopted for storage (large async WASM, real-chemistry oriented); adopted as the naming/rendering backend (see below), where real element letters C/H/O/N are exactly what SMILES/SVG need.
- **openchem** (https://www.npmjs.com/package/openchem) - a tiny, single-maintainer 2026 library briefly used for SMILES; replaced by RDKit.js (poor SVG, stereo bugs - see below).

The game needs invented elements (Cardinium, Habitium, Obligium, Naturium) with custom parameters and cheap property computation, so molecule *storage* is built on a general graph library (graphology) instead of a real-chemistry one; real-chemistry libraries are only used for string/SVG output, where the element letters already match.

### Graph-storage library (adopted)

- **graphology** (https://github.com/graphology/graphology) - actively maintained (~1M weekly downloads), ships TypeScript types, supports attributes on nodes and edges (element/charge/stereo on atoms, bond order/stereo on bonds), is event-driven, and has a standard library (traversals, connected components, ...) that will serve ring perception and conjugated-pi detection later. Molecule graphs are graphology graphs; chemistry semantics live in `src/chem/` on top of the plain graph, so the storage layer can be swapped without touching the chemistry code.

### Game engine (adopted 2026-08-28: Phaser 4.2.1)

- **Phaser 4** (https://phaser.io/) - the current 2D web game framework (v4.2.1, July 2026), TypeScript declarations, scenes/tilemaps/sprites/input out of the box; a good fit for the planned 2D top-down conveyor-belt factory. Alternatives: PixiJS v8 (rendering only, more plumbing) and Excalibur (TypeScript-native but smaller ecosystem). Phaser 4.2.1 was added as a dependency when the game layer started (2026-08-28); the chemistry and world engines stay framework-free so they run in Node tests and the browser alike.

### Toolchain

- TypeScript + Vite for the web app (`npm run dev` / `npm run build`), Vitest for tests (`npm test`). `src/chem/` is pure logic with no DOM dependency, so the engine is testable in Node and usable in the browser. Three.js is isolated to `src/game/ui/molecule-viewer-3d.tsx`.

### SMILES generation, parsing & structure diagrams (roadmap step 2, 2026-08-28)

The chemistry backend is **RDKit.js** (`@rdkit/rdkit`, BSD-3; the official RDKit WASM build, ~3.5k GitHub stars, ~266k npm downloads/month; repo `rdkit/rdkit-js`). Full note and verified sample outputs: `docs/smiles-naming.md`.

- `RDKit.get_mol(input)` builds a `JSMol` from SMILES / SMARTS / molfile / JSON; the module loads asynchronously once via `initRdkit()` (`src/chem/rdkit.ts`), with the 6.9 MB `.wasm` resolved as a Vite asset in the browser and a disk path in Node.
- `mol.get_smiles()` - canonical, order-independent SMILES (RDKit flavour: ethanol `CCO`, matching the player docs).
- `mol.get_json()` - the molecule JSON `parseSmiles` reads: atoms (element `z`, charge `chg`, implicit-H `impHs`, tetrahedral sense `cw`/`ccw`), bonds (order `bo`, E/Z `cis`/`trans` + `stereoAtoms`), aromatic atom/bond lists, and a `rdkitRepresentation` extension with canonical CIP ranks (`cipRanks`) and R/S codes (`cipCodes`).
- `mol.get_svg()` - structure-diagram SVG; the registry strips the white background so the SVG stays transparent and the hosting panel supplies the light background.
- `toSmiles` serializes the game graph with the game's own writer (`src/chem/smiles-writer.ts`: bracket atoms with H counts/charges, ring closures, `@`/`@@` via `tokenForOrder`, E/Z via `/` `\`) and canonicalizes with `get_smiles`; the RDKit handle is cached on the `Molecule` (`getRdkitMolecule`) and invalidated by any structural mutation.
- `parseSmiles` materializes explicit hydrogens, stores kekulé rings, builds `TetrahedralStereo` labels from RDKit's canonical CIP ranks (`cipRanks`/`cipCodes`) and cis/trans labels from the JSON bond stereo.

Why not openchem: the previous backend (`rajeshg/openchem`) is a tiny (~2 stars, ~179 npm downloads/month, last push 2026-01), single-maintainer library with poor SVG output and stereo bugs (chiral nesting cap ~42, conjugated E/Z corruption). RDKit.js is the de-facto reference implementation and fixes both.

RDKit.js scale limits (measured 2026-08-28 with fresh wasm instances; documented in `docs/smiles-naming.md` and the stress-test comments): canonical `get_smiles` overflows the JS stack around ~500-800 atoms (a linear E/Z chain at 559 heavy atoms, a shallow-branching chiral chain not until far beyond 2696), and a failed call can poison the wasm instance. The stress tests sit just inside the observed limits (248 chiral centres = ~750 heavy atoms; 180 non-conjugated double bonds = 541 heavy atoms) and assert a generous time budget.

### Interactive molecule viewer (adopted 2026-08-29: Three.js 0.185)

- **Three.js** renders the molecule panel's actual 3D scene. `OrbitControls` provides direct drag rotation, wheel/pinch zoom, damping and reset; a `ResizeObserver` keeps the WebGL canvas fitted to the panel. The renderer, controls, animation frame, geometries, materials and WebGL context are explicitly disposed when the panel closes.
- `src/chem/geometry.ts` stays renderer-independent. It makes a deterministic display conformer from molecular topology: graph traversal initializes sp (180 degree), sp2 (120 degree) and sp3 (tetrahedral) directions; stored tetrahedral parity and cis/trans bond labels choose the correct handedness/side; bond-order-adjusted springs close rings and a bounded non-bonded repulsion prevents overlap. This is a fast visual conformer, not a physical force-field minimum or transition-state calculation.
- The viewer supports ball-and-stick and space-filling representations. Property controls change the 3D model itself: Structure uses element colors; Hybridization uses sp/sp2/sp3 colors; Charge maps PEOE values from blue through neutral gray to red; Electron cloud adds qualitative translucent van der Waals shells; pi orbitals add opposite-phase lobes on atoms in the perceived conjugated systems. Hover identifies the spatial atom and its active property without exposing graph ids or numbered labels.
- The pi-orbital overlay is deliberately not called HOMO/LUMO: it visualizes which p orbitals participate in conjugation and their two phases. Actual frontier-orbital energies, eigenvectors and density surfaces require the planned Huckel solver. Likewise, the electron-cloud shell is qualitative, not a quantum density isosurface. The labels in the UI and player/research docs preserve this boundary.
- RDKit's cached SVG remains the cheap 2D representation for future belt icons and dense UI lists, as planned. The WebGL scene is created only inside an opened molecule panel.



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
- `npm run build` notes: the RDKit WASM glue imports Node's `fs`/`crypto` in browser-externalized paths (Vite warns; harmless), and `src/chem/rdkit.ts` loads the 6.9 MB `.wasm` as a Vite asset in the browser (a disk path in Node; `initRdkit()` is awaited at startup). With Three.js, the bundle is ~2.1 MB JS + 6.9 MB wasm - fine for a dev-stage game, but the viewer should become a lazy chunk before production.

### Blocks

- `Block` interface + `ChemicalSourceBlock` (`src/world/blocks.ts`): one block per cell; the source carries only its formula (SMILES). Belts/chambers come later; the block API is designed so they slot in as new kinds.

### Block UI panels & the UI framework (2026-08-28)

- `Block` gains an optional `ui?: BlockUI` where `BlockUI = () => HTMLElement` (`src/world/types.ts`): the world engine only *carries* the function and never calls it, so it stays framework-free; game-layer code builds the DOM. A block with a UI is clickable: the scene shows a pointer cursor over it (`#app canvas.block-hover`), and a press+release without meaningful movement (5 px threshold distinguishes click from drag) opens its panel.
- The UI framework is **Preact 10 + @preact/preset-vite** (JSX/TSX, ~4 kB, hooks): chosen over React for the game's small footprint while keeping JSX and modular, reusable components. Vite config adds the preset plugin; tsconfig sets `jsx: react-jsx`, `jsxImportSource: preact`.
- The overlay (`src/game/ui/block-panel.tsx`) is a DOM layer above the canvas: a full-screen backdrop with a centered, non-full-screen panel (`width: min(560px, ...)`); clicking the backdrop or the close button dismisses it, clicks inside the panel are stopped from propagating. While open, the backdrop swallows pointer/wheel input so the camera cannot pan or zoom behind it.
- `src/game/ui/source-block-ui.tsx` builds a source's `BlockUI` by rendering a Preact panel into a host element; `molecule-panel.tsx` renders the substance's structure formula as an SVG. Rendering goes through the registry: `MoleculeRegistry.renderSvg` (`src/chem/registry.ts`) renders lazily via RDKit's `get_svg` and caches the diagram per SMILES string, tied to the molecule's cached RDKit handle (`Molecule.getRdkitMolecule`, invalidated by any structural mutation), so repeated opens never re-parse or re-render. The diagram is drawn from a molblock round-trip (`get_mol(molblock)`), because RDKit only assigns explicit wedge/dash bond directions when serializing a chiral centre - its plain `get_svg` on a SMILES-built molecule misses one of the two wedge directions.
- Source-block labels show each substance's **name** instead of its raw SMILES. `MoleculeRegistry.fetchSubstanceName` resolves names from PubChem's PUG REST API (`.../property/Title,IUPACName/JSON` - common `Title` preferred, IUPAC as fallback), with the NCI Chemical Identifier Resolver (`.../names`, then `.../iupac_name`) filling any field PubChem leaves empty. Every resolved name records its source (PubChem or CIR) and is persisted in the registry's name cache - **localStorage in the browser** (key `beltorganics:substance-names`; a bare string means PubChem, CIR-sourced names carry a source marker), in-memory elsewhere. Reloads reuse the stored mapping instead of hitting the network, and a CIR-sourced name is re-checked against PubChem on the next lookup, so it upgrades to PubChem's name once the API is available (this also avoids PubChem rate limits, `PUGREST.ServerBusy`). Names are sanitized (Markush markup such as `$l^{1}-azane` is rejected). The scene triggers the lookup when a source label is created and swaps the text in as it resolves.
