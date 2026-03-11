// ============================================================
// IRON DOMINION - Babylon.js 3D Scene Renderer
// Replaces Canvas 2D rendering with real-time 3D
// Game logic (Unit, Building, Player, AI) is UNTOUCHED
// ============================================================

class Scene3D {
  constructor(game, glCanvas) {
    this.game       = game;
    this.glCanvas   = glCanvas;

    // Babylon.js core
    this.engine     = null;
    this.scene      = null;
    this.camera3d   = null;

    // Cached meshes keyed by entity id
    this._unitMeshes     = new Map(); // unit.id → {root, bar, circle}
    this._buildingMeshes = new Map(); // building.id → mesh group
    this._projMeshes     = new Map(); // projectile ref → mesh
    this._treeInstances  = [];

    // Materials pool
    this._mats = {};

    // Shadow generator
    this._shadows = null;

    // 3D camera state (tile space)  — start near player 1 base (tile 10,10)
    this._camTarget = { x: 14, z: 14 };
    this._camZoom   = 14; // ortho half-size in tiles (closer = better detail)
    this._camAspect = 1;

    // Water animation
    this._waterTime = 0;

    // Fog plane grid (64×64 quads updated per frame)
    this._fogMesh   = null;
    this._fogColors = null;

    // Terrain needs rebuild on first frame
    this._terrainBuilt = false;

    this._lastLogicTime = performance.now();
  }

  // ── Public API ─────────────────────────────────────────────
  init() {
    this._initEngine();
    this._initCamera();
    this._initLighting();
    this._initTerrain();
    this._initWater();
    this._initFogPlane();
    this._initResourceNodes();
    this._patchGameCamera();
    this._startRenderLoop();
  }

  // ── Engine + Scene ─────────────────────────────────────────
  _initEngine() {
    this.engine = new BABYLON.Engine(this.glCanvas, true, {
      preserveDrawingBuffer: true,  // needed for screenshots
      stencil: true,
      antialias: true,
    });
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0.15, 0.12, 0.1, 1);
    this.scene.ambientColor = new BABYLON.Color3(0.4, 0.45, 0.35);

    // Optimizations
    this.scene.skipPointerMovePicking = false;
    this.scene.autoClearDepthAndStencil = true;

    window.addEventListener('resize', () => {
      this.engine.resize();
      this._camAspect = this.glCanvas.width / this.glCanvas.height;
      this._applyOrtho();
    });
    this._camAspect = this.glCanvas.width / this.glCanvas.height;
  }

  // ── Camera ─────────────────────────────────────────────────
  _initCamera() {
    // AoE2-style isometric camera:
    // alpha=-PI/4 → NE view, beta=PI/3 → ~30° elevation from horizon
    this.camera3d = new BABYLON.ArcRotateCamera(
      "isoCamera",
      -Math.PI / 4,
      Math.PI / 3,
      50,
      new BABYLON.Vector3(this._camTarget.x, 0, this._camTarget.z),
      this.scene
    );

    // Orthographic projection for true isometric feel
    this.camera3d.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
    this._applyOrtho();

    // Disable default mouse controls — we'll do custom RTS pan/zoom
    this.camera3d.inputs.clear();

    // Custom panning via right-click drag
    let panActive = false, panStart = { x: 0, z: 0 }, panMouse = { x: 0, y: 0 };
    this.glCanvas.addEventListener('mousedown', e => {
      if (e.button === 2 || e.button === 1) {
        panActive = true;
        panMouse = { x: e.clientX, y: e.clientY };
        panStart = { x: this._camTarget.x, z: this._camTarget.z };
        e.preventDefault();
      }
    });
    window.addEventListener('mousemove', e => {
      if (!panActive) return;
      const dx = (e.clientX - panMouse.x);
      const dy = (e.clientY - panMouse.y);
      // Pan speed scaled by ortho size
      const panScale = (this._camZoom * 2) / this.glCanvas.height;
      // In iso view: screen dx → 3D XZ diagonal, screen dy → 3D XZ diagonal
      this._camTarget.x = panStart.x - (dx + dy) * panScale * 0.7;
      this._camTarget.z = panStart.z - (dy - dx) * panScale * 0.7;
      this._clampCamera();
      this.camera3d.target.x = this._camTarget.x;
      this.camera3d.target.z = this._camTarget.z;
    });
    window.addEventListener('mouseup', () => { panActive = false; });

    // Scroll wheel zoom
    this.glCanvas.addEventListener('wheel', e => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      this._camZoom = Math.max(8, Math.min(40, this._camZoom * delta));
      this._applyOrtho();
    }, { passive: false });

    // Arrow key pan
    this._arrowKeys = {};
    window.addEventListener('keydown', e => { this._arrowKeys[e.key] = true; });
    window.addEventListener('keyup',   e => { this._arrowKeys[e.key] = false; });
  }

  _applyOrtho() {
    const cam = this.camera3d;
    if (!cam) return;
    const z = this._camZoom;
    const a = this._camAspect;
    cam.orthoLeft   = -z * a;
    cam.orthoRight  =  z * a;
    cam.orthoTop    =  z;
    cam.orthoBottom = -z;
  }

  _clampCamera() {
    this._camTarget.x = Math.max(4, Math.min(MAP_W - 4, this._camTarget.x));
    this._camTarget.z = Math.max(4, Math.min(MAP_H - 4, this._camTarget.z));
  }

  _updateCameraFromKeys(dt) {
    const spd = this._camZoom * 0.0015 * dt;
    if (this._arrowKeys['ArrowLeft'])  { this._camTarget.x -= spd; this._camTarget.z += spd; }
    if (this._arrowKeys['ArrowRight']) { this._camTarget.x += spd; this._camTarget.z -= spd; }
    if (this._arrowKeys['ArrowUp'])    { this._camTarget.x -= spd; this._camTarget.z -= spd; }
    if (this._arrowKeys['ArrowDown'])  { this._camTarget.x += spd; this._camTarget.z += spd; }
    this._clampCamera();
    this.camera3d.target.x = this._camTarget.x;
    this.camera3d.target.z = this._camTarget.z;
  }

  // ── Lighting ───────────────────────────────────────────────
  _initLighting() {
    // Directional sunlight from NW (classic RTS sun angle)
    const sun = new BABYLON.DirectionalLight("sun",
      new BABYLON.Vector3(-1, -2.5, -1), this.scene);
    sun.position = new BABYLON.Vector3(MAP_W * 0.3, 40, MAP_H * 0.3);
    sun.intensity = 1.4;
    sun.diffuse   = new BABYLON.Color3(1.0, 0.95, 0.82);
    sun.specular  = new BABYLON.Color3(0.2, 0.18, 0.12);
    this._sun = sun;

    // Sky ambient — brighter so terrain colors are visible
    const sky = new BABYLON.HemisphericLight("sky",
      new BABYLON.Vector3(0, 1, 0), this.scene);
    sky.intensity    = 0.85;
    sky.diffuse      = new BABYLON.Color3(0.88, 0.92, 1.0);
    sky.groundColor  = new BABYLON.Color3(0.55, 0.50, 0.40);

    // Shadow generator — soft shadows for quality AoE2 look
    this._shadows = new BABYLON.ShadowGenerator(2048, sun);
    this._shadows.useExponentialShadowMap = true;
    this._shadows.blurKernel = 24;

    // Subtle bloom: glow around brighter objects (building highlights, water)
    const glow = new BABYLON.GlowLayer("glow", this.scene);
    glow.intensity = 0.25;
  }

  // ── Terrain ────────────────────────────────────────────────
  _initTerrain() {
    const W = MAP_W, H = MAP_H;
    const game = this.game;

    // Ground mesh — 64 subdivisions gives 65×65 vertices (one per tile corner)
    const ground = BABYLON.MeshBuilder.CreateGround("terrain", {
      width: W, height: H, subdivisions: W
    }, this.scene);
    ground.position.x = W / 2;
    ground.position.z = H / 2;
    ground.receiveShadows = true;
    this._ground = ground;

    // Material using vertex colors (no texture needed — colors from our terrain engine)
    const mat = new BABYLON.StandardMaterial("terrainMat", this.scene);
    mat.diffuseColor   = new BABYLON.Color3(1, 1, 1); // multiplied by vertex color
    mat.useVertexColors = true;
    mat.specularColor  = new BABYLON.Color3(0.04, 0.04, 0.04);
    mat.backFaceCulling = true;
    ground.material = mat;

    this._buildTerrain();

    // Tree meshes (instanced, placed per FOREST tile)
    this._buildTrees();
  }

  _buildTerrain() {
    const W = MAP_W, H = MAP_H;
    const game = this.game;
    const ground = this._ground;
    if (!ground) return;

    const subdivisions = W; // 64
    const vertsPerSide = subdivisions + 1; // 65

    const positions = ground.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice();
    const colors    = new Float32Array(vertsPerSide * vertsPerSide * 4);

    // Babylon.js ground: vertex (col, row) is at world:
    // x_local = -W/2 + col * (W/subdivisions)
    // z_local = H/2 - row * (H/subdivisions)
    // We offset the mesh by W/2 on x and H/2 on z so tile (0,0) is near world origin.
    // So tile tx≈col, ty≈row (clamped)

    for (let row = 0; row < vertsPerSide; row++) {
      for (let col = 0; col < vertsPerSide; col++) {
        const tx = Math.min(W - 1, col);
        const ty = Math.min(H - 1, row);
        const terrain = game.map.getTile(tx, ty);

        const vi  = row * vertsPerSide + col;
        const ci  = vi * 4;
        const pi  = vi * 3;

        // Height: average up to 4 touching tile heights for smooth slopes
        const getH = (ttx, tty) => {
          if (ttx < 0 || ttx >= W || tty < 0 || tty >= H) return 0;
          const t = game.map.getTile(ttx, tty);
          if (t === TERRAIN.WATER)    return -0.38;
          if (t === TERRAIN.MOUNTAIN) return  0.22;
          if (t === TERRAIN.FOREST)   return  0.06;
          if (t === TERRAIN.SAND)     return -0.02;
          return 0;
        };
        // Vertex (col, row) is touched by tiles at (col-1,row-1),(col,row-1),(col-1,row),(col,row)
        let sumH = 0, cnt = 0;
        for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 0; dx++) {
          sumH += getH(col + dx, row + dy); cnt++;
        }
        positions[pi + 1] = sumH / cnt;

        // Terrain color from our procedural system
        let r, g, b;
        if (terrain === TERRAIN.GRASS) {
          const c = game.map._grassColor(tx, ty);
          [r, g, b] = Scene3D._parseRgb(c);
        } else if (terrain === TERRAIN.DIRT) {
          const c = game.map._dirtColor(tx, ty);
          [r, g, b] = Scene3D._parseRgb(c);
        } else if (terrain === TERRAIN.SAND) {
          const c = game.map._sandColor(tx, ty);
          [r, g, b] = Scene3D._parseRgb(c);
        } else if (terrain === TERRAIN.MOUNTAIN) {
          const c = game.map._mountainColor(tx, ty);
          [r, g, b] = Scene3D._parseRgb(c);
        } else if (terrain === TERRAIN.WATER) {
          r = 0.18; g = 0.42; b = 0.78;
        } else if (terrain === TERRAIN.FOREST) {
          // Dark forest floor
          r = 0.22; g = 0.38; b = 0.18;
        } else {
          r = 0.4; g = 0.5; b = 0.3;
        }

        colors[ci]     = r;
        colors[ci + 1] = g;
        colors[ci + 2] = b;
        colors[ci + 3] = 1.0;
      }
    }

    ground.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
    ground.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors, true);
    ground.createNormals(true); // recalc normals for lighting after height change
    this._terrainBuilt = true;
  }

  static _parseRgb(cssRgb) {
    // Parse "rgb(r,g,b)" → [r/255, g/255, b/255]
    const m = cssRgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!m) return [0.5, 0.5, 0.5];
    return [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255];
  }

  // ── Trees ──────────────────────────────────────────────────
  _buildTrees() {
    // Remove old tree instances and masters
    this._treeInstances.forEach(m => m.dispose());
    this._treeInstances = [];
    if (this._treeMaster)  { this._treeMaster.dispose(); this._treeMaster = null; }
    if (this._treeMaster2) { this._treeMaster2.dispose(); this._treeMaster2 = null; }

    // Two tree varieties — dark pine and rounded deciduous
    const makeTremaster = (name, trunkH, canopyD, canopyY) => {
      const trunk = BABYLON.MeshBuilder.CreateCylinder(name + "Tr", {
        height: trunkH, diameterTop: 0.12, diameterBottom: 0.22, tessellation: 6
      }, this.scene);
      const canopy = BABYLON.MeshBuilder.CreateSphere(name + "Ca", {
        diameter: canopyD, segments: 6
      }, this.scene);
      canopy.position.y = canopyY;
      const master = BABYLON.Mesh.MergeMeshes([trunk, canopy], true, true);
      master.name = name;
      master.isVisible = false;
      const mat = new BABYLON.StandardMaterial(name + "Mat", this.scene);
      mat.diffuseColor  = new BABYLON.Color3(0.15, 0.36, 0.12);
      mat.specularColor = new BABYLON.Color3(0.02, 0.04, 0.02);
      master.material = mat;
      master.receiveShadows = true;
      this._shadows.addShadowCaster(master);
      return master;
    };
    const treeMaster  = makeTremaster("treeMasterA", 1.4, 1.6, 1.3);
    const treeMaster2 = makeTremaster("treeMasterB", 1.0, 2.0, 0.9);
    treeMaster2.material.diffuseColor = new BABYLON.Color3(0.18, 0.42, 0.16);

    this._shadows.addShadowCaster(treeMaster);

    // RNG seeded by tile position (matches our existing tree placement)
    const rng = (x, y, seed = 0) => (((x * 1664525 + y * 1013904223 + seed * 22695477) >>> 0) / 4294967295);

    let instCount = 0;
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        if (this.game.map.getTile(tx, ty) !== TERRAIN.FOREST) continue;

        // Skip forest border tiles (they're mostly hidden by other trees)
        if (tx < 3 || ty < 3 || tx >= MAP_W - 3 || ty >= MAP_H - 3) continue;

        const r1 = rng(tx, ty, 1);
        const r2 = rng(tx, ty, 2);
        const r3 = rng(tx, ty, 3);

        // Only place tree in ~65% of forest tiles (variation)
        if (r1 < 0.35) continue;

        // Alternate between two tree types based on position hash
        const master = (Math.round(tx * 1.7 + ty * 3.1) % 3 === 0) ? treeMaster2 : treeMaster;
        const inst = master.createInstance(`tree_${instCount++}`);
        inst.position.x = tx + 0.5 + (r1 - 0.5) * 0.55;
        inst.position.z = ty + 0.5 + (r2 - 0.5) * 0.55;
        inst.position.y = 0.06; // trunk base sits on terrain
        inst.scaling.setAll(0.65 + r3 * 0.55);
        inst.rotation.y = r1 * Math.PI * 2;
        inst.receiveShadows = true;
        this._shadows.addShadowCaster(inst);
        this._treeInstances.push(inst);
      }
    }

    this._treeMaster  = treeMaster;
    this._treeMaster2 = treeMaster2;
  }

  // ── Water ──────────────────────────────────────────────────
  _initWater() {
    // Build individual water tile planes (only where WATER tiles exist).
    // This is cleaner than a map-wide masked plane — no edge artifacts.
    const W = MAP_W, H = MAP_H;
    const waterTiles = [];
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (this.game.map.getTile(tx, ty) === TERRAIN.WATER) {
          waterTiles.push({ tx, ty });
        }
      }
    }

    const waterMat = new BABYLON.StandardMaterial("waterMat", this.scene);
    waterMat.diffuseColor  = new BABYLON.Color3(0.15, 0.40, 0.78);
    waterMat.specularColor = new BABYLON.Color3(0.9, 0.95, 1.0);
    waterMat.specularPower = 80;
    waterMat.alpha = 0.90;
    waterMat.backFaceCulling = false;
    this._waterMat = waterMat;

    // Create one quad per water tile (or merge for performance)
    // Merge all water tiles into a single mesh for one draw call
    const waterMeshes = waterTiles.map(({ tx, ty }) => {
      const m = BABYLON.MeshBuilder.CreateGround(`w_${tx}_${ty}`, {
        width: 1.05, height: 1.05, subdivisions: 1
      }, this.scene);
      m.position.x = tx + 0.5;
      m.position.y = -0.28;
      m.position.z = ty + 0.5;
      return m;
    });

    if (waterMeshes.length > 0) {
      const merged = BABYLON.Mesh.MergeMeshes(waterMeshes, true, true, undefined, false, false);
      if (merged) {
        merged.name = "waterMesh";
        merged.material = waterMat;
      }
      this._waterMesh = merged;
    }
  }

  // ── Fog of War Plane ───────────────────────────────────────
  _initFogPlane() {
    // Flat plane over entire map, vertex colors drive fog opacity
    const W = MAP_W, H = MAP_H;
    const fog = BABYLON.MeshBuilder.CreateGround("fogPlane", {
      width: W, height: H, subdivisions: W
    }, this.scene);
    fog.position.x = W / 2;
    fog.position.y = 3.0; // above everything
    fog.position.z = H / 2;

    const mat = new BABYLON.StandardMaterial("fogMat", this.scene);
    mat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    mat.useVertexColors = true;
    mat.backFaceCulling = false;
    mat.disableLighting = true;
    mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    mat.alpha = 1;
    fog.material = mat;
    fog.hasVertexAlpha = true; // REQUIRED for per-vertex alpha to work

    const vertsPerSide = W + 1;
    this._fogColors = new Float32Array(vertsPerSide * vertsPerSide * 4);
    this._fogMesh = fog;

    // Init fully black
    for (let i = 0; i < this._fogColors.length; i += 4) {
      this._fogColors[i]     = 0.04;
      this._fogColors[i + 1] = 0.03;
      this._fogColors[i + 2] = 0.05;
      this._fogColors[i + 3] = 1.0; // fully opaque black
    }
    fog.setVerticesData(BABYLON.VertexBuffer.ColorKind, this._fogColors, true);
  }

  _updateFogPlane() {
    if (!this._fogMesh || !this._fogColors) return;
    if (this.game.fog.disabled) {
      // No fog — make fully transparent
      for (let i = 0; i < this._fogColors.length; i += 4) {
        this._fogColors[i + 3] = 0;
      }
      this._fogMesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, this._fogColors, true);
      return;
    }

    const W = MAP_W, vertsPerSide = W + 1;
    const fog = this.game.fog;
    let changed = false;

    for (let row = 0; row < vertsPerSide; row++) {
      for (let col = 0; col < vertsPerSide; col++) {
        const tx = Math.min(W - 1, col);
        const ty = Math.min(vertsPerSide - 2, row);
        const vi = row * vertsPerSide + col;
        const ci = vi * 4;

        const fogState = fog.getState(tx, ty);
        let alpha;
        if (fogState === 2)      alpha = 0.0;   // visible — no fog
        else if (fogState === 1) alpha = 0.50;  // explored — grey shroud
        else                     alpha = 0.92;  // unseen — near black

        const prev = this._fogColors[ci + 3];
        if (Math.abs(prev - alpha) > 0.005) {
          // Smooth lerp towards target (faster = 0.15)
          this._fogColors[ci + 3] = prev + (alpha - prev) * 0.15;
          changed = true;
        }
        // Dark color under the fog
        this._fogColors[ci]     = 0.05;
        this._fogColors[ci + 1] = 0.04;
        this._fogColors[ci + 2] = 0.06;
      }
    }

    if (changed) {
      this._fogMesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, this._fogColors, true);
    }
  }

  // ── Materials ──────────────────────────────────────────────
  _getMat(key, diffuse, specular, alpha) {
    if (this._mats[key]) return this._mats[key];
    const mat = new BABYLON.StandardMaterial(key, this.scene);
    if (diffuse) mat.diffuseColor = diffuse;
    if (specular) mat.specularColor = specular; else mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
    if (alpha !== undefined) mat.alpha = alpha;
    this._mats[key] = mat;
    return mat;
  }

  _getPlayerColor(pid) {
    const hex = PLAYER_COLORS[pid] || '#888888';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new BABYLON.Color3(r, g, b);
  }

  // ── Building Meshes ─────────────────────────────────────────
  _getOrCreateBuilding(building) {
    if (this._buildingMeshes.has(building.id)) return this._buildingMeshes.get(building.id);
    const mesh = this._createBuildingMesh(building);
    this._buildingMeshes.set(building.id, mesh);
    return mesh;
  }

  _createBuildingMesh(building) {
    const def = building.def;
    const size = def.size || 2;
    const type = building.type;
    const pid  = building.playerId;
    const pc   = this._getPlayerColor(pid);

    const group = new BABYLON.Mesh(`bld_${building.id}`, this.scene);

    const addBox = (name, w, h, d, ox, oy, oz, color) => {
      const box = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
      box.position.x = ox;
      box.position.y = oy;
      box.position.z = oz;
      box.parent = group;
      const mat = new BABYLON.StandardMaterial(name + "_mat", this.scene);
      mat.diffuseColor = color || new BABYLON.Color3(0.7, 0.65, 0.55);
      mat.specularColor = new BABYLON.Color3(0.08, 0.08, 0.06);
      box.material = mat;
      box.receiveShadows = true;
      this._shadows.addShadowCaster(box);
      return box;
    };

    const stone   = new BABYLON.Color3(0.78, 0.72, 0.60); // warm cream stone
    const stoneD  = new BABYLON.Color3(0.62, 0.56, 0.46); // darker stone
    const wood    = new BABYLON.Color3(0.58, 0.40, 0.22);
    const thatch  = new BABYLON.Color3(0.74, 0.62, 0.34);
    const roof    = new BABYLON.Color3(0.52, 0.26, 0.14); // dark red roof tiles
    const slate   = new BABYLON.Color3(0.30, 0.28, 0.40); // dark slate roof

    if (type === 'TOWN_CENTER') {
      // Multi-layer grand castle with VISIBLE corner towers at actual corners
      const ct = size * 0.46; // corner tower offset (just inside corners)
      addBox("foundation", size, 0.5, size, 0, 0.25, 0, stoneD);
      addBox("base",       size*0.9, 1.5, size*0.9, 0, 1.25, 0, stone);
      addBox("keep",       size*0.55, 1.8, size*0.55, 0, 3.15, 0, stone);
      addBox("keepRoof",   size*0.58, 0.45, size*0.58, 0, 4.12, 0, slate);
      // 4 corner towers — placed at corners, taller than base to be visible
      [[-ct,-ct],[ct,-ct],[-ct,ct],[ct,ct]].forEach(([ox,oz],i) => {
        addBox(`tow${i}`,  0.65, 3.8, 0.65, ox, 1.9, oz, stone);
        addBox(`cap${i}`,  0.72, 0.40, 0.72, ox, 4.0, oz, stoneD); // battlement cap
        // merlon on each tower (small cube on top)
        for (let m = 0; m < 4; m++) {
          const mx = ox + (m < 2 ? -0.22 : 0.22);
          const mz = oz + (m % 2 === 0 ? -0.22 : 0.22);
          addBox(`mer${i}_${m}`, 0.18, 0.28, 0.18, mx, 4.44, mz, stone);
        }
      });
      addBox("flagBase", 0.10, 0.15, 0.10, 0, 4.45, 0, stoneD);
      addBox("flagpole", 0.06, 1.4, 0.06, 0, 5.15, 0, new BABYLON.Color3(0.7, 0.6, 0.4));
      addBox("flag",     0.55, 0.30, 0.04, 0.28, 5.6, 0, pc); // horizontal flag banner

    } else if (type === 'BARRACKS') {
      addBox("foundation", size, 0.4, size, 0, 0.2, 0, stoneD);
      addBox("walls",  size*0.9, 1.8, size*0.9, 0, 1.3, 0, stone);
      addBox("roof",   size*0.92, 0.55, size*0.92, 0, 2.28, 0, roof);
      // Watchtower on one corner
      addBox("wt",     0.60, 2.6, 0.60, size*0.35, 1.3, size*0.35, stone);
      addBox("wtTop",  0.65, 0.35, 0.65, size*0.35, 2.78, size*0.35, stoneD);
      addBox("flag",   0.06, 0.8, 0.06, size*0.35, 3.2, size*0.35, pc);

    } else if (type === 'ARCHERY_RANGE') {
      addBox("base",   size, 0.6, size, 0, 0.3, 0, wood);
      addBox("walls",  size*0.88, 1.4, size*0.88, 0, 1.3, 0, wood);
      addBox("roof",   size*0.92, 0.5, size*0.92, 0, 2.15, 0, thatch);
      addBox("tgt",    0.12, 0.8, 0.45, -size*0.38, 0.7, 0, new BABYLON.Color3(0.8,0.2,0.1)); // target dummy

    } else if (type === 'STABLE') {
      addBox("base",  size, 0.55, size, 0, 0.28, 0, wood);
      addBox("body",  size*0.88, 1.3, size*0.88, 0, 1.2, 0, wood);
      addBox("roof",  size*0.95, 0.55, size*0.95, 0, 2.08, 0, thatch);
      // Roof ridge
      addBox("ridge", size*0.9, 0.18, 0.25, 0, 2.44, 0, wood);

    } else if (type === 'SIEGE_WORKSHOP' || type === 'FACTORY') {
      addBox("base",   size, 0.6, size, 0, 0.3, 0, stoneD);
      addBox("body",   size*0.88, 1.5, size*0.88, 0, 1.35, 0, new BABYLON.Color3(0.45,0.42,0.38));
      addBox("roof",   size*0.9, 0.4, size*0.9, 0, 2.2, 0, new BABYLON.Color3(0.3,0.28,0.28));
      const nCh = type === 'FACTORY' ? 3 : 2;
      for (let c = 0; c < nCh; c++) {
        const cx = (c - (nCh-1)/2) * 0.65;
        addBox(`ch${c}`, 0.35, 1.8+c*0.3, 0.35, cx, 2.6+c*0.15, size*0.3,
          new BABYLON.Color3(0.28, 0.26, 0.26));
      }

    } else if (type === 'BLACKSMITH' || type === 'WEAPONRY') {
      addBox("base", size, 0.5, size, 0, 0.25, 0, stoneD);
      addBox("body", size*0.88, 1.3, size*0.88, 0, 1.15, 0, stone);
      addBox("forge",0.55, 0.9, 0.55, size*0.3, 0.95, size*0.3, new BABYLON.Color3(0.22,0.18,0.16));
      addBox("roof", size*0.92, 0.45, size*0.92, 0, 1.98, 0, thatch);

    } else if (type === 'MONASTERY') {
      addBox("nave",   size, 0.5, size*0.7, 0, 0.25, 0, stone);
      addBox("walls",  size*0.92, 1.8, size*0.68, 0, 1.4, 0, stone);
      addBox("roof",   size*0.94, 0.4, size*0.70, 0, 2.4, 0, slate);
      addBox("tower",  size*0.32, 3.0, size*0.32, 0, 1.5, 0, stone);
      addBox("spire",  0.18, 1.0, 0.18, 0, 3.5, 0, slate);

    } else if (type === 'TOWER') {
      addBox("base",  0.95, 0.55, 0.95, 0, 0.28, 0, stoneD);
      addBox("shaft", 0.80, 2.4,  0.80, 0, 1.75, 0, stone);
      addBox("top",   0.90, 0.45, 0.90, 0, 3.18, 0, stoneD);
      // 4 merlons
      [[0.3,0],[-0.3,0],[0,0.3],[0,-0.3]].forEach(([mx,mz],i) =>
        addBox(`m${i}`, 0.2, 0.32, 0.2, mx, 3.55, mz, stone));

    } else if (type === 'WALL') {
      addBox("wall",   1.0, 1.6, 0.38, 0, 0.8, 0, stone);
      addBox("merlL",  0.28, 0.35, 0.35, -0.32, 1.78, 0, stone);
      addBox("merlR",  0.28, 0.35, 0.35,  0.32, 1.78, 0, stone);

    } else if (type === 'HOUSE') {
      addBox("base", size, 0.55, size, 0, 0.28, 0, wood);
      addBox("body", size*0.9, 1.2, size*0.9, 0, 1.15, 0, new BABYLON.Color3(0.68,0.55,0.40));
      addBox("roof", size*0.95, 0.65, size*0.95, 0, 2.03, 0, roof);
      addBox("chimney", 0.28, 0.8, 0.28, size*0.28, 2.2, size*0.28, stoneD);

    } else if (type === 'FARM') {
      addBox("plot",  size*0.96, 0.08, size*0.96, 0, 0.04, 0, new BABYLON.Color3(0.42,0.30,0.16));
      addBox("fence1",size,      0.28, 0.10,       0, 0.14, size*0.47,  new BABYLON.Color3(0.52,0.38,0.20));
      addBox("fence2",size,      0.28, 0.10,       0, 0.14, -size*0.47, new BABYLON.Color3(0.52,0.38,0.20));
      addBox("fence3",0.10,      0.28, size,        size*0.47, 0.14, 0, new BABYLON.Color3(0.52,0.38,0.20));

    } else if (type === 'LUMBER_CAMP') {
      addBox("base", size, 0.5, size, 0, 0.25, 0, wood);
      addBox("roof", size*0.9, 0.45, size*0.9, 0, 0.93, 0, thatch);
      addBox("logpile", size*0.5, 0.4, 0.35, 0, 0.45, size*0.3, new BABYLON.Color3(0.5,0.32,0.18));

    } else if (type === 'MINING_CAMP') {
      addBox("base", size, 0.5, size, 0, 0.25, 0, stoneD);
      addBox("roof", size*0.9, 0.42, size*0.9, 0, 0.96, 0, thatch);
      addBox("cart", 0.6, 0.3, 0.4, 0, 0.3, -size*0.3, new BABYLON.Color3(0.52,0.38,0.20));

    } else if (type === 'MILL') {
      addBox("base", size, 0.55, size, 0, 0.28, 0, wood);
      addBox("body", size*0.7, 1.5, size*0.7, 0, 1.28, 0, new BABYLON.Color3(0.64,0.52,0.38));
      // Windmill sail cross (2 flat rectangles)
      addBox("sailH", 1.8, 0.08, 0.18, 0, 2.2, 0, wood);
      addBox("sailV", 0.18, 1.8, 0.08, 0, 2.2, 0, wood);

    } else {
      addBox("body", size, 1.2, size, 0, 0.6, 0, stone);
    }

    // Player color banner on important military buildings
    const militaryTypes = ['TOWN_CENTER','BARRACKS','ARCHERY_RANGE','STABLE','SIEGE_WORKSHOP','WEAPONRY','FACTORY'];
    if (militaryTypes.includes(type)) {
      // Already has flag in specific code above for TC/Barracks
      if (!['TOWN_CENTER','BARRACKS'].includes(type)) {
        addBox("flag",   0.06, 0.6, 0.06, 0, 2.6, 0, pc);
      }
    }

    this._shadows.addShadowCaster(group);
    return group;
  }

  // ── Unit Meshes ────────────────────────────────────────────
  _getOrCreateUnit(unit) {
    if (this._unitMeshes.has(unit.id)) return this._unitMeshes.get(unit.id);

    const pid  = unit.playerId;
    const pc   = this._getPlayerColor(pid);
    const cls  = unit.unitClass;

    // Body shape varies by unit class
    let bodyH = 0.72, bodyR = 0.22;
    if (cls === 'cavalry')  { bodyH = 0.90; bodyR = 0.28; }
    if (cls === 'siege')    { bodyH = 0.60; bodyR = 0.45; }
    if (cls === 'hero')     { bodyH = 0.88; bodyR = 0.26; }

    const body = BABYLON.MeshBuilder.CreateCylinder(`u${unit.id}_body`, {
      height: bodyH, diameter: bodyR * 2, tessellation: 8
    }, this.scene);

    const head = BABYLON.MeshBuilder.CreateSphere(`u${unit.id}_head`, {
      diameter: bodyR * 1.5, segments: 4
    }, this.scene);
    head.parent = body;
    head.position.y = bodyH * 0.65;

    // Material with player color
    const mat = new BABYLON.StandardMaterial(`u${unit.id}_mat`, this.scene);
    mat.diffuseColor  = pc;
    mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    body.material = mat;
    head.material = mat;

    body.receiveShadows = true;
    this._shadows.addShadowCaster(body);

    // Selection ring (flat cylinder, hidden by default)
    const ring = BABYLON.MeshBuilder.CreateTorus(`u${unit.id}_ring`, {
      diameter: bodyR * 3.5, thickness: 0.06, tessellation: 20
    }, this.scene);
    ring.parent = body;
    ring.position.y = -bodyH * 0.5 + 0.02;
    ring.rotation.x = Math.PI / 2;
    const ringMat = new BABYLON.StandardMaterial(`u${unit.id}_ringMat`, this.scene);
    ringMat.diffuseColor   = new BABYLON.Color3(0, 1, 0.4);
    ringMat.emissiveColor  = new BABYLON.Color3(0, 0.6, 0.3);
    ringMat.disableLighting = true;
    ring.material = ringMat;
    ring.isVisible = false;

    const meshGroup = { root: body, ring };
    this._unitMeshes.set(unit.id, meshGroup);
    return meshGroup;
  }

  // ── Resource Nodes ─────────────────────────────────────────
  _initResourceNodes() {
    this._resourceMeshes = new Map();
    for (const node of this.game.resourceNodes) {
      this._createResourceMesh(node);
    }
  }

  _createResourceMesh(node) {
    const type = node.nodeType; // 'TREE','GOLD_MINE','STONE_QUARRY','BERRY_BUSH'
    const tx = node.tileX, ty = node.tileY;
    let mesh;

    if (type === 'GOLD_MINE') {
      // Gold ore pile: 3 nugget spheres on a platform
      const base = BABYLON.MeshBuilder.CreateBox("gbase", {width:0.7,height:0.3,depth:0.7}, this.scene);
      base.position.set(tx+0.5, 0.15, ty+0.5);
      const mat = new BABYLON.StandardMaterial("goldMat",this.scene);
      mat.diffuseColor  = new BABYLON.Color3(0.85, 0.72, 0.15);
      mat.specularColor = new BABYLON.Color3(1.0, 0.9, 0.3);
      mat.specularPower = 32;
      mat.emissiveColor = new BABYLON.Color3(0.18, 0.14, 0.0);
      base.material = mat;
      this._shadows.addShadowCaster(base);
      // Extra nuggets
      [[0.15,0.15],[-0.15,0.1],[0.0,-0.2]].forEach(([ox,oz],i)=>{
        const n = BABYLON.MeshBuilder.CreateSphere(`gn${i}_${tx}`, {diameter:0.28,segments:4},this.scene);
        n.position.set(tx+0.5+ox, 0.42+i*0.04, ty+0.5+oz);
        n.material = mat;
        this._shadows.addShadowCaster(n);
      });
      mesh = base;

    } else if (type === 'STONE_QUARRY') {
      // Rock cluster
      const mat = new BABYLON.StandardMaterial("stoneMat",this.scene);
      mat.diffuseColor  = new BABYLON.Color3(0.60, 0.58, 0.55);
      mat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
      [[0,0,0.55],[0.25,0.05,0.4],[-0.2,0.02,0.38],[0.1,0.08,0.3]].forEach(([ox,oy,sc],i)=>{
        const r = BABYLON.MeshBuilder.CreateBox(`sr${i}_${tx}`,
          {width:sc,height:sc*0.75,depth:sc*0.9},this.scene);
        r.rotation.y = i * 0.8;
        r.position.set(tx+0.5+ox, sc*0.375, ty+0.5+(i*0.18-0.25));
        r.material = mat;
        this._shadows.addShadowCaster(r);
      });
      mesh = BABYLON.MeshBuilder.CreateBox(`srbase_${tx}`,{width:0.1,height:0.1,depth:0.1},this.scene);
      mesh.position.set(tx+0.5, 0, ty+0.5);
      mesh.isVisible = false;

    } else if (type === 'BERRY_BUSH') {
      const mat = new BABYLON.StandardMaterial("berryMat",this.scene);
      mat.diffuseColor  = new BABYLON.Color3(0.20, 0.50, 0.18);
      const bmat = new BABYLON.StandardMaterial("berryFruitMat",this.scene);
      bmat.diffuseColor = new BABYLON.Color3(0.75, 0.15, 0.20);
      bmat.emissiveColor= new BABYLON.Color3(0.15, 0.0, 0.0);
      const bush = BABYLON.MeshBuilder.CreateSphere(`bush_${tx}`,{diameter:0.65,segments:5},this.scene);
      bush.position.set(tx+0.5, 0.32, ty+0.5);
      bush.material = mat;
      this._shadows.addShadowCaster(bush);
      // berries
      for(let b=0;b<5;b++){
        const ang = b/5*Math.PI*2;
        const berry = BABYLON.MeshBuilder.CreateSphere(`bry${b}_${tx}`,{diameter:0.14,segments:3},this.scene);
        berry.position.set(tx+0.5+Math.cos(ang)*0.28, 0.38, ty+0.5+Math.sin(ang)*0.28);
        berry.material = bmat;
      }
      mesh = bush;

    } else {
      // TREE resource node — small stump indicator
      mesh = BABYLON.MeshBuilder.CreateCylinder(`rtree_${tx}`,
        {height:0.3,diameter:0.35,tessellation:6},this.scene);
      mesh.position.set(tx+0.5, 0.15, ty+0.5);
      const mat = new BABYLON.StandardMaterial("stumpMat",this.scene);
      mat.diffuseColor = new BABYLON.Color3(0.45, 0.30, 0.18);
      mesh.material = mat;
      this._shadows.addShadowCaster(mesh);
    }

    this._resourceMeshes.set(node, mesh);
    return mesh;
  }

  _syncResourceNodes() {
    for (const [node, mesh] of this._resourceMeshes) {
      if (!mesh) continue;
      const pct = node.amount / RESOURCE_NODE_TYPES[node.nodeType].maxAmount;
      mesh.scaling.setAll(Math.max(0.3, pct)); // shrink as depleted
      mesh.setEnabled(!node.depleted && this.game.fog.isSeen(node.tileX, node.tileY));
    }
  }

  // ── Sync: update 3D scene from game state ─────────────────
  sync(dt) {
    this._waterTime += dt;
    // Animate water shimmer
    if (this._waterMat) {
      const wave = 0.5 + 0.5 * Math.sin(this._waterTime / 900);
      this._waterMat.specularPower = 50 + wave * 80;
      this._waterMat.alpha = 0.82 + wave * 0.10;
      this._waterMat.diffuseColor = new BABYLON.Color3(
        0.12 + wave * 0.05, 0.38 + wave * 0.06, 0.76 + wave * 0.06);
    }

    this._updateCameraFromKeys(dt);
    this._syncBuildings();
    this._syncUnits();
    this._syncProjectiles();
    this._syncResourceNodes();
    this._updateFogPlane();
  }

  _syncBuildings() {
    const game = this.game;
    const S    = TILE_SIZE;

    for (const b of game.buildings) {
      if (b.dead) {
        const m = this._buildingMeshes.get(b.id);
        if (m) { m.dispose ? m.dispose() : m.getChildren().forEach(c => c.dispose()); this._buildingMeshes.delete(b.id); }
        continue;
      }

      const mesh = this._getOrCreateBuilding(b);
      if (!mesh) continue;

      // Position at tile center
      const cx = b.tileX + b.def.size / 2;
      const cy = b.tileY + b.def.size / 2;
      mesh.position.x = cx;
      mesh.position.z = cy;
      mesh.position.y = 0;

      // Fade in while under construction
      const alpha = b.built ? 1.0 : 0.4 + (b.buildProgress / b.buildTime) * 0.6;
      mesh.getChildren(undefined, false).forEach(child => {
        if (child.material) child.material.alpha = alpha;
      });
    }
  }

  _syncUnits() {
    const game = this.game;
    const S = TILE_SIZE;
    const sel = game.selection ? game.selection.selected : new Set();

    for (const u of game.units) {
      if (u.dead || u.garrisoned) {
        const g = this._unitMeshes.get(u.id);
        if (g) { g.root.dispose(); this._unitMeshes.delete(u.id); }
        continue;
      }

      const g = this._getOrCreateUnit(u);
      if (!g) continue;

      // Convert sim coords to tile-space 3D
      g.root.position.x = u.x / S;
      g.root.position.z = u.y / S;

      // Slight bob animation for moving units
      if (u.state === UNIT_STATE.MOVING || u.state === UNIT_STATE.GATHERING) {
        g.root.position.y = 0.36 + Math.abs(Math.sin(performance.now() / 150 + u.id)) * 0.06;
      } else {
        g.root.position.y = 0.36;
      }

      // Face direction of movement
      if (u.facing !== undefined) {
        // Convert 2D facing angle to 3D Y-axis rotation
        // In sim space: angle 0 = right (+x), PI/2 = down (+y)
        // In 3D space: angle 0 = +Z, PI/2 = +X
        g.root.rotation.y = -(u.facing - Math.PI / 2);
      }

      // Fog visibility
      const visible = game.fog.isWorldVisible(u.x, u.y) || u.playerId === 0;
      g.root.setEnabled(visible);

      // Selection ring
      const isSelected = sel.has(u);
      g.ring.isVisible = isSelected;
      if (isSelected) {
        const pulse = 0.7 + 0.3 * Math.sin(performance.now() / 200);
        g.ring.material.emissiveColor = new BABYLON.Color3(0, pulse * 0.6, pulse * 0.3);
      }

      // HP bar as thin box above unit (updated every frame)
      if (!g.hpBg) {
        g.hpBg = BABYLON.MeshBuilder.CreateBox(`u${u.id}_hpbg`, { width: 0.5, height: 0.04, depth: 0.04 }, this.scene);
        g.hpBg.parent = g.root;
        g.hpBg.position.y = 0.7;
        g.hpBg.material = this._getMat("hpBgMat", new BABYLON.Color3(0.2, 0.05, 0.05));
        g.hpBg.material.disableLighting = true;

        g.hpFg = BABYLON.MeshBuilder.CreateBox(`u${u.id}_hpfg`, { width: 0.5, height: 0.04, depth: 0.06 }, this.scene);
        g.hpFg.parent = g.root;
        g.hpFg.position.y = 0.72;
        g.hpFg.material = new BABYLON.StandardMaterial(`u${u.id}_hpfgM`, this.scene);
        g.hpFg.material.diffuseColor = new BABYLON.Color3(0.1, 0.9, 0.1);
        g.hpFg.material.disableLighting = true;
      }
      const hpFrac = u.hp / u.maxHp;
      g.hpFg.scaling.x = Math.max(0.01, hpFrac);
      g.hpFg.position.x = -(0.5 - 0.5 * hpFrac) / 2; // left-align bar
      const hpColor = hpFrac > 0.5 ? new BABYLON.Color3(0.1, 0.9, 0.1) : hpFrac > 0.25 ? new BABYLON.Color3(0.9, 0.8, 0.1) : new BABYLON.Color3(0.9, 0.1, 0.1);
      g.hpFg.material.diffuseColor = hpColor;
      // Only show HP bar when damaged or selected
      const showHp = hpFrac < 1.0 || isSelected;
      g.hpBg.isVisible = showHp;
      g.hpFg.isVisible = showHp;
    }

    // Remove meshes for dead units
    for (const [id, g] of this._unitMeshes) {
      const u = game.units.find(u => u.id === id);
      if (!u) {
        if (g.hpBg) g.hpBg.dispose();
        if (g.hpFg) g.hpFg.dispose();
        g.root.dispose();
        this._unitMeshes.delete(id);
      }
    }
  }

  _syncProjectiles() {
    const game = this.game;
    const S = TILE_SIZE;

    // Clean up dead projectiles
    for (const [proj, mesh] of this._projMeshes) {
      if (proj.dead || !game.projectiles.includes(proj)) {
        mesh.dispose();
        this._projMeshes.delete(proj);
      }
    }

    // Create/update active projectiles
    for (const proj of game.projectiles) {
      if (proj.dead) continue;
      let mesh = this._projMeshes.get(proj);
      if (!mesh) {
        const r = proj.isSiege ? 0.18 : 0.1;
        mesh = BABYLON.MeshBuilder.CreateSphere(`proj_${proj.x}`, { diameter: r * 2, segments: 4 }, this.scene);
        const mat = new BABYLON.StandardMaterial("projMat", this.scene);
        mat.diffuseColor  = proj.isSiege ? new BABYLON.Color3(1, 0.4, 0.1) : new BABYLON.Color3(1, 0.95, 0.4);
        mat.emissiveColor = proj.isSiege ? new BABYLON.Color3(0.8, 0.2, 0) : new BABYLON.Color3(0.5, 0.5, 0.1);
        mesh.material = mat;
        this._projMeshes.set(proj, mesh);
      }
      mesh.position.x = proj.x / S;
      mesh.position.y = 0.5 + (proj.arc ? proj.maxHeight * Math.sin(proj.progress * Math.PI) / S * 2 : 0.3);
      mesh.position.z = proj.y / S;
    }
  }

  // ── Camera Patching (bridge to existing Camera/InputManager) ──
  _patchGameCamera() {
    const game    = this.game;
    const self    = this;
    const origCam = game.camera;

    // Override screenToWorld to use Babylon.js picking
    origCam.screenToWorld = (sx, sy) => {
      // Pick against terrain plane at y=0
      const pick = self.scene.pick(sx, sy - UI_TOP_H, m => m.name === 'terrain');
      if (pick && pick.hit && pick.pickedPoint) {
        const tx = pick.pickedPoint.x;
        const ty = pick.pickedPoint.z;
        // Convert tile coords → sim pixel coords → iso world coords
        const simX = tx * TILE_SIZE;
        const simY = ty * TILE_SIZE;
        const iso = simToIso(simX, simY);
        return { wx: iso.x, wy: iso.y };
      }
      // Fallback: project to ground plane manually
      return { wx: sx, wy: sy };
    };

    // Override pan to move 3D camera
    origCam.pan = (dx, dy) => {
      const spd = (self._camZoom * 2) / self.glCanvas.height;
      self._camTarget.x -= (dx + dy) * spd * 0.5;
      self._camTarget.z -= (dy - dx) * spd * 0.5;
      self._clampCamera();
      self.camera3d.target.x = self._camTarget.x;
      self.camera3d.target.z = self._camTarget.z;
    };

    // Override zoom
    origCam.zoom_ = (delta) => {
      const factor = delta > 0 ? 0.9 : 1.1;
      self._camZoom = Math.max(8, Math.min(40, self._camZoom * factor));
      self._applyOrtho();
      origCam.zoom = Math.max(0.3, Math.min(2.0, origCam.zoom * (delta > 0 ? 1.15 : 0.87)));
    };

    // Override centerOn: move 3D camera target
    origCam.centerOn = (wx, wy) => {
      // wx/wy are iso world coords; convert back to sim then to tile
      const sim = isoToSim(wx, wy);
      self._camTarget.x = sim.x / TILE_SIZE;
      self._camTarget.z = sim.y / TILE_SIZE;
      self._clampCamera();
      self.camera3d.target.x = self._camTarget.x;
      self.camera3d.target.z = self._camTarget.z;
      // Zoom in for a good close-up view of the base
      self._camZoom = 10;
      self._applyOrtho();
    };

    // Override update to do nothing (3D camera managed by Scene3D)
    origCam.update = () => {};
  }

  // ── Render Loop ────────────────────────────────────────────
  _startRenderLoop() {
    let lastTime = performance.now();
    const game = this.game;

    this.engine.runRenderLoop(() => {
      const now  = performance.now();
      const dt   = Math.min(now - lastTime, 100);
      lastTime   = now;

      // Run game logic (fixed timestep, same as before)
      if (game.running && !game.gameOver) {
        game.accumulator += dt;
        while (game.accumulator >= game.LOGIC_TICK) {
          game.update(game.LOGIC_TICK);
          game.accumulator -= game.LOGIC_TICK;
        }
      }

      // Age advance banner timer
      if (game._ageAdvanceTimer > 0) game._ageAdvanceTimer -= dt;

      // Sync 3D scene with game state
      this.sync(dt);

      // Render 3D scene
      this.scene.render();

      // Render 2D UI overlay on top
      if (game.ui && game._uiCtx) {
        const ctx = game._uiCtx;
        const canvas = game._uiCanvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        game.ui.render(ctx);
        if (game.buildMenuOpen) game.ui.renderBuildMenu(ctx, canvas.width, canvas.height);
        if (game._ageAdvanceTimer > 0) game._renderAgeAdvanceBanner(ctx, canvas.width, canvas.height);
        if (game.gameOver) game._renderGameOver(ctx, canvas.width, canvas.height);
        // Selection drag box
        if (game.input && game.input.isDragging) {
          ctx.save();
          ctx.strokeStyle = '#44ff88';
          ctx.lineWidth = 1.5;
          ctx.fillStyle = 'rgba(50,200,100,0.08)';
          const x = Math.min(game.input.dragStartX, game.input.dragEndX);
          const y = Math.min(game.input.dragStartY, game.input.dragEndY);
          const w = Math.abs(game.input.dragEndX - game.input.dragStartX);
          const h = Math.abs(game.input.dragEndY - game.input.dragStartY);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        }
      }

      // Track FPS
      game._fpsFrames++;
      game._fpsTimer += dt;
      if (game._fpsTimer >= 1000) {
        game.fps = game._fpsFrames;
        game._fpsFrames = 0;
        game._fpsTimer = 0;
      }
    });
  }
}
