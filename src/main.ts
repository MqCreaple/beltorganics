import './style.css';
import { Molecule, conjugatedPiSystems, hybridizations } from './index';
import type { Molecule as MoleculeType } from './chem';

interface Demo {
  name: string;
  note?: string;
  build: () => MoleculeType;
}

/**
 * Demo molecules. This is only a placeholder UI to exercise the chemistry
 * engine in the browser; the actual game (Phaser 4) comes later.
 */
const demos: Demo[] = [
  {
    name: 'Water (dihabitium obligide)',
    note: 'Two hydrogens on one oxygen; formula H2O.',
    build: () => {
      const m = new Molecule();
      const o = m.addAtom('O');
      m.addBond(o, m.addAtom('H'));
      m.addBond(o, m.addAtom('H'));
      return m;
    },
  },
  {
    name: 'Ethanol (explicit hydrogens)',
    note: 'CCO, drawn with all hydrogen atoms explicit.',
    build: () => {
      const m = new Molecule();
      const c1 = m.addAtom('C');
      const c2 = m.addAtom('C');
      const o = m.addAtom('O');
      m.addBond(c1, c2);
      m.addBond(c2, o);
      for (const c of [c1, c2]) {
        while (m.bondOrderSum(c) < 4) m.addBond(c, m.addAtom('H'));
      }
      while (m.bondOrderSum(o) < 2) m.addBond(o, m.addAtom('H'));
      return m;
    },
  },
  {
    name: 'Benzene',
    note: 'Six carbons in a ring with alternating single/double bonds; C6H6.',
    build: () => {
      const m = new Molecule();
      const carbons = Array.from({ length: 6 }, () => m.addAtom('C'));
      for (let i = 0; i < 6; i++) {
        m.addBond(carbons[i]!, carbons[(i + 1) % 6]!, i % 2 === 0 ? 2 : 1);
      }
      return m;
    },
  },
  {
    name: 'Chiral centre (1-aminoethanol skeleton)',
    note: 'The central carbon is 4-coordinate sp3 and carries a tetrahedral parity label.',
    build: () => {
      const m = new Molecule();
      const c = m.addAtom('C', { stereo: 'plus' });
      m.addBond(c, m.addAtom('H'));
      m.addBond(c, m.addAtom('O'));
      m.addBond(c, m.addAtom('N'));
      const methyl = m.addAtom('C');
      m.addBond(c, methyl);
      while (m.bondOrderSum(methyl) < 4) m.addBond(methyl, m.addAtom('H'));
      return m;
    },
  },
  {
    name: 'But-2-ene (trans)',
    note: 'A double bond carrying a geometry label: trans (E).',
    build: () => {
      const m = new Molecule();
      const c1 = m.addAtom('C');
      const c2 = m.addAtom('C');
      const c3 = m.addAtom('C');
      const c4 = m.addAtom('C');
      m.addBond(c1, c2, 1);
      m.addBond(c2, c3, 2, { stereo: 'trans' });
      m.addBond(c3, c4, 1);
      for (const c of [c1, c2, c3, c4]) {
        while (m.bondOrderSum(c) < 4) m.addBond(c, m.addAtom('H'));
      }
      return m;
    },
  },
];

function card(demo: Demo): HTMLElement {
  const mol = demo.build();
  const el = document.createElement('section');
  el.className = 'card';

  const title = document.createElement('h2');
  title.textContent = demo.name;
  el.append(title);

  if (demo.note) {
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = demo.note;
    el.append(note);
  }

  const dl = document.createElement('dl');
  const row = (term: string, value: string): void => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  };
  row('Formula', mol.molecularFormula());
  row('Atoms', String(mol.atomCount));
  row('Bonds', String(mol.bondCount));
  row('Stereo centres', mol.atoms().filter((id) => mol.isTetrahedralCenter(id)).length > 0
    ? mol
        .atoms()
        .filter((id) => mol.isTetrahedralCenter(id))
        .map((id) => `${id} (${mol.getAtom(id).stereo ?? 'unlabeled'})`)
        .join(', ')
    : 'none');

  const doubleBonds = mol
    .bonds()
    .filter((id) => mol.getBond(id).order === 2)
    .map((id) => `${mol.getBond(id).source}=${mol.getBond(id).target} (${mol.getBond(id).stereo ?? 'unlabeled'})`);
  row('Double bonds', doubleBonds.length > 0 ? doubleBonds.join(', ') : 'none');

  const hyb = hybridizations(mol);
  const hybParts = [...hyb.entries()].map(
    ([id, h]) => `${mol.getAtom(id).element} ${id} ${h}`,
  );
  row('Hybridization', hybParts.length > 0 ? hybParts.join(', ') : 'n/a');
  const piSystems = conjugatedPiSystems(mol);
  row(
    'Pi systems',
    piSystems.length > 0
      ? piSystems.map((s) => `${s.atoms.length} atoms / ${s.electronCount} e-`).join(', ')
      : 'none',
  );
  const issues = mol.validate();
  row('Validation', issues.length === 0 ? 'ok' : issues.map((i) => i.code).join(', '));

  el.append(dl);
  return el;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const heading = document.createElement('h1');
  heading.textContent = 'BeltOrganics — chemistry engine demo';
  const sub = document.createElement('p');
  sub.className = 'subtitle';
  sub.textContent =
    'Molecule data structure (roadmap step 1): molecular graph with tetrahedral and double-bond stereo labels.';
  app.append(heading, sub);
  for (const demo of demos) app.append(card(demo));
}
