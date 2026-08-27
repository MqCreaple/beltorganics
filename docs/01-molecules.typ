#import "@preview/alchemist:0.2.0": *
#import "@preview/chemformula:0.1.3": ch
#import "@preview/ilm:1.4.0": *

#set text(lang: "en")

#show: ilm.with(
  title: [Molecules: atoms, bonds, and what they can do],
  author: "BeltOrganics",
  date: none,
  abstract: [The player guide to molecules: what a molecule is, the four atoms, bonds, partial charges, HOMO and LUMO, identity and naming, and a first look at functional groups.],
  figure-index: (enabled: true),
  table-index: (enabled: true),
)

#let skeletize = skeletize-config((angle-increment: 30deg, atom-sep: 2em))

#let molfig(body, caption) = figure(
  align(center, body),
  kind: image,
  caption: caption,
)

= Molecules: atoms, bonds, and what they can do

This is the player guide to the chemistry of *BeltOrganics*. You need no chemistry knowledge: everything below is explained from scratch, simplified so that it is easy to learn — and, more importantly, easy to *predict*. Part 1 (this file) is about molecules: what they are and how to read their properties. Part 2 (`docs/02-reactions.typ`) is about reactions: what happens when molecules meet.

The game takes place in a universe whose physics are *almost* like ours, but simpler. The chemistry has been tuned so that it behaves like the real thing in the ways that matter for gameplay, while staying predictable enough to plan a factory around.

#blockquote[*Note:* all numbers in this booklet are illustrative. The final game balance may differ.]

== What is a molecule?

A *molecule* is a small group of *atoms* held together by *bonds*.

- An *atom* is a tiny building block. Every atom has a fixed number of *hands* (chemists say *valence*): the number of bonds it can form.
- A *bond* connects two atoms. Making a bond uses up one hand from each atom.

The best mental picture is a LEGO model: the bricks are atoms, the stud connections are bonds, and a molecule is just the answer to "which brick is snapped to which". How you draw it does not matter — rotate it, stretch it, or redraw it, and it is still the same molecule. (A mirror image is the one exception: like a left and right hand, a molecule and its mirror image can be genuinely different molecules. The current game does not distinguish them.)

The game stores every molecule as a *molecular graph*: a set of dots (the atoms) and lines (the bonds), with no geometry attached. That is why the game can instantly tell whether two molecules are identical: it compares their graphs, not their pictures.

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

== The four atoms

The whole game is built from just four kinds of atoms, each with an invented name: Cardinium (C), Habitium (H), Obligium (O) and Naturium (N). The letters in parentheses are the shorthand used in formulas and canonical names, so water is written #ch("H2O") and ethanol is `CCO`.

#figure(
  table(
    columns: (auto, auto, auto, 1fr),
    align: (left, center, center, left),
    [*Atom*], [*Hands (bonds)*], [*Lone pairs*], [*Personality*],
    [Cardinium (#ch("C"))], [4], [0], [The connector: builds chains and rings.],
    [Habitium (#ch("H"))], [1], [0], [The tiny filler: caps unused hands, usually hidden in drawings.],
    [Obligium (#ch("O"))], [2], [2], [The greedy one: pulls shared electrons toward itself.],
    [Naturium (#ch("N"))], [3], [1], [The moderate one: carries a spare electron pair.],
  ),
  caption: [The four atoms: hands (bonds), lone pairs, and personality.],
)

- *Hands*: each atom can form at most this many bonds. A Cardinium atom with all four hands full is "satisfied"; one with a free hand is unhappy and reactive.
- *Lone pairs*: electrons that belong to a single atom and are not shared in a bond. They make that atom electron-rich (more on this later).

Colors are the usual ones: Cardinium black, Obligium red, Naturium blue, and Habitium white (it is usually left out of drawings).

== Bonds

A *bond* is a shared pair of electrons.

- A *single bond* shares one pair: #ch("C--C"), #ch("C--O"), #ch("C--H").
- A *double bond* shares two pairs: #ch("C==C"), #ch("C==O"). It is stronger than a single bond and holds the two atoms closer together, so they cannot spin freely around it.
- A *triple bond* shares three pairs and is stronger still.

Every bond type has an *energy*: how much effort it costs to break it. Strong bonds (like #ch("C==O"), the carbonyl) are stable and hard to break; weak bonds (such as #ch("O--O")) snap easily. To keep things predictable, the game gives *one energy per bond type* — every #ch("C--C") single bond has exactly the same energy, no matter what is attached around it. This is a deliberate simplification: it means you can count bonds on a piece of paper and predict how a reaction will feel energetically (Part 2 shows how).

== Reading the drawings

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
  [Benzene in the skeletal style: the ring is made of six carbons; the double lines are double bonds.],
)

The in-game viewer uses the explicit style and shows Habitium atoms when you select a molecule.

== Polarity and partial charges

Electronegativity is a fancy word for "greediness for shared electrons". Some atoms pull harder on the electrons in a bond than others:

- Cardinium and Habitium are evenly matched, so a #ch("C--H") bond is *neutral*: the electrons sit in the middle.
- Obligium is greedier. In a #ch("C--O") or #ch("O--H") bond, the shared electrons spend more time near the Obligium. The Obligium becomes slightly negative and its partner slightly positive.

These slight, fractional charges are called *partial charges*. They are computed for every atom of every molecule and shown in the inspector. Partial charges mark the *hot spots* of a molecule: the electron-rich (δ−) and electron-poor (δ+) places where reactions like to start.

#molfig(
  skeletize({
    fragment("O", colors: (red))
    branch({
      single(angle: 1)
      fragment("H", colors: (blue))
    })
    single(angle: -1)
    fragment("H", colors: (blue))
  }),
  [Water is polar: red = slightly negative (δ−), blue = slightly positive (δ+).],
)

Polarity is not decoration: it decides how molecules interact with solvents (Part 2), and it tells you where a molecule will react.

== Lone pairs

Some electrons are not used for bonds at all: they sit on a single atom as a *lone pair*. Obligium carries two, Naturium one. A lone pair makes its atom electron-rich and "donor-like" — a natural place where electron-hungry partners like to attach. Whenever you see a molecule with an Obligium or Naturium, expect the interesting chemistry to happen near it.

== HOMO and LUMO — the giving and taking shelves

Electrons around a molecule arrange themselves on *shelves* (chemists call them orbitals), with at most two electrons per shelf. The two shelves that matter are the *frontier* shelves:

#figure(
  table(
    columns: (auto, auto, 1fr),
    [*Name*], [*State*], [*Meaning*],
    [HOMO], [full], [The highest occupied shelf — how strongly the molecule is willing to *give* electrons.],
    [LUMO], [empty], [The lowest unoccupied shelf — how strongly the molecule wants to *take* electrons.],
  ),
  caption: [The frontier shelves.],
)

- A small gap between HOMO and LUMO means the molecule is easily stirred: reactive, unstable, often colorful.
- A large gap means the molecule is stable and content to sit around.

When two molecules meet, the game checks whether one's "give" level (HOMO) can reach the other's "take" level (LUMO). If they match, electrons can flow and a reaction becomes possible. This is how the game guesses "who likes whom" — no recipe book needed. In the inspector you see two simple bars: *Give* (HOMO) and *Take* (LUMO). You never have to compute anything.

== Same molecule, different look: identity, isomers and names

Because the game works with molecular graphs, it can give every molecule a *canonical name*: a unique string derived purely from the connections. Two molecules are the same if and only if their canonical names are identical — no matter how they are drawn or rotated.

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

== A first look at functional groups

Certain small patterns keep showing up, and they behave characteristically. Chemists call them *functional groups*. Two you will meet immediately:

- The *carbonyl* group, #ch("C==O") — the heart of ketones, esters, acids and amides. The Cardinium of a carbonyl is electron-poor (a great "take" spot), and the Obligium is electron-rich.
- The *hydroxyl* group, #ch("O--H") — the signature of alcohols (and, attached to a carbonyl, of acids).

#molfig(
  skeletize({
    fragment("H_3C")
    single()
    fragment("C")
    branch({
      double(angle: 3)
      fragment("O")
    })
    single()
    fragment("H_3C")
  }),
  [Acetone: two methyl groups around a carbonyl. The #ch("C==O") is the reactive hotspot.],
)

Recognizing these patterns is most of the skill of the game: once you know how a carbonyl or a hydroxyl behaves, you can predict what a whole molecule will do.

== Where this lives in the code

The molecular graph, canonical naming, and property calculators (partial charges, HOMO/LUMO) live in `src/chem/` in the game's source code.