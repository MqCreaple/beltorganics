import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MolecularOrbital, OrbitalKind } from '../../chem';

export interface OrbitalEnergyDiagramProps {
  orbitals: readonly MolecularOrbital[];
  selectedId?: string;
  onSelect: (orbital: MolecularOrbital) => void;
}

export interface OrbitalEnergyLevel {
  key: string;
  energyEv: number;
  orbitals: MolecularOrbital[];
}

export interface OrbitalEnergyWindow {
  lower: number;
  upper: number;
}

const DEGENERACY_TOLERANCE_EV = 0.02;
const COLLAPSE_AT = 5;
const WIDTH = 260;
const HEIGHT = 420;
const MARGIN = { top: 22, right: 12, bottom: 26, left: 44 } as const;
const MINIMUM_ENERGY_SPAN_EV = 0.25;
const MAXIMUM_ZOOM_OUT = 32;

export function zoomOrbitalEnergyWindow(
  window: OrbitalEnergyWindow,
  anchorEv: number,
  scale: number,
  minimumSpan = MINIMUM_ENERGY_SPAN_EV,
  maximumSpan = Number.POSITIVE_INFINITY,
): OrbitalEnergyWindow {
  const span = window.upper - window.lower;
  if (!(span > 0) || !(scale > 0)) return window;
  const nextSpan = Math.min(maximumSpan, Math.max(minimumSpan, span * scale));
  const anchorFraction = (anchorEv - window.lower) / span;
  const lower = anchorEv - anchorFraction * nextSpan;
  return { lower, upper: lower + nextSpan };
}

export function panOrbitalEnergyWindow(
  window: OrbitalEnergyWindow,
  deltaEv: number,
): OrbitalEnergyWindow {
  return { lower: window.lower + deltaEv, upper: window.upper + deltaEv };
}

/** Group adjacent, sorted orbitals whose displayed energies are degenerate. */
export function groupOrbitalEnergyLevels(
  orbitals: readonly MolecularOrbital[],
): OrbitalEnergyLevel[] {
  const sorted = [...orbitals].sort(
    (first, second) => first.energyEv - second.energyEv || first.id.localeCompare(second.id),
  );
  const levels: OrbitalEnergyLevel[] = [];
  for (const orbital of sorted) {
    const level = levels.at(-1);
    if (level !== undefined && Math.abs(orbital.energyEv - level.energyEv) <= DEGENERACY_TOLERANCE_EV) {
      level.orbitals.push(orbital);
      level.energyEv = level.orbitals.reduce((sum, item) => sum + item.energyEv, 0) / level.orbitals.length;
    } else {
      levels.push({ key: `${orbital.energyEv.toFixed(4)}:${orbital.id}`, energyEv: orbital.energyEv, orbitals: [orbital] });
    }
  }
  return levels;
}

function niceTickStep(range: number): number {
  const rough = Math.max(range / 5, 0.5);
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  const factor = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return factor * power;
}

export function orbitalLabel(orbital: MolecularOrbital | string): string {
  const id = typeof orbital === 'string' ? orbital : orbital.id;
  return id.replace(/^pi/, 'π').replace(/^sigma/, 'σ');
}

function kindLabel(kind: OrbitalKind): string {
  if (kind === 'sigma') return 'σ orbital';
  if (kind === 'pi') return 'π orbital';
  return 'lone pair';
}

export function OrbitalEnergyDiagram({ orbitals, selectedId, onSelect }: OrbitalEnergyDiagramProps) {
  const levels = useMemo(() => groupOrbitalEnergyLevels(orbitals), [orbitals]);
  const automaticWindow = useMemo<OrbitalEnergyWindow>(() => {
    if (levels.length === 0) return { lower: -1, upper: 1 };
    const minimum = Math.min(...levels.map((level) => level.energyEv));
    const maximum = Math.max(...levels.map((level) => level.energyEv));
    const padding = Math.max(1, (maximum - minimum) * 0.06);
    return { lower: minimum - padding, upper: maximum + padding };
  }, [levels]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<{ orbital: MolecularOrbital; left: number; top: number } | null>(null);
  const [energyWindow, setEnergyWindow] = useState<OrbitalEnergyWindow>(automaticWindow);
  const [isPanning, setIsPanning] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startClientY: number;
    window: OrbitalEnergyWindow;
  } | null>(null);

  useEffect(() => setEnergyWindow(automaticWindow), [automaticWindow.lower, automaticWindow.upper]);
  if (levels.length === 0) return <aside className="orbital-energy-diagram empty">No molecular orbitals</aside>;

  const { lower, upper } = energyWindow;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const plotLeft = MARGIN.left;
  const plotRight = WIDTH - MARGIN.right;
  const energyY = (energy: number): number => (
    MARGIN.top + ((upper - energy) / Math.max(upper - lower, 1)) * plotHeight
  );
  const tickStep = niceTickStep(upper - lower);
  const firstTick = Math.ceil(lower / tickStep) * tickStep;
  const ticks: number[] = [];
  for (let tick = firstTick; tick <= upper + 1e-9; tick += tickStep) ticks.push(tick);

  const energyAtPointer = (svg: SVGSVGElement, clientY: number): number => {
    const bounds = svg.getBoundingClientRect();
    const viewY = Math.min(
      HEIGHT - MARGIN.bottom,
      Math.max(MARGIN.top, ((clientY - bounds.top) / bounds.height) * HEIGHT),
    );
    return upper - ((viewY - MARGIN.top) / plotHeight) * (upper - lower);
  };

  const showHover = (event: MouseEvent, orbital: MolecularOrbital): void => {
    const panel = (event.currentTarget as SVGElement).closest('.orbital-energy-diagram')!;
    const bounds = panel.getBoundingClientRect();
    setHovered({
      orbital,
      left: Math.min(bounds.width - 126, Math.max(6, event.clientX - bounds.left + 10)),
      top: Math.min(bounds.height - 74, Math.max(6, event.clientY - bounds.top + 10)),
    });
  };

  return (
    <aside className={`orbital-energy-diagram ${isPanning ? 'panning' : ''}`} aria-label="Molecular orbital energy diagram">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Orbital energies in electron-volts; drag vertically to pan and scroll to zoom"
        onWheel={(event) => {
          event.preventDefault();
          const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? HEIGHT : 1;
          const scale = Math.exp(Math.max(-1, Math.min(1, event.deltaY * unit * 0.0015)));
          const anchor = energyAtPointer(event.currentTarget, event.clientY);
          const automaticSpan = automaticWindow.upper - automaticWindow.lower;
          setEnergyWindow((current) => zoomOrbitalEnergyWindow(
            current,
            anchor,
            scale,
            MINIMUM_ENERGY_SPAN_EV,
            automaticSpan * MAXIMUM_ZOOM_OUT,
          ));
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest('[role="button"]') !== null) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startClientY: event.clientY,
            window: energyWindow,
          };
          setHovered(null);
          setIsPanning(true);
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (active === null || active.pointerId !== event.pointerId) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const renderedPlotHeight = bounds.height * plotHeight / HEIGHT;
          const span = active.window.upper - active.window.lower;
          const deltaEv = (event.clientY - active.startClientY) / renderedPlotHeight * span;
          setEnergyWindow(panOrbitalEnergyWindow(active.window, deltaEv));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          setIsPanning(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setIsPanning(false);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          setIsPanning(false);
        }}
      >
        {ticks.map((tick) => {
          const y = energyY(tick);
          return (
            <g key={tick} className="orbital-energy-tick">
              <line x1={plotLeft} x2={plotRight} y1={y} y2={y} />
              <text x={plotLeft - 5} y={y + 3}>{tick.toFixed(Math.abs(tickStep) < 1 ? 1 : 0)}</text>
            </g>
          );
        })}
        <line className="orbital-energy-axis" x1={plotLeft} x2={plotLeft} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} />
        <text className="orbital-energy-axis-title" x={12} y={HEIGHT / 2} transform={`rotate(-90 12 ${HEIGHT / 2})`}>Energy (eV)</text>
        {levels.map((level) => {
          const isExpanded = expanded.has(level.key);
          const collapsed = level.orbitals.length >= COLLAPSE_AT && !isExpanded;
          const shown = collapsed ? level.orbitals.slice(0, 4) : level.orbitals;
          const gap = isExpanded ? Math.min(2, 30 / shown.length) : 6;
          const ellipsisWidth = collapsed ? 22 : 0;
          const availableWidth = plotRight - plotLeft - ellipsisWidth;
          const dashWidth = Math.min(18, Math.max(0.75, (availableWidth - Math.max(0, shown.length - 1) * gap) / shown.length));
          const totalWidth = shown.length * dashWidth + Math.max(0, shown.length - 1) * gap + ellipsisWidth;
          let x = plotLeft + (plotRight - plotLeft - totalWidth) / 2;
          const y = energyY(level.energyEv);
          return (
            <g key={level.key} className="orbital-energy-level">
              {shown.map((orbital) => {
                const start = x;
                x += dashWidth + gap;
                const selected = orbital.id === selectedId;
                return (
                  <line
                    key={orbital.id}
                    className={`orbital-energy-dash ${orbital.electrons > 0 ? 'occupied' : 'empty'} ${selected ? 'selected' : ''}`}
                    x1={start}
                    x2={start + dashWidth}
                    y1={y}
                    y2={y}
                    role="button"
                    tabIndex={0}
                    aria-label={`${orbitalLabel(orbital)}, ${orbital.energyEv.toFixed(2)} electron-volts`}
                    onClick={() => onSelect(orbital)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onSelect(orbital);
                    }}
                    onMouseEnter={(event) => showHover(event, orbital)}
                    onMouseMove={(event) => showHover(event, orbital)}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
              {collapsed ? (
                <text
                  className="orbital-energy-ellipsis"
                  x={x + 2}
                  y={y + 4}
                  role="button"
                  tabIndex={0}
                  aria-label={`Expand ${level.orbitals.length} degenerate orbitals`}
                  onClick={() => setExpanded((current) => new Set(current).add(level.key))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      setExpanded((current) => new Set(current).add(level.key));
                    }
                  }}
                >…</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hovered === null ? null : (
        <div className="orbital-energy-hover" style={{ left: hovered.left, top: hovered.top }}>
          <strong>{orbitalLabel(hovered.orbital)}</strong>
          <span>{kindLabel(hovered.orbital.kind)}</span>
          <span>{hovered.orbital.electrons === 0 ? 'empty' : `${hovered.orbital.electrons} electrons`}</span>
          <span>{hovered.orbital.energyEv.toFixed(2)} eV</span>
        </div>
      )}
    </aside>
  );
}
