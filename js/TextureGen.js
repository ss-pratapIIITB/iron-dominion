// ─────────────────────────────────────────────
//  TextureGen – Procedural sprite generation
//  All game visuals are created here at startup
// ─────────────────────────────────────────────
import { T } from './config.js';

// Helper: create a Graphics, execute fn, burn to texture, destroy Graphics
function make(scene, key, w, h, fn) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    fn(g, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
}

// ── Tile textures (48×48) ─────────────────────
function makeTiles(scene) {
    const S = 48;

    // GRASS
    make(scene, 'tile_grass', S, S, g => {
        g.fillStyle(0x4a7c3f);  g.fillRect(0, 0, S, S);
        g.fillStyle(0x3d6b34, 0.5);
        for (let i = 0; i < 6; i++) {
            const px = Math.floor((i * 37 + 11) % S);
            const py = Math.floor((i * 19 + 7)  % S);
            g.fillRect(px, py, 3, 3);
        }
        g.lineStyle(1, 0x3a5e30, 0.3);
        g.strokeRect(0, 0, S, S);
    });

    // DIRT
    make(scene, 'tile_dirt', S, S, g => {
        g.fillStyle(0x8b6914);  g.fillRect(0, 0, S, S);
        g.fillStyle(0x7a5d10, 0.4);
        for (let i = 0; i < 8; i++) {
            g.fillRect((i * 29 + 5) % S, (i * 17 + 3) % S, 4, 2);
        }
    });

    // SAND
    make(scene, 'tile_sand', S, S, g => {
        g.fillStyle(0xd4aa5a);  g.fillRect(0, 0, S, S);
        g.fillStyle(0xc9992a, 0.3);
        for (let i = 0; i < 10; i++) {
            g.fillRect((i * 41 + 7) % S, (i * 23 + 5) % S, 3, 1);
        }
    });

    // WATER – animated via multiple textures
    for (let frame = 0; frame < 4; frame++) {
        make(scene, `tile_water_${frame}`, S, S, g => {
            g.fillStyle(0x1a6b9a);  g.fillRect(0, 0, S, S);
            g.fillStyle(0x2196c8, 0.5);
            g.fillRect(frame * 4, 8, 16, 3);
            g.fillRect((frame * 4 + 20) % S, 28, 20, 3);
            g.fillStyle(0x57bfe8, 0.3);
            g.fillRect((frame * 3 + 5) % S, 18, 10, 2);
        });
    }
    // Static alias for frame 0
    make(scene, 'tile_water', S, S, g => {
        g.fillStyle(0x1a6b9a); g.fillRect(0, 0, S, S);
        g.fillStyle(0x2196c8, 0.5); g.fillRect(2, 10, 16, 3); g.fillRect(22, 30, 20, 3);
    });

    // FOREST
    make(scene, 'tile_forest', S, S, g => {
        g.fillStyle(0x2d5a1b);  g.fillRect(0, 0, S, S);
        // Tree canopy circles
        const trees = [[12,14,10],[32,18,9],[20,34,8],[36,36,7]];
        for (const [tx, ty, r] of trees) {
            g.fillStyle(0x1e4012); g.fillCircle(tx, ty, r + 1);
            g.fillStyle(0x3a7a22); g.fillCircle(tx, ty, r);
            g.fillStyle(0x4a9030, 0.6); g.fillCircle(tx - 2, ty - 2, r * 0.5);
        }
    });

    // MOUNTAIN
    make(scene, 'tile_mountain', S, S, g => {
        g.fillStyle(0x555555);  g.fillRect(0, 0, S, S);
        // Stylised peak
        g.fillStyle(0x444444);
        g.fillTriangle(24, 4, 4, 44, 44, 44);
        g.fillStyle(0x666666);
        g.fillTriangle(24, 4, 20, 22, 28, 22);
        g.fillStyle(0xaaaaaa, 0.4);
        g.fillTriangle(24, 5, 22, 14, 26, 14);
    });

    // ROAD
    make(scene, 'tile_road', S, S, g => {
        g.fillStyle(0x555566);  g.fillRect(0, 0, S, S);
        g.fillStyle(0x444455);  g.fillRect(2, 2, S - 4, S - 4);
        g.fillStyle(0xffee88, 0.6); // center line
        g.fillRect(S / 2 - 1, 0, 2, 18);
        g.fillRect(S / 2 - 1, 30, 2, 18);
    });
}

// ── Unit textures (32×32) ─────────────────────
//   player = blue palette, enemy = red palette
function unitColor(isPlayer) {
    return isPlayer
        ? { body: 0x1565c0, accent: 0x42a5f5, dark: 0x0d47a1, hi: 0x90caf9 }
        : { body: 0xb71c1c, accent: 0xef5350, dark: 0x7f0000, hi: 0xffcdd2 };
}

function makeUnits(scene) {
    const US = 32;

    ['player', 'enemy'].forEach(side => {
        const p = side === 'player';
        const c = unitColor(p);

        // ── Worker ──
        make(scene, `worker_${side}`, US, US, g => {
            // body
            g.fillStyle(c.body);    g.fillRect(11, 10, 10, 14);
            // head
            g.fillStyle(c.hi);      g.fillCircle(16, 8, 6);
            // hard hat
            g.fillStyle(0xffcc00);  g.fillRect(10, 5, 12, 3);
            // tool
            g.fillStyle(0x888888);  g.fillRect(20, 12, 3, 12);
            g.fillStyle(0x555555);  g.fillRect(19, 12, 5, 3);
            // legs
            g.fillStyle(c.dark);    g.fillRect(11, 24, 4, 6); g.fillRect(17, 24, 4, 6);
        });

        // ── Soldier ──
        make(scene, `soldier_${side}`, US, US, g => {
            g.fillStyle(c.body);    g.fillRect(10, 10, 12, 14);
            g.fillStyle(c.hi);      g.fillCircle(16, 8, 5);
            g.fillStyle(c.dark);    g.fillRect(10, 6, 12, 5); // helmet
            g.fillStyle(0x333333);  g.fillRect(21, 14, 8, 3); // rifle
            g.fillStyle(c.dark);    g.fillRect(10, 24, 5, 6); g.fillRect(17, 24, 5, 6);
            g.fillStyle(c.accent, 0.8); g.fillRect(11, 11, 3, 2); // stripe
        });

        // ── Sniper ──
        make(scene, `sniper_${side}`, US, US, g => {
            g.fillStyle(c.body);    g.fillRect(11, 10, 10, 14);
            g.fillStyle(c.hi);      g.fillCircle(16, 8, 5);
            g.fillStyle(c.dark);    g.fillRect(11, 6, 10, 5);
            g.fillStyle(0x222222);  g.fillRect(20, 13, 11, 2); // long rifle
            g.fillStyle(0x555555);  g.fillRect(22, 11, 6, 2);  // scope
            g.fillStyle(c.dark);    g.fillRect(11, 24, 4, 6); g.fillRect(17, 24, 4, 6);
        });

        // ── Jeep ──
        make(scene, `jeep_${side}`, US + 16, US, g => {
            // body
            g.fillStyle(c.body);    g.fillRect(4, 12, 40, 14);
            g.fillStyle(c.dark);    g.fillRect(6, 8, 28, 12); // cab
            g.fillStyle(c.accent, 0.5); g.fillRect(10, 9, 12, 6); // windshield
            // wheels
            g.fillStyle(0x222222);
            g.fillCircle(12, 26, 7); g.fillCircle(36, 26, 7);
            g.fillStyle(0x555555);
            g.fillCircle(12, 26, 4); g.fillCircle(36, 26, 4);
            g.fillStyle(0x222222);
            g.fillCircle(12, 26, 2); g.fillCircle(36, 26, 2);
            // gun on back
            g.fillStyle(0x333333);  g.fillRect(32, 10, 3, 10);
        });

        // ── Tank ──
        make(scene, `tank_${side}`, US + 16, US + 8, g => {
            // tracks
            g.fillStyle(0x222222);  g.fillRect(0, 20, 56, 12); g.fillRect(0, 20, 56, 12);
            for (let i = 0; i < 8; i++) { g.fillStyle(0x333333); g.fillRect(i * 7, 20, 5, 12); }
            // hull
            g.fillStyle(c.body);    g.fillRect(4, 14, 48, 14);
            // turret
            g.fillStyle(c.dark);    g.fillCircle(28, 16, 11);
            g.fillStyle(c.accent);  g.fillCircle(28, 16, 7);
            // barrel
            g.fillStyle(0x333333);  g.fillRect(32, 13, 22, 5);
            // details
            g.fillStyle(0x444444);  g.fillRect(6, 16, 8, 6);
            g.fillStyle(c.hi, 0.3); g.fillCircle(28, 14, 4);
        });

        // ── Helicopter ──
        make(scene, `helicopter_${side}`, US + 16, US + 8, g => {
            // rotor shadow
            g.fillStyle(0x000000, 0.2); g.fillRect(4, 5, 48, 3);
            // main rotor
            g.fillStyle(0x333333); g.fillRect(4, 4, 48, 3);
            // body (fuselage)
            g.fillStyle(c.body);
            g.fillTriangle(8, 16, 44, 12, 44, 28);
            g.fillRect(14, 12, 30, 16);
            // cockpit
            g.fillStyle(c.accent, 0.7); g.fillRect(40, 13, 8, 10);
            g.fillStyle(0x88ccff, 0.5); g.fillRect(42, 14, 6, 8);
            // tail
            g.fillStyle(c.dark);    g.fillRect(8, 18, 8, 4);
            g.fillRect(4, 16, 6, 2); // tail rotor
            // skids
            g.fillStyle(0x444444); g.fillRect(18, 28, 22, 2);
            g.fillRect(22, 26, 3, 4); g.fillRect(34, 26, 3, 4);
        });
    });
}

// ── Building textures ─────────────────────────
function makeBuildingTexture(scene, key, w, h, fn) {
    make(scene, key, w, h, (g, bw, bh) => {
        // Shadow
        g.fillStyle(0x000000, 0.25); g.fillRect(4, 4, bw - 2, bh - 2);
        fn(g, bw, bh);
    });
}

function makeBuildings(scene) {
    const S = 48;

    ['player', 'enemy'].forEach(side => {
        const p = side === 'player';
        const c = unitColor(p);

        // ── Command Center (4×4 tiles) ──
        const CW = S * 4, CH = S * 4;
        makeBuildingTexture(scene, `command_center_${side}`, CW, CH, (g, w, h) => {
            // Base
            g.fillStyle(c.dark);    g.fillRect(0, 0, w, h);
            g.fillStyle(c.body);    g.fillRect(4, 4, w - 8, h - 8);
            // Central tower
            g.fillStyle(c.dark);    g.fillRect(w/2 - 30, h/2 - 30, 60, 60);
            g.fillStyle(c.accent);  g.fillRect(w/2 - 26, h/2 - 26, 52, 52);
            // Radar dish
            g.fillStyle(0x888888);  g.fillRect(w/2 - 4, 16, 8, 30);
            g.fillStyle(0xcccccc);
            g.beginPath(); g.moveTo(w/2, 16);
            g.arc(w/2, 16, 20, Phaser.Math.DegToRad(210), Phaser.Math.DegToRad(330));
            g.closePath(); g.fillPath();
            // Windows
            g.fillStyle(0x88ccff, 0.8);
            g.fillRect(w/2 - 22, h/2 - 22, 12, 10);
            g.fillRect(w/2 + 10, h/2 - 22, 12, 10);
            g.fillRect(w/2 - 22, h/2 + 12, 12, 10);
            g.fillRect(w/2 + 10, h/2 + 12, 12, 10);
            // Flag
            g.fillStyle(p ? 0x1565c0 : 0xb71c1c);
            g.fillRect(w - 30, 8, 3, 24);
            g.fillTriangle(w - 27, 8, w - 12, 16, w - 27, 24);
            // Border
            g.lineStyle(2, c.accent, 0.8); g.strokeRect(2, 2, w - 4, h - 4);
        });

        // ── Barracks (3×3 tiles) ──
        const BW = S * 3, BH = S * 3;
        makeBuildingTexture(scene, `barracks_${side}`, BW, BH, (g, w, h) => {
            g.fillStyle(c.dark);    g.fillRect(0, 0, w, h);
            g.fillStyle(c.body);    g.fillRect(3, 3, w - 6, h - 6);
            // Roof
            g.fillStyle(c.dark);
            g.fillTriangle(w / 2, 10, 10, h / 2, w - 10, h / 2);
            // Door
            g.fillStyle(0x111111); g.fillRect(w/2 - 10, h - 36, 20, 33);
            // Windows
            g.fillStyle(0x88ccff, 0.7);
            g.fillRect(14, h/2 - 10, 20, 16);
            g.fillRect(w - 34, h/2 - 10, 20, 16);
            // Star/emblem
            g.fillStyle(c.accent); g.fillCircle(w/2, h/2 + 10, 8);
        });

        // ── Factory (4×4 tiles) ──
        const FW = S * 4, FH = S * 4;
        makeBuildingTexture(scene, `factory_${side}`, FW, FH, (g, w, h) => {
            g.fillStyle(0x333333);  g.fillRect(0, 0, w, h);
            g.fillStyle(0x444455);  g.fillRect(4, 4, w - 8, h - 8);
            // Smokestacks
            g.fillStyle(0x222222);  g.fillRect(20, 20, 16, 50); g.fillRect(50, 30, 14, 40);
            g.fillStyle(0x555555);  g.fillRect(18, 15, 20, 8);  g.fillRect(48, 25, 18, 8);
            // Factory floor
            g.fillStyle(c.dark);    g.fillRect(10, h/2, w - 20, h/2 - 10);
            g.fillStyle(c.body, 0.5); g.fillRect(14, h/2 + 6, w - 28, h/2 - 22);
            // Door (roller door style)
            g.fillStyle(0x111111); g.fillRect(w/2 - 22, h - 50, 44, 47);
            for (let i = 0; i < 6; i++) {
                g.fillStyle(0x333333); g.fillRect(w/2 - 22, h - 50 + i * 8, 44, 2);
            }
            // Exhaust
            g.fillStyle(0x888888, 0.4);
            g.fillCircle(28, 14, 10); g.fillCircle(57, 24, 8);
        });

        // ── Airfield (5×3 tiles) ──
        const AW = S * 5, AH = S * 3;
        makeBuildingTexture(scene, `airfield_${side}`, AW, AH, (g, w, h) => {
            g.fillStyle(0x555566);  g.fillRect(0, 0, w, h);
            // Runway
            g.fillStyle(0x444455);  g.fillRect(10, h/2 - 16, w - 20, 32);
            // Runway markings
            g.fillStyle(0xffffff, 0.5);
            for (let i = 0; i < 5; i++) g.fillRect(20 + i * 38, h/2 - 4, 20, 8);
            // Hangar
            g.fillStyle(c.dark);    g.fillRect(10, 8, 70, h - 30);
            g.fillStyle(c.body, 0.6);
            g.beginPath(); g.moveTo(45, 8);
            g.arc(45, 8, 35, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360));
            g.closePath(); g.fillPath();
            g.fillStyle(0x111111); g.fillRect(16, h - 36, 60, 26);
            // Control tower
            g.fillStyle(0x888888);  g.fillRect(w - 50, 0, 30, h - 20);
            g.fillStyle(0x6699cc, 0.8); g.fillRect(w - 48, 10, 26, 20);
        });

        // ── Oil Rig (2×2 tiles) ──
        const OW = S * 2, OH = S * 2;
        makeBuildingTexture(scene, `oil_rig_${side}`, OW, OH, (g, w, h) => {
            g.fillStyle(0x333333);  g.fillRect(0, 0, w, h);
            // Derrick legs
            g.lineStyle(4, 0x555555);
            g.lineBetween(w/2, 10, 10, h - 10);
            g.lineBetween(w/2, 10, w - 10, h - 10);
            g.lineBetween(10, h/2, w - 10, h/2);
            // Top pulley
            g.fillStyle(0x888888);  g.fillCircle(w/2, 10, 8);
            g.fillStyle(0xffcc00);  g.fillCircle(w/2, 10, 4);
            // Pump
            g.fillStyle(0x222222);  g.fillRect(w/2 - 10, h/2, 20, 20);
            // Oil puddle
            g.fillStyle(0x000000, 0.4); g.fillEllipse(w/2, h - 12, 40, 10);
        });

        // ── Farm (3×3 tiles) ──
        const FMW = S * 3, FMH = S * 3;
        makeBuildingTexture(scene, `farm_${side}`, FMW, FMH, (g, w, h) => {
            // Field rows
            for (let row = 0; row < 6; row++) {
                g.fillStyle(row % 2 === 0 ? 0x3a7a22 : 0x5a9c2a);
                g.fillRect(0, row * (h / 6), w, h / 6);
            }
            // Silo
            g.fillStyle(0xddbb55); g.fillRect(w - 40, 8, 28, h - 20);
            g.fillStyle(0xcc9933);
            g.beginPath(); g.moveTo(w - 26, 8);
            g.arc(w - 26, 8, 14, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(360));
            g.closePath(); g.fillPath();
            // Barn
            g.fillStyle(0x8b3a1a); g.fillRect(8, h/2 + 4, 55, h/2 - 14);
            g.fillStyle(0x6b2a0a);
            g.fillTriangle(6, h/2 + 4, 36, h/2 - 16, 65, h/2 + 4);
        });

        // ── Steel Mill (3×3 tiles) ──
        const SMW = S * 3, SMH = S * 3;
        makeBuildingTexture(scene, `steel_mill_${side}`, SMW, SMH, (g, w, h) => {
            g.fillStyle(0x444444);  g.fillRect(0, 0, w, h);
            g.fillStyle(0x556655);  g.fillRect(4, 4, w - 8, h - 8);
            // Blast furnace
            g.fillStyle(0x333333);  g.fillRect(w/2 - 20, 10, 40, h - 30);
            g.fillStyle(0xff6600, 0.7); g.fillCircle(w/2, 14, 16);
            g.fillStyle(0xffaa00, 0.5); g.fillCircle(w/2, 14, 10);
            // Smoke
            g.fillStyle(0x888888, 0.4);
            g.fillCircle(w/2 - 5, 6, 8); g.fillCircle(w/2 + 5, 4, 6);
            // Conveyor
            g.fillStyle(0x222222); g.fillRect(8, h - 40, w - 16, 8);
            for (let i = 0; i < 8; i++) g.fillRect(8 + i * 16, h - 40, 4, 8);
        });

        // ── Turret (1×1 tile) ──
        make(scene, `turret_${side}`, S, S, g => {
            // Base
            g.fillStyle(0x222222);  g.fillCircle(S/2, S/2, 20);
            g.fillStyle(c.dark);    g.fillCircle(S/2, S/2, 16);
            g.fillStyle(c.accent);  g.fillCircle(S/2, S/2, 10);
            // Barrel (pointing right by default)
            g.fillStyle(0x333333);  g.fillRect(S/2, S/2 - 3, 20, 6);
            g.fillStyle(0x111111);  g.fillRect(S/2 + 2, S/2 - 2, 16, 4);
        });

        // ── Wall (1×1 tile) ──
        make(scene, `wall_${side}`, S, S, g => {
            g.fillStyle(0x777788);  g.fillRect(0, 0, S, S);
            g.fillStyle(0x888899);  g.fillRect(2, 2, S - 4, S - 4);
            // Battlements
            g.fillStyle(0x666677);
            g.fillRect(0, 0, 14, 12); g.fillRect(18, 0, 14, 12);
            g.fillRect(0, 36, 14, 12); g.fillRect(18, 36, 14, 12);
            // Mortar lines
            g.lineStyle(1, 0x555566, 0.5);
            g.lineBetween(0, 24, S, 24);
            g.lineBetween(24, 0, 24, S);
        });
    });
}

// ── Resource Node textures ─────────────────────
function makeResourceNodes(scene) {
    const S = 48;

    // Oil Field
    make(scene, 'node_oil', S * 2, S * 2, (g, w, h) => {
        // Dark ground
        g.fillStyle(0x111111, 0.7); g.fillEllipse(w/2, h/2 + 10, w - 20, h/2);
        // Pump jack structure
        g.fillStyle(0x555555);
        g.fillRect(w/2 - 4, 10, 8, h - 30);
        g.fillRect(w/2 - 20, h/2 - 8, 40, 8);
        g.fillStyle(0x333333);
        g.fillCircle(w/2, h/2, 8);
        g.fillStyle(0xffcc00); g.fillCircle(w/2, h/2, 4);
        // Oil slick
        g.fillStyle(0x001a00, 0.5); g.fillEllipse(w/2, h - 14, 50, 16);
    });

    // Crop Field
    make(scene, 'node_food', S * 2, S * 2, (g, w, h) => {
        // Rows
        for (let r = 0; r < 5; r++) {
            g.fillStyle(r % 2 === 0 ? 0x4a9a1a : 0x5aaa2a);
            g.fillRect(10, 10 + r * (h - 20) / 5, w - 20, (h - 20) / 5);
        }
        // Wheat stalks
        g.fillStyle(0xddaa22);
        for (let i = 0; i < 6; i++) {
            const sx = 16 + i * 14;
            g.fillRect(sx, 14, 3, 20);
            g.fillEllipse(sx + 1, 12, 8, 10);
        }
        g.lineStyle(2, 0x2d6a0a); g.strokeRect(8, 8, w - 16, h - 16);
    });

    // Steel Deposit
    make(scene, 'node_steel', S * 2, S * 2, (g, w, h) => {
        // Rocky mound
        g.fillStyle(0x666666); g.fillEllipse(w/2, h/2 + 10, w - 10, h/2 + 10);
        g.fillStyle(0x888888); g.fillEllipse(w/2 - 8, h/2, 30, 24);
        g.fillStyle(0x777777); g.fillEllipse(w/2 + 10, h/2 - 4, 26, 20);
        // Metallic gleam
        g.fillStyle(0xaaaacc, 0.4);
        g.fillEllipse(w/2 - 5, h/2 - 10, 16, 10);
        g.fillEllipse(w/2 + 12, h/2 - 6, 10, 7);
    });
}

// ── UI / FX textures ─────────────────────────
function makeUI(scene) {
    const S = 48;

    // Selection ring (transparent center)
    make(scene, 'sel_ring', 48, 48, g => {
        g.lineStyle(2, 0x00ff88, 0.9);
        g.strokeCircle(24, 24, 20);
        g.lineStyle(1, 0x00ff88, 0.4);
        g.strokeCircle(24, 24, 22);
    });

    // Attack ring (red)
    make(scene, 'atk_ring', 48, 48, g => {
        g.lineStyle(2, 0xff4444, 0.9);
        g.strokeCircle(24, 24, 20);
    });

    // Move target marker
    make(scene, 'move_marker', 20, 20, g => {
        g.lineStyle(2, 0x00ffaa, 1);
        g.strokeCircle(10, 10, 8);
        g.fillStyle(0x00ffaa, 0.4); g.fillCircle(10, 10, 4);
    });

    // Health bar backgrounds
    make(scene, 'hpbar_bg', 36, 5, g => {
        g.fillStyle(0x000000, 0.7); g.fillRect(0, 0, 36, 5);
        g.lineStyle(1, 0x444444); g.strokeRect(0, 0, 36, 5);
    });
    make(scene, 'hpbar_green', 34, 3, g => {
        g.fillStyle(0x00cc44); g.fillRect(0, 0, 34, 3);
    });
    make(scene, 'hpbar_yellow', 34, 3, g => {
        g.fillStyle(0xffcc00); g.fillRect(0, 0, 34, 3);
    });
    make(scene, 'hpbar_red', 34, 3, g => {
        g.fillStyle(0xff3300); g.fillRect(0, 0, 34, 3);
    });

    // Projectile
    make(scene, 'bullet', 8, 4, g => {
        g.fillStyle(0xffff00); g.fillRect(0, 0, 8, 4);
        g.fillStyle(0xff8800); g.fillRect(0, 1, 4, 2);
    });
    make(scene, 'shell', 12, 6, g => {
        g.fillStyle(0xff8800); g.fillRect(0, 0, 12, 6);
        g.fillStyle(0xffff00, 0.6); g.fillRect(0, 2, 6, 2);
    });
    make(scene, 'missile', 16, 6, g => {
        g.fillStyle(0xaaaaaa); g.fillRect(0, 0, 14, 6);
        g.fillStyle(0xff4400, 0.8); g.fillRect(14, 1, 4, 4);
        g.fillStyle(0xffffff, 0.4); g.fillRect(2, 2, 6, 2);
    });

    // Explosion frames
    for (let f = 0; f < 6; f++) {
        make(scene, `explosion_${f}`, 64, 64, g => {
            const r = 8 + f * 8;
            const alpha = 1 - f * 0.15;
            g.fillStyle(0xff4400, alpha * 0.8);   g.fillCircle(32, 32, r);
            g.fillStyle(0xffaa00, alpha * 0.9);   g.fillCircle(32, 32, r * 0.7);
            g.fillStyle(0xffff00, alpha);          g.fillCircle(32, 32, r * 0.4);
            // sparks
            if (f < 4) {
                g.fillStyle(0xffffff, alpha * 0.7);
                for (let s = 0; s < 6; s++) {
                    const angle = (s / 6) * Math.PI * 2 + f;
                    const sr = r + 6;
                    g.fillRect(32 + Math.cos(angle) * sr - 1, 32 + Math.sin(angle) * sr - 1, 3, 3);
                }
            }
        });
    }

    // Fog of war tile
    make(scene, 'fog_unexplored', S, S, g => {
        g.fillStyle(0x000000); g.fillRect(0, 0, S, S);
    });
    make(scene, 'fog_explored', S, S, g => {
        g.fillStyle(0x000000, 0.55); g.fillRect(0, 0, S, S);
    });

    // UI panel backgrounds
    make(scene, 'panel_dark', 4, 4, g => {
        g.fillStyle(0x0a0a14, 0.92); g.fillRect(0, 0, 4, 4);
    });
    make(scene, 'btn_normal', 80, 32, g => {
        g.fillStyle(0x1a2a3a); g.fillRect(0, 0, 80, 32);
        g.lineStyle(1, 0x2a4a6a); g.strokeRect(0, 0, 80, 32);
    });
    make(scene, 'btn_hover', 80, 32, g => {
        g.fillStyle(0x2a3a4a); g.fillRect(0, 0, 80, 32);
        g.lineStyle(1, 0x00ff88); g.strokeRect(0, 0, 80, 32);
    });

    // Minimap background
    make(scene, 'minimap_bg', 200, 150, g => {
        g.fillStyle(0x0a1a0a); g.fillRect(0, 0, 200, 150);
        g.lineStyle(2, 0x00ff88, 0.6); g.strokeRect(0, 0, 200, 150);
    });

    // Build placement preview
    make(scene, 'place_ok', S, S, g => {
        g.fillStyle(0x00ff88, 0.25); g.fillRect(0, 0, S, S);
        g.lineStyle(2, 0x00ff88, 0.8); g.strokeRect(0, 0, S, S);
    });
    make(scene, 'place_bad', S, S, g => {
        g.fillStyle(0xff0000, 0.25); g.fillRect(0, 0, S, S);
        g.lineStyle(2, 0xff0000, 0.8); g.strokeRect(0, 0, S, S);
    });
}

// ── Entry point ───────────────────────────────
export function generateAllTextures(scene) {
    makeTiles(scene);
    makeUnits(scene);
    makeBuildings(scene);
    makeResourceNodes(scene);
    makeUI(scene);
}
