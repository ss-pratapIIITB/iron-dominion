// ============================================================
// IRON DOMINION - UI Manager (HUD, Minimap, Panels)
// ============================================================

class UIManager {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.ctx = game.ctx;

    this.minimapW = MINIMAP_SIZE;
    this.minimapH = MINIMAP_SIZE;
    this.minimapX = game.canvas.width  - this.minimapW - 4;
    this.minimapY = game.canvas.height - this.minimapH - UI_BOTTOM_H - 4;

    // Command panel buttons
    this.cmdButtons = [];

    // Build submenu state
    this.buildMenuOpen   = false;
    this.buildCategory   = null;

    // Notification messages
    this.notifications = [];

    // Age up flash
    this.ageFlash = 0;

    // Cached minimap canvas
    this._minimapCache = null;
    this._minimapDirty = true;

    // Idle villager cycle index
    this._idleVillagerIndex = 0;
  }

  // ── Main render ──────────────────────────────────────────
  render(ctx) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    this.minimapX = W - this.minimapW - 4;
    this.minimapY = H - this.minimapH - UI_BOTTOM_H - 4;

    // Reset all button hit-areas at start of each frame
    this.cmdButtons = [];

    this._drawTopBar(ctx, W);
    this._drawBottomPanel(ctx, W, H);
    this._drawMinimap(ctx);
    this._drawDragBox(ctx);
    this._drawBuildGhost(ctx);
    this._drawCommandModeCursor(ctx);
    this._drawNotifications(ctx, W, H);
  }

  // ── Small geometric resource icons ───────────────────────
  _drawResIcon(ctx, type, x, y, size) {
    const s = size;
    ctx.save();
    ctx.translate(x, y);
    switch (type) {
      case 'wood': // Brown log shape
        ctx.fillStyle = '#7a4e28';
        ctx.beginPath(); ctx.ellipse(0, 0, s, s*0.55, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#5a3010';
        ctx.fillRect(-s*0.85, -s*0.15, s*1.7, s*0.3);
        ctx.fillStyle = '#9a6040';
        ctx.beginPath(); ctx.ellipse(-s*0.85, 0, s*0.22, s*0.55, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s*0.85, 0, s*0.22, s*0.55, 0, 0, Math.PI*2); ctx.fill();
        break;
      case 'food': // Green wheat sheaf / bread
        ctx.fillStyle = '#d4a030';
        ctx.beginPath(); ctx.ellipse(0, 0, s*0.85, s*0.85, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f0c040';
        ctx.beginPath(); ctx.ellipse(-s*0.2, -s*0.2, s*0.5, s*0.5, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#44aa22';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i*s*0.3, -s*0.1);
          ctx.quadraticCurveTo(i*s*0.5, -s*0.9, i*s*0.2, -s*1.1);
          ctx.lineWidth = s*0.2; ctx.strokeStyle = '#44aa22'; ctx.stroke();
        }
        break;
      case 'gold': // Gold coin
        ctx.fillStyle = '#c8a020';
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#f0c040';
        ctx.beginPath(); ctx.arc(-s*0.1, -s*0.1, s*0.72, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#c89020';
        ctx.font = `bold ${s*1.0}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, s*0.05);
        break;
      case 'stone': // Gray rock
        ctx.fillStyle = '#7a7a7a';
        ctx.beginPath();
        ctx.moveTo(-s, s*0.3); ctx.lineTo(-s*0.6, -s*0.8);
        ctx.lineTo(0, -s); ctx.lineTo(s*0.7, -s*0.6);
        ctx.lineTo(s, s*0.3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a0a0a0';
        ctx.beginPath();
        ctx.moveTo(-s*0.5, s*0.2); ctx.lineTo(-s*0.3, -s*0.7);
        ctx.lineTo(0.1*s, -s*0.85); ctx.lineTo(s*0.4, s*0.1); ctx.closePath(); ctx.fill();
        break;
    }
    ctx.restore();
  }

  // ── Top Resource Bar ─────────────────────────────────────
  _drawTopBar(ctx, W) {
    const H = UI_TOP_H;

    // Stone gradient background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a2118');
    bg.addColorStop(0.5, '#1e1810');
    bg.addColorStop(1, '#16120c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Top highlight line
    ctx.fillStyle = '#5a4830';
    ctx.fillRect(0, 0, W, 1);

    // Bottom stone border with warm amber glow
    const borderG = ctx.createLinearGradient(0, H - 3, 0, H);
    borderG.addColorStop(0, '#8a6a30');
    borderG.addColorStop(1, '#6a4a20');
    ctx.fillStyle = borderG;
    ctx.fillRect(0, H - 3, W, 3);

    const player = this.game.players[0];
    let x = 8;
    const cy = H / 2;
    const iconSz = 10;
    const slotW = 100, slotH = H - 6;

    const resources = [
      { key: 'wood',  color: '#c8956a', icolor: '#8b5e3c', label: 'WOOD' },
      { key: 'food',  color: '#88dd44', icolor: '#44aa22', label: 'FOOD' },
      { key: 'gold',  color: '#f0c040', icolor: '#c89020', label: 'GOLD' },
      { key: 'stone', color: '#c0c0c0', icolor: '#888888', label: 'STONE' },
    ];

    for (const r of resources) {
      // Stone slot background with bevel
      const slotG = ctx.createLinearGradient(x, 3, x, 3 + slotH);
      slotG.addColorStop(0, 'rgba(80,60,30,0.5)');
      slotG.addColorStop(1, 'rgba(30,22,10,0.6)');
      ctx.fillStyle = slotG;
      roundRect(ctx, x, 3, slotW, slotH, 3);
      ctx.fill();

      // Slot border (warm amber)
      ctx.strokeStyle = 'rgba(120,90,40,0.6)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, 3, slotW, slotH, 3);
      ctx.stroke();

      // Icon
      this._drawResIcon(ctx, r.key, x + iconSz + 2, cy, iconSz);

      // Label (small, dimmed)
      ctx.fillStyle = 'rgba(160,130,70,0.6)';
      ctx.font = '8px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(r.label, x + iconSz * 2 + 7, cy - 1);

      // Amount (bright amber-white)
      const amount = Math.floor(player[r.key] || 0);
      ctx.fillStyle = amount > 0 ? r.color : '#554433';
      ctx.font = `bold 14px Arial`;
      ctx.textBaseline = 'top';
      ctx.fillText(amount, x + iconSz * 2 + 7, cy - 1);

      // Income rate (+N/min) and upkeep drain for gold
      const rateKey = r.key + 'Rate';
      const rate = player[rateKey] || 0;
      if (rate !== 0) {
        ctx.fillStyle = rate > 0 ? 'rgba(120,200,100,0.75)' : 'rgba(220,100,80,0.75)';
        ctx.font = '8px Arial';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'right';
        ctx.fillText((rate > 0 ? '+' : '') + rate, x + slotW - 3, slotH - 1);
      }
      // Show upkeep drain on the gold slot
      if (r.key === 'gold' && player.upkeepDrain > 0) {
        ctx.fillStyle = 'rgba(255,180,50,0.85)';
        ctx.font = '8px Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'right';
        ctx.fillText(`⚔${player.upkeepDrain.toFixed(1)}/m`, x + slotW - 3, cy + 1);
      }

      x += slotW + 4;
    }

    // Population slot
    const popSlotG = ctx.createLinearGradient(x, 3, x, 3 + slotH);
    popSlotG.addColorStop(0, 'rgba(40,40,80,0.5)');
    popSlotG.addColorStop(1, 'rgba(10,10,30,0.6)');
    ctx.fillStyle = popSlotG;
    roundRect(ctx, x, 3, 80, slotH, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,80,120,0.6)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, 3, 80, slotH, 3);
    ctx.stroke();

    const popOver = player.pop >= player.popCap;
    ctx.fillStyle = 'rgba(160,130,70,0.6)';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('POP', x + 40, cy - 1);
    ctx.fillStyle = popOver ? '#ff8844' : '#ddd8c8';
    ctx.font = 'bold 14px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(`${player.pop}/${player.popCap}`, x + 40, cy);
    x += 84;

    // Idle villager indicator (flashes when villagers are idle)
    const idleVillagers = player.units.filter(u => !u.dead && u.type === 'VILLAGER' && u.state === UNIT_STATE.IDLE);
    if (idleVillagers.length > 0) {
      const flash = 0.5 + 0.5 * Math.sin(this.game.gameTime * 0.007);
      const ivW = 60;
      const ivG = ctx.createLinearGradient(x, 3, x, 3 + slotH);
      ivG.addColorStop(0, `rgba(120,60,0,${0.5 + flash * 0.3})`);
      ivG.addColorStop(1, `rgba(60,25,0,${0.6 + flash * 0.2})`);
      ctx.fillStyle = ivG;
      roundRect(ctx, x, 3, ivW, slotH, 3);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,160,40,${0.5 + flash * 0.5})`;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, 3, ivW, slotH, 3);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,165,60,${0.85 + flash * 0.15})`;
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`👷 ${idleVillagers.length}`, x + ivW / 2, cy - 1);
      ctx.fillStyle = '#cc8833';
      ctx.font = '7px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText('IDLE', x + ivW / 2, cy + 1);
      this._storeButton('IDLE_VILLAGER', x, 3, ivW, slotH);
      x += ivW + 4;
    }

    // Age slot
    const ageDef = AGE_DEFS[player.age];
    const ageColors = {
      DARK: '#8a7060', FEUDAL: '#7090a0', CASTLE: '#6080b0', IMPERIAL: '#b09040'
    };
    const ageSlotG = ctx.createLinearGradient(x, 3, x, 3 + slotH);
    ageSlotG.addColorStop(0, 'rgba(60,50,20,0.6)');
    ageSlotG.addColorStop(1, 'rgba(20,16,8,0.7)');
    ctx.fillStyle = ageSlotG;
    roundRect(ctx, x, 3, 120, slotH, 3);
    ctx.fill();
    ctx.strokeStyle = `rgba(180,150,60,0.5)`;
    ctx.lineWidth = 1;
    roundRect(ctx, x, 3, 120, slotH, 3);
    ctx.stroke();

    ctx.fillStyle = ageColors[player.age] || '#c8a94e';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ageDef.name, x + 60, cy - 1);

    if (player.advancing) {
      const pct = 1 - player.ageTimer / AGE_DEFS[AGE_ORDER[player.ageIndex + 1]].time;
      ctx.fillStyle = '#0d1e0d';
      ctx.fillRect(x + 5, cy + 1, 110, 5);
      const progG = ctx.createLinearGradient(x + 5, 0, x + 5 + 110 * pct, 0);
      progG.addColorStop(0, '#206020');
      progG.addColorStop(1, '#44ee88');
      ctx.fillStyle = progG;
      ctx.fillRect(x + 5, cy + 1, 110 * pct, 5);
    } else if (player.ageIndex < AGE_ORDER.length - 1) {
      const nextDef = AGE_DEFS[AGE_ORDER[player.ageIndex + 1]];
      const canAdvance = player.canAfford(nextDef.cost);
      this._drawButton(ctx, x + 5, cy + 1, 110, 12,
        canAdvance ? 'Advance Age' : 'Age Up',
        canAdvance ? '#4a7a30' : '#3a2820',
        canAdvance ? '#c8e888' : '#666655', 9);
      this._storeButton('AGE_UP', x + 5, cy + 1, 110, 12);
    }
    x += 128;

    // Control group badges — show active groups (those with units) on the right
    const groups = this.game.selection.controlGroups;
    let gx = W - 4;
    for (let n = 9; n >= 1; n--) {
      const grp = groups[n];
      if (!grp || grp.length === 0) continue;
      const alive = grp.filter(u => !u.dead).length;
      if (alive === 0) continue;
      const badgeW = 28;
      gx -= badgeW + 2;
      const isRecalled = [...this.game.selection.selected].some(u => grp.includes(u));
      ctx.fillStyle = isRecalled ? 'rgba(60,90,40,0.85)' : 'rgba(25,35,55,0.7)';
      roundRect(ctx, gx, 4, badgeW, slotH - 2, 3);
      ctx.fill();
      ctx.strokeStyle = isRecalled ? '#88cc44' : '#446688';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = isRecalled ? '#c8e888' : '#8899bb';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(n, gx + badgeW / 2, cy);
      ctx.fillStyle = '#667799';
      ctx.font = '8px Arial';
      ctx.textBaseline = 'top';
      ctx.fillText(alive, gx + badgeW / 2, cy + 1);
    }

    // Timer + FPS (left of control groups)
    const t = this.game.gameTime / 1000;
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    ctx.fillStyle = '#504030';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.game.fps | 0} FPS  ${mins}:${secs.toString().padStart(2, '0')}`, x, cy);
  }

  // ── Bottom Panel ─────────────────────────────────────────
  _drawBottomPanel(ctx, W, H) {
    const panelY = H - UI_BOTTOM_H;
    const panelH = UI_BOTTOM_H;

    // Stone background with gradient
    const panelBg = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
    panelBg.addColorStop(0, '#16120c');
    panelBg.addColorStop(0.3, '#1e1810');
    panelBg.addColorStop(1, '#2a2118');
    ctx.fillStyle = panelBg;
    ctx.fillRect(0, panelY, W, panelH);

    // Top border (warm amber glow)
    const borderG = ctx.createLinearGradient(0, panelY, 0, panelY + 3);
    borderG.addColorStop(0, '#8a6a30');
    borderG.addColorStop(1, '#5a4020');
    ctx.fillStyle = borderG;
    ctx.fillRect(0, panelY, W, 3);

    // Bottom edge highlight
    ctx.fillStyle = '#3a2a14';
    ctx.fillRect(0, panelY + panelH - 1, W, 1);

    const sel = this.game.selection;
    const units = sel.getSelectedUnits();
    const building = sel.selectedBuilding;

    if (units.length > 0) {
      this._drawUnitInfo(ctx, units, W, H, panelY);
    } else if (building && !building.dead) {
      this._drawBuildingInfo(ctx, building, W, H, panelY);
    } else {
      // Nothing selected - show tips
      ctx.fillStyle = '#4a3820';
      ctx.font = 'italic 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Select units or buildings', W / 2, panelY + panelH / 2);
    }
  }

  _drawUnitInfo(ctx, units, W, H, panelY) {
    const panelH = UI_BOTTOM_H;
    const unit = units[0]; // primary unit

    // Left section: portrait
    const portW = 120, portH = panelH - 10;
    const portX = 5, portY = panelY + 5;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, portX, portY, portW, portH, 6);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[unit.playerId];
    ctx.lineWidth = 2;
    ctx.stroke();

    // Unit circle portrait
    const cx = portX + portW / 2, cy = portY + portH * 0.4;
    ctx.fillStyle = PLAYER_COLORS[unit.playerId];
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(unit._getSymbol(), cx, cy);

    // Name
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 12px Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillText(unit.name, cx, portY + portH - 22);

    // HP bar
    const hpW = portW - 10;
    const hpRatio = unit.hp / unit.maxHp;
    const hpColor = hpRatio > 0.6 ? '#44ee44' : hpRatio > 0.3 ? '#eeee44' : '#ee4444';
    ctx.fillStyle = '#222';
    ctx.fillRect(portX + 5, portY + portH - 16, hpW, 8);
    ctx.fillStyle = hpColor;
    ctx.fillRect(portX + 5, portY + portH - 16, hpW * hpRatio, 8);
    ctx.fillStyle = '#aaa';
    ctx.font = '9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.ceil(unit.hp)}/${unit.maxHp}`, portX + portW / 2, portY + portH - 12);

    // Multi-select: mini portrait row below the main portrait
    if (units.length > 1) {
      const iconW = 22, iconH = 22, iconGap = 3;
      const rowX = portX + portW + 10;
      const rowY = panelY + UI_BOTTOM_H - iconH - 8;
      const maxIcons = Math.floor((this.game.canvas.width - rowX - MINIMAP_SIZE - 16) / (iconW + iconGap));
      const showCount = Math.min(units.length, maxIcons);
      for (let i = 0; i < showCount; i++) {
        const u = units[i];
        const ix = rowX + i * (iconW + iconGap);
        const iy = rowY;
        const hp = u.hp / u.maxHp;
        const hpC = hp > 0.6 ? '#44ee44' : hp > 0.3 ? '#eeee44' : '#ee4444';
        // Check control group membership
        const groupNum = this.game.selection.getUnitGroup(u);
        // Background
        ctx.fillStyle = u === unit ? 'rgba(80,100,140,0.9)' : 'rgba(30,40,60,0.85)';
        roundRect(ctx, ix, iy, iconW, iconH, 3);
        ctx.fill();
        ctx.strokeStyle = u === unit ? '#88aaff' : 'rgba(60,80,100,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Unit letter
        ctx.fillStyle = PLAYER_COLORS[u.playerId];
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(u._getSymbol(), ix + iconW / 2, iy + iconH / 2 - 2);
        // HP bar
        ctx.fillStyle = '#111';
        ctx.fillRect(ix + 1, iy + iconH - 4, iconW - 2, 3);
        ctx.fillStyle = hpC;
        ctx.fillRect(ix + 1, iy + iconH - 4, (iconW - 2) * hp, 3);
        // Control group badge
        if (groupNum !== null) {
          ctx.fillStyle = '#c8e888';
          ctx.font = '7px Arial';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(groupNum, ix + 2, iy + 1);
        }
      }
      if (units.length > showCount) {
        const lx = rowX + showCount * (iconW + iconGap);
        ctx.fillStyle = '#667';
        ctx.font = '9px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${units.length - showCount}`, lx + 2, rowY + iconH / 2);
      }
    }

    // Mid section: unit stats
    const midX = portX + portW + 10, midY = panelY + 8;
    ctx.fillStyle = '#889';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const stats = [
      ['ATK', unit.getEffectiveAtk ? unit.getEffectiveAtk() : unit.atk],
      ['ARM', `${unit.meleeArmor}/${unit.pierceArmor}`],
      ['SPD', unit.def.speed.toFixed(1)],
      ['LOS', unit.los],
    ];
    if (unit.unitClass === 'civilian') {
      stats.push(['CARRY', `${unit.carrying}/${unit.carryCap}`]);
    }
    if (unit.kills > 0) {
      const rankLabel = unit.isElite ? `${unit.kills} ★★` : unit.isVeteran ? `${unit.kills} ★` : unit.kills;
      stats.push(['KILLS', rankLabel]);
    }
    if (unit.def.upkeep) {
      stats.push(['UPKEEP', `${unit.def.upkeep}g/m`]);
    }
    for (let i = 0; i < stats.length; i++) {
      ctx.fillStyle = '#778899';
      ctx.fillText(stats[i][0], midX, midY + i * 17);
      ctx.fillStyle = '#ccddee';
      ctx.fillText(stats[i][1], midX + 40, midY + i * 17);
    }

    // State and stance indicator
    ctx.fillStyle = '#99aacc';
    ctx.font = '10px Arial';
    ctx.fillText(`${unit.state}`, midX, midY + stats.length * 17 + 4);
    if (unit.stance) {
      const stanceColor = unit.stance === 'AGGRESSIVE' ? '#ff8866' : unit.stance === 'DEFENSIVE' ? '#ffee44' : '#88ee66';
      ctx.fillStyle = stanceColor;
      ctx.fillText(unit.stance, midX, midY + stats.length * 17 + 18);
    }

    // Right section: command buttons (hidden when build menu is open)
    const btnX = PANEL_W + 10;
    const btnY = panelY + 8;
    if (!this.buildMenuOpen) {
      this._drawCommandButtons(ctx, unit, units, btnX, btnY);
    }
  }

  _drawBuildingInfo(ctx, building, W, H, panelY) {
    const panelH = UI_BOTTOM_H;
    const portX = 5, portY = panelY + 5;
    const portW = 140, portH = panelH - 10;

    // Portrait background
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    roundRect(ctx, portX, portY, portW, portH, 6);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[building.playerId];
    ctx.lineWidth = 2;
    ctx.stroke();

    // Building square icon
    ctx.fillStyle = PLAYER_COLORS[building.playerId];
    ctx.fillRect(portX + 15, portY + 8, portW - 30, 50);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(building._getShortLabel(), portX + portW / 2, portY + 33);

    // Name
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 11px Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillText(building.name, portX + portW / 2, portY + 68);

    // HP bar
    if (building.built) {
      const hpRatio = building.hp / building.maxHp;
      const hpColor = hpRatio > 0.6 ? '#44ee44' : hpRatio > 0.3 ? '#eeee44' : '#ee4444';
      ctx.fillStyle = '#222';
      ctx.fillRect(portX + 5, portY + portH - 20, portW - 10, 8);
      ctx.fillStyle = hpColor;
      ctx.fillRect(portX + 5, portY + portH - 20, (portW - 10) * hpRatio, 8);
      ctx.fillStyle = '#aaa';
      ctx.font = '9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(building.hp)}/${building.maxHp}`, portX + portW / 2, portY + portH - 16);
    } else {
      // Construction progress
      const pct = building.buildProgress / 100;
      ctx.fillStyle = '#222';
      ctx.fillRect(portX + 5, portY + portH - 20, portW - 10, 8);
      ctx.fillStyle = '#44aaee';
      ctx.fillRect(portX + 5, portY + portH - 20, (portW - 10) * pct, 8);
      ctx.fillStyle = '#aaa';
      ctx.font = '9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Constructing ${Math.round(pct * 100)}%`, portX + portW / 2, portY + portH - 16);
    }

    // Training queue
    if (building.built && building.def.trainUnits) {
      const qX = portX + portW + 10, qY = panelY + 8;

      if (building.trainQueue.length > 0) {
        const trainPct = building.trainProgress;
        const utype = building.trainQueue[0];
        const udef = UNIT_DEFS[utype];

        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Training: ${udef ? udef.name : utype}`, qX, qY);

        ctx.fillStyle = '#222';
        ctx.fillRect(qX, qY + 16, 100, 8);
        ctx.fillStyle = '#88aaff';
        ctx.fillRect(qX, qY + 16, 100 * trainPct, 8);

        for (let i = 0; i < building.trainQueue.length && i < 5; i++) {
          const qt = building.trainQueue[i];
          const sym = UNIT_DEFS[qt] ? this._getUnitSymbol(qt) : '?';
          const bx = qX + i * 26, by = qY + 32;
          ctx.fillStyle = i === 0 ? '#335577' : '#223344';
          roundRect(ctx, bx, by, 22, 22, 3);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 11px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(sym, bx + 11, by + 11);
        }
      }
    }

    // Research queue progress
    if (building.built && building.researchQueue && building.researchQueue.length > 0) {
      const qX = portX + portW + 10;
      const qY = panelY + (building.trainQueue && building.trainQueue.length > 0 ? 70 : 8);
      const rkey = building.researchQueue[0];
      const rdef = RESEARCH_DEFS[rkey];

      ctx.fillStyle = '#c8e888';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`Research: ${rdef ? rdef.name : rkey}`, qX, qY);

      ctx.fillStyle = '#222';
      ctx.fillRect(qX, qY + 16, 100, 8);
      ctx.fillStyle = '#88cc44';
      ctx.fillRect(qX, qY + 16, 100 * building.researchProgress, 8);

      if (rdef) {
        ctx.fillStyle = '#889988';
        ctx.font = '10px Arial';
        ctx.fillText(rdef.desc, qX, qY + 30);
      }
    }

    // Garrison count display
    if (building.built && building.def.maxGarrison) {
      const gCount = building.garrisonedUnits.length;
      const gMax = building.def.maxGarrison;
      const gx = portX + portW + 10, gy = panelY + 8;
      ctx.fillStyle = gCount > 0 ? '#ffeeaa' : '#556677';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`🏰 Garrison: ${gCount}/${gMax}`, gx, gy);
      if (gCount > 0) {
        ctx.fillStyle = '#88eeaa';
        ctx.font = '10px Arial';
        ctx.fillText(`Healing + ${gCount} bonus arrow${gCount > 1 ? 's' : ''}`, gx, gy + 15);
      }
    }

    // Command buttons for building
    const btnX = PANEL_W + 10;
    const btnY = panelY + (building.def.maxGarrison ? 38 : 8);
    this._drawBuildingCommands(ctx, building, btnX, btnY);
  }

  _getUnitSymbol(type) {
    const map = { VILLAGER:'V', MILITIA:'M', SWORDSMAN:'Sw', ARCHER:'A', CROSSBOWMAN:'X', SPEARMAN:'Sp', SCOUT:'Sc', KNIGHT:'K', TREBUCHET:'T', WARLORD:'W', MONK:'Mo', GUNNER:'Gn', CAR:'Car', TANK:'Tk' };
    return map[type] || '?';
  }

  _drawCommandButtons(ctx, unit, units, startX, startY) {
    const btns = this._getUnitCommands(unit);
    this._renderButtons(ctx, btns, startX, startY);
  }

  _drawBuildingCommands(ctx, building, startX, startY) {
    const btns = this._getBuildingCommands(building);
    this._renderButtons(ctx, btns, startX, startY);
  }

  _renderButtons(ctx, btns, startX, startY) {
    const BW = 64, BH = 54, GAP = 6;
    let col = 0, row = 0;
    for (const btn of btns) {
      const bx = startX + col * (BW + GAP);
      const by = startY + row * (BH + GAP);
      const enabled = btn.enabled !== false;
      const active = btn.active === true;

      ctx.fillStyle = active ? 'rgba(60,90,40,0.95)' : enabled ? 'rgba(40,60,90,0.95)' : 'rgba(30,30,40,0.8)';
      roundRect(ctx, bx, by, BW, BH, 5);
      ctx.fill();
      ctx.strokeStyle = active ? '#88cc44' : enabled ? '#446688' : '#333';
      ctx.lineWidth = active ? 2 : 1.5;
      ctx.stroke();

      if (btn.icon) {
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(btn.icon, bx + BW / 2, by + BH / 2 - 8);
      }

      ctx.fillStyle = enabled ? '#ccddee' : '#556';
      ctx.font = `${btn.label.length > 8 ? '9' : '10'}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(btn.label, bx + BW / 2, by + BH - 4);

      if (btn.hotkey) {
        ctx.fillStyle = '#c8a94e';
        ctx.font = '8px Arial';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(btn.hotkey, bx + BW - 3, by + 3);
      }

      // Cost hint
      if (btn.cost) {
        const costStr = Object.entries(btn.cost).map(([k,v]) => `${v}${k[0].toUpperCase()}`).join(' ');
        ctx.fillStyle = '#778';
        ctx.font = '8px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(costStr, bx + BW / 2, by + BH - 14);
      }

      this._storeButton(btn.action, bx, by, BW, BH, btn.data, btn.enabled);
      col++;
      if (col >= 4) { col = 0; row++; }
    }
  }

  _getUnitCommands(unit) {
    const cmds = [];
    const isCivilian = unit.unitClass === 'civilian';

    if (isCivilian) {
      cmds.push({ icon: '⚒', label: 'Build', action: 'BUILD_MENU', hotkey: 'B' });
      cmds.push({ icon: '⛏', label: 'Gather', action: 'GATHER_NEAREST' });
      cmds.push({ icon: '🔁', label: 'Return', action: 'RETURN_RES' });
      cmds.push({ icon: '🛑', label: 'Stop', action: 'STOP', hotkey: 'S' });
      // Repair button: active when already repairing, enabled when near damaged building
      const isRepairing = unit.repairMode && unit.buildTarget;
      cmds.push({
        icon: '🔧', label: isRepairing ? 'Repairing' : 'Repair',
        action: 'REPAIR_NEAREST', active: isRepairing, enabled: true
      });
    } else {
      cmds.push({ icon: '⚔', label: 'A-Move', action: 'ATTACK_MOVE', hotkey: 'A' });
      cmds.push({ icon: '🛑', label: 'Stop', action: 'STOP', hotkey: 'S' });
      cmds.push({ icon: '↔', label: 'Patrol', action: 'PATROL', hotkey: 'P' });
      // Garrison button for military units
      const garrisonTarget = this.game.players[0].buildings.find(b => !b.dead && b.built && b.def.maxGarrison && b.garrisonedUnits.length < b.def.maxGarrison);
      cmds.push({
        icon: '🏰', label: 'Garrison', action: 'GARRISON', data: garrisonTarget || null,
        hotkey: 'G', enabled: !!garrisonTarget && !unit.garrisoned
      });
      // Stance buttons with active indicator
      const stances = [
        { key: 'AGGRESSIVE', icon: '🔴', label: 'Aggr.' },
        { key: 'DEFENSIVE',  icon: '🟡', label: 'Def.' },
        { key: 'PASSIVE',    icon: '🟢', label: 'Passive' },
      ];
      for (const s of stances) {
        cmds.push({
          icon: s.icon,
          label: s.label,
          action: 'SET_STANCE',
          data: s.key,
          active: unit.stance === s.key
        });
      }

      // EMP Burst for Monk (support units)
      if (unit.unitClass === 'support') {
        const onCooldown = unit._abilityCooldown > 0;
        const cdSecs = onCooldown ? Math.ceil(unit._abilityCooldown / 1000) : 0;
        cmds.push({
          icon: '⚡',
          label: onCooldown ? `EMP (${cdSecs}s)` : 'EMP Burst',
          action: 'EMP_BURST',
          hotkey: 'Q',
          enabled: !onCooldown,
          tooltip: 'Paralyze all nearby enemies for 3s (45s cooldown)'
        });
      }

      // Trebuchet pack/unpack (siege units)
      if (unit.def && unit.def.class === 'siege') {
        const transitioning = unit._packTimer > 0;
        if (unit._packed) {
          cmds.push({
            icon: '🏗', label: transitioning ? 'Deploying...' : 'Deploy',
            action: 'UNPACK', hotkey: 'U',
            enabled: !transitioning,
            tooltip: 'Unpack to enable firing (3s, cannot move while deployed)'
          });
        } else {
          cmds.push({
            icon: '📦', label: transitioning ? 'Packing...' : 'Pack Up',
            action: 'PACK', hotkey: 'U',
            enabled: !transitioning,
            tooltip: 'Pack up to enable movement (2s, cannot fire while packed)'
          });
        }
      }

      // Battlecry for Warlord (hero ability)
      if (unit.unitClass === 'hero') {
        const onCooldown = unit._abilityCooldown > 0;
        const cdSecs = onCooldown ? Math.ceil(unit._abilityCooldown / 1000) : 0;
        cmds.push({
          icon: '📯',
          label: onCooldown ? `Battlecry (${cdSecs}s)` : 'Battlecry',
          action: 'BATTLECRY',
          hotkey: 'Q',
          enabled: !onCooldown,
          active: unit._buffTimer > 0,
          tooltip: 'Buff all nearby friendlies: +4 ATK, +40% SPD for 10s (30s cooldown)'
        });
      }
    }

    cmds.push({ icon: '❌', label: 'Deselect', action: 'DESELECT' });
    return cmds;
  }

  _getBuildingCommands(building) {
    const cmds = [];
    const player = this.game.players[0];

    if (building.def.trainUnits && building.built) {
      for (const utype of building.def.trainUnits) {
        const def = UNIT_DEFS[utype];
        if (!def) continue;
        const isHero = def.isHero;
        const heroExists = isHero && (player.units.some(u => !u.dead && u.type === utype) ||
                                      building.trainQueue.includes(utype));
        const ageOk = !def.requires || AGE_ORDER.indexOf(player.age) >= AGE_ORDER.indexOf(def.requires);
        const canTrain = ageOk && !heroExists && player.canAfford(def.cost) && player.pop < player.popCap;
        const ageLabel = !ageOk ? `(${def.requires} Age)` : null;
        cmds.push({
          icon: this._getUnitIcon(utype),
          label: isHero ? `⚡ ${def.name}` : def.name,
          action: 'TRAIN',
          data: utype,
          cost: def.cost,
          enabled: canTrain,
          tooltip: heroExists ? 'Hero already exists' : ageLabel
        });
      }
    }

    // Research buttons for research buildings
    if (building.built) {
      const researchForBuilding = Object.entries(RESEARCH_DEFS).filter(([k, r]) => r.building === building.type);
      for (const [key, rdef] of researchForBuilding) {
        const done = player.researched.has(key);
        const canResearch = !done && player.canResearch(key) && player.canAfford(rdef.cost) &&
                            building.researchQueue.length === 0 && building.researchTimer <= 0;
        const inQueue = building.researchQueue.includes(key);
        cmds.push({
          icon: rdef.icon,
          label: done ? `✓ ${rdef.name}` : rdef.name,
          action: 'RESEARCH',
          data: key,
          cost: done ? null : rdef.cost,
          enabled: canResearch,
          active: inQueue
        });
      }
    }

    // Auto-train toggles for each non-hero trainable unit
    if (building.built && building.def.trainUnits) {
      for (const utype of building.def.trainUnits) {
        const def = UNIT_DEFS[utype];
        if (!def || def.isHero) continue;
        const isAuto = building.autoTrain === utype;
        cmds.push({
          icon: isAuto ? '🔄' : '⏩',
          label: isAuto ? `Auto: ${def.name}` : `Auto-${def.name}`,
          action: 'AUTO_TRAIN',
          data: utype,
          active: isAuto,
          enabled: true
        });
      }
    }

    // Set rally point button
    if (building.built && building.def.trainUnits) {
      cmds.push({ icon: '🚩', label: 'Rally', action: 'SET_RALLY' });
    }

    // Ungarrison button if building has garrisoned units
    if (building.built && building.def.maxGarrison && building.garrisonedUnits.length > 0) {
      cmds.push({
        icon: '🚪', label: `Ungarrison (${building.garrisonedUnits.length})`,
        action: 'UNGARRISON_ALL', enabled: true
      });
    }

    // Repair button if building is damaged
    if (building.built && building.playerId === 0 && building.hp < building.maxHp) {
      cmds.push({ icon: '🔧', label: 'Repair', action: 'REPAIR_BUILDING', data: building });
    }

    return cmds;
  }

  _getUnitIcon(type) {
    const map = { VILLAGER:'👷', MILITIA:'⚔', SWORDSMAN:'🗡', ARCHER:'🏹', CROSSBOWMAN:'🎯', SPEARMAN:'🔱', SCOUT:'🐎', KNIGHT:'🐴', TREBUCHET:'💣', WARLORD:'👑', MONK:'🧙', GUNNER:'🔫', CAR:'🚗', TANK:'🛡' };
    return map[type] || '?';
  }

  _storeButton(action, x, y, w, h, data, enabled) {
    this.cmdButtons.push({ action, x, y, w, h, data, enabled });
  }

  _drawButton(ctx, x, y, w, h, label, bg, fg, fs) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = `bold ${fs || 11}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  // ── Minimap ───────────────────────────────────────────────
  _drawMinimap(ctx) {
    const mx = this.minimapX, my = this.minimapY;
    const mw = this.minimapW, mh = this.minimapH;
    const scaleX = mw / (MAP_W * TILE_SIZE);
    const scaleY = mh / (MAP_H * TILE_SIZE);
    const stx = mw / MAP_W;
    const sty = mh / MAP_H;

    // Stone border with amber glow
    ctx.fillStyle = '#0e0c08';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.strokeStyle = '#6a4a20';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx - 2, my - 2, mw + 4, mh + 4);

    // Map terrain
    this.game.map.renderMinimap(ctx, mx, my, mw, mh);

    // Resource nodes
    for (const n of this.game.resourceNodes) {
      n.renderMinimap(ctx, mx, my, stx, sty);
    }

    // Buildings
    for (const b of this.game.buildings) {
      if (b.dead) continue;
      const fog = this.game.fog;
      if (b.playerId === 1 && !fog.isSeen(b.tx, b.ty)) continue;
      ctx.fillStyle = PLAYER_COLORS[b.playerId];
      const px = mx + b.tileX * stx;
      const py = my + b.tileY * sty;
      const pw = Math.max(3, b.size * stx);
      const ph = Math.max(3, b.size * sty);
      ctx.fillRect(px, py, pw, ph);
    }

    // Units
    for (const u of this.game.units) {
      if (u.dead) continue;
      if (u.playerId === 1 && !this.game.fog.isWorldVisible(u.x, u.y)) continue;
      ctx.fillStyle = PLAYER_COLORS[u.playerId];
      ctx.beginPath();
      ctx.arc(mx + u.x * scaleX, my + u.y * scaleY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fog overlay
    this.game.fog.renderMinimap(ctx, mx, my, mw, mh);

    // Camera viewport rectangle - convert iso world corners to tile coords for minimap
    const cam = this.game.camera;
    const c0 = isoToTileF(cam.worldX, cam.worldY);
    const c1 = isoToTileF(cam.worldX + cam.viewW / cam.zoom, cam.worldY + cam.viewH / cam.zoom);
    const vtx0 = Math.min(c0.tx, c1.tx), vty0 = Math.min(c0.ty, c1.ty);
    const vtx1 = Math.max(c0.tx, c1.tx), vty1 = Math.max(c0.ty, c1.ty);
    const vx = mx + vtx0 * stx;
    const vy = my + vty0 * sty;
    const vw = (vtx1 - vtx0) * stx;
    const vh = (vty1 - vty0) * sty;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);

    // Attack flash indicator — pulsing red circle at last attack position
    const g = this.game;
    if (g._attackFlashTime && g._attackFlashX !== undefined) {
      const elapsed = performance.now() - g._attackFlashTime;
      const FLASH_DURATION = 3500;
      if (elapsed < FLASH_DURATION) {
        const fade  = 1 - elapsed / FLASH_DURATION;
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 140);
        const px = mx + g._attackFlashX * scaleX;
        const py = my + g._attackFlashY * scaleY;
        const rr = 5 + pulse * 4;
        ctx.globalAlpha = fade * (0.5 + pulse * 0.5);
        ctx.strokeStyle = '#ff2222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = fade * pulse * 0.25;
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Label
    ctx.fillStyle = '#6a5030';
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('MAP', mx + mw / 2, my - 3);
  }

  // ── Drag box ─────────────────────────────────────────────
  _drawDragBox(ctx) {
    const drag = this.game.input.getDragRect();
    if (!drag || drag.w < 4 || drag.h < 4) return;
    ctx.strokeStyle = 'rgba(100,220,100,0.9)';
    ctx.lineWidth = 1.5;
    ctx.fillStyle = 'rgba(100,220,100,0.05)';
    ctx.fillRect(drag.x, drag.y, drag.w, drag.h);
    ctx.strokeRect(drag.x, drag.y, drag.w, drag.h);
  }

  // ── Command mode cursor overlay ───────────────────────────
  _drawCommandModeCursor(ctx) {
    const inp = this.game.input;
    const mx = inp.mouseX, my = inp.mouseY;
    if (inp.attackMoveMode) {
      ctx.fillStyle = '#ff6644';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔ A-MOVE', mx + 14, my);
    } else if (inp.patrolMode) {
      ctx.fillStyle = '#44aaff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('↔ PATROL', mx + 14, my);
    } else if (inp.rallyMode) {
      ctx.fillStyle = '#44ffaa';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩 RALLY', mx + 14, my);
    }
  }

  // ── Build Ghost ───────────────────────────────────────────
  _drawBuildGhost(ctx) {
    const inp = this.game.input;
    if (!inp.buildMode || !inp.buildType) return;

    const def = BUILDING_DEFS[inp.buildType];
    if (!def) return;

    const tx = Math.floor(inp.mouseWorldX / TILE_SIZE);
    const ty = Math.floor(inp.mouseWorldY / TILE_SIZE);
    const cam = this.game.camera;
    const ok = inp.buildGhostOk;
    const iw = ISO_TILE_W, ih = ISO_TILE_H;

    // Draw iso diamond outline for each tile in the building footprint
    ctx.fillStyle = ok ? 'rgba(60,200,60,0.25)' : 'rgba(200,60,60,0.25)';
    ctx.strokeStyle = ok ? '#44ee44' : '#ee4444';
    ctx.lineWidth = 1.5;

    for (let dy = 0; dy < def.size; dy++) {
      for (let dx = 0; dx < def.size; dx++) {
        const iso = tileToIso(tx + dx, ty + dy);
        const sx = (iso.x - cam.worldX) * cam.zoom;
        const sy = (iso.y - cam.worldY) * cam.zoom;
        const sw = iw * cam.zoom, sh = ih * cam.zoom;
        ctx.beginPath();
        ctx.moveTo(sx + sw/2, sy);
        ctx.lineTo(sx + sw,   sy + sh/2);
        ctx.lineTo(sx + sw/2, sy + sh);
        ctx.lineTo(sx,        sy + sh/2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // Label at center of footprint
    const isoCenter = tileToIso(tx + def.size / 2, ty + def.size / 2);
    const labelSx = (isoCenter.x - cam.worldX) * cam.zoom;
    const labelSy = (isoCenter.y - cam.worldY) * cam.zoom;
    ctx.fillStyle = '#fff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.name, labelSx, labelSy - 4);

    const costStr = Object.entries(def.cost).map(([k,v]) => `${v} ${k}`).join(', ');
    ctx.fillStyle = '#ccc';
    ctx.font = '10px Arial';
    ctx.fillText(costStr, labelSx, labelSy + 10);
  }

  // ── Notifications ────────────────────────────────────────
  addNotification(msg, color) {
    this.notifications.push({ msg, color: color || '#fff', life: 3000, y: 0 });
  }

  _drawNotifications(ctx, W, H) {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const n = this.notifications[i];
      n.life -= this.game.dt || 50;
      if (n.life <= 0) { this.notifications.splice(i, 1); continue; }
      const alpha = Math.min(1, n.life / 500);
      const y = UI_TOP_H + 20 + (this.notifications.length - 1 - i) * 24;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(W / 2 - 150, y, 300, 20);
      ctx.fillStyle = n.color;
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(n.msg, W / 2, y + 10);
      ctx.globalAlpha = 1;
    }
  }

  // ── Panel click handler ───────────────────────────────────
  handlePanelClick(sx, sy) {
    const game = this.game;
    const sel  = game.selection;

    // Check command buttons
    for (const btn of this.cmdButtons) {
      if (sx >= btn.x && sx <= btn.x + btn.w && sy >= btn.y && sy <= btn.y + btn.h) {
        if (btn.enabled === false) return;
        this._executeCommand(btn.action, btn.data);
        return;
      }
    }
  }

  _executeCommand(action, data) {
    const game = this.game;
    const sel  = game.selection;
    const units = sel.getSelectedUnits();
    const building = sel.selectedBuilding;
    const player = game.players[0];

    switch (action) {
      case 'AGE_UP':
        if (player.startAgeAdvance()) {
          this.addNotification(`Advancing to ${AGE_DEFS[AGE_ORDER[player.ageIndex + 1]].name}...`, '#c8a94e');
        } else {
          this.addNotification('Cannot advance age yet!', '#ff6644');
        }
        break;

      case 'BUILD_MENU':
        this.buildMenuOpen = !this.buildMenuOpen;
        if (this.buildMenuOpen) {
          game.ui.showBuildMenu(units);
        }
        break;

      case 'GATHER_NEAREST':
        for (const u of units) {
          if (u.unitClass !== 'civilian') continue;
          const node = game.getNearestResource(u.x, u.y);
          if (node) u.cmdGather(node);
        }
        break;

      case 'RETURN_RES':
        for (const u of units) {
          if (u.carrying > 0) u._setState(UNIT_STATE.RETURNING_RESOURCE);
        }
        break;

      case 'STOP':
        for (const u of units) u.cmdStop();
        break;

      case 'ATTACK_MOVE':
        this.game.input.attackMoveMode = true;
        this.game.input.patrolMode = false;
        this.addNotification('A-Move: Right-click destination', '#aaddff');
        break;

      case 'DESELECT':
        sel.clearAll();
        this.buildMenuOpen = false;
        break;

      case 'TRAIN':
        if (building && data) {
          const ok = building.enqueueUnit(data);
          if (ok === 'hero_limit') {
            this.addNotification('You can only have one Iron Warlord!', '#ff8844');
          } else if (!ok) {
            if (player.pop >= player.popCap) {
              this.addNotification('Population cap reached! Build more Houses.', '#ff8844');
            } else {
              this.addNotification('Not enough resources!', '#ff4444');
            }
          }
        }
        break;

      case 'RESEARCH':
        if (building && data) {
          const ok = building.enqueueResearch(data);
          if (!ok) {
            const rdef = RESEARCH_DEFS[data];
            if (player.researched.has(data)) {
              this.addNotification('Already researched!', '#ff8844');
            } else if (!player.canResearch(data)) {
              this.addNotification('Requirements not met!', '#ff8844');
            } else {
              this.addNotification('Not enough resources!', '#ff4444');
            }
          } else {
            const rdef = RESEARCH_DEFS[data];
            this.addNotification(`Researching: ${rdef.name}...`, '#88aaff');
          }
        }
        break;

      case 'SET_STANCE':
        for (const u of units) {
          if (u instanceof Unit) u.cmdSetStance(data);
        }
        break;

      case 'SET_RALLY':
        if (building) {
          this.game.input.rallyMode = true;
          this.game.input.rallyBuilding = building;
          this.addNotification('Right-click to set rally point', '#aaddff');
        }
        break;

      case 'PATROL':
        this.game.input.patrolMode = true;
        this.game.input.attackMoveMode = false;
        this.addNotification('Patrol: Right-click destination', '#aaddff');
        break;

      case 'IDLE_VILLAGER':
        this._jumpToIdleVillager();
        break;

      case 'AUTO_TRAIN':
        if (building && data) {
          building.autoTrain = (building.autoTrain === data) ? null : data;
          const def = UNIT_DEFS[data];
          this.addNotification(
            building.autoTrain ? `Auto-training ${def?.name} enabled` : `Auto-train disabled`,
            building.autoTrain ? '#88eeaa' : '#aaaaaa'
          );
        }
        break;

      case 'REPAIR_NEAREST':
        {
          // Find nearest damaged friendly building and send selected villagers
          const civilians = units.filter(u => u.unitClass === 'civilian' && !u.dead);
          if (civilians.length > 0) {
            let bestB = null, bestDist = Infinity;
            for (const b of player.buildings) {
              if (b.dead || !b.built || b.hp >= b.maxHp) continue;
              const d = dist(civilians[0].x, civilians[0].y, b.x, b.y);
              if (d < bestDist) { bestDist = d; bestB = b; }
            }
            if (bestB) {
              for (const v of civilians) v.cmdRepair(bestB);
              this.addNotification('Repairing nearest damaged building...', '#88ccff');
            } else {
              this.addNotification('No damaged buildings nearby', '#888888');
            }
          }
        }
        break;

      case 'REPAIR_BUILDING':
        {
          const target = building;
          if (target) {
            // Try selected villagers first, then nearest idle villager
            const selectedVillagers = units.filter(u => u.unitClass === 'civilian' && !u.dead);
            if (selectedVillagers.length > 0) {
              for (const v of selectedVillagers) v.cmdRepair(target);
              this.addNotification('Repairing...', '#88ccff');
            } else {
              const idleV = player.units.find(u => !u.dead && u.type === 'VILLAGER' && u.state === UNIT_STATE.IDLE);
              if (idleV) {
                idleV.cmdRepair(target);
                this.addNotification('Villager sent to repair', '#88ccff');
              } else {
                this.addNotification('Select villagers to repair!', '#ff8844');
              }
            }
          }
        }
        break;

      case 'GARRISON':
        {
          const milUnits = units.filter(u => u.unitClass !== 'civilian' && !u.garrisoned);
          if (milUnits.length > 0) {
            const gBuilding = data || player.buildings.find(b => !b.dead && b.built && b.def.maxGarrison && b.garrisonedUnits.length < b.def.maxGarrison);
            if (gBuilding) {
              for (const u of milUnits) u.cmdGarrison(gBuilding);
              this.addNotification(`${milUnits.length} unit(s) garrisoning`, '#ffeeaa');
            } else {
              this.addNotification('No garrison space available!', '#ff8844');
            }
          }
        }
        break;

      case 'UNGARRISON_ALL':
        if (building && building.garrisonedUnits.length > 0) {
          const count = building.garrisonedUnits.length;
          for (const u of [...building.garrisonedUnits]) u.ungarrison();
          this.addNotification(`${count} unit(s) ungarrisoned`, '#ffeeaa');
        }
        break;

      case 'UNPACK':
        for (const u of units) {
          if (u.def && u.def.class === 'siege') u.cmdUnpack();
        }
        break;

      case 'PACK':
        for (const u of units) {
          if (u.def && u.def.class === 'siege') u.cmdPack();
        }
        break;

      case 'EMP_BURST':
        for (const u of units) {
          if (u.unitClass === 'support') u.cmdEMPBurst();
        }
        break;

      case 'BATTLECRY':
        for (const u of units) {
          if (u.unitClass === 'hero') u.cmdBattlecry();
        }
        break;

      case 'BUILD_CLOSE':
        this.buildMenuOpen = false;
        break;

      case 'BUILD_TC':
        game.input.startBuild('TOWN_CENTER');
        break;

      default:
        if (action.startsWith('BUILD_')) {
          const btype = action.slice(6);
          if (BUILDING_DEFS[btype]) {
            const pdef = BUILDING_DEFS[btype];
            if (!player.canAfford(pdef.cost)) {
              this.addNotification('Not enough resources!', '#ff4444');
              return;
            }
            game.input.startBuild(btype);
            this.buildMenuOpen = false; // close build menu after selecting
          }
        }
    }
  }

  _jumpToIdleVillager() {
    const player = this.game.players[0];
    const idle = player.units.filter(u => !u.dead && u.type === 'VILLAGER' && u.state === UNIT_STATE.IDLE);
    if (idle.length === 0) return;
    this._idleVillagerIndex = this._idleVillagerIndex % idle.length;
    const v = idle[this._idleVillagerIndex];
    this._idleVillagerIndex = (this._idleVillagerIndex + 1) % idle.length;
    const iso = simToIso(v.x, v.y);
    this.game.camera.centerOn(iso.x, iso.y);
    this.game.selection.clearAll();
    this.game.selection.selected.add(v);
    v.selected = true;
  }

  showBuildMenu(units) {
    // Show build submenu - this is handled as a special overlay
    // For simplicity we map keyboard or show a prompt
    // The build buttons appear in the command area when BUILD_MENU is active
  }

  // Minimap helpers
  minimapContains(sx, sy) {
    return sx >= this.minimapX && sx <= this.minimapX + this.minimapW &&
           sy >= this.minimapY && sy <= this.minimapY + this.minimapH;
  }

  minimapToWorld(sx, sy) {
    // Returns iso world coords for camera.centerOn
    const tileX = ((sx - this.minimapX) / this.minimapW) * MAP_W;
    const tileY = ((sy - this.minimapY) / this.minimapH) * MAP_H;
    const iso = tileToIso(tileX, tileY);
    return { wx: iso.x + ISO_TILE_W / 2, wy: iso.y + ISO_TILE_H / 2 };
  }

  // ── Build menu overlay (when villager selected, B pressed) ──
  renderBuildMenu(ctx, W, H) {
    if (!this.buildMenuOpen) return;

    const player = this.game.players[0];
    const panelY = H - UI_BOTTOM_H;
    const btnX = PANEL_W + 10;
    const btnY = panelY + 8;

    const buildings = Object.entries(BUILDING_DEFS).filter(([k, def]) => {
      if (k === 'TOWN_CENTER') return false;
      if (def.requires && AGE_ORDER.indexOf(player.age) < AGE_ORDER.indexOf(def.requires)) return false;
      return true;
    });

    const BW = 64, BH = 54, GAP = 6;
    let col = 0, row = 0;

    // Back button (closes build menu)
    {
      const bx = btnX + col * (BW + GAP);
      const by = btnY + row * (BH + GAP);
      ctx.fillStyle = 'rgba(60,30,30,0.95)';
      roundRect(ctx, bx, by, BW, BH, 5);
      ctx.fill();
      ctx.strokeStyle = '#886655';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ddbbaa';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◀ Back', bx + BW / 2, by + BH / 2);
      this._storeButton('BUILD_CLOSE', bx, by, BW, BH, null, true);
      col++;
      if (col >= 4) { col = 0; row++; }
    }

    for (const [btype, bdef] of buildings) {
      const bx = btnX + col * (BW + GAP);
      const by = btnY + row * (BH + GAP);
      if (by + BH > panelY + UI_BOTTOM_H) break;

      const canAfford = player.canAfford(bdef.cost);
      ctx.fillStyle = canAfford ? 'rgba(30,50,80,0.95)' : 'rgba(40,25,25,0.9)';
      roundRect(ctx, bx, by, BW, BH, 5);
      ctx.fill();
      ctx.strokeStyle = canAfford ? '#446688' : '#553333';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = canAfford ? '#ccddee' : '#776655';
      ctx.font = '9px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bdef.name, bx + BW / 2, by + BH / 2 - 8);

      const costStr = Object.entries(bdef.cost).map(([k,v]) => `${v}${k[0].toUpperCase()}`).join(' ');
      ctx.fillStyle = canAfford ? '#99aacc' : '#665544';
      ctx.font = '8px Arial';
      ctx.fillText(costStr, bx + BW / 2, by + BH / 2 + 6);

      ctx.fillStyle = '#667';
      ctx.font = '8px Arial';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${bdef.size}×${bdef.size}`, bx + BW / 2, by + BH - 2);

      this._storeButton(`BUILD_${btype}`, bx, by, BW, BH, null, canAfford);
      col++;
      if (col >= 4) { col = 0; row++; }
    }
  }
}
