/**
 * Molecule visualization panel (placeholder).
 *
 * The actual structure rendering (atoms/bonds laid out from the molecule
 * graph in `src/chem/registry.ts`) comes in a later step. For now this is an
 * intentionally empty panel: it shows the substance's SMILES and a short
 * "coming soon" note so the block-UI flow is visible end to end.
 */
export interface MoleculePanelProps {
  /** SMILES string of the substance shown in this panel. */
  formula: string;
}

export function MoleculePanel({ formula }: MoleculePanelProps) {
  return (
    <div className="molecule-panel">
      <p className="molecule-panel-formula">{formula}</p>
      <p className="molecule-panel-note">Molecule visualization coming soon.</p>
    </div>
  );
}