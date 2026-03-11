// ============================================================
// IRON DOMINION - Input Manager
// ============================================================

class InputManager {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game   = game;

    this.keys       = {};
    this.mouseX     = 0;
    this.mouseY     = 0;
    this.mouseWorldX = 0;
    this.mouseWorldY = 0;

    this.leftDown   = false;
    this.rightDown  = false;
    this.mouseDownX = 0;
    this.mouseDownY = 0;

    // Drag selection state
    this.isDragging  = false;
    this.dragStartX  = 0;
    this.dragStartY  = 0;
    this.dragEndX    = 0;
    this.dragEndY    = 0;
    this.dragThresh  = 8; // px before drag starts

    // Build mode
    this.buildMode    = false;
    this.buildType    = null; // building type string
    this.buildGhostOk = false;

    // Special command modes (right-click consumes them)
    this.attackMoveMode  = false;  // A-move: right-click to issue attack-move
    this.patrolMode      = false;  // Patrol: right-click to set patrol destination
    this.rallyMode       = false;  // Rally: right-click to set rally point
    this.rallyBuilding   = null;

    // Control group double-tap tracking
    this._lastNumKey     = null;
    this._lastNumKeyTime = 0;

    this._bindEvents();
  }

  _bindEvents() {
    const canvas = this.canvas;

    // Keyboard
    window.addEventListener('keydown', e => {
      this.keys[e.key] = true;
      this._handleKeyDown(e);
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key] = false;
    });

    // Mouse move
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      const w = this.game.camera.screenToWorld(this.mouseX, this.mouseY);
      // Convert iso world → simulation coords for entity hit-testing
      const sim = isoToSim(w.wx, w.wy);
      this.mouseWorldX = sim.x;
      this.mouseWorldY = sim.y;
      this.mouseIsoX = w.wx;
      this.mouseIsoY = w.wy;

      if (this.leftDown && !this.isDragging) {
        const dx = this.mouseX - this.mouseDownX;
        const dy = this.mouseY - this.mouseDownY;
        if (Math.abs(dx) > this.dragThresh || Math.abs(dy) > this.dragThresh) {
          this.isDragging = true;
        }
      }
      if (this.isDragging) {
        this.dragEndX = this.mouseX;
        this.dragEndY = this.mouseY;
      }
    });

    // Mouse down
    canvas.addEventListener('mousedown', e => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      const w = this.game.camera.screenToWorld(this.mouseX, this.mouseY);
      const sim = isoToSim(w.wx, w.wy);
      this.mouseWorldX = sim.x;
      this.mouseWorldY = sim.y;
      this.mouseIsoX = w.wx;
      this.mouseIsoY = w.wy;

      if (e.button === 0) {
        this.leftDown   = true;
        this.mouseDownX = this.mouseX;
        this.mouseDownY = this.mouseY;
        this.dragStartX = this.mouseX;
        this.dragStartY = this.mouseY;
        this.dragEndX   = this.mouseX;
        this.dragEndY   = this.mouseY;
        this.isDragging = false;
      } else if (e.button === 2) {
        this.rightDown = true;
        this._handleRightClick(this.mouseX, this.mouseY, this.mouseWorldX, this.mouseWorldY);
      }
    });

    // Mouse up
    canvas.addEventListener('mouseup', e => {
      if (e.button === 0) {
        if (this.isDragging) {
          this._handleDragSelect();
        } else {
          this._handleLeftClick(this.mouseX, this.mouseY, this.mouseWorldX, this.mouseWorldY, e.shiftKey);
        }
        this.leftDown   = false;
        this.isDragging = false;
      } else if (e.button === 2) {
        this.rightDown = false;
      }
    });

    // Scroll wheel: Cmd+scroll = zoom, scroll alone = pan
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl + scroll = zoom
        const delta = e.deltaY > 0 ? -1 : 1;
        this.game.camera.zoom_(delta);
      } else {
        // Plain scroll = pan
        this.game.camera.pan(e.deltaX, e.deltaY);
      }
    }, { passive: false });

    // Right-click context menu disable
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _handleKeyDown(e) {
    const game = this.game;

    // Control groups: Ctrl+1-9 assign, 1-9 recall (double-tap = center camera)
    if (e.key >= '1' && e.key <= '9') {
      const n = parseInt(e.key);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        game.selection.assignGroup(n);
        game.ui.addNotification(`Group ${n} assigned (${game.selection.controlGroups[n]?.length || 0} units)`, '#c8e888');
        return;
      }
      // Recall group; double-tap = center camera
      const now = performance.now();
      const isDouble = this._lastNumKey === n && (now - this._lastNumKeyTime) < 350;
      this._lastNumKey = n;
      this._lastNumKeyTime = now;
      if (isDouble) {
        const center = game.selection.getGroupCenter(n);
        if (center) {
          const iso = simToIso(center.x, center.y);
          game.camera.centerOn(iso.x, iso.y);
        }
      } else {
        const ok = game.selection.recallGroup(n);
        if (!ok) game.ui.addNotification(`Group ${n} is empty`, '#886644');
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (this.buildMode) {
          this.cancelBuild();
        } else if (this.attackMoveMode || this.patrolMode || this.rallyMode) {
          this.attackMoveMode = false;
          this.patrolMode = false;
          this.rallyMode = false;
          this.rallyBuilding = null;
        } else if (game.ui.buildMenuOpen) {
          game.ui.buildMenuOpen = false;
        } else {
          game.selection.clearAll();
        }
        break;
      case 'a': case 'A':
        if (!this.buildMode) {
          const units = game.selection.getAllSelected().filter(e => e instanceof Unit && !e.dead && e.unitClass !== 'civilian');
          if (units.length > 0) {
            this.attackMoveMode = true;
            this.patrolMode = false;
            game.ui.addNotification('A-Move: Right-click destination', '#aaddff');
          }
        }
        break;
      case 'p': case 'P':
        if (!this.buildMode) {
          const units = game.selection.getAllSelected().filter(e => e instanceof Unit && !e.dead && e.unitClass !== 'civilian');
          if (units.length > 0) {
            this.patrolMode = true;
            this.attackMoveMode = false;
            game.ui.addNotification('Patrol: Right-click destination', '#aaddff');
          }
        }
        break;
      case ' ':
        e.preventDefault();
        // Center on first selected unit (sim coords → iso for camera)
        {
          const sel = game.selection.selected;
          if (sel.size > 0) {
            const first = [...sel][0];
            const iso = simToIso(first.x, first.y);
            game.camera.centerOn(iso.x, iso.y);
          }
        }
        break;
      case 'h': case 'H':
        // Center on Town Center (sim coords → iso for camera)
        {
          const tc = game.players[0].buildings.find(b => b.type === 'TOWN_CENTER' && !b.dead);
          if (tc) {
            const iso = simToIso(tc.x, tc.y);
            game.camera.centerOn(iso.x, iso.y);
          }
        }
        break;
      case 'q': case 'Q':
        // Select all same type on screen
        {
          const units = [...game.selection.selected];
          if (units.length > 0) {
            const type = [...units][0].type;
            game.selection.clearAll();
            for (const u of game.players[0].units) {
              if (!u.dead && u.type === type) {
                game.selection.selected.add(u);
                u.selected = true;
              }
            }
          }
        }
        break;
      case 's': case 'S':
        // Stop all selected units
        if (!this.buildMode) {
          const sel = game.selection.getAllSelected();
          for (const e of sel) {
            if (e instanceof Unit) e.cmdStop();
          }
        }
        break;
      case 'b': case 'B':
        // Toggle build menu when villager(s) selected
        if (!this.buildMode) {
          const hasCivilian = game.selection.getSelectedUnits().some(u => u.unitClass === 'civilian');
          if (hasCivilian) {
            game.ui.buildMenuOpen = !game.ui.buildMenuOpen;
          }
        } else {
          this.cancelBuild();
        }
        break;
      case 'g': case 'G':
        // Garrison selected military units into nearest friendly garrisonable building
        if (!this.buildMode) {
          const milUnits = game.selection.getSelectedUnits().filter(u => u.unitClass !== 'civilian' && !u.garrisoned);
          if (milUnits.length > 0) {
            const tc = game.players[0].buildings.find(b => !b.dead && b.built && b.def.maxGarrison && b.garrisonedUnits.length < b.def.maxGarrison);
            if (tc) {
              for (const u of milUnits) u.cmdGarrison(tc);
              game.ui.addNotification(`${milUnits.length} unit(s) garrisoning`, '#ffeeaa');
            } else {
              game.ui.addNotification('No garrison space available!', '#ff8844');
            }
          }
        }
        break;
      case 'q': case 'Q':
        // Battlecry for Warlord(s), EMP Burst for Monk(s)
        if (!this.buildMode) {
          for (const u of game.selection.getSelectedUnits().filter(u => !u.dead)) {
            if (u.unitClass === 'hero') u.cmdBattlecry();
            else if (u.unitClass === 'support') u.cmdEMPBurst();
          }
        }
        break;
      case 'u': case 'U':
        // Pack/Unpack trebuchets
        if (!this.buildMode) {
          for (const u of game.selection.getSelectedUnits()) {
            if (u.def && u.def.class === 'siege') {
              if (u._packed && u._packTimer <= 0) u.cmdUnpack();
              else if (!u._packed && u._packTimer <= 0) u.cmdPack();
            }
          }
        }
        break;
      case 'Delete':
        // Cancel training / delete wall
        break;
    }
  }

  _handleLeftClick(sx, sy, wx, wy, shift) {
    const game = this.game;

    // Top bar (resource bar / age up button)
    if (sy < UI_TOP_H) {
      game.ui.handlePanelClick(sx, sy);
      return;
    }
    // Bottom panel
    if (sy > game.canvas.height - UI_BOTTOM_H) {
      game.ui.handlePanelClick(sx, sy);
      return;
    }

    // Build mode placement
    if (this.buildMode) {
      const tx = Math.floor(wx / TILE_SIZE);
      const ty = Math.floor(wy / TILE_SIZE);
      if (this.buildGhostOk) {
        game.tryPlaceBuilding(this.buildType, tx, ty);
        if (!this.keys['Shift']) this.cancelBuild();
      }
      return;
    }

    // Minimap click
    if (game.ui.minimapContains(sx, sy)) {
      const pos = game.ui.minimapToWorld(sx, sy);
      game.camera.centerOn(pos.wx, pos.wy);
      return;
    }

    // Hit test entities
    const clicked = game.getEntityAt(wx, wy);

    if (clicked) {
      if (clicked.playerId === 0) {
        // Select friendly
        if (!shift) game.selection.clearAll();
        if (clicked instanceof Unit) {
          game.selection.selected.add(clicked);
          clicked.selected = true;
          if (typeof Sound !== 'undefined') Sound.select();
        } else if (clicked instanceof Building) {
          game.selection.clearAll();
          game.selection.selectedBuilding = clicked;
          clicked.selected = true;
        }
      } else if (clicked.playerId === 1) {
        // Enemy - attack or gather
        const sel = [...game.selection.selected].filter(u => !u.dead);
        if (sel.length > 0) {
          for (const u of sel) {
            if (u instanceof Unit) u.cmdAttack(clicked);
          }
        } else if (game.selection.selectedBuilding) {
          // no action from buildings
        }
      } else if (clicked.playerId === -1) {
        // Resource node - gather with villagers
        const sel = [...game.selection.selected].filter(u => !u.dead && u.unitClass === 'civilian');
        for (const u of sel) u.cmdGather(clicked);
      }
    } else {
      // Empty click - deselect
      if (!shift) game.selection.clearAll();
    }
  }

  _handleRightClick(sx, sy, wx, wy) {
    const game = this.game;

    // Cancel build mode on right click
    if (this.buildMode) {
      this.cancelBuild();
      return;
    }

    if (sy < UI_TOP_H || sy > game.canvas.height - UI_BOTTOM_H) return;

    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);

    // Rally mode: set building rally point
    if (this.rallyMode && this.rallyBuilding && !this.rallyBuilding.dead) {
      this.rallyBuilding.rallyX = wx;
      this.rallyBuilding.rallyY = wy;
      this.rallyMode = false;
      this.rallyBuilding = null;
      game.ui.addNotification('Rally point set', '#aaddff');
      return;
    }

    const sel = game.selection.getAllSelected();
    const units = sel.filter(e => e instanceof Unit && !e.dead);
    if (units.length === 0 && !game.selection.selectedBuilding) return;

    // Attack-move mode
    if (this.attackMoveMode) {
      this.attackMoveMode = false;
      for (const u of units) {
        if (u.unitClass !== 'civilian') u.cmdAttackMove(tx, ty);
      }
      return;
    }

    // Patrol mode
    if (this.patrolMode) {
      this.patrolMode = false;
      for (const u of units) {
        if (u.unitClass !== 'civilian') u.cmdPatrol(tx, ty);
      }
      return;
    }

    if (units.length === 0) return;

    // Smart right-click: check what's at target
    const clicked = game.getEntityAt(wx, wy);
    if (clicked && clicked.playerId === 0 && clicked instanceof Building && clicked.built) {
      if (clicked.def.maxGarrison) {
        // Friendly garrisonable building - garrison non-civilian units
        const milUnits = units.filter(u => u.unitClass !== 'civilian');
        const civilians = units.filter(u => u.unitClass === 'civilian');
        if (milUnits.length > 0) {
          for (const u of milUnits) u.cmdGarrison(clicked);
          return;
        }
        // Villagers repair damaged buildings
        if (civilians.length > 0 && clicked.hp < clicked.maxHp) {
          for (const u of civilians) u.cmdRepair(clicked);
          return;
        }
      } else if (clicked.hp < clicked.maxHp) {
        // Friendly damaged building - repair with villagers
        const civilians = units.filter(u => u.unitClass === 'civilian');
        if (civilians.length > 0) {
          for (const u of civilians) u.cmdRepair(clicked);
          return;
        }
      }
    } else if (clicked && clicked.playerId !== 0 && clicked.playerId !== -1) {
      // Enemy - attack
      for (const u of units) u.cmdAttack(clicked);
    } else if (clicked && clicked.playerId === -1) {
      // Resource - gather (civilian only)
      for (const u of units) {
        if (u.unitClass === 'civilian') u.cmdGather(clicked);
      }
    } else {
      // Formation move: arrange units in an intelligent grid, closest unit → closest slot
      const count = units.length;
      // Determine formation shape
      const cols = count <= 3 ? count : Math.ceil(Math.sqrt(count * 1.4));
      const rows = Math.ceil(count / cols);
      // Build slot list (row 0 is front, centered)
      const slots = [];
      for (let r = 0; r < rows; r++) {
        const rowCount = r < rows - 1 ? cols : count - cols * (rows - 1);
        for (let c = 0; c < rowCount; c++) {
          slots.push({
            dtx: c - Math.floor(rowCount / 2),
            dty: r - Math.floor(rows / 2)
          });
        }
      }
      // Sort units: closest to target gets forward-center slots
      const sorted = [...units].sort((a, b) => {
        const da = Math.hypot(a.x / TILE_SIZE - tx, a.y / TILE_SIZE - ty);
        const db = Math.hypot(b.x / TILE_SIZE - tx, b.y / TILE_SIZE - ty);
        return da - db;
      });
      for (let i = 0; i < sorted.length; i++) {
        sorted[i].cmdMove(tx + slots[i].dtx, ty + slots[i].dty);
      }

      // Set rally point if building selected
      if (game.selection.selectedBuilding) {
        const b = game.selection.selectedBuilding;
        b.rallyX = wx;
        b.rallyY = wy;
      }
    }
  }

  _handleDragSelect() {
    const game = this.game;
    const cam = game.camera;
    const x1 = Math.min(this.dragStartX, this.dragEndX);
    const x2 = Math.max(this.dragStartX, this.dragEndX);
    const y1 = Math.min(this.dragStartY, this.dragEndY);
    const y2 = Math.max(this.dragStartY, this.dragEndY);

    // In iso, use screen-space comparison: check if unit's screen pixel position
    // falls inside the drag box. This is correct for isometric projection.
    game.selection.clearAll();
    for (const u of game.players[0].units) {
      if (u.dead) continue;
      const iso = simToIso(u.x, u.y);
      const sx = (iso.x - cam.worldX) * cam.zoom;
      const sy = (iso.y - cam.worldY) * cam.zoom;
      if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) {
        game.selection.selected.add(u);
        u.selected = true;
      }
    }
    if (game.selection.selected.size > 0 && typeof Sound !== 'undefined') Sound.select();
  }

  startBuild(buildingType) {
    this.buildMode = true;
    this.buildType = buildingType;
    this.buildGhostOk = false;
  }

  cancelBuild() {
    this.buildMode = false;
    this.buildType = null;
    this.buildGhostOk = false;
  }

  update() {
    // Update mouse world coords (iso + sim)
    const w = this.game.camera.screenToWorld(this.mouseX, this.mouseY);
    this.mouseIsoX = w.wx;
    this.mouseIsoY = w.wy;
    const sim = isoToSim(w.wx, w.wy);
    this.mouseWorldX = sim.x;  // sim coords for entity hit-testing
    this.mouseWorldY = sim.y;

    // Build ghost validity check (use sim coords for tile lookup)
    if (this.buildMode && this.buildType) {
      const tx = Math.floor(this.mouseWorldX / TILE_SIZE);
      const ty = Math.floor(this.mouseWorldY / TILE_SIZE);
      this.buildGhostTx = tx;
      this.buildGhostTy = ty;
      this.buildGhostOk = this.game.canPlaceBuilding(this.buildType, tx, ty);
    }
  }

  getDragRect() {
    if (!this.isDragging) return null;
    return {
      x: Math.min(this.dragStartX, this.dragEndX),
      y: Math.min(this.dragStartY, this.dragEndY),
      w: Math.abs(this.dragEndX - this.dragStartX),
      h: Math.abs(this.dragEndY - this.dragStartY)
    };
  }
}
