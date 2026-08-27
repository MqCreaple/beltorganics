# Research notes — chemistry engine for BeltOrganics

Curated external references relevant to the design in `AGENTS.md`. Each entry
notes why it matters for this project. Links were gathered 2026-08-27; if a
link dies, search for the title.

## 1. Molecule representation & naming (identity, canonical forms)

A molecule is a *graph*: atoms are vertices (element, formal charge), bonds are
edges (bond order). The hard parts are deciding "same molecule" regardless of
orientation/rotation (graph isomorphism) and generating a unique name
(canonical labeling).

- **Martin Vogt, "Algorithms in Cheminformatics" (lecture slides, TU München)**
  https://bigchem.eu/sites/default/files/Martin_Vogt_algorithms_in_cheminformatics_150519.pdf
  Graph isomorphism as the definition of "same molecule", canonical naming,
  Morgan-style extended connectivity, substructure (fragment) search. Directly
  maps to roadmap items 1–3.

- **SMILES & unique SMILES (Weininger 1988; CANGEN)**
  https://www.tbi.univie.ac.at/papers/Abstracts/gil_dipl
  SMILES turns a molecular graph into a line string; *unique* SMILES uses
  canonical atom ranking so that isomorphic graphs produce the same string —
  then equality reduces to string comparison. A good template for a
  "canonical pseudo-SMILES" notation for the game.

- **Morgan algorithm (extended connectivity, 1965) / ECFP fingerprints**
  https://core.ac.uk/download/574066807.pdf
  Iteratively re-rank atoms by the multiset of neighbour labels; the resulting
  canonical ranking is simple to implement (pure JS, no deps) and is the basis
  of both canonical SMILES and fingerprints.

- **InChI (IUPAC International Chemical Identifier)**
  https://en.wikipedia.org/wiki/InChI
  Industry-standard unique identifier built from the molecular graph, layered by
  connectivity / charge / isotopes / stereochemistry. A "layered" pseudo-name
  (graph layer, charge layer, ...) is a nice model for in-game names that
  distinguish isomers while ignoring orientation.

- **Weisfeiler–Lehman refinement / canonical labeling (nauty, bliss)**
  https://achs-prod.acs.org/doi/10.1021/acs.jcim.1c01192
  Discussion of canonicalization in cheminformatics (template sizes,
  exclusivity). WL refinement is the modern graph-ML cousin of Morgan's
  algorithm; nauty/bliss (McKay & Piperno) are the exact-solvers of last resort
  for hard isomorphism cases.

- **Formal charges & octet rule (Lewis structures)**
  http://www.chem.umd.edu/courses/chem233/Handouts&Topics/edot.pdf
  Counting valence electrons, satisfying octets, assigning formal charge
  (FC = valence − lone-pair electrons − bonds/2). Useful to validate that
  generated molecules are "legal" under the game's electron rules.

## 2. Bond energies

- **MSU Organic Chemistry — bond energy tables (average bond dissociation
  enthalpies)**
  https://www2.chemistry.msu.edu/faculty/reusch/OrgPage/bndenrgy.htm
  Tables of single/multiple bond energies (C–C 83, C=C 146, C–O 85.5, C=O ~177,
  H–C 99, H–O 111 kcal/mol, ...). The design decision "energy depends only on
  bond type" is exactly the *average* bond enthalpy approximation used here —
  great reference for picking the game's per-bond-type energy table.

- **Ellison, "Bond Dissociation Energies of Organic Molecules", Acc. Chem. Res.
  2003**
  https://www2.chemistry.msu.edu/courses/cem850/handouts/Ellison_BDEs.pdf
  Shows that real BDEs vary with substituents (e.g. H–CH3 103 vs H–tBu 93
  kcal/mol) — useful to know *where* the game intentionally simplifies.

- **Georgia Southern libguide, "6.1 Bond Energy"**
  https://georgiasouthern.libguides.com/c.php?g=1074545&p=7874485
  Another table (H–H, C=C, C=O aldehyde vs ketone vs ester) if you want
  carbonyl-type differentiation later.

## 3. Partial charges on atoms

- **Gasteiger & Marsili, "A New Model for Calculating Atomic Charges in
  Molecules" (PEOE), Tetrahedron Lett. 1978**
  https://www.sciencedirect.com/sdfe/pdf/download/eid/1-s2.0-S0040403901949779/first-page-pdf
  Partial Equalization of Orbital Electronegativity: iteratively transfer
  charge between bonded atoms so effective electronegativity equalizes,
  χ = a + b·q + c·q², with a damping factor (≈0.5 per iteration). Needs only
  the molecular graph — perfect for pseudo-chemistry, and it reproduces
  qualitative trends (electron-rich/poor atoms, acidity trends).

- **gasteiger-rs crate (theory recap + implementation notes)**
  https://docs.rs/crate/gasteiger-rs/latest
  Zero-dependency implementation summary: hybridization detection from
  connectivity/bond orders, 6 iterations, formal-charge handling. A good
  reference for porting the algorithm to JS.

- **sdfrust gasteiger.rs source**
  https://docs.rs/sdfrust/latest/src/sdfrust/descriptors/gasteiger.rs.html
  Readable Rust implementation of the iterative PEOE loop.

## 4. HOMO/LUMO, orbitals & reactivity

- **Hückel molecular orbital method (HMO)**
  https://www.chemeurope.com/en/encyclopedia/H%C3%BCckel_method.html
  The classic back-of-the-envelope MO method: build an n×n matrix with
  Hii = α (Cn) or α + hX·β (heteroatom X), Hij = β for Cn–Cn bonds or
  kXY·β for hetero bonds, 0 otherwise; diagonalize → orbital energies; fill
  electrons (2 per orbital) → HOMO/LUMO, gap, per-atom charge density, bond
  orders, Hückel's rule (4n+2 aromaticity). No physical constants needed —
  ideal for a game where only *relative* energies matter. This is the natural
  engine for "electron-rich / electron-poor" reactivity signals.

- **Heteroatom parameter tables (hX, kXY)**
  http://www.ensta-paristech.fr/~grimaud/CB101/poly_cours/Parametres%20huckel.pdf
  Recommended Hückel parameters for heteroatoms — a template for choosing
  pseudo-element parameters (h and k per element/bond pair) that make e.g.
  Ol-containing groups behave like real carbonyls.

- **Methods for obtaining h/k parameters**
  https://nopr.niscpr.res.in/bitstream/123456789/47874/1/IJCA%2026A%285%29%20367-372.pdf
  (Indian J. Chem. 26A, 367–372) — how h and k can be derived from ionization
  potentials etc., if you ever want to calibrate the game's parameters.

- **HMO applications: α,β-unsaturated carbonyls (Michael acceptors)**
  https://personal.utdallas.edu/~biewerm/5-applications.pdf
  Shows how heteroatom correction factors change orbital energies — a concrete
  example of HMO producing textbook functional-group behaviour (this is the
  kind of "recover functional groups with plausible properties" the design
  wants).

## 5. Thermodynamics (ΔH, ΔS, ΔG)

- **ΔG = ΔG° + RT·ln Q; K = e^(−ΔG°/RT); van't Hoff**
  https://pressbooks.openedmb.ca/introductorychemistry/chapter/gibbs-energy-and-equilibrium/
  https://wisc.pb.unizin.org/chem103and104/chapter/%CE%B4go-k-and-vant-hoff-plots-m17q6ab/
  Concentration-dependence of spontaneity: ΔG depends on the reaction quotient
  Q built from species concentrations. This is the bridge between in-chamber
  concentrations (which the belts control) and whether a reaction proceeds —
  the central feedback loop of the game.

- **Sackur–Tetrode translational entropy (gas; concentration-dependent)**
  https://digitalcommons.unl.edu/physicsgallup/33/
  Translational entropy of an ideal gas depends on ln(V) (i.e. concentration),
  particle mass, and T — a concrete, principled formula for the
  "ΔS depends on concentration and state of matter" requirement.

- **Translational entropy in solution**
  https://server.ccl.net/chemistry/resources/messages/2008/12/11.009-dir/index.html
  Discussion of how to treat translational entropy for solutes — relevant when
  the game mixes gases and dissolved species in one chamber.

- **DTU Physical Chemistry course (26820, 2024/25)**
  https://kurser.dtu.dk/course/2024-2025/26820
  Covers computing ΔH, ΔS, ΔG at different temperatures and equilibrium
  constants — a syllabus-level map of the pieces the game needs.

- **Oxtoby, Principles of Modern Chemistry — entropy & spontaneity chapter**
  https://m.shsbnu.net/pluginfile.php/50031/mod_resource/content/0/4.2%20Principles%20of%20Modern%20Chemistry%2C%208th%20Edition%20by%20David%20W.%20Oxtoby.pdf
  Textbook treatment of ΔS and the Gibbs criterion (spontaneous when ΔG < 0).

## 6. Game-design precedents (chemistry + factory/puzzle)

- **SpaceChem (Zachtronics)**
  https://en.wikipedia.org/wiki/SpaceChem
  The canonical "molecule factory puzzle": build molecules atom-by-atom in
  reactors, form/break bonds, program waldoes, hit output quotas. Closest
  existing precedent for *reacting molecules as the core mechanic*.

- **Opus Magnum (Zachtronics)**
  https://store.steampowered.com/app/558990/Opus_Magnum/
  https://www.rockpapershotgun.com/have-you-played-opus-magnum
  Alchemy-engine puzzles: transmute molecules on a hex grid with arms/pistons.
  A polished take on "fake science" chemistry automation — good inspiration for
  UX and problem structure (loop correctness, side-product handling).

- **Factorio — transport belt physics**
  https://wiki.factorio.com/Transport_belts/Physics
  Concrete belt model: density (4 items/tile/lane), speed (tiles/sec),
  throughput = density × speed, compression, two independent lanes, per-tile
  item accounting. Directly applicable when simulating molecule belts.

- **Alembic (Steam, 2026)**
  https://store.steampowered.com/app/4933990/Alembic/
  Falling-sand sandbox on the real periodic table: reactions *emerge* from
  physical/chemical properties (no recipe book), with pipes, fans, **filters
  that separate phases**, conveyors for loose matter, thermal plates. The
  "phase separation + typed transport" idea matches the design's multiple-output
  ports and solubility-based leaving rates.

- **Alchemy Factory (2025)**
  http://feed.ilidea.com/index.php/Index/details.html?id=13149587
  A chemistry-themed 3D factory game where you build alchemy plants with
  conveyor belts and machines (voxel building) — evidence that "chemistry +
  conveyor factory" is a viable genre mix.

- **Берлога: Химзавод ("Chemical Plant")**
  https://platform.kruzhok.org/chemicalplant
  A production simulator that runs a real chemical plant (formulas, reactions,
  installations) — useful for how to present reaction/synthesis flows
  understandably.

- **Fandomium — fictional elements wiki**
  https://fandomium.fandom.com/wiki/Spirogen
  Community precedent for invented elements with pseudo-chemistry
  (e.g. "spirogen" as a pseudo-carbon with pseudo-hydrogen analogues, named
  after alkanes). Nice worldbuilding reference for the "different universe"
  flavour.

## 7. Stereochemistry: representation, perception, and effects

Plain molecular graphs are *isomorphic* for stereoisomers: (R)- and (S)-lactic
acid, or (E)- and (Z)-but-2-ene, have identical connectivity and collide under
canonical naming. The design direction (matching InChI, RDKit, Open Babel, CDK)
is to keep the graph as the backbone and attach small *parity descriptors* to
stereogenic atoms and double bonds, rather than storing 3D coordinates as
identity (a molecule has infinitely many conformers). The crucial insight: a
parity is a sign *relative to a defined neighbor ordering*, so stereo
perception always runs (1) canonicalize the plain graph, (2) compute parities
against that canonical ordering.

- **InChI stereo layers (`/t` tetrahedral, `/b` double bond)**
  https://europepmc.org/article/PMC/4486400
  Heller et al., "InChI, the IUPAC International Chemical Identifier",
  J. Cheminform. 7:23 (2015). Describes the stereochemistry pass: after
  canonical colors are found, each stereogenic atom's parity is the sign of the
  oriented tetrahedron; each double bond's parity is computed from the
  canonical-numbered substituents on either end (same side = minus, opposite
  side = plus). A "layered" in-game name (connectivity + stereo layer) is the
  direct model for distinguishing isomers.

- **InChI source-code documentation / technical manual**
  https://www.inchi-trust.org/download/103/InChI_Source_Code_Documentation_v1.0.pdf
  Canonicalisation first, stereochemistry as a separate pass; wedge-bond
  interpretation ("narrow end of wedge points to stereo"), parity markers
  (+/-) rather than R/S labels, allenes/cumulenes as extended stereo systems.

- **OpenSMILES stereo specification**
  https://www.opensmiles.org/opensmiles.pdf
  `@`/`@@` mark tetrahedral parity relative to the atom's left-to-right
  neighbor order in the string; `/` and `\` mark double-bond geometry; ring
  closures count as neighbors. Cheap to implement and a natural token set for
  the game's pseudo-SMILES names.

- **RDKit stereo model (ChiralTag, BondStereo)**
  https://github.com/rdkit/rdkit/blob/master/Docs/Book/RDKit_Book.rst
  The "Stereochemistry" section of the RDKit book: tetrahedral chirality is a
  CW/CCW tag *relative to the ordering of the bonds around the atom*; double
  bonds carry CIS/TRANS/ANY. `AssignStereochemistry` plus CIP labels (R/S,
  E/Z); `AssignAtomChiralTagsFromStructure` perceives stereo from 3D. See also
  `Code/GraphMol/catch_chirality.cpp` and the CIP-labeling doc in the repo.

- **Computing stereo from 3D coordinates**
  https://docs.rs/sdfrust/latest/src/sdfrust/descriptors/chirality.rs.html
  Tetrahedral chirality = sign of the signed volume (triple product
  a·(b×c) of the three substituent vectors relative to the fourth), with a
  near-zero threshold for flat/unspecified; CIP priority via layered BFS with
  "phantom atoms" for multiple bonds. For E/Z:
  https://docs.rs/molcrafts-molrs-core/latest/molrs_core/stereo/fn.assign_bond_stereo_from_3d.html
  the dihedral between the two highest-priority substituents decides: < 90° =
  Z (same side), > 90° = E (opposite sides). In 2D, wedge/dash bonds supply the
  ±z offsets for the same tests.

- **CIP sequence rules (R/S, E/Z)**
  https://iupac.qmul.ac.uk/BlueBook/P92.html
  Priority by atomic number, then by BFS-expanded spheres of sorted atomic
  numbers; multiple bonds contribute phantom duplicates of their far atom.
  Simplified layered implementations (e.g. sdfrust above) are enough for a game
  with four elements.

- **Stereo-aware graph libraries (exact equality, hashing)**
  https://github.com/maxim-papusha/StereoMolGraph
  StereoMolGraph (Papusha & Leonhard, J. Chem. Inf. Model. 66, 3830, 2026):
  graphs whose only concern is connectivity + relative stereochemistry;
  circular-stereo hash (WL color refinement extended with chirality) for fast
  approximate equality, VF2++-style isomorphism with stereo for exact checks.
  A reference if the game later needs robust stereo isomorphism; the parity
  approach above is sufficient for naming and properties.

- **What stereochemistry changes in-game**
  Enantiomers (R/S) have identical ΔH, ΔS, ΔG, boiling points and solubilities
  in an achiral environment: they are distinct molecules (distinct names) but
  behave identically unless chiral solvents/catalysts are added. Diastereomers
  (E/Z, cis/trans) genuinely differ: dipole moment → polarity → solubility
  (directly usable by the separation/belt system), and trans is usually a
  little more stable than cis (~1 kcal/mol → a small ΔG correction).
  Stereospecific reaction outcomes (SN2 inversion, anti-addition to alkenes)
  can later be modelled as "stereo operators" on the same parities.

## 8. Algorithm notes: PEOE charges, Hückel HOMO/LUMO, conjugation

Notes distilled from the references in sections 3-4 for direct porting to JS.

### PEOE (Gasteiger-Marsili) partial charges

- Electronegativity as a function of charge: χ(q) = a + b·q + c·q².
- Parameters per element *and* hybridization (sp3/sp2/sp); representative
  values: H (7.17, 6.24, -0.56); C sp3 (7.98, 9.18, 1.88), C sp2 (8.79, 9.32,
  1.51); N sp3 (11.54, 10.82, 1.36), N sp2 (12.87, 11.15, 0.85); O sp3 (14.18,
  12.92, 1.39), O sp2 (17.07, 13.79, 0.47). The ordering O > N > C > H matches
  the game's "greediness" ladder (Obligium > Naturium > Cardinium ≈ Habitium).
- Hybridization from the graph: 4 singles = sp3; one double + singles = sp2;
  triple or two doubles = sp; aromatic = sp2.
- Initialise q from formal charges; iterate ~6-8 times with damping 0.5: at
  iteration k, damp = 0.5^(k+1); per bond (i,j), transfer = damp·(χ_j − χ_i)/χ⁺
  where χ⁺ is the electronegativity of the electron-poor end at q = +1; add to
  one atom and subtract from the other (exact charge conservation). Cost
  O(iterations·bonds), topology-only, qualitative trends (electronegative atoms
  negative, H positive, inductive decay with distance).

### Hückel MO (HMO) for HOMO/LUMO

- Build the π subsystem (conjugated atoms, below) and an n×n matrix:
  H_ii = α + h_X·β (h_X = 0 for carbon), H_ij = k_XY·β for bonded pairs
  (k = 1 for C-C; ≈1.93 for C=O, ≈1.31 for C-O, ≈1.30/1.06 for C-N; a small
  k ≈ 0.18 for C-CH3 hyperconjugation), 0 otherwise.
- Diagonalize (small symmetric matrix; Jacobi/QL in JS) → eigenvalues x_i →
  orbital energies E_i = α − x_i·β (β < 0). Fill 2 electrons per MO from the
  bottom: HOMO = highest occupied, LUMO = lowest unoccupied, gap = E_LUMO −
  E_HOMO. Only relative energies matter, so α = 0, β = 1 suffices.
- Free outputs from eigenvectors: π electron density q_R = Σ b_i c_iR², π bond
  order p_RS = Σ b_i c_iR c_iS, and delocalization (resonance) energy =
  E_π(total) − E_π(localized reference) — benzene ≈ 2β. This makes
  conjugation/aromaticity *emerge* from the same engine.
- Heteroatom parameter table + worked example (acrolein):
  http://www.pci.tu-bs.de/aggericke/PC4e/Kap_II/Hueckel_Acrolein.html
  (Derflinger & Lischka values). Reactivity: frontier-orbital matching
  (nucleophile HOMO ↔ electrophile LUMO) is exactly the game's "give/take"
  check; the gap size can bias stochastic side-reaction weights.

### Conjugation & aromaticity perception

- Conjugated π systems: maximal connected subgraphs of π-participating atoms
  (sp2/sp) connected by π bonds (double/triple/aromatic), e.g. the CDK
  ConjugatedPiSystemsDetector (BFS over π atoms). These become the HMO
  subsystems.
- Aromaticity: (1) ring perception (SSSR; Balducci-Pearlman / GF(2) cycle
  space, O(n³) worst case, fine at game scale); (2) per-ring π-electron count
  (2π per double bond in the ring, lone-pair contributions for ring N/O);
  (3) classify 4n+2 = aromatic, 4n (n>0) = antiaromatic, else non-aromatic;
  (4) fused-ring pass 2: rings sharing an atom with an already-aromatic ring
  are re-evaluated with aromatic atoms contributing 1π each, repeated until
  convergence (handles naphthalene/indole). Reference implementation:
  https://docs.rs/chematic-perception/latest/chematic_perception/aromaticity/
- Game effect: aromatic rings gain resonance-energy ΔH stabilization and a
  large HOMO-LUMO gap (stable, unreactive); antiaromatic rings are destabilized
  and reactive; conjugated chains shrink the gap (reactive, colorful).

## 9. Player-facing naming convention (decided)

Inorganic compound names in the player docs are built from the invented element
names (see AGENTS.md): two-element compounds take the greedier element with an
*-ide* ending (cardinium diobligide = CO2, dihabitium obligide = water), and
acids use *-ic acid* (cardinic acid = H2CO3). Organic compounds keep their
familiar names (ethanol, benzene, ...). The familiar real-world name is given
in parentheses at first mention in the docs.

## Open design questions (tracked here until decided)

1. ΔS formula: Sackur–Tetrode for gases + simplified solvation/rotational
   terms, or a lighter "entropy budget per species & state" table? (Affects how
   temperature and pressure interact with equilibria.)
2. Kinetics: how do stochastic side reactions get selected and rate-limited
   (activation-energy-like barrier from HOMO/LUMO gaps? Arrhenius-style T
   dependence)? Not yet specified in the design.
3. Canonical name format: research (section 7) suggests parity-based stereo
   tokens layered on the canonical graph string — SMILES-style `@`/`@@` and
   `/`/`\`, or an InChI-like `/t` `/b` layer — with human-readable pseudo-IUPAC
   as an alternative. Decide in roadmap step 2.
4. State of matter per species: derived from a per-element/per-functional-group
   phase table (boiling/melting analogues) — needed before belts can be typed.
5. Stereochemistry depth for gameplay: do chiral centers get full R/S
   treatment, or only E/Z (which drives dipole/solubility differences)? Should
   chiral solvents/catalysts exist, and should reactions carry stereo operators
   (SN2 inversion, anti-addition)? Decide together with roadmap step 2.
