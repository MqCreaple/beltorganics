# AGENTS.md — BeltOrganics

This file holds agent-facing conventions and the project roadmap. It does not repeat the chemistry theory — read the documents under `docs/` to understand the chemistry theory of the game:

- `docs/01-molecules.typ` — molecules: molecular graph, the four atoms, bonds and bond polarity, shape and stereochemistry, identity and naming, functional groups.
- `docs/02-orbitals.typ` — orbitals: orbital energy, σ and π bonding, conjugated π systems, HOMO/LUMO, orbital interactions.
- `docs/03-reactions.typ` — reactions: enthalpy, entropy, Gibbs free energy, equilibrium, side reactions, separation.
- `docs/research-chemistry.md` — chemistry-engine research: external references, algorithm notes and open design questions.
- `docs/research-game.md` — game-related research: design precedents, tooling and world/game-shell decisions.

Keep these docs in sync whenever the design changes. To write chemistry content in Typst, see `.agents/typst-chemistry-guide.md` (the player docs use the `ilm` template: cover page, table of contents, numbered headings, figure/table indices).

## Working with the user

Whenever you think an instruction is unclear or wrong, stop and ask for
clarification instead of carrying on in a potentially wrong direction. State
your need clearly. It is much cheaper to catch a misunderstanding before work
starts than to rework it afterwards.

## Project overview

**BeltOrganics** is a factory-style game built with Node.js and themed around organic chemistry. Instead of moving generic objects between deterministic machines, the player:

- moves **molecules** on **conveyor belts**,
- reacts them inside **reaction chambers**,
- copes with **stochastic outcomes**: unexpected side reactions, and
- takes explicit actions to **separate the desired product** from mixtures.

The chemistry is a *pseudo-chemistry*: a simplified, internally consistent system inspired by real organic chemistry, set in a universe whose physical rules differ slightly from ours. Behaviour is emergent from properties and thermodynamics rather than hand-written recipes; functional groups must behave plausibly (e.g. acids are acidic, not basic); and calculations must be cheap enough to run at game scale.

The four elements have invented names — **Cardinium (C)**, **Habitium (H)**, **Obligium (O)** and **Naturium (N)** — and inorganic compound names that derive from the elements are built from them rather than from the real element names: carbon dioxide is *cardinium diobligide*, carbonic acid is *cardinic acid*. Two-element compounds take the name of the greedier element with an *-ide* ending (cardinium diobligide = CO2, dihabitium obligide = water); acids use *-ic acid* (cardinic acid = H2CO3). Organic compounds keep their familiar names (ethanol, benzene, ...). The player docs give the familiar real-world name in parentheses at first mention.

## Roadmap (next steps)

1. **Molecule data structure** — a molecular graph (atoms as nodes with element and charge; bonds as edges with bond order), chosen to support canonical naming and property computation.
2. **Identity & naming** — canonical, orientation-independent names; distinguish isomers; support substructure / functional-group queries.
3. **Property computation** — bond strengths, partial charges on each atom, HOMO/LUMO (and gap), etc.
4. **Reaction thermodynamics** — ΔH, ΔS, ΔG; then equilibrium/kinetics and stochastic side-reaction generation.
5. **World simulation** — belts, chambers, ports, phases, solvents, solubility, separation.

**Status (2026-08-28):** step 1 (molecule data structure) is implemented in `src/chem/molecule.ts` - a molecular graph on graphology with element/formal charge on atoms, bond order on edges, tetrahedral local-chirality labels on 4-coordinate sp3 carbons, and cis/trans labels on double bonds; implicit-hydrogen filling (`addImplicitHydrogens`), a first hybridization labeler (`src/chem/hybridization.ts`, incl. the non-VSEPR amide/furan/carboxylate/carbocation and conjugated-carbanion cases), and conjugated pi-system perception (`src/chem/conjugation.ts`) are in place.

Step 2 (identity & naming) is substantially implemented: `src/chem/smiles.ts` converts both ways between the game graph and SMILES (`toSmiles` / `parseSmiles` over the `@rdkit/rdkit` WASM library, with canonical
names), tetrahedral stereochemistry is stored as explicit local-chirality labels (`TetrahedralStereo` in `src/chem/types.ts`: the four incident bonds in order under a fixed counterclockwise winding convention - the mirror image is an odd permutation; `src/chem/tetrahedral.ts` provides the order indicator, direction-from-bond and `@`/`@@` token derivation), and E/Z geometry is supported; ring chiral centres (proline, cholesterol, morphine, ...) round-trip and render wedge bonds, ordered by RDKit's canonical CIP ranks (`cipRanks`/`cipCodes`) as described in `docs/smiles-naming.md` section 4. Stress tests live in `test/smiles.test.ts` and `test/tetrahedral.test.ts`. RDKit.js scale limits are documented (canonical SMILES generation overflows the WASM/JS stack around ~500-800 atoms, and a failed call can poison the wasm instance) - see `docs/smiles-naming.md`. Substructure / functional-group queries (the rest of step 2) remain open.

Step 3 (property computation) has started: `src/chem/partial-charges.ts` implements an eight-pass, topology-only Gasteiger-Marsili / PEOE partial-charge model with hybridization-dependent parameters. It initializes from formal charges, applies simultaneous per-bond transfers, and conserves each disconnected component's formal charge exactly. `src/chem/geometry.ts` builds a deterministic display conformer from sp/sp2/sp3 geometry, stored tetrahedral parity and cis/trans labels. The interactive Three.js molecule viewer renders ball-and-stick or space-filling models and applies Structure, Hybridization, Charge, qualitative Electron cloud and pi-orbital overlays directly to the 3D atoms; there is no numbered atom list. HOMO/LUMO energies and wavefunctions and the remaining property calculators are still open; the pi-orbital layer visualizes perceived conjugated p orbitals, not a computed HOMO/LUMO.

World groundwork (2026-08-28): step 5 has started. `src/world/` records the map as an infinite grid in 16x16 chunks (`chunk.ts`, `world.ts`), one block per cell, with the first block kind - chemical source (`blocks.ts`, a single `formula` property holding the substance's SMILES). `src/chem/registry.ts` keeps the global SMILES -> molecule-graph map (every molecule is stored as its SMILES string; graphs are parsed once and cached) plus the lazily rendered structure-diagram SVG and the substance-name cache (common name from PubChem `Title`, else IUPAC, with NCI CIR filling missing fields; each name records its source and is persisted to localStorage so reloads reuse it and CIR-sourced names upgrade to PubChem's once it answers; used for source labels). `src/game/` is the Phaser 4 game shell (`game.ts` wraps `Phaser.Game`, `scene.ts` renders the gray infinite grid, chunk borders and source squares with SMILES labels, and handles scroll zoom, drag and WASD pan; `camera.ts` holds the framework-free view math). Player-facing docs: `docs/game-world.md`; decisions: `docs/research-game.md` section 11. The world/chemistry layers stay framework-free. Blocks may carry an optional UI panel (`BlockUI`, `src/world/types.ts`): clickable blocks show a pointer cursor and open a centered HUD overlay built with Preact/TSX (`src/game/ui/`, closed by click-outside or the Escape keyboard shortcut recorded in `src/game/shortcuts.ts`); the molecule panel embeds the interactive Three.js viewer while the cached RDKit SVG remains available for lightweight 2D icons; each `Molecule` caches its RDKit representation (`getRdkitMolecule`), invalidated by any structural mutation so graph <-> RDKit conversions are reused.

Design decisions inside each step are open; record chosen algorithms and their rationale in the code and in `docs/research-chemistry.md`. The step-1 storage choice (graphology) and the game-engine choice (Phaser 4) are recorded in `docs/research-game.md` section 10.

## Repository layout & conventions

- TypeScript, ESM (`"type": "module"`), Node >= 20.
- Vite dev server / production bundler for the web app (`npm run dev` / `npm run build`); Vitest for tests (`npm test`), `tsc --noEmit` via `npm run typecheck`.
- Web app entry: `index.html` + `src/main.ts`; library entry: `src/index.ts`.
- `src/chem/` - chemistry engine (molecule graph, canonical naming, partial charges and topology-derived 3D display geometry; `registry.ts` global SMILES-to-graph map + lazy structure-diagram SVG cache, `smiles-writer.ts` game graph -> SMILES writer and `rdkit.ts` WASM loader behind `Molecule.getRdkitMolecule`).
- `src/world/` - world simulation (started: infinite chunked grid, blocks incl. chemical source; belts/chambers/ports next).
- `src/game/` - Phaser 4 game shell (`game.ts` wraps Phaser.Game; `scene.ts` renders grid/blocks + input/HUD; `camera.ts` framework-free view math).
- `docs/` — design and player docs (Typst), research notes; `docs/build/` is a git-ignored output directory for compiled PDFs/previews.
- `.agents/` — agent-only notes (e.g. `.agents/typst-chemistry-guide.md` for Typst chemistry syntax and molecule drawing with alchemist/chemformula).
- `test/` - Vitest suites (`test/*.test.ts`); run via `npm test`.
- When adding external sources or adopting an algorithm, update `docs/research-chemistry.md`; record game/tooling decisions in `docs/research-game.md`.
