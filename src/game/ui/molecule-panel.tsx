import { useEffect, useState } from 'preact/hooks';
import { formulaParts } from '../../chem';
import type { MolecularFormula, MoleculeRegistry } from '../../chem';

/**
 * Molecule visualization panel.
 *
 * The title shows the substance's name (common name, falling back to the IUPAC
 * name, then to the raw SMILES) once the registry's lookup resolves. Below it
 * a table lists the common name, IUPAC name, chemical formula and SMILES
 * string, filling "none" for anything unknown. The structure-diagram SVG is
 * rendered lazily by the registry (RDKit via the registry).
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
  let error: string | null = null;
  try {
    svg = registry.renderSvg(formula);
    chemicalFormula = registry.get(formula).molecularFormula();
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
      {svg === null ? (
        <p className="molecule-panel-note">
          {error !== null ? `Could not draw the structure: ${error}` : 'Structure unavailable.'}
        </p>
      ) : (
        <div className="molecule-panel-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      )}
    </div>
  );
}
