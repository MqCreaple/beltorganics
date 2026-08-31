#import "@preview/alchemist:0.2.0": *
#import "@preview/chemformula:0.1.3": ch
#import "@preview/ilm:1.4.0": *

#set text(lang: "en")

#show: ilm.with(
  title: [Molecules: atoms, bonds, and shapes],
  author: "BeltOrganics",
  date: none,
  abstract: [The player guide to molecules: what a molecule is, the game's atoms, bonds and bond polarity, lone pairs, shape and stereochemistry, identity and naming, and a first look at functional groups.],
  figure-index: (enabled: true),
  table-index: (enabled: true),
)

#let skeletize = skeletize-config((angle-increment: 30deg, atom-sep: 3em))

#let molfig(body, caption) = figure(
  align(center, body),
  kind: image,
  caption: caption,
)

= Molecules: atoms, bonds, and shapes <sec:molecules>

This is the player guide to the chemistry of *BeltOrganics*. You need no chemistry knowledge: everything below is explained from scratch, simplified so that it is easy to learn — and, more importantly, easy to *predict*. Part 1 (this file) is about molecules: what they are, how they are put together, and how to tell them apart. Part 2 (`docs/02-orbitals.typ`) is about orbitals: where the electrons live, and what that means for bonding and reactivity. Part 3 (`docs/03-reactions.typ`) is about reactions: what happens when molecules meet.

The game takes place in a universe whose physics are *almost* like ours, but simpler. The chemistry has been tuned so that it behaves like the real thing in the ways that matter for gameplay, while staying predictable enough to plan a factory around.

#blockquote[*Note:* all numbers in this booklet are illustrative. The final game balance may differ.]

== What is a molecule? <sec:what-is-a-molecule>

A *molecule* is a small group of *atoms* held together by *bonds*.

- An *atom* is a tiny building block. Every atom has a fixed number of *hands* (chemists say *valence*): the number of bonds it can form.
- A *bond* connects two atoms. Making a bond uses up one hand from each atom.

The best mental picture is a LEGO model: the bricks are atoms, the stud connections are bonds, and a molecule is just the answer to "which brick is snapped to which". How you draw it does not matter — rotate it, stretch it, or redraw it, and it is still the same molecule. (A mirror image is the one exception: like a left and a right hand, a molecule and its mirror image can be genuinely different molecules. We will meet those in @sec:stereochemistry.)

The game stores every molecule as a *molecular graph*: a set of dots (the atoms) and lines (the bonds), with no geometry attached — plus, for a few special atoms and bonds, a tiny *stereo label* that records the molecule's shape (again, see @sec:stereochemistry). That is why the game can instantly tell whether two molecules are identical: it compares their graphs, not their pictures.

#molfig(
  grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    skeletize({
      fragment("H_3C")
      single()
      fragment("H_2C")
      single()
      fragment("OH")
    }),
    skeletize({
      fragment("OH")
      single()
      fragment("H_2C")
      single()
      fragment("H_3C")
    }),
  ),
  [Ethanol drawn two different ways. The game's fingerprint knows these are the same molecule — only the connections matter.],
)

== The atoms <sec:the-atoms>

The game begins with four common atoms — Cardinium (C), Habitium (H), Obligium (O) and Naturium (N) — and adds nine specialist atoms as the factory grows. The letters in parentheses are the shorthand used in formulas and canonical names, so water is written #ch("H2O"), ethanol is `CCO`, and chloromethane is `CCl`.

#pagebreak(weak: true)
#figure(
  table(
    columns: (auto, auto, auto, 1fr),
    align: (left, center, center, left),
    [*Atom*], [*Usual hands*], [*Lone pairs*], [*Personality*],
    [Cardinium (#ch("C"))], [4], [0], [The connector: builds chains and rings.],
    [Habitium (#ch("H"))], [1], [0], [The tiny filler: caps unused hands, usually hidden in drawings.],
    [Obligium (#ch("O"))], [2], [2], [The greedy one: pulls shared electrons toward itself.],
    [Naturium (#ch("N"))], [3], [1], [The moderate one: carries a spare electron pair.],
    [Brevium (#ch("B"))], [3], [0], [The incomplete one: keeps an empty orbital ready to accept electrons.],
    [Faminum (#ch("F"))], [1], [3], [The hungriest halogen: pulls electron density strongly.],
    [Claspium (#ch("Cl"))], [1], [3], [A larger halogen that holds shared electrons tightly.],
    [Branchium (#ch("Br"))], [1], [3], [A heavy, polarizable halogen branch.],
    [Inductium (#ch("I"))], [1], [3], [The most polarizable halogen cloud.],
    [Sociatium (#ch("S"))], [2], [2], [A flexible connector that can also use four or six hands.],
    [Pivotium (#ch("P"))], [3], [1], [A branching center that can also use five hands.],
    [Liberium (#ch("Li"))], [1], [0], [A metal that readily gives up its outside electron.],
    [Mergium (#ch("Mg"))], [2], [0], [A two-handed metal used to join organic groups to reactive centers.],
  ),
  caption: [The game's atoms: their usual hands, lone pairs, and pseudo-chemical personality.],
)

- *Hands*: the number shown is the usual neutral bonding pattern. Cardinium follows four hands, while the larger Sociatium and Pivotium atoms can use expanded patterns. The game records those allowed patterns explicitly.
- *Lone pairs*: electrons that belong to a single atom and are not shared in a bond. They make that atom electron-rich (more on this later).

Colors follow a consistent element palette: Cardinium is dark, Obligium red, Naturium blue, Habitium white, and each specialist atom has its own color in the 3D viewer.

*Naming compounds.* Simple inorganic compounds are named from the invented element names rather than the real ones. A two-element compound takes the name of the greedier element with an *-ide* ending, with a number prefix when there is more than one: #ch("CO2") is *cardinium diobligide*, #ch("CO") is *cardinium obligide*, #ch("NH3") is *trihabitium naturide*, and #ch("H2") is *dihabitium*. Acids add *-ic acid*: *cardinic acid* is carbonic acid. Water is formally *dihabitium obligide*, but everyone still calls it water. Organic compounds keep their familiar names — ethanol, benzene, acetone and the rest.

== Bonds <sec:bonds>

A *bond* is a shared pair of electrons.

- A *single bond* shares one pair: #ch("C--C"), #ch("C--O"), #ch("C--H").
- A *double bond* shares two pairs: #ch("C==C"), #ch("C==O"). It is stronger than a single bond and holds the two atoms closer together, so they cannot spin freely around it.
- A *triple bond* shares three pairs and is stronger still.

Every bond type has an *energy*: how much effort it costs to break it. Strong bonds (like #ch("C==O"), the carbonyl) are stable and hard to break; weak bonds (such as #ch("O--O")) snap easily. To keep things predictable, the game gives *one energy per bond type* — every #ch("C--C") single bond has exactly the same energy, no matter what is attached around it. This is a deliberate simplification: it means you can count bonds on a piece of paper and predict how a reaction will feel energetically (Part 3 shows how). Part 2 explains *why* a double bond is stronger than a single bond: it is built from two different kinds of electron pairs.

== Reading the drawings <sec:reading-the-drawings>

The game draws molecules in two styles:

- *Explicit*: every atom is shown as its symbol, with lines for bonds. Water looks like this — the two dots are lone pairs on the Obligium:

#molfig(
  skeletize({
    fragment("H")
    single()
    fragment("O", lewis: (
      lewis-double(angle: 90deg),
      lewis-double(angle: -90deg),
    ))
    single()
    fragment("H")
  }),
  [Water: H—O—H with two lone pairs on the Obligium atom.],
)

- *Skeletal*: Cardinium atoms are the corners and kinks of the drawing, and their Habitium atoms are hidden. Only "interesting" atoms (Obligium, Naturium, ...) are written out. Methane, drawn explicitly, is a Cardinium with four Habitium atoms:

#molfig(
  skeletize({
    fragment("C")
    branch({
      single(angle: 6)
      fragment("H")
    })
    branch({
      single(angle: 3)
      fragment("H")
    })
    branch({
      single(angle: -3)
      fragment("H")
    })
    single()
    fragment("H")
  }),
  [Methane: one Cardinium atom, four Habitium atoms.],
)

... and benzene, drawn skeletally, is just a ring — six Cardinium atoms, each with one hidden Habitium:

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
  [Benzene in the skeletal style: the ring is made of six Cardinium atoms; the double lines are double bonds.],
)

The in-game viewer uses the explicit style and shows Habitium atoms when you select a molecule.

== Polarity and partial charges <sec:polarity>

Electronegativity is a fancy word for "greediness for shared electrons". Some atoms pull harder on the electrons in a bond than others:

- Cardinium and Habitium are evenly matched, so a #ch("C--H") bond is *neutral*: the electrons sit in the middle.
- Obligium is greedier. In a #ch("C--O") or #ch("O--H") bond, the shared electrons spend more time near the Obligium. The Obligium becomes slightly negative and its partner slightly positive.

These slight, fractional charges are called *partial charges*. They are computed from the molecular graph for every atom and shown directly on the inspector's 3D model in its *Charge* layer: electron-rich atoms fade toward blue (δ−), while electron-poor atoms fade toward red (δ+). Partial charges mark the *hot spots* of a molecule — the places where reactions like to start.

#molfig(
  skeletize({
    fragment("O", colors: (blue))
    branch({
      single(angle: 1)
      fragment("H", colors: (red))
    })
    single(angle: -1)
    fragment("H", colors: (red))
  }),
  [Water is polar: blue = slightly negative (δ−), red = slightly positive (δ+).],
)

Polarity is not decoration: it decides how molecules interact with solvents (Part 3), and it tells you where a molecule will react. Where the greediness itself comes from — which electrons the atoms are fighting over — is a story about *orbitals*, told in Part 2.

== Lone pairs <sec:lone-pairs>

Some electrons are not used for bonds at all: they sit on a single atom as a *lone pair*. Obligium carries two, Naturium one. A lone pair makes its atom electron-rich and "donor-like" — a natural place where electron-hungry partners like to attach. Whenever you see a molecule with an Obligium or Naturium, expect the interesting chemistry to happen near it. In a conjugated molecule a donating lone pair can become part of the shared π cloud; the 3D inspector then shows it in that cloud instead of drawing the same pair twice as a localized lobe.

== Shape and stereochemistry <sec:stereochemistry>

The game draws molecules flat, but molecules are really *three-dimensional*. A Cardinium atom with four single bonds points its four hands toward the corners of a tetrahedron; the two atoms of a double bond and their neighbours lie flat in one plane. For most molecules this shape is just decoration — but sometimes it decides what a molecule *is*.

*Mirror images.* Take a Cardinium atom with four *different* neighbours. Its four hands can be arranged in two ways that are mirror images of each other — like a left hand and a right hand. No rotation turns one into the other, so the two versions are genuinely different molecules (chemists call them *enantiomers*). Each such center gets a *stereo label*: the game remembers which arrangement it is, gives the two forms different canonical names, and never merges them on a belt.

*Double bonds cannot spin.* The two atoms of a double bond are locked flat, and so are the groups attached to them. When both ends carry two different groups, those groups can sit on the *same side* of the bond (cis, also called Z) or on *opposite sides* (trans, also called E). These are different molecules with different personalities: a cis molecule usually has a stronger dipole, because its polar bits point the same way, so it is more polar and dissolves differently than its trans cousin. Separation cares about that.

In drawings, a solid wedge means "coming toward you", a dashed wedge means "going away", and the flat lines lie in the page.

#molfig(
  grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    skeletize({
      fragment("C")
      branch({
        single(angle: 3)
        fragment("H")
      })
      branch({
        cram-filled-left(angle: -4.5)
        fragment("OH")
      })
      branch({
        cram-dashed-left(angle: 5.5)
        fragment("NH_2")
      })
      single(angle: -1)
      fragment("CH_3")
    }),
    skeletize({
      fragment("C")
      branch({
        single(angle: 3)
        fragment("H")
      })
      branch({
        cram-dashed-left(angle: -4.5)
        fragment("OH")
      })
      branch({
        cram-filled-left(angle: 5.5)
        fragment("NH_2")
      })
      single(angle: -1)
      fragment("H_3C")
    }),
  ),
  [A Cardinium with four different neighbours (H, CH₃, OH, NH₂) comes in two mirror-image forms. Swap the wedges and you get the other one.],
)

#molfig(
  grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    skeletize({
      fragment("H_3C")
      single(angle: -2)
      fragment("C")
      branch({
        single(angle: -4)
        fragment("H")
      })
      double()
      fragment("C")
      branch({
        single(angle: 2)
        fragment("H")
      })
      single(angle: -2)
      fragment("CH_3")
    }),
    skeletize({
      fragment("H_3C")
      single(angle: -2)
      fragment("C")
      branch({
        single(angle: -4)
        fragment("H")
      })
      double()
      fragment("C")
      branch({
        single(angle: -2)
        fragment("H")
      })
      single(angle: 2)
      fragment("CH_3")
    }),
  ),
  [But-2-ene exists as cis (left, both methyls on the same side) and trans (right, on opposite sides). The double bond cannot spin, so they stay different.],
)

How does the game keep track of all this? On top of the molecular graph it stores a small local bond-order label at each chiral center and a same-side pair of substituent bonds at each specified double bond. From that pair, any two groups across the double bond are cis when both are selected or both are unselected, and trans when only one is selected. No group has to be called the “largest,” so this also works when neither side is Habitium and when a long molecule contains many locked double bonds. Two drawings of the same molecule still produce the same canonical name. These labels are enough to name R and S differently, keep cis and trans apart on belts, and never accidentally merge two different substances.

A useful rule of thumb for the factory floor: *enantiomers* (an R/S pair) have identical energies and solubilities — in this universe they behave exactly alike, they are just different objects. *Diastereomers* (cis/trans, E/Z) differ in polarity, stability and solubility — exactly the kind of difference your belts and solvents can exploit.

== Same molecule, different look: identity, isomers and names <sec:identity>

Because the game works with molecular graphs (plus their stereo labels), it can give every molecule a *canonical name*: a unique string derived purely from the connections. Two molecules are the same if and only if their canonical names are identical — no matter how they are drawn or rotated. When a molecule has stereochemistry, its canonical name carries the stereo labels too, so the two mirror-image forms or the cis/trans pair get different names.

This matters because *isomers* exist: molecules with the same atoms but a different wiring are completely different substances. The formula #ch("C2H6O") fits two molecules — ethanol (the familiar alcohol) and dimethyl ether:

#molfig(
  grid(
    columns: (1fr, 1fr),
    column-gutter: 2em,
    skeletize({
      fragment("H_3C")
      single()
      fragment("H_2C")
      single()
      fragment("OH")
    }),
    skeletize({
      fragment("H_3C")
      single()
      fragment("O")
      single()
      fragment("H_3C")
    }),
  ),
  [Both are #ch("C2H6O"), but they are different molecules: ethanol (left, with the #ch("O--H")) and dimethyl ether (right, with the #ch("C--O--C")).],
)

The canonical names use a familiar, compact shorthand (the same idea as the *SMILES* notation used in real chemistry software): ethanol is `CCO`, dimethyl ether is `COC`. That keeps in-game names short and lets you copy them into chemistry tools if you ever want to.

== A first look at functional groups <sec:functional-groups>

Certain small patterns keep showing up, and they behave characteristically. Chemists call them *functional groups*. Two you will meet immediately:

- The *carbonyl* group, #ch("C==O") — the heart of ketones, esters, acids and amides. The Cardinium of a carbonyl is electron-poor (a great "take" spot), and the Obligium is electron-rich.
- The *hydroxyl* group, #ch("O--H") — the signature of alcohols (and, attached to a carbonyl, of acids).

#molfig(
  skeletize({
    fragment("H_3C")
    single(angle: 1)
    fragment("C")
    branch({
      double(angle: 3)
      fragment("O")
    })
    single(angle: -1)
    fragment("CH_3")
  }),
  [Acetone: two methyl groups around a carbonyl. The #ch("C==O") is the reactive hotspot.],
)

Recognizing these patterns is most of the skill of the game: once you know how a carbonyl or a hydroxyl behaves, you can predict what a whole molecule will do. Part 2 explains *why* these patterns behave the way they do — their electrons live in special orbitals.

== Where this lives in the code <sec:where-this-lives-in-the-code>

The molecular graph, canonical naming (with stereo labels), and property calculators (partial charges, stereochemistry) live in `src/chem/` in the game's source code.
