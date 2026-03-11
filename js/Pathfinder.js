// ============================================================
// IRON DOMINION - A* Pathfinding
// ============================================================

class Pathfinder {
  constructor(gameMap) {
    this.map = gameMap;
  }

  // Returns array of {tx, ty} tile coords (not including start), or []
  findPath(startTx, startTy, goalTx, goalTy, maxIter) {
    maxIter = maxIter || 2000;
    startTx = clamp(Math.round(startTx), 0, MAP_W - 1);
    startTy = clamp(Math.round(startTy), 0, MAP_H - 1);
    goalTx  = clamp(Math.round(goalTx),  0, MAP_W - 1);
    goalTy  = clamp(Math.round(goalTy),  0, MAP_H - 1);

    // If goal impassable, find nearest passable
    if (!this.map.isPassable(goalTx, goalTy)) {
      const alt = this._nearestPassable(goalTx, goalTy);
      if (!alt) return [];
      goalTx = alt.tx; goalTy = alt.ty;
    }

    if (startTx === goalTx && startTy === goalTy) return [];

    const W = MAP_W;
    const key = (tx, ty) => ty * W + tx;
    const heur = (tx, ty) => {
      const dx = Math.abs(tx - goalTx), dy = Math.abs(ty - goalTy);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    const gScore  = new Float32Array(MAP_W * MAP_H).fill(Infinity);
    const fScore  = new Float32Array(MAP_W * MAP_H).fill(Infinity);
    const parent  = new Int32Array(MAP_W * MAP_H).fill(-1);
    const closed  = new Uint8Array(MAP_W * MAP_H);

    const sk = key(startTx, startTy);
    gScore[sk] = 0;
    fScore[sk] = heur(startTx, startTy);

    const open = new MinHeap((a, b) => a.f - b.f);
    open.push({ f: fScore[sk], tx: startTx, ty: startTy });

    const DIRS = [
      [0,-1,1],[0,1,1],[-1,0,1],[1,0,1],
      [-1,-1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[1,1,Math.SQRT2]
    ];

    let iter = 0;
    while (open.size > 0 && iter++ < maxIter) {
      const cur = open.pop();
      const ck = key(cur.tx, cur.ty);
      if (closed[ck]) continue;
      closed[ck] = 1;

      if (cur.tx === goalTx && cur.ty === goalTy) {
        return this._reconstruct(parent, W, startTx, startTy, goalTx, goalTy);
      }

      for (const [dx, dy, cost] of DIRS) {
        const nx = cur.tx + dx, ny = cur.ty + dy;
        if (!inBounds(nx, ny)) continue;
        if (!this.map.isPassable(nx, ny) && !(nx === goalTx && ny === goalTy)) continue;
        // No corner cutting
        if (dx !== 0 && dy !== 0) {
          if (!this.map.isPassable(cur.tx + dx, cur.ty) && !this.map.isPassable(cur.tx, cur.ty + dy)) continue;
        }
        const nk = key(nx, ny);
        if (closed[nk]) continue;
        const tg = gScore[ck] + cost;
        if (tg < gScore[nk]) {
          gScore[nk] = tg;
          fScore[nk] = tg + heur(nx, ny);
          parent[nk] = ck;
          open.push({ f: fScore[nk], tx: nx, ty: ny });
        }
      }
    }
    return [];
  }

  _reconstruct(parent, W, sx, sy, ex, ey) {
    const path = [];
    let ci = ey * W + ex;
    const start = sy * W + sx;
    while (ci !== start && parent[ci] !== -1) {
      path.unshift({ tx: ci % W, ty: Math.floor(ci / W) });
      ci = parent[ci];
    }
    return path;
  }

  _nearestPassable(tx, ty) {
    for (let r = 1; r <= 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (inBounds(nx, ny) && this.map.isPassable(nx, ny)) return { tx: nx, ty: ny };
        }
      }
    }
    return null;
  }
}
