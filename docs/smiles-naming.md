# SMILES-based canonical names

Design note for roadmap step 2 ("Identity & naming" in `AGENTS.md`). The
player-facing promise lives in `docs/01-molecules.typ` (canonical names use a
compact SMILES-like shorthand: ethanol `CCO`, dimethyl ether `COC`); the
theoretical background (graph isomorphism, canonicalization, stereo layers)
lives in `docs/research-chemistry.md` sections 1 and 7; the tooling
decisions live in `docs/research-game.md` section 10.

This note answers two questions for step 2:

1. What is the rough idea of SMILES (enough to read and generate names, not the
   full spec)?
2. Which library turns the game's molecular graph into a canonical SMILES
   string, and what does the game still have to compute itself?

## 1. The rough idea of SMILES

SMILES is a compact linear notation for a molecular graph. The full rules are a
spec (sources in section 5); what the game needs to know:

- **Atoms** are written as element symbols. Neutral C/N/O in the "organic
  subset" may be written bare and the missing hydrogens are inferred from
  valence (C = 4, N = 3, O = 2 hands): `CCO` is ethanol (CH3-CH2-OH), `O` is
  water, `N` is ammonia.
- **Bonds**: adjacent atoms imply a single bond; `=` is double, `#` is triple.
  `O=C=O` is carbon dioxide.
- **Branches**: `(...)` attaches to the preceding atom. `CC(C)C` is isobutane.
- **Rings**: a digit opens a ring bond on one atom and closes it on the
  matching digit later in the string. `C1CCCCC1` is cyclohexane; `%nn` for ring
  numbers above 9.
- **Disconnected pieces** (mixtures, ions, salts): `.` separates components,
  e.g. `C.O` is methane + water.
- **Bracket atoms** `[...]` are used whenever a plain symbol cannot say
  everything: explicit hydrogen count and formal charge (`[NH4+]`, `[OH-]`,
  `[H][H]` for H2), isotopes, and chirality.
- **Stereochemistry**:
  - Tetrahedral (chiral) centres use `@` / `@@` inside the bracket, relative to
    the order the four neighbours appear in the string: `N[C@@H](C)C(=O)O` vs
    `N[C@H](C)C(=O)O`.
  - Double-bond geometry (cis/trans, E/Z) uses directional bonds `/` and `\` on
    the single bonds adjacent to the double bond: `C/C=C\C` is (Z)-but-2-ene
    (cis), `C/C=C/C` is (E) (trans).
- **Canonical SMILES** is a deterministic "unique representative" string: rank
  the atoms (Morgan / extended-connectivity refinement), pick a canonical root,
  then walk the graph depth-first, emitting branches and ring closures in a
  fixed order. Two drawings of the same molecule then give the same string, so
  "same canonical name <=> same molecule" - exactly the identity requirement of
  roadmap step 2.

## 2. Use RDKit.js instead of writing the full SMILES rules

Implementing the full SMILES grammar plus canonicalization is overkill for the
game. The chemistry backend is **RDKit.js** (`@rdkit/rdkit`, BSD-3, the
official RDKit WASM build; ~3.5k GitHub stars, ~266k npm downloads/month): it
parses SMILES (including stereo tokens), canonicalizes, computes 2D
coordinates, and renders structure-diagram SVG.

- `RDKit.get_mol(input)` builds a molecule from SMILES / SMARTS / molfile /
  JSON and returns a `JSMol` handle (`.delete()` frees it).
- `mol.get_smiles()` returns a canonical, order-independent SMILES (RDKit's
  flavour: ethanol `CCO` - which matches the player docs).
- `mol.get_json()` returns a compact molecule JSON: atoms with element (`z`),
  formal charge (`chg`), implicit-H count (`impHs`) and tetrahedral sense
  (`stereo: 'cw' | 'ccw'`), bonds with order (`bo`) and double-bond geometry
  (`stereo: 'cis' | 'trans'` + `stereoAtoms`), plus aromatic atom/bond lists.
  The game reads this JSON in `parseSmiles`.
- `mol.get_svg()` returns a 2D structure-diagram SVG (white background rect
  stripped by the registry so the SVG stays transparent; the hosting panel
  supplies the background).

The WASM module loads asynchronously (`src/chem/rdkit.ts`): `initRdkit()` is
awaited once at startup (web entry, `test/setup.ts` for tests) and the module
is cached; the `.wasm` binary is resolved per environment (browser: Vite asset
via `?url`; Node: resolved next to the package on disk).

### The game's adapter (`src/chem/smiles.ts` + `src/chem/smiles-writer.ts`)

- `toSmiles(molecule, { canonical = true })` - the game serializes its own
  graph into a *valid* (not canonical) SMILES with stereo tokens
  (`src/chem/smiles-writer.ts`), feeds it to `get_mol`, and returns
  `mol.get_smiles()` (canonical). The serialized molecule is cached on the
  `Molecule` (`getRdkitMolecule()`) and invalidated by any structural
  mutation, so repeated canonicalization reuses one RDKit handle.
- `parseSmiles(smiles)` - `get_mol(smiles)` -> `get_json()` -> game graph:
  explicit hydrogens materialized from `impHs`, aromatic rings stored in
  kekulé form (alternating single/double bonds as RDKit reports them),
  tetrahedral labels from RDKit's canonical CIP data (`cipRanks`/`cipCodes`,
  see section 4.2), and double-bond geometry as plain `'cis'`/`'trans'`
  labels.

The library stays behind `src/chem/smiles.ts` (and the writer in
`src/chem/smiles-writer.ts`), so it can be swapped. Tests:
`test/smiles.test.ts` (structure-preservation + stereo round-trips) and
`test/tetrahedral.test.ts` (geometric conversion tests).

Alternatives considered and rejected:

- **`openchem`** (the previous backend, `rajeshg/openchem`): tiny (~2 stars,
  179 downloads/month, last push 2026-01), poor SVG rendering, and documented
  stereo bugs (chiral nesting cap ~42, conjugated E/Z corruption). Replaced by
  RDKit.js 2026-08-28.
- **`openchemlib`** (BSD-3, Zakodium): mature pure-JS port of OpenChemLib with
  SMILES/IDCode + `toSVG`/canvas depiction, but no IUPAC names and lower
  quality depiction than RDKit; kept as a fallback.
- **Custom emitter**: viable (Morgan canonicalization is a small pure-JS
  algorithm, `docs/research-chemistry.md` section 1) - kept as the fallback if
  the library flavour ever has to change.

## 3. Sample molecules and their canonical SMILES

Verified 2026-08-28 with RDKit.js 2025.03.4. "Common form" is the canonical
form most chemistry tools emit; with RDKit.js the game's canonical names match
the common form (and the player docs).

| Molecule | Game graph | RDKit canonical |
|---|---|---|
| methane | C | `C` |
| water | O | `O` |
| ammonia | N | `N` |
| ethanol | C-C-O | `CCO` |
| dimethyl ether | C-O-C | `COC` |
| ethene | C=C | `C=C` |
| ethyne | C#C | `C#C` |
| carbon dioxide | O=C=O | `O=C=O` |
| acetic acid | C-C(=O)-O | `CC(=O)O` |
| acetate anion | C-C(=O)-O- | `CC(=O)[O-]` |
| propan-2-ol | C-C(O)-C | `CC(C)O` |
| acetone | C-C(=O)-C | `CC(=O)C` |
| 1-propanol | C-C-C-O | `CCCO` |
| methylamine | C-N | `CN` |
| cyclohexane | C6 ring | `C1CCCCC1` |
| benzene (kekule input) | C6 ring, alternating `=` | `c1ccccc1` |
| (Z)-but-2-ene (cis) | C-C=C-C, cis | `C/C=C\C` |
| (E)-but-2-ene (trans) | C-C=C-C, trans | `C/C=C/C` |
| L-alanine | N-C(C)-C(=O)-O, one chirality | `C[C@H](N)C(=O)O` |
| D-alanine | same graph, other chirality | `C[C@@H](N)C(=O)O` |
| hydrogen | H-H | `[H][H]` |
| ammonium | N+ + 4 H | `[NH4+]` |
| hydroxide | O- + 1 H | `[OH-]` |
| glycine zwitterion | +H3N-C-C(=O)-O- | `[NH3+]CC(=O)[O-]` |

Notes on the table:

- **Canonical flavour.** RDKit's canonical form starts carbon-first for
  hetero chains, so ethanol is `CCO` and dimethyl ether `COC` - matching the
  player docs (`docs/01-molecules.typ`). No flavour decision is left open.
- **Aromaticity.** RDKit aromatizes kekule input, so game benzene (stored with
  alternating single/double bonds and no aromatic flags) canonicalizes to
  `c1ccccc1`; the parse side stores the kekulé form RDKit's JSON reports.
- **Stereo format.** `@` / `@@` and `/` / `\` are the emitted tokens, matching
  the candidate format in `docs/research-chemistry.md` section 7.
- **Chirality labels.** The table shows the two possible canonical tokens. The
  game stores a label as the four bonds in an arbitrary order under a fixed
  counterclockwise convention (mirror image = odd permutation, no direction
  field), and the writer derives `@` / `@@` for the order its own serialization
  happens to emit (`tokenForOrder`), so the same enantiomer written any valid
  way canonicalizes to the same string.

## 4. What the game still has to compute (the adapter)

The library does parsing, canonicalization and drawing; the pieces below are
implemented in `src/chem/` and were the real content of the naming work in
roadmap step 2:

1. **Graph -> SMILES writer (`src/chem/smiles-writer.ts`).** RDKit.js has no
   graph constructor, so the game serializes its own graph: bracket atoms with
   explicit H counts and charges (`[CH3]`, `[NH4+]`, `[O-]`), a DFS emitting
   branches before the continuation (so `(...)` attaches to the right atom),
   ring-closure digits for non-tree bonds, and stereo tokens (below). The
   output is valid but not canonical - `get_smiles()` canonicalizes.
2. **Chiral token mapping.** The game stores `TetrahedralStereo` as an explicit
   local-chirality label (four incident bonds in an arbitrary order, fixed
   counterclockwise winding convention; mirror image = odd permutation). The
   writer computes the four neighbours in Daylight string order (from, implicit
   H, ring-closure neighbours in digit order, branches, continuation) and calls
   `tokenForOrder` to emit `@` / `@@`. Parsing needs a *canonical*
   reference order for the label, because RDKit's JSON `'cw'`/`'ccw'` sense
   is relative to the *input string's* neighbour order and is not a canonical
   descriptor (the same enantiomer can parse to either sense). The JSON's
   `rdkitRepresentation` extension provides exactly that: `cipCodes` (R/S)
   and `cipRanks` (per-atom CIP priority, higher = higher priority). The
   parser orders each centre's four neighbours by CIP priority (implicit H
   last) and maps (R) to the mirror of that order and (S) to the order as-is
   (pinned empirically by the stereo round-trip tests). This is a single-pass
   parse - no re-serialization, no second RDKit call - and it is what makes
   ring chiral centres (proline, cholesterol, morphine, ...) round-trip and
   render wedges.
3. **E/Z token mapping.** The game stores cis / trans on the double bond. The
   writer emits equal directional tokens on both substituent single bonds for
   trans (`C/C=C/C`) and different ones for cis (`C/C=C\C`); parsing reads
   `'cis'` / `'trans'` from the JSON bond stereo. Requires exactly one
   non-hydrogen substituent on each end of the double bond (otherwise the
   game's plain cis/trans label is under-specified and serialization throws);
   a substituent bond that is a ring closure is not supported.
4. **Hydrogen folding.** The writer folds explicit H neighbours plus missing
   implicit H into each heavy atom's bracket H count; charged atoms are
   bracketed (`[NH4+]`, `[O-]`); pure-hydrogen molecules stay as `[H][H]`. The
   parser materializes parsed hydrogens as explicit atoms, matching the game's
   convention.

Known limitations (RDKit.js, this WASM build):

- Tetrahedral stereo on ring atoms is supported via the CIP-rank method
  described in 4.2 (ring chiral centres such as proline, cholesterol and
  morphine round-trip and render wedges), as long as RDKit's JSON includes the
  CIP data (cipRanks/cipCodes); centres it cannot label fall back to the
  acyclic 'cw'/'ccw' heuristic.
- Canonical SMILES generation (`get_smiles`) overflows the JS stack around
  ~500-800 atoms, and a failed call can poison the wasm instance (subsequent
  calls on the same module crash with "memory access out of bounds"). The
  exact ceiling depends on structure (measured 2026-08-28 with fresh wasm
  instances): a linear E/Z chain overflows at 559 heavy atoms (550 works),
  while a shallow-branching chiral chain still round-trips at 2696 heavy
  atoms. The stress tests sit just inside the observed limits (248 chiral
  centres = ~750 heavy atoms; 180 non-conjugated double bonds = 541 heavy
  atoms) and each asserts a generous time budget (~0.5 s observed). The
  previous openchem backend had different caps (chiral nesting ~42,
  conjugated E/Z corruption).

## 5. Sources

- Daylight Chemical Information Systems, "SMILES - A Simplified Chemical
  Language" theory manual:
  https://www.daylight.com/dayhtml/doc/theory/theory.smiles.html
  (canonicalization section 3.1; atom/bond/branch/ring grammar 3.2; isomeric
  SMILES 3.3)
- OpenSMILES specification: https://opensmiles.org/opensmiles.html
- Weininger, "SMILES, a chemical language and information system. 1.
  Introduction to methodology and encoding rules", J. Chem. Inf. Comput. Sci.
  1988, 28:31; and "SMILES. 2. Algorithm for generation of unique SMILES
  notation" (CANON + GENES) - see `docs/research-chemistry.md` section 1
- O'Boyle, "Towards a Universal SMILES representation - A standard method to
  generate canonical SMILES based on the InChI", J. Cheminform. 2012, 4:22
- RDKit.js: https://github.com/rdkit/rdkit-js ; npm package `@rdkit/rdkit`
- openchemlib (fallback): https://www.npmjs.com/package/openchemlib ;
  API docs: https://cheminfo.github.io/openchemlib-js/
