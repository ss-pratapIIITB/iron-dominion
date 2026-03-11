// ============================================================
// IRON DOMINION - Camera System
// ============================================================

class Camera {
  constructor(viewW, viewH) {
    this.viewW  = viewW;
    this.viewH  = viewH;
    this.worldX = 0;    // world pixel offset
    this.worldY = 0;
    this.zoom   = 1.0;
    this.minZoom = 0.3;
    this.maxZoom = 2.0;
    this.panSpeed = 600; // pixels/sec at zoom 1

    this._edgeSize = 20; // px from edge for edge-scroll
    this._mouseX = 0;
    this._mouseY = 0;
    this._panning = false;
    this._panStart = { x: 0, y: 0, worldX: 0, worldY: 0 };
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  // Center camera on world position
  centerOn(wx, wy) {
    this.worldX = wx - this.viewW / (2 * this.zoom);
    this.worldY = wy - this.viewH / (2 * this.zoom);
    this._clamp();
  }

  update(dt, keys, mouseX, mouseY) {
    this._mouseX = mouseX;
    this._mouseY = mouseY;

    const speed = this.panSpeed / this.zoom * (dt / 1000);

    // Arrow key pan (WASD removed — conflicts with unit command hotkeys A/S/P)
    if (keys['ArrowLeft'])  this.worldX -= speed;
    if (keys['ArrowRight']) this.worldX += speed;
    if (keys['ArrowUp'])    this.worldY -= speed;
    if (keys['ArrowDown'])  this.worldY += speed;

    // Edge scroll: pan when mouse is near viewport edges
    // Game area runs from UI_TOP_H to (canvas.height - UI_BOTTOM_H) vertically
    const edge = this._edgeSize;
    const gameBottom = this.viewH + UI_TOP_H - UI_BOTTOM_H;
    if (mouseX >= 0 && mouseX <= this.viewW && mouseY > UI_TOP_H && mouseY < gameBottom) {
      const edgeSpeed = speed * 1.5;
      if (mouseX < edge)                this.worldX -= edgeSpeed * (1 - mouseX / edge);
      if (mouseX > this.viewW - edge)   this.worldX += edgeSpeed * (1 - (this.viewW - mouseX) / edge);
      if (mouseY - UI_TOP_H < edge)     this.worldY -= edgeSpeed * (1 - (mouseY - UI_TOP_H) / edge);
      if (gameBottom - mouseY < edge)   this.worldY += edgeSpeed * (1 - (gameBottom - mouseY) / edge);
    }

    this._clamp();
  }

  pan(dx, dy) {
    this.worldX += dx / this.zoom;
    this.worldY += dy / this.zoom;
    this._clamp();
  }

  zoom_(delta) {
    const oldZoom = this.zoom;
    this.zoom = clamp(this.zoom * (1 + delta * 0.1), this.minZoom, this.maxZoom);
    // Zoom around mouse position
    const mx = this._mouseX / oldZoom + this.worldX;
    const my = this._mouseY / oldZoom + this.worldY;
    this.worldX = mx - this._mouseX / this.zoom;
    this.worldY = my - this._mouseY / this.zoom;
    this._clamp();
  }

  _clamp() {
    // Bounds are in isometric world space
    const mapW = isoMapWidth();
    const mapH = isoMapHeight();
    const maxX = mapW - this.viewW / this.zoom;
    const maxY = mapH - this.viewH / this.zoom;
    this.worldX = clamp(this.worldX, 0, Math.max(0, maxX));
    this.worldY = clamp(this.worldY, 0, Math.max(0, maxY));
  }

  // Convert screen px → world px
  screenToWorld(sx, sy) {
    return {
      wx: sx / this.zoom + this.worldX,
      wy: sy / this.zoom + this.worldY
    };
  }

  worldToScreen(wx, wy) {
    return {
      sx: (wx - this.worldX) * this.zoom,
      sy: (wy - this.worldY) * this.zoom
    };
  }

  // Is world rect visible?
  isVisible(wx, wy, w, h) {
    const sx = (wx - this.worldX) * this.zoom;
    const sy = (wy - this.worldY) * this.zoom;
    const sw = w * this.zoom;
    const sh = h * this.zoom;
    return sx + sw > 0 && sx < this.viewW && sy + sh > 0 && sy < this.viewH;
  }

  applyTransform(ctx) {
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.worldX, -this.worldY);
  }

  restoreTransform(ctx) {
    ctx.restore();
  }
}
