import type { ElementInfo, ElementSymbol } from "./types";

type ElementSeed = Omit<ElementInfo, "symbol">;

const seed = (symbol: ElementSymbol, info: ElementSeed): ElementInfo => ({
  symbol,
  ...info,
});
/** Single source of truth for elemental data. Radii are in ångströms. */
export const ELEMENTS: Record<ElementSymbol, ElementInfo> = {
  H: seed("H", {
    atomicNumber: 1,
    period: 1,
    name: "Habitium",
    nameRoot: "habit: fills unbonded spaces",
    valence: 1,
    allowedValences: [1],
    valenceElectrons: 1,
    electronConfiguration: "1s1",
    lonePairs: 0,
    electronegativity: 7.17,
    covalentRadius: 0.31,
    vanDerWaalsRadius: 1.1,
    displayColor: 0xf0f3f7,
    peoe: { "*": { a: 7.17, b: 6.24, c: -0.56 } },
    huckelCoulomb: 0.2,
  }),
  B: seed("B", {
    atomicNumber: 5,
    period: 2,
    name: "Brevium",
    nameRoot: "brevis: commonly short of a complete octet",
    valence: 3,
    allowedValences: [3],
    valenceElectrons: 3,
    electronConfiguration: "[He] 2s2 2p1",
    lonePairs: 0,
    electronegativity: 6.42,
    covalentRadius: 0.84,
    vanDerWaalsRadius: 1.92,
    displayColor: 0xffb5b5,
    peoe: {
      sp3: { a: 5.98, b: 6.82, c: 1.605 },
      sp2: { a: 6.42, b: 6.807, c: 1.322 },
    },
    huckelCoulomb: 0.6,
  }),
  C: seed("C", {
    atomicNumber: 6,
    period: 2,
    name: "Cardinium",
    nameRoot: "cardo: backbone hinge of organic structures",
    valence: 4,
    allowedValences: [4],
    valenceElectrons: 4,
    electronConfiguration: "[He] 2s2 2p2",
    lonePairs: 0,
    electronegativity: 7.98,
    covalentRadius: 0.76,
    vanDerWaalsRadius: 1.7,
    displayColor: 0x343b45,
    peoe: {
      sp3: { a: 7.98, b: 9.18, c: 1.88 },
      sp2: { a: 8.79, b: 9.32, c: 1.51 },
      sp: { a: 10.39, b: 9.45, c: 0.73 },
    },
    huckelCoulomb: 0,
  }),
  N: seed("N", {
    atomicNumber: 7,
    period: 2,
    name: "Naturium",
    nameRoot: "nature: changes character across many functional groups",
    valence: 3,
    allowedValences: [3, 4],
    valenceElectrons: 5,
    electronConfiguration: "[He] 2s2 2p3",
    lonePairs: 1,
    electronegativity: 11.54,
    covalentRadius: 0.71,
    vanDerWaalsRadius: 1.55,
    displayColor: 0x3976d3,
    peoe: {
      sp3: { a: 11.54, b: 10.82, c: 1.36 },
      sp2: { a: 12.87, b: 11.15, c: 0.85 },
      sp: { a: 15.68, b: 11.7, c: -0.27 },
    },
    huckelCoulomb: -0.7,
  }),
  O: seed("O", {
    atomicNumber: 8,
    period: 2,
    name: "Obligium",
    nameRoot: "oblige: strongly draws shared electrons",
    valence: 2,
    allowedValences: [2],
    valenceElectrons: 6,
    electronConfiguration: "[He] 2s2 2p4",
    lonePairs: 2,
    electronegativity: 14.18,
    covalentRadius: 0.66,
    vanDerWaalsRadius: 1.52,
    displayColor: 0xe14c52,
    peoe: {
      sp3: { a: 14.18, b: 12.92, c: 1.39 },
      sp2: { a: 17.07, b: 13.79, c: 0.47 },
      sp: { a: 17.07, b: 13.79, c: 0.47 },
    },
    huckelCoulomb: -1.2,
  }),
  F: seed("F", {
    atomicNumber: 9,
    period: 2,
    name: "Faminum",
    nameRoot: "famine: exceptionally hungry for electron density",
    valence: 1,
    allowedValences: [1],
    valenceElectrons: 7,
    electronConfiguration: "[He] 2s2 2p5",
    lonePairs: 3,
    electronegativity: 14.66,
    covalentRadius: 0.57,
    vanDerWaalsRadius: 1.47,
    displayColor: 0x90e050,
    peoe: { sp3: { a: 14.66, b: 13.85, c: 2.31 } },
    huckelCoulomb: -1.45,
  }),
  Cl: seed("Cl", {
    atomicNumber: 17,
    period: 3,
    name: "Claspium",
    nameRoot: "clasp: holds shared electrons tightly",
    valence: 1,
    allowedValences: [1],
    valenceElectrons: 7,
    electronConfiguration: "[Ne] 3s2 3p5",
    lonePairs: 3,
    electronegativity: 11.0,
    covalentRadius: 1.02,
    vanDerWaalsRadius: 1.75,
    displayColor: 0x1fd01f,
    peoe: { sp3: { a: 11.0, b: 9.69, c: 1.35 } },
    huckelCoulomb: -0.75,
  }),
  Br: seed("Br", {
    atomicNumber: 35,
    period: 4,
    name: "Branchium",
    nameRoot: "branch: a heavy halogen leaving branch",
    valence: 1,
    allowedValences: [1],
    valenceElectrons: 7,
    electronConfiguration: "[Ar] 3d10 4s2 4p5",
    lonePairs: 3,
    electronegativity: 10.08,
    covalentRadius: 1.2,
    vanDerWaalsRadius: 1.85,
    displayColor: 0xa62929,
    peoe: { sp3: { a: 10.08, b: 8.47, c: 1.16 } },
    huckelCoulomb: -0.55,
  }),
  I: seed("I", {
    atomicNumber: 53,
    period: 5,
    name: "Inductium",
    nameRoot: "induce: highly polarizable electron cloud",
    valence: 1,
    allowedValences: [1, 3, 5],
    valenceElectrons: 7,
    electronConfiguration: "[Kr] 4d10 5s2 5p5",
    lonePairs: 3,
    electronegativity: 9.9,
    covalentRadius: 1.39,
    vanDerWaalsRadius: 1.98,
    displayColor: 0x8f40a8,
    peoe: { sp3: { a: 9.9, b: 7.96, c: 0.96 } },
    huckelCoulomb: -0.45,
  }),
};

export const ELEMENT_SYMBOLS = Object.keys(ELEMENTS) as ElementSymbol[];
export const ELEMENT_FROM_ATOMIC_NUMBER = new Map(
  ELEMENT_SYMBOLS.map(
    (symbol) => [ELEMENTS[symbol].atomicNumber, symbol] as const,
  ),
);

export const GREEDINESS_RANK = Object.fromEntries(
  [...ELEMENT_SYMBOLS]
    .sort(
      (a, b) => ELEMENTS[b].electronegativity - ELEMENTS[a].electronegativity,
    )
    .map((symbol, rank) => [symbol, rank]),
) as Record<ElementSymbol, number>;

export function isElementSymbol(value: unknown): value is ElementSymbol {
  return typeof value === "string" && Object.hasOwn(ELEMENTS, value);
}

export function elementInfo(symbol: ElementSymbol): ElementInfo {
  return ELEMENTS[symbol];
}
