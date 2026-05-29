import type { Rect } from "./maps";

export const TILE_SIZE = 40;
export const TILE_COLS = 36;
export const TILE_ROWS = 23;

export type TileKind =
  | "grass"
  | "path"
  | "courtyard"
  | "water"
  | "shallow-water"
  | "rice"
  | "fence"
  | "bamboo"
  | "temple"
  | "stall"
  | "rock"
  | "bridge"
  | "ricegold"
  | "shophouse"
  | "tea";

export type TileLayer = TileKind[];
export type DetailLayer = Array<TileKind | undefined>;

export type TileMapDef = {
  cols: number;
  rows: number;
  tileSize: number;
  ground: TileLayer;
  detail: DetailLayer;
};

const BLOCKED_TILES = new Set<TileKind>(["water", "rice", "fence", "bamboo", "temple", "stall", "rock", "ricegold", "shophouse", "tea"]);

export const VILLAGE_TILEMAP = createVillageTilemap();
export const BAMBOO_TILEMAP = createBambooTilemap();
export const MARKET_TILEMAP = createMarketTilemap();
export const RIVER_TILEMAP = createRiverTilemap();
export const MOUNTAIN_TILEMAP = createMountainTilemap();
export const TERRACE_TILEMAP = createTerraceTilemap();
export const OLDTOWN_TILEMAP = createOldtownTilemap();
export const PAGODA_TILEMAP = createPagodaTilemap();
export const TEAHILL_TILEMAP = createTeahillTilemap();
export const FLOATMARKET_TILEMAP = createFloatmarketTilemap();

export function tileAtPixel(tilemap: TileMapDef, x: number, y: number): TileKind {
  const col = Math.floor(x / tilemap.tileSize);
  const row = Math.floor(y / tilemap.tileSize);
  if (col < 0 || col >= tilemap.cols || row < 0 || row >= tilemap.rows) return "fence";
  return tilemap.detail[index(tilemap, col, row)] ?? tilemap.ground[index(tilemap, col, row)];
}

export function tileBlocks(tile: TileKind) {
  return BLOCKED_TILES.has(tile);
}

export function tileCollisionRects(tilemap: TileMapDef): Rect[] {
  const rects: Rect[] = [];
  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.cols; col++) {
      const tile = tilemap.detail[index(tilemap, col, row)] ?? tilemap.ground[index(tilemap, col, row)];
      if (!tileBlocks(tile)) continue;
      rects.push({
        x: col * tilemap.tileSize + tilemap.tileSize / 2,
        y: row * tilemap.tileSize + tilemap.tileSize / 2,
        width: tilemap.tileSize,
        height: tilemap.tileSize,
      });
    }
  }
  return rects;
}

export function tileTerrainAt(tilemap: TileMapDef, x: number, y: number) {
  const tile = tileAtPixel(tilemap, x, y);
  if (tile === "shallow-water") {
    return {
      kind: "shallow-water" as const,
      speedMultiplier: 0.56,
      prompt: "Đang lội mép nước: bước chậm lại, tránh vùng nước sâu.",
    };
  }
  return undefined;
}

function createVillageTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  // Đình + sân đình
  paintRect(map, ground, 15, 1, 8, 5, "temple");
  paintRect(map, ground, 15, 6, 8, 2, "courtyard");

  // Đường: trục dọc xuống cổng nam + nhánh trái (sân tập) + nhánh phải (ao/cổng đông)
  paintRect(map, ground, 17, 6, 4, 16, "path");
  paintRect(map, ground, 2, 9, 16, 3, "path");
  paintRect(map, ground, 21, 8, 7, 4, "path");
  paintRect(map, ground, 21, 11, 14, 2, "path");

  // Sân tập (nền đất nện) — chứa các cọc luyện
  paintRect(map, ground, 4, 8, 11, 6, "courtyard");

  // Đồng lúa: đã chặn lối nên KHÔNG rào quanh
  paintRect(map, ground, 2, 16, 12, 5, "rice");
  paintRect(map, ground, 22, 15, 12, 6, "rice");

  // Ao sen: vành nước nông DÀY 2 ô để lội vào là thấy nước bao quanh; lõi sâu ở giữa
  paintRect(map, ground, 27, 3, 8, 8, "shallow-water");
  paintRect(map, ground, 29, 5, 4, 4, "water");

  // Mở lại các đường mà ao/ruộng có thể đè lên
  paintRect(map, ground, 17, 6, 4, 16, "path");
  paintRect(map, ground, 21, 11, 14, 2, "path");
  paintRect(map, ground, 17, 21, 4, 2, "path"); // lối ra cổng nam
  paintRect(map, ground, 34, 11, 2, 3, "path"); // lối ra cổng đông

  // Rào: CHỈ quây sân tập, chừa 1 cổng phía đông
  paintLine(map, detail, 4, 7, 14, 7, "fence");
  paintLine(map, detail, 4, 7, 4, 13, "fence");
  paintLine(map, detail, 4, 13, 14, 13, "fence");
  paintLine(map, detail, 14, 7, 14, 13, "fence");
  clearRect(map, detail, 14, 9, 1, 2);

  // Luỹ tre bao quanh, chừa 2 cổng (nam: xuống bãi tre, đông: sang chợ)
  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  clearRect(map, detail, 17, 22, 4, 1);
  clearRect(map, detail, 35, 11, 1, 3);
  clearRect(map, detail, 0, 9, 1, 3); // cổng tây (sang Chùa)
  paintRect(map, ground, 0, 9, 2, 3, "path");

  return map;
}

function createBambooTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 17, 0, 4, 23, "path");
  paintRect(map, ground, 13, 5, 14, 8, "path");
  paintRect(map, ground, 20, 9, 10, 6, "path");
  paintRect(map, ground, 8, 4, 8, 5, "path");
  paintRect(map, ground, 9, 14, 6, 4, "path");

  paintRect(map, ground, 2, 13, 9, 7, "shallow-water");
  paintRect(map, ground, 3, 14, 7, 5, "water");
  paintRect(map, ground, 10, 15, 3, 2, "bridge");

  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 16, 0, "bamboo");
  paintLine(map, detail, 21, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 16, 22, "bamboo");
  paintLine(map, detail, 21, 22, 35, 22, "bamboo");

  paintRect(map, detail, 1, 1, 6, 7, "bamboo");
  paintRect(map, detail, 28, 1, 7, 6, "bamboo");
  paintRect(map, detail, 1, 20, 9, 3, "bamboo");
  paintRect(map, detail, 27, 18, 8, 5, "bamboo");
  paintRect(map, detail, 13, 16, 4, 4, "bamboo");

  // Rào quây khu tập giữa rừng tre (giữ enclosure, bỏ đoạn nổi phía dưới)
  paintLine(map, detail, 12, 4, 26, 4, "fence");
  paintLine(map, detail, 12, 4, 12, 13, "fence");
  paintLine(map, detail, 12, 13, 28, 14, "fence");
  paintLine(map, detail, 28, 5, 28, 14, "fence");

  clearRect(map, detail, 17, 0, 4, 5);
  clearRect(map, detail, 10, 15, 3, 2);
  return map;
}

function createMarketTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 0, 9, 36, 6, "path");
  paintRect(map, ground, 15, 0, 6, 23, "path");
  paintRect(map, ground, 5, 5, 10, 5, "path");
  paintRect(map, ground, 22, 5, 10, 8, "path");
  paintRect(map, ground, 8, 15, 7, 5, "path");
  paintRect(map, ground, 23, 15, 7, 5, "path");

  paintRect(map, ground, 31, 2, 5, 6, "shallow-water");
  paintRect(map, ground, 32, 3, 4, 5, "water");
  paintRect(map, ground, 31, 20, 5, 3, "shallow-water");
  paintRect(map, ground, 32, 21, 4, 2, "water");
  paintRect(map, ground, 27, 16, 9, 7, "rice");
  paintRect(map, ground, 0, 20, 6, 3, "rice");

  paintRect(map, detail, 2, 2, 6, 4, "stall");
  paintRect(map, detail, 22, 1, 5, 4, "stall");
  paintRect(map, detail, 28, 7, 5, 3, "stall");
  paintRect(map, detail, 2, 15, 6, 4, "stall");
  paintRect(map, detail, 29, 13, 4, 3, "stall");

  // Chợ để thoáng — không rào (sạp hàng đã là vật cản tự nhiên)

  paintRect(map, detail, 0, 0, 2, 23, "bamboo");
  paintRect(map, detail, 34, 0, 2, 2, "bamboo");
  paintRect(map, detail, 34, 8, 2, 12, "bamboo");
  paintLine(map, detail, 0, 0, 14, 0, "bamboo");
  paintLine(map, detail, 21, 0, 30, 0, "bamboo");
  paintLine(map, detail, 0, 22, 26, 22, "bamboo");

  openFootPad(map, 318, 282, 1, 1);
  openFootPad(map, 430, 294, 1, 1);
  openFootPad(map, 1120, 688, 1, 1);

  clearRect(map, detail, 0, 11, 2, 4);
  clearRect(map, detail, 34, 12, 2, 4);
  return map;
}

function createRiverTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 0, 9, 22, 5, "path");
  paintRect(map, ground, 14, 1, 6, 18, "path");
  paintRect(map, ground, 7, 6, 15, 6, "path");
  paintRect(map, ground, 10, 13, 12, 5, "path");
  paintRect(map, ground, 4, 16, 10, 4, "path");

  paintRect(map, ground, 20, 5, 16, 18, "shallow-water");
  paintRect(map, ground, 24, 6, 12, 17, "water");
  paintRect(map, ground, 7, 18, 29, 5, "shallow-water");
  paintRect(map, ground, 12, 20, 24, 3, "water");
  paintRect(map, ground, 0, 17, 8, 6, "shallow-water");
  paintRect(map, ground, 0, 18, 7, 5, "water");

  paintRect(map, ground, 18, 11, 3, 2, "bridge");
  // Bến sông không rào — mép nước đã là ranh giới tự nhiên

  paintRect(map, detail, 0, 0, 2, 23, "bamboo");
  paintLine(map, detail, 0, 0, 13, 0, "bamboo");
  paintLine(map, detail, 20, 0, 35, 0, "bamboo");
  paintRect(map, detail, 35, 0, 1, 5, "bamboo");

  openFootPad(map, 135, 456, 1, 1);
  openFootPad(map, 56, 456, 1, 1);
  openFootPad(map, 650, 74, 2, 1);
  openFootPad(map, 398, 308, 1, 1);
  openFootPad(map, 625, 602, 1, 1);
  openFootPad(map, 835, 462, 1, 1);
  openFootPad(map, 492, 742, 1, 1);
  openFootPad(map, 330, 282, 1, 1);
  openFootPad(map, 528, 525, 1, 1);
  openFootPad(map, 712, 382, 1, 1);
  openFootPad(map, 820, 690, 1, 1);

  clearRect(map, detail, 0, 10, 2, 4);
  clearRect(map, detail, 14, 0, 6, 3);
  return map;
}

function createMountainTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 14, 17, 5, 6, "path");
  paintRect(map, ground, 10, 14, 12, 5, "path");
  paintRect(map, ground, 9, 7, 15, 8, "path");
  paintRect(map, ground, 10, 5, 8, 4, "path");
  paintRect(map, ground, 16, 4, 9, 5, "path");
  paintRect(map, ground, 13, 10, 15, 4, "path");
  paintRect(map, ground, 2, 15, 8, 8, "shallow-water");

  paintRect(map, detail, 0, 0, 2, 23, "rock");
  paintRect(map, detail, 34, 0, 2, 23, "rock");
  paintLine(map, detail, 0, 0, 35, 0, "rock");
  paintLine(map, detail, 0, 22, 13, 22, "rock");
  paintLine(map, detail, 19, 22, 35, 22, "rock");
  paintRect(map, detail, 2, 7, 5, 12, "rock");
  paintRect(map, detail, 30, 6, 6, 15, "rock");
  paintRect(map, detail, 19, 1, 8, 5, "rock");
  paintRect(map, detail, 25, 8, 6, 6, "rock");
  paintRect(map, detail, 27, 14, 7, 8, "rock");
  // Núi đá không rào — vách đá đã là vật cản

  openFootPad(map, 642, 780, 2, 1);
  openFootPad(map, 642, 886, 2, 1);
  openFootPad(map, 436, 312, 1, 1);
  openFootPad(map, 622, 266, 1, 1);
  openFootPad(map, 908, 350, 1, 1);
  openFootPad(map, 714, 622, 1, 1);
  openFootPad(map, 484, 734, 1, 1);
  openFootPad(map, 420, 388, 1, 1);
  openFootPad(map, 555, 368, 1, 1);
  openFootPad(map, 690, 382, 1, 1);
  openFootPad(map, 835, 480, 1, 1);
  openFootPad(map, 600, 600, 1, 1);

  clearRect(map, detail, 14, 21, 5, 2);

  // Cổng bắc: lối đá lên Ruộng Bậc Thang
  paintRect(map, ground, 11, 0, 4, 8, "path");
  clearRect(map, detail, 11, 0, 4, 1);

  return map;
}

// Ruộng Bậc Thang (terraced golden rice on a hillside): blocked rice terraces
// separated by walkable earth ridges, with one main vertical trail.
function createTerraceTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  // Các bậc lúa chín (chặn)
  paintRect(map, ground, 2, 1, 32, 2, "ricegold");
  paintRect(map, ground, 2, 5, 32, 2, "ricegold");
  paintRect(map, ground, 2, 9, 32, 2, "ricegold");
  paintRect(map, ground, 2, 13, 32, 2, "ricegold");
  paintRect(map, ground, 2, 17, 32, 2, "ricegold");

  // Bờ ruộng (đường đi giữa các bậc)
  paintRect(map, ground, 1, 3, 34, 2, "path");
  paintRect(map, ground, 1, 7, 34, 2, "path");
  paintRect(map, ground, 1, 11, 34, 2, "path");
  paintRect(map, ground, 1, 15, 34, 2, "path");
  paintRect(map, ground, 1, 19, 34, 3, "path");
  // Lối mòn dọc nối tất cả các bờ
  paintRect(map, ground, 16, 1, 4, 21, "path");

  // Luỹ tre bao quanh, chừa cổng nam (xuống Núi Trúc)
  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  clearRect(map, detail, 16, 22, 4, 1);
  paintRect(map, ground, 16, 21, 4, 2, "path");
  clearRect(map, detail, 0, 3, 1, 2); // cổng tây (sang Đồi Chè)
  paintRect(map, ground, 0, 3, 2, 2, "path");

  return map;
}

// Phố Cổ Hội An: phố lát gạch (courtyard) hình chữ thập, nhà phố cổ (chặn) hai
// bên, sông Hoài phía nam với cầu, đèn lồng do renderer rải trên nền courtyard.
function createOldtownTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  // Phố lát gạch (chữ thập)
  paintRect(map, ground, 1, 8, 34, 5, "courtyard");
  paintRect(map, ground, 15, 1, 6, 17, "courtyard");
  paintRect(map, ground, 4, 4, 9, 3, "courtyard");
  paintRect(map, ground, 23, 4, 9, 3, "courtyard");
  paintRect(map, ground, 4, 14, 9, 3, "courtyard");
  paintRect(map, ground, 23, 14, 9, 3, "courtyard");

  // Dãy nhà phố cổ (chặn)
  paintRect(map, ground, 3, 1, 10, 3, "shophouse");
  paintRect(map, ground, 23, 1, 10, 3, "shophouse");
  paintRect(map, ground, 2, 5, 2, 3, "shophouse");
  paintRect(map, ground, 32, 5, 2, 3, "shophouse");
  paintRect(map, ground, 4, 11, 8, 3, "shophouse");
  paintRect(map, ground, 24, 11, 8, 3, "shophouse");

  // Sông Hoài phía nam + cầu (Chùa Cầu)
  paintRect(map, ground, 1, 19, 34, 4, "shallow-water");
  paintRect(map, ground, 1, 20, 34, 3, "water");
  paintRect(map, ground, 16, 18, 4, 5, "bridge");

  // Luỹ tre/biên hai bên, chừa cổng tây (về Chợ)
  paintRect(map, ground, 0, 8, 1, 5, "path");
  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 0, 0, 18, "bamboo");
  paintLine(map, detail, 35, 0, 35, 18, "bamboo");
  clearRect(map, detail, 0, 9, 1, 3);
  paintRect(map, ground, 0, 9, 2, 3, "path"); // lối ra cổng tây (về chợ)
  clearRect(map, detail, 35, 9, 1, 3); // cổng đông (sang Chợ Nổi)
  paintRect(map, ground, 33, 9, 3, 3, "courtyard");

  return map;
}

// Chùa: tháp nhiều tầng, sân gạch, hai hồ sen. Nối với Làng (cổng đông).
function createPagodaTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 13, 1, 10, 6, "temple"); // chùa
  paintRect(map, ground, 14, 7, 8, 2, "courtyard");
  paintRect(map, ground, 2, 10, 32, 4, "courtyard"); // sân ngang
  paintRect(map, ground, 15, 7, 6, 14, "courtyard"); // sân dọc
  paintRect(map, ground, 2, 14, 32, 2, "path");
  paintRect(map, ground, 15, 14, 6, 8, "path");

  // Hai hồ sen
  paintRect(map, ground, 3, 3, 8, 5, "shallow-water");
  paintRect(map, ground, 4, 4, 6, 3, "water");
  paintRect(map, ground, 26, 3, 8, 5, "shallow-water");
  paintRect(map, ground, 27, 4, 6, 3, "water");

  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  clearRect(map, detail, 35, 11, 1, 3); // cổng đông (về Làng)
  paintRect(map, ground, 34, 11, 2, 3, "path");

  return map;
}

// Đồi Chè (Mộc Châu): luống chè xanh theo đường đồng mức + bờ đi. Nối Ruộng Bậc Thang (cổng đông).
function createTeahillTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  paintRect(map, ground, 2, 1, 32, 2, "tea");
  paintRect(map, ground, 2, 5, 32, 2, "tea");
  paintRect(map, ground, 2, 9, 32, 2, "tea");
  paintRect(map, ground, 2, 13, 32, 2, "tea");
  paintRect(map, ground, 2, 17, 32, 2, "tea");
  paintRect(map, ground, 1, 3, 34, 2, "path");
  paintRect(map, ground, 1, 7, 34, 2, "path");
  paintRect(map, ground, 1, 11, 34, 2, "path");
  paintRect(map, ground, 1, 15, 34, 2, "path");
  paintRect(map, ground, 1, 19, 34, 3, "path");
  paintRect(map, ground, 16, 1, 4, 21, "path");

  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  clearRect(map, detail, 35, 3, 1, 2); // cổng đông (về Ruộng Bậc Thang)
  paintRect(map, ground, 34, 3, 2, 2, "path");

  return map;
}

// Chợ Nổi (Cái Răng): kênh nước, cầu gỗ đi lại, thuyền bán hàng. Nối Phố Cổ (cổng tây).
function createFloatmarketTilemap(): TileMapDef {
  const ground = filled<TileKind>("grass");
  const detail = filled<TileKind | undefined>(undefined);
  const map: TileMapDef = { cols: TILE_COLS, rows: TILE_ROWS, tileSize: TILE_SIZE, ground, detail };

  // Kênh nước
  paintRect(map, ground, 0, 5, 36, 14, "shallow-water");
  paintRect(map, ground, 2, 7, 32, 10, "water");
  // Cầu gỗ (đi lại được) chữ thập
  paintRect(map, ground, 15, 0, 6, 23, "bridge");
  paintRect(map, ground, 0, 10, 36, 3, "bridge");
  // Thuyền/sạp bán hàng nổi (chặn) cạnh cầu
  paintRect(map, ground, 8, 8, 3, 2, "stall");
  paintRect(map, ground, 25, 8, 3, 2, "stall");
  paintRect(map, ground, 8, 14, 3, 2, "stall");
  paintRect(map, ground, 25, 14, 3, 2, "stall");

  paintLine(map, detail, 0, 0, 35, 0, "bamboo");
  paintLine(map, detail, 0, 22, 35, 22, "bamboo");
  paintLine(map, detail, 0, 0, 0, 22, "bamboo");
  paintLine(map, detail, 35, 0, 35, 22, "bamboo");
  clearRect(map, detail, 0, 10, 1, 3); // cổng tây (về Phố Cổ)
  clearRect(map, detail, 15, 0, 6, 1); // mở hai đầu cầu dọc
  clearRect(map, detail, 15, 22, 6, 1);

  return map;
}

function filled<T>(value: T): T[] {
  return Array<T>(TILE_COLS * TILE_ROWS).fill(value);
}

function index(tilemap: TileMapDef, col: number, row: number) {
  return row * tilemap.cols + col;
}

function paintRect(
  tilemap: TileMapDef,
  layer: TileLayer | DetailLayer,
  x: number,
  y: number,
  width: number,
  height: number,
  tile: TileKind,
) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      if (col < 0 || col >= tilemap.cols || row < 0 || row >= tilemap.rows) continue;
      layer[index(tilemap, col, row)] = tile;
    }
  }
}

function clearRect(tilemap: TileMapDef, layer: (TileKind | undefined)[], x: number, y: number, width: number, height: number) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      if (col < 0 || col >= tilemap.cols || row < 0 || row >= tilemap.rows) continue;
      layer[index(tilemap, col, row)] = undefined;
    }
  }
}

function openFootPad(tilemap: TileMapDef, x: number, y: number, radiusCols: number, radiusRows: number) {
  const col = Math.floor(x / tilemap.tileSize);
  const row = Math.floor((y + 22) / tilemap.tileSize);
  const startCol = col - radiusCols;
  const startRow = row - radiusRows;
  const width = radiusCols * 2 + 1;
  const height = radiusRows * 2 + 1;
  paintRect(tilemap, tilemap.ground, startCol, startRow, width, height, "path");
  clearRect(tilemap, tilemap.detail, startCol, startRow, width, height);
}

function paintLine(tilemap: TileMapDef, layer: DetailLayer, fromX: number, fromY: number, toX: number, toY: number, tile: TileKind) {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let step = 0; step <= steps; step++) {
    const col = Math.round(fromX + ((toX - fromX) * step) / steps);
    const row = Math.round(fromY + ((toY - fromY) * step) / steps);
    if (col < 0 || col >= tilemap.cols || row < 0 || row >= tilemap.rows) continue;
    layer[index(tilemap, col, row)] = tile;
  }
}
