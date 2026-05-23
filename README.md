# Võ Sinh Làng Tre

Prototype game 2D browser theo tinh thần nhập môn võ đường làng Việt Nam.

## Chơi thử local

```bash
npm install
npm run dev
```

Mặc định Vite chạy ở `http://localhost:5173`; nếu port đó bận thì Vite sẽ báo port thực tế trong terminal.

## Điều khiển

- `WASD` hoặc phím mũi tên: di chuyển
- `Space` hoặc `E`: nói chuyện, tiếp thoại, tương tác cổng/lối đi; nếu không có gì gần thì vung gậy
- Nút cảm ứng hiện trên màn hình nhỏ

## Loop hiện tại

1. Nói chuyện với thầy Ba ở đình làng.
2. Hái 5 bông sen và luyện 4 bù nhìn rơm.
3. Đi xuống lối đất phía nam để sang bãi tre.
4. Nhặt 3 thẻ tre, luyện gậy.
5. Quay về đình làng để hoàn thành nhập môn.

## Mở rộng map và cốt truyện

- `src/content/maps.ts`: cấu hình map, background, blocker, vùng nước, exit, NPC, collectibles, mục tiêu luyện.
- `src/content/story.ts`: thoại/cốt truyện theo phase.
- `src/gameState.ts`: phase quest, inventory/progress, serialize save.
- `src/save.ts`: auto-save qua `localStorage`.

Muốn thêm map mới: thêm id vào `MapId`, thêm entry trong `MAPS`, thêm background vào `public/assets/maps/`, rồi thêm collision mask vào `public/assets/collision/`.

## Vật lý/terrain

- Deep water đang là collider: chưa học bơi thì không đi thẳng xuống ao/hồ.
- Shallow water làm nhân vật đi chậm và đổi trạng thái HUD thành `Lội nước`.
- Exit xuống map mới nằm ở vùng đường đất phía nam, không còn bị blocker che.
- `src/collision.ts` tạo collision matrix 8px/cell. Ảnh map chỉ là visual; grid/mask mới quyết định ô nào đi được.
- Dev mode bấm `M` để bật overlay đỏ debug vùng bị chặn.
- Collision tổng quát dùng mask asset: vẽ vùng cấm bằng pixel/SVG có alpha trong `public/assets/collision/<map>.svg` hoặc PNG, rồi khai báo `collisionMaskKey`/`collisionMaskUrl` trong `src/content/maps.ts`.
- Rect/ellipse/polygon trong `src/content/maps.ts` chỉ nên dùng cho vùng logic lớn như biên map, ao sâu hoặc ruộng; không dùng để vá từng hàng rào nhỏ.
- Bù nhìn/cọc tre có HP bar, bị đánh trừ máu; nếu ngắt nhịp quá lâu thì hồi phục.

## Asset

Sprite võ sinh, thầy Ba, và map background được AI-generate, xử lý/chuẩn hóa rồi đặt trong `public/assets/`.
