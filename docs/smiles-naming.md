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
2. Which npm library turns the game's molecular graph into a canonical SMILES
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

## 2. Use a library instead of writing the full SMILES rules

Implementing the full SMILES grammar plus canonicalization is overkill for the
game. There is a TypeScript-native npm library that converts a molecular
structure straight to canonical SMILES:

**`openchem`** (npm, MIT, ~0.2.x, first release 2026, no runtime dependencies,
works in Node and the browser; repo `rajeshg/openchem`):

- `generateSMILES({ atoms, bonds }, true)` returns a canonical, order
  independent SMILES from a plain object that maps 1:1 onto the game's
  graphology graph.
- Tetrahedral stereo via `atom.chiral = '@' | '@@'`; E/Z via
  `bond.stereo = 'up' | 'down'` on the adjacent single bonds (both verified
  below).
- Handles bracket atoms (charge, explicit H), disconnected components, ring
  closures and `%nn` ring numbers.
- Canonicalization is Morgan-based with RDKit-style tie-breaking (the author
  reports 100% RDKit agreement on a 325-molecule test set).

Mapping from the game's graph (`src/chem/types.ts`) to openchem:

| Game concept | openchem field |
|---|---|
| atom element C/H/O/N | `symbol` + `atomicNumber` (6 / 1 / 8 / 7) |
| atom `formalCharge` | `charge`; set `isBracket: true` when non-zero |
| explicit H neighbours (the game stores cations' H explicitly) | fold their count into the heavy atom's `hydrogens` and drop the H atoms from the openchem structure; keep pure-hydrogen molecules (H2) as `[H][H]` |
| bond order 1 / 2 / 3 | `type: 'single' \| 'double' \| 'triple'` |
| `TetrahedralStereo` (4 ordered bonds, fixed counterclockwise convention) | `chiral: '@' \| '@@'`, derived with `tokenForOrder` from the label and the neighbour order openchem emits (section 4) |
| `BondGeometryStereo` cis / trans | `stereo: 'up' \| 'down'` on the two single bonds adjacent to the double bond (section 4) |

Implemented (2026-08-27) in `src/chem/smiles.ts`, with the tetrahedral label
conversion helpers in `src/chem/tetrahedral.ts`:

- `toSmiles(molecule, { canonical = true })` - game graph -> canonical SMILES
  (openchem's flavour). Tetrahedral tokens are derived deterministically: one
  achiral canonical pass reveals the neighbour order openchem will emit, and
  `tokenForOrder` converts the stored label to that viewpoint (no search).
- `parseSmiles(smiles)` - SMILES -> game graph (explicit hydrogens, kekulé
  aromatic rings, tetrahedral labels built from the Daylight neighbour-order
  rule and the `@`/`@@` token).

The library stays behind that module, so it can be swapped. Tests:
`test/smiles.test.ts` (structure-preservation) and `test/tetrahedral.test.ts`
(geometric conversion tests).

Alternatives considered:

- **`openchemlib`** (BSD-3, maintained by Zakodium, mature) can build molecules
  programmatically and emit `toSmiles()` / `toIsomericSmiles()`; its flavour
  happens to match the player docs (`CCO`). But it is a GWT-transpiled Java
  port (heavy, awkward API: `new Molecule(256, 256)`, surprising bond-order
  argument handling, and a `CC(O)=O` flavour for acetic acid), so it is a
  fallback rather than the first choice.
- **`@rdkit/rdkit`**: the RDKit WASM build - extremely capable but a large,
  asynchronously loaded WASM module, and real-chemistry only.
- **Custom emitter**: viable (Morgan canonicalization is a small pure-JS
  algorithm, already referenced in `docs/research-chemistry.md` section 1) - keep as the
  fallback if the flavour decision in section 3 forces a `CCO`-style output.

Risk note: openchem is young (0.2.x, single maintainer). Keep it behind the
adapter, pin the version, and add a small round-trip test suite (build graph ->
SMILES -> parse -> same graph) so a library change is cheap.

## 3. Sample molecules and their canonical SMILES

Verified 2026-08-27 with openchem 0.2.17: each molecule was built as a plain
`{ atoms, bonds }` object (game graph shape) and passed to
`generateSMILES(mol, true)`. "Common form" is the canonical form most chemistry
tools (RDKit/PubChem) emit for the same molecule.

| Molecule | Game graph | openchem canonical | Common form |
|---|---|---|---|
| methane | C | `C` | `C` |
| water | O | `O` | `O` |
| ammonia | N | `N` | `N` |
| ethanol | C-C-O | `OCC` | `CCO` |
| dimethyl ether | C-O-C | `O(C)C` | `COC` |
| ethene | C=C | `C=C` | `C=C` |
| ethyne | C#C | `C#C` | `C#C` |
| carbon dioxide | O=C=O | `O=C=O` | `O=C=O` |
| acetic acid | C-C(=O)-O | `O=C(O)C` | `CC(=O)O` |
| acetate anion | C-C(=O)-O- | `O=C([O-])C` | `CC(=O)[O-]` |
| propan-2-ol | C-C(O)-C | `OC(C)C` | `CC(C)O` |
| acetone | C-C(=O)-C | `O=C(C)C` | `CC(=O)C` |
| 1-propanol | C-C-C-O | `OCCC` | `CCCO` |
| methylamine | C-N | `NC` | `CN` |
| cyclohexane | C6 ring | `C1CCCCC1` | `C1CCCCC1` |
| benzene (kekule input) | C6 ring, alternating `=` | `c1ccccc1` | `c1ccccc1` |
| (Z)-but-2-ene (cis) | C-C=C-C, cis | `C/C=C\C` | `C/C=C\C` |
| (E)-but-2-ene (trans) | C-C=C-C, trans | `C/C=C/C` | `C/C=C/C` |
| L-alanine | N-C(C)-C(=O)-O, one chirality | `N[C@@H](C)C(=O)O` | `N[C@@H](C)C(=O)O` |
| D-alanine | same graph, other chirality | `N[C@H](C)C(=O)O` | `N[C@H](C)C(=O)O` |
| hydrogen | H-H | `[H][H]` | `[H][H]` |
| ammonium | N+ + 4 H | `[NH4+]` | `[NH4+]` |
| hydroxide | O- + 1 H | `[OH-]` | `[OH-]` |
| glycine zwitterion | +H3N-C-C(=O)-O- | `[NH3+]CC(=O)[O-]` | `[NH3+]CC(=O)[O-]` |

Notes on the table:

- **Canonical flavour (decision needed).** openchem's canonical form starts at
  the most "hetero" atom, so ethanol is `OCC` and dimethyl ether is `O(C)C`,
  while the player docs currently promise `CCO` / `COC`. Both are valid
  canonical SMILES (same molecule <=> same string); the representative is a
  convention. Options:
  1. Adopt openchem's flavour and update the examples in
     `docs/01-molecules.typ` to `OCC` / `O(C)C`.
  2. Keep `CCO` / `COC` and implement a small custom emitter with a
     carbon-first root tie-break, using openchem as a test oracle.
  If the library is adopted, option 1 is recommended: it removes the custom
  code, and `OCC` is still perfectly readable SMILES.
- **Aromaticity.** openchem perceives aromaticity from kekule double bonds, so
  game benzene (stored with alternating single/double bonds and no aromatic
  flags, see `docs/research-chemistry.md` section 8) is emitted as `c1ccccc1`. Accepting
  that is simplest; emitting kekule (`C1=CC=CC=C1`) would need aromaticity
  perception kept off or a post-processing step. This is a step-2 decision.
- **Stereo format.** `@` / `@@` and `/` / `\` are confirmed as the emitted
  tokens, matching the candidate format in `docs/research-chemistry.md` section 7.
- **Chirality labels.** The table shows the two possible tokens. A parsed
  label stores the four bonds in the Daylight string order under a fixed
  counterclockwise convention: `@` (counterclockwise) is stored as-is, `@@`
  (clockwise) as a swapped order (an odd permutation is the mirror image), so
  no direction field is needed.

## 4. What the game still has to compute (the adapter)

The library does string generation and canonicalization; the three pieces
below are implemented in `src/chem/smiles.ts` and were the real content of the
naming work in roadmap step 2:

1. **Chiral token mapping.** The game stores `TetrahedralStereo` as an
   explicit local-chirality label: the four incident bonds in an arbitrary
   order. The winding convention is fixed (looking down `bonds[0]` from the
   substituent toward the centre, the three trailing bonds wind
   counterclockwise), so the mirror image is just an odd permutation of the
   order and no direction field is stored; `bonds` is omitted for an
   unspecified centre. Parsing builds the label from the Daylight
   neighbour-order rule (implicit-H placement, branch order) and the `@`/`@@`
   token (`@@` swaps two trailing bonds to keep the convention), so the same
   enantiomer written any valid way yields an equivalent label (compared via
   the order indicator in `src/chem/tetrahedral.ts`). Serializing derives the
   token directly:
   `toSmiles` generates the achiral canonical string, reads the order in which
   openchem emits each centre's neighbours, and calls `tokenForOrder`.
   Matching the game graph to the re-parsed string uses global iterative
   refinement (Weisfeiler-Lehman / Morgan labels with integer hashing) because
   local fingerprints are identical for every centre of a regular chain; a
   bounded per-centre correction loop then fixes any centres whose token came
   out wrong (matching is only determined up to graph automorphisms, e.g. the
   reflection of a symmetric chain or the end centres whose terminal and side
   groups swap). Caveat (verified 2026-08-27): openchem's canonicalisation
   does *not* re-derive tetrahedral tokens when it reorders atoms - the same
   enantiomer written differently can canonicalize to different tokens - which
   is exactly why the neighbour order is learned from an achiral pass instead
   of trusting openchem's token handling.
2. **E/Z token mapping.** The game stores cis / trans on the double bond. In a
   conjugated chain a single bond is shared by two double bonds, so the `up` /
   `down` tokens are solved as a constraint system along each chain
   (`token(second) = token(first) XOR (cis ? 1 : 0)`), with the phase chosen
   canonically so a re-parsed graph reproduces the same string. Verified:
   equal values on both sides emit trans `C/C=C/C`, different values emit cis
   `C/C=C\C`. 'either' / 'unspecified' emit no directional bonds. Requires
   exactly one non-hydrogen substituent on each end of the double bond
   (otherwise the game's plain cis/trans label is under-specified and
   serialization throws).
3. **Hydrogen folding.** Drop explicit H atoms attached to heavy atoms and fold
   their count into the heavy atom's `hydrogens` field; charged atoms must be
   bracketed (`[NH4+]`, `[OH-]`); keep pure-hydrogen molecules as `[H][H]`.
   The parser materializes parsed hydrogens as explicit atoms (cations keep
   theirs), matching the game's convention.

Known limitations:

- Tetrahedral stereo on ring atoms is not supported yet (the ring-closure
  neighbour order is not derivable from atom order), so ring chiral centres
  parse as 'unspecified' and serialization throws.
- openchem's canonical writer caps the nesting depth of chiral branches at
  ~42 - verified that a single chain with more than ~42 chiral centres drops
  tokens during canonicalisation (42 of 98 survive for a 100-carbon chain), so
  the longest single-chain chiral round-trip that is lossless is 42 centres.
  The conversion algorithm itself is O(n) per pass (stress tests in
  `test/smiles.test.ts`); the cap is a library limitation.
- openchem's E/Z canonicalisation corrupts *conjugated* chains with >= 3
  double bonds (verified: `C/C=C\C=C\C=C/C` is rewritten to
  `C/C=C/C=C/C=C/C`, i.e. cis becomes trans). Non-conjugated double bonds
  round-trip losslessly at scale (~500 verified), so the long-chain E/Z stress
  test uses double bonds separated by two single bonds. Documented in the
  stress-test comments.

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
- openchem (npm): https://www.npmjs.com/package/openchem ;
  repository: https://github.com/rajeshg/openchem
- openchemlib (npm): https://www.npmjs.com/package/openchemlib ;
  API docs: https://cheminfo.github.io/openchemlib-js/

## 6. Known openchem issues (candidates for upstream bug reports)

Three reproducible openchem bugs were found while building and stress-testing
the conversions (2026-08-28, openchem 0.2.17). Each has a minimal
reproduction, the expected result and the observed result, ready to be turned
into a GitHub issue.

### Issue 1: canonical writer drops chiral tokens beyond ~42 nested branches

- **Reproduction:** build a linear carbon chain of length N (e.g. 100) with
  an ethyl side group on every interior carbon and a tetrahedral label on
  every interior centre (98 centres at N = 100), then call
  `generateSMILES(molecule, true)`.
- **Expected:** all N - 2 chiral tokens (`[C@H]` / `[C@@H]`) are emitted.
- **Observed:** only 42 tokens survive (verified at N = 50 and N = 100). The
  canonical form is a deeply nested branch (`CC[C@H]([C@H](CC)...`) and the
  writer stops at a nesting depth of about 42. Independent of the token
  pattern (all `@` or random).
- **Impact:** a single molecule with more than ~42 chiral centres cannot be
  canonicalised losslessly, so long chiral chains cannot round-trip.

### Issue 2: conjugated E/Z canonicalisation rewrites cis to trans

- **Reproduction:** `parseSMILES("C/C=C\C=C\C=C/C")` followed by
  `generateSMILES(molecule, true)`.
- **Expected:** the double-bond geometry is preserved.
- **Observed:** `C/C=C/C=C/C=C/C` - the cis double bonds become trans. Chains
  with 2 double bonds (`C/C=C\C=C/C`) are preserved; non-conjugated double
  bonds are preserved at any tested scale (~500).
- **Impact:** conjugated chains (alternating single/double bonds) with 3 or
  more double bonds lose their E/Z geometry, so they cannot round-trip.

### Issue 3: tetrahedral tokens are not re-derived when atoms are reordered

- **Reproduction:** the same enantiomer written in different valid SMILES
  canonicalises to different tokens. L-alanine written as
  `N[C@@H](C)C(=O)O` stays `N[C@@H](C)C(=O)O`, but `N[C@H](C(=O)O)C` (also
  L-alanine) canonicalises to `N[C@H](C)C(=O)O`.
- **Expected:** both forms canonicalise to the same string (the token is
  re-derived for the new neighbour order).
- **Observed:** the `@`/`@@` token is kept verbatim while the neighbour order
  is rewritten, silently flipping the enantiomer (3 of the 5 Daylight
  L-alanine forms canonicalise to a D-alanine form).
- **Impact:** two valid SMILES of the same enantiomer get different canonical
  names; the game works around this by interpreting stereo itself (section 4).
