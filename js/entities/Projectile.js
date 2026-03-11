// ============================================================
// IRON DOMINION - Projectile
// ============================================================

class Projectile {
  constructor(shooter, target, game) {
    this.game    = game;
    this.shooter = shooter;
    this.target  = target;
    this.dead    = false;
    this.playerId = shooter.playerId;

    this.x = shooter.x;
    this.y = shooter.y;

    // Damage from shooter (includes research bonuses if available)
    this.dmg = (shooter.getEffectiveAtk ? shooter.getEffectiveAtk() : (shooter.atk || 5));
    this.meleeArmor  = 0;
    this.pierceArmor = 0;

    // Speed based on type
    const isTreb  = shooter.type === 'TREBUCHET';
    const isTank  = shooter.type === 'TANK';
    const isHeavy = isTreb || isTank;
    this.speed  = isTreb ? 4 * TILE_SIZE : (isTank ? 7 * TILE_SIZE : 10 * TILE_SIZE); // pixels/sec
    this.radius = isHeavy ? 6 : 4;
    this.color  = isTreb ? '#ff6600' : (isTank ? '#ff8833' : '#ffee88');
    this.arc    = isTreb; // only trebuchet has arc trajectory; tank shoots flat
    this.isSiege = isHeavy; // draw heavy projectile visual

    // Arc: compute total distance and store for height calculation
    this.startX = this.x;
    this.startY = this.y;
    this.progress = 0; // 0-1 for arc
    this.totalDist = dist(this.x, this.y, target.x, target.y);
    this.maxHeight = isTreb ? Math.min(120, this.totalDist * 0.4) : 0;

    // Splash radius for heavy siege
    this.splashRadius = isHeavy ? TILE_SIZE * 2 : 0;

    // Arrow trail
    this.trail = [];
    this.trailMax = isHeavy ? 8 : 5;

    // Play shoot sound (player-visible only to avoid noise from off-screen AI)
    if (shooter.playerId === 0 || game.fog.isWorldVisible(shooter.x, shooter.y)) {
      if (typeof Sound !== 'undefined') {
        isHeavy ? Sound.heavyShoot() : Sound.shoot();
      }
    }
  }

  update(dt) {
    if (this.dead) return;

    // Target may have moved or died
    const tx = this.target.dead ? this.target.x : this.target.x;
    const ty = this.target.dead ? this.target.y : this.target.y;

    const dx = tx - this.x;
    const dy = ty - this.y;
    const d  = Math.sqrt(dx * dx + dy * dy);

    if (this.arc) {
      // Arc trajectory
      const moveSpeed = this.speed * dt / 1000;
      const totalTravelTime = this.totalDist / this.speed * 1000;
      this.progress = Math.min(1, this.progress + dt / totalTravelTime);

      // Interpolate toward target with arc
      this.x = lerp(this.startX, tx, this.progress);
      this.y = lerp(this.startY, ty, this.progress) - this.maxHeight * Math.sin(this.progress * Math.PI);

      if (this.progress >= 1 || d < 8) {
        this._hit(tx, ty);
      }
    } else {
      // Straight shot
      const speed = this.speed * dt / 1000;
      if (d <= speed + 2) {
        this._hit(tx, ty);
      } else {
        // Store trail
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > this.trailMax) this.trail.shift();

        this.x += (dx / d) * speed;
        this.y += (dy / d) * speed;
      }
    }
  }

  _hit(tx, ty) {
    this.dead = true;

    if (this.splashRadius > 0) {
      // Splash damage
      for (const u of this.game.units) {
        if (u.dead || u.playerId === this.playerId) continue;
        const d = dist(u.x, u.y, tx, ty);
        if (d <= this.splashRadius) {
          const falloff = 1 - (d / this.splashRadius) * 0.5;
          const dmg = Math.max(1, Math.round(this.dmg * falloff - u.pierceArmor));
          u.takeDamage(dmg, this.shooter);
        }
      }
      for (const b of this.game.buildings) {
        if (b.dead || b.playerId === this.playerId) continue;
        const d = dist(b.x, b.y, tx, ty);
        if (d <= this.splashRadius) {
          const dmg = Math.max(1, Math.round(this.dmg * 0.5));
          b.takeDamage(dmg, this.shooter);
        }
      }
      // Spawn explosion effect
      this.game.spawnEffect({ type: 'explosion', x: tx, y: ty, radius: this.splashRadius, life: 500 });
    } else {
      // Single target
      if (!this.target.dead) {
        let dmg = Math.max(1, this.dmg - (this.target.pierceArmor || 0));
        this.target.takeDamage(dmg, this.shooter);
      }
    }
  }

  // Called inside ctx.scale(zoom)/ctx.translate(-worldX,-worldY) transform block
  render(ctx, camera) {
    if (this.dead) return;

    // Convert sim position to iso world position
    const iso = simToIso(this.x, this.y);
    const wx = iso.x, wy = iso.y;
    const r  = this.radius;

    // Draw trail (in iso world coords)
    if (this.trail.length > 1) {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(1 / camera.zoom, r * 0.5);
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const tp = simToIso(this.trail[i].x, this.trail[i].y);
        if (i === 0) ctx.moveTo(tp.x, tp.y);
        else ctx.lineTo(tp.x, tp.y);
      }
      ctx.lineTo(wx, wy);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Projectile dot
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fill();

    if (this.isSiege) {
      ctx.fillStyle = '#ff2200';
      ctx.beginPath();
      ctx.arc(wx, wy, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
