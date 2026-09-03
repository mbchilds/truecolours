/* picker.js - a compact HSV colour picker: saturation/value square, hue bar,
   hex input and a strip of recently used colours. Exposed on window.Picker. */
(function () {
  const C = window.Color;

  class Picker {
    constructor(container, opts = {}) {
      this.onChange = opts.onChange || (() => {});
      this.h = 0; this.s = 0.85; this.v = 0.9;
      this.recent = [];
      container.innerHTML = `
        <div class="pk-sv" tabindex="0" aria-label="Saturation and brightness">
          <div class="pk-cursor"></div>
        </div>
        <div class="pk-hue" tabindex="0" aria-label="Hue">
          <div class="pk-hue-cursor"></div>
        </div>
        <div class="pk-row">
          <div class="pk-swatch"></div>
          <label class="pk-hexwrap"><span>HEX</span><input class="pk-hex" maxlength="7" spellcheck="false" autocomplete="off"></label>
          <div class="pk-hsv">
            <label>H <input type="number" class="pk-num" data-k="h" min="0" max="360"></label>
            <label>S <input type="number" class="pk-num" data-k="s" min="0" max="100"></label>
            <label>B <input type="number" class="pk-num" data-k="v" min="0" max="100"></label>
          </div>
        </div>
        <div class="pk-recent" aria-label="Recent colours"></div>`;
      this.el = container;
      this.sv = container.querySelector('.pk-sv');
      this.svCursor = container.querySelector('.pk-cursor');
      this.hue = container.querySelector('.pk-hue');
      this.hueCursor = container.querySelector('.pk-hue-cursor');
      this.swatch = container.querySelector('.pk-swatch');
      this.hexInput = container.querySelector('.pk-hex');
      this.nums = [...container.querySelectorAll('.pk-num')];
      this.recentEl = container.querySelector('.pk-recent');
      this.bindDrag(this.sv, (x, y) => { this.s = x; this.v = 1 - y; this.update(); });
      this.bindDrag(this.hue, (x) => { this.h = x * 360; if (this.h >= 360) this.h = 359.99; this.update(); });
      this.hexInput.addEventListener('change', () => this.setHex(this.hexInput.value, true));
      this.hexInput.addEventListener('keydown', e => { if (e.key === 'Enter') { this.hexInput.blur(); } });
      this.nums.forEach(inp => inp.addEventListener('change', () => {
        const k = inp.dataset.k, val = parseFloat(inp.value);
        if (isNaN(val)) return this.update();
        if (k === 'h') this.h = Math.min(359.99, Math.max(0, val));
        else this[k] = Math.min(1, Math.max(0, val / 100));
        this.update();
      }));
      // keyboard nudging on the square / hue bar
      this.sv.addEventListener('keydown', e => this.nudge(e, 'sv'));
      this.hue.addEventListener('keydown', e => this.nudge(e, 'hue'));
      this.update(false);
    }

    nudge(e, which) {
      const step = e.shiftKey ? 0.1 : 0.02;
      let handled = true;
      if (which === 'sv') {
        if (e.key === 'ArrowLeft') this.s -= step; else if (e.key === 'ArrowRight') this.s += step;
        else if (e.key === 'ArrowUp') this.v += step; else if (e.key === 'ArrowDown') this.v -= step; else handled = false;
        this.s = Math.min(1, Math.max(0, this.s)); this.v = Math.min(1, Math.max(0, this.v));
      } else {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') this.h -= step * 360;
        else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') this.h += step * 360; else handled = false;
        this.h = (this.h + 360) % 360;
      }
      if (handled) { e.preventDefault(); this.update(); }
    }

    bindDrag(el, fn) {
      const move = e => {
        const r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        fn(x, y);
      };
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); el.setPointerCapture(e.pointerId); el.focus({ preventScroll: true }); move(e);
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
      });
    }

    get hex() { return C.rgbToHex(...C.hsvToRgb(this.h, this.s, this.v)); }

    setHex(hex, fire) {
      hex = (hex || '').trim();
      if (!hex.startsWith('#')) hex = '#' + hex;
      if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) { this.update(false); return false; }
      const [h, s, v] = C.rgbToHsv(...C.hexToRgb(hex));
      this.h = h; this.s = s; this.v = v;
      this.update(fire !== false);
      return true;
    }

    update(fire = true) {
      const hex = this.hex;
      this.sv.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${this.h} 100% 50%))`;
      this.svCursor.style.left = (this.s * 100) + '%';
      this.svCursor.style.top = ((1 - this.v) * 100) + '%';
      this.svCursor.style.background = hex;
      this.hueCursor.style.left = (this.h / 360 * 100) + '%';
      this.hueCursor.style.background = `hsl(${this.h} 100% 50%)`;
      this.swatch.style.background = hex;
      if (document.activeElement !== this.hexInput) this.hexInput.value = hex.toUpperCase();
      const vals = { h: Math.round(this.h), s: Math.round(this.s * 100), v: Math.round(this.v * 100) };
      this.nums.forEach(i => { if (document.activeElement !== i) i.value = vals[i.dataset.k]; });
      this.el.style.setProperty('--pk-current', hex);
      if (fire) this.onChange(hex);
    }

    // remember a colour the player actually used
    remember(hex) {
      hex = hex.toLowerCase();
      this.recent = [hex, ...this.recent.filter(h => h !== hex)].slice(0, 8);
      this.renderRecent();
    }
    clearRecent() { this.recent = []; this.renderRecent(); }
    renderRecent() {
      this.recentEl.innerHTML = this.recent.length
        ? this.recent.map(h => `<button type="button" class="pk-chip" style="background:${h}" title="${h}" aria-label="Use ${h}"></button>`).join('')
        : '<span class="pk-recent-empty">Colours you use will appear here</span>';
      this.recentEl.querySelectorAll('.pk-chip').forEach(b => b.addEventListener('click', () => this.setHex(b.title, true)));
    }
  }
  window.Picker = Picker;
})();
