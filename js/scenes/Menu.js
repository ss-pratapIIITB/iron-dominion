// ─────────────────────────────────────────────
//  MenuScene – main menu + campaign selection
// ─────────────────────────────────────────────
import { SCENARIOS } from '../config.js';

const W = 1280, H = 720;

export default class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }

    create() {
        // Animated background gradient
        this._bg = this.add.graphics();
        this._drawBg();

        // Scanline overlay
        const scan = this.add.graphics();
        for (let y = 0; y < H; y += 4) {
            scan.lineStyle(1, 0x000000, 0.12);
            scan.lineBetween(0, y, W, y);
        }

        // Title
        this.add.text(W / 2, 80, 'IRON DOMINION', {
            fontSize: '72px',
            fontFamily: 'Courier New, monospace',
            fill: '#00ff88',
            stroke: '#003322',
            strokeThickness: 6,
            shadow: { blur: 20, color: '#00ff88', fill: true },
        }).setOrigin(0.5);

        this.add.text(W / 2, 148, 'MODERN WARFARE RTS', {
            fontSize: '18px', fontFamily: 'Courier New, monospace',
            fill: '#88ffbb', letterSpacing: 8,
        }).setOrigin(0.5);

        // Divider
        const div = this.add.graphics();
        div.lineStyle(1, 0x00ff88, 0.4);
        div.lineBetween(200, 170, W - 200, 170);

        // Scenario selection
        this.add.text(W / 2, 200, 'SELECT MISSION', {
            fontSize: '14px', fontFamily: 'Courier New, monospace',
            fill: '#558866', letterSpacing: 4,
        }).setOrigin(0.5);

        this._scenarioCards = [];
        SCENARIOS.forEach((scen, i) => {
            this._buildCard(scen, i);
        });

        // Controls hint at bottom
        this.add.text(W / 2, H - 36, [
            'WASD / Arrow Keys – Scroll Camera    Left Click – Select    Right Click – Move / Attack',
            'B – Build Menu    G – Gather    Delete – Cancel    Middle Click – Drag Pan',
        ].join('\n'), {
            fontSize: '11px', fontFamily: 'Courier New, monospace',
            fill: '#445544', align: 'center',
        }).setOrigin(0.5);

        // Version
        this.add.text(W - 10, H - 10, 'v1.0', {
            fontSize: '10px', fontFamily: 'Courier New, monospace', fill: '#334433',
        }).setOrigin(1, 1);

        // Flicker animation on title
        this.tweens.add({
            targets: this.children.list[3],
            alpha: 0.7, yoyo: true, duration: 1800,
            ease: 'Sine.easeInOut', repeat: -1,
        });
    }

    _drawBg() {
        this._bg.clear();
        this._bg.fillGradientStyle(0x0a0a14, 0x0a0a14, 0x0d1a0d, 0x0d1a0d, 1);
        this._bg.fillRect(0, 0, W, H);

        // Grid overlay
        this._bg.lineStyle(1, 0x00ff88, 0.04);
        for (let x = 0; x < W; x += 40) this._bg.lineBetween(x, 0, x, H);
        for (let y = 0; y < H; y += 40) this._bg.lineBetween(0, y, W, y);

        // Corner decorations
        const corners = [[0,0],[W,0],[0,H],[W,H]];
        corners.forEach(([cx,cy]) => {
            this._bg.lineStyle(2, 0x00ff88, 0.3);
            const sign = [cx===0 ? 1:-1, cy===0 ? 1:-1];
            this._bg.lineBetween(cx, cy, cx + sign[0]*60, cy);
            this._bg.lineBetween(cx, cy, cx, cy + sign[1]*60);
        });
    }

    _buildCard(scen, index) {
        const cardW = 340, cardH = 260;
        const startX = W / 2 - (SCENARIOS.length - 1) * (cardW + 24) / 2;
        const cx = startX + index * (cardW + 24);
        const cy = H / 2 + 20;

        const card = this.add.graphics();
        const highlight = this.add.graphics();

        const drawCard = (hover) => {
            card.clear();
            card.fillStyle(hover ? 0x0a2a1a : 0x080e12, 0.95);
            card.fillRoundedRect(cx - cardW/2, cy - cardH/2, cardW, cardH, 4);
            card.lineStyle(hover ? 2 : 1, hover ? 0x00ff88 : 0x1a3a2a);
            card.strokeRoundedRect(cx - cardW/2, cy - cardH/2, cardW, cardH, 4);
        };
        drawCard(false);

        // Difficulty badge
        const diffColor = ['#00ff88','#ffcc00','#ff4444'][index] || '#00ff88';
        const diffLabel = ['EASY','MEDIUM','HARD'][index] || '';
        this.add.text(cx - cardW/2 + 12, cy - cardH/2 + 12, diffLabel, {
            fontSize: '10px', fontFamily: 'Courier New, monospace',
            fill: diffColor, letterSpacing: 3,
        });

        // Mission number
        this.add.text(cx + cardW/2 - 12, cy - cardH/2 + 12, `0${index+1}`, {
            fontSize: '10px', fontFamily: 'Courier New, monospace', fill: '#334433',
        }).setOrigin(1, 0);

        // Name
        this.add.text(cx, cy - cardH/2 + 40, scen.name, {
            fontSize: '18px', fontFamily: 'Courier New, monospace',
            fill: '#eeffee', wordWrap: { width: cardW - 24 }, align: 'center',
        }).setOrigin(0.5, 0);

        // Description
        this.add.text(cx, cy - cardH/2 + 80, scen.desc, {
            fontSize: '12px', fontFamily: 'Courier New, monospace',
            fill: '#667766', wordWrap: { width: cardW - 32 }, align: 'center',
        }).setOrigin(0.5, 0);

        // Briefing excerpt
        this.add.text(cx, cy - cardH/2 + 120, `"${scen.briefing}"`, {
            fontSize: '11px', fontFamily: 'Courier New, monospace',
            fill: '#445544', fontStyle: 'italic',
            wordWrap: { width: cardW - 32 }, align: 'center',
        }).setOrigin(0.5, 0);

        // Objectives
        this.add.text(cx - cardW/2 + 16, cy + 10, 'OBJECTIVES:', {
            fontSize: '10px', fontFamily: 'Courier New, monospace', fill: '#00ff88',
        });
        scen.objectives.forEach((obj, oi) => {
            this.add.text(cx - cardW/2 + 16, cy + 26 + oi * 14, `▷ ${obj}`, {
                fontSize: '10px', fontFamily: 'Courier New, monospace', fill: '#667766',
            });
        });

        // Launch button
        const btnY = cy + cardH/2 - 36;
        const btn = this.add.text(cx, btnY, '[ DEPLOY ]', {
            fontSize: '16px', fontFamily: 'Courier New, monospace',
            fill: '#00ff88', padding: { x: 16, y: 8 },
            backgroundColor: '#0a1a0a',
        }).setOrigin(0.5);

        // Invisible hit area
        const zone = this.add.zone(cx, cy, cardW, cardH).setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => { drawCard(true); btn.setStyle({ fill: '#ffffff', backgroundColor: '#00aa55' }); });
        zone.on('pointerout',  () => { drawCard(false); btn.setStyle({ fill: '#00ff88', backgroundColor: '#0a1a0a' }); });
        zone.on('pointerdown', () => this._launchScenario(scen));

        // Pulse on button
        this.tweens.add({
            targets: btn, alpha: 0.6, yoyo: true,
            duration: 1200 + index * 300, ease: 'Sine.easeInOut', repeat: -1,
        });
    }

    _launchScenario(scen) {
        this.cameras.main.fadeOut(400, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', { scenario: scen });
            this.scene.launch('UIScene');
        });
    }
}
