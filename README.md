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
TypeScript) is scaffolded. Next up: canonical naming (roadmap step 2).

The game layer will run on **Phaser 4**; it is chosen but not yet a dependency
(see `docs/research.md` section 10 for the decision).

## Quickstart

```sh
npm install     # graphology + dev tooling
npm test        # vitest
npm run dev     # vite dev server
npm run build   # typecheck + production build (dist/)
```

## Layout

- `AGENTS.md` - design spec and agent conventions (read this first)
- `docs/` - design and player docs (Typst), research notes (`docs/research.md`)
- `src/index.ts` - library entry
- `src/main.ts` - web app entry (placeholder UI for the chemistry engine)
- `src/chem/` - chemistry engine (molecule data structure; naming, properties,
  thermodynamics planned)
- `src/world/` - world simulation (planned: belts, chambers, ports)
- `test/` - Vitest suites
