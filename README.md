# BeltOrganics

A factory-style game with an organic-chemistry-inspired **pseudo-chemistry**,
built with Node.js.

Instead of moving objects between deterministic machines, you move **molecules**
on **conveyor belts**, react them in **reaction chambers**, cope with
**unexpected side reactions**, and **separate** the products you actually want.

The chemistry is a simplified, internally consistent invented system (see
`AGENTS.md` for the full spec): four elements for now — **Cardinium (C)**, **Habitium (H)**, **Obligium (O)**, **Naturium (N)** — with bond-energy
thermodynamics, temperature-driven ΔG, phase/solvent-typed belts, and
solubility-based separation.

## Status

Project scaffolding only. The chemistry engine (molecular graph, canonical
naming, property computation, thermodynamics) is the active design step — see
the roadmap in `AGENTS.md` and the research notes in `docs/research.md`.

## Quickstart

```sh
npm install   # no runtime deps currently
npm test      # node:test
npm start     # prints the banner
```

## Layout

- `AGENTS.md` — design spec and agent conventions (read this first)
- `docs/research.md` — curated external references for the chemistry engine
- `src/chem/` — chemistry engine (planned: molecules, naming, properties, thermo)
- `src/world/` — world simulation (planned: belts, chambers, ports)
- `test/` — `node:test` suites