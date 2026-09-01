# BeltOrganics

A factory-style game with an organic-chemistry-inspired **pseudo-chemistry**,
built with TypeScript and Vite for the web.

Instead of moving objects between deterministic machines, you move **molecules**
on **conveyor belts**, react them in **reaction chambers**, cope with
**unexpected side reactions**, and **separate** the products you actually want.

The chemistry is a simplified, internally consistent invented system (see
`AGENTS.md` for the full spec): nine supported pseudo-elements — **Cardinium (C)**,
**Habitium (H)**, **Obligium (O)**, **Naturium (N)**, B and the halogens —
with centralized element properties and bond-energy
thermodynamics, temperature-driven Gibbs free energy, phase/solvent-typed
belts, and solubility-based separation.

## Status

Chemistry engine (roadmap steps 1-3 in `AGENTS.md`) lives in `src/chem/`:

- **Molecule data structure** on [graphology](https://graphology.github.io/):
  element and formal charge on atoms, bond order on edges, explicit
  four-bond tetrahedral stereo tuples on 4-coordinate sp3 carbons, and local
  cis-reference bond pairs on double bonds. It fills implicit hydrogens (`addImplicitHydrogens`),
  labels hybridization of every non-hydrogen atom (`src/chem/hybridization.ts`,
  incl. the non-VSEPR amide N, furan O, carboxylate, carbocation and
  conjugated-carbanion cases), and perceives conjugated pi systems with their
  electron counts (`src/chem/conjugation.ts`, incl. separate systems for the
  two perpendicular pi bonds of a triple bond, coordinated 90 degrees apart in the viewer).
- **SMILES conversion** backed by **RDKit.js** (`@rdkit/rdkit`, the official
  WASM build): `parseSmiles` / `toSmiles` round-trip with full
  stereochemistry - including **ring chiral centres** (proline, cholesterol,
  morphine, ...), which are ordered by RDKit's canonical CIP ranks so they
  round-trip and render wedge/dash bonds. See `docs/smiles-naming.md`.
- **Registry** (`src/chem/registry.ts`): the global SMILES -> molecule-graph
  map, lazily rendered structure-diagram SVGs per substance, and a
  substance-name cache (common name from PubChem, else IUPAC, with the NCI CIR
  resolver as fallback) used for source labels.
- **Partial charges** (`src/chem/partial-charges.ts`): an eight-pass,
  graph-derived PEOE model with hybridization-specific parameters, exact
  formal-charge conservation, and no molecule-specific lookup table.

The game layer runs on **Phaser 4** (4.2.1; see `docs/research-game.md`
section 10 for the decision). The world is an infinite grid recorded in 16x16
chunks (`src/world/`); chemical source blocks hold a substance's SMILES, are
clickable, and open a centered panel (built with Preact/TSX in `src/game/ui/`)
showing the substance name, formula and SMILES above a draggable, zoomable 3D
molecule. The viewer switches between ball-and-stick and overlapping van der Waals space-filling models;
Structure, Hybridization, Charge, Electron cloud and merged, color-grouped pi-orbital overlays color
or shape the model itself without numbered atom references. Generated coordinates are registry-cached,
and hovering a pi surface shows its orbital ID, atom count and electron count beside the pointer. Merged surfaces use a fixed physical marching-cubes grid spacing, while the opposite lobe reuses a mirrored copy of the generated geometry.
Player-facing docs: `docs/game-world.md`.

## Quickstart

```sh
npm install     # dependencies (RDKit.js WASM, Phaser 4, Three.js, Preact, ...)
npm test        # vitest
npm run dev     # vite dev server
npm run build   # typecheck + production build (dist/)
```

The chemistry engine is pure logic with no DOM dependency, so it runs in Node
tests and the browser alike.

## Controls

- Scroll: zoom toward the cursor
- Drag or W/A/S/D: pan
- Click a green chemical source: open its panel (interactive 3D property
  layers, name, formula and SMILES table)
- Escape or click outside: close the panel (shortcuts are recorded in
  `src/game/shortcuts.ts`)

## Layout

- `AGENTS.md` - design spec and agent conventions (read this first)
- `docs/` - design and player docs (Typst), research notes
  (`docs/research-chemistry.md`, `docs/research-game.md`)
- `src/index.ts` - library entry
- `src/main.ts` - web app entry (full-screen game canvas)
- `src/chem/` - chemistry engine (molecule data structure on graphology;
  SMILES via RDKit.js; hybridization, conjugation, PEOE partial charges and
  topology-derived display conformers; further properties planned)
- `src/math/` - reusable Three.js `Vector3` rotations, plane fitting,
  constraints, distances and related geometry operations
- `src/world/` - world simulation (infinite chunked grid, blocks; belts,
  chambers, ports next)
- `src/game/` - Phaser 4 game shell (grid, camera, input, HUD), the Preact/TSX
  UI panels and Three.js molecule viewer (`src/game/ui/`), plus the shortcut registry
  (`src/game/shortcuts.ts`)
- `test/` - Vitest suites
