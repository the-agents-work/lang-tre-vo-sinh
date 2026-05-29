import Phaser from "phaser";
import "./style.css";
import { CollisionGrid } from "./collision";
import { MAPS, WORLD, rectContains, type CollectibleKind, type ExitDef, type MapDef, type TargetDef } from "./content/maps";
import { masterDialogue, type DialogueScript } from "./content/story";
import { TILE_SIZE, tileCollisionRects, tileTerrainAt, type TileKind, type TileMapDef } from "./content/tilemaps";
import { GameState, type GameSnapshot, type MapId } from "./gameState";
import { clearSave, loadSave, writeSave } from "./save";

const FEET_OFFSET_Y = 22;
const COLLISION_CELL_SIZE = 8;
const FOOT_SAMPLE_OFFSETS = [0] as const;

type Action = "up" | "down" | "left" | "right" | "strike" | "interact";
type Dialogue = DialogueScript & {
  onDone?: () => void;
};
type TargetRuntime = {
  def: TargetDef;
  hp: number;
  lastHitAt: number;
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
};

const HERO_SCALE = 0.48;
const WALK_SPEED = 190;
const state = new GameState(loadSave());
const pressedActions = new Set<Action>();
// Each tile kind maps to one or more visual variants. The renderer picks a
// variant deterministically per cell so large patches of the same tile don't
// read as a repeating grid.
const TILE_TEXTURES: Record<TileKind, string[]> = {
  grass: ["tile-grass-0", "tile-grass-1", "tile-grass-2", "tile-grass-3"],
  path: ["tile-path-0", "tile-path-1", "tile-path-2"],
  courtyard: ["tile-courtyard-0"],
  water: ["tile-water-0", "tile-water-1", "tile-water-2"],
  "shallow-water": ["tile-shallow-water-0", "tile-shallow-water-1", "tile-shallow-water-2"],
  rice: ["tile-rice-0", "tile-rice-1"],
  fence: ["tile-fence-0"],
  bamboo: ["tile-bamboo-0", "tile-bamboo-1"],
  temple: ["tile-temple-0"],
  stall: ["tile-stall-0"],
  rock: ["tile-rock-0", "tile-rock-1"],
  bridge: ["tile-bridge-0", "tile-bridge-1"],
  ricegold: ["tile-ricegold-0", "tile-ricegold-1"],
  shophouse: ["tile-shophouse-0"],
  tea: ["tile-tea-0", "tile-tea-1"],
};

// Decorative overlays scattered purely for looks (never affect collision).
const DECOR_TEXTURES = {
  flower: "decor-flower",
  tuft: "decor-tuft",
  lily: "decor-lily",
  lantern: "decor-lantern",
  banana: "decor-banana",
} as const;

// Stable per-cell hash so a given (col,row) always picks the same variant.
function cellHash(col: number, row: number) {
  let h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

class VillageScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private deepWater!: Phaser.Physics.Arcade.StaticGroup;
  private targets!: Phaser.Physics.Arcade.StaticGroup;
  private collectibles!: Phaser.Physics.Arcade.StaticGroup;
  private currentMap!: MapDef;
  private npc?: Phaser.GameObjects.Sprite;
  private gate?: Phaser.GameObjects.Rectangle;
  private gateGlow?: Phaser.GameObjects.Ellipse;
  private activeDialogue?: Dialogue;
  private dialogueIndex = 0;
  private lastStrike = 0;
  private lastInteract = 0;
  private strikeUntil = 0;
  private transitionLockedUntil = 0;
  private waterBlockPromptUntil = 0;
  private lastTerrain = state.snapshot().terrain;
  private lastRippleAt = 0;
  private targetRuntime = new Map<string, TargetRuntime>();
  private collisionGrid?: CollisionGrid;
  private lastValid = { x: 0, y: 0 };
  private debugOverlay?: Phaser.GameObjects.Image;
  private debugVisible = false;
  private mKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super("village");
  }

  preload() {
    Object.values(MAPS).forEach((map) => {
      this.load.image(map.backgroundKey, map.backgroundUrl);
      if (map.collisionMaskKey && map.collisionMaskUrl) {
        this.load.image(map.collisionMaskKey, map.collisionMaskUrl);
      }
    });
    this.load.spritesheet("hero", "/assets/hero-spritesheet.png", {
      frameWidth: 144,
      frameHeight: 144,
    });
    this.load.spritesheet("master-npc", "/assets/master-spritesheet.png", {
      frameWidth: 144,
      frameHeight: 144,
    });
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.createTextures();
    this.createInput();
    this.createAnimations();
    this.loadMap(state.snapshot().map, MAPS[state.snapshot().map].start);

    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.cameras.main.setZoom(this.cameraZoom(size.width, size.height));
    });

    wireSaveUi(() => this.resetGame());
    if (import.meta.env.DEV) {
      (window as Window & { __voSinhDebug?: unknown }).__voSinhDebug = {
        movePlayerTo: (x: number, y: number) => {
          this.player.setPosition(x, y);
          this.lastValid = { x, y };
        },
        player: () => ({ x: this.player.x, y: this.player.y }),
        canWalk: (x: number, y: number) => !this.isFootBlocked(x, y),
        snapshot: () => state.snapshot(),
        save: () => state.toSave(),
        terrainAt: (x: number, y: number) => {
          const t = this.currentMap.tilemap;
          if (!t) return null;
          const feetY = y + FEET_OFFSET_Y;
          const tileCol = Math.floor(x / t.tileSize);
          const tileRow = Math.floor(feetY / t.tileSize);
          const terr = tileTerrainAt(t, x, feetY);
          return { tileCol, tileRow, kind: terr?.kind ?? "normal" };
        },
        dumpMap: () => {
          const t = this.currentMap.tilemap;
          if (!t) return null;
          const sym: Record<string, string> = {
            grass: ".", path: " ", courtyard: "c", water: "~", "shallow-water": "s",
            rice: "R", fence: "#", bamboo: "B", temple: "T", stall: "$", rock: "O", bridge: "=",
            ricegold: "L", shophouse: "H",
          };
          let out = "";
          for (let r = 0; r < t.rows; r++) {
            let line = "";
            for (let c = 0; c < t.cols; c++) {
              const d = t.detail[r * t.cols + c];
              const gnd = t.ground[r * t.cols + c];
              line += d ? sym[d] : sym[gnd];
            }
            out += line + "\n";
          }
          return out;
        },
      };
    }
    updateHud(state.snapshot());
  }

  update(time: number) {
    const terrain = this.currentTerrain();
    const speed = this.activeDialogue ? 0 : WALK_SPEED * terrain.speedMultiplier;
    const velocity = new Phaser.Math.Vector2(0, 0);
    if (this.cursors.left.isDown || this.keys.a.isDown || pressedActions.has("left")) velocity.x -= 1;
    if (this.cursors.right.isDown || this.keys.d.isDown || pressedActions.has("right")) velocity.x += 1;
    if (this.cursors.up.isDown || this.keys.w.isDown || pressedActions.has("up")) velocity.y -= 1;
    if (this.cursors.down.isDown || this.keys.s.isDown || pressedActions.has("down")) velocity.y += 1;

    velocity.normalize().scale(speed);
    this.player.setVelocity(velocity.x, velocity.y);
    if (velocity.x !== 0) this.player.setFlipX(velocity.x < 0);
    this.playHeroAnimation(velocity, time);
    this.resolveCollision();

    if (this.mKey && Phaser.Input.Keyboard.JustDown(this.mKey)) {
      this.debugVisible = !this.debugVisible;
      this.debugOverlay?.setVisible(this.debugVisible);
    }

    const previousTerrain = this.lastTerrain;
    if (time < this.waterBlockPromptUntil) {
      state.setTerrain("blocked-water");
    } else if (terrain.kind === "shallow-water") {
      state.setTerrain("shallow-water", terrain.prompt);
      this.spawnWaterRipple(time);
    } else {
      state.setTerrain("normal");
      if (previousTerrain !== "normal") {
        state.setPrompt("Đã lên bờ. Đi theo đường đất để tránh ao, mương và ruộng.");
      }
    }
    this.updateTerrainHud();
    this.updateTargetRecovery(time);

    this.handleExitOverlap(time);

    const spacePressed = Phaser.Input.Keyboard.JustDown(this.keys.space);
    const interactPressed =
      Phaser.Input.Keyboard.JustDown(this.keys.e) || pressedActions.has("interact");
    const strikePressed = pressedActions.has("strike");

    if ((spacePressed || interactPressed) && time - this.lastInteract > 240) {
      this.lastInteract = time;
      this.smartInteract(time);
      pressedActions.delete("interact");
      return;
    }

    if (strikePressed && time - this.lastStrike > 260) {
      this.lastStrike = time;
      this.strike(time);
      pressedActions.delete("strike");
    }
  }

  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D,
      e: Phaser.Input.Keyboard.KeyCodes.E,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    if (import.meta.env.DEV) {
      this.mKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    }
  }

  private createAnimations() {
    this.anims.create({ key: "idle-front", frames: [{ key: "hero", frame: 0 }], frameRate: 1, repeat: -1 });
    this.anims.create({
      key: "walk-front",
      frames: [{ key: "hero", frame: 1 }, { key: "hero", frame: 2 }],
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({
      key: "walk-back",
      frames: [{ key: "hero", frame: 4 }, { key: "hero", frame: 5 }],
      frameRate: 7,
      repeat: -1,
    });
    this.anims.create({ key: "walk-side", frames: [{ key: "hero", frame: 6 }], frameRate: 1, repeat: -1 });
    this.anims.create({ key: "strike-staff", frames: [{ key: "hero", frame: 3 }], frameRate: 1, repeat: 0 });
    this.anims.create({ key: "victory", frames: [{ key: "hero", frame: 7 }], frameRate: 1, repeat: -1 });
  }

  private loadMap(mapId: MapId, start: { x: number; y: number }) {
    this.currentMap = MAPS[mapId];
    this.children.removeAll(true);
    this.physics.world.colliders.destroy();
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setZoom(this.cameraZoom(this.scale.width, this.scale.height));
    closeDialogue();
    this.targetRuntime.clear();

    if (this.currentMap.tilemap) {
      this.renderTilemap(this.currentMap.tilemap);
    } else {
      this.add.image(0, 0, this.currentMap.backgroundKey).setOrigin(0, 0).setDisplaySize(WORLD.width, WORLD.height);
    }
    this.blockers = this.physics.add.staticGroup();
    this.deepWater = this.physics.add.staticGroup();
    this.targets = this.physics.add.staticGroup();
    this.collectibles = this.physics.add.staticGroup();

    if (!this.currentMap.tilemap) {
      this.currentMap.blockers.forEach((rect) => this.addStaticRect(rect, this.blockers));
    }
    if (!this.currentMap.tilemap && !state.snapshot().canSwim) {
      this.currentMap.deepWater.forEach((rect) => this.addStaticRect(rect, this.deepWater));
    }

    this.buildCollisionGrid();
    this.createMapProps();
    this.createPlayer(start.x, start.y);
    this.lastValid = { x: this.player.x, y: this.player.y };

    this.physics.add.collider(this.player, this.blockers);
    this.physics.add.collider(this.player, this.deepWater, () => this.bumpDeepWater());
    if (this.npc) this.physics.add.collider(this.player, this.npc);
    this.physics.add.overlap(this.player, this.collectibles, (_, collectible) =>
      this.collect(collectible as Phaser.Physics.Arcade.Sprite),
    );

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    updateHud(state.snapshot());
  }

  private createMapProps() {
    this.npc = undefined;
    this.gate = undefined;
    this.gateGlow = undefined;

    if (this.currentMap.npc) {
      this.npc = this.add
        .sprite(this.currentMap.npc.x, this.currentMap.npc.y, this.currentMap.npc.spriteKey, 1)
        .setScale(0.5)
        .setDepth(this.currentMap.playerDepth - 1);
      this.physics.add.existing(this.npc, true);
    }

    if (this.currentMap.gate) {
      this.gateGlow = this.add
        .ellipse(this.currentMap.gate.x, this.currentMap.gate.y + 12, 130, 54, 0xffdf72, 0.16)
        .setDepth(2);
      this.gate = this.add
        .rectangle(this.currentMap.gate.x, this.currentMap.gate.y, this.currentMap.gate.width, this.currentMap.gate.height, 0x8c5230, 0.01)
        .setDepth(2);
    }

    this.currentMap.exits.forEach((exit) => {
      this.add
        .text(exit.x - exit.width / 2, exit.y - 52, exit.label, {
          color: "#fff6d5",
          fontFamily: "ui-sans-serif, system-ui",
          fontSize: "13px",
          fontStyle: "bold",
          stroke: "#20381f",
          strokeThickness: 3,
        })
        .setDepth(5);
    });

    this.currentMap.targets.forEach((target) => {
      if (state.hasDefeated(target.id)) return;
      const sprite = this.targets.create(target.x, target.y, target.kind) as Phaser.Physics.Arcade.Sprite;
      sprite.setData("id", target.id);
      sprite.setData("kind", target.kind);
      sprite.setData("maxHp", target.maxHp);
      sprite.refreshBody();
      this.addTargetHpBar(target);
    });

    this.currentMap.collectibles.forEach((collectible) => {
      if (state.hasCollected(collectible.id)) return;
      const sprite = this.collectibles.create(collectible.x, collectible.y, collectible.kind) as Phaser.Physics.Arcade.Sprite;
      sprite.setData("id", collectible.id);
      sprite.setData("kind", collectible.kind);
      sprite.refreshBody();
    });
  }

  private createPlayer(x: number, y: number) {
    this.player = this.physics.add.sprite(x, y, "hero", 0).setScale(HERO_SCALE).setDepth(this.currentMap.playerDepth);
    this.player.setSize(54, 66).setOffset(45, 70).setCollideWorldBounds(true);
  }

  private renderTilemap(tilemap: TileMapDef) {
    for (let row = 0; row < tilemap.rows; row++) {
      for (let col = 0; col < tilemap.cols; col++) {
        const x = col * tilemap.tileSize + tilemap.tileSize / 2;
        const y = row * tilemap.tileSize + tilemap.tileSize / 2;
        const ground = tilemap.ground[row * tilemap.cols + col];
        const groundVariants = TILE_TEXTURES[ground];
        const groundKey = groundVariants[cellHash(col, row) % groundVariants.length];
        this.add.image(x, y, groundKey).setDisplaySize(tilemap.tileSize, tilemap.tileSize).setDepth(0);
        const detail = tilemap.detail[row * tilemap.cols + col];
        if (detail) {
          const detailVariants = TILE_TEXTURES[detail];
          const detailKey = detailVariants[cellHash(col + 101, row + 53) % detailVariants.length];
          this.add.image(x, y, detailKey).setDisplaySize(tilemap.tileSize, tilemap.tileSize).setDepth(1);
        } else {
          this.scatterDecor(ground, col, row, x, y, tilemap.tileSize);
        }
      }
    }
  }

  // Purely-visual decoration sprinkled over open (non-blocking, no-detail) tiles.
  // Driven by cellHash so it's stable; never touches collision.
  private scatterDecor(ground: TileKind, col: number, row: number, x: number, y: number, size: number) {
    const h = cellHash(col + 7, row + 31);
    let key: string | undefined;
    let scale = 0.62;
    let depth = 0.6;
    if (ground === "grass") {
      if (h % 11 === 0) key = DECOR_TEXTURES.flower;
      else if (h % 11 === 4) key = DECOR_TEXTURES.tuft;
      else if (h % 53 === 1) { key = DECOR_TEXTURES.banana; scale = 1; depth = 6; }
    } else if (ground === "shallow-water") {
      if (h % 7 === 0) key = DECOR_TEXTURES.lily;
    } else if (ground === "courtyard") {
      // lồng đèn treo trên phố / sân — treo cao để nhân vật đi phía dưới
      if (h % 17 === 0) { key = DECOR_TEXTURES.lantern; scale = 0.8; depth = 9; }
    }
    if (!key) return;
    this.add.image(x, y, key).setDisplaySize(size * scale, size * scale).setDepth(depth);
  }

  private cameraZoom(width: number, height: number) {
    const fitWorld = Math.max(width / WORLD.width, height / WORLD.height);
    const base = width < 720 ? 1 : 1.08;
    return Math.max(base, fitWorld);
  }

  private addTargetHpBar(target: TargetDef) {
    const y = target.y - 42;
    const bg = this.add
      .rectangle(target.x, y, 46, 6, 0x1f2517, 0.78)
      .setStrokeStyle(1, 0xfff1b6, 0.42)
      .setDepth(this.currentMap.playerDepth + 2);
    const fill = this.add
      .rectangle(target.x - 22, y, 44, 4, 0xd76a38, 1)
      .setOrigin(0, 0.5)
      .setDepth(this.currentMap.playerDepth + 3);
    this.targetRuntime.set(target.id, {
      def: target,
      hp: target.maxHp,
      lastHitAt: -Infinity,
      barBg: bg,
      barFill: fill,
    });
  }

  private addStaticRect(rect: { x: number; y: number; width: number; height: number }, group: Phaser.Physics.Arcade.StaticGroup) {
    const body = this.add.rectangle(rect.x, rect.y, rect.width, rect.height, 0x000000, 0).setVisible(false);
    this.physics.add.existing(body, true);
    group.add(body);
  }

  private buildCollisionGrid() {
    const grid = new CollisionGrid(WORLD.width, WORLD.height, COLLISION_CELL_SIZE);
    if (this.currentMap.tilemap) {
      grid.addShapes({ rects: tileCollisionRects(this.currentMap.tilemap) });
      this.collisionGrid = grid;
      this.rebuildDebugOverlay(grid);
      return;
    }
    grid.addShapes({ rects: this.currentMap.blockers });
    if (!state.snapshot().canSwim) {
      grid.addShapes({ rects: this.currentMap.deepWater });
    }
    if (this.currentMap.collisionShapes) {
      grid.addShapes(this.currentMap.collisionShapes);
    }
    if (this.currentMap.collisionMaskKey) {
      const mask = this.textures.get(this.currentMap.collisionMaskKey).getSourceImage();
      if (mask instanceof HTMLImageElement || mask instanceof HTMLCanvasElement || mask instanceof ImageBitmap) {
        grid.addMaskImage(mask);
      }
    }
    this.collisionGrid = grid;
    this.rebuildDebugOverlay(grid);
  }

  private rebuildDebugOverlay(grid: CollisionGrid) {
    if (this.debugOverlay) {
      this.debugOverlay.destroy();
      this.debugOverlay = undefined;
    }
    if (import.meta.env.DEV) {
      const key = `collision-debug-${this.currentMap.id}-${state.snapshot().canSwim ? "swim" : "land"}`;
      if (this.textures.exists(key)) this.textures.remove(key);
      this.textures.addCanvas(key, grid.renderDebugCanvas());
      this.debugOverlay = this.add
        .image(0, 0, key)
        .setOrigin(0, 0)
        .setDepth(20)
        .setVisible(this.debugVisible);
    }
  }

  private resolveCollision() {
    if (!this.collisionGrid) return;
    const newX = this.player.x;
    const newY = this.player.y;
    const oldX = this.lastValid.x;
    const oldY = this.lastValid.y;
    const blocked = this.isFootBlocked(newX, newY);
    if (!blocked) {
      this.lastValid = { x: newX, y: newY };
      return;
    }
    const blockedX = this.isFootBlocked(newX, oldY);
    const blockedY = this.isFootBlocked(oldX, newY);
    if (!blockedX) {
      this.player.setPosition(newX, oldY);
      this.player.setVelocity(this.player.body!.velocity.x, 0);
      this.lastValid = { x: newX, y: oldY };
    } else if (!blockedY) {
      this.player.setPosition(oldX, newY);
      this.player.setVelocity(0, this.player.body!.velocity.y);
      this.lastValid = { x: oldX, y: newY };
    } else {
      this.player.setPosition(oldX, oldY);
      this.player.setVelocity(0, 0);
    }
  }

  private isFootBlocked(x: number, y: number) {
    if (!this.collisionGrid) return false;
    const footY = y + FEET_OFFSET_Y;
    return FOOT_SAMPLE_OFFSETS.some((offsetX) => this.collisionGrid!.isBlocked(x + offsetX, footY));
  }

  private currentTerrain() {
    const feetX = this.player.x;
    const feetY = this.player.y + 22;
    // Tilemap maps are the single source of truth for terrain. Do NOT fall back
    // to the legacy shallowTerrain rects — those cover huge areas and were making
    // dry dirt/path read as "lội nước".
    if (this.currentMap.tilemap) {
      const tileTerrain = tileTerrainAt(this.currentMap.tilemap, feetX, feetY);
      return tileTerrain ?? { kind: "normal" as const, speedMultiplier: 1, prompt: "" };
    }
    const shallow = this.currentMap.shallowTerrain.find((zone) => rectContains(zone, feetX, feetY));
    return shallow ?? { kind: "normal" as const, speedMultiplier: 1, prompt: "" };
  }

  private bumpDeepWater() {
    const zone = this.currentMap.deepWater.find((water) =>
      rectContains(water, this.player.x, this.player.y + 22),
    );
    this.waterBlockPromptUntil = this.time.now + 900;
    state.setTerrain("blocked-water", zone?.prompt ?? "Nước sâu. Chưa học bơi thì không thể đi tiếp.");
    showNotice(zone?.prompt ?? "Nước sâu. Chưa học bơi thì không thể đi tiếp.");
    this.cameras.main.shake(90, 0.002);
    updateHud(state.snapshot());
  }

  private updateTerrainHud() {
    const snapshot = state.snapshot();
    if (snapshot.terrain === this.lastTerrain) return;
    this.lastTerrain = snapshot.terrain;
    this.player.clearTint();
    if (snapshot.terrain === "shallow-water") {
      this.player.setTint(0x9be2ff);
      showNotice("Lội nước: tốc độ giảm mạnh.");
    }
    if (snapshot.terrain === "blocked-water") {
      this.player.setTint(0x78b6ff);
    }
    updateHud(snapshot);
  }

  private spawnWaterRipple(time: number) {
    if (time - this.lastRippleAt < 220) return;
    this.lastRippleAt = time;
    const ripple = this.add
      .ellipse(this.player.x, this.player.y + 31, 28, 9, 0xb7f1ff, 0.34)
      .setDepth(this.currentMap.playerDepth - 1);
    this.tweens.add({
      targets: ripple,
      alpha: 0,
      scaleX: 1.7,
      scaleY: 1.45,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => ripple.destroy(),
    });
  }

  private updateTargetRecovery(time: number) {
    this.targetRuntime.forEach((target) => {
      if (target.hp <= 0) return;
      if (time - target.lastHitAt < target.def.recoveryDelayMs) return;
      if (target.hp >= target.def.maxHp) return;
      target.hp = Math.min(target.def.maxHp, target.hp + (target.def.recoveryPerSecond / 60));
      this.renderTargetHp(target);
    });
  }

  private handleExitOverlap(time: number) {
    if (this.activeDialogue || time < this.transitionLockedUntil) return;
    const exit = this.exitUnderPlayer();
    if (!exit) return;

    // Cổng luôn mở — đi lại giữa các map tự do, không khoá theo nhiệm vụ.
    state.enterMap(exit.to);
    persistProgress();
    this.transitionLockedUntil = time + 900;
    this.loadMap(exit.to, exit.spawn);
  }

  private exitUnderPlayer(): ExitDef | undefined {
    return this.currentMap.exits.find((exit) => rectContains(exit, this.player.x, this.player.y + 22));
  }

  private smartInteract(time: number) {
    if (this.activeDialogue) {
      this.advanceDialogue();
      return;
    }

    const snapshot = state.snapshot();
    const nearMaster =
      this.npc && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < 92;
    const nearGate =
      this.gate && Phaser.Math.Distance.Between(this.player.x, this.player.y, this.gate.x, this.gate.y) < 108;
    const exit = this.exitUnderPlayer();

    if (nearMaster) {
      this.talkToMaster(snapshot);
      return;
    }

    if (nearGate) {
      this.tryOpenGate(snapshot);
      return;
    }

    if (exit) {
      state.setPrompt("Đi tiếp theo đường đất...");
      updateHud(state.snapshot());
      return;
    }

    this.strike(time);
  }

  private tryOpenGate(snapshot: GameSnapshot) {
    if (snapshot.phase !== "gate-open") {
      state.setPrompt("Cổng đình chưa mở. Hoàn thành bài ở làng và bãi tre trước.");
      updateHud(state.snapshot());
      return;
    }

    this.openDialogue({
      speaker: "Thầy Ba",
      lines: [
        "Con đã đi đủ hai bài: lễ ở làng, thân pháp ở bãi tre.",
        "Từ hôm nay cổng hội mở. Sang chợ huyện giúp việc làng, rồi qua bến sông và Núi Trúc.",
      ],
      onDone: () => {
        state.completeFestival();
        persistProgress();
        this.tweens.add({
          targets: this.gateGlow,
          alpha: 0.72,
          scale: 1.45,
          yoyo: true,
          repeat: 3,
          duration: 360,
        });
        updateHud(state.snapshot());
      },
    });
  }

  private talkToMaster(snapshot: GameSnapshot) {
    const script = masterDialogue(snapshot);
    this.openDialogue({
      ...script,
      onDone:
        snapshot.phase === "intro"
          ? () => {
              state.acceptQuest();
              persistProgress();
              this.floatText(this.npc!.x, this.npc!.y - 42, "bắt đầu bài luyện", "#fff5c7");
              updateHud(state.snapshot());
            }
          : undefined,
    });
  }

  private collect(collectible: Phaser.Physics.Arcade.Sprite) {
    const id = collectible.getData("id") as string;
    const kind = collectible.getData("kind") as CollectibleKind;
    const didCollect = state.collect(id, kind);
    if (!didCollect) {
      updateHud(state.snapshot());
      return;
    }

    collectible.disableBody(true, true);
    persistProgress();
    this.floatText(collectible.x, collectible.y - 20, collectText(kind), "#fff4b8");
    updateHud(state.snapshot());
  }

  private strike(time: number) {
    this.strikeUntil = time + 220;
    this.player.setTint(0xffe28a);
    this.time.delayedCall(100, () => this.player.clearTint());
    this.time.delayedCall(360, () => showSkillState("Sẵn sàng"));

    const arc = this.add
      .circle(this.player.x + (this.player.flipX ? -34 : 34), this.player.y + 8, 30, 0xfff0a8, 0.28)
      .setDepth(this.currentMap.playerDepth - 1);
    this.tweens.add({ targets: arc, alpha: 0, scale: 1.6, duration: 130, onComplete: () => arc.destroy() });

    const target = this.targets.getChildren().find((child) => {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      return sprite.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, sprite.x, sprite.y) < 76;
    }) as Phaser.Physics.Arcade.Sprite | undefined;

    if (!target) {
      state.setPrompt("Đứng gần bù nhìn hoặc cọc tre hơn rồi bấm Space để vung gậy.");
      updateHud(state.snapshot());
      return;
    }

    const id = target.getData("id") as string;
    const runtime = this.targetRuntime.get(id);
    if (!runtime) return;
    const damage = state.snapshot().attackPower;
    runtime.hp = Math.max(0, runtime.hp - damage);
    runtime.lastHitAt = time;
    this.renderTargetHp(runtime);
    this.floatText(target.x, target.y - 32, `-${damage} HP`, "#ffe7a6");
    showSkillState("Đang vung gậy");

    if (runtime.hp > 0) {
      state.setPrompt(`Mục tiêu còn ${Math.ceil(runtime.hp)}/${runtime.def.maxHp} HP. Đánh liền tay kẻo nó hồi.`);
      updateHud(state.snapshot());
      return;
    }

    target.disableBody(true, true);
    runtime.barBg.destroy();
    runtime.barFill.destroy();
    state.defeatTarget(id, this.currentMap.id);
    persistProgress();
    this.floatText(target.x, target.y - 48, "hạ mục tiêu", "#fff1b6");
    updateHud(state.snapshot());
  }

  private renderTargetHp(target: TargetRuntime) {
    target.barFill.width = 44 * Phaser.Math.Clamp(target.hp / target.def.maxHp, 0, 1);
    if (target.hp <= target.def.maxHp * 0.34) target.barFill.setFillStyle(0xd64d3d);
    else if (target.hp <= target.def.maxHp * 0.67) target.barFill.setFillStyle(0xe1a23a);
    else target.barFill.setFillStyle(0x73b35a);
  }

  private playHeroAnimation(velocity: Phaser.Math.Vector2, time: number) {
    if (state.snapshot().phase === "chapter-complete") {
      this.player.anims.play("victory", true);
      return;
    }
    if (time < this.strikeUntil) {
      this.player.anims.play("strike-staff", true);
      return;
    }
    if (velocity.lengthSq() === 0) {
      this.player.anims.play("idle-front", true);
      return;
    }
    if (Math.abs(velocity.x) > Math.abs(velocity.y)) {
      this.player.anims.play("walk-side", true);
      return;
    }
    this.player.anims.play(velocity.y < 0 ? "walk-back" : "walk-front", true);
  }

  private openDialogue(dialogue: Dialogue) {
    this.activeDialogue = dialogue;
    this.dialogueIndex = 0;
    showDialogue(dialogue.speaker, dialogue.lines[0], dialogue.lines.length > 1);
  }

  private advanceDialogue() {
    if (!this.activeDialogue) return;
    this.dialogueIndex += 1;
    if (this.dialogueIndex < this.activeDialogue.lines.length) {
      showDialogue(
        this.activeDialogue.speaker,
        this.activeDialogue.lines[this.dialogueIndex],
        this.dialogueIndex < this.activeDialogue.lines.length - 1,
      );
      return;
    }
    const done = this.activeDialogue.onDone;
    this.activeDialogue = undefined;
    closeDialogue();
    done?.();
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(x, y, text, {
        color,
        fontFamily: "ui-sans-serif, system-ui",
        fontSize: "14px",
        fontStyle: "bold",
        stroke: "#22301f",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: label,
      y: y - 28,
      alpha: 0,
      duration: 760,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private resetGame() {
    clearSave();
    window.location.reload();
  }

  private createTextures() {
    const g = this.add.graphics();
    g.clear();
    g.lineStyle(5, 0x6b4529, 1).lineBetween(18, 18, 18, 54);
    g.lineBetween(4, 34, 32, 34);
    g.fillStyle(0xd3a34d, 1).fillRoundedRect(6, 16, 24, 24, 6);
    g.fillStyle(0x7c4a2b, 1).fillTriangle(6, 16, 30, 16, 18, 4);
    g.generateTexture("dummy", 38, 60);

    g.clear();
    g.lineStyle(6, 0x477139, 1).lineBetween(20, 8, 20, 58);
    g.lineStyle(5, 0x8d6840, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xd2bd5c, 1).fillRoundedRect(10, 18, 20, 26, 4);
    g.generateTexture("bamboo-post", 42, 64);

    g.clear();
    g.fillStyle(0x4a8c4f, 1).fillEllipse(18, 24, 24, 10);
    g.fillStyle(0xe66e9c, 1).fillEllipse(12, 15, 16, 22);
    g.fillEllipse(24, 15, 16, 22);
    g.fillStyle(0xffd5e6, 1).fillEllipse(18, 13, 16, 24);
    g.generateTexture("lotus", 38, 36);

    g.clear();
    g.fillStyle(0xd5b75a, 1).fillRoundedRect(8, 8, 28, 40, 4);
    g.lineStyle(3, 0x7e542b, 1).strokeRoundedRect(8, 8, 28, 40, 4);
    g.lineStyle(2, 0x7e542b, 1).lineBetween(15, 18, 29, 18);
    g.lineBetween(15, 28, 29, 28);
    g.generateTexture("bamboo-token", 44, 56);

    g.clear();
    g.fillStyle(0xe6c87a, 1).fillRoundedRect(7, 10, 30, 34, 5);
    g.lineStyle(3, 0x8a4f2d, 1).strokeRoundedRect(7, 10, 30, 34, 5);
    g.fillStyle(0xb8482c, 1).fillCircle(30, 36, 5);
    g.lineStyle(2, 0x8a4f2d, 1).lineBetween(13, 19, 29, 19);
    g.lineBetween(13, 27, 25, 27);
    g.generateTexture("market-scroll", 44, 54);

    g.clear();
    g.fillStyle(0x9fe7ff, 0.9).fillCircle(20, 25, 12);
    g.lineStyle(3, 0x2f7e8f, 1).strokeCircle(20, 25, 12);
    g.fillStyle(0xffffff, 0.88).fillCircle(16, 20, 4);
    g.generateTexture("river-pearl", 42, 48);

    g.clear();
    g.fillStyle(0x6f9d48, 1).fillRoundedRect(10, 8, 26, 34, 5);
    g.lineStyle(3, 0xd7c373, 1).strokeRoundedRect(10, 8, 26, 34, 5);
    g.lineStyle(3, 0xd7c373, 1).lineBetween(16, 18, 30, 18);
    g.lineBetween(23, 12, 23, 36);
    g.generateTexture("mountain-seal", 46, 52);

    g.clear();
    g.lineStyle(6, 0x86502c, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xb8482c, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xe6c87a, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("market-post", 42, 66);

    g.clear();
    g.lineStyle(6, 0x2f7e8f, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0x8d6840, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xaad4d9, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("river-post", 42, 66);

    g.clear();
    g.lineStyle(6, 0x4f5d42, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xd7c373, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0x8aa064, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("mountain-post", 42, 66);

    // Bó lúa (rice sheaf collectible)
    g.clear();
    g.lineStyle(3, 0x9a7b2e, 1);
    for (let i = -2; i <= 2; i++) g.lineBetween(20 + i * 4, 6, 20 + i * 2, 40);
    g.fillStyle(0xe6cf63, 1).fillEllipse(20, 12, 26, 16);
    g.fillStyle(0xf4e58a, 1).fillEllipse(20, 10, 18, 10);
    g.fillStyle(0xb8482c, 1).fillRect(8, 30, 24, 4); // dây buộc
    g.generateTexture("rice-sheaf", 40, 46);

    // Đèn lồng (lantern-orb collectible)
    g.clear();
    g.lineStyle(2, 0x6f4a28, 1).lineBetween(20, 2, 20, 8);
    g.fillStyle(0xf0c45a, 1).fillRect(12, 6, 16, 3);
    g.fillStyle(0xd14b3c, 1).fillEllipse(20, 24, 26, 30);
    g.fillStyle(0xe87060, 1).fillEllipse(20, 22, 16, 22);
    g.fillStyle(0xffe08a, 0.9).fillEllipse(20, 22, 8, 14);
    g.fillStyle(0xf0c45a, 1).fillRect(12, 8, 16, 2).fillRect(12, 38, 16, 2);
    g.fillStyle(0xd9a23a, 1).fillRect(18, 40, 4, 6); // tua
    g.generateTexture("lantern-orb", 40, 50);

    // Cọc luyện ruộng (terrace-post)
    g.clear();
    g.lineStyle(6, 0x8a6a30, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xcdb24a, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xe6cf63, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("terrace-post", 42, 66);

    // Cọc luyện phố (oldtown-post)
    g.clear();
    g.lineStyle(6, 0x7a3a24, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xd14b3c, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xe0a86a, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("oldtown-post", 42, 66);

    // Nén hương (incense collectible)
    g.clear();
    g.lineStyle(2, 0x9a3a2a, 1);
    for (const ix of [14, 20, 26]) g.lineBetween(ix, 10, ix, 44);
    g.fillStyle(0xffb347, 1).fillCircle(14, 9, 3).fillCircle(20, 8, 3).fillCircle(26, 9, 3);
    g.fillStyle(0xfff0c2, 0.9).fillCircle(20, 8, 1.4);
    g.fillStyle(0xb8482c, 1).fillRect(10, 42, 20, 5); // bát hương
    g.generateTexture("incense", 40, 50);

    // Búp chè (tea-bud collectible)
    g.clear();
    g.fillStyle(0x4f8a40, 1).fillEllipse(20, 24, 22, 28);
    g.fillStyle(0x69a84f, 1).fillEllipse(20, 22, 14, 20);
    g.fillStyle(0x8cc169, 1).fillEllipse(20, 16, 8, 12);
    g.fillStyle(0xcfe6a3, 1).fillEllipse(20, 13, 4, 7);
    g.lineStyle(2, 0x356029, 1).lineBetween(20, 30, 20, 44);
    g.generateTexture("tea-bud", 40, 48);

    // Trái cây (fruit collectible — giỏ trái cây chợ nổi)
    g.clear();
    g.fillStyle(0xe6b85a, 1).fillRoundedRect(8, 22, 24, 18, 4); // giỏ
    g.lineStyle(2, 0x9a6a2e, 1).strokeRoundedRect(8, 22, 24, 18, 4);
    g.fillStyle(0xe85c5c, 1).fillCircle(15, 20, 6);
    g.fillStyle(0xf0c45a, 1).fillCircle(24, 19, 6);
    g.fillStyle(0x7bbf4f, 1).fillCircle(20, 24, 5);
    g.generateTexture("fruit", 40, 46);

    // Cọc luyện chùa (pagoda-post)
    g.clear();
    g.lineStyle(6, 0x7a5a3a, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xc97f3a, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0xe6c87a, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("pagoda-post", 42, 66);

    // Cọc luyện đồi chè (tea-post)
    g.clear();
    g.lineStyle(6, 0x356029, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0x69a84f, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0x8cc169, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("tea-post", 42, 66);

    // Cọc luyện chợ nổi (chonoi-post)
    g.clear();
    g.lineStyle(6, 0x2f7e8f, 1).lineBetween(20, 7, 20, 60);
    g.lineStyle(5, 0xe6b85a, 1).lineBetween(8, 26, 32, 26);
    g.fillStyle(0x9bd4ee, 1).fillRoundedRect(9, 17, 22, 28, 4);
    g.generateTexture("chonoi-post", 42, 66);

    g.destroy();
    this.buildTileTextures();
  }

  // Procedural pixel-art tiles. Everything is drawn on a 20x20 logical grid
  // (PX=2 device pixels per art-pixel) so the textures read as deliberate
  // pixel art instead of flat blocks. Ground tiles get several seeded variants
  // so big patches don't repeat; props (fence/bamboo/temple/stall/rock) keep
  // their structural lines aligned so neighbouring cells form one object.
  private buildTileTextures() {
    const g = this.add.graphics();
    const PX = 2;
    const N = TILE_SIZE / PX; // 20

    const px = (x: number, y: number, w: number, h: number, color: number, alpha = 1) =>
      g.fillStyle(color, alpha).fillRect(x * PX, y * PX, w * PX, h * PX);

    const base = (color: number) => px(0, 0, N, N, color);

    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const speckle = (
      rand: () => number,
      count: number,
      palette: number[],
      alpha = 1,
      size = 1,
    ) => {
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rand() * (N - size + 1));
        const y = Math.floor(rand() * (N - size + 1));
        px(x, y, size, size, palette[Math.floor(rand() * palette.length)], alpha);
      }
    };

    const make = (key: string, draw: () => void) => {
      g.clear();
      draw();
      if (this.textures.exists(key)) this.textures.remove(key);
      g.generateTexture(key, TILE_SIZE, TILE_SIZE);
    };

    // --- Grass: lush but muted, scattered blades + clover specks ---
    for (let v = 0; v < 4; v++) {
      make(`tile-grass-${v}`, () => {
        const rand = rng(11 + v * 7);
        base(0x6f9a4e);
        speckle(rand, 30, [0x7faa57, 0x82ad5d], 1);
        speckle(rand, 22, [0x5d8642, 0x567c3c], 1);
        // a handful of short blades (2px tall)
        for (let i = 0; i < 6; i++) {
          const x = Math.floor(rand() * N);
          const y = Math.floor(rand() * (N - 2));
          px(x, y, 1, 2, 0x4f7a37);
          px(x, y - 1, 1, 1, 0x8cb863);
        }
        // occasional tiny flower
        if (v % 2 === 0) {
          const fx = 3 + Math.floor(rand() * (N - 6));
          const fy = 3 + Math.floor(rand() * (N - 6));
          px(fx, fy, 1, 1, 0xf0d765);
        }
      });
    }

    // --- Dirt path: warm packed earth with pebbles + footworn tones ---
    for (let v = 0; v < 3; v++) {
      make(`tile-path-${v}`, () => {
        const rand = rng(101 + v * 13);
        base(0xc1a268);
        speckle(rand, 26, [0xcbb079, 0xd3bb88], 1);
        speckle(rand, 24, [0xae8c50, 0xa07e45], 1);
        // pebbles (2px)
        for (let i = 0; i < 4; i++) {
          const x = Math.floor(rand() * (N - 2));
          const y = Math.floor(rand() * (N - 2));
          px(x, y, 2, 1, 0x8f6f3c);
          px(x, y, 1, 1, 0xd8c596);
        }
      });
    }

    // --- Courtyard: laid brick / packed clay ---
    make("tile-courtyard-0", () => {
      const rand = rng(303);
      base(0xb27a4d);
      speckle(rand, 18, [0xbe885a, 0xc6925f], 1);
      speckle(rand, 14, [0x9c6840], 1);
      // brick seams (offset rows)
      for (let row = 0; row < N; row += 5) {
        px(0, row, N, 1, 0x8a5c38, 0.6);
        const offset = (row / 5) % 2 === 0 ? 0 : 10;
        for (let x = offset; x < N; x += 10) px(x, row, 1, 5, 0x8a5c38, 0.55);
      }
    });

    // --- Deep water: clear blue, layered ripples ---
    for (let v = 0; v < 3; v++) {
      make(`tile-water-${v}`, () => {
        const rand = rng(404 + v * 9);
        base(0x1d6fa6);
        speckle(rand, 16, [0x1a5f90, 0x2277ad], 1);
        // ripple highlights — short horizontal dashes
        for (let i = 0; i < 7; i++) {
          const x = Math.floor(rand() * (N - 4));
          const y = Math.floor(rand() * N);
          px(x, y, 3, 1, 0x4fa8d8, 0.75);
          px(x + 1, y - 1, 2, 1, 0x9bd4ee, 0.55);
        }
      });
    }

    // --- Shallow water: unmistakably blue water (NO sand specks — those read as
    //     wet dirt and made the pond edge look like land). Foam-flecked ripples. ---
    for (let v = 0; v < 3; v++) {
      make(`tile-shallow-water-${v}`, () => {
        const rand = rng(505 + v * 9);
        base(0x3fa6e0);
        speckle(rand, 16, [0x359bd4, 0x4fb2e8], 1);
        for (let i = 0; i < 7; i++) {
          const x = Math.floor(rand() * (N - 4));
          const y = Math.floor(rand() * N);
          px(x, y, 3, 1, 0xbdeaf8, 0.85);
          px(x + 1, y + 1, 2, 1, 0x8fd6f0, 0.6);
        }
      });
    }

    // --- Rice paddy: flooded field — bluish water base + bright young-rice rows.
    //     Deliberately NOT plain green so it never gets mistaken for lawn grass. ---
    for (let v = 0; v < 2; v++) {
      make(`tile-rice-${v}`, () => {
        const rand = rng(606 + v * 17);
        base(0x5f9a78);
        // strong wet sheen so the flooded water reads clearly
        px(0, 0, N, N, 0x3f86a6, 0.34);
        // thin water channels between the planted rows
        for (let cy = 4; cy < N; cy += 5) px(0, cy, N, 1, 0x6fb6d0, 0.5);
        // seedling clumps on a fixed lattice so paddies look continuous
        for (let cy = 2; cy < N; cy += 5) {
          for (let cx = 2; cx < N; cx += 5) {
            const jx = cx + (rand() < 0.5 ? 0 : 1);
            px(jx, cy, 1, 2, 0xb6d957);
            px(jx - 1, cy + 1, 1, 1, 0x9ac23f);
            px(jx + 1, cy + 1, 1, 1, 0xcde87a);
          }
        }
      });
    }

    // --- Fence: TRANSPARENT base so it sits on grass or path; aligned rails ---
    make("tile-fence-0", () => {
      // two vertical posts at fixed columns -> continuous across cells
      const post = (x: number) => {
        px(x, 3, 2, 14, 0x6b4426);
        px(x, 3, 1, 14, 0x855736);
        px(x, 3, 2, 1, 0x9c6a40);
      };
      post(4);
      post(14);
      // top + mid rail
      px(0, 6, N, 2, 0x8a5a30);
      px(0, 6, N, 1, 0xa9763f);
      px(0, 12, N, 2, 0x7a4f2b);
    });

    // --- Bamboo grove (wall): dark canopy, aligned canes + nodes ---
    for (let v = 0; v < 2; v++) {
      make(`tile-bamboo-${v}`, () => {
        const rand = rng(808 + v * 23);
        base(0x33602f);
        speckle(rand, 26, [0x2c5429, 0x3a6b34], 1);
        // canes at fixed x so they line up vertically across cells
        for (const cx of [4, 10, 16]) {
          px(cx, 0, 2, N, 0x6f9a45);
          px(cx, 0, 1, N, 0x86b257);
          // nodes
          for (let ny = (v ? 2 : 5); ny < N; ny += 6) px(cx, ny, 2, 1, 0x4f7a37);
        }
        // a few leaf flecks
        speckle(rand, 10, [0x9ac06a], 0.85);
      });
    }

    // --- Temple: terracotta tiled roof texture (block repeats as a roof) ---
    make("tile-temple-0", () => {
      base(0xb5503a);
      // roof tile courses
      for (let row = 0; row < N; row += 4) {
        px(0, row, N, 1, 0x8f3c2b, 0.85);
        const offset = (row / 4) % 2 === 0 ? 0 : 3;
        for (let x = offset; x < N; x += 6) {
          px(x, row + 1, 1, 3, 0x9a4230, 0.8);
          px(x + 1, row + 1, 2, 1, 0xcf6a47, 0.7);
        }
      }
    });

    // --- Market stall: striped awning over a wooden counter + shade ---
    make("tile-stall-0", () => {
      // awning (top ~half) red/cream stripes
      for (let x = 0; x < N; x += 4) {
        px(x, 0, 2, 9, 0xcf4636);
        px(x + 2, 0, 2, 9, 0xf0d9a3);
      }
      px(0, 8, N, 1, 0x8a3326); // awning lip shadow
      // counter / goods
      px(0, 9, N, 11, 0x9a6a3c);
      px(0, 9, N, 2, 0xb88a52);
      px(0, 17, N, 3, 0x6f4a28, 0.9); // shaded ground under stall
    });

    // --- Rock / cliff: layered grey-green stone with cracks ---
    for (let v = 0; v < 2; v++) {
      make(`tile-rock-${v}`, () => {
        const rand = rng(909 + v * 31);
        base(0x6a7163);
        speckle(rand, 22, [0x767e6e, 0x828a78], 1);
        speckle(rand, 18, [0x565d50, 0x4c5247], 1);
        // top-light edge
        px(0, 0, N, 1, 0x939a87, 0.7);
        // a crack
        let cx = 4 + Math.floor(rand() * 10);
        for (let y = 2; y < N - 1; y += 1) {
          px(cx, y, 1, 1, 0x3c4138, 0.8);
          if (rand() < 0.4) cx += rand() < 0.5 ? -1 : 1;
          cx = Math.max(1, Math.min(N - 2, cx));
        }
      });
    }

    // --- Wooden bridge: planks across, with seams and grain ---
    for (let v = 0; v < 2; v++) {
      make(`tile-bridge-${v}`, () => {
        const rand = rng(1010 + v * 5);
        base(0x9c6f3f);
        for (let y = 0; y < N; y += 4) {
          px(0, y, N, 3, 0xa9794a);
          px(0, y, N, 1, 0xc2945e, 0.8);
          px(0, y + 3, N, 1, 0x6f4a28); // plank seam
          // grain ticks
          for (let i = 0; i < 3; i++) px(2 + Math.floor(rand() * (N - 4)), y + 1, 2, 1, 0x82592f, 0.6);
        }
        // side rails (left/right edges read as bridge sides)
        px(0, 0, 1, N, 0x6f4a28);
        px(N - 1, 0, 1, N, 0x6f4a28);
      });
    }

    // --- Golden ripe rice (lúa chín) — terraced fields, blocked like rice ---
    for (let v = 0; v < 2; v++) {
      make(`tile-ricegold-${v}`, () => {
        const rand = rng(1212 + v * 19);
        base(0xcdb24a);
        px(0, 0, N, N, 0xb9933a, 0.25);
        for (let cy = 2; cy < N; cy += 4) px(0, cy, N, 1, 0xa9842f, 0.5);
        // drooping heavy grain heads
        for (let cy = 1; cy < N; cy += 4) {
          for (let cx = 1; cx < N; cx += 4) {
            const jx = cx + (rand() < 0.5 ? 0 : 1);
            px(jx, cy, 1, 3, 0xe6cf63);
            px(jx, cy, 1, 1, 0xf4e58a);
            px(jx + 1, cy + 2, 1, 1, 0xbf9a3a);
          }
        }
      });
    }

    // --- Tea bushes (luống chè) — rounded green hedges, blocked ---
    for (let v = 0; v < 2; v++) {
      make(`tile-tea-${v}`, () => {
        const rand = rng(1414 + v * 23);
        base(0x3f6e34);
        speckle(rand, 24, [0x4a7d3c, 0x356029], 1);
        // rounded bush tops in a staggered grid
        for (let cy = 2 + (v ? 2 : 0); cy < N; cy += 5) {
          for (let cx = 3; cx < N; cx += 6) {
            px(cx - 2, cy, 5, 3, 0x4f8a40);
            px(cx - 1, cy - 1, 3, 1, 0x69a84f);
            px(cx, cy - 1, 1, 1, 0x8cc169);
          }
        }
      });
    }

    // --- Hội An shophouse wall (nhà phố cổ) — ochre wall + shutter, blocked ---
    make("tile-shophouse-0", () => {
      base(0xd8a23c);
      px(0, 0, N, 2, 0x9a5a2c); // tiled roof lip
      px(0, 0, N, 1, 0xb5683a);
      // moss / aged stains
      for (let i = 0; i < 10; i++) {
        const rand = rng(1313 + i);
        px(Math.floor(rand() * N), 3 + Math.floor(rand() * (N - 4)), 1, 1, 0xb9852f, 0.6);
      }
      // wooden shutter window
      px(5, 7, 10, 9, 0x6f4a28);
      px(6, 8, 8, 7, 0x8a5a30);
      px(10, 7, 1, 9, 0x5a3a20);
      for (let yy = 8; yy < 15; yy += 2) px(6, yy, 8, 1, 0x5a3a20, 0.7);
    });

    // ----- DECOR (transparent bg, non-blocking, scattered by the renderer) -----
    // small wildflower clump
    make("decor-flower", () => {
      px(8, 11, 4, 2, 0x4f7a37);
      px(9, 6, 2, 2, 0xe85c8a); px(7, 8, 2, 2, 0xf0d765); px(11, 8, 2, 2, 0xef6f6f);
      px(9, 9, 2, 1, 0xffffff, 0.8);
    });
    // grass tuft
    make("decor-tuft", () => {
      for (const gx of [6, 9, 12]) { px(gx, 8, 1, 6, 0x5d8642); px(gx, 7, 1, 1, 0x82ad5d); }
      px(7, 13, 7, 1, 0x4f7a37);
    });
    // lily pad + lotus bud (for shallow pond)
    make("decor-lily", () => {
      px(6, 8, 8, 5, 0x3f8c4f); px(7, 9, 6, 3, 0x55a861); px(9, 7, 4, 1, 0x2f6e3a);
      px(12, 6, 2, 3, 0xef9bc0); px(12, 5, 2, 1, 0xffd5e6);
    });
    // hanging lantern (đèn lồng Hội An)
    make("decor-lantern", () => {
      px(9, 0, 2, 2, 0x6f4a28); // string + cap
      px(7, 2, 6, 8, 0xd14b3c); px(8, 3, 4, 6, 0xe87060);
      px(7, 2, 6, 1, 0xf0c45a); px(7, 9, 6, 1, 0xf0c45a);
      px(9, 10, 2, 3, 0xd9a23a); // tassel
    });
    // banana plant (cây chuối) — taller decor
    make("decor-banana", () => {
      px(9, 8, 2, 10, 0x6f8a3a); // trunk
      for (const [lx, ly, lw, lh] of [[3, 4, 7, 2], [10, 3, 7, 2], [2, 8, 6, 2], [12, 8, 6, 2]] as const) {
        px(lx, ly, lw, lh, 0x3f7a34); px(lx, ly, lw, 1, 0x57a046);
      }
      px(8, 2, 4, 4, 0x4f8c3a);
    });

    g.destroy();
  }
}

function persistProgress() {
  writeSave(state.toSave());
  updateSaveStatus("Đã lưu");
}

function updateHud(snapshot: GameSnapshot) {
  const title = document.querySelector<HTMLHeadingElement>("#quest-title");
  const prompt = document.querySelector<HTMLDivElement>("#prompt");
  const map = document.querySelector<HTMLElement>("#map-name");
  const terrain = document.querySelector<HTMLElement>("#terrain-name");
  const rankName = document.querySelector<HTMLElement>("#rank-name");
  const levelCount = document.querySelector<HTMLElement>("#level-count");
  const attackCount = document.querySelector<HTMLElement>("#attack-count");
  const xpCount = document.querySelector<HTMLElement>("#xp-count");
  const collectLabel = document.querySelector<HTMLElement>("#obj-collect-label");
  const collectCount = document.querySelector<HTMLElement>("#obj-collect-count");
  const collectBar = document.querySelector<HTMLSpanElement>("#obj-collect-bar");
  const trainLabel = document.querySelector<HTMLElement>("#obj-train-label");
  const trainCount = document.querySelector<HTMLElement>("#obj-train-count");
  const trainBar = document.querySelector<HTMLSpanElement>("#obj-train-bar");
  const skillName = document.querySelector<HTMLElement>("#staff-skill strong");
  const xpBar = document.querySelector<HTMLSpanElement>("#xp-bar");

  const titleByMap: Record<MapId, string> = {
    village: "Sân làng Tre",
    bamboo: "Bãi tre",
    market: "Chợ huyện",
    river: "Bến sông",
    terrace: "Ruộng Bậc Thang",
    oldtown: "Phố Cổ Hội An",
    mountain: "Núi Trúc",
    chua: "Chùa Làng",
    doiche: "Đồi Chè",
    chonoi: "Chợ Nổi",
  };
  const terrainByState: Record<GameSnapshot["terrain"], string> = {
    normal: "Đất khô",
    "shallow-water": "Lội nước",
    "blocked-water": "Nước sâu",
  };

  if (title) title.textContent = titleByMap[snapshot.map];
  if (map) map.textContent = MAPS[snapshot.map].name;
  if (terrain) terrain.textContent = terrainByState[snapshot.terrain];
  if (prompt) prompt.textContent = snapshot.prompt;
  if (rankName) rankName.textContent = snapshot.rankName;
  if (levelCount) levelCount.textContent = `Cấp ${snapshot.level}`;
  if (attackCount) attackCount.textContent = `Gậy +${snapshot.attackPower}`;
  if (xpCount) xpCount.textContent = `${snapshot.xp}/${snapshot.xpToNext}`;
  if (skillName) skillName.textContent = `Gậy tre cấp ${snapshot.level}`;
  if (xpBar) xpBar.style.width = `${(snapshot.xp / snapshot.xpToNext) * 100}%`;

  // Two objectives, computed from the CURRENT map only (collectibles + training
  // posts). This keeps the HUD honest: you only ever see goals you can do here.
  const collectLabels: Record<CollectibleKind, string> = {
    lotus: "Sen",
    "bamboo-token": "Thẻ tre",
    "market-scroll": "Sổ chợ",
    "river-pearl": "Ngọc sông",
    "mountain-seal": "Ấn trúc",
    "rice-sheaf": "Bó lúa",
    "lantern-orb": "Đèn lồng",
    incense: "Nén hương",
    "tea-bud": "Búp chè",
    fruit: "Trái cây",
  };
  const trainLabels: Record<MapId, string> = {
    village: "Bù nhìn",
    bamboo: "Cọc tre",
    market: "Cọc chợ",
    river: "Cọc bến",
    mountain: "Cọc đá",
    terrace: "Cọc ruộng",
    oldtown: "Cọc phố",
    chua: "Cọc chùa",
    doiche: "Cọc chè",
    chonoi: "Cọc nổi",
  };
  const m = MAPS[snapshot.map];
  const collectKind = m.collectibles[0]?.kind;
  const collectTotal = m.collectibles.length;
  const collectDone = m.collectibles.filter((c) => snapshot.collectedIds.includes(c.id)).length;
  const trainTotal = m.targets.length;
  const trainDone = m.targets.filter((t) => snapshot.defeatedIds.includes(t.id)).length;
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  if (collectLabel) collectLabel.textContent = collectKind ? collectLabels[collectKind] : "Lễ vật";
  if (collectCount) collectCount.textContent = `${collectDone}/${collectTotal}`;
  if (collectBar) collectBar.style.width = `${pct(collectDone, collectTotal)}%`;
  if (trainLabel) trainLabel.textContent = trainLabels[snapshot.map];
  if (trainCount) trainCount.textContent = `${trainDone}/${trainTotal}`;
  if (trainBar) trainBar.style.width = `${pct(trainDone, trainTotal)}%`;
}

function collectText(kind: CollectibleKind) {
  const labels: Record<CollectibleKind, string> = {
    lotus: "+ sen",
    "bamboo-token": "+ thẻ tre",
    "market-scroll": "+ sổ chợ",
    "river-pearl": "+ ngọc sông",
    "mountain-seal": "+ ấn trúc",
    "rice-sheaf": "+ bó lúa",
    "lantern-orb": "+ đèn lồng",
    incense: "+ nén hương",
    "tea-bud": "+ búp chè",
    fruit: "+ trái cây",
  };
  return labels[kind];
}

function showDialogue(speaker: string, line: string, hasNext: boolean) {
  const panel = document.querySelector<HTMLDivElement>("#dialogue");
  const speakerNode = document.querySelector<HTMLElement>("#dialogue-speaker");
  const textNode = document.querySelector<HTMLElement>("#dialogue-text");
  const hintNode = document.querySelector<HTMLElement>("#dialogue-hint");
  if (!panel || !speakerNode || !textNode || !hintNode) return;
  panel.hidden = false;
  speakerNode.textContent = speaker;
  textNode.textContent = line;
  hintNode.textContent = hasNext ? "Space/E để tiếp tục" : "Space/E để đóng";
}

function closeDialogue() {
  const panel = document.querySelector<HTMLDivElement>("#dialogue");
  if (panel) panel.hidden = true;
}

function updateSaveStatus(text: string) {
  const status = document.querySelector<HTMLElement>("#save-status");
  if (!status) return;
  status.textContent = text;
  window.setTimeout(() => {
    status.textContent = "Tự lưu";
  }, 1200);
}

function showSkillState(text: string) {
  const skill = document.querySelector<HTMLElement>("#staff-skill");
  const stateNode = document.querySelector<HTMLElement>("#skill-state");
  if (stateNode) stateNode.textContent = text;
  if (!skill) return;
  skill.classList.toggle("is-active", text !== "Sẵn sàng");
}

function showNotice(text: string) {
  const stack = document.querySelector<HTMLElement>("#notice-stack");
  if (!stack) return;
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = text;
  stack.prepend(notice);
  while (stack.children.length > 3) stack.lastElementChild?.remove();
  window.setTimeout(() => {
    notice.style.opacity = "0";
    notice.style.transform = "translateY(-4px)";
  }, 1700);
  window.setTimeout(() => notice.remove(), 2200);
}

function wireSaveUi(onReset: () => void) {
  document.querySelector<HTMLButtonElement>("#reset-save")?.addEventListener("click", onReset, { once: true });
}

function bindTouchControls() {
  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    const action = button.dataset.action as Action;
    const hold = (event: Event) => {
      event.preventDefault();
      pressedActions.add(action);
    };
    const release = (event: Event) => {
      event.preventDefault();
      if (action !== "interact" && action !== "strike") pressedActions.delete(action);
    };
    button.addEventListener("pointerdown", hold);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  });
}

bindTouchControls();

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: window.innerWidth,
  height: window.innerHeight,
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [VillageScene],
});
