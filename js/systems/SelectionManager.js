// ============================================================
// IRON DOMINION - Selection Manager
// ============================================================

class SelectionManager {
  constructor(game) {
    this.game = game;
    this.selected         = new Set(); // Unit instances
    this.selectedBuilding = null;      // Building instance
    this.controlGroups    = {};        // 1-9 → array of unit refs
  }

  clearAll() {
    for (const u of this.selected) u.selected = false;
    this.selected.clear();
    if (this.selectedBuilding) {
      this.selectedBuilding.selected = false;
      this.selectedBuilding = null;
    }
  }

  getAllSelected() {
    const result = [];
    for (const u of this.selected) if (!u.dead) result.push(u);
    if (this.selectedBuilding && !this.selectedBuilding.dead) result.push(this.selectedBuilding);
    return result;
  }

  getSelectedUnits() {
    return [...this.selected].filter(u => !u.dead);
  }

  hasMilitary() {
    return this.getSelectedUnits().some(u => u.unitClass !== 'civilian');
  }

  hasVillagers() {
    return this.getSelectedUnits().some(u => u.unitClass === 'civilian');
  }

  count() {
    return this.selected.size + (this.selectedBuilding ? 1 : 0);
  }

  // ── Control Groups ────────────────────────────────────────
  assignGroup(n) {
    // Store all currently selected units (not buildings) in group n
    const units = [...this.selected].filter(u => !u.dead);
    this.controlGroups[n] = units;
  }

  recallGroup(n) {
    const group = this.controlGroups[n];
    if (!group || group.length === 0) return false;
    const alive = group.filter(u => !u.dead);
    if (alive.length === 0) return false;
    this.clearAll();
    for (const u of alive) {
      this.selected.add(u);
      u.selected = true;
    }
    return true;
  }

  getGroupCenter(n) {
    const group = this.controlGroups[n];
    if (!group || group.length === 0) return null;
    let sx = 0, sy = 0, count = 0;
    for (const u of group) {
      if (u.dead) continue;
      sx += u.x; sy += u.y; count++;
    }
    if (count === 0) return null;
    return { x: sx / count, y: sy / count };
  }

  getUnitGroup(unit) {
    for (const [n, group] of Object.entries(this.controlGroups)) {
      if (group.includes(unit)) return parseInt(n);
    }
    return null;
  }
}
