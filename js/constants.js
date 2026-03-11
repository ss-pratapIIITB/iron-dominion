// ============================================================
// IRON DOMINION - Game Constants
// ============================================================

const TILE_SIZE = 48;       // simulation grid size (pathfinding, distances)
const MAP_W = 64;
const MAP_H = 64;
const LOGIC_TICK = 50; // ms - 20Hz

// Isometric rendering constants
const ISO_TILE_W = 64;      // width of isometric diamond tile
const ISO_TILE_H = 32;      // height of isometric diamond tile (2:1 ratio)
const ISO_ORIGIN_X = MAP_H * ISO_TILE_W / 2; // horizontal offset so all tiles have x >= 0

// Terrain types
const TERRAIN = { GRASS: 0, FOREST: 1, WATER: 2, MOUNTAIN: 3, SAND: 4, DIRT: 5 };

// Resource types
const RESOURCE = { WOOD: 'wood', FOOD: 'food', GOLD: 'gold', STONE: 'stone' };

// Unit states
const UNIT_STATE = {
  IDLE: 'IDLE',
  MOVING: 'MOVING',
  ATTACKING: 'ATTACKING',
  GATHERING: 'GATHERING',
  RETURNING_RESOURCE: 'RETURNING_RESOURCE',
  BUILDING: 'BUILDING',
  PATROL: 'PATROL',
  PARALYZED: 'PARALYZED', // EMP stun from Monk ability
  DEAD: 'DEAD'
};

// Unit definitions
const UNIT_DEFS = {
  VILLAGER:  { name:'Villager',  hp:25,  maxHp:25,  atk:3,  atkRange:1.5, atkCooldown:1500, speed:1.8, los:5,  cost:{food:50},            trainTime:25000, meleeArmor:0, pierceArmor:0, gatherRate:25, carryCap:10, class:'civilian', size:0.8 },
  MILITIA:      { name:'Militia',      hp:40,  maxHp:40,  atk:4,  atkRange:1.5, atkCooldown:1000, speed:1.9, los:4,  cost:{food:60,gold:20},       trainTime:21000, meleeArmor:0, pierceArmor:0, class:'infantry', size:0.9 },
  SWORDSMAN:    { name:'Swordsman',    hp:70,  maxHp:70,  atk:8,  atkRange:1.5, atkCooldown:1000, speed:2.0, los:4,  cost:{food:80,gold:40},       trainTime:30000, meleeArmor:1, pierceArmor:1, class:'infantry', size:0.95, requires:'CASTLE' },
  ARCHER:       { name:'Archer',       hp:30,  maxHp:30,  atk:4,  atkRange:5,   atkCooldown:1500, speed:2.0, los:6,  cost:{wood:25,gold:45},       trainTime:35000, meleeArmor:0, pierceArmor:0, class:'archer',   size:0.9,  projectile:true },
  CROSSBOWMAN:  { name:'Crossbowman',  hp:45,  maxHp:45,  atk:7,  atkRange:5.5, atkCooldown:2200, speed:1.8, los:6,  cost:{wood:50,gold:70},       trainTime:40000, meleeArmor:0, pierceArmor:1, class:'archer',   size:0.95, projectile:true, requires:'CASTLE' },
  SPEARMAN:     { name:'Spearman',     hp:45,  maxHp:45,  atk:3,  atkRange:1.5, atkCooldown:1000, speed:2.0, los:4,  cost:{food:35,wood:25},       trainTime:22000, meleeArmor:0, pierceArmor:1, class:'infantry', bonuses:{cavalry:15}, size:0.9 },
  SCOUT:        { name:'Scout',        hp:25,  maxHp:25,  atk:2,  atkRange:1.5, atkCooldown:1200, speed:3.8, los:9,  cost:{food:50},               trainTime:20000, meleeArmor:0, pierceArmor:0, class:'cavalry',  size:0.85 },
  KNIGHT:       { name:'Knight',       hp:100, maxHp:100, atk:10, atkRange:1.5, atkCooldown:1000, speed:3.0, los:5,  cost:{food:60,gold:75},       trainTime:40000, meleeArmor:2, pierceArmor:2, class:'cavalry',  size:1.1,  upkeep:1.0 },
  TREBUCHET:    { name:'Trebuchet',    hp:150, maxHp:150, atk:50, atkRange:10,  atkCooldown:4000, speed:0.8, los:8,  cost:{wood:200,gold:200},     trainTime:50000, meleeArmor:0, pierceArmor:0, class:'siege',    projectile:true, size:1.3, upkeep:2.0 },
  // Hero unit — one per player per game, trains from Town Center
  WARLORD:      { name:'Iron Warlord', hp:250, maxHp:250, atk:18, atkRange:2.0, atkCooldown:900, speed:2.6, los:7,  cost:{food:200,gold:300},     trainTime:60000, meleeArmor:4, pierceArmor:3, class:'hero',     size:1.2,  isHero:true, upkeep:3.0 },
  // Support unit — healer with EMP burst (modern twist), trains from MONASTERY
  MONK:         { name:'Monk',         hp:35,  maxHp:35,  atk:0,  atkRange:0,   atkCooldown:0,    speed:1.7, los:5,  cost:{gold:100,food:50},      trainTime:30000, meleeArmor:0, pierceArmor:0, class:'support',  size:0.85, healRadius:1.5, healRate:15 },
  // Modern units — trains from WEAPONRY / FACTORY (Imperial age twist)
  GUNNER:       { name:'Gunner',       hp:45,  maxHp:45,  atk:8,  atkRange:4.5, atkCooldown:1800, speed:1.8, los:6,  cost:{food:50,gold:60},       trainTime:35000, meleeArmor:0, pierceArmor:1, class:'infantry', size:0.9,  projectile:true, requires:'WEAPONRY' },
  CAR:          { name:'Scout Car',    hp:90,  maxHp:90,  atk:7,  atkRange:4.0, atkCooldown:1200, speed:4.5, los:8,  cost:{gold:120,wood:60},      trainTime:35000, meleeArmor:1, pierceArmor:2, class:'cavalry',  size:1.05, projectile:true, upkeep:1.5 },
  TANK:         { name:'Tank',         hp:300, maxHp:300, atk:50, atkRange:7.0, atkCooldown:3000, speed:1.4, los:7,  cost:{gold:350,wood:150,stone:50}, trainTime:65000, meleeArmor:6, pierceArmor:5, class:'siege', size:1.3, projectile:true, upkeep:3.5, isMechSiege:true },
};

// Research/upgrade definitions — the modern tech-depth twist
// Each research applies a bonus to the owning player via player.researched Set
const RESEARCH_DEFS = {
  // ── Blacksmith ─────────────────────────────────────────────────────────────
  IRON_FORGING:      { name:'Iron Forging',       icon:'⚔', cost:{food:150,gold:100}, time:35000, building:'BLACKSMITH', requires:'FEUDAL',
                       desc:'+2 infantry attack',       effect:{ type:'unit_atk', classes:['infantry','hero'], bonus:2 } },
  SCALE_BARDING:     { name:'Scale Barding',       icon:'🛡', cost:{food:150,gold:100}, time:35000, building:'BLACKSMITH', requires:'FEUDAL',
                       desc:'+1 melee armor all units',  effect:{ type:'melee_armor', classes:['infantry','cavalry','hero'], bonus:1 } },
  PADDED_ARMOR:      { name:'Padded Armor',         icon:'🧤', cost:{food:100,wood:50},  time:30000, building:'BLACKSMITH', requires:'FEUDAL',
                       desc:'+1 pierce armor archers',   effect:{ type:'pierce_armor', classes:['archer'], bonus:1 } },
  STEEL_WEAPONS:     { name:'Steel Weapons',        icon:'🗡', cost:{food:300,gold:200}, time:50000, building:'BLACKSMITH', requires:'CASTLE',
                       desc:'+3 attack all military',    effect:{ type:'unit_atk', classes:['infantry','cavalry','archer','siege','hero'], bonus:3 }, upgrades:'IRON_FORGING' },
  PLATE_MAIL:        { name:'Plate Mail Armor',     icon:'🏰', cost:{food:300,gold:250}, time:55000, building:'BLACKSMITH', requires:'CASTLE',
                       desc:'+2 melee armor all units',  effect:{ type:'melee_armor', classes:['infantry','cavalry','hero'], bonus:2 }, upgrades:'SCALE_BARDING' },
  // ── Lumber Camp ────────────────────────────────────────────────────────────
  DOUBLE_BIT_AXE:    { name:'Double-Bit Axe',       icon:'🪓', cost:{food:100,wood:50},  time:25000, building:'LUMBER_CAMP', requires:'FEUDAL',
                       desc:'+30% wood gather rate',     effect:{ type:'gather_rate', resource:'wood', bonus:0.30 } },
  BOW_SAW:           { name:'Bow Saw',              icon:'🔧', cost:{food:150,wood:100}, time:35000, building:'LUMBER_CAMP', requires:'CASTLE',
                       desc:'+20% wood carry capacity',  effect:{ type:'carry_cap', resource:'wood', bonus:0.20 }, upgrades:'DOUBLE_BIT_AXE' },
  // ── Mill ───────────────────────────────────────────────────────────────────
  HORSE_COLLAR:      { name:'Horse Collar',         icon:'🌾', cost:{wood:75,food:75},   time:20000, building:'MILL', requires:'FEUDAL',
                       desc:'+33% farm food yield',      effect:{ type:'farm_yield', bonus:0.33 } },
  HEAVY_PLOW:        { name:'Heavy Plow',           icon:'🌻', cost:{wood:125,food:125}, time:40000, building:'MILL', requires:'CASTLE',
                       desc:'+66% farm food yield',      effect:{ type:'farm_yield', bonus:0.66 }, upgrades:'HORSE_COLLAR' },
  // ── Mining Camp ────────────────────────────────────────────────────────────
  GOLD_MINING:       { name:'Gold Mining',          icon:'⛏', cost:{food:100,wood:75},  time:30000, building:'MINING_CAMP', requires:'FEUDAL',
                       desc:'+30% gold gather rate',     effect:{ type:'gather_rate', resource:'gold', bonus:0.30 } },
  STONE_MINING:      { name:'Stone Mining',         icon:'🪨', cost:{food:100,wood:75},  time:30000, building:'MINING_CAMP', requires:'FEUDAL',
                       desc:'+30% stone gather rate',    effect:{ type:'gather_rate', resource:'stone', bonus:0.30 } },
  // ── Archery Range ──────────────────────────────────────────────────────────
  FLETCHING:         { name:'Fletching',            icon:'🏹', cost:{food:100,wood:50},  time:30000, building:'ARCHERY_RANGE', requires:'FEUDAL',
                       desc:'+1 archer range, +1 atk',   effect:{ type:'archer_upgrade', atkBonus:1, rangeBonus:1 } },
  // ── Siege Workshop ──────────────────────────────────────────────────────────
  SIEGE_ENGINEERS:   { name:'Siege Engineers',      icon:'💣', cost:{wood:200,gold:150}, time:45000, building:'SIEGE_WORKSHOP', requires:'CASTLE',
                       desc:'+20% siege attack',         effect:{ type:'unit_atk', classes:['siege'], bonus:10 } },
  // ── New researches ─────────────────────────────────────────────────────────
  CHAIN_MAIL:        { name:'Chain Mail',           icon:'🛡', cost:{food:200,gold:150}, time:40000, building:'BLACKSMITH', requires:'CASTLE',
                       desc:'+1 pierce armor infantry + cavalry', effect:{ type:'pierce_armor', classes:['infantry','cavalry'], bonus:1 } },
  BALLISTICS:        { name:'Ballistics',           icon:'🎯', cost:{food:250,gold:200}, time:50000, building:'ARCHERY_RANGE', requires:'CASTLE',
                       desc:'+1 range all projectile units',       effect:{ type:'range_upgrade', classes:['archer','siege'], bonus:1 } },
  SIEGE_ONAGER:      { name:'Siege Onager',         icon:'⚙',  cost:{food:400,gold:300}, time:60000, building:'SIEGE_WORKSHOP', requires:'IMPERIAL',
                       desc:'+3 range + splash damage',            effect:{ type:'range_upgrade', classes:['siege'], bonus:3 }, upgrades:'SIEGE_ENGINEERS' },
  // ── Weaponry ───────────────────────────────────────────────────────────────
  FIREARMS:          { name:'Firearms',             icon:'🔫', cost:{food:200,gold:300}, time:50000, building:'WEAPONRY', requires:'CASTLE',
                       desc:'+2 atk all infantry, +1 pierce armor', effect:{ type:'unit_atk', classes:['infantry'], bonus:2 } },
  RIFLING:           { name:'Rifling',              icon:'🎯', cost:{food:300,gold:450}, time:65000, building:'WEAPONRY', requires:'IMPERIAL',
                       desc:'+1 range all projectile units',        effect:{ type:'range_upgrade', classes:['infantry','cavalry','siege'], bonus:1 }, upgrades:'FIREARMS' },
  // ── Factory ────────────────────────────────────────────────────────────────
  COMBUSTION:        { name:'Combustion Engine',    icon:'⚙',  cost:{gold:400,wood:200}, time:60000, building:'FACTORY', requires:'IMPERIAL',
                       desc:'+1 atk all cavalry',                   effect:{ type:'unit_atk', classes:['cavalry'], bonus:1 } },
};

// Building definitions
const BUILDING_DEFS = {
  TOWN_CENTER:    { name:'Town Center',    hp:2400, maxHp:2400, cost:{wood:275,stone:100}, size:4, trainUnits:['VILLAGER','WARLORD'],   los:8, atk:6,  atkRange:8, atkCooldown:2000, dropOff:['wood','food','gold','stone'], maxGarrison:15 },
  HOUSE:          { name:'House',          hp:550,  maxHp:550,  cost:{wood:25},            size:2, popCap:5,                            los:3 },
  BARRACKS:       { name:'Barracks',       hp:1200, maxHp:1200, cost:{wood:175},           size:3, trainUnits:['MILITIA','SWORDSMAN','SPEARMAN'],  los:4, requires:'FEUDAL' },
  ARCHERY_RANGE:  { name:'Archery Range',  hp:1500, maxHp:1500, cost:{wood:175},           size:3, trainUnits:['ARCHER','CROSSBOWMAN'],            los:4, requires:'FEUDAL' },
  STABLE:         { name:'Stable',         hp:1500, maxHp:1500, cost:{wood:175},           size:3, trainUnits:['SCOUT','KNIGHT'],                  los:4, requires:'CASTLE' },
  SIEGE_WORKSHOP: { name:'Siege Workshop', hp:1500, maxHp:1500, cost:{wood:200},           size:3, trainUnits:['TREBUCHET'],           los:4, requires:'CASTLE' },
  BLACKSMITH:     { name:'Blacksmith',     hp:1500, maxHp:1500, cost:{wood:150},           size:3,                                     los:4, requires:'FEUDAL' },
  LUMBER_CAMP:    { name:'Lumber Camp',    hp:600,  maxHp:600,  cost:{wood:100},           size:2,                                     los:3, dropOff:['wood'] },
  MINING_CAMP:    { name:'Mining Camp',    hp:600,  maxHp:600,  cost:{wood:100},           size:2,                                     los:3, dropOff:['gold','stone'] },
  MILL:           { name:'Mill',           hp:600,  maxHp:600,  cost:{wood:100},           size:2,                                     los:3, dropOff:['food'] },
  FARM:           { name:'Farm',           hp:200,  maxHp:200,  cost:{wood:60},            size:2,                                     los:3, foodYield:250, requires:'FEUDAL' },
  TOWER:          { name:'Watch Tower',    hp:500,  maxHp:500,  cost:{stone:125},          size:1,                                     los:8, atk:5, atkRange:7, atkCooldown:2000, requires:'FEUDAL', maxGarrison:5 },
  WALL:           { name:'Stone Wall',     hp:1800, maxHp:1800, cost:{stone:2},            size:1,                                     los:3, requires:'FEUDAL' },
  MONASTERY:      { name:'Monastery',      hp:1200, maxHp:1200, cost:{stone:175,wood:75},  size:3, trainUnits:['MONK'],                        los:4, requires:'CASTLE' },
  WEAPONRY:       { name:'Weaponry',       hp:1500, maxHp:1500, cost:{wood:200,stone:50},  size:3, trainUnits:['GUNNER'],                      los:4, requires:'CASTLE' },
  FACTORY:        { name:'Factory',        hp:2000, maxHp:2000, cost:{wood:250,stone:150,gold:100}, size:4, trainUnits:['CAR','TANK'],          los:5, requires:'IMPERIAL' },
};

// Age advancement
const AGE_DEFS = {
  DARK:     { name:'Dark Age',     index:0, cost:{},                    time:0,      requires:[] },
  FEUDAL:   { name:'Feudal Age',   index:1, cost:{food:500},            time:130000, requires:[] },
  CASTLE:   { name:'Castle Age',   index:2, cost:{food:800,gold:200},   time:160000, requires:['BARRACKS'] },
  IMPERIAL: { name:'Imperial Age', index:3, cost:{food:1000,gold:800},  time:190000, requires:['SIEGE_WORKSHOP'] },
};
const AGE_ORDER = ['DARK','FEUDAL','CASTLE','IMPERIAL'];

// Player colors
const PLAYER_COLORS = ['#4488ff', '#ff4444', '#44cc44', '#ffaa00'];

// Terrain colors (MOUNTAIN repurposed as cobblestone road/plaza)
const TERRAIN_COLORS = {
  [TERRAIN.GRASS]:    '#5a916f',
  [TERRAIN.FOREST]:   '#2d5a27',
  [TERRAIN.WATER]:    '#3a7bd5',
  [TERRAIN.MOUNTAIN]: '#8a8a7a', // cobblestone gray
  [TERRAIN.SAND]:     '#a88858', // dirt path — more muted earthy brown (was too gold)
  [TERRAIN.DIRT]:     '#7a6040', // farmland
};

// Terrain passability (MOUNTAIN = cobblestone road, passable)
const TERRAIN_PASSABLE = {
  [TERRAIN.GRASS]:    true,
  [TERRAIN.FOREST]:   true,
  [TERRAIN.WATER]:    false,
  [TERRAIN.MOUNTAIN]: true,  // cobblestone roads are walkable
  [TERRAIN.SAND]:     true,
  [TERRAIN.DIRT]:     true,
};

// Resource node types
const RESOURCE_NODE_TYPES = {
  TREE:        { resource: RESOURCE.WOOD,  maxAmount: 150, color: '#2a4f24', label: 'T', radius: 18 },
  GOLD_MINE:   { resource: RESOURCE.GOLD,  maxAmount: 800, color: '#c8a940', label: 'G', radius: 16 },
  STONE_QUARRY:{ resource: RESOURCE.STONE, maxAmount: 700, color: '#9e9e9e', label: 'S', radius: 16 },
  BERRY_BUSH:  { resource: RESOURCE.FOOD,  maxAmount: 100, color: '#884488', label: 'B', radius: 12 },
};

// Global entity ID counter
let _nextEntityId = 1;
function nextEntityId() { return _nextEntityId++; }

// Canvas UI dimensions
const UI_TOP_H       = 44;
const UI_BOTTOM_H    = 140;
const MINIMAP_SIZE   = 200;
const PANEL_W        = 260;
