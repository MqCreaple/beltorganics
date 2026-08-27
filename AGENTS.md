# AGENTS.md — BeltOrganics

This file holds agent-facing conventions and the project roadmap. It does not repeat the chemistry theory — read the documents under `docs/` to understand the chemistry theory of the game:

- `docs/01-molecules.typ` — molecules: molecular graph, the four atoms, bonds and bond polarity, shape and stereochemistry, identity and naming, functional groups.
- `docs/02-orbitals.typ` — orbitals: orbital energy, σ and π bonding, conjugated π systems, HOMO/LUMO, orbital interactions.
- `docs/03-reactions.typ` — reactions: enthalpy, entropy, Gibbs free energy, equilibrium, side reactions, separation.
- `docs/research.md` — external references and open design questions for the chemistry engine.

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

**Status (2026-08-28):** step 1 (molecule data structure) is implemented in
`src/chem/molecule.ts` - a molecular graph on graphology with element/formal
charge on atoms, bond order on edges, tetrahedral local-chirality labels on
4-coordinate sp3 carbons, and cis/trans labels on double bonds;
implicit-hydrogen filling (`addImplicitHydrogens`), a first hybridization
labeler (`src/chem/hybridization.ts`, incl. the non-VSEPR
amide/furan/carboxylate/carbocation and conjugated-carbanion cases), and
conjugated pi-system perception (`src/chem/conjugation.ts`) are in place.

Step 2 (identity & naming) is substantially implemented:
`src/chem/smiles.ts` converts both ways between the game graph and SMILES
(`toSmiles` / `parseSmiles` over the `openchem` library, with canonical
names), tetrahedral stereochemistry is stored as explicit local-chirality
labels (`TetrahedralStereo` in `src/chem/types.ts`: the four incident bonds
in order under a fixed counterclockwise winding convention - the mirror
image is an odd permutation; `src/chem/tetrahedral.ts` provides the order
indicator, direction-from-bond and `@`/`@@` token derivation), and E/Z
geometry is supported. Stress tests live in `test/smiles.test.ts` and
`test/tetrahedral.test.ts`. Two openchem scale limits are documented (a
chiral-branch nesting cap at ~42 centres and conjugated E/Z corruption) -
see `docs/smiles-naming.md` section 6 for issue drafts. Substructure /
functional-group queries (the rest of step 2) and steps 3-5 remain open.


Design decisions inside each step are open; record chosen algorithms and their rationale in the code and in `docs/research.md`. The step-1 storage choice (graphology) and the game-engine choice (Phaser 4) are recorded in `docs/research.md` section 10.

## Repository layout & conventions

- TypeScript, ESM (`"type": "module"`), Node >= 20.
- Vite dev server / production bundler for the web app (`npm run dev` / `npm run build`); Vitest for tests (`npm test`), `tsc --noEmit` via `npm run typecheck`.
- Web app entry: `index.html` + `src/main.ts`; library entry: `src/index.ts`.
- `src/chem/` - chemistry engine (molecule data structure on graphology; canonical naming, properties, thermodynamics next).
- `src/world/` - belts, chambers, ports, simulation (future; not started).
- `docs/` — design and player docs (Typst), research notes; `docs/build/` is a git-ignored output directory for compiled PDFs/previews.
- `.agents/` — agent-only notes (e.g. `.agents/typst-chemistry-guide.md` for Typst chemistry syntax and molecule drawing with alchemist/chemformula).
- `test/` - Vitest suites (`test/*.test.ts`); run via `npm test`.
- When adding external sources or adopting an algorithm, update `docs/research.md`.