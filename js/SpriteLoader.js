// ============================================================
// IRON DOMINION - Sprite Loader
// Loads Kenney CC0 isometric asset packs
// ============================================================

const SpriteLoader = {
  _images: {},
  _loaded: 0,
  _total: 0,
  _ready: false,
  onReady: null, // callback when all sprites loaded

  // ── Kenney Isometric Landscape tile manifest ─────────────
  // Tile types identified by pixel-sampling each tile's diamond center:
  //   GRASS   – deep/light green flat tiles (83px tall)
  //   FOREST  – tall green tiles with trees (131px)
  //   WATER   – blue flat tiles (83px)
  //   DIRT    – brown earth tiles (83-99px)
  //   SAND    – warm beige tiles (99px)
  //   MOUNTAIN– gray stone tiles (99px)
  // Update indices here if tiles look wrong in game; use tile-catalog.html to identify tiles.

  LANDSCAPE_BASE: 'assets/sprites/isometric-landscape/PNG',
  CITY_BASE:      'assets/sprites/isometric-city/PNG',

  TERRAIN_TILES: {
    // Tile indices verified via Python PIL pixel audit (top srcW/2 px = diamond face only).
    // All tiles confirmed <3% blue contamination. Scan covered full 128-tile landscape pack.
    // GRASS: 3 similar flat-green tiles. 6×6 block grouping gives large natural patches.
    GRASS:    [10, 16, 22],                                // flat uniform green tiles only
    FOREST:   [21, 91, 99],                                // darker green (9,13 removed: 3.4% blue ponds)
    WATER:    [44, 45, 52, 53, 60, 61],                    // clean blue water tiles
    DIRT:     [14, 20],                                    // brown farmland/earth (distinct from sand paths)
    SAND:     [73, 83],                                    // dark earth path tiles (both similar brown, no patchwork)
    MOUNTAIN: [81, 87, 90, 94, 101],                       // uniform gray cobblestone (high consistency tiles only)
  },

  // City building tiles for structures
  CITY_TILES: {
    ROAD_FLAT:    [0, 1, 2, 3],
    BUILDING_SM:  [13, 18, 26, 33],
    BUILDING_MD:  [24, 31, 36, 44],
    BUILDING_LG:  [41],
  },

  init(callback) {
    this.onReady = callback;
    this._images = {};
    this._loaded = 0;

    const toLoad = [];

    // Only load the landscape tiles we actually use for terrain
    const terrainIndices = new Set();
    for (const arr of Object.values(this.TERRAIN_TILES)) {
      arr.forEach(i => terrainIndices.add(i));
    }
    for (const i of terrainIndices) {
      const name = `landscapeTiles_${String(i).padStart(3, '0')}.png`;
      toLoad.push({ key: `landscape_${i}`, path: `${this.LANDSCAPE_BASE}/${name}` });
    }

    // City tiles used for buildings
    const cityIndices = new Set();
    for (const arr of Object.values(this.CITY_TILES)) {
      arr.forEach(i => cityIndices.add(i));
    }
    for (const i of cityIndices) {
      const name = `cityTiles_${String(i).padStart(3, '0')}.png`;
      toLoad.push({ key: `city_${i}`, path: `${this.CITY_BASE}/${name}` });
    }

    this._total = toLoad.length;

    if (this._total === 0) {
      this._ready = true;
      if (this.onReady) this.onReady();
      return;
    }

    for (const item of toLoad) {
      const img = new Image();
      img.onload = () => {
        this._loaded++;
        if (this._loaded >= this._total) {
          this._ready = true;
          console.log(`[SpriteLoader] All ${this._total} sprites loaded.`);
          if (this.onReady) this.onReady();
        }
      };
      img.onerror = () => {
        // Missing tile - just count it as loaded (fallback to procedural)
        this._loaded++;
        if (this._loaded >= this._total) {
          this._ready = true;
          if (this.onReady) this.onReady();
        }
      };
      img.src = item.path;
      this._images[item.key] = img;
    }
  },

  _diamondCache: {}, // pre-rendered diamond-clipped tiles: key = "landscape_N"

  isReady() {
    return this._ready;
  },

  getProgress() {
    return this._total > 0 ? this._loaded / this._total : 1;
  },

  // Get a landscape tile by index
  landscape(index) {
    const img = this._images[`landscape_${index}`];
    return (img && img.complete && img.naturalWidth > 0) ? img : null;
  },

  // Get a city tile by index
  city(index) {
    const img = this._images[`city_${index}`];
    return (img && img.complete && img.naturalWidth > 0) ? img : null;
  },

  // Return a pre-clipped offscreen canvas for a landscape tile.
  // The canvas is ISO_TILE_W × ISO_TILE_H with only the diamond-shaped top face visible.
  // scale > 1 zooms into the tile center, cropping the darker 3D edge shading that
  // appears in the corners of the Kenney terrain block's top face diamond.
  // scale=1.4 gives the flattest appearance while retaining texture variety.
  // flip=true mirrors horizontally, reversing the baked-in light direction — used
  // to break the repeating directional-shading pattern on large flat grass areas.
  getDiamondTile(index, scale = 1.4, flip = false) {
    const key = `d_${index}_${scale}_${flip ? 'f' : 'n'}`;
    if (this._diamondCache[key]) return this._diamondCache[key];

    const img = this.landscape(index);
    if (!img) return null;

    const iw = ISO_TILE_W, ih = ISO_TILE_H;
    const oc = document.createElement('canvas');
    oc.width = iw; oc.height = ih;
    const ctx = oc.getContext('2d');

    // Clip canvas to diamond shape (top face only — hides all 3D side walls)
    ctx.beginPath();
    ctx.moveTo(iw / 2, 0);
    ctx.lineTo(iw,     ih / 2);
    ctx.lineTo(iw / 2, ih);
    ctx.lineTo(0,      ih / 2);
    ctx.closePath();
    ctx.clip();

    // Optionally mirror horizontally (reverses baked shading direction)
    if (flip) {
      ctx.translate(iw, 0);
      ctx.scale(-1, 1);
    }

    // Draw tile center-cropped at 'scale': zooms in so the darker 3D edge shading
    // in the diamond corners gets pushed outside the clip region.
    // Only the flat central texture of the tile's top face is visible.
    const srcW = img.naturalWidth;
    const srcH = Math.round(srcW / 2);
    const dw = iw * scale, dh = ih * scale;
    const ox = (iw - dw) / 2, oy = (ih - dh) / 2;
    ctx.drawImage(img, 0, 0, srcW, srcH, ox, oy, dw, dh);

    this._diamondCache[key] = oc;
    return oc;
  },

  // Get a terrain tile image for a given TERRAIN type, with positional variety.
  // GRASS uses 6×6 block grouping → large natural-looking terrain zones.
  // Other terrains use 3×3 block grouping for coherent stone/dirt/sand patches.
  getTerrainSprite(terrainName, tx, ty) {
    const arr = this.TERRAIN_TILES[terrainName];
    if (!arr) return null;
    let bx, by;
    if (terrainName === 'GRASS') {
      bx = (tx / 6) | 0;
      by = (ty / 6) | 0;
    } else {
      bx = (tx / 3) | 0;
      by = (ty / 3) | 0;
    }
    const hash = ((bx * 2971 + by * 5923) >>> 0) % arr.length;
    return this.getDiamondTile(arr[hash]);
  },
};
