// ─────────────────────────────────────────────
//  SelectionMgr – handles unit/building selection
//  Supports: click, shift-click, rubber-band drag
// ─────────────────────────────────────────────
import { sfxSelect } from '../Sound.js';

export default class SelectionMgr {
    constructor(scene) {
        this.scene    = scene;
        this.selected = new Set();   // Unit or Building objects
        this.selBuilding = null;     // single selected building

        // Rubber-band state
        this._dragging   = false;
        this._dragStart  = { x: 0, y: 0 };
        this._dragRect   = null;     // Phaser Graphics

        this._initInput();
    }

    _initInput() {
        const scene  = this.scene;
        const input  = scene.input;

        // Rubber-band box
        this._dragRect = scene.add.graphics().setDepth(100).setScrollFactor(0);

        // Track whether the pointer-down landed on empty map vs. a game object or UI panel
        this._downOnEmpty = false;

        // UI zone constants (top bar 48px, bottom panel 160px, screen H=720)
        const isUIZone = (ptr) => ptr.y < 48 || ptr.y > 560;

        input.on('pointerdown', (ptr) => {
            if (ptr.rightButtonDown() || ptr.middleButtonDown()) return;
            if (isUIZone(ptr)) { this._downOnEmpty = false; return; }

            // If a game object was hit, let its own handler deal with it
            const hits = scene.input.hitTestPointer(ptr);
            if (hits.length > 0) { this._downOnEmpty = false; return; }

            this._downOnEmpty = true;
            this._dragging    = false;
            this._dragStart   = { x: ptr.worldX, y: ptr.worldY };
        });

        input.on('pointermove', (ptr) => {
            if (!ptr.isDown || ptr.rightButtonDown() || ptr.middleButtonDown()) return;
            if (!this._downOnEmpty) return;
            const dx = Math.abs(ptr.worldX - this._dragStart.x);
            const dy = Math.abs(ptr.worldY - this._dragStart.y);
            if (dx > 6 || dy > 6) {
                this._dragging = true;
                this._drawDragBox(ptr.worldX, ptr.worldY);
            }
        });

        input.on('pointerup', (ptr) => {
            if (ptr.rightButtonDown()) return;
            if (ptr.event && ptr.event.button === 1) return; // middle-button release
            if (isUIZone(ptr)) {
                this._dragging = false; this._downOnEmpty = false;
                this._dragRect.clear(); return;
            }
            if (this._dragging) {
                this._finishDrag(ptr.worldX, ptr.worldY, ptr.event.shiftKey);
            } else if (this._downOnEmpty) {
                // Click on empty map space – deselect
                if (!ptr.event.shiftKey) this.clearAll();
            }
            this._dragging    = false;
            this._downOnEmpty = false;
            this._dragRect.clear();
        });
    }

    _drawDragBox(ex, ey) {
        const sx = this._dragStart.x, sy = this._dragStart.y;
        const cam = this.scene.cameras.main;
        // Convert world → screen
        const scx = (sx - cam.worldView.x) * cam.zoom;
        const scy = (sy - cam.worldView.y) * cam.zoom;
        const ecx = (ex - cam.worldView.x) * cam.zoom;
        const ecy = (ey - cam.worldView.y) * cam.zoom;

        this._dragRect.clear();
        this._dragRect.lineStyle(2, 0x00ff88, 0.9);
        this._dragRect.strokeRect(
            Math.min(scx, ecx), Math.min(scy, ecy),
            Math.abs(ecx - scx), Math.abs(ecy - scy)
        );
        this._dragRect.fillStyle(0x00ff88, 0.06);
        this._dragRect.fillRect(
            Math.min(scx, ecx), Math.min(scy, ecy),
            Math.abs(ecx - scx), Math.abs(ecy - scy)
        );
    }

    _finishDrag(ex, ey, additive) {
        const sx = this._dragStart.x, sy = this._dragStart.y;
        const minX = Math.min(sx, ex), maxX = Math.max(sx, ex);
        const minY = Math.min(sy, ey), maxY = Math.max(sy, ey);

        if (!additive) this.clearAll();

        for (const unit of this.scene.playerUnits) {
            if (unit.dead) continue;
            if (unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY) {
                this._addUnit(unit);
            }
        }
        this.scene.events.emit('selectionChanged', this.getUnits(), this.selBuilding);
    }

    // ── Public API ────────────────────────────
    selectSingle(unit) {
        this.clearAll();
        this._addUnit(unit);
        sfxSelect();
        this.scene.events.emit('selectionChanged', this.getUnits(), null);
    }

    selectBuilding(building) {
        this.clearAll();
        this.selBuilding = building;
        this.scene.events.emit('selectionChanged', [], building);
    }

    addUnit(unit) {
        this._addUnit(unit);
        this.scene.events.emit('selectionChanged', this.getUnits(), this.selBuilding);
    }

    clearAll() {
        for (const u of this.selected) u.selected = false;
        this.selected.clear();
        this.selBuilding = null;
        this.scene.events.emit('selectionChanged', [], null);
    }

    _addUnit(unit) {
        if (this.selected.has(unit)) return;
        this.selected.add(unit);
        unit.selected = true;
        this.selBuilding = null;
    }

    getUnits() {
        return [...this.selected].filter(u => !u.dead);
    }

    hasUnits()    { return this.selected.size > 0; }
    hasBuilding() { return this.selBuilding !== null; }

    // ── Command: move selected units to world pos ─
    commandMove(worldX, worldY) {
        const units = this.getUnits();
        if (units.length === 0) return;

        const tileX = Math.floor(worldX / (this.scene.tileSize || 48));
        const tileY = Math.floor(worldY / (this.scene.tileSize || 48));

        // Formation: spread units around target
        const spread = 2;
        units.forEach((unit, i) => {
            const col = i % 5, row = Math.floor(i / 5);
            const ox = (col - 2) * spread, oy = (row) * spread;
            unit.moveTo(tileX + ox, tileY + oy);
        });

        this.scene.showMoveMarker(worldX, worldY);
    }

    // ── Command: attack target ────────────────
    commandAttack(target) {
        for (const unit of this.getUnits()) {
            if (unit.dmg > 0) unit.attackTarget(target);
        }
    }
}
