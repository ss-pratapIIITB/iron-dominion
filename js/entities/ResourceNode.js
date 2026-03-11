// ============================================================
// IRON DOMINION - Resource Node Entity
// ============================================================

class ResourceNode extends Entity {
  constructor(nodeType, tx, ty, game) {
    const def = RESOURCE_NODE_TYPES[nodeType];
    const cx = tx * TILE_SIZE + TILE_SIZE / 2;
    const cy = ty * TILE_SIZE + TILE_SIZE / 2;
    super(nodeType, cx, cy, -1); // no player owns resources

    this.game         = game;
    this.nodeType     = nodeType;
    this.resourceType = def.resource;
    this.maxAmount    = def.maxAmount;
    this.amount       = def.maxAmount;
    this.depleted     = false;
    this.color        = def.color;
    this.label        = def.label;
    this.radius       = def.radius;
    this.tileX        = tx;
    this.tileY        = ty;

    this.meleeArmor  = 999;
    this.pierceArmor = 999;
    this.hp          = 9999;
    this.maxHp       = 9999;
  }

  get tx() { return this.tileX; }
  get ty() { return this.tileY; }

  update(dt) {
    // nothing to update for static resources
  }

  takeDamage(amount, attacker) {
    // Resources can't be "killed" by attacks - ignore
  }

  // Called inside ctx.scale(zoom)/ctx.translate(-worldX,-worldY) transform block
  render(ctx, camera) {
    if (this.depleted) return;
    // Convert sim position to isometric world position
    const iso = simToIso(this.x, this.y);
    const wx = iso.x, wy = iso.y, r = this.radius;
    if (wx + r < camera.worldX || wx - r > camera.worldX + camera.viewW / camera.zoom) return;
    if (wy + r < camera.worldY || wy - r > camera.worldY + camera.viewH / camera.zoom) return;

    SpriteR.drawResourceNode(ctx, this, camera, wx, wy);

    // Resource amount label
    if (camera.zoom > 0.5) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(wx - r, wy + r + 1, r*2, 10/camera.zoom, 3/camera.zoom);
      } else {
        ctx.rect(wx - r, wy + r + 1, r*2, 10/camera.zoom);
      }
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${8/camera.zoom}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.amount, wx, wy + r + 6/camera.zoom);
    }
  }

  renderMinimap(ctx, mx, my, scaleX, scaleY) {
    if (this.depleted) return;
    let color;
    switch (this.nodeType) {
      case 'TREE':          color = '#2d5a27'; break;
      case 'GOLD_MINE':     color = '#f0c040'; break;
      case 'STONE_QUARRY':  color = '#aaaaaa'; break;
      case 'BERRY_BUSH':    color = '#cc2244'; break;
    }
    ctx.fillStyle = color;
    const px = mx + this.tileX * scaleX;
    const py = my + this.tileY * scaleY;
    ctx.fillRect(px - 1, py - 1, 3, 3);
  }
}
