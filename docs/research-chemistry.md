# Research notes — chemistry engine for BeltOrganics

Curated external references relevant to the chemistry engine design in `AGENTS.md` (molecules, bonds, charges, orbitals, thermodynamics, stereochemistry, naming and the algorithm notes). Each entry notes why it matters for this project. Links were gathered 2026-08-27; if a link dies, search for the title.

Game-related research (design precedents, tooling decisions, and the world layer / game shell decisions) lives in `docs/research-game.md`.

## 1. Molecule representation & naming (identity, canonical forms)

A molecule is a *graph*: atoms are vertices (element, formal charge), bonds are edges (bond order). The hard parts are deciding "same molecule" regardless of orientation/rotation (graph isomorphism) and generating a unique name (canonical labeling).

- **Martin Vogt, "Algorithms in Cheminformatics" (lecture slides, TU München)** https://bigchem.eu/sites/default/files/Martin_Vogt_algorithms_in_cheminformatics_150519.pdf Graph isomorphism as the definition of "same molecule", canonical naming, Morgan-style extended connectivity, substructure (fragment) search. Directly maps to roadmap items 1–3.

- **SMILES & unique SMILES (Weininger 1988; CANGEN)** https://www.tbi.univie.ac.at/papers/Abstracts/gil_dipl SMILES turns a molecular graph into a line string; *unique* SMILES uses canonical atom ranking so that isomorphic graphs produce the same string — then equality reduces to string comparison. A good template for a "canonical pseudo-SMILES" notation for the game.

- **Morgan algorithm (extended connectivity, 1965) / ECFP fingerprints** https://core.ac.uk/download/574066807.pdf Iteratively re-rank atoms by the multiset of neighbour labels; the resulting canonical ranking is simple to implement (pure JS, no deps) and is the basis of both canonical SMILES and fingerprints.

- **InChI (IUPAC International Chemical Identifier)** https://en.wikipedia.org/wiki/InChI Industry-standard unique identifier built from the molecular graph, layered by connectivity / charge / isotopes / stereochemistry. A "layered" pseudo-name (graph layer, charge layer, ...) is a nice model for in-game names that distinguish isomers while ignoring orientation.

- **Weisfeiler–Lehman refinement / canonical labeling (nauty, bliss)** https://achs-prod.acs.org/doi/10.1021/acs.jcim.1c01192 Discussion of canonicalization in cheminformatics (template sizes, exclusivity). WL refinement is the modern graph-ML cousin of Morgan's algorithm; nauty/bliss (McKay & Piperno) are the exact-solvers of last resort for hard isomorphism cases.

- **Formal charges & octet rule (Lewis structures)** http://www.chem.umd.edu/courses/chem233/Handouts&Topics/edot.pdf Counting valence electrons, satisfying octets, assigning formal charge (FC = valence − lone-pair electrons − bonds/2). Useful to validate that generated molecules are "legal" under the game's electron rules.


## 2. Bond energies

- **MSU Organic Chemistry — bond energy tables (average bond dissociation enthalpies)** https://www2.chemistry.msu.edu/faculty/reusch/OrgPage/bndenrgy.htm Tables of single/multiple bond energies (C–C 83, C=C 146, C–O 85.5, C=O ~177, H–C 99, H–O 111 kcal/mol, ...). The design decision "energy depends only on bond type" is exactly the *average* bond enthalpy approximation used here — great reference for picking the game's per-bond-type energy table.

- **Ellison, "Bond Dissociation Energies of Organic Molecules", Acc. Chem. Res. 2003** https://www2.chemistry.msu.edu/courses/cem850/handouts/Ellison_BDEs.pdf Shows that real BDEs vary with substituents (e.g. H–CH3 103 vs H–tBu 93 kcal/mol) — useful to know *where* the game intentionally simplifies.

- **Georgia Southern libguide, "6.1 Bond Energy"** https://georgiasouthern.libguides.com/c.php?g=1074545&p=7874485 Another table (H–H, C=C, C=O aldehyde vs ketone vs ester) if you want carbonyl-type differentiation later.


## 3. Partial charges on atoms

- **Gasteiger & Marsili, "A New Model for Calculating Atomic Charges in Molecules" (PEOE), Tetrahedron Lett. 1978** https://www.sciencedirect.com/sdfe/pdf/download/eid/1-s2.0-S0040403901949779/first-page-pdf Partial Equalization of Orbital Electronegativity: iteratively transfer charge between bonded atoms so effective electronegativity equalizes, χ = a + b·q + c·q², with a damping factor (≈0.5 per iteration). Needs only the molecular graph — perfect for pseudo-chemistry, and it reproduces qualitative trends (electron-rich/poor atoms, acidity trends).

- **gasteiger-rs crate (theory recap + implementation notes)** https://docs.rs/crate/gasteiger-rs/latest Zero-dependency implementation summary: hybridization detection from connectivity/bond orders, 6 iterations, formal-charge handling. A good reference for porting the algorithm to JS.

- **sdfrust gasteiger.rs source** https://docs.rs/sdfrust/latest/src/sdfrust/descriptors/gasteiger.rs.html Readable Rust implementation of the iterative PEOE loop.


## 4. HOMO/LUMO, orbitals & reactivity

- **Hückel molecular orbital method (HMO)** https://www.chemeurope.com/en/encyclopedia/H%C3%BCckel_method.html The classic back-of-the-envelope MO method: build an n×n matrix with Hii = α (Cn) or α + hX·β (heteroatom X), Hij = β for Cn–Cn bonds or kXY·β for hetero bonds, 0 otherwise; diagonalize → orbital energies; fill electrons (2 per orbital) → HOMO/LUMO, gap, per-atom charge density, bond orders, Hückel's rule (4n+2 aromaticity). No physical constants needed — ideal for a game where only *relative* energies matter. This is the natural engine for "electron-rich / electron-poor" reactivity signals.

- **Heteroatom parameter tables (hX, kXY)** http://www.ensta-paristech.fr/~grimaud/CB101/poly_cours/Parametres%20huckel.pdf Recommended Hückel parameters for heteroatoms — a template for choosing pseudo-element parameters (h and k per element/bond pair) that make e.g. Ol-containing groups behave like real carbonyls.

- **Methods for obtaining h/k parameters** https://nopr.niscpr.res.in/bitstream/123456789/47874/1/IJCA%2026A%285%29%20367-372.pdf (Indian J. Chem. 26A, 367–372) — how h and k can be derived from ionization potentials etc., if you ever want to calibrate the game's parameters.

- **HMO applications: α,β-unsaturated carbonyls (Michael acceptors)** https://personal.utdallas.edu/~biewerm/5-applications.pdf Shows how heteroatom correction factors change orbital energies — a concrete example of HMO producing textbook functional-group behaviour (this is the kind of "recover functional groups with plausible properties" the design wants).


## 5. Thermodynamics (ΔH, ΔS, ΔG)

- **ΔG = ΔG° + RT·ln Q; K = e^(−ΔG°/RT); van't Hoff** https://pressbooks.openedmb.ca/introductorychemistry/chapter/gibbs-energy-and-equilibrium/ https://wisc.pb.unizin.org/chem103and104/chapter/%CE%B4go-k-and-vant-hoff-plots-m17q6ab/ Concentration-dependence of spontaneity: ΔG depends on the reaction quotient Q built from species concentrations. This is the bridge between in-chamber concentrations (which the belts control) and whether a reaction proceeds — the central feedback loop of the game.

- **Sackur–Tetrode translational entropy (gas; concentration-dependent)** https://digitalcommons.unl.edu/physicsgallup/33/ Translational entropy of an ideal gas depends on ln(V) (i.e. concentration), particle mass, and T — a concrete, principled formula for the "ΔS depends on concentration and state of matter" requirement.

- **Translational entropy in solution** https://server.ccl.net/chemistry/resources/messages/2008/12/11.009-dir/index.html Discussion of how to treat translational entropy for solutes — relevant when the game mixes gases and dissolved species in one chamber.

- **DTU Physical Chemistry course (26820, 2024/25)** https://kurser.dtu.dk/course/2024-2025/26820 Covers computing ΔH, ΔS, ΔG at different temperatures and equilibrium constants — a syllabus-level map of the pieces the game needs.

- **Oxtoby, Principles of Modern Chemistry — entropy & spontaneity chapter** https://m.shsbnu.net/pluginfile.php/50031/mod_resource/content/0/4.2%20Principles%20of%20Modern%20Chemistry%2C%208th%20Edition%20by%20David%20W.%20Oxtoby.pdf Textbook treatment of ΔS and the Gibbs criterion (spontaneous when ΔG < 0).

## 7. Stereochemistry: representation, perception, and effects

Plain molecular graphs are *isomorphic* for stereoisomers: (R)- and (S)-lactic acid, or (E)- and (Z)-but-2-ene, have identical connectivity and collide under canonical naming. The design direction (matching InChI, RDKit, Open Babel, CDK) is to keep the graph as the backbone and attach small *parity descriptors* to stereogenic atoms and double bonds, rather than storing 3D coordinates as identity (a molecule has infinitely many conformers). The crucial insight: a parity is a sign *relative to a defined neighbor ordering*, so stereo perception always runs (1) canonicalize the plain graph, (2) compute parities against that canonical ordering.

- **InChI stereo layers (`/t` tetrahedral, `/b` double bond)** https://europepmc.org/article/PMC/4486400 Heller et al., "InChI, the IUPAC International Chemical Identifier", J. Cheminform. 7:23 (2015). Describes the stereochemistry pass: after canonical colors are found, each stereogenic atom's parity is the sign of the oriented tetrahedron; each double bond's parity is computed from the canonical-numbered substituents on either end (same side = minus, opposite side = plus). A "layered" in-game name (connectivity + stereo layer) is the direct model for distinguishing isomers.

- **InChI source-code documentation / technical manual** https://www.inchi-trust.org/download/103/InChI_Source_Code_Documentation_v1.0.pdf Canonicalisation first, stereochemistry as a separate pass; wedge-bond interpretation ("narrow end of wedge points to stereo"), parity markers (+/-) rather than R/S labels, allenes/cumulenes as extended stereo systems.

- **OpenSMILES stereo specification** https://www.opensmiles.org/opensmiles.pdf `@`/`@@` mark tetrahedral parity relative to the atom's left-to-right neighbor order in the string; `/` and `\` mark double-bond geometry; ring closures count as neighbors. Cheap to implement and a natural token set for the game's pseudo-SMILES names.

- **RDKit stereo model (ChiralTag, BondStereo)** https://github.com/rdkit/rdkit/blob/master/Docs/Book/RDKit_Book.rst The "Stereochemistry" section of the RDKit book: tetrahedral chirality is a CW/CCW tag *relative to the ordering of the bonds around the atom*; double bonds carry CIS/TRANS/ANY. `AssignStereochemistry` plus CIP labels (R/S, E/Z); `AssignAtomChiralTagsFromStructure` perceives stereo from 3D. See also `Code/GraphMol/catch_chirality.cpp` and the CIP-labeling doc in the repo.

- **Computing stereo from 3D coordinates** https://docs.rs/sdfrust/latest/src/sdfrust/descriptors/chirality.rs.html Tetrahedral chirality = sign of the signed volume (triple product a·(b×c) of the three substituent vectors relative to the fourth), with a near-zero threshold for flat/unspecified; CIP priority via layered BFS with "phantom atoms" for multiple bonds. For E/Z: https://docs.rs/molcrafts-molrs-core/latest/molrs_core/stereo/fn.assign_bond_stereo_from_3d.html the dihedral between the two highest-priority substituents decides: < 90° = Z (same side), > 90° = E (opposite sides). In 2D, wedge/dash bonds supply the ±z offsets for the same tests.

- **CIP sequence rules (R/S, E/Z)** https://iupac.qmul.ac.uk/BlueBook/P92.html Priority by atomic number, then by BFS-expanded spheres of sorted atomic numbers; multiple bonds contribute phantom duplicates of their far atom. Simplified layered implementations (e.g. sdfrust above) are enough for a game with four elements.

- **Stereo-aware graph libraries (exact equality, hashing)** https://github.com/maxim-papusha/StereoMolGraph StereoMolGraph (Papusha & Leonhard, J. Chem. Inf. Model. 66, 3830, 2026): graphs whose only concern is connectivity + relative stereochemistry; circular-stereo hash (WL color refinement extended with chirality) for fast approximate equality, VF2++-style isomorphism with stereo for exact checks. A reference if the game later needs robust stereo isomorphism; the parity approach above is sufficient for naming and properties.

- **What stereochemistry changes in-game** Enantiomers (R/S) have identical ΔH, ΔS, ΔG, boiling points and solubilities in an achiral environment: they are distinct molecules (distinct names) but behave identically unless chiral solvents/catalysts are added. Diastereomers (E/Z, cis/trans) genuinely differ: dipole moment → polarity → solubility (directly usable by the separation/belt system), and trans is usually a little more stable than cis (~1 kcal/mol → a small ΔG correction). Stereospecific reaction outcomes (SN2 inversion, anti-addition to alkenes) can later be modelled as "stereo operators" on the same parities.


## 8. Algorithm notes: PEOE charges, Hückel HOMO/LUMO, conjugation

Notes distilled from the references in sections 3-4 for direct porting to JS.

### PEOE (Gasteiger-Marsili) partial charges

- Electronegativity as a function of charge: χ(q) = a + b·q + c·q².
- Parameters per element *and* hybridization (sp3/sp2/sp): H (7.17, 6.24, -0.56); C sp3 (7.98, 9.18, 1.88), C sp2 (8.79, 9.32, 1.51), C sp (10.39, 9.45, 0.73); N sp3 (11.54, 10.82, 1.36), N sp2 (12.87, 11.15, 0.85), N sp (15.68, 11.70, -0.27); O sp3 (14.18, 12.92, 1.39), O sp2 (17.07, 13.79, 0.47). The current labeler makes multiply bonded O sp2; its defensive sp slot uses the same O sp2 fit. The ordering O > N > C > H matches the game's "greediness" ladder (Obligium > Naturium > Cardinium ≈ Habitium).
- Hybridization from the graph: 4 singles = sp3; one double + singles = sp2; triple or two doubles = sp; aromatic = sp2.
- Initialise q from formal charges; iterate ~6-8 times with damping 0.5: at iteration k, damp = 0.5^(k+1); per bond (i,j), transfer = damp·(χ_j − χ_i)/χ⁺ where χ⁺ is the electronegativity of the electron-poor end at q = +1; add to one atom and subtract from the other (exact charge conservation). Cost O(iterations·bonds), topology-only, qualitative trends (electronegative atoms negative, H positive, inductive decay with distance).

Implemented in `src/chem/partial-charges.ts` (2026-08-29). The calculator uses eight passes by default and applies every pass simultaneously, so a bond's insertion/traversal order cannot feed a newly changed charge into another bond during that pass. Charge is initialized from formal charge. Transfers occur only across graph edges; a final floating-point correction is made per connected component, so salts retain the formal charge of each ion independently and exactly. The UI keeps Structure and Charge as separate inspector layers and presents every explicit atom on a blue-neutral-red scale. Tests cover water polarity, carbonyl direction, inductive decay, carboxylate charge sharing, disconnected ions, traversal stability, and option validation.

### Hückel MO (HMO) for HOMO/LUMO

- Build the π subsystem (conjugated atoms, below) and an n×n matrix: H_ii = α + h_X·β (h_X = 0 for carbon), H_ij = k_XY·β for bonded pairs (k = 1 for C-C; ≈1.93 for C=O, ≈1.31 for C-O, ≈1.30/1.06 for C-N; a small k ≈ 0.18 for C-CH3 hyperconjugation), 0 otherwise.
- Diagonalize (small symmetric matrix; Jacobi/QL in JS) → eigenvalues x_i → orbital energies E_i = α − x_i·β (β < 0). Fill 2 electrons per MO from the bottom: HOMO = highest occupied, LUMO = lowest unoccupied, gap = E_LUMO − E_HOMO. Only relative energies matter, so α = 0, β = 1 suffices.
- Free outputs from eigenvectors: π electron density q_R = Σ b_i c_iR², π bond order p_RS = Σ b_i c_iR c_iS, and delocalization (resonance) energy = E_π(total) − E_π(localized reference) — benzene ≈ 2β. This makes conjugation/aromaticity *emerge* from the same engine.
- Heteroatom parameter table + worked example (acrolein): http://www.pci.tu-bs.de/aggericke/PC4e/Kap_II/Hueckel_Acrolein.html (Derflinger & Lischka values). Reactivity: frontier-orbital matching (nucleophile HOMO ↔ electrophile LUMO) is exactly the game's "give/take" check; the gap size can bias stochastic side-reaction weights.

### Conjugation & aromaticity perception

- Conjugated π systems are the HMO subsystems. They are built from *π units* (each π bond is a unit; a triple bond is two perpendicular units) joined by single σ bonds — the v2 model implemented in `src/chem/conjugation.ts` (see the dedicated subsection below). The classic alternative is the CDK ConjugatedPiSystemsDetector (BFS over π atoms connected by π bonds); the unit model exists so the two perpendicular π bonds of a triple bond (or of an allene) land in separate systems.
- Aromaticity: (1) ring perception (SSSR; Balducci-Pearlman / GF(2) cycle space, O(n³) worst case, fine at game scale); (2) per-ring π-electron count (2π per double bond in the ring, lone-pair contributions for ring N/O); (3) classify 4n+2 = aromatic, 4n (n>0) = antiaromatic, else non-aromatic; (4) fused-ring pass 2: rings sharing an atom with an already-aromatic ring are re-evaluated with aromatic atoms contributing 1π each, repeated until convergence (handles naphthalene/indole). Reference implementation: https://docs.rs/chematic-perception/latest/chematic_perception/aromaticity/
- Game effect: aromatic rings gain resonance-energy ΔH stabilization and a large HOMO-LUMO gap (stable, unreactive); antiaromatic rings are destabilized and reactive; conjugated chains shrink the gap (reactive, colorful).

### Hybridization labeling rules (v1, no aromaticity perception yet)

Rules distilled from the references above plus the sources below; the implementation is `src/chem/hybridization.ts`.

- sp: a triple bond anywhere on the atom (alkynes, nitriles), or two double bonds on the same atom (allenes, CO2, ketenes).
- sp2: one double bond (alkenes, carbonyls, imines, aromatic rings in kekulé form).
- sp3: otherwise, **except** that a lone-pair heteroatom (neutral or anionic N/O) bonded directly to an sp/sp2 atom is labeled sp2: its lone pair conjugates into the neighbouring pi system. This is the rule behind the classic non-VSEPR cases:
  - **Amide nitrogen** (peptide bonds) is sp2 and planar because the N lone pair resonates with the C=O (RC(=O)-NR2 <-> RC([O-])=[N+]R2): https://iverson.cm.utexas.edu/courses/310N/POTDSp06/POTDLecture%2011.html http://chem.ucalgary.ca/courses/353/Carey5th/Ch27/ch27-4-2.html
  - **Furan oxygen** is sp2 because one lone pair sits in a p orbital and joins the 4n+2 aromatic pi system (the other lone pair is in an sp2 orbital): https://www.chemeurope.com/en/encyclopedia/Furan.html
  - **Carboxylate anion**: both oxygens are treated as sp2; the single-bonded O- is sp2 through resonance with the C=O: https://chem.libretexts.org/Bookshelves/Organic_Chemistry/Map:_Organic_Chemistry_(Smith)/14:_Conjugation_Resonance_and_Dienes/14.04:_The_Resonance_Hybrid
  - Toolkit confirmation: RDKit labels enamine N (C=C[NH2]) and enol-ether O (C=CO) as SP2, the same "lone pair next to a pi bond" heuristic: https://github.com/oxpig/rdkit_to_params/blob/master/atom_types.md
- Carbocations and carbanions (charged trivalent carbon):
  - A carbocation (CH3+, R3C+) has an empty p orbital and is sp2 / trigonal planar, defying VSEPR counting (3 sigma bonds, no lone pair -> would be sp3): https://app.jove.com/science-education/v/11747/concepts/carbocations http://butane.chem.uiuc.edu/jsmoore/chem232/notes_current/Carbocation_RARs/NOTES-Carbocations.pdf
  - A simple alkyl carbanion (CH3-) is sp3 and pyramidal (lone pair in an sp3 orbital, C3v), aligning with VSEPR: https://en.wikipedia.org/wiki/Carbanion
  - A *conjugated* carbanion (allyl anion, benzyl anion, enolate) is sp2 under the same criterion as N/O lone pairs: the sp3 allylic carbon rehybridizes to sp2 so its lone pair can sit in a p orbital and join the pi system: https://www.jove.com/science-education/v/12408/molecular-orbitals-of-the-allyl-cation-and-anion
- General VSEPR counting (sigma bonds + lone pairs -> number of hybrid orbitals) and the single/double/triple shortcut: https://courses.lumenlearning.com/suny-potsdam-organicchemistry/chapter/2-3-how-to-judge-hybridization-of-an-atom/ https://www.westfield.ma.edu/PersonalPages/cmasi/organic/screen_shots/202490/5_organic_2024_hybridization_cont.pdf

Known simplifications in v1: aromaticity is not perceived yet, so a lone-pair heteroatom adjacent to an aromatic carbon (e.g. aniline N) is labeled sp2 although real aniline is ~sp3; the conjugation test only looks at direct multiple-bond neighbours; and positively charged N/O (ammonium, oxonium, protonated amide) have no lone pair to donate and are labeled sp3 unless they also carry a double bond (e.g. pyridinium).

### Conjugated π system perception (v2, implemented in src/chem/conjugation.ts)

A conjugated system is built from *π units* rather than from a flat atom subgraph:

- Each π bond is a unit: a double bond contributes 1 unit (2 electrons); a triple bond contributes 2 units of 2 electrons each.
- A lone pair or empty p orbital that makes an atom sp2 by conjugation (amide N, furan O, carboxylate O-, allyl anion, carbocation) is a 1-atom unit: 2 electrons for a lone pair, 0 for an empty p orbital. A lone pair on an atom that already carries a π bond (e.g. pyridine N) is not counted.
- Two units belong to the same system when a *single σ bond* links an atom of one unit to an atom of the other — the sp2-sp2 / sp2-sp single bond is what carries the conjugation (butadiene's central bond, the C-C bond joining an enyne's C=C and C≡C).

Triple bonds: the two π bonds of a triple bond are mutually perpendicular (linear sp carbon, exactly the allene geometry), so they never conjugate with each other. Which one is "chain-active" toward neighbouring π units is a conformational choice: an enyne is planar, so its single C=C lines up with ONE alkyne π bond and the other stays localized. The same perpendicular rule keeps the two π bonds of an allene (or CO2) in two separate 2-electron systems, because conjugation never passes *through* a π bond itself.

Divinylacetylene (H2C=CH-C≡C-CH=CH2) is the subtle case, because the two C(sp2)-C(sp) single bonds rotate almost freely and BOTH arrangements are accessible at room temperature:

- planar (cis/trans) — both C=C lie in the plane of the same alkyne π bond: one 6-atom/6-electron system + one localized 2-atom/2-electron system;
- 90° twisted — the two C=C lie in the planes of the two DIFFERENT alkyne π bonds: two separate 4-atom/4-electron systems.

The experimental and ab initio literature below shows the planar cis/trans conformers are only marginally preferred (their enthalpies are nearly equal) and the perpendicular ("gosh"/gauche) orientation is the maximum of the torsional potential just ~180 cm^-1 (~0.5 kcal/mol) above them; an earlier estimate put the barrier at ~35 cm^-1. Electron diffraction and photoelectron band shapes are consistent with essentially free internal rotation. The game therefore ASSUMES the planar, maximally conjugated conformer — both double bonds conjugate with the SAME alkyne π bond, giving one 6-atom/6-electron system plus one localized 2-atom/2-electron system — and the 90°-twisted arrangement is a documented near-degenerate conformer rather than a distinct electronic state.

Consequences of the assumed (planar) rule:

- ethyne (HC≡CH): two localized 2-atom/2-electron systems;
- vinylacetylene (HC≡C-CH=CH2): one 4-atom/4-electron system (one alkyne π + the C=C) plus one localized 2-atom/2-electron system;
- divinylacetylene (H2C=CH-C≡C-CH=CH2): one 6-atom/6-electron system plus one localized 2-atom/2-electron system (planar conformer assumption);
- allene (H2C=C=CH2): two 2-atom/2-electron systems (perpendicular by construction; no free rotation).

References (structure and conformation of divinylacetylene / 1,5-hexadiene-3-yne):

- Frolov, Yu. L.; Knizhnik, A. V. "Conformational structure of divinylacetylene", J. Struct. Chem. 39(4) (1998) 496-501, doi:10.1007/BF02903622 — MP2/6-31G* torsional potential of the vinyl groups: the cis and trans planar conformers are nearly isoenergetic and the maximum is the perpendicular ("gosh") orientation at 180.4 cm^-1 (~0.5 kcal/mol) above the cis form; with an earlier barrier estimate of ~35 cm^-1 the authors conclude DVA has virtually free rotation of the vinyl groups.
- Almenningen, A.; Gogstad, E.; Hagen, K.; Schei, H.; Stølevik, R.; Thingstad, Ø.; Traetteberg, M. "Conformation and molecular structure of 1,5-hexadiene-3-yne (divinylacetylene) and perchloro-1,5-hexadiene-3-yne as determined by gas-phase electron diffraction and molecular-mechanics calculations", J. Mol. Struct. 116 (1984) 131-140, doi:10.1016/0022-2860(84)80189-1 — the electron-diffraction data for DVA are consistent with free rotation of the vinyl groups.
- Tørneng, E.; Nielsen, C. J.; Klaeboe, P.; Hopf, H.; Schüll, V. "The conformation and vibrational spectra of 1,5-hexadiene-3-yne (divinylacetylene) and perchloro-1,5-hexadiene-3-yne", J. Mol. Struct. 71 (1981) 71-89 — IR/Raman: DVA exists as a single conformer with anti (C2h) symmetry in the condensed phases.
- Brogli, F.; Heilbronner, E.; Wirz, J.; Kloster-Jensen, E.; Bergman, R. G.; Vollhardt, K. P. C.; Ashe, A. J. III "The consequences of σ and π conjugative interactions in mono-, di- and triacetylenes. A photoelectron spectroscopic investigation", Helv. Chim. Acta 58 (1975) 2620 — the essentially free internal rotation in DVA is visible in the band shapes of its photoelectron spectrum (first IE 8.50 eV, NIST WebBook: https://webbook.nist.gov/cgi/cbook.cgi?ID=C821089).
- Price, W. C. "The absorption spectra of hexatriene and divinyl acetylene in the vacuum ultra-violet", Proc. R. Soc. London A 185 (1946) 182 — vacuum UV: the longest-wavelength absorptions are the strongest (N→V1 transitions), consistent with a conjugated π system.
- Cyvin, S. J. "Two-dimensional Hückel molecular orbital theory", J. Mol. Struct. (THEOCHEM) 86 (1982) 315-324, doi:10.1016/0166-1280(82)80023-7 — 2D HMO treats the π' and π'' systems of planar (0°) AND twisted (90°) divinylacetylene explicitly; DVA is called an especially interesting case because the two perpendicular alkyne π bonds can each host conjugation with a different vinyl group.

Known simplifications: cross-conjugation and non-planar twisted geometries are not modelled; conformational flexibility (the nearly free internal rotation of real divinylacetylene) is not modelled and the planar, maximally conjugated conformer is assumed; aromaticity is still perceived from kekulé double bonds; a lone carbocation (CH3+) forms a 1-atom, 0-electron system.


## 9. Player-facing naming convention (decided)

Inorganic compound names in the player docs are built from the invented element names (see AGENTS.md): two-element compounds take the greedier element with an *-ide* ending (cardinium diobligide = CO2, dihabitium obligide = water), and acids use *-ic acid* (cardinic acid = H2CO3). Organic compounds keep their familiar names (ethanol, benzene, ...). The familiar real-world name is given in parentheses at first mention in the docs.


## Open design questions (tracked here until decided)

1. ΔS formula: Sackur–Tetrode for gases + simplified solvation/rotational terms, or a lighter "entropy budget per species & state" table? (Affects how temperature and pressure interact with equilibria.)
2. Kinetics: how do stochastic side reactions get selected and rate-limited (activation-energy-like barrier from HOMO/LUMO gaps? Arrhenius-style T dependence)? Not yet specified in the design.
3. Canonical name format: research (section 7) suggests parity-based stereo tokens layered on the canonical graph string - SMILES-style `@`/`@@` and `/`/`\`, or an InChI-like `/t` `/b` layer - with human-readable pseudo-IUPAC as an alternative. Decide in roadmap step 2. The SMILES-style format is now implemented: `src/chem/smiles.ts` provides `toSmiles`/`parseSmiles` over RDKit.js (`docs/research-game.md` section 10; `docs/smiles-naming.md`), with verified sample outputs. Chosen convention: canonical names are RDKit's canonical SMILES (ethanol `CCO`). Tetrahedral stereo is stored as an explicit local-chirality label (`TetrahedralStereo`: the four incident bonds in an arbitrary order, with a fixed counterclockwise winding convention - the mirror image is an odd permutation, and `bonds` is omitted for unspecified chirality), built at parse time from the Daylight neighbour-order rule and the `@`/`@@` token; `src/chem/tetrahedral.ts` converts the label to the SMILES viewpoint. The player docs (`docs/01-molecules.typ`) promise `CCO`/`COC`, which is exactly RDKit's flavour. RDKit's canonicalization derives tetrahedral tokens correctly; the game's writer emits `@`/`@@` for its own serialization order (`tokenForOrder`) and lets RDKit canonicalize.
4. State of matter per species: derived from a per-element/per-functional-group phase table (boiling/melting analogues) — needed before belts can be typed.
5. Stereochemistry depth for gameplay: do chiral centers get full R/S treatment, or only E/Z (which drives dipole/solubility differences)? Should chiral solvents/catalysts exist, and should reactions carry stereo operators (SN2 inversion, anti-addition)? Decide together with roadmap step 2.
