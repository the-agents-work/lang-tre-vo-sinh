import Phaser from "phaser";
import "./style.css";
import { CollisionGrid } from "./collision";
import { MAPS, WORLD, rectContains, type CollectibleKind, type ExitDef, type MapDef, type TargetDef } from "./content/maps";
import { masterDialogue, type DialogueScript } from "./content/story";
import { GameState, type GameSnapshot, type MapId } from "./gameState";
import { clearSave, loadSave, writeSave } from "./save";

const FEET_OFFSET_Y = 22;
const COLLISION_CELL_SIZE = 8;

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

    this.add.image(0, 0, this.currentMap.backgroundKey).setOrigin(0, 0).setDisplaySize(WORLD.width, WORLD.height);
    this.blockers = this.physics.add.staticGroup();
    this.deepWater = this.physics.add.staticGroup();
    this.targets = this.physics.add.staticGroup();
    this.collectibles = this.physics.add.staticGroup();

    this.currentMap.blockers.forEach((rect) => this.addStaticRect(rect, this.blockers));
    if (!state.snapshot().canSwim) {
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
    return [-14, 0, 14].some((offsetX) => this.collisionGrid!.isBlocked(x + offsetX, footY));
  }

  private currentTerrain() {
    const feetX = this.player.x;
    const feetY = this.player.y + 22;
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

    const snapshot = state.snapshot();
    if (!exit.allowedPhases.includes(snapshot.phase)) {
      state.setPrompt(exit.blockedPrompt);
      updateHud(state.snapshot());
      return;
    }

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
      state.setPrompt(exit.allowedPhases.includes(snapshot.phase) ? "Đi tiếp theo đường đất..." : exit.blockedPrompt);
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
  const lotusCount = document.querySelector<HTMLElement>("#lotus-count");
  const dummyCount = document.querySelector<HTMLElement>("#dummy-count");
  const bambooCount = document.querySelector<HTMLElement>("#bamboo-count");
  const chapterLabel = document.querySelector<HTMLElement>("#chapter-label");
  const chapterCount = document.querySelector<HTMLElement>("#chapter-count");
  const skillName = document.querySelector<HTMLElement>("#staff-skill strong");
  const xpBar = document.querySelector<HTMLSpanElement>("#xp-bar");
  const lotusBar = document.querySelector<HTMLSpanElement>("#lotus-bar");
  const dummyBar = document.querySelector<HTMLSpanElement>("#dummy-bar");
  const bambooBar = document.querySelector<HTMLSpanElement>("#bamboo-bar");
  const chapterBar = document.querySelector<HTMLSpanElement>("#chapter-bar");

  const titleByPhase: Record<GameSnapshot["phase"], string> = {
    intro: "Nghe thầy Ba chỉ bài",
    "village-training": "Bài nhập môn sân làng",
    "bamboo-ready": "Mở đường sang bãi tre",
    "bamboo-training": "Luyện thân pháp bãi tre",
    "gate-open": "Quay về cổng đình",
    "market-ready": "Mở đường sang chợ huyện",
    "market-training": "Giữ việc chợ huyện",
    "river-ready": "Xuống bến sông",
    "river-training": "Bài giữ bước bến sông",
    "mountain-ready": "Lên Núi Trúc",
    "mountain-training": "Thử thách Núi Trúc",
    "chapter-complete": "Võ sinh làng Tre",
  };
  const terrainByState: Record<GameSnapshot["terrain"], string> = {
    normal: "Đất khô",
    "shallow-water": "Lội nước",
    "blocked-water": "Nước sâu",
  };

  if (title) title.textContent = titleByPhase[snapshot.phase];
  if (map) map.textContent = MAPS[snapshot.map].name;
  if (terrain) terrain.textContent = terrainByState[snapshot.terrain];
  if (prompt) prompt.textContent = snapshot.prompt;
  if (rankName) rankName.textContent = snapshot.rankName;
  if (levelCount) levelCount.textContent = `Cấp ${snapshot.level}`;
  if (attackCount) attackCount.textContent = `Gậy +${snapshot.attackPower}`;
  if (xpCount) xpCount.textContent = `${snapshot.xp}/${snapshot.xpToNext}`;
  if (lotusCount) lotusCount.textContent = `${snapshot.lotuses}/${snapshot.requiredLotuses}`;
  if (dummyCount) dummyCount.textContent = `${snapshot.dummies}/${snapshot.requiredDummies}`;
  if (bambooCount) bambooCount.textContent = `${snapshot.bambooTokens}/${snapshot.requiredBambooTokens}`;
  if (chapterLabel) chapterLabel.textContent = snapshot.chapterLabel;
  if (chapterCount) chapterCount.textContent = `${snapshot.chapterItems}/${snapshot.requiredChapterItems}`;
  if (skillName) skillName.textContent = `Gậy tre cấp ${snapshot.level}`;
  if (xpBar) xpBar.style.width = `${(snapshot.xp / snapshot.xpToNext) * 100}%`;
  if (lotusBar) lotusBar.style.width = `${(snapshot.lotuses / snapshot.requiredLotuses) * 100}%`;
  if (dummyBar) dummyBar.style.width = `${(snapshot.dummies / snapshot.requiredDummies) * 100}%`;
  if (bambooBar) bambooBar.style.width = `${(snapshot.bambooTokens / snapshot.requiredBambooTokens) * 100}%`;
  if (chapterBar) chapterBar.style.width = `${(snapshot.chapterItems / snapshot.requiredChapterItems) * 100}%`;
}

function collectText(kind: CollectibleKind) {
  const labels: Record<CollectibleKind, string> = {
    lotus: "+ sen",
    "bamboo-token": "+ thẻ tre",
    "market-scroll": "+ sổ chợ",
    "river-pearl": "+ ngọc sông",
    "mountain-seal": "+ ấn trúc",
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
