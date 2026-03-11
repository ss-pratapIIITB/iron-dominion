// ============================================================
// IRON DOMINION - AI Controller (Player 2)
// ============================================================

class AIController {
  constructor(game) {
    this.game     = game;
    this.player   = game.players[1];
    this.tick     = 0;
    this.tickRate = 2000; // ms between AI decisions
    this.tickAccum = 0;

    // Gather assignment tracking
    this.gatherAssignments = new Map(); // unit.id -> node

    // Attack state
    this.attackPhase    = false;
    this.retreatTimer   = 0;
    this.armyReadySize  = 6;  // start attacking at this many military units
    this.waveCount      = 0;

    // Build order tracking
    this.buildQueue = ['HOUSE', 'BARRACKS', 'ARCHERY_RANGE', 'LUMBER_CAMP', 'MINING_CAMP', 'MILL', 'HOUSE', 'HOUSE', 'STABLE', 'SIEGE_WORKSHOP', 'BLACKSMITH', 'WEAPONRY', 'FACTORY'];
    this.buildIndex = 0;

    // AI base center (bottom-right of map)
    this.baseX = 56;
    this.baseY = 56;

    // Economic thresholds
    this.targetVillagers = 8;
    this.targetWood = 4;
    this.targetFood = 3;
    this.targetGold = 2;
  }

  update(dt) {
    this.tickAccum += dt;
    if (this.tickAccum < this.tickRate) return;
    this.tickAccum -= this.tickRate;
    this.tick++;

    this._runEconomy();
    this._runMilitary();
    this._manageBuildQueue();
    this._manageGathering();
    if (this.tick % 3 === 0) this._manageResearch();
    if (this.tick % 5 === 0) this._considerAgeUp();
    if (this.tick % 4 === 0) this._manageAutoTrain();
  }

  // ── Economy ──────────────────────────────────────────────
  _runEconomy() {
    const player = this.player;
    const villagers = player.units.filter(u => !u.dead && u.type === 'VILLAGER');

    // Train more villagers if needed
    if (villagers.length < this.targetVillagers) {
      const tc = player.buildings.find(b => !b.dead && b.built && b.type === 'TOWN_CENTER');
      if (tc && tc.trainQueue.length < 3) {
        tc.enqueueUnit('VILLAGER');
      }
    }

    // Ensure pop cap keeps up
    if (player.pop >= player.popCap - 2) {
      this._tryBuild('HOUSE');
    }
  }

  _manageGathering() {
    const player = this.player;
    const villagers = player.units.filter(u => !u.dead && u.type === 'VILLAGER');
    const nodes = this.game.resourceNodes.filter(n => !n.depleted && !n.dead);

    // Count current assignments
    let woodVillagers = 0, foodVillagers = 0, goldVillagers = 0;
    for (const v of villagers) {
      if (v.state === UNIT_STATE.GATHERING || v.state === UNIT_STATE.RETURNING_RESOURCE) {
        if (!v.gatherTarget) continue;
        switch (v.gatherTarget.resourceType) {
          case 'wood':  woodVillagers++; break;
          case 'food':  foodVillagers++; break;
          case 'gold':  goldVillagers++; break;
        }
      }
    }

    // Assign idle villagers to resources
    for (const v of villagers) {
      if (v.state !== UNIT_STATE.IDLE) continue;

      // Determine priority resource
      let targetType;
      if (woodVillagers < this.targetWood) {
        targetType = 'wood'; woodVillagers++;
      } else if (foodVillagers < this.targetFood) {
        targetType = 'food'; foodVillagers++;
      } else if (goldVillagers < this.targetGold) {
        targetType = 'gold'; goldVillagers++;
      } else {
        targetType = 'food'; foodVillagers++; // default
      }

      // Find nearest node of that type
      const node = this._nearestNodeOfType(v, targetType, nodes);
      if (node) {
        v.cmdGather(node);
        // Also try to ensure drop-off building exists near node
        this._ensureDropoff(targetType);
      } else {
        // Fallback to any node
        const any = this._nearestNodeOfType(v, null, nodes);
        if (any) v.cmdGather(any);
      }
    }
  }

  _nearestNodeOfType(unit, type, nodes) {
    let best = null, bestDist = Infinity;
    for (const n of nodes) {
      if (type && n.resourceType !== type) continue;
      const d = dist(unit.x, unit.y, n.x, n.y);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    return best;
  }

  _ensureDropoff(type) {
    const player = this.player;
    let dropOffType;
    switch (type) {
      case 'wood':  dropOffType = 'LUMBER_CAMP';  break;
      case 'food':  dropOffType = 'MILL';          break;
      case 'gold':  dropOffType = 'MINING_CAMP';   break;
      case 'stone': dropOffType = 'MINING_CAMP';   break;
      default: return;
    }
    // Check if we already have one
    if (player.buildings.some(b => !b.dead && b.built && b.type === dropOffType)) return;
    // Build it
    if (this.buildQueue.indexOf(dropOffType) === -1) {
      this.buildQueue.unshift(dropOffType);
    }
  }

  // ── Building ─────────────────────────────────────────────
  _manageBuildQueue() {
    if (this.buildIndex >= this.buildQueue.length) return;
    const type = this.buildQueue[this.buildIndex];
    if (this._tryBuild(type)) {
      this.buildIndex++;
    }
  }

  _tryBuild(type) {
    const player = this.player;
    const def = BUILDING_DEFS[type];
    if (!def) return false;

    // Check age requirement
    if (def.requires && AGE_ORDER.indexOf(player.age) < AGE_ORDER.indexOf(def.requires)) return false;

    // Check affordability
    if (!player.canAfford(def.cost)) return false;

    // Find a villager to build
    const builder = player.units.find(u => !u.dead && u.type === 'VILLAGER' &&
      (u.state === UNIT_STATE.IDLE || u.state === UNIT_STATE.GATHERING));
    if (!builder) return false;

    // Find build location near base
    const spot = this._findBuildSpot(type, def.size);
    if (!spot) return false;

    // Spend resources
    player.spend(def.cost);

    // Place building
    const b = this.game.placeBuilding(type, spot.tx, spot.ty, 1, false); // built=false
    if (!b) return false;

    // Send builder
    builder.cmdBuild(b);
    return true;
  }

  _findBuildSpot(type, size) {
    const game = this.game;
    // Search around AI base
    for (let attempt = 0; attempt < 80; attempt++) {
      const tx = this.baseX + randomInt(-12, 6);
      const ty = this.baseY + randomInt(-12, 6);
      if (game.canPlaceBuilding(type, tx, ty)) {
        return { tx, ty };
      }
    }
    return null;
  }

  // ── Military ─────────────────────────────────────────────
  _runMilitary() {
    const player = this.player;
    const age = player.age;

    // Train units from military buildings
    for (const b of player.buildings) {
      if (!b.built || b.dead || b.trainQueue.length >= 3) continue;
      if (!b.def.trainUnits) continue;

      // Pick a unit to train
      for (const utype of b.def.trainUnits) {
        if (utype === 'VILLAGER') continue;
        const def = UNIT_DEFS[utype];
        if (!def) continue;
        if (player.canAfford(def.cost) && player.pop < player.popCap) {
          b.enqueueUnit(utype);
          break;
        }
      }
    }

    // Count military
    const military = player.units.filter(u => !u.dead && u.unitClass !== 'civilian');

    // Decide attack
    if (military.length >= this.armyReadySize && !this.attackPhase) {
      this.attackPhase = true;
      this.waveCount++;
      this.armyReadySize = Math.min(20, this.armyReadySize + 2); // needs more next time
      this._launchAttack(military);
    }

    // If army is beaten, reset attack phase
    if (this.attackPhase && military.length < 2) {
      this.attackPhase = false;
    }

    // Ensure attacking units keep attacking
    if (this.attackPhase) {
      this._continueAttack(military);
    }
  }

  _launchAttack(military) {
    const target = this._findPlayerTarget();
    if (!target) return;

    for (const u of military) {
      u.cmdAttack(target);
    }
  }

  _continueAttack(military) {
    const target = this._findPlayerTarget();
    if (!target) { this.attackPhase = false; return; }

    // For units that are idle (reached destination), order attack
    for (const u of military) {
      if (u.state === UNIT_STATE.IDLE) {
        u.cmdAttack(target);
      }
    }
  }

  _findPlayerTarget() {
    const p0 = this.game.players[0];
    const tc = p0.buildings.find(b => !b.dead && b.type === 'TOWN_CENTER');
    if (tc) return tc;
    const anyB = p0.buildings.find(b => !b.dead);
    if (anyB) return anyB;
    return p0.units.find(u => !u.dead) || null;
  }

  // ── Research ─────────────────────────────────────────────
  _manageResearch() {
    const player = this.player;
    // Priority research list (most impactful first)
    const priority = [
      'DOUBLE_BIT_AXE', 'GOLD_MINING', 'STONE_MINING',
      'HORSE_COLLAR', 'IRON_FORGING', 'SCALE_BARDING',
      'BOW_SAW', 'FLETCHING', 'HEAVY_PLOW',
      'STEEL_WEAPONS', 'PLATE_MAIL', 'SIEGE_ENGINEERS'
    ];

    for (const key of priority) {
      if (!player.canResearch(key)) continue;
      const rdef = RESEARCH_DEFS[key];
      if (!player.canAfford(rdef.cost)) continue;

      // Find the matching building
      const building = player.buildings.find(b =>
        !b.dead && b.built && b.type === rdef.building &&
        b.researchQueue.length === 0 && b.researchTimer <= 0
      );
      if (building) {
        building.enqueueResearch(key);
        break; // one research kick per tick
      }
    }
  }

  // ── Auto-train ───────────────────────────────────────────
  _manageAutoTrain() {
    const player = this.player;
    // Set auto-train on military buildings that aren't already training
    for (const b of player.buildings) {
      if (!b.built || b.dead || !b.def.trainUnits) continue;
      const militaryUnits = b.def.trainUnits.filter(u => u !== 'VILLAGER' && !UNIT_DEFS[u]?.isHero);
      if (militaryUnits.length === 0) continue;
      // Pick best unit this player can currently train (highest cost = strongest)
      const ageIdx = AGE_ORDER.indexOf(player.age);
      const available = militaryUnits.filter(u => {
        const def = UNIT_DEFS[u];
        return def && (!def.requires || AGE_ORDER.indexOf(def.requires) <= ageIdx);
      });
      if (available.length === 0) continue;
      // Sort by total cost descending — train the most powerful affordable unit
      available.sort((a, b) => {
        const ca = Object.values(UNIT_DEFS[a].cost).reduce((s,v) => s+v, 0);
        const cb = Object.values(UNIT_DEFS[b].cost).reduce((s,v) => s+v, 0);
        return cb - ca;
      });
      b.autoTrain = available[0];
      // If queue is empty and can afford, kick-start
      if (b.trainQueue.length === 0 && b.trainTimer <= 0 && b.autoTrain) {
        b.enqueueUnit(b.autoTrain);
      }
    }
  }

  // ── Age advancement ──────────────────────────────────────
  _considerAgeUp() {
    const player = this.player;
    if (player.advancing) return;
    const nextIdx = player.ageIndex + 1;
    if (nextIdx >= AGE_ORDER.length) return;
    const nextAge = AGE_ORDER[nextIdx];
    const ageDef  = AGE_DEFS[nextAge];

    // Check requirements
    for (const req of ageDef.requires) {
      if (!player.buildings.some(b => !b.dead && b.built && b.type === req)) return;
    }

    // Only advance if comfortable
    if (player.canAfford(ageDef.cost)) {
      player.startAgeAdvance();
    }
  }
}
