// ============================================================
// IRON DOMINION - Fog of War (3-state)
// States: 0=black (unseen), 1=grey (seen/shroud), 2=visible
// ============================================================

class FogOfWar {
  constructor(mapW, mapH) {
    this.mapW = mapW;
    this.mapH = mapH;
    // 0=black, 1=grey, 2=visible
    this.state = new Uint8Array(mapW * mapH); // all black
    this._dirty = true;
  }

  reset() {
    this.state.fill(0);
  }

  // Called each logic tick: reset visible to seen, then re-reveal
  beginFrame() {
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === 2) this.state[i] = 1;
    }
  }

  reveal(cx, cy, radius) {
    // cx, cy in tile coords
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx, ty = cy + dy;
        if (!inBounds(tx, ty)) continue;
        this.state[ty * this.mapW + tx] = 2;
      }
    }
  }

  getState(tx, ty) {
    if (!inBounds(tx, ty)) return 0;
    return this.state[ty * this.mapW + tx];
  }

  isVisible(tx, ty)  { return this.disabled || this.getState(tx, ty) === 2; }
  isSeen(tx, ty)     { return this.disabled || this.getState(tx, ty) >= 1; }

  // Is world position visible? wx/wy are SIMULATION coords (not iso)
  isWorldVisible(wx, wy) {
    if (this.disabled) return true;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    return this.isVisible(tx, ty);
  }

  // Render fog overlay in isometric world space.
  // Called inside ctx.scale(zoom)/ctx.translate(-worldX,-worldY) where world = iso space.
  render(ctx, camera) {
    if (this.disabled) return;
    const { minTx, maxTx, minTy, maxTy } = this._getVisibleRange(camera);
    const iw = ISO_TILE_W, ih = ISO_TILE_H;

    for (let sum = minTx + minTy; sum <= maxTx + maxTy; sum++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const ty = sum - tx;
        if (ty < minTy || ty > maxTy) continue;
        const s = this.getState(tx, ty);
        if (s === 2) continue;

        // Multi-step edge softening: count visible neighbors at radius 1 and 2
        let minDistToVisible = 99;
        if (s < 2) {
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
            if (this.getState(tx + dx, ty + dy) === 2) { minDistToVisible = 1; break; }
          }
          if (minDistToVisible > 1) {
            outer: for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                if (Math.abs(dx) + Math.abs(dy) > 3) continue;
                if (this.getState(tx + dx, ty + dy) === 2) { minDistToVisible = 2; break outer; }
              }
            }
          }
        }

        // Softer alpha at visible boundary for smooth edge (3 levels: edge, near, far)
        let alpha;
        if (s === 1) {
          // Seen/shroud — graduated transparency toward visible edge
          alpha = minDistToVisible === 1 ? 0.30 : minDistToVisible === 2 ? 0.45 : 0.55;
        } else {
          // Unseen — smooth multi-step gradient toward visible
          alpha = minDistToVisible === 1 ? 0.55 : minDistToVisible === 2 ? 0.75 : 0.92;
        }

        const iso = tileToIso(tx, ty);
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath();
        ctx.moveTo(iso.x + iw/2, iso.y);
        ctx.lineTo(iso.x + iw,   iso.y + ih/2);
        ctx.lineTo(iso.x + iw/2, iso.y + ih);
        ctx.lineTo(iso.x,        iso.y + ih/2);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  _getVisibleRange(camera) {
    const vw = camera.viewW / camera.zoom;
    const vh = camera.viewH / camera.zoom;
    const wx = camera.worldX, wy = camera.worldY;
    const c0 = isoToTileF(wx,      wy);
    const c1 = isoToTileF(wx + vw, wy);
    const c2 = isoToTileF(wx,      wy + vh);
    const c3 = isoToTileF(wx + vw, wy + vh);
    return {
      minTx: Math.max(0,       Math.floor(Math.min(c0.tx, c1.tx, c2.tx, c3.tx)) - 1),
      maxTx: Math.min(MAP_W-1, Math.ceil (Math.max(c0.tx, c1.tx, c2.tx, c3.tx)) + 1),
      minTy: Math.max(0,       Math.floor(Math.min(c0.ty, c1.ty, c2.ty, c3.ty)) - 1),
      maxTy: Math.min(MAP_H-1, Math.ceil (Math.max(c0.ty, c1.ty, c2.ty, c3.ty)) + 1),
    };
  }

  // Render minimap version
  renderMinimap(ctx, x, y, w, h) {
    if (this.disabled) return;
    const scaleX = w / this.mapW;
    const scaleY = h / this.mapH;
    for (let ty = 0; ty < this.mapH; ty++) {
      for (let tx = 0; tx < this.mapW; tx++) {
        const s = this.state[ty * this.mapW + tx];
        if (s === 2) continue;
        if (s === 1) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
        } else {
          ctx.fillStyle = 'rgba(0,0,0,0.92)';
        }
        ctx.fillRect(x + tx * scaleX, y + ty * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }
  }
}
