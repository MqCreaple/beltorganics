import { useEffect, useState } from 'preact/hooks';
import { formulaParts } from '../../chem';
import type { MolecularFormula, Molecule, MoleculeGeometry, MoleculeRegistry } from '../../chem';
import { MoleculeViewer3D } from './molecule-viewer-3d';

/**
 * Molecule visualization panel.
 *
 * The title shows the substance's name (common name, falling back to the IUPAC
 * name, then to the molecular formula) once the registry's lookup resolves. Below it
 * a table lists the common name, IUPAC name, chemical formula and SMILES
 * string, filling "none" for anything unknown. The interactive 3D viewer
 * renders structure, geometry, charge, electron-cloud and π-orbital layers
 * directly on the molecule instead of referring to atoms by list numbers.
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

  let chemicalFormula: MolecularFormula | null = null;
  let molecule: Molecule | null = null;
  let geometry: MoleculeGeometry | null = null;
  let error: string | null = null;
  try {
    molecule = registry.get(formula);
    chemicalFormula = molecule.molecularFormula();
    geometry = registry.geometry(formula);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const displayName = molecule === null ? 'Unknown substance' : registry.substanceDisplayName(formula);

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
      {molecule === null || geometry === null ? (
        <p className="molecule-panel-note">
          {error !== null ? `Could not build the molecule: ${error}` : 'Molecule unavailable.'}
        </p>
      ) : (
        <MoleculeViewer3D molecule={molecule} geometry={geometry} />
      )}
    </div>
  );
}
