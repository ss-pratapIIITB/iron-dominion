// ============================================================
// IRON DOMINION - Bootstrap / Entry Point (3D Mode)
// ============================================================

(function() {
  'use strict';

  function setProgress(pct) {
    const bar = document.getElementById('loadingBar');
    if (bar) bar.style.width = pct + '%';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const glCanvas = document.getElementById('glCanvas');
    const uiCanvas = document.getElementById('uiCanvas');
    const loading  = document.getElementById('loadingScreen');

    // Resize both canvases to fill window
    function resize() {
      glCanvas.width  = window.innerWidth;
      glCanvas.height = window.innerHeight;
      uiCanvas.width  = window.innerWidth;
      uiCanvas.height = window.innerHeight;
      // Keep the 2D camera viewport in sync for UIManager
      if (window._game) {
        window._game.camera.setViewport(uiCanvas.width, uiCanvas.height);
      }
    }
    resize();
    window.addEventListener('resize', resize);

    setProgress(10);

    // Pre-load Kenney sprites for minimap (still used by UIManager)
    SpriteLoader.init(() => {
      console.log('[Iron Dominion] Sprites loaded (used for minimap).');
    });

    setProgress(20);

    setTimeout(() => {
      try {
        setProgress(35);

        // Create the game with the UI canvas as the "game canvas"
        // (UIManager draws 2D HUD here; InputManager listens on glCanvas)
        const game = new Game(uiCanvas);
        window._game = game;

        // Store UI canvas context for Scene3D to use
        game._uiCanvas = uiCanvas;
        game._uiCtx    = uiCanvas.getContext('2d');

        // Override the canvas for InputManager to listen on the 3D canvas
        // (so mouse clicks on 3D scene are picked up correctly)
        game._glCanvas = glCanvas;

        setProgress(55);

        game.init();

        setProgress(75);

        // Create and init the 3D renderer
        const scene3D = new Scene3D(game, glCanvas);
        game.scene3D  = scene3D;
        scene3D.init();

        setProgress(90);

        // Redirect InputManager events to the 3D canvas
        // InputManager was bound to uiCanvas; rebind key events to glCanvas
        // Mouse events on 3D canvas pass through the transparent UI overlay
        game.input.canvas = glCanvas;
        glCanvas.addEventListener('mousemove', e => {
          const rect = glCanvas.getBoundingClientRect();
          game.input.mouseX = e.clientX - rect.left;
          game.input.mouseY = e.clientY - rect.top;
          const w = game.camera.screenToWorld(game.input.mouseX, game.input.mouseY);
          const sim = isoToSim(w.wx, w.wy);
          game.input.mouseWorldX = sim.x;
          game.input.mouseWorldY = sim.y;
          game.input.mouseIsoX = w.wx;
          game.input.mouseIsoY = w.wy;
          if (game.input.leftDown && !game.input.isDragging) {
            const dx = game.input.mouseX - game.input.mouseDownX;
            const dy = game.input.mouseY - game.input.mouseDownY;
            if (Math.abs(dx) > game.input.dragThresh || Math.abs(dy) > game.input.dragThresh) {
              game.input.isDragging = true;
            }
          }
          if (game.input.isDragging) {
            game.input.dragEndX = game.input.mouseX;
            game.input.dragEndY = game.input.mouseY;
          }
        });
        glCanvas.addEventListener('mousedown', e => {
          e.preventDefault();
          const rect = glCanvas.getBoundingClientRect();
          game.input.mouseX = e.clientX - rect.left;
          game.input.mouseY = e.clientY - rect.top;
          const w = game.camera.screenToWorld(game.input.mouseX, game.input.mouseY);
          const sim = isoToSim(w.wx, w.wy);
          game.input.mouseWorldX = sim.x;
          game.input.mouseWorldY = sim.y;
          game.input.mouseIsoX = w.wx;
          game.input.mouseIsoY = w.wy;
          if (e.button === 0) {
            game.input.leftDown   = true;
            game.input.mouseDownX = game.input.mouseX;
            game.input.mouseDownY = game.input.mouseY;
            game.input.dragStartX = game.input.mouseX;
            game.input.dragStartY = game.input.mouseY;
            game.input.dragEndX   = game.input.mouseX;
            game.input.dragEndY   = game.input.mouseY;
            game.input.isDragging = false;
          } else if (e.button === 2) {
            game.input.rightDown = true;
            game.input._handleRightClick(game.input.mouseX, game.input.mouseY, game.input.mouseWorldX, game.input.mouseWorldY);
          }
        });
        glCanvas.addEventListener('mouseup', e => {
          if (e.button === 0) {
            if (game.input.isDragging) {
              game.input._handleDragSelect();
            } else {
              game.input._handleLeftClick(game.input.mouseX, game.input.mouseY, game.input.mouseWorldX, game.input.mouseWorldY, e.shiftKey);
            }
            game.input.leftDown   = false;
            game.input.isDragging = false;
          } else if (e.button === 2) {
            game.input.rightDown = false;
          }
        });
        glCanvas.addEventListener('wheel', e => {
          e.preventDefault();
          if (e.metaKey || e.ctrlKey) {
            const delta = e.deltaY > 0 ? -1 : 1;
            game.camera.zoom_(delta);
          } else {
            game.camera.pan(e.deltaX, e.deltaY);
          }
        }, { passive: false });
        glCanvas.addEventListener('contextmenu', e => e.preventDefault());

        // Start the game (Scene3D has its own render loop via engine.runRenderLoop)
        game.running = true;

        // Hide loading screen
        loading.style.transition = 'opacity 0.6s ease';
        loading.style.opacity = '0';
        setTimeout(() => { loading.style.display = 'none'; setProgress(100); }, 600);

      } catch (err) {
        console.error('3D init failed:', err);
        const p = loading.querySelector('p');
        if (p) { p.textContent = 'Error: ' + err.message; p.style.color = '#ff4444'; }
      }
    }, 100);
  });
})();
