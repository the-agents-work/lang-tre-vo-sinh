import type { CollisionShapes } from "../collision";
import type { MapId, QuestPhase } from "../gameState";
import {
  BAMBOO_TILEMAP,
  FLOATMARKET_TILEMAP,
  MARKET_TILEMAP,
  MOUNTAIN_TILEMAP,
  OLDTOWN_TILEMAP,
  PAGODA_TILEMAP,
  RIVER_TILEMAP,
  TEAHILL_TILEMAP,
  TERRACE_TILEMAP,
  VILLAGE_TILEMAP,
  type TileMapDef,
} from "./tilemaps";

export const WORLD = {
  width: 1440,
  height: 920,
} as const;

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type CollectibleKind =
  | "lotus"
  | "bamboo-token"
  | "market-scroll"
  | "river-pearl"
  | "mountain-seal"
  | "rice-sheaf"
  | "lantern-orb"
  | "incense"
  | "tea-bud"
  | "fruit";
export type TargetKind =
  | "dummy"
  | "bamboo-post"
  | "market-post"
  | "river-post"
  | "mountain-post"
  | "terrace-post"
  | "oldtown-post"
  | "pagoda-post"
  | "tea-post"
  | "chonoi-post";
export type TerrainKind = "shallow-water" | "deep-water";

export type CollectibleDef = Point & {
  id: string;
  kind: CollectibleKind;
};

export type TargetDef = Point & {
  id: string;
  kind: TargetKind;
  maxHp: number;
  recoveryPerSecond: number;
  recoveryDelayMs: number;
};

export type ExitDef = Rect & {
  id: string;
  label: string;
  to: MapId;
  spawn: Point;
  allowedPhases: QuestPhase[];
  blockedPrompt: string;
};

export type TerrainDef = Rect & {
  id: string;
  kind: TerrainKind;
  prompt: string;
  speedMultiplier: number;
};

export type MapDef = {
  id: MapId;
  name: string;
  backgroundKey: string;
  backgroundUrl: string;
  tilemap?: TileMapDef;
  collisionMaskKey?: string;
  collisionMaskUrl?: string;
  start: Point;
  fallbackSpawn: Point;
  playerDepth: number;
  blockers: Rect[];
  shallowTerrain: TerrainDef[];
  deepWater: TerrainDef[];
  exits: ExitDef[];
  npc?: Point & {
    id: "master";
    spriteKey: "master-npc";
  };
  gate?: Rect & {
    id: "festival-gate";
  };
  collectibles: CollectibleDef[];
  targets: TargetDef[];
  collisionShapes?: CollisionShapes;
};

const villageBlockers: Rect[] = [
  { x: 706, y: 92, width: 340, height: 180 },
  { x: 34, y: 460, width: 68, height: 920 },
  { x: 1406, y: 460, width: 68, height: 920 },
  { x: 720, y: 18, width: 1440, height: 36 },
  { x: 360, y: 646, width: 310, height: 120 },
  { x: 522, y: 680, width: 210, height: 160 },
  { x: 267, y: 788, width: 310, height: 170 },
  { x: 503, y: 827, width: 245, height: 185 },
  { x: 984, y: 706, width: 250, height: 140 },
  { x: 1236, y: 716, width: 305, height: 150 },
  { x: 1018, y: 848, width: 305, height: 150 },
  { x: 1292, y: 846, width: 292, height: 150 },
  { x: 300, y: 914, width: 600, height: 20 },
  { x: 1140, y: 914, width: 600, height: 20 },
];

const bambooBlockers: Rect[] = [
  { x: 50, y: 460, width: 100, height: 920 },
  { x: 1390, y: 460, width: 100, height: 920 },
  { x: 720, y: 18, width: 1440, height: 36 },
  { x: 346, y: 152, width: 255, height: 115 },
  { x: 1068, y: 120, width: 290, height: 110 },
  { x: 364, y: 730, width: 280, height: 120 },
  { x: 1090, y: 755, width: 310, height: 120 },
  { x: 300, y: 914, width: 600, height: 20 },
  { x: 1140, y: 914, width: 600, height: 20 },
];

const marketBlockers: Rect[] = [
  { x: 34, y: 460, width: 68, height: 920 },
  { x: 1406, y: 460, width: 68, height: 920 },
  { x: 720, y: 18, width: 1440, height: 36 },
  { x: 720, y: 914, width: 1440, height: 20 },
  { x: 290, y: 178, width: 380, height: 126 },
  { x: 1044, y: 172, width: 250, height: 150 },
  { x: 1265, y: 330, width: 260, height: 160 },
  { x: 248, y: 526, width: 360, height: 148 },
  { x: 1158, y: 732, width: 360, height: 180 },
  { x: 1324, y: 516, width: 260, height: 150 },
  { x: 95, y: 776, width: 210, height: 210 },
];

const riverBlockers: Rect[] = [
  { x: 34, y: 460, width: 68, height: 920 },
  { x: 720, y: 18, width: 1440, height: 36 },
  { x: 1018, y: 540, width: 650, height: 650 },
  { x: 690, y: 835, width: 950, height: 170 },
  { x: 168, y: 760, width: 300, height: 260 },
  { x: 1230, y: 230, width: 330, height: 330 },
  { x: 526, y: 392, width: 120, height: 96 },
];

const mountainBlockers: Rect[] = [
  { x: 34, y: 460, width: 68, height: 920 },
  { x: 1406, y: 460, width: 68, height: 920 },
  { x: 720, y: 18, width: 1440, height: 36 },
  { x: 720, y: 914, width: 1440, height: 20 },
  { x: 170, y: 290, width: 280, height: 400 },
  { x: 1230, y: 250, width: 330, height: 420 },
  { x: 1140, y: 690, width: 420, height: 280 },
  { x: 840, y: 116, width: 230, height: 155 },
  { x: 1076, y: 426, width: 250, height: 160 },
];

const AFTER_BAMBOO: QuestPhase[] = [
  "bamboo-training",
  "gate-open",
  "market-ready",
  "market-training",
  "river-ready",
  "river-training",
  "mountain-ready",
  "mountain-training",
  "chapter-complete",
];

const AFTER_MARKET: QuestPhase[] = [
  "market-ready",
  "market-training",
  "river-ready",
  "river-training",
  "mountain-ready",
  "mountain-training",
  "chapter-complete",
];

const AFTER_RIVER: QuestPhase[] = [
  "river-ready",
  "river-training",
  "mountain-ready",
  "mountain-training",
  "chapter-complete",
];

const AFTER_MOUNTAIN: QuestPhase[] = ["mountain-ready", "mountain-training", "chapter-complete"];

export const MAPS: Record<MapId, MapDef> = {
  village: {
    id: "village",
    name: "Làng Tre",
    backgroundKey: "map-village",
    backgroundUrl: "/assets/maps/village.jpg",
    tilemap: VILLAGE_TILEMAP,
    collisionMaskKey: "collision-village",
    collisionMaskUrl: "/assets/collision/village.svg",
    start: { x: 735, y: 270 },
    fallbackSpawn: { x: 700, y: 780 },
    playerDepth: 7,
    blockers: villageBlockers,
    shallowTerrain: [
      {
        id: "pond-bank",
        kind: "shallow-water",
        x: 1118,
        y: 412,
        width: 520,
        height: 355,
        speedMultiplier: 0.42,
        prompt: "Đang lội mép ao: bước nặng, nước kéo chân. Vào sâu hơn sẽ bị chặn.",
      },
    ],
    deepWater: [
      {
        id: "lotus-pond-deep",
        kind: "deep-water",
        x: 1128,
        y: 410,
        width: 405,
        height: 245,
        speedMultiplier: 0,
        prompt: "Ao sen sâu. Chưa học bơi thì không thể đi thẳng xuống nước.",
      },
      {
        id: "field-canal",
        kind: "deep-water",
        x: 320,
        y: 704,
        width: 390,
        height: 72,
        speedMultiplier: 0,
        prompt: "Mương ruộng trơn. Tìm cầu tre hoặc quay lại đường đất.",
      },
    ],
    exits: [
      {
        id: "south-bamboo-trail",
        label: "Lối xuống bãi tre",
        x: 720,
        y: 885,
        width: 240,
        height: 70,
        to: "bamboo",
        spawn: { x: 720, y: 155 },
        allowedPhases: ["bamboo-ready", ...AFTER_BAMBOO],
        blockedPrompt: "Thầy Ba sẽ cho sang bãi tre sau khi con xong bài sân làng.",
      },
      {
        id: "east-market-road",
        label: "Đường sang chợ huyện",
        x: 1390,
        y: 486,
        width: 90,
        height: 260,
        to: "market",
        spawn: { x: 150, y: 472 },
        allowedPhases: AFTER_MARKET,
        blockedPrompt: "Cổng hội chưa mở. Hoàn thành bài bãi tre rồi về đình gặp thầy Ba.",
      },
      {
        id: "west-pagoda-trail",
        label: "Sang chùa làng",
        x: 24,
        y: 420,
        width: 80,
        height: 150,
        to: "chua",
        spawn: { x: 1360, y: 460 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    npc: { id: "master", spriteKey: "master-npc", x: 724, y: 238 },
    gate: { id: "festival-gate", x: 704, y: 206, width: 190, height: 70 },
    collectibles: [
      // Sen mọc dưới ao — thả trong vành nước nông (chân nhân vật luôn ở ô nước)
      { id: "lotus-1", kind: "lotus", x: 1140, y: 180 },
      { id: "lotus-2", kind: "lotus", x: 1340, y: 180 },
      { id: "lotus-3", kind: "lotus", x: 1140, y: 380 },
      { id: "lotus-4", kind: "lotus", x: 1340, y: 380 },
      { id: "lotus-5", kind: "lotus", x: 1220, y: 140 },
    ],
    targets: [
      { id: "dummy-1", kind: "dummy", x: 332, y: 330, maxHp: 3, recoveryPerSecond: 0.55, recoveryDelayMs: 1600 },
      { id: "dummy-2", kind: "dummy", x: 430, y: 348, maxHp: 3, recoveryPerSecond: 0.55, recoveryDelayMs: 1600 },
      { id: "dummy-3", kind: "dummy", x: 535, y: 338, maxHp: 3, recoveryPerSecond: 0.55, recoveryDelayMs: 1600 },
      { id: "dummy-4", kind: "dummy", x: 432, y: 438, maxHp: 3, recoveryPerSecond: 0.55, recoveryDelayMs: 1600 },
    ],
    collisionShapes: {
      ellipses: [
        { x: 1128, y: 410, rx: 225, ry: 145 },
        { x: 320, y: 704, rx: 210, ry: 42 },
      ],
      polygons: [
        {
          points: [
            { x: 120, y: 600 },
            { x: 520, y: 610 },
            { x: 528, y: 730 },
            { x: 84, y: 718 },
          ],
        },
        {
          points: [
            { x: 108, y: 728 },
            { x: 542, y: 738 },
            { x: 538, y: 910 },
            { x: 70, y: 908 },
          ],
        },
        {
          points: [
            { x: 910, y: 608 },
            { x: 1348, y: 604 },
            { x: 1352, y: 738 },
            { x: 902, y: 736 },
          ],
        },
        {
          points: [
            { x: 908, y: 748 },
            { x: 1352, y: 748 },
            { x: 1356, y: 910 },
            { x: 906, y: 910 },
          ],
        },
      ],
    },
  },
  bamboo: {
    id: "bamboo",
    name: "Bãi Tre",
    backgroundKey: "map-bamboo",
    backgroundUrl: "/assets/maps/bamboo.jpg",
    tilemap: BAMBOO_TILEMAP,
    start: { x: 720, y: 155 },
    fallbackSpawn: { x: 720, y: 155 },
    playerDepth: 7,
    blockers: bambooBlockers,
    shallowTerrain: [
      {
        id: "pond-edge",
        kind: "shallow-water",
        x: 220,
        y: 603,
        width: 260,
        height: 130,
        speedMultiplier: 0.62,
        prompt: "Mép hồ trong bãi tre trơn và chậm. Tránh bước sâu nếu chưa học bơi.",
      },
    ],
    deepWater: [
      {
        id: "bamboo-pond-deep",
        kind: "deep-water",
        x: 185,
        y: 632,
        width: 210,
        height: 110,
        speedMultiplier: 0,
        prompt: "Hồ bãi tre sâu, chưa có kỹ năng bơi.",
      },
    ],
    exits: [
      {
        id: "north-village-trail",
        label: "Đường về làng",
        x: 720,
        y: 78,
        width: 250,
        height: 140,
        to: "village",
        spawn: { x: 700, y: 780 },
        allowedPhases: AFTER_BAMBOO,
        blockedPrompt: "Đường về làng ở ngay phía bắc.",
      },
    ],
    collectibles: [
      { id: "bamboo-token-1", kind: "bamboo-token", x: 430, y: 260 },
      { id: "bamboo-token-2", kind: "bamboo-token", x: 785, y: 305 },
      { id: "bamboo-token-3", kind: "bamboo-token", x: 1025, y: 620 },
    ],
    targets: [
      { id: "post-1", kind: "bamboo-post", x: 820, y: 318, maxHp: 4, recoveryPerSecond: 0.65, recoveryDelayMs: 1400 },
      { id: "post-2", kind: "bamboo-post", x: 946, y: 410, maxHp: 4, recoveryPerSecond: 0.65, recoveryDelayMs: 1400 },
      { id: "post-3", kind: "bamboo-post", x: 1095, y: 455, maxHp: 4, recoveryPerSecond: 0.65, recoveryDelayMs: 1400 },
    ],
    collisionShapes: {
      ellipses: [{ x: 185, y: 632, rx: 132, ry: 82 }],
      polygons: [
        {
          points: [
            { x: 92, y: 104 },
            { x: 360, y: 98 },
            { x: 310, y: 292 },
            { x: 76, y: 334 },
          ],
        },
        {
          points: [
            { x: 1112, y: 118 },
            { x: 1360, y: 104 },
            { x: 1362, y: 340 },
            { x: 1190, y: 310 },
          ],
        },
      ],
    },
  },
  market: {
    id: "market",
    name: "Chợ Huyện",
    backgroundKey: "map-market",
    backgroundUrl: "/assets/maps/market.jpg",
    tilemap: MARKET_TILEMAP,
    start: { x: 150, y: 472 },
    fallbackSpawn: { x: 150, y: 472 },
    playerDepth: 7,
    blockers: marketBlockers,
    shallowTerrain: [
      {
        id: "market-pond-edge",
        kind: "shallow-water",
        x: 1325,
        y: 218,
        width: 210,
        height: 150,
        speedMultiplier: 0.55,
        prompt: "Mép ao sau chợ trơn. Đi chậm kẻo trượt xuống nước.",
      },
      {
        id: "market-ditch",
        kind: "shallow-water",
        x: 1310,
        y: 840,
        width: 230,
        height: 95,
        speedMultiplier: 0.62,
        prompt: "Mương lúa cuối chợ làm bước chân nặng hơn.",
      },
    ],
    deepWater: [
      {
        id: "market-pond-deep",
        kind: "deep-water",
        x: 1350,
        y: 165,
        width: 230,
        height: 185,
        speedMultiplier: 0,
        prompt: "Ao sau chợ sâu. Chưa học bơi thì tránh vòng qua đường đất.",
      },
      {
        id: "market-canal",
        kind: "deep-water",
        x: 1325,
        y: 875,
        width: 250,
        height: 90,
        speedMultiplier: 0,
        prompt: "Mương chợ nước sâu, không thể băng ngang.",
      },
    ],
    exits: [
      {
        id: "west-village-road",
        label: "Đường về làng",
        x: 55,
        y: 470,
        width: 110,
        height: 260,
        to: "village",
        spawn: { x: 1335, y: 486 },
        allowedPhases: AFTER_MARKET,
        blockedPrompt: "Đường về làng ở phía tây.",
      },
      {
        id: "east-river-road",
        label: "Lối xuống bến sông",
        x: 1388,
        y: 508,
        width: 95,
        height: 245,
        to: "river",
        spawn: { x: 135, y: 456 },
        allowedPhases: AFTER_RIVER,
        blockedPrompt: "Giúp đủ việc chợ và đạt cấp 3 rồi mới được xuống bến sông.",
      },
      {
        id: "north-oldtown-road",
        label: "Sang phố cổ Hội An",
        x: 660,
        y: 30,
        width: 220,
        height: 70,
        to: "oldtown",
        spawn: { x: 160, y: 400 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "market-scroll-1", kind: "market-scroll", x: 366, y: 198 },
      { id: "market-scroll-2", kind: "market-scroll", x: 1036, y: 286 },
      { id: "market-scroll-3", kind: "market-scroll", x: 446, y: 706 },
      { id: "market-scroll-4", kind: "market-scroll", x: 1120, y: 688 },
    ],
    targets: [
      { id: "market-post-1", kind: "market-post", x: 318, y: 282, maxHp: 5, recoveryPerSecond: 0.78, recoveryDelayMs: 1350 },
      { id: "market-post-2", kind: "market-post", x: 430, y: 294, maxHp: 5, recoveryPerSecond: 0.78, recoveryDelayMs: 1350 },
      { id: "market-post-3", kind: "market-post", x: 540, y: 560, maxHp: 5, recoveryPerSecond: 0.78, recoveryDelayMs: 1350 },
      { id: "market-post-4", kind: "market-post", x: 760, y: 310, maxHp: 5, recoveryPerSecond: 0.78, recoveryDelayMs: 1350 },
    ],
    collisionShapes: {
      ellipses: [
        { x: 1350, y: 165, rx: 138, ry: 94 },
        { x: 1325, y: 875, rx: 145, ry: 55 },
      ],
      polygons: [
        {
          points: [
            { x: 1038, y: 690 },
            { x: 1360, y: 680 },
            { x: 1360, y: 918 },
            { x: 972, y: 918 },
          ],
        },
        {
          points: [
            { x: 176, y: 110 },
            { x: 500, y: 118 },
            { x: 520, y: 256 },
            { x: 160, y: 276 },
          ],
        },
      ],
    },
  },
  river: {
    id: "river",
    name: "Bến Sông",
    backgroundKey: "map-river",
    backgroundUrl: "/assets/maps/river.jpg",
    tilemap: RIVER_TILEMAP,
    start: { x: 135, y: 456 },
    fallbackSpawn: { x: 135, y: 456 },
    playerDepth: 7,
    blockers: riverBlockers,
    shallowTerrain: [
      {
        id: "river-muddy-bank",
        kind: "shallow-water",
        x: 740,
        y: 650,
        width: 390,
        height: 165,
        speedMultiplier: 0.48,
        prompt: "Bờ bùn bến sông rất trơn. Giữ bước sát đường khô.",
      },
      {
        id: "river-lotus-bank",
        kind: "shallow-water",
        x: 205,
        y: 735,
        width: 280,
        height: 170,
        speedMultiplier: 0.52,
        prompt: "Nước ven đầm sen cạn nhưng làm chậm thân pháp.",
      },
    ],
    deepWater: [
      {
        id: "main-river-deep",
        kind: "deep-water",
        x: 1052,
        y: 560,
        width: 720,
        height: 650,
        speedMultiplier: 0,
        prompt: "Dòng sông sâu, chưa đủ bài thủy bộ thì không thể lội qua.",
      },
      {
        id: "lower-river-deep",
        kind: "deep-water",
        x: 690,
        y: 838,
        width: 1120,
        height: 168,
        speedMultiplier: 0,
        prompt: "Nước dưới bến chảy mạnh. Đi cầu hoặc vòng theo bờ đất.",
      },
      {
        id: "left-lotus-deep",
        kind: "deep-water",
        x: 160,
        y: 780,
        width: 290,
        height: 230,
        speedMultiplier: 0,
        prompt: "Đầm sen sâu. Đừng băng qua mặt nước.",
      },
    ],
    exits: [
      {
        id: "west-market-road",
        label: "Đường về chợ",
        x: 56,
        y: 456,
        width: 110,
        height: 245,
        to: "market",
        spawn: { x: 1335, y: 508 },
        allowedPhases: AFTER_RIVER,
        blockedPrompt: "Đường về chợ ở phía tây.",
      },
      {
        id: "north-mountain-trail",
        label: "Lối lên Núi Trúc",
        x: 650,
        y: 74,
        width: 260,
        height: 130,
        to: "mountain",
        spawn: { x: 642, y: 780 },
        allowedPhases: AFTER_MOUNTAIN,
        blockedPrompt: "Cần đủ ngọc sông và cấp 5 trước khi lên Núi Trúc.",
      },
    ],
    collectibles: [
      // Ngọc sông mò dưới mép nước nông sát bờ sông
      { id: "river-pearl-1", kind: "river-pearl", x: 780, y: 260 },
      { id: "river-pearl-2", kind: "river-pearl", x: 820, y: 420 },
      { id: "river-pearl-3", kind: "river-pearl", x: 820, y: 580 },
      { id: "river-pearl-4", kind: "river-pearl", x: 900, y: 660 },
    ],
    targets: [
      { id: "river-post-1", kind: "river-post", x: 330, y: 282, maxHp: 6, recoveryPerSecond: 0.9, recoveryDelayMs: 1250 },
      { id: "river-post-2", kind: "river-post", x: 528, y: 525, maxHp: 6, recoveryPerSecond: 0.9, recoveryDelayMs: 1250 },
      { id: "river-post-3", kind: "river-post", x: 712, y: 382, maxHp: 6, recoveryPerSecond: 0.9, recoveryDelayMs: 1250 },
      { id: "river-post-4", kind: "river-post", x: 820, y: 690, maxHp: 6, recoveryPerSecond: 0.9, recoveryDelayMs: 1250 },
    ],
    collisionShapes: {
      ellipses: [
        { x: 1035, y: 548, rx: 392, ry: 318 },
        { x: 170, y: 780, rx: 180, ry: 128 },
      ],
      polygons: [
        {
          points: [
            { x: 300, y: 720 },
            { x: 1120, y: 720 },
            { x: 1210, y: 920 },
            { x: 180, y: 920 },
          ],
        },
        {
          points: [
            { x: 1200, y: 110 },
            { x: 1440, y: 120 },
            { x: 1440, y: 590 },
            { x: 1080, y: 480 },
          ],
        },
      ],
    },
  },
  mountain: {
    id: "mountain",
    name: "Núi Trúc",
    backgroundKey: "map-mountain",
    backgroundUrl: "/assets/maps/mountain.jpg",
    tilemap: MOUNTAIN_TILEMAP,
    start: { x: 642, y: 780 },
    fallbackSpawn: { x: 642, y: 780 },
    playerDepth: 7,
    blockers: mountainBlockers,
    shallowTerrain: [
      {
        id: "misty-edge",
        kind: "shallow-water",
        x: 138,
        y: 660,
        width: 260,
        height: 210,
        speedMultiplier: 0.58,
        prompt: "Mép núi phủ sương, bước chân chậm lại để khỏi trượt.",
      },
    ],
    deepWater: [
      {
        id: "cliff-mist",
        kind: "deep-water",
        x: 170,
        y: 655,
        width: 300,
        height: 390,
        speedMultiplier: 0,
        prompt: "Vực sương sâu, không thể bước khỏi đường đá.",
      },
      {
        id: "right-cliff",
        kind: "deep-water",
        x: 1330,
        y: 600,
        width: 255,
        height: 620,
        speedMultiplier: 0,
        prompt: "Vách núi dựng đứng. Bám đường lát đá mà đi.",
      },
    ],
    exits: [
      {
        id: "south-river-trail",
        label: "Đường xuống bến sông",
        x: 642,
        y: 886,
        width: 290,
        height: 95,
        to: "river",
        spawn: { x: 650, y: 165 },
        allowedPhases: AFTER_MOUNTAIN,
        blockedPrompt: "Đường xuống bến sông ở phía nam.",
      },
      {
        id: "north-terrace-trail",
        label: "Lối lên ruộng bậc thang",
        x: 500,
        y: 30,
        width: 200,
        height: 70,
        to: "terrace",
        spawn: { x: 720, y: 800 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "mountain-seal-1", kind: "mountain-seal", x: 436, y: 312 },
      { id: "mountain-seal-2", kind: "mountain-seal", x: 622, y: 266 },
      { id: "mountain-seal-3", kind: "mountain-seal", x: 908, y: 350 },
      { id: "mountain-seal-4", kind: "mountain-seal", x: 714, y: 622 },
      { id: "mountain-seal-5", kind: "mountain-seal", x: 484, y: 734 },
    ],
    targets: [
      { id: "mountain-post-1", kind: "mountain-post", x: 420, y: 388, maxHp: 8, recoveryPerSecond: 1.05, recoveryDelayMs: 1150 },
      { id: "mountain-post-2", kind: "mountain-post", x: 555, y: 368, maxHp: 8, recoveryPerSecond: 1.05, recoveryDelayMs: 1150 },
      { id: "mountain-post-3", kind: "mountain-post", x: 690, y: 382, maxHp: 8, recoveryPerSecond: 1.05, recoveryDelayMs: 1150 },
      { id: "mountain-post-4", kind: "mountain-post", x: 835, y: 480, maxHp: 8, recoveryPerSecond: 1.05, recoveryDelayMs: 1150 },
      { id: "mountain-post-5", kind: "mountain-post", x: 600, y: 600, maxHp: 8, recoveryPerSecond: 1.05, recoveryDelayMs: 1150 },
    ],
    collisionShapes: {
      ellipses: [
        { x: 170, y: 655, rx: 180, ry: 255 },
        { x: 1330, y: 600, rx: 170, ry: 310 },
      ],
      polygons: [
        {
          points: [
            { x: 760, y: 64 },
            { x: 1070, y: 72 },
            { x: 1065, y: 250 },
            { x: 735, y: 248 },
          ],
        },
        {
          points: [
            { x: 1010, y: 356 },
            { x: 1208, y: 365 },
            { x: 1198, y: 560 },
            { x: 958, y: 552 },
          ],
        },
      ],
    },
  },
  terrace: {
    id: "terrace",
    name: "Ruộng Bậc Thang",
    backgroundKey: "map-terrace",
    backgroundUrl: "/assets/maps/mountain.jpg",
    tilemap: TERRACE_TILEMAP,
    start: { x: 720, y: 800 },
    fallbackSpawn: { x: 720, y: 800 },
    playerDepth: 7,
    blockers: [],
    shallowTerrain: [],
    deepWater: [],
    exits: [
      {
        id: "south-mountain-trail",
        label: "Xuống Núi Trúc",
        x: 720,
        y: 890,
        width: 200,
        height: 80,
        to: "mountain",
        spawn: { x: 500, y: 90 },
        allowedPhases: [],
        blockedPrompt: "",
      },
      {
        id: "west-teahill-trail",
        label: "Sang đồi chè",
        x: 24,
        y: 150,
        width: 80,
        height: 110,
        to: "doiche",
        spawn: { x: 1360, y: 150 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "rice-sheaf-1", kind: "rice-sheaf", x: 200, y: 150 },
      { id: "rice-sheaf-2", kind: "rice-sheaf", x: 1100, y: 310 },
      { id: "rice-sheaf-3", kind: "rice-sheaf", x: 300, y: 470 },
      { id: "rice-sheaf-4", kind: "rice-sheaf", x: 1040, y: 630 },
    ],
    targets: [
      { id: "terrace-post-1", kind: "terrace-post", x: 520, y: 150, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
      { id: "terrace-post-2", kind: "terrace-post", x: 760, y: 470, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
      { id: "terrace-post-3", kind: "terrace-post", x: 900, y: 630, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
    ],
  },
  oldtown: {
    id: "oldtown",
    name: "Phố Cổ Hội An",
    backgroundKey: "map-oldtown",
    backgroundUrl: "/assets/maps/market.jpg",
    tilemap: OLDTOWN_TILEMAP,
    start: { x: 160, y: 400 },
    fallbackSpawn: { x: 160, y: 400 },
    playerDepth: 7,
    blockers: [],
    shallowTerrain: [],
    deepWater: [],
    exits: [
      {
        id: "west-market-road2",
        label: "Đường về chợ huyện",
        x: 30,
        y: 400,
        width: 90,
        height: 140,
        to: "market",
        spawn: { x: 660, y: 140 },
        allowedPhases: [],
        blockedPrompt: "",
      },
      {
        id: "east-floatmarket-road",
        label: "Ra chợ nổi",
        x: 1416,
        y: 420,
        width: 80,
        height: 150,
        to: "chonoi",
        spawn: { x: 80, y: 460 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "lantern-orb-1", kind: "lantern-orb", x: 660, y: 200 },
      { id: "lantern-orb-2", kind: "lantern-orb", x: 300, y: 420 },
      { id: "lantern-orb-3", kind: "lantern-orb", x: 1000, y: 420 },
      { id: "lantern-orb-4", kind: "lantern-orb", x: 660, y: 640 },
    ],
    targets: [
      { id: "oldtown-post-1", kind: "oldtown-post", x: 460, y: 420, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
      { id: "oldtown-post-2", kind: "oldtown-post", x: 860, y: 420, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
      { id: "oldtown-post-3", kind: "oldtown-post", x: 660, y: 320, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
    ],
  },
  chua: {
    id: "chua",
    name: "Chùa Làng",
    backgroundKey: "map-chua",
    backgroundUrl: "/assets/maps/village.jpg",
    tilemap: PAGODA_TILEMAP,
    start: { x: 1360, y: 460 },
    fallbackSpawn: { x: 1360, y: 460 },
    playerDepth: 7,
    blockers: [],
    shallowTerrain: [],
    deepWater: [],
    exits: [
      {
        id: "east-village-trail",
        label: "Về làng Tre",
        x: 1416,
        y: 460,
        width: 80,
        height: 150,
        to: "village",
        spawn: { x: 70, y: 420 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "incense-1", kind: "incense", x: 300, y: 460 },
      { id: "incense-2", kind: "incense", x: 1100, y: 460 },
      { id: "incense-3", kind: "incense", x: 660, y: 320 },
      { id: "incense-4", kind: "incense", x: 660, y: 720 },
    ],
    targets: [
      { id: "pagoda-post-1", kind: "pagoda-post", x: 500, y: 460, maxHp: 7, recoveryPerSecond: 0.9, recoveryDelayMs: 1300 },
      { id: "pagoda-post-2", kind: "pagoda-post", x: 820, y: 460, maxHp: 7, recoveryPerSecond: 0.9, recoveryDelayMs: 1300 },
      { id: "pagoda-post-3", kind: "pagoda-post", x: 660, y: 600, maxHp: 7, recoveryPerSecond: 0.9, recoveryDelayMs: 1300 },
    ],
  },
  doiche: {
    id: "doiche",
    name: "Đồi Chè",
    backgroundKey: "map-doiche",
    backgroundUrl: "/assets/maps/mountain.jpg",
    tilemap: TEAHILL_TILEMAP,
    start: { x: 1360, y: 150 },
    fallbackSpawn: { x: 1360, y: 150 },
    playerDepth: 7,
    blockers: [],
    shallowTerrain: [],
    deepWater: [],
    exits: [
      {
        id: "east-terrace-trail",
        label: "Về ruộng bậc thang",
        x: 1416,
        y: 150,
        width: 80,
        height: 110,
        to: "terrace",
        spawn: { x: 70, y: 150 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "tea-bud-1", kind: "tea-bud", x: 200, y: 150 },
      { id: "tea-bud-2", kind: "tea-bud", x: 1100, y: 310 },
      { id: "tea-bud-3", kind: "tea-bud", x: 300, y: 470 },
      { id: "tea-bud-4", kind: "tea-bud", x: 1040, y: 630 },
    ],
    targets: [
      { id: "tea-post-1", kind: "tea-post", x: 520, y: 150, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
      { id: "tea-post-2", kind: "tea-post", x: 760, y: 470, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
      { id: "tea-post-3", kind: "tea-post", x: 900, y: 630, maxHp: 7, recoveryPerSecond: 0.95, recoveryDelayMs: 1250 },
    ],
  },
  chonoi: {
    id: "chonoi",
    name: "Chợ Nổi",
    backgroundKey: "map-chonoi",
    backgroundUrl: "/assets/maps/river.jpg",
    tilemap: FLOATMARKET_TILEMAP,
    start: { x: 80, y: 460 },
    fallbackSpawn: { x: 80, y: 460 },
    playerDepth: 7,
    blockers: [],
    shallowTerrain: [],
    deepWater: [],
    exits: [
      {
        id: "west-oldtown-road",
        label: "Về phố cổ",
        x: 24,
        y: 460,
        width: 80,
        height: 130,
        to: "oldtown",
        spawn: { x: 1360, y: 420 },
        allowedPhases: [],
        blockedPrompt: "",
      },
    ],
    collectibles: [
      { id: "fruit-1", kind: "fruit", x: 660, y: 200 },
      { id: "fruit-2", kind: "fruit", x: 300, y: 460 },
      { id: "fruit-3", kind: "fruit", x: 1000, y: 460 },
      { id: "fruit-4", kind: "fruit", x: 660, y: 760 },
    ],
    targets: [
      { id: "chonoi-post-1", kind: "chonoi-post", x: 460, y: 460, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
      { id: "chonoi-post-2", kind: "chonoi-post", x: 860, y: 460, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
      { id: "chonoi-post-3", kind: "chonoi-post", x: 660, y: 360, maxHp: 8, recoveryPerSecond: 1.0, recoveryDelayMs: 1200 },
    ],
  },
};

export function rectContains(rect: Rect, x: number, y: number) {
  return (
    x >= rect.x - rect.width / 2 &&
    x <= rect.x + rect.width / 2 &&
    y >= rect.y - rect.height / 2 &&
    y <= rect.y + rect.height / 2
  );
}
