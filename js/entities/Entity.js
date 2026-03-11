// ============================================================
// IRON DOMINION - Base Entity
// ============================================================

class Entity {
  constructor(type, x, y, playerId) {
    this.id       = nextEntityId();
    this.type     = type;
    this.x        = x;
    this.y        = y;
    this.playerId = playerId;
    this.dead     = false;
    this.selected = false;
  }

  get tx() { return Math.floor(this.x / TILE_SIZE); }
  get ty() { return Math.floor(this.y / TILE_SIZE); }

  distTo(other) {
    return dist(this.x, this.y, other.x, other.y);
  }

  distToWorld(wx, wy) {
    return dist(this.x, this.y, wx, wy);
  }

  // Damage / death - override in subclasses
  takeDamage(amount, attacker) {
    // subclass implements
  }

  die() {
    this.dead = true;
  }

  // Draw a health bar above entity
  static drawHealthBar(ctx, x, y, w, hp, maxHp) {
    const barH  = 4;
    const barY  = y - barH - 1;
    const ratio = clamp(hp / maxHp, 0, 1);
    const color = ratio > 0.6 ? '#44ee44' : ratio > 0.3 ? '#eeee44' : '#ee4444';

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - w / 2, barY, w, barH);
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, barY, w * ratio, barH);
  }

  // Draw selection ring
  static drawSelectionRing(ctx, x, y, radius, color) {
    ctx.strokeStyle = color || '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.3, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
