// ─────────────────────────────────────────────
//  GameScene – main gameplay
//  Manages: map, units, buildings, resources,
//           input, fog-of-war, minimap, AI
// ─────────────────────────────────────────────
import {
    TILE_SIZE, MAP_W, MAP_H, WORLD_W, WORLD_H,
    T, TILE_WALKABLE, TILE_SPEED,
    UNIT_DEF, BUILDING_DEF, BUILD_ORDER,
    INCOME_TICK, FOG_UPDATE_INTERVAL, MINIMAP_UPDATE_INT,
} from '../config.js';
import { generateMap } from '../MapGen.js';
import { buildWalkGrid } from '../Pathfinder.js';
import Unit from '../entities/Unit.js';
import Building from '../entities/Building.js';
import ResourceNode from '../entities/ResourceNode.js';
import SelectionMgr from '../systems/SelectionMgr.js';
import AIController from '../systems/AIController.js';
import { sfxShoot, sfxTankShoot, sfxExplosion, sfxBuild, sfxTrainComplete, sfxAlert, sfxVictory, sfxDefeat, toggleMute } from '../Sound.js';

const SCREEN_W = 1280, SCREEN_H = 720;
const EDGE_SCROLL_SPEED = 380;
const EDGE_MARGIN = 30;
const CAM_ZOOM = 1.0;

// Fog states
const FOG_HIDDEN   = 0;
const FOG_EXPLORED = 1;
const FOG_VISIBLE  = 2;

export default class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    // ── Init ─────────────────────────────────
    init(data) {
        this.scenario = data.scenario;
    }

    create() {
        const scen = this.scenario;

        // Map data
        const { tiles, nodeList } = generateMap(scen.mapSeed, scen.mapType, MAP_W, MAP_H);
        this.tiles    = tiles;
        this.mapW     = MAP_W;
        this.mapH     = MAP_H;
        this.tileSize = TILE_SIZE;

        // Occupancy grid (which tiles have buildings on them)
        this.occupied = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));

        // Fog grid
        this.fogGrid = Array.from({ length: MAP_H }, () => new Uint8Array(MAP_W).fill(FOG_HIDDEN));

        // Entity arrays
        this.playerUnits     = [];
        this.enemyUnits      = [];
        this.playerBuildings = [];
        this.enemyBuildings  = [];
        this.resourceNodes   = [];
        this.projectiles     = [];

        // Player resources
        this.res = { ...scen.playerRes };

        // AI resources
        this.aiRes = { oil: 500, food: 500, steel: 500, money: 800 };

        // Build walkability grid
        this.walkGrid = buildWalkGrid(tiles, this.occupied, MAP_W, MAP_H, TILE_WALKABLE);

        // Rendering layers (use world coords)
        this._buildMapLayer();
        this._buildFogLayer();

        // Resource nodes
        for (const n of nodeList) {
            const node = new ResourceNode(this, n.type, n.tx, n.ty);
            this.resourceNodes.push(node);
        }

        // Place starting entities
        this._placeStartingEntities(scen);

        // Camera
        this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
        this.cameras.main.setZoom(CAM_ZOOM);
        // Start camera near player base (bottom-left)
        this.cameras.main.centerOn(
            8 * TILE_SIZE + SCREEN_W / 2,
            (MAP_H - 12) * TILE_SIZE
        );

        // Input
        this._setupInput();

        // Selection manager
        this.selMgr = new SelectionMgr(this);

        // AI – share the same resource object so workers & AI both update it
        this.aiRes = { oil: 500, food: 500, steel: 500, money: 800 };
        this.ai = new AIController(this, scen.difficulty);
        this.ai.res = this.aiRes; // shared reference

        // Timers
        this._fogTimer     = 0;
        this._mmTimer      = 0;
        this._incomeTimer  = 0;
        this._expireProj   = [];

        // Move marker
        this._moveMarker     = null;
        this._moveMarkerTime = 0;

        // Building placement mode
        this._placingType   = null;
        this._placePreview  = null;

        // Objectives tracking
        this.objectives = scen.objectives.map(o => ({ text: o, done: false }));
        this.wavesSurvived = 0;

        // Minimap
        this._buildMinimap();

        // Scene events
        this.events.on('trainDone', (b, type) => { });
        this.events.on('buildingDestroyed', (b) => this._onBuildingDestroyed(b));
        this.events.on('aiAttackWave', (n) => {
            this.wavesSurvived = n - 1;
            sfxAlert();
            this.scene.get('UIScene')?.events.emit('waveAlert', n);
        });
        this.events.on('trainDone', () => sfxTrainComplete());

        // Notifications layer (text above everything)
        this._notifText = this.add.text(SCREEN_W / 2, 100, '', {
            fontSize: '22px', fontFamily: 'Courier New, monospace',
            fill: '#ff4444', stroke: '#000', strokeThickness: 3, align: 'center',
        }).setScrollFactor(0).setDepth(200).setOrigin(0.5).setAlpha(0);

        // Fade in
        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    // ── Map rendering ─────────────────────────
    _buildMapLayer() {
        const tileKeys = {
            [T.GRASS]:    'tile_grass',
            [T.DIRT]:     'tile_dirt',
            [T.SAND]:     'tile_sand',
            [T.WATER]:    'tile_water',
            [T.FOREST]:   'tile_forest',
            [T.MOUNTAIN]: 'tile_mountain',
            [T.ROAD]:     'tile_road',
        };

        // Individual Image per tile – Phaser camera culling handles performance automatically
        for (let ty = 0; ty < MAP_H; ty++) {
            for (let tx = 0; tx < MAP_W; tx++) {
                const tileType = this.tiles[ty][tx];
                const key = tileKeys[tileType] || 'tile_grass';
                this.add.image(
                    tx * TILE_SIZE + TILE_SIZE / 2,
                    ty * TILE_SIZE + TILE_SIZE / 2,
                    key
                ).setDepth(0);
            }
        }
    }

    // ── Fog of war layer ──────────────────────
    _buildFogLayer() {
        // Use a Graphics object – fillRect batching is much faster than RenderTexture draws
        this.fogGfx = this.add.graphics().setDepth(50);
        // Initial state: fully black everywhere
        this.fogGfx.fillStyle(0x000000, 1);
        this.fogGfx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    _updateFog() {
        const markVisible = (cx, cy, sightTiles) => {
            const sr = sightTiles;
            for (let dy = -sr; dy <= sr; dy++) {
                for (let dx = -sr; dx <= sr; dx++) {
                    if (dx * dx + dy * dy > sr * sr) continue;
                    const tx = cx + dx, ty = cy + dy;
                    if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
                        if (this.fogGrid[ty][tx] < FOG_VISIBLE)
                            this.fogGrid[ty][tx] = FOG_VISIBLE;
                    }
                }
            }
        };

        // Mark previously visible as explored
        for (let ty = 0; ty < MAP_H; ty++) {
            for (let tx = 0; tx < MAP_W; tx++) {
                if (this.fogGrid[ty][tx] === FOG_VISIBLE)
                    this.fogGrid[ty][tx] = FOG_EXPLORED;
            }
        }

        // Re-mark visible from current unit/building positions
        for (const u of this.playerUnits) {
            if (u.dead) continue;
            markVisible(Math.floor(u.x / TILE_SIZE), Math.floor(u.y / TILE_SIZE),
                        Math.ceil(UNIT_DEF[u.type].sight));
        }
        for (const b of this.playerBuildings) {
            if (b.dead) continue;
            markVisible(Math.floor(b.x / TILE_SIZE), Math.floor(b.y / TILE_SIZE), 5);
        }

        // Redraw fog overlay using batched fillRect calls (2 passes for 2 alpha levels)
        this.fogGfx.clear();

        this.fogGfx.fillStyle(0x000000, 1);
        for (let ty = 0; ty < MAP_H; ty++) {
            for (let tx = 0; tx < MAP_W; tx++) {
                if (this.fogGrid[ty][tx] === FOG_HIDDEN) {
                    this.fogGfx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        this.fogGfx.fillStyle(0x000000, 0.55);
        for (let ty = 0; ty < MAP_H; ty++) {
            for (let tx = 0; tx < MAP_W; tx++) {
                if (this.fogGrid[ty][tx] === FOG_EXPLORED) {
                    this.fogGfx.fillRect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // Show/hide enemy units based on fog
        for (const u of this.enemyUnits) {
            if (u.dead) continue;
            const tx = Math.floor(u.x / TILE_SIZE);
            const ty = Math.floor(u.y / TILE_SIZE);
            const vis = ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W &&
                        this.fogGrid[ty][tx] === FOG_VISIBLE;
            u.sprite.setVisible(vis);
            u.hpBg.setVisible(vis);
            u.hpBar.setVisible(vis);
        }
        for (const b of this.enemyBuildings) {
            if (b.dead) continue;
            const tx = Math.floor(b.x / TILE_SIZE);
            const ty = Math.floor(b.y / TILE_SIZE);
            const vis = ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W &&
                        this.fogGrid[ty][tx] === FOG_VISIBLE;
            b.sprite.setVisible(vis);
            b.hpBg.setVisible(vis);
            b.hpBar.setVisible(vis);
        }
    }

    // ── Minimap ───────────────────────────────
    _buildMinimap() {
        const MM_W = 200, MM_H = 150;
        this.mmW = MM_W; this.mmH = MM_H;
        const mmX = SCREEN_W - MM_W - 10;
        const mmY = SCREEN_H - MM_H - 10;

        this.mmRT = this.add.renderTexture(mmX, mmY, MM_W, MM_H)
            .setScrollFactor(0).setDepth(150).setOrigin(0, 0);

        // Border
        this.mmBorder = this.add.graphics()
            .setScrollFactor(0).setDepth(151);
        this.mmBorder.lineStyle(2, 0x00ff88, 0.7);
        this.mmBorder.strokeRect(mmX, mmY, MM_W, MM_H);

        this.mmX = mmX; this.mmY = mmY;

        // Camera rect on minimap
        this.mmCamRect = this.add.graphics().setScrollFactor(0).setDepth(152);

        // Click minimap to jump camera
        const mmZone = this.add.zone(mmX, mmY, MM_W, MM_H)
            .setScrollFactor(0).setDepth(153)
            .setOrigin(0, 0).setInteractive();
        mmZone.on('pointerdown', (ptr) => {
            const lx = ptr.x - mmX, ly = ptr.y - mmY;
            const wx = (lx / MM_W) * WORLD_W;
            const wy = (ly / MM_H) * WORLD_H;
            this.cameras.main.centerOn(wx, wy);
        });

        this._renderMinimap();
    }

    _renderMinimap() {
        const MM_W = this.mmW, MM_H = this.mmH;
        const scaleX = MM_W / WORLD_W;
        const scaleY = MM_H / WORLD_H;

        const g = this.make.graphics({ x: 0, y: 0, add: false });

        // Terrain
        const tileColors = {
            [T.GRASS]:    0x3a6a2a,
            [T.DIRT]:     0x7a5d10,
            [T.SAND]:     0xc4963a,
            [T.WATER]:    0x1a5a8a,
            [T.FOREST]:   0x1e4012,
            [T.MOUNTAIN]: 0x555555,
            [T.ROAD]:     0x445555,
        };

        for (let ty = 0; ty < MAP_H; ty++) {
            for (let tx = 0; tx < MAP_W; tx++) {
                const state = this.fogGrid[ty][tx];
                if (state === FOG_HIDDEN) continue;
                const col = tileColors[this.tiles[ty][tx]] || 0x3a6a2a;
                const alpha = state === FOG_EXPLORED ? 0.5 : 1;
                g.fillStyle(col, alpha);
                g.fillRect(
                    Math.floor(tx * TILE_SIZE * scaleX),
                    Math.floor(ty * TILE_SIZE * scaleY),
                    Math.ceil(TILE_SIZE * scaleX) + 1,
                    Math.ceil(TILE_SIZE * scaleY) + 1
                );
            }
        }

        // Resource nodes
        g.fillStyle(0xffcc00, 0.9);
        for (const n of this.resourceNodes) {
            if (!n.depleted) {
                g.fillRect(
                    Math.floor(n.tx * TILE_SIZE * scaleX) - 1,
                    Math.floor(n.ty * TILE_SIZE * scaleY) - 1,
                    4, 4
                );
            }
        }

        // Player buildings
        for (const b of this.playerBuildings) {
            if (b.dead) continue;
            g.fillStyle(0x00aaff, 1);
            g.fillRect(
                Math.floor(b.x * scaleX) - 3,
                Math.floor(b.y * scaleY) - 3,
                6, 6
            );
        }

        // Enemy buildings (if visible)
        for (const b of this.enemyBuildings) {
            if (b.dead || !b.sprite.visible) continue;
            g.fillStyle(0xff3300, 1);
            g.fillRect(
                Math.floor(b.x * scaleX) - 3,
                Math.floor(b.y * scaleY) - 3,
                6, 6
            );
        }

        // Player units (dots)
        g.fillStyle(0x44ddff, 1);
        for (const u of this.playerUnits) {
            if (u.dead) continue;
            g.fillRect(Math.floor(u.x * scaleX) - 1, Math.floor(u.y * scaleY) - 1, 3, 3);
        }

        // Enemy units (visible only)
        g.fillStyle(0xff6644, 1);
        for (const u of this.enemyUnits) {
            if (u.dead || !u.sprite.visible) continue;
            g.fillRect(Math.floor(u.x * scaleX) - 1, Math.floor(u.y * scaleY) - 1, 3, 3);
        }

        g.generateTexture('__mm_tex__', MM_W, MM_H);
        g.destroy();

        this.mmRT.clear();
        this.mmRT.draw('__mm_tex__', 0, 0);

        // Camera viewport rect
        const cam = this.cameras.main;
        this.mmCamRect.clear();
        this.mmCamRect.lineStyle(1, 0xffffff, 0.6);
        this.mmCamRect.strokeRect(
            this.mmX + cam.worldView.x * scaleX,
            this.mmY + cam.worldView.y * scaleY,
            cam.worldView.width  * scaleX,
            cam.worldView.height * scaleY
        );
    }

    // ── Starting entities ─────────────────────
    _placeStartingEntities(scen) {
        // Player base – bottom-left
        const pBaseX = 5, pBaseY = MAP_H - 10;
        this.placeBuilding('command_center', pBaseX, pBaseY, true);

        // Enemy base – top-right
        const eBaseX = MAP_W - 10, eBaseY = 4;
        this.placeBuilding('command_center', eBaseX, eBaseY, false);

        // Starting player units
        const units = scen.startingUnits || { worker: 3, soldier: 2 };
        Object.entries(units).forEach(([type, count]) => {
            for (let i = 0; i < count; i++) {
                const wx = (pBaseX + 5 + i * 1.5) * TILE_SIZE;
                const wy = (pBaseY + 2 + Math.floor(i / 3)) * TILE_SIZE;
                this.spawnUnit(type, wx, wy, true);
            }
        });

        // Enemy starting units
        ['worker', 'worker', 'worker', 'soldier', 'soldier'].forEach((type, i) => {
            const wx = (eBaseX - 3 - (i % 3) * 1.5) * TILE_SIZE;
            const wy = (eBaseY + 4 + Math.floor(i / 3)) * TILE_SIZE;
            this.spawnUnit(type, wx, wy, false);
        });

        // AI buildings (pre-built)
        this.placeBuilding('barracks', eBaseX - 7, eBaseY + 2, false);
        this.placeBuilding('farm',     eBaseX - 4, eBaseY + 7, false);
    }

    // ── Spawn helpers ─────────────────────────
    spawnUnit(type, worldX, worldY, isPlayer) {
        const u = new Unit(this, type, worldX, worldY, isPlayer);
        // Assign home building
        const buildings = isPlayer ? this.playerBuildings : this.enemyBuildings;
        u.homeBuilding = buildings.find(b => b.type === 'command_center') || buildings[0];
        if (isPlayer) this.playerUnits.push(u);
        else          this.enemyUnits.push(u);
        return u;
    }

    placeBuilding(type, tileX, tileY, isPlayer) {
        const def  = BUILDING_DEF[type];
        const size = def.size;

        // Mark tiles as occupied
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                if (tileX + dx < MAP_W && tileY + dy < MAP_H) {
                    this.occupied[tileY + dy][tileX + dx] = true;
                }
            }
        }
        this._rebuildWalkGrid();

        const b = new Building(this, type, tileX, tileY, isPlayer);
        if (isPlayer) this.playerBuildings.push(b);
        else          this.enemyBuildings.push(b);
        return b;
    }

    canPlaceBuilding(tileX, tileY, size) {
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = tileX + dx, ty = tileY + dy;
                if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
                if (!TILE_WALKABLE[this.tiles[ty][tx]])  return false;
                if (this.occupied[ty][tx]) return false;
            }
        }
        return true;
    }

    freeOccupied(tileX, tileY, size) {
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const tx = tileX + dx, ty = tileY + dy;
                if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) {
                    this.occupied[ty][tx] = false;
                }
            }
        }
        this._rebuildWalkGrid();
    }

    _rebuildWalkGrid() {
        this.walkGrid = buildWalkGrid(this.tiles, this.occupied, MAP_W, MAP_H, TILE_WALKABLE);
    }

    // ── Resource management ───────────────────
    addResource(type, amount) {
        this.res[type] = (this.res[type] || 0) + amount;
        this.scene.get('UIScene')?.events.emit('resUpdate', this.res);
    }

    canAfford(cost) {
        for (const [k, v] of Object.entries(cost)) {
            if ((this.res[k] || 0) < v) return false;
        }
        return true;
    }

    spendResources(cost) {
        for (const [k, v] of Object.entries(cost)) {
            this.res[k] = Math.max(0, (this.res[k] || 0) - v);
        }
        this.scene.get('UIScene')?.events.emit('resUpdate', this.res);
    }

    _doPassiveIncome() {
        for (const b of this.playerBuildings) {
            if (b.dead || !b.income) continue;
            for (const [res, amt] of Object.entries(b.income)) {
                this.res[res] = (this.res[res] || 0) + amt;
            }
        }
        this.scene.get('UIScene')?.events.emit('resUpdate', this.res);
    }

    // ── Projectile system ─────────────────────
    spawnProjectile(attacker, target) {
        const sx = attacker.sprite ? attacker.sprite.x : attacker.x;
        const sy = attacker.sprite ? attacker.sprite.y : attacker.y;
        const tx = target.sprite   ? target.sprite.x   : target.x;
        const ty = target.sprite   ? target.sprite.y   : target.y;

        // Choose visual and sound by attacker type
        let key = 'bullet';
        if (attacker.type === 'tank' || attacker.type === 'turret') { key = 'shell'; sfxTankShoot(); }
        else if (attacker.type === 'helicopter') { key = 'missile'; sfxShoot(); }
        else { sfxShoot(); }

        const proj = this.add.image(sx, sy, key).setDepth(15);
        const angle = Math.atan2(ty - sy, tx - sx);
        proj.setRotation(angle);

        const speed = 380 + Math.random() * 80;
        const dist  = Math.hypot(tx - sx, ty - sy);
        const travelMs = (dist / speed) * 1000;

        this.tweens.add({
            targets: proj,
            x: tx, y: ty,
            duration: travelMs,
            ease: 'Linear',
            onComplete: () => {
                proj.destroy();
                if (target && !target.dead) {
                    const dmg = attacker.dmg * (0.85 + Math.random() * 0.3);
                    target.takeDamage(Math.floor(dmg));
                }
                this.spawnExplosion(tx, ty, 'small');
            }
        });
    }

    // ── Explosion effects ─────────────────────
    spawnExplosion(x, y, size) {
        const frames = [0, 1, 2, 3, 4, 5];
        let fi = 0;
        const img = this.add.image(x, y, 'explosion_0').setDepth(30);
        if (size === 'large') img.setScale(2);

        const interval = this.time.addEvent({
            delay: 60,
            callback: () => {
                fi++;
                if (fi >= frames.length) {
                    img.destroy();
                    interval.destroy();
                } else {
                    img.setTexture(`explosion_${frames[fi]}`);
                }
            },
            repeat: frames.length - 1,
        });

        // Sound + screen shake
        sfxExplosion(size === 'large');
        if (size === 'large') {
            this.cameras.main.shake(200, 0.006);
        }
    }

    // ── Move marker ───────────────────────────
    showMoveMarker(wx, wy) {
        if (this._moveMarker) this._moveMarker.destroy();
        this._moveMarker = this.add.image(wx, wy, 'move_marker').setDepth(25);
        this.tweens.add({
            targets: this._moveMarker,
            alpha: 0, scaleX: 2, scaleY: 2,
            duration: 600, ease: 'Cubic.easeOut',
            onComplete: () => { if (this._moveMarker) this._moveMarker.destroy(); this._moveMarker = null; }
        });
    }

    // ── Building placement mode ───────────────
    startPlacing(type) {
        if (!this.canAfford(BUILDING_DEF[type].cost)) {
            this._notify('Not enough resources!', '#ff4444');
            return;
        }
        this._placingType = type;
        const size = BUILDING_DEF[type].size;
        if (this._placePreview) this._placePreview.destroy();
        this._placePreview = this.add.image(0, 0, `${type}_player`)
            .setDepth(60).setAlpha(0.6)
            .setDisplaySize(size * TILE_SIZE, size * TILE_SIZE);
    }

    _finalizePlacement(worldX, worldY) {
        if (!this._placingType) return;
        const type = this._placingType;
        const def  = BUILDING_DEF[type];
        const tx   = Math.floor(worldX / TILE_SIZE);
        const ty   = Math.floor(worldY / TILE_SIZE);

        if (!this.canPlaceBuilding(tx, ty, def.size)) {
            this._notify("Can't place here!", '#ff4444');
            return;
        }
        if (!this.canAfford(def.cost)) {
            this._notify('Not enough resources!', '#ff4444');
            return;
        }

        this.spendResources(def.cost);
        this.placeBuilding(type, tx, ty, true);
        sfxBuild();
        this._notify(`${def.label} placed!`, '#00ff88');

        if (this._placePreview) { this._placePreview.destroy(); this._placePreview = null; }
        this._placingType = null;
    }

    _cancelPlacement() {
        this._placingType = null;
        if (this._placePreview) { this._placePreview.destroy(); this._placePreview = null; }
    }

    // ── Gather command ────────────────────────
    orderGather(node) {
        const workers = this.selMgr.getUnits().filter(u => u.isGatherer);
        if (workers.length === 0) {
            this._notify('Select workers first', '#ffcc00');
            return;
        }
        for (const w of workers) w.gatherFrom(node);
    }

    // ── Input ─────────────────────────────────
    _setupInput() {
        // CRITICAL: disable browser context menu so right-click works for game commands
        this.input.mouse.disableContextMenu();

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd    = this.input.keyboard.addKeys('W,A,S,D,B,G,ESCAPE,DELETE');

        // Right-click: move or attack (ignore if pointer is in UI zones)
        this.input.on('pointerdown', (ptr) => {
            const inUI = ptr.y < 48 || ptr.y > 560;
            if (ptr.rightButtonDown()) {
                if (!inUI) this._handleRightClick(ptr);
                return;
            }
            if (ptr.leftButtonDown() && this._placingType && !inUI) {
                this._finalizePlacement(ptr.worldX, ptr.worldY);
            }
        });

        // Middle-click drag pan
        this._midDrag = false;
        this._midStart = { x: 0, y: 0 };
        this.input.on('pointerdown', ptr => {
            if (ptr.middleButtonDown()) { this._midDrag = true; this._midStart = { x: ptr.x, y: ptr.y }; }
        });
        this.input.on('pointermove', ptr => {
            if (this._midDrag) {
                const cam = this.cameras.main;
                cam.scrollX -= (ptr.x - this._midStart.x) / cam.zoom;
                cam.scrollY -= (ptr.y - this._midStart.y) / cam.zoom;
                this._midStart = { x: ptr.x, y: ptr.y };
            }
            // Update placement preview
            if (this._placePreview) {
                const tx = Math.floor(ptr.worldX / TILE_SIZE);
                const ty = Math.floor(ptr.worldY / TILE_SIZE);
                const size = BUILDING_DEF[this._placingType]?.size || 1;
                this._placePreview.setPosition(
                    (tx + size / 2) * TILE_SIZE,
                    (ty + size / 2) * TILE_SIZE
                );
                const ok = this.canPlaceBuilding(tx, ty, size);
                this._placePreview.setTint(ok ? 0x00ff88 : 0xff3300);
            }
        });
        this.input.on('pointerup', () => { this._midDrag = false; });

        // Keyboard shortcuts
        this.input.keyboard.on('keydown-B', () => {
            this.scene.get('UIScene')?.events.emit('toggleBuildMenu');
        });
        this.input.keyboard.on('keydown-ESCAPE', () => {
            if (this._placingType) this._cancelPlacement();
            else this.selMgr.clearAll();
        });
        this.input.keyboard.on('keydown-DELETE', () => this._cancelPlacement());
        this.input.keyboard.on('keydown-G', () => {
            const workers = this.selMgr.getUnits().filter(u => u.isGatherer);
            const nodes   = this.resourceNodes.filter(n => !n.depleted);
            if (workers.length === 0 || nodes.length === 0) {
                this._notify('Select workers near a resource node', '#ffcc44'); return;
            }
            workers.forEach((w, i) => w.gatherFrom(nodes[i % nodes.length]));
            this._notify('Workers gathering resources', '#88cc44');
        });
        this.input.keyboard.on('keydown-M', () => {
            const on = toggleMute();
            this._notify(on ? '🔊 Sound ON' : '🔇 Sound OFF', '#88ffbb');
        });
        // Select-all player units on screen
        this.input.keyboard.on('keydown-A', (evt) => {
            if (evt.ctrlKey || evt.metaKey) {
                this.selMgr.clearAll();
                this.playerUnits.forEach(u => { if (!u.dead) this.selMgr.addUnit(u); });
            }
        });

        // Mouse wheel zoom – pivot at mouse cursor position
        this.input.on('wheel', (ptr, gObjs, deltaX, deltaY) => {
            const cam     = this.cameras.main;
            const oldZoom = cam.zoom;
            const newZoom = Phaser.Math.Clamp(oldZoom - deltaY * 0.0008, 0.3, 2.2);
            if (newZoom === oldZoom) return;
            const worldX = ptr.worldX;
            const worldY = ptr.worldY;
            cam.setZoom(newZoom);
            cam.scrollX = Phaser.Math.Clamp(worldX - ptr.x / newZoom, 0, WORLD_W - SCREEN_W / newZoom);
            cam.scrollY = Phaser.Math.Clamp(worldY - ptr.y / newZoom, 0, WORLD_H - SCREEN_H / newZoom);
        });
    }

    _handleRightClick(ptr) {
        if (this._placingType) { this._cancelPlacement(); return; }

        const wx = ptr.worldX, wy = ptr.worldY;

        // Check if clicking on enemy unit or building
        const clickTarget = this._findClickTarget(wx, wy);
        if (clickTarget && this.selMgr.hasUnits()) {
            this.selMgr.commandAttack(clickTarget);
        } else if (this.selMgr.hasUnits()) {
            this.selMgr.commandMove(wx, wy);
        }
    }

    _findClickTarget(wx, wy) {
        const radius = TILE_SIZE * 1.2;
        for (const u of this.enemyUnits) {
            if (!u.dead && u.sprite.visible &&
                Math.hypot(u.x - wx, u.y - wy) < radius) return u;
        }
        for (const b of this.enemyBuildings) {
            if (!b.dead && b.sprite.visible &&
                Math.hypot(b.x - wx, b.y - wy) < radius * 2) return b;
        }
        return null;
    }

    // ── Camera scroll ─────────────────────────
    _handleCamera(delta) {
        const cam = this.cameras.main;
        const spd = (EDGE_SCROLL_SPEED * delta) / 1000 / cam.zoom;
        const ptr = this.input.activePointer;
        let moved = false;

        // WASD + Arrow keys
        if (this.cursors.left.isDown  || this.wasd.A.isDown) { cam.scrollX -= spd; moved = true; }
        if (this.cursors.right.isDown || this.wasd.D.isDown) { cam.scrollX += spd; moved = true; }
        if (this.cursors.up.isDown    || this.wasd.W.isDown) { cam.scrollY -= spd; moved = true; }
        if (this.cursors.down.isDown  || this.wasd.S.isDown) { cam.scrollY += spd; moved = true; }

        // Edge scroll – only trigger at the literal screen border (6px zone)
        const EM = 6;
        if (ptr.x >= 0 && ptr.x < EM)             cam.scrollX -= spd;
        if (ptr.x > SCREEN_W - EM)                 cam.scrollX += spd;
        if (ptr.y >= 0 && ptr.y < EM)              cam.scrollY -= spd;
        if (ptr.y > SCREEN_H - EM)                 cam.scrollY += spd;

        // Clamp
        cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, WORLD_W - SCREEN_W / cam.zoom);
        cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, WORLD_H - SCREEN_H / cam.zoom);
    }

    // ── Notifications ─────────────────────────
    _notify(msg, color = '#ffffff') {
        this._notifText.setText(msg).setColor(color).setAlpha(1);
        this.tweens.killTweensOf(this._notifText);
        this.tweens.add({
            targets: this._notifText, alpha: 0,
            delay: 1800, duration: 600,
        });
    }

    // ── Building destroyed event ──────────────
    _onBuildingDestroyed(b) {
        if (!b.isPlayer && b.type === 'command_center') {
            this._checkVictory();
        }
        if (b.isPlayer && b.type === 'command_center') {
            this._checkDefeat();
        }
    }

    // ── Win / Lose ────────────────────────────
    _checkVictory() {
        const anyEnemyCC = this.enemyBuildings.some(b => !b.dead && b.type === 'command_center');
        if (!anyEnemyCC) this._endGame(true);
    }

    _checkDefeat() {
        const anyPlayerCC = this.playerBuildings.some(b => !b.dead && b.type === 'command_center');
        if (!anyPlayerCC) this._endGame(false);
    }

    _endGame(victory) {
        if (victory) sfxVictory(); else sfxDefeat();
        this.scene.get('UIScene')?.events.emit('gameOver', victory);
        this.time.delayedCall(3000, () => {
            this.cameras.main.fadeOut(1000, 0, 0, 0);
            this.time.delayedCall(1000, () => {
                this.scene.stop('UIScene');
                this.scene.start('MenuScene');
            });
        });
    }

    // ── Cleanup dead entities ─────────────────
    _cleanup() {
        this.playerUnits     = this.playerUnits.filter(u => !u.dead);
        this.enemyUnits      = this.enemyUnits.filter(u => !u.dead);
        this.playerBuildings = this.playerBuildings.filter(b => !b.dead);
        this.enemyBuildings  = this.enemyBuildings.filter(b => !b.dead);
    }

    // ── Main update loop ──────────────────────
    update(time, delta) {
        this._handleCamera(delta);

        // Update all units
        for (const u of this.playerUnits) u.update(delta);
        for (const u of this.enemyUnits)  u.update(delta);

        // Update all buildings
        for (const b of this.playerBuildings) b.update(delta);
        for (const b of this.enemyBuildings)  b.update(delta);

        // AI
        this.ai.update(delta);

        // Passive income tick
        this._incomeTimer += delta;
        if (this._incomeTimer >= INCOME_TICK) {
            this._incomeTimer -= INCOME_TICK;
            this._doPassiveIncome();
        }

        // Fog of war
        this._fogTimer += delta;
        if (this._fogTimer >= FOG_UPDATE_INTERVAL) {
            this._fogTimer -= FOG_UPDATE_INTERVAL;
            this._updateFog();
        }

        // Minimap
        this._mmTimer += delta;
        if (this._mmTimer >= MINIMAP_UPDATE_INT) {
            this._mmTimer -= MINIMAP_UPDATE_INT;
            this._renderMinimap();
        }

        // Send UI resource update
        this.scene.get('UIScene')?.events.emit('resUpdate', this.res);

        // Cleanup
        this._cleanup();

        // Check objectives periodically
        this._checkObjectives();
    }

    // ── Objectives check ──────────────────────
    _checkObjectives() {
        // Barracks built
        const obj0 = this.objectives[0];
        if (obj0 && !obj0.done && this.playerBuildings.some(b => b.type === 'barracks' && !b.dead)) {
            obj0.done = true;
            this.scene.get('UIScene')?.events.emit('objectiveDone', 0);
        }
        // 6+ soldiers
        const obj1 = this.objectives[1];
        if (obj1 && !obj1.done && this.playerUnits.filter(u => u.type === 'soldier' && !u.dead).length >= 6) {
            obj1.done = true;
            this.scene.get('UIScene')?.events.emit('objectiveDone', 1);
        }
    }
}
