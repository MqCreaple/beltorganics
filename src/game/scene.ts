import Phaser from 'phaser';
import { Camera, DEFAULT_ZOOM } from './camera';
import { CHUNK_SIZE } from '../world';
import type { Block, World } from '../world';
import { isSourceBlock } from '../world';
import { moleculeRegistry } from '../chem/registry';
import { closeBlockPanel, openBlockPanel } from './ui';

export interface GameSceneOptions {
  /** WASD pan speed in CSS px per second on screen. Default 600. */
  panSpeedPx?: number;
  /** Show the on-screen HUD (zoom, cursor grid, chunk/block counts). Default true. */
  hud?: boolean;
}

const BACKGROUND = 0xf2f4f8;
const GRID_COLOR = 0xd9dee8;
const GRID_COLOR_FAR = 0xe4e8ef;
const CHUNK_COLOR = 0xb6becd;
const SOURCE_FILL = 0x2f9e63;
const SOURCE_STROKE = 0x1f7a49;
const LABEL_COLOR = '#223049';

/** Below this on-screen spacing (px), minor grid lines and chunk borders thin out. */
const MIN_GRID_SPACING_PX = 10;
/** Zoom (px per world unit) at which source labels become readable. */
const LABEL_MIN_ZOOM = 18;
const MOVEMENT_KEYS = new Set(['w', 'a', 's', 'd']);
/** Pointer movement (px) above which a press counts as a drag instead of a click. */
const CLICK_DRAG_THRESHOLD_PX = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Source-block label: resolved substance name, else its molecular formula. */
function sourceLabelText(formula: string): string {
  return moleculeRegistry.substanceDisplayName(formula);
}

/**
 * Device pixel ratio (>= 1). Phaser renders the canvas at CSS-pixel
 * resolution, so on high-DPI displays the browser upscales it; rasterizing
 * label textures at this ratio keeps the glyphs at 1 device pixel per texel.
 */
function devicePixelRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio > 1 ? window.devicePixelRatio : 1;
}

/**
 * The Phaser 4 scene for the world view.
 *
 * Rendering is Phaser-native: a Graphics object redrawn each frame draws the
 * gray grid, chunk borders and block squares in world space, and a small pool
 * of Text objects (one per occupied cell) draws the source labels. The camera
 * view model (src/game/camera.ts) stays framework-free and is pushed into
 * Phaser's camera every frame, so all math stays unit-tested in Node.
 *
 * Controls:
 * - scroll: zoom toward the cursor (clamped)
 * - drag with the left button: pan
 * - W/A/S/D: pan; world speed scales inversely with zoom so the on-screen
 *   pan speed stays constant at any zoom level
 * - hover a block that carries a `BlockUI`: pointer cursor
 * - click such a block: opens its UI panel (centered; click outside closes)
 */
export class GameScene extends Phaser.Scene {
  readonly camera = new Camera(0, 0);
  readonly #world: World;
  readonly #panSpeedPx: number;
  readonly #hudEnabled: boolean;
  readonly #keys = new Set<string>();
  #dragging = false;
  #panelOpen = false;
  #pointerX = 0;
  #pointerY = 0;
  #lastPointerX = 0;
  #lastPointerY = 0;
  #pointerDownX = 0;
  #pointerDownY = 0;
  #gridGraphics!: Phaser.GameObjects.Graphics;
  #blockGraphics!: Phaser.GameObjects.Graphics;
  readonly #labels = new Map<string, Phaser.GameObjects.Text>();
  #hudEl: HTMLElement | null = null;
  #hudZoom: HTMLElement | null = null;
  #hudCursor: HTMLElement | null = null;
  #hudStats: HTMLElement | null = null;

  constructor(world: World, options: GameSceneOptions = {}) {
    super({ key: 'GameScene' });
    this.#world = world;
    this.#panSpeedPx = options.panSpeedPx ?? 600;
    this.#hudEnabled = options.hud ?? true;
  }

  create(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor(BACKGROUND);
    this.camera.setViewport(cam.width, cam.height);
    this.camera.zoom = DEFAULT_ZOOM;

    this.#gridGraphics = this.add.graphics();
    this.#blockGraphics = this.add.graphics();

    this.input.on('wheel', this.#onWheel, this);
    this.input.on('pointerdown', this.#onPointerDown, this);
    this.input.on('pointermove', this.#onPointerMove, this);
    this.input.on('pointerup', this.#onPointerUp, this);
    this.input.on('pointerupoutside', this.#onPointerUp, this);

    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      keyboard.on('keydown', this.#onKeyDown, this);
      keyboard.on('keyup', this.#onKeyUp, this);
    }
    this.game.events.on(Phaser.Core.Events.BLUR, this.#onBlur, this);

    this.sys.events.once(Phaser.Scenes.Events.SHUTDOWN, this.#cleanup, this);

    if (this.#hudEnabled) this.#buildHud();
  }

  update(_time: number, delta: number): void {
    const cam = this.cameras.main;
    const viewportWidth = cam.width;
    const viewportHeight = cam.height;
    if (this.camera.viewportWidth !== viewportWidth || this.camera.viewportHeight !== viewportHeight) {
      this.camera.setViewport(viewportWidth, viewportHeight);
    }

    this.#updateMovement(delta);

    // Push the view model into Phaser's camera (one-way; Phaser handles the
    // world -> screen transform and the visible-bounds math for rendering).
    cam.setZoom(this.camera.zoom);
    cam.centerOn(this.camera.centerX, this.camera.centerY);

    this.#drawGrid();
    this.#drawBlocks();
    this.#updateHover();
    if (this.#hudEl !== null) this.#updateHud();
  }

  #updateMovement(deltaMs: number): void {
    let dx = 0;
    let dy = 0;
    if (this.#keys.has('w')) dy -= 1;
    if (this.#keys.has('s')) dy += 1;
    if (this.#keys.has('a')) dx -= 1;
    if (this.#keys.has('d')) dx += 1;
    if (dx === 0 && dy === 0) return;

    const length = Math.hypot(dx, dy);
    // Keep the on-screen pan speed constant: world units per second scale
    // inversely with zoom, so WASD moves farther per second when zoomed out.
    const speed = (this.#panSpeedPx / this.camera.zoom) * (deltaMs / 1000);
    this.camera.panByWorld((dx / length) * speed, (dy / length) * speed);
  }

  // -------------------------------------------------------------------
  // Rendering (Phaser Graphics in world space)
  // -------------------------------------------------------------------

  #visibleWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const cam = this.cameras.main;
    const topLeft = cam.getWorldPoint(0, 0);
    const bottomRight = cam.getWorldPoint(cam.width, cam.height);
    return { minX: topLeft.x, minY: topLeft.y, maxX: bottomRight.x, maxY: bottomRight.y };
  }

  #drawGrid(): void {
    const g = this.#gridGraphics;
    g.clear();
    const bounds = this.#visibleWorldBounds();
    const spacing = this.camera.zoom;
    // Thin the minor grid when cells get smaller than ~10 px on screen so an
    // infinite zoom-out never draws an unbounded number of lines.
    const step = Math.max(1, Math.ceil(MIN_GRID_SPACING_PX / spacing));

    g.lineStyle(1 / this.camera.zoom, step === 1 ? GRID_COLOR : GRID_COLOR_FAR, 1);
    g.beginPath();
    const firstX = Math.ceil(bounds.minX / step) * step;
    for (let gx = firstX; gx <= bounds.maxX; gx += step) {
      g.moveTo(gx, bounds.minY);
      g.lineTo(gx, bounds.maxY);
    }
    const firstY = Math.ceil(bounds.minY / step) * step;
    for (let gy = firstY; gy <= bounds.maxY; gy += step) {
      g.moveTo(bounds.minX, gy);
      g.lineTo(bounds.maxX, gy);
    }
    g.strokePath();

    // Slightly brighter borders every CHUNK_SIZE cells (thinned like the grid).
    const chunkSpacing = spacing * CHUNK_SIZE;
    const chunkStep = Math.max(1, Math.ceil(MIN_GRID_SPACING_PX / chunkSpacing)) * CHUNK_SIZE;
    g.lineStyle(1 / this.camera.zoom, CHUNK_COLOR, 1);
    g.beginPath();
    const firstCX = Math.ceil(bounds.minX / chunkStep) * chunkStep;
    for (let gx = firstCX; gx <= bounds.maxX; gx += chunkStep) {
      g.moveTo(gx, bounds.minY);
      g.lineTo(gx, bounds.maxY);
    }
    const firstCY = Math.ceil(bounds.minY / chunkStep) * chunkStep;
    for (let gy = firstCY; gy <= bounds.maxY; gy += chunkStep) {
      g.moveTo(bounds.minX, gy);
      g.lineTo(bounds.maxX, gy);
    }
    g.strokePath();
  }

  #drawBlocks(): void {
    const g = this.#blockGraphics;
    g.clear();
    const bounds = this.#visibleWorldBounds();
    const minGX = Math.floor(bounds.minX);
    const minGY = Math.floor(bounds.minY);
    const maxGX = Math.ceil(bounds.maxX);
    const maxGY = Math.ceil(bounds.maxY);
    const visible = new Set<string>();

    this.#world.forEachBlockInRect(minGX, minGY, maxGX, maxGY, (gx, gy, block) => {
      const key = `${gx},${gy}`;
      visible.add(key);

      // Placeholder squares; real textures come later.
      const inset = Math.max(0.02, 0.08);
      g.fillStyle(isSourceBlock(block) ? SOURCE_FILL : 0x9aa3b2, 1);
      g.fillRect(gx + inset, gy + inset, 1 - inset * 2, 1 - inset * 2);
      g.lineStyle(Math.max(0.02, 0.03) / this.camera.zoom, isSourceBlock(block) ? SOURCE_STROKE : 0x6b7385, 1);
      g.strokeRect(gx + inset, gy + inset, 1 - inset * 2, 1 - inset * 2);

      if (isSourceBlock(block) && this.camera.zoom >= LABEL_MIN_ZOOM) {
        let label = this.#labels.get(key);
        if (label === undefined) {
          // Kick off the substance-name lookup (PubChem common/IUPAC name, CIR
          // fallback) so the label switches from the raw SMILES to the name
          // once it resolves; the registry caches the result per substance.
          void moleculeRegistry.fetchSubstanceName(block.formula);
          label = this.add.text(gx + 0.5, gy, sourceLabelText(block.formula), {
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: '12px',
            color: LABEL_COLOR,
          });
          label.setOrigin(0.5, 1);
          this.#labels.set(key, label);
        }
        const dpr = devicePixelRatio();
        const fontSize = clamp(this.camera.zoom * 0.28, 9, 14);
        label.setText(sourceLabelText(block.formula));
        label.setFontSize(fontSize);
        // Rasterize the text texture at the device pixel ratio: Phaser's
        // documented fix for blurry text under a zooming camera / scaling
        // (default resolution 1 leaves the small 9-14 px textures upscaled by
        // the browser on high-DPI displays).
        label.setResolution(dpr);
        // Counteract the camera zoom so labels keep a fixed on-screen size.
        label.setScale(1 / this.camera.zoom);
        // Snap the label's anchor to whole device pixels so the small texture
        // is never sampled at fractional positions (the main cause of blur
        // when zoomed out to the clamped 9 px minimum).
        const screenX = this.camera.worldToScreenX(gx + 0.5);
        const screenY = this.camera.worldToScreenY(gy - 0.04);
        label.setPosition(
          this.camera.screenToWorldX(Math.round(screenX * dpr) / dpr),
          this.camera.screenToWorldY(Math.round(screenY * dpr) / dpr),
        );
      }
    });

    // Drop labels whose cell no longer holds a visible source block.
    for (const [key, label] of this.#labels) {
      if (!visible.has(key)) {
        label.destroy();
        this.#labels.delete(key);
      }
    }
  }

  // -------------------------------------------------------------------
  // Block hover & activation
  // -------------------------------------------------------------------

  /** The block under a screen position, if any (blocks occupy whole cells). */
  #blockAtScreen(screenX: number, screenY: number): Block | undefined {
    const worldX = this.camera.screenToWorldX(screenX);
    const worldY = this.camera.screenToWorldY(screenY);
    return this.#world.getBlock(Math.floor(worldX), Math.floor(worldY));
  }

  /** Pointer cursor over blocks that carry a UI (unless a panel is open). */
  #updateHover(): void {
    const block = this.#blockAtScreen(this.#pointerX, this.#pointerY);
    const clickable = !this.#panelOpen && block !== undefined && block.ui !== undefined;
    this.game.canvas.classList.toggle('block-hover', clickable);
  }

  #openBlockPanel(block: Block): void {
    if (block.ui === undefined || this.#panelOpen) return;
    this.#panelOpen = true;
    this.#keys.clear();
    this.#dragging = false;
    this.game.canvas.classList.remove('dragging', 'block-hover');
    openBlockPanel(block, () => this.#closeBlockPanel());
  }

  #closeBlockPanel(): void {
    if (!this.#panelOpen) return;
    this.#panelOpen = false;
    closeBlockPanel();
  }

  // -------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------

  #onWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _deltaX: number, deltaY: number): void => {
    const factor = Math.exp(-deltaY * 0.0015);
    this.camera.zoomAt(pointer.x, pointer.y, factor);
  };

  #onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.#panelOpen) return; // the DOM backdrop covers the canvas while open
    if (pointer.buttons !== 1) return; // left button / primary touch only
    this.#dragging = true;
    this.#pointerDownX = pointer.x;
    this.#pointerDownY = pointer.y;
    this.#lastPointerX = pointer.x;
    this.#lastPointerY = pointer.y;
    this.game.canvas.classList.add('dragging');
  };

  #onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    this.#pointerX = pointer.x;
    this.#pointerY = pointer.y;
    if (!this.#dragging) return;
    const dx = pointer.x - this.#lastPointerX;
    const dy = pointer.y - this.#lastPointerY;
    this.#lastPointerX = pointer.x;
    this.#lastPointerY = pointer.y;
    this.camera.panByScreen(dx, dy);
  };

  #onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    const wasDragging = this.#dragging;
    this.#dragging = false;
    this.game.canvas.classList.remove('dragging');
    if (!wasDragging || this.#panelOpen) return;

    // A click is a press+release without meaningful movement; a drag pans.
    const moved = Math.hypot(pointer.x - this.#pointerDownX, pointer.y - this.#pointerDownY);
    if (moved > CLICK_DRAG_THRESHOLD_PX) return;

    const block = this.#blockAtScreen(pointer.x, pointer.y);
    if (block !== undefined && block.ui !== undefined) this.#openBlockPanel(block);
  };

  #onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (MOVEMENT_KEYS.has(key)) {
      this.#keys.add(key);
      event.preventDefault();
    }
  };

  #onKeyUp = (event: KeyboardEvent): void => {
    this.#keys.delete(event.key.toLowerCase());
  };

  #onBlur = (): void => {
    this.#keys.clear();
    this.#dragging = false;
    this.game.canvas.classList.remove('dragging', 'block-hover');
  };

  // -------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------

  #buildHud(): void {
    const hud = document.createElement('div');
    hud.className = 'game-hud';

    const zoom = document.createElement('div');
    zoom.className = 'hud-row';
    const cursor = document.createElement('div');
    cursor.className = 'hud-row';
    const stats = document.createElement('div');
    stats.className = 'hud-row';
    const hint = document.createElement('div');
    hint.className = 'hud-hint';
    hint.textContent = 'Scroll: zoom · Drag: pan · WASD: move · Click a source: inspect';

    hud.append(zoom, cursor, stats, hint);
    (this.game.canvas.parentElement ?? document.body).append(hud);

    this.#hudEl = hud;
    this.#hudZoom = zoom;
    this.#hudCursor = cursor;
    this.#hudStats = stats;
  }

  #updateHud(): void {
    if (this.#hudZoom === null || this.#hudCursor === null || this.#hudStats === null) return;
    // Pointer x/y are already canvas-relative in Phaser.
    const worldX = this.camera.screenToWorldX(this.#pointerX);
    const worldY = this.camera.screenToWorldY(this.#pointerY);
    const zoomPercent = Math.round((this.camera.zoom / DEFAULT_ZOOM) * 100);
    this.#hudZoom.textContent = `Zoom ${zoomPercent}%`;
    this.#hudCursor.textContent = `Grid (${Math.floor(worldX)}, ${Math.floor(worldY)})`;
    this.#hudStats.textContent =
      `Chunks ${this.#world.chunkCount} · Blocks ${this.#world.blockCount} · ` +
      `Substances ${moleculeRegistry.size}`;
  }

  #cleanup = (): void => {
    this.#keys.clear();
    this.#dragging = false;
    this.#panelOpen = false;
    this.#hudEl?.remove();
    this.#hudEl = null;
    closeBlockPanel();
  };
}
