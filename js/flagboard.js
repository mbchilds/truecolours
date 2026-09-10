/* flagboard.js - loads a flag's region map and draws the "colouring book".
   The region map (flags/<code>.bin) says which fillable region every pixel
   belongs to (0 = pre-filled detail, drawn straight from the real SVG). */
(function () {
  const C = window.Color;
  const PAPER_A = [244, 244, 241], PAPER_B = [232, 232, 227];   // unfilled hatch
  // Outlines. A "seam" separates two fillable regions; a "detail edge" is where a
  // fillable region meets pre-filled detail (emblem linework, lettering...).
  const SEAM_INK = [118, 120, 126];      // seam colour while the region is unfilled
  const SEAM_DARKEN = 0.78;              // filled: the seam is the fill colour, darkened
  const DETAIL_INK = [172, 174, 180];    // detail edge while unfilled; disappears once filled

  const Assets = {
    manifest: null,
    cache: new Map(),
    async manifestLoad() {
      if (this.manifest) return this.manifest;
      if (window.EMBEDDED_FLAGS) this.manifest = window.EMBEDDED_FLAGS.manifest;
      else this.manifest = await (await fetch('flags/manifest.json')).json();
      return this.manifest;
    },
    async loadFlag(code) {
      if (this.cache.has(code)) return this.cache.get(code);
      const p = (async () => {
        const [labelsBuf, img] = await Promise.all([this.loadBin(code), this.loadSvg(code)]);
        const { w, h, labels } = decodeRle(labelsBuf);
        const off = document.createElement('canvas'); off.width = w; off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const base = ctx.getImageData(0, 0, w, h);
        return { w, h, labels, base, edge: edgeMask(labels, w, h), img };
      })();
      this.cache.set(code, p);
      return p;
    },
    async loadBin(code) {
      if (window.EMBEDDED_FLAGS) {
        const b64 = window.EMBEDDED_FLAGS.bin[code];
        const s = atob(b64); const u = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
        return u.buffer;
      }
      return (await fetch(`flags/${code}.bin`)).arrayBuffer();
    },
    loadSvg(code) {
      return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = window.EMBEDDED_FLAGS ? window.EMBEDDED_FLAGS.svg[code] : `flags/${code}.svg`;
      });
    },
  };

  function decodeRle(buf) {
    const dv = new DataView(buf);
    const w = dv.getUint16(0, true), h = dv.getUint16(2, true), n = dv.getUint32(4, true);
    const labels = new Uint16Array(w * h);
    let p = 8, pos = 0;
    for (let i = 0; i < n; i++) {
      const v = dv.getUint16(p, true), len = dv.getUint16(p + 2, true); p += 4;
      labels.fill(v, pos, pos + len); pos += len;
    }
    return { w, h, labels };
  }

  // Per pixel: 0 = interior, 1 = seam (fillable/fillable boundary, 1px on each side),
  // 2 = detail edge (fillable pixel next to pre-filled detail, 1px on the fillable side).
  // Pre-filled pixels never get ink - they already show the real flag.
  function edgeMask(labels, w, h) {
    const e = new Uint8Array(w * h);
    const mark = (i, L, M) => {
      if (L === M) return;
      if (L && M) { e[i] = 1; }
      else if (L && !M) { if (!e[i]) e[i] = 2; }
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, L = labels[i];
        if (x + 1 < w) { mark(i, L, labels[i + 1]); mark(i + 1, labels[i + 1], L); }
        if (y + 1 < h) { mark(i, L, labels[i + w]); mark(i + w, labels[i + w], L); }
      }
    }
    return e;
  }

  class FlagBoard {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.fills = new Map();      // regionId -> hex
      this.hover = 0;
      this.flag = null; this.meta = null;
      this.onFill = () => {}; this.onHover = () => {};
      this.currentColour = '#ff0000';
      this.interactive = true;
      this.bind();
    }

    async load(meta) {
      this.meta = meta;
      this.flag = await Assets.loadFlag(meta.code);
      this.canvas.width = this.flag.w; this.canvas.height = this.flag.h;
      this.imgData = this.ctx.createImageData(this.flag.w, this.flag.h);
      this.fills = new Map(); this.hover = 0;
      this.render();
    }

    regionAt(clientX, clientY) {
      if (!this.flag) return 0;
      const r = this.canvas.getBoundingClientRect();
      const x = Math.floor((clientX - r.left) / r.width * this.flag.w);
      const y = Math.floor((clientY - r.top) / r.height * this.flag.h);
      if (x < 0 || y < 0 || x >= this.flag.w || y >= this.flag.h) return 0;
      return this.flag.labels[y * this.flag.w + x];
    }

    bind() {
      const c = this.canvas;
      let raf = 0;
      c.addEventListener('pointermove', e => {
        if (!this.interactive || e.pointerType === 'touch') return;
        const id = this.regionAt(e.clientX, e.clientY);
        if (id !== this.hover) {
          this.hover = id; this.onHover(id);
          c.style.cursor = id ? 'crosshair' : 'default';
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.render(); });
        }
      });
      c.addEventListener('pointerleave', () => { if (this.hover) { this.hover = 0; this.onHover(0); this.render(); } });
      c.addEventListener('pointerdown', e => {
        if (!this.interactive) return;
        e.preventDefault();
        const id = this.regionAt(e.clientX, e.clientY);
        if (id) { this.fill(id, this.currentColour); }
      });
    }

    fill(id, hex) {
      this.fills.set(id, hex.toLowerCase());
      this.render();
      this.onFill(id, hex);
    }
    clear() { this.fills = new Map(); this.render(); }
    get filledCount() { return this.fills.size; }

    render() { paint(this.imgData, this.flag, this.fills, this.hover); this.ctx.putImageData(this.imgData, 0, 0); }

    // Draw a finished attempt into any canvas (used on the results screen)
    static paintInto(canvas, flag, fills) {
      canvas.width = flag.w; canvas.height = flag.h;
      const ctx = canvas.getContext('2d');
      const d = ctx.createImageData(flag.w, flag.h);
      paint(d, flag, fills, 0);
      ctx.putImageData(d, 0, 0);
    }
  }

  function paint(imgData, flag, fills, hover) {
    const out = imgData.data, base = flag.base.data, labels = flag.labels, edge = flag.edge;
    const w = flag.w, n = labels.length;
    const lut = [];   // regionId -> [r,g,b] or undefined
    for (const [id, hex] of fills) lut[id] = C.hexToRgb(hex);
    for (let i = 0, y = 0, x = 0; i < n; i++) {
      const L = labels[i], o = i * 4;
      if (L === 0) { out[o] = base[o]; out[o + 1] = base[o + 1]; out[o + 2] = base[o + 2]; out[o + 3] = base[o + 3]; }
      else {
        const fill = lut[L], ed = edge[i];
        let c;
        if (ed === 1) c = fill ? [fill[0] * SEAM_DARKEN, fill[1] * SEAM_DARKEN, fill[2] * SEAM_DARKEN] : SEAM_INK;
        else if (ed === 2 && !fill) c = DETAIL_INK;
        else c = fill || ((((x >> 3) + (y >> 3)) & 1) ? PAPER_A : PAPER_B);
        if (L === hover) { out[o] = c[0] * 0.8 + 51; out[o + 1] = c[1] * 0.8 + 51; out[o + 2] = c[2] * 0.8 + 51; }
        else { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; }
        out[o + 3] = 255;
      }
      if (++x === w) { x = 0; y++; }
    }
  }

  window.FlagBoard = FlagBoard;
  window.FlagAssets = Assets;
})();
