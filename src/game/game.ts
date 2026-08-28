import Phaser from 'phaser';
import { World } from '../world';
import { GameScene } from './scene';
import type { GameSceneOptions } from './scene';

export interface GameOptions extends GameSceneOptions {
  /** DOM element (or its id) that will contain the Phaser canvas. */
  parent?: HTMLElement | string;
  /** Background color of the game canvas. Default '#f2f4f8'. */
  backgroundColor?: string;
}

/**
 * The Phaser 4 game shell for the world.
 *
 * Owns the Phaser.Game instance and the shared {@link World}; rendering and
 * input live in {@link GameScene}. The world (`src/world/`) and chemistry
 * (`src/chem/`) engines stay framework-free; only this wrapper and the scene
 * touch Phaser, so the engine keeps running in Node tests.
 */
export class Game {
  readonly world = new World();
  readonly phaser: Phaser.Game;
  readonly #scene: GameScene;

  constructor(options: GameOptions = {}) {
    this.#scene = new GameScene(this.world, {
      panSpeedPx: options.panSpeedPx,
      hud: options.hud,
    });
    this.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: options.parent ?? undefined,
      backgroundColor: options.backgroundColor ?? '#f2f4f8',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      input: {
        mouse: { preventDefaultWheel: true },
      },
      banner: false,
      scene: [this.#scene],
    });
  }

  /** The scene driving the world view (camera, input, HUD). */
  get scene(): GameScene {
    return this.#scene;
  }

  /** Phaser boots automatically; kept so callers can `start()` after setup. */
  start(): void {}

  /** Shut the game down and remove its canvas. */
  dispose(): void {
    this.phaser.destroy(true);
  }
}