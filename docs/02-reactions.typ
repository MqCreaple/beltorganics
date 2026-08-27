#import "@preview/alchemist:0.2.0": *
#import "@preview/chemformula:0.1.3": ch
#import "@preview/ilm:1.4.0": *

#set text(lang: "en")

#show: ilm.with(
  title: [Reactions: turning molecules into other molecules],
  author: "BeltOrganics",
  date: none,
  abstract: [The player guide to reactions: reaction chambers, bond energy and enthalpy, entropy, Gibbs free energy, side reactions, and separation by belts, phases and solvents.],
  figure-index: (enabled: true),
  table-index: (enabled: true),
)

#let skeletize = skeletize-config((angle-increment: 30deg, atom-sep: 2em))

#let molfig(body, caption) = figure(
  align(center, body),
  kind: image,
  caption: caption,
)

= Reactions: turning molecules into other molecules

Part 2 of the player guide (Part 1: `docs/01-molecules.typ`). A *reaction* is what happens when molecules meet: some bonds break, new bonds form, and different molecules come out. Your job in the game is to make the reactions you want happen — and to deal with the ones you don't.

#blockquote[*Note:* all numbers in this booklet are illustrative. The final game balance may differ.]

== Reaction chambers

A *reaction chamber* is the machine where chemistry happens. Molecules flow in on belts, mix inside, react, and the products leave through output ports. Every chamber has a *temperature* dial, and temperature is one of your main controls.

Nothing in a chamber is scripted. For every pair (or trio) of molecules present, the game generates candidate reactions on the fly, checks which ones are *possible*, and then rolls weighted dice to see which ones actually happen. The three ingredients that decide possibility are explained next: energy (ΔH), messiness (ΔS), and temperature (T).

== Bond energy and enthalpy (ΔH)

Bonds store energy. *Breaking* a bond costs energy; *forming* a bond releases energy. The *enthalpy change* of a reaction is simply:

$ Delta H = E_("bonds broken") - E_("bonds formed") $

- If forming releases more than breaking costs, $Delta H < 0$: the reaction is *exothermic*. It gives off heat and "wants" to happen — fire and explosions are the extreme example.
- If breaking costs more, $Delta H > 0$: the reaction is *endothermic*. It needs energy pumped in, like cooking. A hot chamber helps it along.

Because the game gives each bond type one fixed energy, you can estimate ΔH for any reaction by counting bonds. The typical values (illustrative, in the same spirit as real chemistry tables):

#figure(
  table(
    columns: (auto, auto),
    [*Bond*], [*Energy*],
    [#ch("C--H")], [99],
    [#ch("C--C")], [83],
    [#ch("C==C")], [146],
    [#ch("C--O")], [86],
    [#ch("C==O")], [178],
    [#ch("O--H")], [111],
    [#ch("N--H")], [93],
    [#ch("H--H")], [104],
  ),
  caption: [Typical bond energies (illustrative values).],
)

(Units are "kcal per mole" in real chemistry; the game rescales them to its own energy units, but the relative ordering is what matters.)

== Entropy (ΔS): the love of mess

*Entropy* is a measure of how spread out things are. Nature loves spreading out, so reactions that increase entropy get a free push. A few practical rules:

- *More molecules* = messier. A reaction that turns one molecule into two gains entropy and is favored; two molecules merging into one loses entropy and needs a compensating reason.
- *Gases are messy.* Molecules in a gas fly around freely. Reactions that make a gas gain entropy; reactions that consume a gas lose it.
- *Concentration matters.* A crowded (concentrated) reactant mixture pushes a reaction forward; piling up products pushes it backward. This is the lever your belts pull — more on that under *Separation* below.

== Gibbs free energy (ΔG): the referee

Temperature and entropy combine with enthalpy into the *Gibbs free energy*:

$ Delta G = Delta H - T dot Delta S $

- If $Delta G < 0$, the reaction *can proceed* (it is *spontaneous*).
- If $Delta G > 0$, it cannot — the reverse reaction is the one that wants to happen.

The temperature $T$ decides how much the messiness term matters. A reaction can be impossible at low temperature and become spontaneous when you heat the chamber — or the other way around. That is why turning the dial changes what happens inside.

One more subtlety: even a spontaneous reaction rarely runs to completion. Reactions settle at an *equilibrium* — a balance where the forward and reverse reactions happen at the same rate. You can push the balance:

- *Remove a product* → the reaction makes more of it (this is the most useful trick in the game).
- *Pile up a product* → the reaction runs backward.
- *Add a reactant* → the reaction is pushed forward.

The chamber UI shows each candidate reaction with a "will it react?" meter, computed from ΔG at the current temperature and concentrations.

== Side reactions: the fun and the pain

Real mixtures are messy. Alongside the reaction you planned, the same molecules can react in other ways: over-oxidation, decomposition, two molecules joining the "wrong" way, and so on. These are *side reactions*, and they are a feature, not a bug: they are what makes chemistry feel alive.

The game never uses a recipe book. It looks at the molecules actually present in the chamber, generates every plausible rearrangement, and rolls weighted dice every tick. More favorable (more negative ΔG) and more concentrated paths are more likely; temperature shifts the weights. The result is a plant that can surprise you — which is exactly why you need separation.

== Separation: ports, belts, phases and solubility

Every molecule has a *state of matter*: gas, liquid, or dissolved in a solvent. A chamber's output ports connect to *typed belts*, and the type decides what can leave:

- *Gas port → gas belt.* Gaseous molecules escape through it. Their concentration in the chamber drops — and, by the equilibrium rules above, any reaction that makes gas gets pulled forward. If your reaction produces a gas, attaching a gas belt keeps it going.
- *Solvent belts.* Liquid belts are filled with a solvent, and solvents come in *polar* and *nonpolar* flavours. A nonpolar solvent (like cyclohexane) happily carries nonpolar molecules; a polar solvent prefers polar ones. How eagerly a molecule hops onto a belt depends on its *solubility* in that solvent — the same physics as oil and water: oil loves oil, water loves water.

Choosing which belts to attach is choosing which molecules you pull out of the chamber — and therefore which way the equilibria swing. This is the heart of the factory gameplay: reactants in, desired product out, everything else handled.

== A worked example: making an ester

Acids and alcohols react to give *esters* plus water:

#align(center)[#ch("CH3--C(==O)--OH + CH3--CH2--OH <=> CH3--C(==O)--O--CH2--CH3 + H2O")]

(acetic acid + ethanol, in equilibrium with ethyl acetate + water). The double arrow means the reaction is reversible: if you do nothing, it stalls partway with a mix of all four molecules.

The classic solution is *removal*: attach a port that carries the water away, and the equilibrium shifts to make more ester. Keep the temperature moderate — too hot, and side reactions (the alcohol dehydrating to ethene, for example) start competing; too cold, and the reaction crawls.

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
    fragment("O")
    single()
    fragment("H_2C")
    single()
    fragment("H_3C")
  }),
  [Ethyl acetate, the ester product: a carbonyl (#ch("C==O")) next to a #ch("C--O--C") link.],
)

Every problem in the game has this shape: pick a reaction, then manage energy (temperature), messiness (concentration and removal), and side reactions (purification and separation).

== Where this lives in the code

Reaction thermodynamics (ΔH, ΔS, ΔG) live in `src/chem/`; belts, chambers and ports live in `src/world/` in the game's source code.