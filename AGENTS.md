# AGENTS.md — BeltOrganics

This file holds agent-facing conventions and the project roadmap. It does not repeat the chemistry theory — read the documents under `docs/` to understand the chemistry theory of the game:

- `docs/01-molecules.typ` — molecules: molecular graph, the four atoms, bonds and bond polarity, shape and stereochemistry, identity and naming, functional groups.
- `docs/02-orbitals.typ` — orbitals: orbital energy, σ and π bonding, conjugated π systems, HOMO/LUMO, orbital interactions.
- `docs/03-reactions.typ` — reactions: enthalpy, entropy, Gibbs free energy, equilibrium, side reactions, separation.
- `docs/research.md` — external references and open design questions for the chemistry engine.

Keep these docs in sync whenever the design changes. To write chemistry content in Typst, see `.agents/typst-chemistry-guide.md` (the player docs use the `ilm` template: cover page, table of contents, numbered headings, figure/table indices).

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

Design decisions inside each step are open; record chosen algorithms and their rationale in the code and in `docs/research.md`.

## Repository layout & conventions

- Node.js, ESM (`"type": "module"`), Node >= 20.
- `src/chem/` — chemistry engine (molecules, canonical naming, properties, thermodynamics).
- `src/world/` — belts, chambers, ports, simulation (future).
- `docs/` — design and player docs (Typst), research notes; `docs/build/` is a git-ignored output directory for compiled PDFs/previews.
- `.agents/` — agent-only notes (e.g. `.agents/typst-chemistry-guide.md` for Typst chemistry syntax and molecule drawing with alchemist/chemformula).
- `test/` — tests with `node:test`; run via `npm test`.
- When adding external sources or adopting an algorithm, update `docs/research.md`.