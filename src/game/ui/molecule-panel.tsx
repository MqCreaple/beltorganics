import { useEffect, useState } from 'preact/hooks';
import { formulaParts, partialCharges } from '../../chem';
import type { AtomId, MolecularFormula, Molecule, MoleculeRegistry } from '../../chem';

/**
 * Molecule visualization panel.
 *
 * The title shows the substance's name (common name, falling back to the IUPAC
 * name, then to the raw SMILES) once the registry's lookup resolves. Below it
 * a table lists the common name, IUPAC name, chemical formula and SMILES
 * string, filling "none" for anything unknown. The layer switch keeps the
 * ordinary RDKit structure separate from the graph-derived PEOE charge view,
 * where every atom has an electron-rich (blue) / electron-poor (red) readout.
 */
export interface MoleculePanelProps {
  /** SMILES string of the substance shown in this panel. */
  formula: string;
  /**
   * The registry that owns the molecule graph, the lazily rendered structure
   * diagram, and the substance-name lookup for this substance.
   */
  registry: MoleculeRegistry;
}

export function MoleculePanel({ formula, registry }: MoleculePanelProps) {
  const [layer, setLayer] = useState<'structure' | 'charge'>('structure');
  // Re-render once the substance-name lookup (common / IUPAC) resolves.
  const [, setNameVersion] = useState(0);
  useEffect(() => {
    let active = true;
    registry.fetchSubstanceName(formula).then(() => {
      if (active) setNameVersion((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [formula, registry]);

  let svg: string | null = null;
  let chemicalFormula: MolecularFormula | null = null;
  let molecule: Molecule | null = null;
  let charges: Map<AtomId, number> | null = null;
  let error: string | null = null;
  try {
    svg = registry.renderSvg(formula);
    molecule = registry.get(formula);
    chemicalFormula = molecule.molecularFormula();
    charges = partialCharges(molecule);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const displayName = registry.substanceName(formula) ?? formula;

  return (
    <div className="molecule-panel">
      <p className="molecule-panel-title">{displayName}</p>
      <table className="molecule-panel-table">
        <tbody>
          <tr>
            <th>Common Name</th>
            <td>{registry.substanceCommonName(formula) ?? 'none'}</td>
          </tr>
          <tr>
            <th>IUPAC Name</th>
            <td>{registry.substanceIupacName(formula) ?? 'none'}</td>
          </tr>
          <tr>
            <th>Chemical Formula</th>
            <td>
              {chemicalFormula === null ? (
                'none'
              ) : (
                formulaParts(chemicalFormula).map(([symbol, count]) => (
                  <span key={symbol}>
                    {symbol}
                    {count > 1 ? <sub>{count}</sub> : null}
                  </span>
                ))
              )}
            </td>
          </tr>
          <tr>
            <th>SMILES String</th>
            <td>{formula.length > 0 ? formula : 'none'}</td>
          </tr>
        </tbody>
      </table>
      <div className="molecule-panel-layers" role="tablist" aria-label="Molecule information layer">
        <button
          className="molecule-panel-layer"
          type="button"
          role="tab"
          aria-selected={layer === 'structure'}
          onClick={() => setLayer('structure')}
        >
          Structure
        </button>
        <button
          className="molecule-panel-layer"
          type="button"
          role="tab"
          aria-selected={layer === 'charge'}
          onClick={() => setLayer('charge')}
        >
          Charge
        </button>
      </div>
      {layer === 'structure' ? (
        <div role="tabpanel">
          {svg === null ? (
            <p className="molecule-panel-note">
              {error !== null ? `Could not draw the structure: ${error}` : 'Structure unavailable.'}
            </p>
          ) : (
            <div className="molecule-panel-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          )}
        </div>
      ) : (
        <div className="molecule-charge-panel" role="tabpanel">
          {molecule === null || charges === null ? (
            <p className="molecule-panel-note">
              {error !== null ? `Could not compute charges: ${error}` : 'Charges unavailable.'}
            </p>
          ) : (
            <ChargeLayer molecule={molecule} charges={charges} />
          )}
        </div>
      )}
    </div>
  );
}

interface ChargeLayerProps {
  molecule: Molecule;
  charges: ReadonlyMap<AtomId, number>;
}

function ChargeLayer({ molecule, charges }: ChargeLayerProps) {
  const counts = new Map<string, number>();
  const atoms = molecule.atoms().map((atom) => {
    const element = molecule.getAtom(atom).element;
    const ordinal = (counts.get(element) ?? 0) + 1;
    counts.set(element, ordinal);
    return { atom, label: `${element}${ordinal}`, charge: charges.get(atom) ?? 0 };
  });
  const total = atoms.reduce((sum, atom) => sum + atom.charge, 0);

  return (
    <>
      <div className="molecule-charge-legend" aria-label="Partial charge color legend">
        <span><i className="charge-swatch charge-negative" />δ− electron-rich</span>
        <span><i className="charge-swatch charge-neutral" />neutral</span>
        <span><i className="charge-swatch charge-positive" />δ+ electron-poor</span>
      </div>
      <ul className="molecule-charge-atoms" aria-label="Partial charge by atom">
        {atoms.map(({ atom, label, charge }) => (
          <li key={atom} style={{ '--charge-color': chargeColor(charge) }} title={`Graph atom ${atom}`}>
            <span className="molecule-charge-atom-label">{label}</span>
            <output>{formatCharge(charge)}</output>
          </li>
        ))}
      </ul>
      <p className="molecule-charge-total">
        Total charge <output>{formatCharge(total)}</output>
      </p>
      <p className="molecule-panel-note">
        Estimated from connectivity and hybridization with the game’s eight-pass PEOE model.
      </p>
    </>
  );
}

function formatCharge(charge: number): string {
  const rounded = Math.abs(charge) < 0.0005 ? 0 : charge;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(3)}`;
}

/** Saturated red/blue at |q| >= 0.5; near-neutral atoms fade toward gray. */
function chargeColor(charge: number): string {
  const strength = Math.min(1, Math.abs(charge) / 0.5);
  const neutral = [226, 230, 237];
  const charged = charge < 0 ? [69, 123, 214] : [220, 78, 78];
  const mix = (index: number) => Math.round(neutral[index]! + (charged[index]! - neutral[index]!) * strength);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
