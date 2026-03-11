// ============================================================
// IRON DOMINION - Bootstrap / Entry Point
// ============================================================

(function() {
  'use strict';

  function setProgress(pct) {
    const bar = document.getElementById('loadingBar');
    if (bar) bar.style.width = pct + '%';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const loading = document.getElementById('loadingScreen');

    // Resize canvas to fill window
    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      if (window._game) {
        window._game.camera.setViewport(canvas.width, canvas.height);
      }
    }
    resize();
    window.addEventListener('resize', resize);

    setProgress(10);

    // Start loading sprites immediately (async; game falls back to procedural until ready)
    SpriteLoader.init(() => {
      console.log('[Iron Dominion] Kenney sprites loaded.');
      // Force terrain variant cache rebuild now that real sprites override them
      if (window._game) window._game.map.terrainDirty = true;
    });

    // Small delay to let loading screen render
    setTimeout(() => {
      setProgress(30);

      try {
        const game = new Game(canvas);
        window._game = game;

        setProgress(60);

        game.init();

        setProgress(90);

        // Hide loading screen
        loading.style.transition = 'opacity 0.5s ease';
        loading.style.opacity = '0';
        setTimeout(() => {
          loading.style.display = 'none';
          setProgress(100);
        }, 500);

        // Start game loop
        game.start();

      } catch (err) {
        console.error('Game initialization failed:', err);
        const p = loading.querySelector('p');
        if (p) {
          p.textContent = 'Error: ' + err.message;
          p.style.color = '#ff4444';
        }
      }
    }, 100);
  });
})();
