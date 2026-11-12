// =====================================================================
//  Genesis Nova — login screen animations (canvas, no video, no libraries)
//  8 IT-themed scenes; the Admin picks one in Company settings.
//  Respects "reduce motion": draws one still frame instead.
// =====================================================================
export const MODES = ["network", "circuit", "globe", "server", "radar", "laptop", "hex", "fiber"];

export function startLoginFx(cv, initialMode = "network") {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1, last = 0, alive = true;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function size() {
    const r = cv.getBoundingClientRect(); DPR = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  /* ================= IT-solution animations (canvas) ================= */
  let mode = MODES.includes(initialMode) ? initialMode : "network", T = 0, surge = 0;
  const TEAL = "45,212,191", SKY = "124,196,255", GOLD = "251,191,36", RED = "248,113,113", GREEN = "74,222,128";
  const P = (x, y) => [x * W, y * H];
  function glow(x, y, r, rgb, a = .9) {
    const g = cx.createRadialGradient(x, y, 0, x, y, r * 5); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r * 5, 0, 6.283); cx.fill();
    cx.fillStyle = "#f4fffd"; cx.beginPath(); cx.arc(x, y, r * .7, 0, 6.283); cx.fill();
  }
  function rr(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
  function label(t, x, y, a = .75) { cx.font = "600 10.5px Inter, system-ui, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "top"; cx.fillStyle = `rgba(214,226,242,${a})`; cx.fillText(t, x, y); cx.textAlign = "left"; }

  /* ---------- 1. LIVE NETWORK: devices → switch → firewall → cloud / servers → backup ---------- */
  const NET = {
    laptop: [.07, .10, "Laptops"], desktop: [.07, .23, "Desktops"], printer: [.07, .36, "Printers"], cctv: [.07, .49, "CCTV"],
    wifi: [.22, .08, "Wi-Fi"], sw: [.27, .30, "Switch"], fw: [.47, .30, "Firewall"], net: [.62, .07, "Internet"],
    cloud: [.86, .14, "Cloud · M365"], srv: [.68, .47, "Servers"], nas: [.88, .47, "NAS backup"],
  };
  const NET_EDGES = [["laptop", "sw"], ["desktop", "sw"], ["printer", "sw"], ["cctv", "sw"], ["wifi", "sw"], ["sw", "fw"], ["fw", "cloud"], ["fw", "srv"], ["srv", "nas"], ["net", "fw"]];
  let packets = [], shieldHit = 0, blocked = 0;
  const route = (...ks) => ks.map((k) => P(NET[k][0], NET[k][1]));
  function spawnPacket(kind) {
    const src = ["laptop", "desktop", "printer", "cctv", "wifi"][Math.floor(Math.random() * 5)];
    if (kind === "threat") packets.push({ pts: route("net", "fw"), t: 0, sp: .00045, rgb: RED, threat: true });
    else if (kind === "backup") packets.push({ pts: route("srv", "nas"), t: 0, sp: .0006, rgb: GOLD });
    else packets.push({ pts: route(src, "sw", "fw", Math.random() < .55 ? "cloud" : "srv"), t: 0, sp: .00032 + Math.random() * .0002, rgb: Math.random() < .5 ? TEAL : SKY });
  }
  function along(pts, t) {
    const seg = pts.length - 1, f = Math.min(seg - 1e-6, t * seg), i = Math.floor(f), u = f - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u];
  }
  function icon(k, x, y, s) {
    cx.strokeStyle = "rgba(190,215,240,.85)"; cx.fillStyle = "rgba(20,36,60,.9)"; cx.lineWidth = 1.4;
    rr(x - s, y - s, s * 2, s * 2, s * .45); cx.fill(); cx.strokeStyle = "rgba(94,234,212,.35)"; cx.stroke(); cx.strokeStyle = "rgba(210,228,248,.9)";
    const q = s * .55; cx.beginPath();
    if (k === "laptop") { cx.rect(x - q, y - q * .7, q * 2, q * 1.2); cx.moveTo(x - q * 1.25, y + q * .75); cx.lineTo(x + q * 1.25, y + q * .75); }
    else if (k === "desktop") { cx.rect(x - q, y - q * .8, q * 2, q * 1.3); cx.moveTo(x, y + q * .5); cx.lineTo(x, y + q); cx.moveTo(x - q * .5, y + q); cx.lineTo(x + q * .5, y + q); }
    else if (k === "printer") { cx.rect(x - q, y - q * .3, q * 2, q * .9); cx.rect(x - q * .6, y - q, q * 1.2, q * .7); cx.rect(x - q * .6, y + q * .6, q * 1.2, q * .4); }
    else if (k === "cctv") { cx.rect(x - q, y - q * .5, q * 1.5, q * .8); cx.moveTo(x + q * .5, y); cx.lineTo(x + q, y + q * .2); cx.moveTo(x - q * .3, y + q * .3); cx.lineTo(x - q * .3, y + q); }
    else if (k === "wifi") { for (const r of [.4, .75, 1.1]) { cx.moveTo(x - q * r, y + q * .4 - q * r * .4); cx.arc(x, y + q * .55, q * r, 3.6, 5.82); } }
    else if (k === "sw") { cx.rect(x - q * 1.2, y - q * .45, q * 2.4, q * .9); for (let i = -2; i <= 2; i++) cx.rect(x + i * q * .45 - q * .12, y - q * .12, q * .24, q * .24); }
    else if (k === "fw") { cx.moveTo(x, y - q * 1.1); cx.lineTo(x + q, y - q * .6); cx.lineTo(x + q * .8, y + q * .5); cx.lineTo(x, y + q * 1.1); cx.lineTo(x - q * .8, y + q * .5); cx.lineTo(x - q, y - q * .6); cx.closePath(); cx.moveTo(x - q * .4, y); cx.lineTo(x - q * .1, y + q * .35); cx.lineTo(x + q * .45, y - q * .3); }
    else if (k === "net") { cx.arc(x, y, q, 0, 6.283); cx.moveTo(x - q, y); cx.lineTo(x + q, y); cx.ellipse(x, y, q * .45, q, 0, 0, 6.283); }
    else if (k === "cloud") { cx.moveTo(x - q * 1.1, y + q * .5); cx.arc(x - q * .5, y + q * .05, q * .5, 2.4, 4.9); cx.arc(x + q * .1, y - q * .2, q * .65, 3.5, 6.0); cx.arc(x + q * .7, y + q * .15, q * .45, 4.6, 1.6); cx.closePath(); }
    else if (k === "srv") { for (let i = 0; i < 3; i++) { cx.rect(x - q, y - q + i * q * .7, q * 2, q * .55); } }
    else if (k === "nas") { cx.rect(x - q * .8, y - q, q * 1.6, q * 2); for (let i = 0; i < 3; i++) { cx.moveTo(x - q * .5, y - q * .5 + i * q * .5); cx.lineTo(x + q * .5, y - q * .5 + i * q * .5); } }
    cx.stroke();
  }
  let nextPkt = 0, nextThreat = 1800, nextBackup = 2600;
  function drawNetwork(dt) {
    const s = Math.max(13, Math.min(W, H) * .036);
    cx.setLineDash([4, 6]); cx.lineWidth = 1.2;
    for (const [a, b] of NET_EDGES) {
      const [x1, y1] = P(NET[a][0], NET[a][1]), [x2, y2] = P(NET[b][0], NET[b][1]);
      cx.strokeStyle = a === "net" ? "rgba(248,113,113,.22)" : "rgba(94,234,212,.22)"; cx.lineDashOffset = -T * .02;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke();
    }
    cx.setLineDash([]);
    if ((nextPkt -= dt) < 0) { spawnPacket(); nextPkt = 260 - surge * 200; }
    if ((nextThreat -= dt) < 0) { spawnPacket("threat"); nextThreat = 1600 + Math.random() * 1600; }
    if ((nextBackup -= dt) < 0) { spawnPacket("backup"); nextBackup = 900; }
    packets = packets.filter((p) => {
      p.t += p.sp * dt * (1 + surge * 2);
      if (p.threat && p.t >= .93) { shieldHit = 1; blocked++; return false; }
      if (p.t >= 1) return false;
      for (let k = 6; k >= 0; k--) { const [x, y] = along(p.pts, Math.max(0, p.t - k * .012)); cx.fillStyle = `rgba(${p.rgb},${(1 - k / 7) * .5})`; cx.beginPath(); cx.arc(x, y, 2.2 - k * .2, 0, 6.283); cx.fill(); }
      const [x, y] = along(p.pts, p.t); glow(x, y, 2.4, p.rgb);
      return true;
    });
    for (const [k, [px, py, name]] of Object.entries(NET)) {
      const [x, y] = P(px, py);
      if (k === "fw") {
        const r = s * 1.7 + shieldHit * s * 1.2;
        cx.strokeStyle = `rgba(${shieldHit > .1 ? RED : TEAL},${.25 + shieldHit * .6})`; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.stroke();
        if (shieldHit > .2) { cx.font = "700 10px Inter, sans-serif"; cx.fillStyle = `rgba(248,113,113,${shieldHit})`; cx.textAlign = "center"; cx.fillText("THREAT BLOCKED", x, y - r - 8); cx.textAlign = "left"; }
      }
      icon(k, x, y, s * (k === "fw" ? 1.15 : 1));
      label(name, x, y + s * (k === "fw" ? 1.35 : 1.2) + 3);
    }
    shieldHit = Math.max(0, shieldHit - dt * .0015);
    const [cX, cY] = P(NET.srv[0], NET.srv[1]);
    for (let i = 0; i < 3; i++) { const on = Math.sin(T * .01 + i * 2) > 0; cx.fillStyle = on ? `rgba(${GREEN},.95)` : "rgba(74,222,128,.25)"; cx.beginPath(); cx.arc(cX + s * .45, cY - s * .72 + i * s * .38, 1.6, 0, 6.283); cx.fill(); }
  }

  /* ---------- 2. CIRCUIT BOARD: power racing through traces and chips ---------- */
  let traces = [], chips = [], pulses = [];
  function buildCircuit() {
    const g = Math.max(16, Math.round(Math.min(W, H) / 26));
    chips = [{ x: W * .52, y: H * .14, w: g * 5, h: g * 3, t: "CPU" }, { x: W * .78, y: H * .30, w: g * 4, h: g * 3, t: "SECURITY" }, { x: W * .40, y: H * .40, w: g * 4, h: g * 2.4, t: "NETWORK" }, { x: W * .80, y: H * .58, w: g * 3.4, h: g * 2.4, t: "STORAGE" }];
    traces = [];
    for (const c of chips) {
      const pins = [];
      for (let i = 1; i < 5; i++) { pins.push([c.x - c.w / 2, c.y - c.h / 2 + i * c.h / 5, -1, 0]); pins.push([c.x + c.w / 2, c.y - c.h / 2 + i * c.h / 5, 1, 0]); }
      for (let i = 1; i < 6; i++) { pins.push([c.x - c.w / 2 + i * c.w / 6, c.y - c.h / 2, 0, -1]); pins.push([c.x - c.w / 2 + i * c.w / 6, c.y + c.h / 2, 0, 1]); }
      for (const [x0, y0, dx, dy] of pins) {
        if (Math.random() < .25) continue;
        const pts = [[x0, y0]]; let x = x0, y = y0, vx = dx, vy = dy;
        const steps = 3 + Math.floor(Math.random() * 6);
        for (let k = 0; k < steps; k++) {
          const len = g * (1 + Math.floor(Math.random() * 3));
          if (k > 0 && Math.random() < .45) { if (vx) { vy = Math.random() < .5 ? -1 : 1; vx = Math.random() < .5 ? vx : 0; } else { vx = Math.random() < .5 ? -1 : 1; vy = Math.random() < .5 ? vy : 0; } }
          x += vx * len; y += vy * len; pts.push([x, y]);
        }
        let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        traces.push({ pts, L });
      }
    }
  }
  function pointAt(tr, d) {
    for (let i = 1; i < tr.pts.length; i++) { const a = tr.pts[i - 1], b = tr.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l) return [a[0] + (b[0] - a[0]) * d / l, a[1] + (b[1] - a[1]) * d / l]; d -= l; }
    return tr.pts[tr.pts.length - 1];
  }
  let nextPulse = 0;
  function drawCircuit(dt) {
    if (!traces.length) buildCircuit();
    const g = Math.max(16, Math.round(Math.min(W, H) / 26));
    cx.fillStyle = "rgba(94,234,212,.06)"; for (let x = g / 2; x < W; x += g) for (let y = g / 2; y < H; y += g) cx.fillRect(x, y, 1, 1);
    cx.lineWidth = 1.6; cx.lineJoin = "round";
    for (const tr of traces) { cx.strokeStyle = "rgba(94,234,212,.16)"; cx.beginPath(); tr.pts.forEach(([x, y], i) => i ? cx.lineTo(x, y) : cx.moveTo(x, y)); cx.stroke(); const e = tr.pts[tr.pts.length - 1]; cx.strokeStyle = "rgba(94,234,212,.35)"; cx.beginPath(); cx.arc(e[0], e[1], 3, 0, 6.283); cx.stroke(); }
    if ((nextPulse -= dt) < 0) { const n = 1 + Math.floor(surge * 20); for (let i = 0; i < n; i++) pulses.push({ tr: traces[Math.floor(Math.random() * traces.length)], d: 0, rgb: Math.random() < .18 ? GOLD : TEAL, sp: .12 + Math.random() * .12 }); nextPulse = 90; }
    pulses = pulses.filter((p) => {
      p.d += p.sp * dt * (1 + surge * 1.5);
      if (p.d > p.tr.L + 60) return false;
      cx.lineWidth = 2.4; cx.lineCap = "round";
      for (let k = 0; k < 8; k++) { const d1 = p.d - k * 7, d2 = d1 - 7; if (d1 < 0 || d1 > p.tr.L) continue; const [x1, y1] = pointAt(p.tr, d1), [x2, y2] = pointAt(p.tr, Math.max(0, d2)); cx.strokeStyle = `rgba(${p.rgb},${(1 - k / 8) * .9})`; cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); }
      if (p.d <= p.tr.L) { const [x, y] = pointAt(p.tr, p.d); glow(x, y, 2, p.rgb); }
      return true;
    });
    for (const c of chips) {
      const x = c.x - c.w / 2, y = c.y - c.h / 2;
      cx.fillStyle = "rgba(12,22,38,.95)"; rr(x, y, c.w, c.h, 6); cx.fill();
      cx.strokeStyle = `rgba(94,234,212,${.45 + .25 * Math.sin(T * .003 + c.x) + surge * .3})`; cx.lineWidth = 1.4; cx.stroke();
      cx.strokeStyle = "rgba(94,234,212,.15)"; rr(x + 5, y + 5, c.w - 10, c.h - 10, 4); cx.stroke();
      cx.font = "700 11px Inter, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = "rgba(220,235,250,.9)"; cx.fillText(c.t, c.x, c.y); cx.textAlign = "left";
    }
  }

  /* ---------- 3. GLOBE: Mumbai connected to the world ---------- */
  let globePts = [];
  const CITIES = [["Mumbai", 19.07, 72.87], ["Delhi", 28.6, 77.2], ["Bengaluru", 12.97, 77.6], ["Dubai", 25.2, 55.27], ["Singapore", 1.35, 103.8], ["London", 51.5, -.12], ["New York", 40.7, -74], ["Sydney", -33.9, 151.2], ["Frankfurt", 50.1, 8.68], ["Tokyo", 35.7, 139.7]];
  const v3 = (lat, lon) => { const a = lat * Math.PI / 180, b = lon * Math.PI / 180; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };
  let arcs = [], nextArc = 0;
  function drawGlobe(dt) {
    if (!globePts.length) { const N = 1100; for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996; globePts.push([Math.cos(th) * r, y, Math.sin(th) * r]); } }
    const R = Math.min(W * .3, H * .36), ox = W * .64, oy = H * .4, rot = -1.27 + Math.sin(T * .00016) * .75, tilt = .32;
    const proj = ([x, y, z]) => { const c = Math.cos(rot), s = Math.sin(rot); let X = x * c + z * s, Z = -x * s + z * c, Y = y; const ct = Math.cos(tilt), st = Math.sin(tilt); const Y2 = Y * ct - Z * st, Z2 = Y * st + Z * ct; return [ox + X * R, oy - Y2 * R, Z2]; };
    const halo = cx.createRadialGradient(ox, oy, R * .7, ox, oy, R * 1.35); halo.addColorStop(0, "rgba(45,212,191,.10)"); halo.addColorStop(1, "rgba(45,212,191,0)"); cx.fillStyle = halo; cx.beginPath(); cx.arc(ox, oy, R * 1.35, 0, 6.283); cx.fill();
    for (const p of globePts) { const [x, y, z] = proj(p); cx.fillStyle = z > 0 ? `rgba(148,200,240,${.25 + z * .55})` : "rgba(148,200,240,.07)"; cx.fillRect(x, y, z > 0 ? 1.6 : 1.1, z > 0 ? 1.6 : 1.1); }
    const home = v3(19.07, 72.87);
    if ((nextArc -= dt) < 0) { const c = CITIES[1 + Math.floor(Math.random() * (CITIES.length - 1))]; arcs.push({ to: v3(c[1], c[2]), t: 0, rgb: Math.random() < .25 ? GOLD : TEAL, back: Math.random() < .5 }); nextArc = 520 - surge * 400; }
    arcs = arcs.filter((a) => {
      a.t += dt * .00045 * (1 + surge);
      if (a.t > 1.6) return false;
      const A = a.back ? a.to : home, B = a.back ? home : a.to, dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2], om = Math.acos(Math.min(1, dot)), sn = Math.sin(om) || 1e-6;
      const at = (u) => { const k1 = Math.sin((1 - u) * om) / sn, k2 = Math.sin(u * om) / sn, h = 1 + Math.sin(u * Math.PI) * om * .22; return proj([(A[0] * k1 + B[0] * k2) * h, (A[1] * k1 + B[1] * k2) * h, (A[2] * k1 + B[2] * k2) * h]); };
      const head = Math.min(1, a.t), tail = Math.max(0, a.t - .45), fade = a.t > 1 ? 1 - (a.t - 1) / .6 : 1;
      cx.lineWidth = 1.6; cx.beginPath(); let started = false;
      for (let u = tail; u <= head + 1e-6; u += .02) { const [x, y, z] = at(u); if (z < -.15) { started = false; continue; } started ? cx.lineTo(x, y) : cx.moveTo(x, y); started = true; }
      cx.strokeStyle = `rgba(${a.rgb},${.75 * fade})`; cx.stroke();
      const [hx, hy, hz] = at(head); if (hz > -.15 && a.t <= 1) glow(hx, hy, 2.2, a.rgb);
      return true;
    });
    for (const [n, la, lo] of CITIES) { const [x, y, z] = proj(v3(la, lo)); if (z < .05) continue; const isHome = n === "Mumbai"; glow(x, y, isHome ? 3.2 + Math.sin(T * .004) * .8 : 1.8, isHome ? GOLD : SKY, isHome ? 1 : .7); cx.font = `${isHome ? 700 : 600} ${isHome ? 11.5 : 10}px Inter, sans-serif`; cx.fillStyle = isHome ? "rgba(253,230,170,.95)" : "rgba(200,220,240,.7)"; cx.fillText(n, x + 8, y - 6); }
  }

  /* ---------- 4. SERVER ROOM: flying down a data-centre aisle ---------- */
  let racks = [], nextSweep = 0, sweep = -1;
  function drawServer(dt) {
    const vx = W * .64, vy = H * .40, F = Math.min(W, H) * .9, X = 2.6, Y1 = -1.7, Y2 = 1.5, DEPTH = 1.15, N = 14;
    if (!racks.length) for (let i = 0; i < N; i++) racks.push({ z: 1 + i * DEPTH, seed: Math.random() * 1000 });
    const speed = (.00045 + surge * .004) * dt;
    const pj = (x, y, z) => [vx + x * F / z, vy + y * F / z];
    cx.strokeStyle = "rgba(94,234,212,.12)"; cx.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { const [a, b] = pj(i * .5, Y2, .6), [c, d] = pj(i * .5, Y2, 30); cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke(); }
    for (const [x, y] of [[-X * .5, Y1], [X * .5, Y1]]) { const [a, b] = pj(x, y, .6), [c, d] = pj(x, y, 30); cx.strokeStyle = "rgba(124,196,255,.18)"; cx.beginPath(); cx.moveTo(a, b); cx.lineTo(c, d); cx.stroke(); }
    if ((nextSweep -= dt) < 0) { sweep = 16; nextSweep = 3200; }
    if (sweep > 0) sweep -= dt * .012 * (1 + surge * 2);
    racks.sort((a, b) => b.z - a.z);
    for (const r of racks) {
      r.z -= speed; if (r.z < .45) { r.z += N * DEPTH; r.seed = Math.random() * 1000; }
      const fog = Math.max(0, Math.min(1, (16 - r.z) / 14));
      for (const side of [-1, 1]) {
        const x = side * X, z1 = r.z, z2 = r.z + DEPTH * .92;
        const a = pj(x, Y1, z1), b = pj(x, Y1, z2), c = pj(x, Y2, z2), d = pj(x, Y2, z1);
        cx.fillStyle = `rgba(13,24,42,${.92 * fog})`; cx.strokeStyle = `rgba(124,196,255,${.4 * fog})`; cx.lineWidth = 1;
        cx.beginPath(); cx.moveTo(...a); cx.lineTo(...b); cx.lineTo(...c); cx.lineTo(...d); cx.closePath(); cx.fill(); cx.stroke();
        const rows = 14, cols = 5;
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
          const zz = z1 + (j + .5) / cols * (z2 - z1), yy = Y1 + .2 + (i + .5) / rows * (Y2 - Y1 - .4), [lx, ly] = pj(x * .985, yy, zz);
          const h = Math.sin(r.seed + i * 12.9 + j * 78.2 + T * .004 * (1 + (i * j) % 3)), near = Math.abs(r.z - sweep) < 1.2;
          const rgb = near ? GREEN : (i * 7 + j * 3 + Math.floor(r.seed)) % 11 === 0 ? GOLD : (h > .2 ? TEAL : SKY);
          const al = (near ? 1 : h > .2 ? .95 : .3) * fog, sz = Math.max(1.3, 7 / zz);
          cx.fillStyle = `rgba(${rgb},${al})`; cx.fillRect(lx - sz / 2, ly - sz / 2, sz * 1.8, sz);
        }
      }
    }
    const g = cx.createRadialGradient(vx, vy, 0, vx, vy, Math.min(W, H) * .5); g.addColorStop(0, "rgba(124,196,255,.20)"); g.addColorStop(1, "rgba(124,196,255,0)"); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  }

  /* ---------- 5. SECURITY RADAR: scanning the network, catching threats ---------- */
  const BLIPS = [["Laptop-12", .55, .35], ["Server-02", 1.6, .62], ["CCTV-07", 2.5, .8], ["Printer-03", 3.4, .45], ["NAS-01", 4.3, .7], ["Wi-Fi AP", 5.2, .3], ["Desktop-31", 5.9, .55]];
  let threats = [], nextThreatR = 1500, secured = 0;
  function drawRadar(dt) {
    const ox = W * .64, oy = H * .40, R = Math.min(W * .3, H * .32), sweepA = (T * .0012 * (1 + surge * 2)) % 6.283;
    cx.strokeStyle = "rgba(94,234,212,.16)"; cx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { cx.beginPath(); cx.arc(ox, oy, R * i / 4, 0, 6.283); cx.stroke(); }
    for (let a = 0; a < 6.283; a += Math.PI / 6) { cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox + Math.cos(a) * R, oy + Math.sin(a) * R); cx.stroke(); }
    for (let k = 0; k < 40; k++) {   // sweep wedge with fading tail
      const a = sweepA - k * .018; cx.fillStyle = `rgba(45,212,191,${(1 - k / 40) * .18})`;
      cx.beginPath(); cx.moveTo(ox, oy); cx.arc(ox, oy, R, a - .02, a); cx.closePath(); cx.fill();
    }
    cx.strokeStyle = "rgba(94,234,212,.85)"; cx.lineWidth = 1.6; cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox + Math.cos(sweepA) * R, oy + Math.sin(sweepA) * R); cx.stroke();
    const since = (a) => { const d = (sweepA - a + 6.283 * 4) % 6.283; return d; };
    cx.font = "600 10px Inter, sans-serif";
    for (const [n, a, r] of BLIPS) {
      const x = ox + Math.cos(a) * R * r, y = oy + Math.sin(a) * R * r, f = Math.max(0, 1 - since(a) / 4);
      glow(x, y, 1.8 + f * 1.6, TEAL, .35 + f * .6); cx.fillStyle = `rgba(200,225,245,${.35 + f * .55})`; cx.fillText(n, x + 7, y - 5);
    }
    if ((nextThreatR -= dt) < 0) { threats.push({ a: Math.random() * 6.283, r: .3 + Math.random() * .6, born: T, state: "threat" }); nextThreatR = 2600 + Math.random() * 1800; }
    threats = threats.filter((th) => {
      const x = ox + Math.cos(th.a) * R * th.r, y = oy + Math.sin(th.a) * R * th.r, age = T - th.born;
      if (th.state === "threat" && age > 600 && since(th.a) < .15) { th.state = "secured"; th.sec = T; secured++; }
      if (th.state === "threat") { const p = .5 + .5 * Math.sin(T * .015); glow(x, y, 2.6 + p * 1.6, RED, .95); cx.strokeStyle = `rgba(248,113,113,${.4 + p * .4})`; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(x, y, 12 + p * 5, 0, 6.283); cx.stroke(); cx.fillStyle = "rgba(252,165,165,.95)"; cx.fillText("THREAT", x + 10, y - 12); return true; }
      const s2 = (T - th.sec) / 1600; if (s2 > 1) return false;
      glow(x, y, 2.6, GREEN, 1 - s2); cx.strokeStyle = `rgba(74,222,128,${1 - s2})`; cx.beginPath(); cx.arc(x, y, 8 + s2 * 26, 0, 6.283); cx.stroke();
      cx.fillStyle = `rgba(134,239,172,${1 - s2})`; cx.fillText("SECURED", x + 10, y - 12); return true;
    });
    glow(ox, oy, 3, TEAL);
    cx.font = "600 11px Inter, sans-serif"; cx.fillStyle = "rgba(190,220,240,.75)";
    cx.textAlign = "center"; cx.fillText(`Scanning network · ${BLIPS.length} devices · ${secured} threats secured`, ox, oy - R - 12); cx.textAlign = "left";
  }

  /* ---------- 6. EXPLODED LAPTOP: hardware opens up part by part, then snaps back ---------- */
  function box(cxp, cyp, czp, w, h, d) { const x = [cxp - w / 2, cxp + w / 2], y = [cyp - h / 2, cyp + h / 2], z = [czp - d / 2, czp + d / 2]; const v = []; for (const a of x) for (const b of y) for (const c of z) v.push([a, b, c]); return v; }
  const BOX_E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  function drawLaptop(dt) {
    const ox = W * .62, oy = H * .27, S = Math.min(W * .26, H * .34), ry = T * .00035, rx = -.45;
    let e = (Math.sin(T * .0007) + 1) / 2; e = e * e * (3 - 2 * e); e = Math.min(1, e + surge * .8);
    const proj = ([x, y, z]) => { let X = x * Math.cos(ry) + z * Math.sin(ry), Z = -x * Math.sin(ry) + z * Math.cos(ry); let Y = y * Math.cos(rx) - Z * Math.sin(rx); Z = y * Math.sin(rx) + Z * Math.cos(rx); const p = 3.2 / (3.2 + Z); return [ox + X * S * p, oy + Y * S * p, Z]; };
    const parts = [
      ["Keyboard deck", box(0, 0, 0, 1.6, .06, 1.05), TEAL],
      ["Motherboard", box(0, .07 + e * .22, -.05, 1.35, .03, .8), GOLD],
      ["SSD", box(.42, .1 + e * .42, .18, .32, .02, .14), SKY],
      ["Battery", box(-.25, .12 + e * .6, .22, .8, .05, .3), GREEN],
      ["Bottom case", box(0, .16 + e * .8, 0, 1.6, .05, 1.05), TEAL],
    ];
    const hinge = -.52, ang = 1.83;   // screen opened ~105° from the deck
    const scr = []; for (const x of [-.8, .8]) for (const sv of [0, 1]) for (const t of [-.02, .02]) scr.push([x, -.03 - sv * Math.sin(ang) - e * .1, hinge + sv * Math.cos(ang) + t - e * .18]);
    parts.unshift(["Display", scr, SKY]);
    for (const [name, v, rgb] of parts) {
      const pv = v.map(proj);
      cx.strokeStyle = `rgba(${rgb},.85)`; cx.lineWidth = 1.3; cx.shadowColor = `rgba(${rgb},.6)`; cx.shadowBlur = 8;
      cx.beginPath(); for (const [a, b] of BOX_E) { cx.moveTo(pv[a][0], pv[a][1]); cx.lineTo(pv[b][0], pv[b][1]); } cx.stroke(); cx.shadowBlur = 0;
      if (name === "Motherboard") { for (let i = 0; i < 7; i++) { const t = i / 6, a = proj([-.6 + t * 1.2, v[0][1] + .015, -.35]), b = proj([-.6 + t * 1.2, v[0][1] + .015, .3]); cx.strokeStyle = "rgba(251,191,36,.25)"; cx.beginPath(); cx.moveTo(a[0], a[1]); cx.lineTo(b[0], b[1]); cx.stroke(); } }
      if (name === "Display") { const c = pv.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8], [0, 0]); cx.fillStyle = "rgba(124,196,255,.06)"; cx.beginPath(); cx.moveTo(pv[0][0], pv[0][1]); cx.lineTo(pv[2][0], pv[2][1]); cx.lineTo(pv[6][0], pv[6][1]); cx.lineTo(pv[4][0], pv[4][1]); cx.fill(); cx.font = "700 12px Inter, sans-serif"; cx.textAlign = "center"; cx.fillStyle = "rgba(200,228,250,.75)"; cx.fillText("GENESIS NOVA", c[0], c[1]); cx.textAlign = "left"; }
      if (e > .45 && name !== "Display") { const p = proj([.95, v[0][1], 0]); cx.font = "600 10.5px Inter, sans-serif"; cx.fillStyle = `rgba(${rgb},${(e - .45) * 1.8})`; cx.fillText(name, p[0] + 6, p[1] + 3); cx.strokeStyle = `rgba(${rgb},${(e - .45)})`; cx.beginPath(); const q = proj([.8, v[0][1], 0]); cx.moveTo(q[0], q[1]); cx.lineTo(p[0] + 2, p[1]); cx.stroke(); }
    }
    cx.font = "600 11px Inter, sans-serif"; cx.fillStyle = "rgba(190,220,240,.6)"; cx.fillText(e > .5 ? "Diagnose · Repair · Upgrade" : "All-brand laptop service & AMC", ox - S * .6, oy + S * .95);
  }

  /* ---------- 7. HEX MESH: a smart grid lighting up in waves ---------- */
  let waves = [], nextWave = 0;
  function drawHex(dt) {
    const r = Math.max(16, Math.min(W, H) / 22), hw = Math.sqrt(3) * r, vh = 1.5 * r;
    if ((nextWave -= dt) < 0) { waves.push({ x: Math.random() * W, y: Math.random() * H * .7, t: 0, rgb: Math.random() < .25 ? GOLD : TEAL }); nextWave = 1400; }
    waves = waves.filter((w) => (w.t += dt) < 4200);
    cx.lineWidth = 1.2;
    for (let row = -1, y = 0; y < H + r; row++, y = row * vh) for (let col = -1; col * hw < W + hw; col++) {
      const x = col * hw + (row % 2 ? hw / 2 : 0);
      let b = 0, rgb = TEAL;
      for (const w of waves) { const d = Math.hypot(x - w.x, y - w.y), front = w.t * .32, k = Math.max(0, 1 - Math.abs(d - front) / (r * 2.2)) * (1 - w.t / 4200); if (k > b) { b = k; rgb = w.rgb; } }
      const tw = .5 + .5 * Math.sin(T * .0015 + col * 1.7 + row * 2.3);
      cx.strokeStyle = `rgba(${rgb},${.06 + b * .75 + tw * .03})`;
      cx.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3, px = x + Math.cos(a) * r * .94, py = y + Math.sin(a) * r * .94; i ? cx.lineTo(px, py) : cx.moveTo(px, py); } cx.closePath(); cx.stroke();
      if (b > .35) { cx.fillStyle = `rgba(${rgb},${b * .14})`; cx.fill(); }
      if ((col * 7 + row * 13) % 17 === 0) glow(x, y, 1.4 + b * 2, rgb, .25 + b * .7);
    }
  }

  /* ---------- 8. FIBER OPTIC: light racing through bundled fibre cables ---------- */
  let photons = [], nextPh = 0;
  function fiberPath(i, n) {
    const k = i / (n - 1), x0 = -20, y0 = H * (.06 + k * .4), x3 = W * .9, y3 = H * .3, wob = Math.sin(T * .0006 + i) * 14;
    return [[x0, y0], [W * .35, y0 + H * .12 + wob], [W * .6, y3 + (k - .5) * H * .3 - wob], [x3, y3 + (k - .5) * 10]];
  }
  const bz = (p, t) => { const u = 1 - t; return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]]; };
  function drawFiber(dt) {
    const n = 16, cols = [TEAL, SKY, TEAL, GOLD, TEAL, SKY, "167,139,250"];
    for (let i = 0; i < n; i++) { const p = fiberPath(i, n); cx.strokeStyle = "rgba(124,196,255,.10)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(...p[0]); cx.bezierCurveTo(...p[1], ...p[2], ...p[3]); cx.stroke(); }
    if ((nextPh -= dt) < 0) { const c = 1 + Math.floor(surge * 6); for (let j = 0; j < c; j++) { const i = Math.floor(Math.random() * n); photons.push({ i, t: 0, sp: .00028 + Math.random() * .00025, rgb: cols[i % cols.length] }); } nextPh = 110; }
    cx.lineCap = "round";
    photons = photons.filter((ph) => {
      ph.t += ph.sp * dt * (1 + surge * 2); if (ph.t > 1.08) return false;
      const p = fiberPath(ph.i, n);
      for (let k = 0; k < 14; k++) { const t1 = ph.t - k * .012, t2 = t1 - .012; if (t1 < 0 || t1 > 1) continue; const a = bz(p, t1), b = bz(p, Math.max(0, t2)); cx.strokeStyle = `rgba(${ph.rgb},${(1 - k / 14) * .9})`; cx.lineWidth = 2.6 - k * .12; cx.beginPath(); cx.moveTo(...a); cx.lineTo(...b); cx.stroke(); }
      if (ph.t <= 1) { const h = bz(p, ph.t); glow(h[0], h[1], 1.8, ph.rgb); }
      return true;
    });
    const end = [W * .9, H * .3], pulse = .5 + .5 * Math.sin(T * .004) + surge;
    cx.fillStyle = "rgba(14,26,46,.95)"; rr(end[0] - 16, end[1] - 26, 52, 52, 10); cx.fill(); cx.strokeStyle = `rgba(94,234,212,${.5 + pulse * .3})`; cx.lineWidth = 1.5; cx.stroke();
    glow(end[0] - 4, end[1], 3 + pulse * 1.5, TEAL);
    cx.font = "600 10.5px Inter, sans-serif"; cx.fillStyle = "rgba(200,225,245,.75)"; cx.textAlign = "center"; cx.fillText("10 Gbps", end[0] + 10, end[1] + 40); cx.textAlign = "left";
  }

  const DRAW = { network: drawNetwork, circuit: drawCircuit, globe: drawGlobe, server: drawServer, radar: drawRadar, laptop: drawLaptop, hex: drawHex, fiber: drawFiber };
  function frame(t) {
    const dt = Math.min(50, t - (last || t)); last = t; T += dt;
    cx.clearRect(0, 0, W, H);
    DRAW[mode](dt);
    surge = Math.max(0, surge - dt * .0007);
    if (!reduce && alive) requestAnimationFrame(frame);
  }
  function nova() { surge = 1; if (mode === "network") { for (let i = 0; i < 10; i++) spawnPacket(); } if (mode === "server") sweep = 14; if (mode === "hex") waves.push({ x: W * .64, y: H * .38, t: 0, rgb: GOLD }); if (mode === "radar") nextThreatR = 0; }
  function setMode(m) { mode = m; packets = []; pulses = []; arcs = []; threats = []; waves = []; photons = []; surge = 0; if (reduce) { last = 0; T = 2000; frame(performance.now()); } }
  const onResize = () => { size(); traces = []; racks = []; };
  size(); addEventListener("resize", onResize);
  if (reduce) { T = 2000; frame(performance.now()); } else requestAnimationFrame(frame);
  return {
    surge: () => nova(),
    setMode,
    stop: () => { alive = false; removeEventListener("resize", onResize); },
  };
}
