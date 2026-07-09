local out_dir = app.params["out"] or "assets/special-tiles"

local function path_join(left, right)
  return left .. "/" .. right
end

local function ensure_dir(path)
  os.execute('mkdir -p "' .. path .. '"')
end

-- Blupets tiles are 32x32. These symbols use the old CSS power-up marks as
-- size/style references, but redraw them as crisp pixel art assets.
local palette = {
  shade = Color(14, 14, 20, 96),
  shade_deep = Color(14, 14, 20, 126),
  red_dark = Color(157, 8, 20, 116),
  red_ring_shadow = Color(157, 8, 20, 150),
  red_ring = Color(255, 51, 70, 196),
  red_mid = Color(255, 51, 70, 158),
  red_light = Color(255, 146, 138, 128),
  cream = Color(255, 244, 225, 148),
  white = Color(255, 255, 255, 168),
  blue_dark = Color(24, 58, 133, 118),
  blue_mid = Color(50, 107, 209, 138),
  spark = Color(255, 217, 74, 178),
}

local function rect(image, x, y, w, h, color)
  for yy = y, y + h - 1 do
    for xx = x, x + w - 1 do
      if xx >= 0 and xx < image.width and yy >= 0 and yy < image.height then
        image:putPixel(xx, yy, color)
      end
    end
  end
end

local function pix(image, x, y, color)
  rect(image, x, y, 1, 1, color)
end

local function draw_cross(image, ox, oy)
  ox = ox or 0
  oy = oy or 0
  -- Old overlay reference: a full-height/full-width cross. Redrawn on-pixel
  -- with chunky 3px arms, stepped end caps, highlight, and transparent fill.
  rect(image, ox + 14, oy + 2, 4, 28, palette.shade)
  rect(image, ox + 2, oy + 14, 28, 4, palette.shade)
  rect(image, ox + 13, oy + 4, 6, 24, palette.red_dark)
  rect(image, ox + 4, oy + 13, 24, 6, palette.red_dark)
  rect(image, ox + 14, oy + 5, 4, 22, palette.red_mid)
  rect(image, ox + 5, oy + 14, 22, 4, palette.red_mid)
  rect(image, ox + 15, oy + 6, 2, 20, palette.red_light)
  rect(image, ox + 6, oy + 15, 20, 2, palette.red_light)
  rect(image, ox + 14, oy + 14, 4, 4, palette.cream)
  rect(image, ox + 15, oy + 15, 2, 2, palette.white)
  pix(image, ox + 14, oy + 5, palette.white)
  pix(image, ox + 5, oy + 14, palette.white)
  pix(image, ox + 17, oy + 26, palette.red_dark)
  pix(image, ox + 26, oy + 17, palette.red_dark)
end

local function draw_bomb(image, ox, oy)
  ox = ox or 0
  oy = oy or 0
  -- Old overlay reference: circle with central dot. This version is an open
  -- pixel ring, so most of the Blupet tile remains visible under the symbol.
  rect(image, ox + 11, oy + 5, 10, 2, palette.red_ring_shadow)
  rect(image, ox + 8, oy + 7, 3, 2, palette.red_ring_shadow)
  rect(image, ox + 21, oy + 7, 3, 2, palette.red_ring_shadow)
  rect(image, ox + 6, oy + 10, 3, 4, palette.red_ring_shadow)
  rect(image, ox + 23, oy + 10, 3, 4, palette.red_ring_shadow)
  rect(image, ox + 5, oy + 14, 2, 4, palette.red_ring_shadow)
  rect(image, ox + 25, oy + 14, 2, 4, palette.red_ring_shadow)
  rect(image, ox + 6, oy + 18, 3, 4, palette.red_ring_shadow)
  rect(image, ox + 23, oy + 18, 3, 4, palette.red_ring_shadow)
  rect(image, ox + 8, oy + 23, 3, 2, palette.red_ring_shadow)
  rect(image, ox + 21, oy + 23, 3, 2, palette.red_ring_shadow)
  rect(image, ox + 11, oy + 25, 10, 2, palette.red_ring_shadow)

  rect(image, ox + 12, oy + 6, 8, 1, palette.red_ring)
  rect(image, ox + 9, oy + 8, 3, 1, palette.red_ring)
  rect(image, ox + 20, oy + 8, 3, 1, palette.red_ring)
  rect(image, ox + 8, oy + 10, 1, 4, palette.red_ring)
  rect(image, ox + 23, oy + 10, 1, 4, palette.red_ring)
  rect(image, ox + 7, oy + 14, 1, 4, palette.red_ring)
  rect(image, ox + 24, oy + 14, 1, 4, palette.red_ring)
  rect(image, ox + 8, oy + 18, 1, 4, palette.red_ring)
  rect(image, ox + 23, oy + 18, 1, 4, palette.red_ring)
  rect(image, ox + 9, oy + 23, 3, 1, palette.red_ring)
  rect(image, ox + 20, oy + 23, 3, 1, palette.red_ring)
  rect(image, ox + 12, oy + 25, 8, 1, palette.red_ring)

  rect(image, ox + 13, oy + 13, 6, 6, palette.red_ring)
  rect(image, ox + 14, oy + 14, 4, 4, palette.cream)
  rect(image, ox + 15, oy + 15, 2, 2, palette.white)
end

local function make_sprite(name, draw_fn)
  local spr = Sprite(32, 32, ColorMode.RGB)
  spr.filename = path_join(out_dir, name .. ".aseprite")
  app.activeSprite = spr

  local layer = spr.layers[1]
  layer.name = "symbol"
  local image = Image(32, 32, ColorMode.RGB)
  image:clear()
  draw_fn(image)

  spr:newCel(layer, 1, image, Point(0, 0))
  spr:saveAs(path_join(out_dir, name .. ".aseprite"))
  spr:saveCopyAs(path_join(out_dir, name .. ".png"))
end

local function draw_tile_base(image, ox, oy, top, body, shadow, light)
  rect(image, ox + 7, oy + 5, 1, 1, shadow)
  rect(image, ox + 8, oy + 5, 16, 8, top)
  rect(image, ox + 24, oy + 5, 1, 1, shadow)
  rect(image, ox + 6, oy + 6, 2, 5, top)
  rect(image, ox + 24, oy + 6, 2, 5, top)
  rect(image, ox + 8, oy + 13, 16, 1, light)
  rect(image, ox + 7, oy + 14, 18, 13, body)
  rect(image, ox + 6, oy + 16, 1, 8, body)
  rect(image, ox + 25, oy + 16, 1, 8, body)
  rect(image, ox + 11, oy + 17, 3, 4, Color(255, 255, 255, 255))
  rect(image, ox + 12, oy + 18, 2, 3, Color(14, 14, 20, 255))
  rect(image, ox + 18, oy + 17, 3, 4, Color(255, 255, 255, 255))
  rect(image, ox + 18, oy + 18, 2, 3, Color(14, 14, 20, 255))
end

local function make_preview()
  local spr = Sprite(80, 40, ColorMode.RGB)
  spr.filename = path_join(out_dir, "special-symbols-preview.aseprite")
  app.activeSprite = spr
  local layer = spr.layers[1]
  layer.name = "preview"
  local image = Image(80, 40, ColorMode.RGB)
  image:clear()

  draw_tile_base(image, 4, 4, Color(126, 204, 82, 255), Color(60, 132, 54, 255), Color(40, 88, 42, 255), Color(182, 236, 118, 255))
  draw_tile_base(image, 44, 4, Color(245, 76, 69, 255), Color(199, 35, 49, 255), Color(157, 8, 20, 255), Color(255, 174, 164, 255))
  draw_cross(image, 4, 4)
  draw_bomb(image, 44, 4)

  spr:newCel(layer, 1, image, Point(0, 0))
  spr:saveAs(path_join(out_dir, "special-symbols-preview.aseprite"))
  spr:saveCopyAs(path_join(out_dir, "special-symbols-preview.png"))
end

ensure_dir(out_dir)
make_sprite("cross-symbol", draw_cross)
make_sprite("bomb-symbol", draw_bomb)
make_preview()
