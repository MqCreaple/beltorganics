# Typst Chemistry Guide (BeltOrganics)

A short guide to writing chemistry formulae and drawing molecular structures in Typst, for use in the project's player docs (`docs/01-molecules.typ`, `docs/02-orbitals.typ`, `docs/03-reactions.typ`).

## Typst Syntax Quick Guide

The following is adapted verbatim from `mqcreaple.github.io/.agents/typst-syntax-quick-guide.md`.

1. Bold texts are enclosed by asterisks. Italic texts are enclosed by underlines. Example: `*bold*, _italic_`.
2. Headings are denoted by equal signs. Example: `= Heading 1`, `== Heading 2`. Always use heading 1 for the highest level headings. Titles does not count as headings.
3. Code blocks have the same syntax as markdown. I.e. ```lang  code  ```  denotes block codes and `code` denotes inline code.
4. `#function(parameter1: value1, parameter2: value2)[body]` is the standard notation of functions. `parameter`s are identifiers, `value`s can be literals (int, float, string, bool, etc.) or other variables, and `body` is a block of content that is written with the same syntax as the main document. Some functions might have parameter names omitted. Some functions might have no body.
5. `#link("https://example.com/")[example content]` is the notation for links. For in-document references (e.g. references to figures, tables, equations, and bibliography), use `<label>` to define a label and use `@label` to reference to that label. The label name should reflect the type of content being labeled. For example, figures should be labeled as @fig:label and equations should be labeled as @eq:label.
6. Both inline and block math equations are enclosed by single dollar sign `$`. Unlike that in LaTeX, math equations in Typst are based on variables. For example, `xyz` will be identified as a single variable called `xyz` instead of three separate letters.
   1. Every single letter (upper- or lower-case) is a predefined variable. Example: `x y z` denotes three letters (equivalent to LaTeX `xyz`).
   2. Common math functions are predefined variables, e.g. `sin`, `cos`, `log`, `sqrt`, ... Therefore, you don't need to have backslashes like LaTeX to represent these math functions.
   3. Texts are quoted by `"`. Example: `"This is a text literal"`.
   4. Common symbols have corresponding variable names. You may reference `.agents/typst-char-map.json`. Some symbols have ASCII shorthands, which you may reference `.agents/typst-symbol-shorthand.json`. *(These two JSON files are shipped in this repo under `.agents/`.)*
   5. Most operators are displayed as their literal texts beside the division sign `/`. `a / b` will be displayed as a fraction (equivalent to LaTeX `\frac{a}{b}`). `\/` displays the literal `/` symbol. To have multiple characters in fractions, use brackets. Example: `(a b) / (c d)` = LaTeX `\frac{ab}{cd}`.
   6. `vec(a, b, c)` denotes column vectors. `mat(a, b, c; d, e, f)` denotes matrices.
   7. `stretch(=)^"above"_"below"`, `stretch(->)^"above"_"below"`, etc. can be used to represent texts above or below equal signs, arrows, etc.
   8. For accents on variables, reference <https://typst.app/docs/reference/math/accent/>.
7. Tables are represented by function `#table(columns: <n>, [*heading 1*], [*heading 2*], ..., [*heading n*], [cell 1, 1], [cell 1, 2], ..., [cell 1, n], [cell 2, 1], [cell 2, 2], ..., [cell 2, n], ...)`, where `<n>` denotes the number of columns and `...` are omitted cells.
8. Images are represented by `#image(url)`.
9. Both tables and images can be made into figures. Example: `#figure(image(url), caption: [some caption])` and `#figure(table(columns: 2, [a], [b], [c], [d]), caption: [some caption])`. Captions will be displayed below the image/table.

---

## Chemistry formulae with `chemformula`

Import the package and its `ch` function:

```typst
#import "@preview/chemformula:0.1.3": ch
```

`ch("...")` evaluates a string as a chemical formula or equation. It is based on Typst's math mode, so most math syntax works inside it.

### Formulas

- Numbers following letters become subscripts: `#ch("H2O")` → H₂O, `#ch("Sb2O3")`.
- Parentheses: `#ch("(NH4)2S")`.
- Charges: `#ch("H+")`, `#ch("CrO4^2-")`, `#ch("[AgCl2]-")`. A `^` superscripts until a space or `;`; IUPAC style uses a space: `#ch("CrO4 ^2-")`.
- Nuclides/isotopes: `#ch("^227_90 Th+")`.
- States of matter: `#ch("H2(g)")`, `#ch("CO3^2-_((aq))")`, `#ch("NaOH(aq)")`.
- Oxidation states: `#ch("Fe^^II Fe^^III_2 O4")`.

### Equations and arrows

- `#ch("CO2 + C -> 2 CO")` (forward), `#ch("A <- B")` (reverse), `#ch("A <-> B")` (equilibrium-resonance), `#ch("A <=> B")` (equilibrium).
- Text above/below arrows: `#ch("A ->[Delta] B")`, `#ch("A <=>[Above][Below] B")`.
- Precipitation / gas markers: `v` after a species marks a precipitate, `^` marks a gas: `#ch("SO4^2- + Ba^2+ -> BaSO4 v")`.
- Multiline equations are allowed; use `\\` inside a `$ ... $` block for line breaks.

### Bonds inside formulas

`ch` can draw bonds directly in a semi-developed formula:

- `--` single bond, `==` double bond, `~~` triple bond.
- Examples: `#ch("CH3--CH2--O-Na+")`, `#ch("O==C(CH3)3")`, `#ch("HC~~CH")`.
- Styling is configurable through `ch` arguments: `bond-length`, `bond-sep`, `bond-baseline`, `bond-stroke`, `bond-styles`, `bond-inset`.

### Using `ch` in math

`ch` integrates with math mode, e.g.:

```typst
$ ch("Zn^2+ <=>[+ 2 OH-][+ 2 H+]") $
```

You can also inject custom functions via `ch.with(scope: (...))`.

## Drawing molecular structures with `alchemist`

Import the package:

```typst
#import "@preview/alchemist:0.2.0": *
```

Recommended setup (exactly what the player docs use):

```typst
#let skeletize = skeletize-config((angle-increment: 30deg, atom-sep: 2em))
```

`alchemist` draws skeletal formulae on a CeTZ canvas. Atoms are `fragment`s, bonds are `link`s (`single`, `double`, `triple`, `dative`, cram wedges).

### Atoms and bonds

- `fragment("H_2O")` places a text fragment: `_` makes subscripts, `^` makes exponents, and `+`/`-` after text render as charges (e.g. `fragment("OH^-")`). A math equation also works: `fragment($C(C H_3)_3$)`.
- Links connect the previous and next fragment: `single()`, `double()`, `triple()`, `dative()`.
- Link angles: `angle: 1` means one step of the configured `angle-increment` (30° in the setup above), `angle: -1` means −30°, `angle: 3` means 90°. For absolute angles use `absolute: 90deg`; for angles relative to the current direction use `relative: 90deg`.
- Links take styling args: `stroke:`, and for `double` also `gap:`, `offset: "left"|"right"|"center"`, `stroke-left:`, `stroke-right:`.

Minimal example — water:

```typst
#skeletize({
  fragment("H")
  single()
  fragment("O", lewis: (
    lewis-double(angle: 90deg),
    lewis-double(angle: -90deg),
  ))
  single()
  fragment("H")
})
```

### Chains, branches and rings

- A *chain* is fragments separated by links; drawing continues from the last fragment.
- `branch({ ... })` draws a side chain starting at the current fragment. Its body must begin with a link. After a branch, drawing resumes at the branching atom. Example — methane:

```typst
#skeletize({
  fragment("C")
  branch({
    single(angle: 6)   // 180°, to the left
    fragment("H")
  })
  branch({
    single(angle: 3)   // 90°, up
    fragment("H")
  })
  branch({
    single(angle: -3)  // -90°, down
    fragment("H")
  })
  single()             // 0°, to the right
  fragment("H")
})
```

- `cycle(faces, { ... })` draws a regular ring. Example — benzene:

```typst
#skeletize({
  cycle(6, {
    single()
    double()
    single()
    double()
    single()
    double()
  })
})
```

### Branched chains with a carbonyl (e.g. acetone)

```typst
#skeletize({
  fragment("H_3C")
  single()
  fragment("C")
  branch({
    double(angle: 3)
    fragment("O")
  })
  single()
  fragment("H_3C")
})
```

### Multiple molecules in one canvas

`operator($->$, margin: 1em)` separates molecules and resets placement, e.g. for reaction schemes. `plus-link()` draws a plus sign between fragments.

### Lewis structures, charges and colors

- Lewis elements are passed as a list to `fragment(..., lewis: (...))`: `lewis-single`, `lewis-double` (two dots), `lewis-line` (a line pair), `lewis-rectangle`, `lewis-charge(charge: $+$, angle: 45deg)`. Each takes `angle:` (default 0deg = to the right) and style args.
- Colors: `fragment("O", colors: (red))` colors the fragment's groups from right to left (used for δ−/δ+ figures).
- `hook(name)` creates a named attachment point; `fragment(..., links: ("hook": single()))` connects to it.

### Other elements

- `parenthesis(l: "[", r: "]", br: $n$, { ... })` draws a bracketed group with an optional index (for polymers).
- `hide(bounds: true, { ... })` hides part of a drawing (e.g. for animations).
- CeTZ shapes can be mixed directly into the `skeletize` body: `#skeletize({ import cetz.draw: * line(...) })`.

## Molecular orbital and energy diagrams with `modiagram`

`@preview/modiagram:0.1.1` (modelled on the LaTeX modiagram package) draws
molecular-orbital and energy-pathway diagrams on a CeTZ canvas. Used in
`docs/02-orbitals.typ` for the orbital-energy figures.

Import through an alias and use a *scoped* block import: modiagram re-exports
CeTZ wrappers named `line`, `grid`, `content`, `circle`, ... that shadow the
Typst built-ins, so keep the star import local:

```typst
#import "@preview/modiagram:0.1.1" as mo

#figure({
  import mo: *
  modiagram(
    ao(name: "homo", x: 0, energy: -0.6, electrons: "pair", label: [HOMO], label-size: 8pt),
    ao(name: "lumo", x: 0, energy:  0.6, electrons: "",     label: [LUMO], label-size: 8pt),
    en-difference("homo", "lumo", body: [gap], ratio: 50%),
    energy-axis(title: [Energy]),
  )
})
```

- `ao(name, x, energy, electrons, label, ...)` draws one orbital bar.
  `x`/`energy` are the bar centre (float = cm); `electrons` is a
  space-separated list of `up`, `down`, `pair` (or `""` for empty);
  `label` goes below the bar (math `$sigma^*$` or content `[HOMO]` both work).
- `connect("a & b", style: "dashed" | "solid" | "dotted" | "gray")` draws
  lines between named orbitals; for plain bars the default is dotted.
- `connect-label("a", "b", body, ratio: 50%, pad: 0.1)` puts content along a
  connection line.
- `energy-axis(title: [Energy])` draws a vertical energy arrow (use
  `style: "horizontal"` to lay it flat); `x-axis(title: [...])` adds a
  horizontal axis and shares the origin corner with it.
- `en-difference("a", "b", body: [gap])` draws a double-headed arrow between
  two orbitals with an optional boxed ΔE label — ideal for HOMO–LUMO gaps.
- `en-pathway(0, 0.5, 1.0, labels: (...), ...)` places a sequence of orbitals
  at even spacing (reaction/energy pathways); `ep-annotation(from, to, ...)`
  spans two of them with a double-headed arrow.
- CeTZ wrappers (`line`, `content`, `circle`, `rect`, `mark`, ...) accept
  orbital-position strings like `"homo.right"`, `"lumo.top"`, or
  interpolations `("a.bottom", 50%, "b.bottom")`. Example: a dashed electron
  flow arrow between two orbitals:
  `line("d-homo.right", "a-lumo.left", mark: (end: ">"), stroke: (paint: gray, thickness: 0.6pt, dash: (array: (2.5pt, 2pt))))`.
- Per-diagram overrides go through `config(...)` inside the diagram (keys:
  `color`, `style`, `label-size`, `x-scale`, `energy-scale`, ...); document
  defaults via `modiagram-setup(...)`.

### Tips

- Inside `skeletize({ ... })`, every call must be on its own line or separated by `;` (normal Typst code-block rules).
- The empty fragment `fragment("")` is allowed and takes no space; useful for drawing charges/Lewis structures without an atom.
- Angles are relative to the drawing direction unless `absolute:` is given; keep a consistent `angle-increment` so `angle: 1`, `angle: 2`, ... are easy to reason about.
- The player docs use the `ilm` template (`@preview/ilm:1.4.0`) for layout (cover page, table of contents, figure/table indices); the chemistry setup above is all you need on top of it. See `docs/01-molecules.typ`, `docs/02-orbitals.typ` and `docs/03-reactions.typ` for complete working examples.
- Package versions used in this repo: `alchemist:0.2.0` (depends on `cetz:0.5.2`), `chemformula:0.1.3`, `modiagram:0.1.1` (depends on `cetz:0.4.2`, `zero:0.6.1`); compile with Typst >= 0.14 (`typst compile docs/01-molecules.typ`).
