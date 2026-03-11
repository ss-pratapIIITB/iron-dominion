// ─────────────────────────────────────────────
//  IRON DOMINION  –  Game Configuration
// ─────────────────────────────────────────────

export const TILE_SIZE   = 48;   // px per tile
export const MAP_W       = 80;   // tiles wide
export const MAP_H       = 80;   // tiles tall
export const WORLD_W     = MAP_W * TILE_SIZE;
export const WORLD_H     = MAP_H * TILE_SIZE;

// ── Tile IDs ──────────────────────────────────
export const T = {
    GRASS:    0,
    DIRT:     1,
    SAND:     2,
    WATER:    3,
    FOREST:   4,
    MOUNTAIN: 5,
    ROAD:     6,
};

export const TILE_WALKABLE = {
    [T.GRASS]:    true,
    [T.DIRT]:     true,
    [T.SAND]:     true,
    [T.WATER]:    false,
    [T.FOREST]:   false,
    [T.MOUNTAIN]: false,
    [T.ROAD]:     true,
};

export const TILE_SPEED = {   // movement speed multiplier
    [T.GRASS]:    1.0,
    [T.DIRT]:     0.85,
    [T.SAND]:     0.7,
    [T.ROAD]:     1.4,
    [T.WATER]:    0,
    [T.FOREST]:   0,
    [T.MOUNTAIN]: 0,
};

// ── Unit Definitions ──────────────────────────
export const UNIT_DEF = {
    worker: {
        label: 'Worker',        hp: 60,   dmg: 0,   range: 0,
        speed: 95,  atkCd: 0,   sight: 5,
        cost: { money: 50 },
        trainMs: 6000,  from: 'command_center',
        isGatherer: true,
    },
    soldier: {
        label: 'Soldier',       hp: 100,  dmg: 14,  range: 3.5,
        speed: 88,  atkCd: 1200, sight: 6,
        cost: { food: 30, money: 75 },
        trainMs: 8000,  from: 'barracks',
    },
    sniper: {
        label: 'Sniper',        hp: 70,   dmg: 55,  range: 9,
        speed: 65,  atkCd: 2800, sight: 9,
        cost: { food: 20, money: 150 },
        trainMs: 12000, from: 'barracks',
    },
    jeep: {
        label: 'Jeep',          hp: 220,  dmg: 22,  range: 4.5,
        speed: 155, atkCd: 900,  sight: 7,
        cost: { oil: 80, steel: 50 },
        trainMs: 15000, from: 'factory',
    },
    tank: {
        label: 'Tank',          hp: 520,  dmg: 65,  range: 5.5,
        speed: 72,  atkCd: 2200, sight: 6,
        cost: { oil: 200, steel: 200 },
        trainMs: 28000, from: 'factory',
    },
    helicopter: {
        label: 'Helicopter',    hp: 280,  dmg: 42,  range: 7.5,
        speed: 190, atkCd: 1600, sight: 10,
        cost: { oil: 250, money: 200 },
        trainMs: 32000, from: 'airfield',
        isAir: true,
    },
};

// ── Building Definitions ──────────────────────
export const BUILDING_DEF = {
    command_center: {
        label: 'Command Center', hp: 2000, size: 4,
        cost: {},
        income: { money: 4 },   // per second
        trains: ['worker'],
    },
    barracks: {
        label: 'Barracks',  hp: 600,  size: 3,
        cost: { money: 200, steel: 100 },
        trains: ['soldier', 'sniper'],
    },
    factory: {
        label: 'Factory',   hp: 800,  size: 4,
        cost: { money: 400, steel: 200 },
        trains: ['jeep', 'tank'],
    },
    airfield: {
        label: 'Airfield',  hp: 600,  size: 5,
        cost: { money: 600, steel: 300 },
        trains: ['helicopter'],
    },
    oil_rig: {
        label: 'Oil Rig',   hp: 400,  size: 2,
        cost: { money: 150, steel: 75 },
        income: { oil: 3 },
    },
    farm: {
        label: 'Farm',      hp: 300,  size: 3,
        cost: { money: 100, steel: 25 },
        income: { food: 4 },
    },
    steel_mill: {
        label: 'Steel Mill', hp: 500, size: 3,
        cost: { money: 200, steel: 50 },
        income: { steel: 3 },
    },
    turret: {
        label: 'Turret',    hp: 450,  size: 1,
        cost: { money: 200, steel: 100 },
        dmg: 35,  range: 7,  atkCd: 1400,
    },
    wall: {
        label: 'Wall',      hp: 900,  size: 1,
        cost: { money: 25, steel: 80 },
    },
};

// Build menu ordering (for player HUD)
export const BUILD_ORDER = [
    'barracks', 'factory', 'airfield',
    'oil_rig', 'farm', 'steel_mill',
    'turret', 'wall',
];

// ── Resource Node Definitions ─────────────────
export const NODE_DEF = {
    oil:   { label: 'Oil Field',      res: 'oil',   total: 1800, rate: 2, gatherMs: 3000 },
    food:  { label: 'Crop Field',     res: 'food',  total: 1200, rate: 3, gatherMs: 2000 },
    steel: { label: 'Steel Deposit',  res: 'steel', total: 1400, rate: 2, gatherMs: 3500 },
};

// ── Campaign Scenarios ────────────────────────
export const SCENARIOS = [
    {
        id: 'tutorial',
        name: 'Operation: First Blood',
        desc: 'Secure the valley and eliminate the enemy command post.',
        mapSeed: 12345,
        mapType: 'grassland',
        playerRes: { oil: 400, food: 400, steel: 400, money: 600 },
        difficulty: 0.6,
        objectives: [
            'Build a Barracks',
            'Train at least 6 Soldiers',
            'Destroy the enemy Command Center',
        ],
        startingUnits: { worker: 3, soldier: 2 },
        briefing: 'Intel reports a hostile command center to the northeast. Gather resources, build your forces, and crush them.',
    },
    {
        id: 'desert_storm',
        name: 'Operation: Desert Storm',
        desc: 'Scarce resources, harsh terrain. Seize the oil fields first.',
        mapSeed: 99871,
        mapType: 'desert',
        playerRes: { oil: 150, food: 100, steel: 200, money: 350 },
        difficulty: 1.0,
        objectives: [
            'Capture all 3 Oil Fields',
            'Build a Factory',
            'Destroy the enemy Command Center',
        ],
        startingUnits: { worker: 2, soldier: 1 },
        briefing: 'The desert holds the last oil reserves. Control them or lose the war. The enemy is already digging in.',
    },
    {
        id: 'iron_fortress',
        name: 'Operation: Iron Fortress',
        desc: 'Hold your mountain stronghold against relentless enemy attacks.',
        mapSeed: 55512,
        mapType: 'mountains',
        playerRes: { oil: 600, food: 600, steel: 600, money: 1200 },
        difficulty: 1.5,
        objectives: [
            'Survive 8 enemy assault waves',
            'Destroy all enemy production buildings',
            'Capture the enemy Command Center',
        ],
        startingUnits: { worker: 4, soldier: 4, sniper: 2 },
        briefing: 'They outnumber us 3 to 1. But we hold the high ground. Fortify your position and make every bullet count.',
    },
];

// ── Difficulty tuning ─────────────────────────
export const AI_ATTACK_START_MS   = 90_000;   // first attack after 90s
export const AI_ATTACK_INTERVAL   = 55_000;   // then every 55s
export const AI_RESOURCE_TICK     = 800;      // AI resource collection interval ms
export const AI_BUILD_INTERVAL    = 15_000;   // AI build decision interval
export const FOG_UPDATE_INTERVAL  = 150;      // ms between fog updates
export const MINIMAP_UPDATE_INT   = 300;      // ms between minimap renders
export const INCOME_TICK          = 1000;     // ms between passive income ticks
export const GATHER_CARRY         = 20;       // resources per trip per worker
