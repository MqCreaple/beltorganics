#import "@preview/alchemist:0.2.0": *
#import "@preview/chemformula:0.1.3": ch
#import "@preview/ilm:1.4.0": *
#import "@preview/modiagram:0.1.1" as mo

#set text(lang: "en")

#show: ilm.with(
  title: [Orbitals: electrons, bonds, and the frontier],
  author: "BeltOrganics",
  date: none,
  abstract: [The player guide to orbitals: how electrons arrange themselves in orbitals, σ and π bonding, conjugated π systems, the frontier orbitals HOMO and LUMO, and how molecules interact through their orbitals.],
  figure-index: (enabled: true),
  table-index: (enabled: true),
)

#let skeletize = skeletize-config((angle-increment: 30deg, atom-sep: 3em))

#let molfig(body, caption) = figure(
  align(center, body),
  kind: image,
  caption: caption,
)

= Orbitals: electrons, bonds, and the frontier <sec:orbitals>

Part 2 of the player guide (Part 1: `docs/01-molecules.typ`; Part 3: `docs/03-reactions.typ`). Part 1 told you what molecules are made of — atoms, bonds, shapes. This part is about *where the electrons live*: the orbitals, the two flavours of bonding (σ and π), the special behaviour of electrons that roam across several atoms (conjugation), the two frontier orbitals that decide reactivity (HOMO and LUMO), and how molecules talk to each other through their orbitals.

The game takes place in a universe whose physics are *almost* like ours, but simpler. Everything here is a simplification — but it is a simplification that *predicts*: given a molecule's graph, the game can say where its electrons sit, how willing it is to give or take, and (Part 3) how it will react.

#blockquote[*Note:* all numbers in this booklet are illustrative. The final game balance may differ.]

== Electrons and orbitals <sec:electrons-and-orbitals>

A molecule's electrons are not scattered at random: each one settles into an *orbital* — a region around the atoms with room for at most two electrons and a definite energy. If it helps, picture each orbital as a shelf in a cupboard: it holds at most two electrons, and the lower orbitals fill up first — an electron would rather sit low and comfortable than high and excited.

#figure({
  import mo: *
  modiagram(
    ao(name: "o1", x: 0, energy: 1.2, electrons: ""),
    ao(name: "o2", x: 0, energy: 0.8, electrons: ""),
    ao(name: "o3", x: 0, energy: 0.3, electrons: "pair"),
    ao(name: "o4", x: 0, energy: -0.1, electrons: "pair"),
    content("o1.right", [empty], anchor: "west", pad: 0.15, size: 8pt),
    content("o2.right", [empty], anchor: "west", pad: 0.15, size: 8pt),
    content("o3.right", [full], anchor: "west", pad: 0.15, size: 8pt),
    content("o4.right", [full], anchor: "west", pad: 0.15, size: 8pt),
    energy-axis(title: [Energy]),
  )
}, kind: image,
  caption: [Electrons fill the lowest orbitals first, two per orbital. The higher an orbital, the more energy it costs to put an electron there.],
)

The inspector can show these orbitals directly. Its *Orbitals* layer places a molecular-orbital energy diagram beside the 3D molecule: every σ, π and lone-pair level appears on an approximate electron-volt (eV) scale. Hovering a level identifies it; clicking it redraws that one signed wavefunction, including nodes and unequal weight on different atoms. A bonding σ orbital is one connected cloud made by merging two lobes shifted inward between the nuclei; in a polar bond its wider end sits on the greedier atom. The antibonding lobes shift outward from the nuclei, split at the node, and are wider on the less greedy atom. Opposite signs use dark and light versions of one hue. Degenerate levels share a row, and very large groups can be expanded from an ellipsis. Scroll over the diagram to zoom its energy axis, or drag vertically to inspect another energy range; its horizontal layout stays fixed. The eV calibration is a game estimate rather than a laboratory prediction, but the ordering and gaps are meaningful.

== σ and π bonding <sec:sigma-pi-bonding>

When two atoms bond, their orbitals merge. One orbital splits into two: a *bonding* orbital, lower than either original and comfortably full, and an *antibonding* orbital, higher and usually empty. The electrons settle into the bonding orbital, and the atoms are stuck together.

The way the orbitals merge depends on how the atoms face each other:

- A *σ bond* (the single bond) forms when the two orbitals overlap head-on, straight along the line between the atoms. This is the strong, boring workhorse: #ch("C--C"), #ch("C--H").
- A *π bond* forms when the orbitals overlap sideways, above and below the line between the atoms. The sideways overlap is weaker, so a π orbital sits a little higher (and its antibonding partner a little lower).

A double bond is one σ pair plus one π pair; a triple bond is one σ pair plus two π pairs. That is why a double bond is stronger than a single bond — and why the two halves of a double bond cannot spin (Part 1): spinning would rip the sideways π overlap apart.

#figure({
  import mo: *
  modiagram(
    ao(name: "s-star", x: 0, energy: 2.4, electrons: "", label: $sigma^*$, label-size: 8pt),
    ao(name: "p-star", x: 0, energy: 1.6, electrons: "", label: $pi^*$, label-size: 8pt),
    ao(name: "p", x: 0, energy: 0.8, electrons: "pair", label: $pi$, label-size: 8pt),
    ao(name: "s", x: 0, energy: 0.0, electrons: "pair", label: $sigma$, label-size: 8pt),
    energy-axis(title: [Energy]),
  )
}, kind: image,
  caption: [The energy orbitals of a double bond. The σ pair sits lowest and is the strongest; the π pair sits above it; the empty antibonding orbitals (π\*, σ\*) mirror them higher up.],
)

== Conjugated π systems <sec:conjugation>

Sometimes π orbitals do not stay put. In a molecule with *alternating* single and double bonds — like buta-1,3-diene, #ch("CH2==CH--CH==CH2") — the π electrons spread out over the whole chain instead of sitting on one bond. Chemists say the system is *conjugated* and the electrons are *delocalized*.

#molfig(
  skeletize({
    fragment("H_2C")
    double()
    fragment("CH")
    single()
    fragment("CH")
    double()
    fragment("H_2C")
  }),
  [Buta-1,3-diene: four Cardinium atoms in a row, with alternating double and single bonds. The π electrons are spread across the whole chain.],
)

Delocalization is not a curiosity — it is *stabilizing*. A conjugated molecule is calmer than the same bonds would be on their own; the extra calm is called *resonance* (or delocalization) *energy*. The champion of this behaviour is benzene, a ring of six Cardinium atoms whose six π electrons are shared equally around the whole ring:

Because the six positions are equivalent, benzene's alternating line drawing does not mean three long and three short bonds: all six bonds have the same intermediate length, and its Cardinium skeleton is a regular planar hexagon. In the game's compact display rule, an alternating aromatic ring remains equalized even when it is embedded in a larger substituted molecule such as morphine. Outside a ring, equality still needs equivalent surroundings: the two C–O bonds of acetate are equivalent and equalized, while the proton on one oxygen of acetic acid makes its C–O and C=O bonds distinct.

#molfig(
  skeletize({
    cycle(6, {
      single()
      double()
      single()
      double()
      single()
      double()
    })
  }),
  [Benzene. The ring's π electrons are shared around all six Cardinium atoms, which makes the ring unusually calm and hard to break.],
)

Not every multiple bond joins a conjugated system. A triple bond is one σ
pair plus *two* π pairs, and those two π pairs point in perpendicular
directions — the same geometry as an allene. Only one of them can line up
with a neighbouring double bond at a time. The inspector assumes the planar
arrangement, in which both double bonds of
#ch("H2C==CH--C~~C--CH==CH2") conjugate with the *same* π pair of the central
triple bond and the other π pair stays localised on the two Cardinium atoms —
one extended conjugated system (six atoms, six electrons) plus one localised
two-electron system. The inspector coordinates the two systems around their
shared triple-bond axis, so their clouds are always drawn 90° apart rather
than on top of one another. (Real divinylacetylene can twist the two vinyl groups
almost freely between the two arrangements; the planar one is only marginally
calmer.)

Conjugation also reshapes the frontier orbitals: it *raises* the highest full orbital and *lowers* the lowest empty one, squeezing the gap between them. A small gap means the molecule is easily stirred — reactive, unstable, often colorful.

The game obtains those modes by building one compact interaction table for every conjugated π system and solving it. Neighboring p orbitals interact; each atom's identity and partial charge shift its own level. The resulting wavefunction gives one signed coefficient per atom. A coefficient near zero makes a node, while a large coefficient makes a large lobe. In a carbonyl LUMO the Cardinium coefficient is larger than the Obligium coefficient, so the empty orbital exposes the Cardinium end to nucleophilic attack.

== HOMO and LUMO — the giving and taking orbitals <sec:homo-lumo>

The two orbitals that matter for reactivity are the *frontier* orbitals:

#figure(
  table(
    columns: (auto, auto, 1fr),
    [*Name*], [*State*], [*Meaning*],
    [HOMO], [full], [The highest occupied orbital — how strongly the molecule is willing to *give* electrons.],
    [LUMO], [empty], [The lowest unoccupied orbital — how strongly the molecule wants to *take* electrons.],
  ),
  caption: [The frontier orbitals.],
)

- A small gap between HOMO and LUMO means the molecule is easily stirred: reactive, unstable, often colorful.
- A large gap means the molecule is stable and content to sit around.

#figure({
  import mo: *
  modiagram(
    ao(name: "homo", x: 0, energy: -0.6, electrons: "pair"),
    ao(name: "lumo", x: 0, energy: 0.6, electrons: ""),
    en-difference("homo", "lumo", body: [gap], ratio: 50%),
    content("homo.right", [HOMO], anchor: "west", pad: 0.25, size: 8pt),
    content("lumo.right", [LUMO], anchor: "west", pad: 0.25, size: 8pt),
    energy-axis(title: [Energy]),
  )
}, kind: image,
  caption: [The frontier orbitals: HOMO (full) and LUMO (empty), with the gap between them.],
)

== Interactions of orbitals <sec:orbital-interactions>

When two molecules meet, the game checks whether one molecule's "give" level (its HOMO) can reach the other molecule's "take" level (its LUMO). If the levels match, electrons can flow from the donor into the acceptor, and a reaction becomes possible.

#figure({
  import mo: *
  modiagram(
    ao(name: "d-homo", x: -1.5, energy: 0.0, electrons: "pair", label: [HOMO], label-size: 8pt),
    ao(name: "d-lumo", x: -1.5, energy: 1.2, electrons: "", label: [LUMO], label-size: 8pt),
    ao(name: "a-homo", x: 1.5, energy: -1.2, electrons: "pair", label: [HOMO], label-size: 8pt),
    ao(name: "a-lumo", x: 1.5, energy: 0.0, electrons: "", label: [LUMO], label-size: 8pt),
    line("d-homo.right", "a-lumo.left", mark: (end: ">"), stroke: (paint: gray, thickness: 0.6pt, dash: (array: (2.5pt, 2pt)))),
    content("d-lumo.top", [donor], anchor: "south", pad: 0.1, size: 8pt),
    content("a-lumo.top", [acceptor], anchor: "south", pad: 0.1, size: 8pt),
    energy-axis(title: [Energy]),
  )
}, kind: image,
  caption: [A donor (left) meeting an acceptor (right). Electrons can flow from the donor's HOMO into the acceptor's LUMO — the game's "give" and "take" bars.],
)

This is how the game guesses "who likes whom" — no recipe book needed. Electron-rich atoms (Obligium, Naturium, lone pairs from Part 1) sit near the top of the HOMO and are natural *givers*; electron-poor spots (a carbonyl's Cardinium, for example) sit near the bottom of the LUMO and are natural *takers*. Conjugation sharpens both: it raises the HOMO and lowers the LUMO, so a conjugated molecule gives and takes more eagerly — and it narrows the gap, making the molecule easier to stir. In the inspector you see two simple bars: *Give* (HOMO) and *Take* (LUMO). You never have to compute anything.

== Where this lives in the code <sec:where-this-lives-in-the-code>

Orbital energies (σ/π levels, HOMO/LUMO and the gap) are computed in `src/chem/` from the molecular graph: the game builds a small model of the π system (the conjugated atoms), solves for its orbitals, and reports the frontier levels to the inspector.
