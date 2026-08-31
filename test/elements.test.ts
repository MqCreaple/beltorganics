import { describe, expect, it } from "vitest";
import {
  ELEMENTS,
  ELEMENT_FROM_ATOMIC_NUMBER,
  ELEMENT_SYMBOLS,
  Molecule,
  generateMoleculeGeometry,
  parseSmiles,
  partialCharges,
} from "../src/chem";

describe("element catalog", () => {
  it("contains every requested element and all properties in ElementInfo", () => {
    expect(new Set(ELEMENT_SYMBOLS)).toEqual(
      new Set([
        "H",
        "Li",
        "B",
        "C",
        "N",
        "O",
        "F",
        "Mg",
        "P",
        "S",
        "Cl",
        "Br",
        "I",
      ]),
    );
    expect(
      new Set(ELEMENT_SYMBOLS.map((symbol) => ELEMENTS[symbol].atomicNumber))
        .size,
    ).toBe(ELEMENT_SYMBOLS.length);
    for (const symbol of ELEMENT_SYMBOLS) {
      const info = ELEMENTS[symbol];
      expect(ELEMENT_FROM_ATOMIC_NUMBER.get(info.atomicNumber)).toBe(symbol);
      expect(info.name[0]?.toLowerCase()).toBe(symbol[0]?.toLowerCase());
      for (const letter of symbol.slice(1))
        expect(info.name.toLowerCase()).toContain(letter.toLowerCase());
      expect(info.allowedValences).toContain(info.valence);
      expect(info.covalentRadius).toBeGreaterThan(0);
      expect(info.vanDerWaalsRadius).toBeGreaterThan(info.covalentRadius);
      expect(Object.values(info.peoe).length).toBeGreaterThan(0);
    }
  });

  it("uses expanded valences for phosphorus and sulfur validation", () => {
    const phosphorus = new Molecule();
    const p = phosphorus.addAtom("P");
    for (let index = 0; index < 5; index += 1)
      phosphorus.addBond(p, phosphorus.addAtom("F"));
    expect(phosphorus.validate()).toHaveLength(0);

    const sulfur = new Molecule();
    const s = sulfur.addAtom("S");
    for (let index = 0; index < 6; index += 1)
      sulfur.addBond(s, sulfur.addAtom("F"));
    expect(sulfur.validate()).toHaveLength(0);
  });

  it("polarizes carbon-halogen bonds toward the halogen", () => {
    for (const halogen of ["F", "Cl", "Br", "I"] as const) {
      const molecule = new Molecule();
      const carbon = molecule.addAtom("C");
      const acceptor = molecule.addAtom(halogen);
      molecule.addBond(carbon, acceptor);
      molecule.addImplicitHydrogens();
      const charges = partialCharges(molecule);
      expect(charges.get(acceptor)).toBeLessThan(charges.get(carbon)!);
      expect([...charges.values()].reduce((sum, value) => sum + value, 0)).toBe(
        0,
      );
    }
  });

  it.each(["B", "CF", "CCl", "CBr", "CI", "CS", "P", "[Li+]", "[Mg+2]"])(
    "builds display geometry for %s",
    (smiles) => {
      const molecule = parseSmiles(smiles);
      const geometry = generateMoleculeGeometry(molecule);
      expect(geometry.positions.size).toBe(molecule.atomCount);
      for (const point of geometry.positions.values()) {
        expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
      }
    },
  );
});
