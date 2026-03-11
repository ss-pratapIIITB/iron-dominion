// ============================================================
// IRON DOMINION - Procedural Audio (Web Audio API, no files)
// ============================================================

const Sound = (() => {
  let _ctx = null;
  let _masterGain = null;
  let _enabled = true;
  let _lastSelectTime = 0; // throttle select sfx

  function ac() {
    if (!_ctx) {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      _masterGain = _ctx.createGain();
      _masterGain.gain.value = 0.18;
      _masterGain.connect(_ctx.destination);
    }
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function play(fn) {
    if (!_enabled) return;
    try { fn(ac(), _masterGain); } catch(e) {}
  }

  return {
    // Short bow/arrow shot
    shoot() {
      play((c, out) => {
        const osc = c.createOscillator();
        const g   = c.createGain();
        osc.connect(g); g.connect(out);
        osc.frequency.setValueAtTime(600, c.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.08);
        g.gain.setValueAtTime(0.18, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        osc.type = 'sawtooth';
        osc.start(c.currentTime);
        osc.stop(c.currentTime + 0.1);
      });
    },

    // Heavy cannon/trebuchet shot (short noise burst)
    heavyShoot() {
      play((c, out) => {
        const buf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
        }
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 250;
        src.connect(lp); lp.connect(g); g.connect(out);
        g.gain.value = 0.9;
        src.start(c.currentTime);
      });
    },

    // Melee hit (thud)
    meleeHit() {
      play((c, out) => {
        const buf = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
        }
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 400;
        src.connect(lp); lp.connect(g); g.connect(out);
        g.gain.value = 0.5;
        src.start(c.currentTime);
      });
    },

    // Building / training complete (ascending chime)
    complete() {
      play((c, out) => {
        const freqs = [523, 659, 784, 1047];
        freqs.forEach((f, i) => {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'sine';
          osc.frequency.value = f;
          g.gain.setValueAtTime(0.10, c.currentTime + i * 0.09);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.09 + 0.14);
          osc.start(c.currentTime + i * 0.09);
          osc.stop(c.currentTime + i * 0.09 + 0.15);
        });
      });
    },

    // Construction hammer taps
    build() {
      play((c, out) => {
        [0, 0.08, 0.16].forEach((t, i) => {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'square';
          osc.frequency.value = [440, 550, 660][i];
          g.gain.setValueAtTime(0.10, c.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t + 0.07);
          osc.start(c.currentTime + t);
          osc.stop(c.currentTime + t + 0.08);
        });
      });
    },

    // Gathering (short woodchop/pickaxe tick)
    gather() {
      play((c, out) => {
        const buf = c.createBuffer(1, c.sampleRate * 0.04, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5) * 0.6;
        }
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        src.connect(g); g.connect(out);
        g.gain.value = 0.4;
        src.start(c.currentTime);
      });
    },

    // Enemy alert / attack warning
    alert() {
      play((c, out) => {
        for (let rep = 0; rep < 2; rep++) {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, c.currentTime + rep * 0.2);
          osc.frequency.setValueAtTime(660, c.currentTime + rep * 0.2 + 0.1);
          g.gain.setValueAtTime(0.08, c.currentTime + rep * 0.2);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + rep * 0.2 + 0.18);
          osc.start(c.currentTime + rep * 0.2);
          osc.stop(c.currentTime + rep * 0.2 + 0.19);
        }
      });
    },

    // Unit selected (short blip, throttled)
    select() {
      const now = performance.now();
      if (now - _lastSelectTime < 80) return; // avoid rapid-fire spam
      _lastSelectTime = now;
      play((c, out) => {
        const osc = c.createOscillator();
        const g   = c.createGain();
        osc.connect(g); g.connect(out);
        osc.type = 'sine'; osc.frequency.value = 700;
        g.gain.setValueAtTime(0.04, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.05);
        osc.start(c.currentTime); osc.stop(c.currentTime + 0.06);
      });
    },

    // Research complete (triumphant arpeggio)
    research() {
      play((c, out) => {
        const freqs = [440, 554, 659, 880];
        freqs.forEach((f, i) => {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'triangle'; osc.frequency.value = f;
          g.gain.setValueAtTime(0.12, c.currentTime + i * 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.12 + 0.2);
          osc.start(c.currentTime + i * 0.12);
          osc.stop(c.currentTime + i * 0.12 + 0.22);
        });
      });
    },

    // Victory fanfare
    victory() {
      play((c, out) => {
        const melody = [523, 659, 784, 1047, 784, 880, 1047];
        melody.forEach((f, i) => {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'sine'; osc.frequency.value = f;
          g.gain.setValueAtTime(0.18, c.currentTime + i * 0.14);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.14 + 0.2);
          osc.start(c.currentTime + i * 0.14);
          osc.stop(c.currentTime + i * 0.14 + 0.22);
        });
      });
    },

    // Defeat (descending sad notes)
    defeat() {
      play((c, out) => {
        [440, 370, 311, 262].forEach((f, i) => {
          const osc = c.createOscillator();
          const g   = c.createGain();
          osc.connect(g); g.connect(out);
          osc.type = 'sawtooth'; osc.frequency.value = f;
          g.gain.setValueAtTime(0.13, c.currentTime + i * 0.22);
          g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.22 + 0.3);
          osc.start(c.currentTime + i * 0.22);
          osc.stop(c.currentTime + i * 0.22 + 0.32);
        });
      });
    },

    toggleMute() {
      _enabled = !_enabled;
      if (_masterGain) _masterGain.gain.value = _enabled ? 0.18 : 0;
      return _enabled;
    }
  };
})();
