// ============================================================
// IRON DOMINION - Player State
// ============================================================

class Player {
  constructor(id, color) {
    this.id    = id;    // 0 = human, 1 = AI
    this.color = color;

    // Resources
    this.wood  = 200;
    this.food  = 200;
    this.gold  = 100;
    this.stone = 0;

    // Population
    this.pop    = 0;   // current population
    this.popCap = 5;   // from houses + town center

    // Age
    this.age      = 'DARK';  // current age key
    this.ageIndex = 0;
    this.advancing = false;   // age-up in progress
    this.ageTimer  = 0;       // ms remaining

    // Buildings this player has
    this.buildings = []; // Building instances
    this.units     = []; // Unit instances

    // Research
    this.researched = new Set(); // completed research keys

    // Resource income rate (per minute, updated every 5s)
    this.woodRate    = 0;
    this.foodRate    = 0;
    this.goldRate    = 0;
    this.stoneRate   = 0;
    this.upkeepDrain = 0; // gold/min drain from heavy units
    this._rateTimer    = 0;
    this._prevSnapshot = null;

    // Game statistics
    this.stats = {
      unitsKilled:        0,
      unitsTrained:       0,
      buildingsBuilt:     0,
      buildingsDestroyed: 0,
      woodGathered:       0,
      foodGathered:       0,
      goldGathered:       0,
      stoneGathered:      0,
    };
  }

  // Spend resources; returns false if can't afford
  canAfford(cost) {
    for (const [res, amt] of Object.entries(cost)) {
      if (this[res] < amt) return false;
    }
    return true;
  }

  spend(cost) {
    for (const [res, amt] of Object.entries(cost)) {
      this[res] -= amt;
    }
  }

  addResource(type, amount) {
    this[type] = (this[type] || 0) + amount;
    if (amount > 0 && this.stats) {
      const key = type + 'Gathered';
      if (key in this.stats) this.stats[key] += amount;
    }
  }

  // Recalculate pop cap from buildings
  recalcPopCap() {
    let cap = 0;
    for (const b of this.buildings) {
      if (b.dead) continue;
      const def = BUILDING_DEFS[b.type];
      if (def && def.popCap)  cap += def.popCap;
      if (b.type === 'TOWN_CENTER') cap += 5;
    }
    this.popCap = Math.min(cap, 200);
  }

  recalcPop() {
    this.pop = this.units.filter(u => !u.dead).length;
  }

  // Check if a building type is available in current age
  buildingAvailable(type) {
    const def = BUILDING_DEFS[type];
    if (!def) return false;
    if (!def.requires) return true;
    return AGE_ORDER.indexOf(this.age) >= AGE_ORDER.indexOf(def.requires);
  }

  unitAvailable(type) {
    const def = UNIT_DEFS[type];
    if (!def) return false;
    return true; // unit availability handled by building requirements
  }

  // Start age advancement
  startAgeAdvance() {
    const nextIdx = this.ageIndex + 1;
    if (nextIdx >= AGE_ORDER.length) return false;
    const nextAge = AGE_ORDER[nextIdx];
    const ageDef  = AGE_DEFS[nextAge];

    if (!this.canAfford(ageDef.cost)) return false;

    // Check building requirements
    for (const req of ageDef.requires) {
      if (!this.buildings.some(b => !b.dead && b.type === req && b.built)) return false;
    }

    this.spend(ageDef.cost);
    this.advancing = true;
    this.ageTimer  = ageDef.time;
    this._nextAge  = nextAge;
    return true;
  }

  updateAge(dt) {
    // Calculate and drain upkeep for heavy military units
    let upkeepPerMin = 0;
    for (const u of this.units) {
      if (!u.dead && u.def && u.def.upkeep) upkeepPerMin += u.def.upkeep;
    }
    this.upkeepDrain = upkeepPerMin; // gold/min, for UI display
    if (upkeepPerMin > 0) {
      const drain = upkeepPerMin / 60000 * dt; // gold drained this tick
      this.gold = Math.max(0, this.gold - drain);
    }
    // Mark broke flag on units with upkeep when gold is depleted
    const broke = this.gold <= 0 && upkeepPerMin > 0;
    for (const u of this.units) {
      if (!u.dead && u.def && u.def.upkeep) u._upkeepBroke = broke;
    }

    // Track resource income rates every 5 seconds
    this._rateTimer += dt;
    if (this._rateTimer >= 5000) {
      if (this._prevSnapshot) {
        const mins = this._rateTimer / 60000;
        this.woodRate  = Math.round((this.wood  - this._prevSnapshot.wood)  / mins);
        this.foodRate  = Math.round((this.food  - this._prevSnapshot.food)  / mins);
        this.goldRate  = Math.round((this.gold  - this._prevSnapshot.gold)  / mins);
        this.stoneRate = Math.round((this.stone - this._prevSnapshot.stone) / mins);
      }
      this._prevSnapshot = { wood: this.wood, food: this.food, gold: this.gold, stone: this.stone };
      this._rateTimer = 0;
    }

    if (!this.advancing) return false;
    this.ageTimer -= dt;
    if (this.ageTimer <= 0) {
      this.age      = this._nextAge;
      this.ageIndex = AGE_ORDER.indexOf(this.age);
      this.advancing = false;
      this.ageTimer  = 0;
      return true; // age-up complete
    }
    return false;
  }

  hasBuilding(type) {
    return this.buildings.some(b => !b.dead && b.type === type && b.built);
  }

  // ── Research helpers ─────────────────────────────────────
  canResearch(key) {
    const r = RESEARCH_DEFS[key];
    if (!r) return false;
    if (this.researched.has(key)) return false;
    // Age requirement
    if (r.requires && AGE_ORDER.indexOf(this.age) < AGE_ORDER.indexOf(r.requires)) return false;
    // Must have predecessor if this is an upgrade
    if (r.upgrades && !this.researched.has(r.upgrades)) return false;
    return true;
  }

  // Cumulative attack bonus for a unit class
  getAtkBonus(unitClass) {
    let bonus = 0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'unit_atk' && r.effect.classes.includes(unitClass)) bonus += r.effect.bonus;
      if (r.effect.type === 'archer_upgrade' && unitClass === 'archer') bonus += r.effect.atkBonus;
    }
    return bonus;
  }

  getMeleeArmorBonus(unitClass) {
    let bonus = 0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'melee_armor' && r.effect.classes.includes(unitClass)) bonus += r.effect.bonus;
    }
    return bonus;
  }

  getPierceArmorBonus(unitClass) {
    let bonus = 0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'pierce_armor' && r.effect.classes.includes(unitClass)) bonus += r.effect.bonus;
    }
    return bonus;
  }

  // Gather rate multiplier (e.g. 1.3 = 30% faster)
  getGatherBonus(resource) {
    let mult = 1.0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'gather_rate' && r.effect.resource === resource) mult += r.effect.bonus;
    }
    return mult;
  }

  // Carry cap multiplier
  getCarryCapBonus(resource) {
    let mult = 1.0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'carry_cap' && r.effect.resource === resource) mult += r.effect.bonus;
    }
    return mult;
  }

  // Farm food yield multiplier
  getFarmYieldBonus() {
    let mult = 1.0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'farm_yield') mult += r.effect.bonus;
    }
    return mult;
  }

  // Attack range bonus in tiles (archer upgrades + general range research)
  getAtkRangeBonus(unitClass) {
    let bonus = 0;
    for (const key of this.researched) {
      const r = RESEARCH_DEFS[key];
      if (!r) continue;
      if (r.effect.type === 'archer_upgrade' && unitClass === 'archer') bonus += r.effect.rangeBonus;
      if (r.effect.type === 'range_upgrade' && r.effect.classes.includes(unitClass)) bonus += r.effect.bonus;
    }
    return bonus;
  }
}
