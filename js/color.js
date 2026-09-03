/* color.js - colour conversions and the CIEDE2000 perceptual difference.
   Everything here is pure maths, no DOM. Exposed on window.Color. */
(function () {
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  // h 0-360, s 0-1, v 0-1
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return [h, max ? d / max : 0, max];
  }

  function rgbToLab(r, g, b) {
    const lin = v => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; };
    r = lin(r); g = lin(g); b = lin(b);
    let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
    let y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
    let z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
    x = f(x); y = f(y); z = f(z);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }

  // CIEDE2000 (Sharma et al. 2005). Returns a perceptual distance: ~1 is the
  // smallest difference a trained eye can see, 10 is clearly different.
  function ciede2000(lab1, lab2) {
    const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
    const rad = Math.PI / 180, deg = 180 / Math.PI;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hp = (a, b) => { if (a === 0 && b === 0) return 0; let h = Math.atan2(b, a) * deg; return h < 0 ? h + 360 : h; };
    const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp;
    if (C1p * C2p === 0) dhp = 0;
    else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
    else dhp = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
      + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const RC = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTheta * rad) * RC;
    return Math.sqrt(Math.pow(dLp / SL, 2) + Math.pow(dCp / SC, 2) + Math.pow(dHp / SH, 2)
      + RT * (dCp / SC) * (dHp / SH));
  }

  function hexDistance(hexA, hexB) {
    return ciede2000(rgbToLab(...hexToRgb(hexA)), rgbToLab(...hexToRgb(hexB)));
  }

  // Map a colour difference to points. Exact = 1000; a difference a normal eye
  // can't spot (dE < 1) still scores 1000; the curve then falls away smoothly
  // and reaches 0 at dE 50 (roughly "a completely different colour").
  const SCORE_FALLOFF = 25, SCORE_ZERO_AT = 50, PERFECT_BELOW = 1;
  function pointsFor(dE) {
    if (dE < PERFECT_BELOW) return 1000;
    if (dE >= SCORE_ZERO_AT) return 0;
    return Math.round(1000 * Math.exp(-Math.pow(dE / SCORE_FALLOFF, 2)));
  }
  function verdict(points) {
    if (points >= 1000) return 'Perfect';
    if (points >= 940) return 'Spot on';
    if (points >= 800) return 'Close';
    if (points >= 550) return 'Warm';
    if (points >= 250) return 'Off';
    return 'Way off';
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  // Rough human-friendly name of a colour, used in the results breakdown.
  function describe(hex) {
    const [r, g, b] = hexToRgb(hex);
    const [h, s, v] = rgbToHsv(r, g, b);
    if (v < 0.16) return 'Black';
    if (s < 0.12) return v > 0.9 ? 'White' : v > 0.6 ? 'Light grey' : 'Grey';
    const names = [[15, 'Red'], [40, 'Orange'], [65, 'Yellow'], [160, 'Green'], [195, 'Teal'], [255, 'Blue'], [290, 'Purple'], [335, 'Pink'], [360, 'Red']];
    let name = 'Red';
    for (const [lim, n] of names) { if (h < lim) { name = n; break; } }
    if (name === 'Orange' && v < 0.65) name = 'Brown';
    if (name === 'Yellow' && v < 0.7) name = 'Olive';
    if (name === 'Blue' && v < 0.45) name = 'Navy';
    if (name === 'Red' && v < 0.55) name = 'Maroon';
    if (name === 'Blue' && s < 0.45 && v > 0.7) name = 'Sky blue';
    return name;
  }

  window.Color = { hexToRgb, rgbToHex, hsvToRgb, rgbToHsv, rgbToLab, ciede2000, hexDistance, pointsFor, verdict, luminance, describe };
})();
