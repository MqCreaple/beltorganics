/** Default zoom: pixels per world unit (one world unit = one grid cell). */
export const DEFAULT_ZOOM = 40;

export interface CameraOptions {
  /** Initial zoom (pixels per world unit). Default DEFAULT_ZOOM. */
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * View camera for the infinite grid.
 *
 * `zoom` is pixels per world unit; the default 40 renders each grid cell as
 * a 40x40 CSS-px square. The camera center is the world coordinate at the
 * middle of the viewport. All screen positions are in CSS pixels (Phaser
 * camera and the scene use this model directly).
 */
export class Camera {
  readonly minZoom: number;
  readonly maxZoom: number;
  #centerX = 0;
  #centerY = 0;
  #zoom: number;

  constructor(
    public viewportWidth: number,
    public viewportHeight: number,
    options: CameraOptions = {},
  ) {
    this.minZoom = options.minZoom ?? 0.04;
    this.maxZoom = options.maxZoom ?? 160;
    this.#zoom = clamp(options.zoom ?? DEFAULT_ZOOM, this.minZoom, this.maxZoom);
  }

  get zoom(): number {
    return this.#zoom;
  }

  set zoom(value: number) {
    this.#zoom = clamp(value, this.minZoom, this.maxZoom);
  }

  get centerX(): number {
    return this.#centerX;
  }

  get centerY(): number {
    return this.#centerY;
  }

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /** Move the camera center by a delta in world units. */
  panByWorld(dx: number, dy: number): void {
    this.#centerX += dx;
    this.#centerY += dy;
  }

  /** Move the camera center by a delta in screen (CSS px) units. */
  panByScreen(dxPx: number, dyPx: number): void {
    this.#centerX -= dxPx / this.#zoom;
    this.#centerY -= dyPx / this.#zoom;
  }

  worldToScreenX(worldX: number): number {
    return (worldX - this.#centerX) * this.#zoom + this.viewportWidth / 2;
  }

  worldToScreenY(worldY: number): number {
    return (worldY - this.#centerY) * this.#zoom + this.viewportHeight / 2;
  }

  screenToWorldX(screenX: number): number {
    return (screenX - this.viewportWidth / 2) / this.#zoom + this.#centerX;
  }

  screenToWorldY(screenY: number): number {
    return (screenY - this.viewportHeight / 2) / this.#zoom + this.#centerY;
  }

  /**
   * Zoom by `factor` while keeping the world point under the given screen
   * position fixed (the usual scroll-to-zoom-at-cursor behaviour).
   */
  zoomAt(screenX: number, screenY: number, factor: number): void {
    const worldX = this.screenToWorldX(screenX);
    const worldY = this.screenToWorldY(screenY);
    this.zoom = this.#zoom * factor;
    this.#centerX = worldX - (screenX - this.viewportWidth / 2) / this.#zoom;
    this.#centerY = worldY - (screenY - this.viewportHeight / 2) / this.#zoom;
  }
}