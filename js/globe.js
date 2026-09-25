/* globe.js - decorative homepage background: a real, live-rotating globe.
   Coastlines are real (Natural Earth, public domain, see globe/LICENSE-naturalearth.txt),
   projected orthographically in JS every frame so it can actually spin - not a static image.
   Purely decorative: unrelated to the Daily Challenge / Quick Play flag selection. */
(function () {
  const svg = document.getElementById('globe');
  if (!svg) return;
  const landPath = document.getElementById('globe-land');
  const graticuleG = document.getElementById('globe-graticule');

  const R = 760, CX = 800, CY = 800;
  const LAT0 = 32;          // fixed polar tilt (camera angle) - only longitude animates
  const DEG_PER_SEC = 1.5;  // gentle: one full turn every 4 minutes

  function basis(lon0deg, lat0deg) {
    const lon0 = lon0deg * Math.PI / 180, lat0 = lat0deg * Math.PI / 180;
    return {
      ex: [-Math.sin(lon0), Math.cos(lon0), 0],
      ey: [-Math.sin(lat0) * Math.cos(lon0), -Math.sin(lat0) * Math.sin(lon0), Math.cos(lat0)],
      ez: [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)],
    };
  }
  function toVec(lonDeg, latDeg) {
    const lon = lonDeg * Math.PI / 180, lat = latDeg * Math.PI / 180, cl = Math.cos(lat);
    return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function project(v, b) {
    return [dot(v, b.ex), -dot(v, b.ey), dot(v, b.ez)]; // [x, y, visibility]
  }
  function nlerpZero(vA, vB, b) {
    let lo = 0, hi = 1, dA = dot(vA, b.ez);
    for (let i = 0; i < 20; i++) {
      const t = (lo + hi) / 2;
      const v = [(1 - t) * vA[0] + t * vB[0], (1 - t) * vA[1] + t * vB[1], (1 - t) * vA[2] + t * vB[2]];
      const n = Math.hypot(v[0], v[1], v[2]);
      const vn = [v[0] / n, v[1] / n, v[2] / n];
      const d = dot(vn, b.ez);
      if ((d > 0) === (dA > 0)) { lo = t; vA = vn; dA = d; } else { hi = t; vB = vn; }
    }
    const v = [(vA[0] + vB[0]) / 2, (vA[1] + vB[1]) / 2, (vA[2] + vB[2]) / 2];
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  }

  // Projects [lon,lat] rings to an SVG path, clipping each ring to the visible
  // hemisphere and closing any clipped run along the horizon's own curve
  // (a straight chord there would cut a flat "bite" across a wide landmass).
  function buildPath(rings, b) {
    const subpaths = [];
    for (const ring of rings) {
      const n = ring.length;
      const pts = ring.map(([lo, la]) => toVec(lo, la));
      const proj = pts.map(v => project(v, b));
      const allVis = proj.every(p => p[2] > 0);
      if (!proj.some(p => p[2] > 0)) continue;
      let start = 0;
      if (!allVis) {
        for (let i = 0; i < n; i++) {
          if (proj[(i - 1 + n) % n][2] <= 0 && proj[i][2] > 0) { start = i; break; }
        }
      }
      const order = []; for (let k = 0; k < n; k++) order.push((start + k) % n);
      const runs = [];
      let curRun = null, prevVis = null, prevIdx = order[order.length - 1];
      for (const idx of order) {
        const vis = proj[idx][2] > 0;
        if (vis) {
          if (prevVis === false) {
            const pp = project(nlerpZero(pts[prevIdx], pts[idx], b), b);
            curRun = [[pp[0], pp[1]]];
          }
          if (!curRun) curRun = [];
          curRun.push([proj[idx][0], proj[idx][1]]);
        } else if (prevVis) {
          const pp = project(nlerpZero(pts[prevIdx], pts[idx], b), b);
          curRun.push([pp[0], pp[1]]);
          runs.push(curRun);
          curRun = null;
        }
        prevVis = vis; prevIdx = idx;
      }
      if (curRun) runs.push(curRun);

      for (const run of runs) {
        if (run.length < 3) continue;
        const toScreen = p => (CX + p[0] * R).toFixed(1) + ',' + (CY + p[1] * R).toFixed(1);
        const pathStr = 'M ' + run.map(toScreen).join(' L ');
        if (allVis) {
          subpaths.push(pathStr + ' Z ');
        } else {
          const first = run[0], last = run[run.length - 1];
          let delta = Math.atan2(first[1], first[0]) - Math.atan2(last[1], last[0]);
          while (delta <= -Math.PI) delta += 2 * Math.PI;
          while (delta > Math.PI) delta -= 2 * Math.PI;
          const sweepFlag = delta > 0 ? 1 : 0;
          subpaths.push(pathStr + ` A ${R} ${R} 0 0 ${sweepFlag} ${toScreen(first)} Z `);
        }
      }
    }
    return subpaths.join(' ');
  }

  function buildGraticule() {
    const b = basis(0, LAT0); // invariant to rotation - only depends on the fixed tilt
    let out = '';
    for (const phi of [-60, -30, 0, 30, 60]) {
      const ring = []; for (let lam = 0; lam < 360; lam += 4) ring.push([lam, phi]); ring.push(ring[0]);
      out += buildPath([ring], b);
    }
    return out;
  }

  let coastline = null, lon0 = 0, last = 0, running = false;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render() {
    landPath.setAttribute('d', buildPath(coastline, basis(lon0, LAT0)));
  }
  function tick(now) {
    if (!running) return;
    lon0 = (lon0 + DEG_PER_SEC * (now - last) / 1000) % 360;
    last = now;
    render();
    requestAnimationFrame(tick);
  }
  function start() {
    if (running || !coastline || reduceMotion) return;
    running = true; last = performance.now();
    requestAnimationFrame(tick);
  }
  function stop() { running = false; }

  fetch('globe/coastline.json')
    .then(r => r.json())
    .then(data => {
      coastline = data;
      const gpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      gpath.setAttribute('d', buildGraticule());
      graticuleG.appendChild(gpath);
      render();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => { entries[0].isIntersecting ? start() : stop(); }).observe(svg);
      } else {
        start();
      }
    })
    .catch(() => { /* decorative only - fine to silently no-op if it can't load */ });
})();
