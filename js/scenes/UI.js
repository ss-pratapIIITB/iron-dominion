// ─────────────────────────────────────────────
//  UIScene – HUD overlay (runs on top of GameScene)
//  Resources bar, build menu, unit panel, objectives
// ─────────────────────────────────────────────
import { BUILDING_DEF, UNIT_DEF, BUILD_ORDER, SCENARIOS } from '../config.js';

const W = 1280, H = 720;
const BAR_H = 48;        // top resource bar height
const PANEL_H = 160;     // bottom panel height

export default class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UIScene' }); }

    create() {
        this._game = this.scene.get('GameScene');
        this._buildMenuOpen = false;
        this._selectedUnits = [];
        this._selectedBuilding = null;

        this._buildTopBar();
        this._buildBottomPanel();
        this._buildBuildMenu();
        this._buildObjectivesPanel();
        this._buildNotifLayer();
        this._buildGameOverScreen();

        // Listen to game events
        const g = this._game.events;
        g.on('resUpdate',       (res)         => this._updateResources(res));
        g.on('selectionChanged',(units, bld)   => this._onSelection(units, bld));
        g.on('trainStart',      (b)            => this._onTrainStart(b));
        g.on('trainDone',       (b, type)      => this._onTrainDone(b, type));
        g.on('buildingDestroyed',(b)           => this._checkBuildingDestroyed(b));
        g.on('objectiveDone',   (idx)          => this._markObjectiveDone(idx));
        g.on('aiAttackWave',    (n)            => this._showWaveAlert(n));

        this.events.on('resUpdate',      (res) => this._updateResources(res));
        this.events.on('selectionChanged',(u,b)=> this._onSelection(u,b));
        this.events.on('toggleBuildMenu',()    => this._toggleBuildMenu());
        this.events.on('gameOver',       (win) => this._showGameOver(win));
        this.events.on('waveAlert',      (n)   => this._showWaveAlert(n));
        this.events.on('objectiveDone',  (i)   => this._markObjectiveDone(i));
    }

    // ── Top resource bar ──────────────────────
    _buildTopBar() {
        // Background
        const bg = this.add.graphics().setDepth(100);
        bg.fillStyle(0x060a0a, 0.95);
        bg.fillRect(0, 0, W, BAR_H);
        bg.lineStyle(1, 0x00ff88, 0.2);
        bg.lineBetween(0, BAR_H, W, BAR_H);

        // Game title (small)
        this.add.text(16, 14, 'IRON DOMINION', {
            fontSize: '13px', fontFamily: 'Courier New', fill: '#00ff88',
            letterSpacing: 3,
        }).setDepth(101);

        // Resources
        const res = ['oil', 'food', 'steel', 'money'];
        const icons = { oil: '⛽', food: '🌾', steel: '⚙', money: '💰' };
        const colors = { oil: '#888888', food: '#88cc44', steel: '#aaaacc', money: '#ffcc00' };
        this._resTexts = {};
        res.forEach((r, i) => {
            const x = 250 + i * 200;
            this.add.text(x, 14, `${icons[r]} ${r.toUpperCase()}`, {
                fontSize: '11px', fontFamily: 'Courier New', fill: colors[r], letterSpacing: 2,
            }).setDepth(101);
            this._resTexts[r] = this.add.text(x + 100, 14, '0', {
                fontSize: '14px', fontFamily: 'Courier New', fill: '#ffffff',
            }).setDepth(101);
        });

        // Clock / wave timer
        this._timerText = this.add.text(W - 220, 14, 'TIME: 00:00', {
            fontSize: '12px', fontFamily: 'Courier New', fill: '#445544',
        }).setDepth(101);
        this._gameStartTime = Date.now();

        // B key hint
        this.add.text(W - 90, 14, '[B] BUILD', {
            fontSize: '11px', fontFamily: 'Courier New', fill: '#336633',
        }).setDepth(101);
    }

    // ── Bottom panel ──────────────────────────
    _buildBottomPanel() {
        this._panel = this.add.graphics().setDepth(100);
        this._panel.fillStyle(0x060a0a, 0.95);
        this._panel.fillRect(0, H - PANEL_H, W, PANEL_H);
        this._panel.lineStyle(1, 0x00ff88, 0.2);
        this._panel.lineBetween(0, H - PANEL_H, W, H - PANEL_H);

        // Selection info
        this._selTitle = this.add.text(16, H - PANEL_H + 12, 'No selection', {
            fontSize: '13px', fontFamily: 'Courier New', fill: '#00ff88',
        }).setDepth(101);

        this._selDetails = this.add.text(16, H - PANEL_H + 32, '', {
            fontSize: '11px', fontFamily: 'Courier New', fill: '#667766',
            wordWrap: { width: 320 },
        }).setDepth(101);

        // Unit command buttons area
        this._cmdContainer = this.add.container(360, H - PANEL_H + 12).setDepth(101);
        this._cmdButtons = [];

        // Training queue display
        this._queueDisplay = this.add.container(900, H - PANEL_H + 12).setDepth(101);
        this._buildQueueDisplay();

        // Multi-unit grid display
        this._unitGrid = [];
        for (let i = 0; i < 10; i++) {
            const row = Math.floor(i / 5);
            const col = i % 5;
            const ug = this.add.graphics().setDepth(101);
            const ut = this.add.text(16 + col * 62, H - PANEL_H + 68 + row * 40, '', {
                fontSize: '10px', fontFamily: 'Courier New', fill: '#aaffaa',
            }).setDepth(102);
            this._unitGrid.push({ g: ug, t: ut });
        }
    }

    _buildQueueDisplay() {
        this._queueText = this.add.text(0, 0, 'QUEUE:', {
            fontSize: '11px', fontFamily: 'Courier New', fill: '#445544',
        }).setDepth(101);
        this._queueContainer = this.add.container(900, H - PANEL_H + 40).setDepth(101);
        this._progressBar = {
            bg:   this.add.graphics().setDepth(101),
            fill: this.add.graphics().setDepth(101),
        };
    }

    // ── Build menu ────────────────────────────
    _buildBuildMenu() {
        const MENU_W = 480, MENU_H = 280;
        const mx = (W - MENU_W) / 2, my = H / 2 - MENU_H / 2;

        this._buildMenuContainer = this.add.container(0, 0).setDepth(160).setVisible(false);

        // Backdrop
        const backdrop = this.add.graphics();
        backdrop.fillStyle(0x000000, 0.7);
        backdrop.fillRect(0, 0, W, H);
        this._buildMenuContainer.add(backdrop);

        // Panel
        const panel = this.add.graphics();
        panel.fillStyle(0x060e12, 0.97);
        panel.fillRect(mx, my, MENU_W, MENU_H);
        panel.lineStyle(1, 0x00ff88, 0.5);
        panel.strokeRect(mx, my, MENU_W, MENU_H);
        this._buildMenuContainer.add(panel);

        const title = this.add.text(mx + MENU_W / 2, my + 14, 'BUILD STRUCTURES', {
            fontSize: '14px', fontFamily: 'Courier New', fill: '#00ff88', letterSpacing: 4,
        }).setOrigin(0.5, 0);
        this._buildMenuContainer.add(title);

        const hint = this.add.text(mx + MENU_W / 2, my + 32, 'Left-click to select, then click map to place  •  ESC to cancel', {
            fontSize: '10px', fontFamily: 'Courier New', fill: '#334433',
        }).setOrigin(0.5, 0);
        this._buildMenuContainer.add(hint);

        // Close button
        const closeBtn = this.add.text(mx + MENU_W - 12, my + 12, '✕', {
            fontSize: '16px', fontFamily: 'Courier New', fill: '#556655',
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        closeBtn.on('pointerover', () => closeBtn.setStyle({ fill: '#ff4444' }));
        closeBtn.on('pointerout',  () => closeBtn.setStyle({ fill: '#556655' }));
        closeBtn.on('pointerdown', () => this._toggleBuildMenu());
        this._buildMenuContainer.add(closeBtn);

        // Building buttons
        const cols = 4, padding = 12, btnW = 100, btnH = 80;
        const startX = mx + padding;
        const startY = my + 52;

        BUILD_ORDER.forEach((type, i) => {
            const col = i % cols, row = Math.floor(i / cols);
            const bx  = startX + col * (btnW + padding);
            const by  = startY + row * (btnH + padding);
            const def = BUILDING_DEF[type];

            const btn  = this.add.graphics();
            const btn2 = this.add.graphics();
            const label = this.add.text(bx + btnW / 2, by + btnH - 22, def.label, {
                fontSize: '9px', fontFamily: 'Courier New', fill: '#aaffaa',
                wordWrap: { width: btnW - 4 }, align: 'center',
            }).setOrigin(0.5, 0);

            // Cost label
            const costStr = Object.entries(def.cost).map(([k, v]) => `${v}${k[0].toUpperCase()}`).join(' ');
            const costTxt = this.add.text(bx + btnW / 2, by + btnH - 10, costStr, {
                fontSize: '8px', fontFamily: 'Courier New', fill: '#667766',
            }).setOrigin(0.5, 0);

            // Building mini-icon using a sprite preview
            const icon = this.add.image(bx + btnW / 2, by + 22, `${type}_player`)
                .setDisplaySize(40, 40);

            const drawBtn = (hover) => {
                btn.clear();
                btn.fillStyle(hover ? 0x0a2a1a : 0x060e12);
                btn.fillRect(bx, by, btnW, btnH);
                btn.lineStyle(1, hover ? 0x00ff88 : 0x1a3a2a);
                btn.strokeRect(bx, by, btnW, btnH);
            };
            drawBtn(false);

            const zone = this.add.zone(bx + btnW / 2, by + btnH / 2, btnW, btnH)
                .setInteractive({ useHandCursor: true });
            zone.on('pointerover', () => drawBtn(true));
            zone.on('pointerout',  () => drawBtn(false));
            zone.on('pointerdown', () => {
                this._toggleBuildMenu();
                this._game.startPlacing(type);
            });

            this._buildMenuContainer.add([btn, btn2, icon, label, costTxt, zone]);
        });
    }

    _toggleBuildMenu() {
        this._buildMenuOpen = !this._buildMenuOpen;
        this._buildMenuContainer.setVisible(this._buildMenuOpen);
    }

    // ── Objectives panel ──────────────────────
    _buildObjectivesPanel() {
        const game = this._game;
        const scen = game.scenario;

        this._objContainer = this.add.container(16, BAR_H + 8).setDepth(105);

        const panelH = 18 + scen.objectives.length * 18 + 8;
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.7);
        bg.fillRect(0, 0, 288, panelH);
        bg.lineStyle(1, 0x1a3a1a);
        bg.strokeRect(0, 0, 288, panelH);
        this._objContainer.add(bg);

        const title = this.add.text(8, 4, '⬥ OBJECTIVES', {
            fontSize: '10px', fontFamily: 'Courier New', fill: '#00aa44', letterSpacing: 3,
        }).setDepth(106);
        this._objContainer.add(title);

        this._objTexts = scen.objectives.map((obj, i) => {
            const t = this.add.text(8, 20 + i * 18, `○ ${obj}`, {
                fontSize: '10px', fontFamily: 'Courier New', fill: '#445544',
                wordWrap: { width: 268 },
            }).setDepth(106);
            this._objContainer.add(t);
            return t;
        });
    }

    _markObjectiveDone(idx) {
        if (idx < 0 || idx >= this._objTexts.length) return;
        const t = this._objTexts[idx];
        t.setStyle({ fill: '#00ff88' });
        t.setText(t.text.replace('○', '✓'));
    }

    // ── Notifications ─────────────────────────
    _buildNotifLayer() {
        this._notif = this.add.text(W / 2, H / 2 - 80, '', {
            fontSize: '24px', fontFamily: 'Courier New',
            fill: '#ff4444', stroke: '#000', strokeThickness: 4, align: 'center',
        }).setOrigin(0.5).setDepth(200).setAlpha(0);
    }

    _showWaveAlert(n) {
        this._notif.setText(`⚠ ENEMY ASSAULT WAVE ${n} INCOMING ⚠`).setColor('#ff4444').setAlpha(1);
        this.tweens.killTweensOf(this._notif);
        this.tweens.add({ targets: this._notif, alpha: 0, delay: 3000, duration: 800 });
        this.cameras.main.shake(120, 0.003);
    }

    // ── Game over screen ──────────────────────
    _buildGameOverScreen() {
        this._gameOverCont = this.add.container(0, 0).setDepth(300).setVisible(false);
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.85);
        bg.fillRect(0, 0, W, H);
        this._gameOverCont.add(bg);

        this._gameOverTitle = this.add.text(W / 2, H / 2 - 60, '', {
            fontSize: '64px', fontFamily: 'Courier New',
            stroke: '#000', strokeThickness: 6, align: 'center',
        }).setOrigin(0.5);
        this._gameOverCont.add(this._gameOverTitle);

        this._gameOverSub = this.add.text(W / 2, H / 2 + 20, '', {
            fontSize: '18px', fontFamily: 'Courier New', fill: '#aaaaaa',
        }).setOrigin(0.5);
        this._gameOverCont.add(this._gameOverSub);

        const menuBtn = this.add.text(W / 2, H / 2 + 80, '[ RETURN TO MENU ]', {
            fontSize: '18px', fontFamily: 'Courier New', fill: '#00ff88',
            backgroundColor: '#0a1a0a', padding: { x: 16, y: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        menuBtn.on('pointerdown', () => {
            this.scene.stop('UIScene');
            this.scene.stop('GameScene');
            this.scene.start('MenuScene');
        });
        this._gameOverCont.add(menuBtn);
    }

    _showGameOver(victory) {
        this._gameOverCont.setVisible(true);
        if (victory) {
            this._gameOverTitle.setText('VICTORY!').setColor('#00ff88');
            this._gameOverSub.setText('Enemy forces have been eliminated.\nMission accomplished, Commander.');
        } else {
            this._gameOverTitle.setText('DEFEAT').setColor('#ff3300');
            this._gameOverSub.setText('Command Center destroyed.\nMission failed.');
        }
        this.tweens.add({ targets: this._gameOverCont.list[1], alpha: 0.7, yoyo: true, repeat: -1, duration: 1000 });
    }

    // ── Selection display ─────────────────────
    _onSelection(units, building) {
        this._selectedUnits   = units;
        this._selectedBuilding = building;
        this._clearCmdButtons();

        if (building) {
            this._showBuildingPanel(building);
        } else if (units.length > 0) {
            this._showUnitPanel(units);
        } else {
            this._selTitle.setText('No selection');
            this._selDetails.setText('');
            this._clearUnitGrid();
        }
    }

    _showUnitPanel(units) {
        if (units.length === 1) {
            const u = units[0];
            this._selTitle.setText(u.label.toUpperCase());
            this._selDetails.setText(
                `HP: ${u.hp}/${u.maxHp}  |  DMG: ${u.dmg || '–'}  |  SPD: ${u.speed}\n` +
                `State: ${u.state}  |  Carrying: ${u.carrying ? u.carryType + ' ×' + u.carrying : 'nothing'}`
            );
        } else {
            this._selTitle.setText(`${units.length} UNITS SELECTED`);
            this._selDetails.setText('Right-click to move / attack');
        }

        // Draw unit icons in grid
        units.slice(0, 10).forEach((u, i) => {
            const cell = this._unitGrid[i];
            const col = i % 5, row = Math.floor(i / 5);
            const bx = 16 + col * 62, by = H - PANEL_H + 68 + row * 40;
            cell.g.clear();
            cell.g.fillStyle(0x0a1a0a);
            cell.g.fillRect(bx, by, 56, 34);
            cell.g.lineStyle(1, 0x1a4a2a);
            cell.g.strokeRect(bx, by, 56, 34);
            cell.t.setPosition(bx + 28, by + 12).setText(u.label).setOrigin(0.5);
        });

        // Blank unused cells
        for (let i = units.length; i < 10; i++) {
            this._unitGrid[i].g.clear();
            this._unitGrid[i].t.setText('');
        }

        // Attack-move button – send selected units to attack nearest visible enemy
        this._addCmdButton('ATTACK\nMOVE', '#ff6644', () => {
            const combatUnits = units.filter(u => u.dmg > 0 && !u.dead);
            const enemies = this._game.enemyUnits.filter(u => !u.dead && u.sprite.visible);
            const eBuildings = this._game.enemyBuildings.filter(b => !b.dead && b.sprite.visible);
            const targets = [...enemies, ...eBuildings];
            if (targets.length === 0 || combatUnits.length === 0) return;
            combatUnits.forEach(u => {
                const closest = targets.reduce((best, t) => {
                    const d = Math.hypot(t.x - u.x, t.y - u.y);
                    return d < best.d ? { t, d } : best;
                }, { t: targets[0], d: Infinity });
                u.attackTarget(closest.t);
            });
        });
        this._addCmdButton('STOP', '#ffcc44', () => {
            units.forEach(u => { u.path = []; u.setState('IDLE'); });
        });
        if (units.some(u => u.isGatherer)) {
            this._addCmdButton('GATHER\n[G]', '#88cc44', () => {
                const workers = units.filter(u => u.isGatherer && !u.dead);
                const nodes   = this._game.resourceNodes.filter(n => !n.depleted);
                if (workers.length === 0 || nodes.length === 0) return;
                workers.forEach((w, i) => w.gatherFrom(nodes[i % nodes.length]));
            });
        }
    }

    _showBuildingPanel(b) {
        this._clearUnitGrid();
        const def = BUILDING_DEF[b.type] || {};
        this._selTitle.setText(b.label.toUpperCase());
        this._selDetails.setText(
            `HP: ${b.hp}/${b.maxHp}  |  Tiles: ${b.size}×${b.size}\n` +
            (def.income ? `Income: ${Object.entries(def.income).map(([k,v])=>`+${v} ${k}`).join(' ')}` : '')
        );

        // Training buttons
        if (b.trains && b.trains.length > 0) {
            b.trains.forEach(uType => {
                const uDef = UNIT_DEF[uType];
                const costStr = Object.entries(uDef.cost).map(([k,v]) => `${v}${k[0].toUpperCase()}`).join(' ');
                this._addCmdButton(`${uDef.label}\n${costStr}`, '#44aaff', () => {
                    if (this._game.canAfford(uDef.cost)) {
                        if (b.enqueue(uType)) {
                            this._game.spendResources(uDef.cost);
                        }
                    } else {
                        this._game._notify('Not enough resources!', '#ff4444');
                    }
                });
            });
        }

        // Training progress bar
        this._updateTrainProgress(b);
    }

    _updateTrainProgress(b) {
        const pb = this._progressBar;
        pb.bg.clear(); pb.fill.clear();

        if (b.trainTimer > 0 && b.trainTotal > 0) {
            const prog = 1 - b.trainTimer / b.trainTotal;
            const barX = 900, barY = H - PANEL_H + 20, barW = 280, barH = 10;
            pb.bg.fillStyle(0x111111); pb.bg.fillRect(barX, barY, barW, barH);
            pb.bg.lineStyle(1, 0x334433); pb.bg.strokeRect(barX, barY, barW, barH);
            pb.fill.fillStyle(0x00aa44); pb.fill.fillRect(barX + 1, barY + 1, (barW - 2) * prog, barH - 2);

            const unit = b.queue[0];
            pb.bg.fillStyle(0); // transparent (no clear needed)
            if (!this._trainLabel) {
                this._trainLabel = this.add.text(barX, barY - 14, '', {
                    fontSize: '10px', fontFamily: 'Courier New', fill: '#00aa44',
                }).setDepth(102);
            }
            this._trainLabel.setText(`TRAINING: ${UNIT_DEF[unit]?.label || unit}  (${b.queue.length} queued)`);
        } else if (this._trainLabel) {
            this._trainLabel.setText('');
        }
    }

    _addCmdButton(label, color, fn) {
        const i = this._cmdButtons.length;
        const bx = i * 92;
        const g = this.add.graphics().setDepth(102);
        g.fillStyle(0x0a1a0a); g.fillRect(bx, 0, 86, 70);
        g.lineStyle(1, 0x1a3a1a); g.strokeRect(bx, 0, 86, 70);
        this._cmdContainer.add(g);

        const t = this.add.text(bx + 43, 35, label, {
            fontSize: '10px', fontFamily: 'Courier New', fill: color,
            align: 'center', wordWrap: { width: 80 },
        }).setOrigin(0.5).setDepth(103);
        this._cmdContainer.add(t);

        const z = this.add.zone(bx + 43, 35, 86, 70)
            .setInteractive({ useHandCursor: true }).setDepth(104);
        z.on('pointerover', () => { g.clear(); g.fillStyle(0x0a2a1a); g.fillRect(bx, 0, 86, 70); g.lineStyle(1, 0x00ff88); g.strokeRect(bx, 0, 86, 70); });
        z.on('pointerout',  () => { g.clear(); g.fillStyle(0x0a1a0a); g.fillRect(bx, 0, 86, 70); g.lineStyle(1, 0x1a3a1a); g.strokeRect(bx, 0, 86, 70); });
        z.on('pointerdown', fn);
        this._cmdContainer.add(z);

        this._cmdButtons.push({ g, t, z });
    }

    _clearCmdButtons() {
        for (const { g, t, z } of this._cmdButtons) { g.destroy(); t.destroy(); z.destroy(); }
        this._cmdButtons = [];
    }

    _clearUnitGrid() {
        for (const cell of this._unitGrid) { cell.g.clear(); cell.t.setText(''); }
    }

    _onTrainStart(b) {
        if (b === this._selectedBuilding) this._showBuildingPanel(b);
    }
    _onTrainDone(b, type) {
        if (b === this._selectedBuilding) this._showBuildingPanel(b);
    }
    _checkBuildingDestroyed(b) {
        if (b === this._selectedBuilding) {
            this._selectedBuilding = null;
            this._selTitle.setText('No selection');
            this._selDetails.setText('');
        }
    }

    // ── Resource display ──────────────────────
    _updateResources(res) {
        for (const [key, txt] of Object.entries(this._resTexts)) {
            const val = Math.floor(res[key] || 0);
            txt.setText(val.toString());
        }
    }

    // ── Update loop ───────────────────────────
    update(time, delta) {
        // Clock
        const elapsed = Math.floor((Date.now() - this._gameStartTime) / 1000);
        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        this._timerText.setText(`TIME: ${mm}:${ss}`);

        // Update training progress bar if building selected
        if (this._selectedBuilding && !this._selectedBuilding.dead) {
            this._updateTrainProgress(this._selectedBuilding);
        }
    }
}
