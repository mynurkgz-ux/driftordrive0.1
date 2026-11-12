// Реалистичные 3D-машины (three.js): модель с обвесами и винилом, сцены «дрифт», «гонка по снегу», «гараж»,
// а также рендер вида сверху для игры и превью для списка машин.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const C3 = { ready: false };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const low = () => SAVE.s().quality === 'low';

// ---------- рендереры ----------
const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
R.outputColorSpace = THREE.SRGBColorSpace;
R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
R.domElement.className = 'car3d-canvas';
const envTex = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;

const SR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
SR.outputColorSpace = THREE.SRGBColorSpace; SR.toneMapping = THREE.ACESFilmicToneMapping; SR.toneMappingExposure = 0.85; SR.setPixelRatio(1);
const srEnv = new THREE.PMREMGenerator(SR).fromScene(new RoomEnvironment(), 0.04).texture;
const spriteScene = new THREE.Scene(); spriteScene.environment = srEnv;
spriteScene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 0.7));
const sDir = new THREE.DirectionalLight(0xffffff, 1.3); sDir.position.set(2, 8, 3); spriteScene.add(sDir);

// ---------- текстуры ----------
function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const noise = (g, s, n, cols, rmin, rmax) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; const r = rnd(rmin, rmax); g.fillRect(Math.random() * s, Math.random() * s, r, r); } };
const carbonTex = canvasTex(64, (g) => { for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { g.fillStyle = ((x + y) / 8) % 2 ? '#2a2c31' : '#131417'; g.fillRect(x, y, 8, 8); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y, 8, 2); } }, [6, 6]);
const smokeTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 14; i++) {
    const x = s / 2 + rnd(-22, 22), y = s / 2 + rnd(-22, 22), r = rnd(22, 46);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
});
const glowTex = canvasTex(64, (g, s) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
const shadowTex = canvasTex(128, (g, s) => { const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });

// ---------- общие материалы ----------
const std = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color }, o || {}));
const M = {
  dark: std(0x101114, { roughness: 0.55, metalness: 0.2 }),
  black: std(0x050505, { roughness: 0.95 }),
  rubber: std(0x141414, { roughness: 0.9 }),
  tyre: std(0x151515, { roughness: 0.88, side: THREE.DoubleSide }),
  barrel: std(0x3a3d42, { metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x18222d, metalness: 0.1, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6, side: THREE.DoubleSide }),
  chrome: std(0xe6e6e6, { metalness: 1, roughness: 0.12 }),
  carbon: std(0xffffff, { map: carbonTex, roughness: 0.32, metalness: 0.35 }),
  disc: std(0x8a8d92, { metalness: 0.85, roughness: 0.35 }),
  caliper: std(0xc81e1e, { roughness: 0.4, metalness: 0.2 }),
  grille: std(0x0b0b0d, { roughness: 0.4, metalness: 0.5 }),
  wood: std(0xa8743a, { roughness: 0.85 }),
};
const SHARED = new Set(Object.values(M));
const FIN = { gloss: { m: 0.15, r: 0.3, cc: 1 }, metal: { m: 0.7, r: 0.3, cc: 1 }, matte: { m: 0.05, r: 0.72, cc: 0 }, pearl: { m: 0.4, r: 0.26, cc: 1 }, chrome: { m: 1, r: 0.06, cc: 0.6 } };

// ---------- модель машины ----------
function paintTexture(look, g, H, belt) {
  const p = look.paint || {};
  const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d');
  x.fillStyle = p.body || '#d33'; x.fillRect(0, 0, 1024, 1024);
  // вид сверху (верхняя половина атласа)
  x.save(); x.beginPath(); x.rect(0, 0, 1024, 512); x.clip();
  x.translate(0, 512); x.scale(1024 / g.L, -512 / g.W); x.translate(g.hl, g.hw);
  CARR.drawVinyl(x, g, p);
  x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 0.012; x.beginPath();
  x.moveTo(g.cf + 0.03, -g.hw * 0.74); x.lineTo(g.hl - 0.12, -g.hw * 0.66); x.moveTo(g.cf + 0.03, g.hw * 0.74); x.lineTo(g.hl - 0.12, g.hw * 0.66);
  const tb = g.re - g.rw - 0.03; x.moveTo(tb, -g.hw * 0.8); x.lineTo(tb, g.hw * 0.8); x.stroke();
  x.restore();
  // вид сбоку (нижняя половина)
  x.save(); x.beginPath(); x.rect(0, 512, 1024, 512); x.clip();
  x.translate(0, 1024); x.scale(1024 / g.L, -512 / H); x.translate(g.hl, H * 0.45); x.scale(1, H * 0.8 / g.W);
  CARR.drawVinyl(x, g, p); x.restore();
  const px = X => (X + g.hl) / g.L * 1024, py = h => 1024 - h / H * 512;
  x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2.5;
  const doors = [g.cf - 0.04, g.re + 0.04]; if (['sedan', 'wagon', 'suv', 'hatch', 'rally'].includes(g.type)) doors.push((g.cf + g.re) / 2 - 0.05);
  for (const X of doors) { x.beginPath(); x.moveTo(px(X), py(0.3)); x.lineTo(px(X), py(belt - 0.01)); x.stroke(); }
  x.beginPath(); x.moveTo(px(g.cf - 0.04), py(0.3)); x.lineTo(px(g.re + 0.04), py(0.3)); x.stroke();
  x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(px(g.cf - 0.42), py(belt - 0.1), 26, 6); if (doors.length > 2) x.fillRect(px(doors[2] - 0.38), py(belt - 0.1), 26, 6);
  x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(0, py(belt - 0.04), 1024, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
// UV: верхние грани → вид сверху, остальные → вид сбоку; затем сглаживание нормалей
function finishGeo(geo, g, H) {
  const pos = geo.attributes.position, n = pos.count, uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    e1.subVectors(c, b); e2.subVectors(a, b); e1.cross(e2).normalize();
    const top = e1.y > 0.5;
    for (let k = 0; k < 3; k++) {
      const vx = pos.getX(i + k), vy = pos.getY(i + k), vz = pos.getZ(i + k);
      uv[(i + k) * 2] = clamp((vx + g.hl) / g.L, 0, 1);
      uv[(i + k) * 2 + 1] = top ? 0.5 + clamp((vz + g.hw) / g.W, 0, 1) * 0.5 : clamp(vy / H, 0, 1) * 0.5;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.deleteAttribute('normal');
  const m = mergeVertices(geo, 1e-4); m.computeVertexNormals(); geo.dispose(); return m;
}

function buildCar(look, o) {
  o = o || {};
  const g = CARR.geom(look), T = g.T, k = look.kit || {}, p = look.paint || {};
  const [H, hoodH, deckH] = T.side; const { L, W, hl, hw } = g;
  const gc = T.gc || 0.16, wr = T.wr || 0.33, ar = wr + 0.075 + (g.fl ? 0.02 : 0);
  const cf = g.cf, x1 = g.cf - g.ws, x2 = g.re, x3 = Math.max(g.re - g.rw, -hl + 0.3);
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const own = [];
  const mesh = (geo, mat, parent, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; (parent || body).add(m); own.push(geo); return m; };
  const box = (w, h, d, mat, x, y, z, parent) => mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
  const cyl = (r, h, mat, x, y, z, axis, parent, seg) => { const geo = new THREE.CylinderGeometry(r, r, h, seg || 20); if (axis === 'x') geo.rotateZ(Math.PI / 2); if (axis === 'z') geo.rotateX(Math.PI / 2); return mesh(geo, mat, parent, x, y, z); };
  const beam = (a, b, r, mat) => { const d = new THREE.Vector3().subVectors(b, a); const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; };

  // краска
  const belt = Math.max(hoodH, Math.min(deckH, hoodH + 0.15));
  const tex = paintTexture(look, g, H, belt);
  const fin = FIN[p.finish] || FIN.gloss;
  const paint = new THREE.MeshPhysicalMaterial({ map: tex, metalness: fin.m, roughness: fin.r, clearcoat: fin.cc, clearcoatRoughness: 0.06, envMapIntensity: o.envI || 1 });
  if (p.finish === 'pearl') { paint.iridescence = 0.8; paint.iridescenceIOR = 1.5; }
  const plain = paint.clone(); plain.map = null; plain.color.set(p.body || '#d33');
  const lightCol = new THREE.Color(p.light || '#fff6d5');
  const headMat = std(0xffffff, { color: lightCol, emissive: lightCol, emissiveIntensity: o.lights ? 3 : 0.35, roughness: 0.1, metalness: 0.3 });
  const tailMat = std(0x7a0010, { emissive: 0xff1020, emissiveIntensity: 0.6, roughness: 0.25 });
  const wheelMat = std(new THREE.Color(p.wheel || '#c8ccd2'), { metalness: 0.9, roughness: 0.25 });
  const drlMat = std(0xffffff, { emissive: lightCol, emissiveIntensity: 2 }), plateMat = std(0xeeeeee, { roughness: 0.5 });
  const extraMats = [paint, plain, headMat, tailMat, wheelMat, drlMat, plateMat]; const extraTex = [tex];

  // ---------- кузов: лофт по поперечным сечениям ----------
  // нижняя часть (до линии окон) с настоящими арками колёс, затем «тепличка» салона со стойками и стёклами
  const noseZ = 0.22 + g.nose * 0.35, tailZ = 0.16 + g.tail * 0.3, hoodF = hoodH * 0.9;
  const beltY = x => {
    if (x >= cf) { const t = clamp((x - cf) / (hl - cf), 0, 1); return lerp(hoodH, hoodF, t * t); }
    if (x >= x3) return lerp(deckH, hoodH, (x - x3) / Math.max(0.01, cf - x3));
    const t = clamp((x3 - x) / Math.max(0.01, x3 + hl), 0, 1); return lerp(deckH, deckH * 0.975, t * t);
  };
  const archY = x => { let y = -1; for (const xw of [g.xF, g.xR]) { const d = Math.abs(x - xw); if (d < ar) y = Math.max(y, wr + Math.sqrt(ar * ar - d * d)); } return y; };
  const bulge = x => { let y = -1; for (const xw of [g.xF, g.xR]) { const d = Math.abs(x - xw), R = ar + 0.3; if (d < R) y = Math.max(y, wr + (ar + 0.06) * Math.sqrt(1 - (d / R) * (d / R))); } return y; };
  function section(x) {
    let w = hw * (1 - 0.035 * Math.pow(Math.max(0, x / hl), 2)), yT = beltY(x), yB = gc;
    const fo = g.xF + ar, ro = g.xR - ar;
    if (x > fo) yB += 0.07 * Math.pow((x - fo) / (hl - fo), 1.5);
    if (x < ro) yB += 0.09 * Math.pow((ro - x) / (ro + hl), 1.5);
    if (x > hl - noseZ) { const u = (x - (hl - noseZ)) / noseZ, e = 1 - Math.sqrt(Math.max(0, 1 - u * u)); w *= 1 - e * (0.05 + g.nose * 0.3); yT -= e * (0.05 + g.nose * 0.12); yB += e * 0.06; }
    if (x < -hl + tailZ) { const u = (-hl + tailZ - x) / tailZ, e = 1 - Math.sqrt(Math.max(0, 1 - u * u)); w *= 1 - e * (0.04 + g.tail * 0.3); yT -= e * (0.03 + g.tail * 0.1); yB += e * 0.05; }
    const yTo = Math.max(yT, bulge(x));
    const ya = archY(x); if (ya > 0) yB = Math.max(yB, Math.min(ya, yTo - 0.07));
    return { w, yT, yTo, yB };
  }
  const ring = s => {
    const { w, yT, yTo, yB } = s, hh = yTo - yB, cr = 0.025;
    const R = [[0, yB + 0.015], [w * 0.84, yB], [w * 0.965, yB + hh * 0.07], [w, yB + hh * 0.4], [w * 0.992, yB + hh * 0.72], [w * 0.958, yTo - 0.03], [w * 0.885, yTo], [w * 0.7, lerp(yTo, yT + cr, 0.75)], [w * 0.35, yT + cr], [0, yT + cr]];
    const out = R.slice(); for (let i = R.length - 2; i >= 1; i--) out.push([-R[i][0], R[i][1]]);
    return out;
  };
  const tris = { paint: [], glass: [], dark: [] };
  const P3 = (x, q) => [x, q[1], q[0]];
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...a, ...c, ...d);
  const loft = (xs, rings, matOf, closed) => {
    for (let i = 0; i < xs.length - 1; i++) {
      const A = rings[i], B = rings[i + 1], n = A.length, segs = closed ? n : n - 1;
      for (let j = 0; j < segs; j++) { const j2 = (j + 1) % n; quad(tris[matOf(i, j)], P3(xs[i], A[j]), P3(xs[i + 1], B[j]), P3(xs[i + 1], B[j2]), P3(xs[i], A[j2])); }
    }
  };
  const cap = (x, rg, front) => {
    let cy = 0; rg.forEach(q => cy += q[1]); cy /= rg.length; const c = [x, cy, 0];
    for (let j = 0; j < rg.length; j++) { const a = P3(x, rg[j]), b = P3(x, rg[(j + 1) % rg.length]); if (front) tris.paint.push(...c, ...b, ...a); else tris.paint.push(...c, ...a, ...b); }
  };
  const NS = 110, bx = [], br = [];
  for (let i = 0; i < NS; i++) { const x = -hl * Math.cos(Math.PI * i / (NS - 1)); bx.push(x); br.push(ring(section(x))); }
  loft(bx, br, () => 'paint', true);
  cap(bx[0], br[0], false); cap(bx[NS - 1], br[NS - 1], true);

  // салон: крыша плавно переходит в лобовое и заднее стекло
  const roofY = x => {
    if (x >= x1) { const t = (cf - x) / Math.max(0.01, cf - x1); return lerp(beltY(cf), H, 1 - Math.pow(1 - t, 1.8)); }
    if (x >= x2) return H + 0.02 * Math.sin(Math.PI * (x - x2) / Math.max(0.01, x1 - x2));
    const t = (x - x3) / Math.max(0.01, x2 - x3); return lerp(beltY(x3), H, 1 - Math.pow(1 - t, 1.6));
  };
  const roofHalf = W * g.cw / 2;
  const gring = x => {
    const s = section(x), yb = beltY(x) - 0.01, yR = roofY(x), hg = Math.max(0.004, yR - yb), c = clamp(hg / 0.2, 0, 1);
    const wb = s.w * 0.9, wrf = lerp(wb - 0.02, Math.min(wb - 0.06, roofHalf), clamp(hg / 0.25, 0, 1));
    const R = [[wb, yb], [lerp(wb, wrf, 0.62), yb + hg * 0.6], [wrf, yR - Math.min(0.07, hg * 0.25)], [wrf * 0.9, yR - 0.004 * c], [wrf * 0.5, yR + 0.012 * c], [0, yR + 0.016 * c]];
    const out = R.slice(); for (let i = R.length - 2; i >= 0; i--) out.push([-R[i][0], R[i][1]]);
    return out;
  };
  const gx = [];
  const seg = (a, b, n, last) => { for (let i = 0; i < n; i++) gx.push(lerp(a, b, i / n)); if (last) gx.push(b); };
  seg(x3, x2, 12); seg(x2, x1, 16); seg(x1, cf, 16, true);
  const rf = k.roof | 0;
  const bpx = (x1 + x2) / 2 - 0.05;
  const sideRear = ['hatch', 'wagon', 'suv', 'kei'].includes(g.type) ? x3 + 0.12 : g.type === 'pickup' ? x2 + 0.03 : lerp(x3, x2, 0.55);
  loft(gx, gx.map(gring), (i, j) => {
    const xm = (gx[i] + gx[i + 1]) / 2, kind = j <= 4 ? j : 9 - j;
    if (kind >= 3) return (xm > x1 || xm < x2 || rf === 5) ? 'glass' : 'paint';
    if (kind === 2) return 'paint';
    if (Math.abs(xm - bpx) < 0.045 && xm < x1) return 'dark';
    return xm > sideRear && xm < cf - 0.05 ? 'glass' : 'paint';
  }, false);

  const triGeo = arr => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); return geo; };
  mesh(finishGeo(triGeo(tris.paint), g, H), paint);
  if (tris.glass.length) { const gg = mergeVertices(triGeo(tris.glass), 1e-4); gg.computeVertexNormals(); mesh(gg, M.glass).castShadow = false; }
  if (tris.dark.length) { const dg = mergeVertices(triGeo(tris.dark), 1e-4); dg.computeVertexNormals(); mesh(dg, M.dark); }

  const noseK = 1 - g.nose * 0.3, tailK = 1 - g.tail * 0.3;
  const hoodTop = X => beltY(X) + 0.025;
  const deckTop = deckH + 0.025;
  const cw = roofHalf * 2;
  const face = section(hl), faceY = t => lerp(face.yB, face.yT, t);

  // арки изнутри, днище
  for (const x of [g.xF, g.xR]) for (const sd of [-1, 1]) cyl(ar - 0.02, 0.42, M.black, x, wr, sd * (hw - 0.3), 'z');
  box(L * 0.8, 0.05, W - 0.3, M.black, 0, gc + 0.05, 0);

  // крыша (обвес)
  const rl = x1 - x2 - 0.08, rwid = roofHalf * 1.7 - 0.06;
  if (rl > 0.2) {
    const rs = new THREE.Shape(), rr = 0.18; const hx = rl / 2, hz = rwid / 2;
    rs.moveTo(-hx + rr, -hz); rs.lineTo(hx - rr, -hz); rs.quadraticCurveTo(hx, -hz, hx, -hz + rr); rs.lineTo(hx, hz - rr); rs.quadraticCurveTo(hx, hz, hx - rr, hz); rs.lineTo(-hx + rr, hz); rs.quadraticCurveTo(-hx, hz, -hx, hz - rr); rs.lineTo(-hx, -hz + rr); rs.quadraticCurveTo(-hx, -hz, -hx + rr, -hz);
    const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2 });
    rg.rotateX(Math.PI / 2);
    if (rf === 1) mesh(rg, M.carbon, body, (x1 + x2) / 2, H + 0.05, 0); else rg.dispose();
    if (rf === 2) box(0.38, 0.1, 0.34, M.dark, x1 - 0.32, H + 0.07, 0);
    if (rf === 3) { for (const z of [-hz + 0.08, hz - 0.08]) box(rl * 0.9, 0.04, 0.04, M.chrome, (x1 + x2) / 2, H + 0.11, z); for (let x = x2 + 0.15; x < x1 - 0.1; x += 0.32) box(0.04, 0.04, rwid * 0.92, M.chrome, x, H + 0.11, 0); }
    if (rf === 4) box(rl * 0.4, 0.012, rwid * 0.55, M.glass, (x1 + x2) / 2 + 0.05, H + 0.03, 0);
  }
  // кузов пикапа
  if (g.type === 'pickup') { box(x3 + hl - 0.3, 0.05, W - 0.4, M.dark, (x3 - hl) / 2 + 0.05, deckTop - 0.05, 0); box(0.06, 0.12, W - 0.4, M.dark, x3 - 0.05, deckTop + 0.02, 0); }

  // перед: решётка и фары
  const fy = faceY(0.78);
  box(0.04, 0.12, W * 0.36 * noseK, M.grille, hl - 0.005, faceY(0.56), 0);
  box(0.04, 0.1, W * 0.58 * noseK, M.grille, hl - 0.005, faceY(0.22), 0);
  for (const sd of [-1, 1]) box(0.03, 0.05, 0.12, M.grille, hl - 0.01, faceY(0.24), sd * hw * 0.62 * noseK);
  const headPts = [];
  for (const sd of [-1, 1]) {
    const z = sd * hw * 0.62 * (1 - g.nose * 0.22), hx = hl + 0.0;
    headPts.push(new THREE.Vector3(hl + 0.02, fy, z));
    switch (k.head | 0) {
      case 1: box(0.1, 0.22, 0.26, M.dark, hx, fy, z); cyl(0.09, 0.06, headMat, hx + 0.05, fy, z, 'x'); break;
      case 2: box(0.1, 0.07, 0.42, M.dark, hx, fy + 0.04, z); box(0.06, 0.035, 0.38, headMat, hx + 0.04, fy + 0.04, z); break;
      case 3: { const m = box(0.06, 0.09, 0.38, headMat, hx + 0.03, fy + 0.02, z); m.rotation.x = sd * 0.25; box(0.1, 0.14, 0.42, M.dark, hx, fy + 0.02, z).rotation.x = sd * 0.25; break; }
      case 4: if (o.lights) { box(0.18, 0.14, 0.36, M.dark, hx - 0.35, hoodTop(hx - 0.35) + 0.07, z); box(0.03, 0.09, 0.3, headMat, hx - 0.26, hoodTop(hx - 0.35) + 0.08, z); } else box(0.02, 0.06, 0.3, M.dark, hx, fy, z); break;
      case 5: break;
      case 6: box(0.1, 0.18, 0.36, M.dark, hx, fy, z); for (const dz of [-0.09, 0.09]) cyl(0.065, 0.05, headMat, hx + 0.05, fy, z + dz, 'x'); break;
      case 7: box(0.1, 0.17, 0.36, M.dark, hx, fy, z); box(0.04, 0.12, 0.13, headMat, hx + 0.05, fy, z - 0.08); box(0.04, 0.12, 0.13, headMat, hx + 0.05, fy, z + 0.08); break;
      default: { const ry = -sd * 0.35; box(0.05, 0.11, 0.42, M.dark, hx - 0.02, fy, z).rotation.y = ry; box(0.03, 0.08, 0.34, headMat, hx + 0.002, fy + 0.008, z).rotation.y = ry; box(0.02, 0.016, 0.36, drlMat, hx + 0.008, fy - 0.045, z).rotation.y = ry; }
    }
  }
  if ((k.head | 0) === 5) { box(0.06, 0.05, W * 0.72 * noseK, M.dark, hl - 0.05, fy + 0.03, 0); box(0.03, 0.03, W * 0.7 * noseK, headMat, hl - 0.02, fy + 0.03, 0); }
  // фонари
  const tailPts = [];
  const ty = lerp(section(-hl).yB, section(-hl).yT, 0.8);
  for (const sd of [-1, 1]) { const z = sd * hw * 0.62 * tailK; const m = box(0.05, 0.1, 0.42, tailMat, -hl + 0.005, ty, z); m.rotation.y = sd * 0.3; tailPts.push(new THREE.Vector3(-hl - 0.03, ty, z)); }
  box(0.03, 0.025, W * 0.5 * tailK, tailMat, -hl + 0.005, ty, 0);
  // номерные зоны
  box(0.03, 0.12, 0.5, plateMat, -hl - 0.02, gc + 0.38, 0);

  // ---------- обвесы ----------
  const fb = k.fbump | 0;
  if (fb === 1) box(0.26, 0.03, W * 0.9 * noseK, M.dark, hl - 0.04, gc + 0.01, 0);
  if (fb === 2) { box(0.32, 0.035, W * noseK + 0.1, M.dark, hl - 0.02, gc + 0.01, 0); for (const sd of [-1, 1]) box(0.3, 0.12, 0.02, M.dark, hl - 0.25, gc + 0.08, sd * (hw * noseK + 0.06)); }
  if (fb === 3) for (const sd of [-1, 1]) box(0.1, 0.2, 0.32, M.grille, hl - 0.01, gc + 0.2, sd * hw * 0.62 * noseK);
  if (fb === 4) for (const sd of [-1, 1]) for (const dy of [0.16, 0.3]) { const m = box(0.22, 0.02, 0.16, M.carbon, hl - 0.22, gc + dy, sd * (hw * noseK + 0.04)); m.rotation.x = sd * 0.25; }
  if (fb === 5) for (const z of [-0.45, -0.15, 0.15, 0.45]) { cyl(0.085, 0.08, M.dark, hl + 0.02, hoodTop(hl - 0.1) - 0.08, z * W * 0.75, 'x'); cyl(0.065, 0.02, headMat, hl + 0.07, hoodTop(hl - 0.1) - 0.08, z * W * 0.75, 'x'); }
  if (fb === 6) { const y0 = gc + 0.1, y1 = fy + 0.05, xb = hl + 0.14; for (const sd of [-1, 1]) beam(new THREE.Vector3(xb, y0, sd * hw * 0.55), new THREE.Vector3(xb, y1, sd * hw * 0.45), 0.03, M.chrome); beam(new THREE.Vector3(xb, y1, -hw * 0.45), new THREE.Vector3(xb, y1, hw * 0.45), 0.03, M.chrome); beam(new THREE.Vector3(xb, y0 + 0.2, -hw * 0.55), new THREE.Vector3(xb, y0 + 0.2, hw * 0.55), 0.03, M.chrome); }
  if (fb === 7) box(0.16, 0.025, W * 0.86 * noseK, M.carbon, hl, gc + 0.02, 0);
  const rb = k.rbump | 0;
  const tip = (z, r) => { cyl(r, 0.2, M.chrome, -hl - 0.04, gc + 0.07, z, 'x', null, 16); cyl(r * 0.7, 0.21, M.black, -hl - 0.04, gc + 0.07, z, 'x', null, 16); };
  if (rb === 1 || rb === 2) { const d = rb === 2 ? 0.3 : 0.16; box(d, 0.05, W * 0.72 * tailK, M.dark, -hl - d / 2 + 0.12, gc + 0.02, 0); for (let i = -3; i <= 3; i++) box(d, 0.12, 0.012, M.dark, -hl - d / 2 + 0.12, gc + 0.08, i * W * 0.1); }
  if (rb === 0) tip(hw * 0.55 * tailK, 0.04); else if (rb <= 3) { tip(-hw * 0.55 * tailK, 0.05); tip(hw * 0.55 * tailK, 0.05); } else if (rb === 4) { tip(-0.07, 0.055); tip(0.07, 0.055); } else [-0.62, -0.44, 0.44, 0.62].forEach(f => tip(f * hw * tailK, 0.042));
  const sk = k.skirt | 0;
  if (sk) for (const sd of [-1, 1]) box(g.xF - g.xR - 0.9, sk >= 3 ? 0.1 : 0.07, sk >= 3 ? 0.12 : 0.06, sk === 2 ? M.carbon : sk === 4 ? M.dark : plain, (g.xF + g.xR) / 2, gc + 0.03, sd * (hw - 0.01 + (sk >= 3 ? 0.04 : 0)));
  if (g.fl) {
    const ext = [0, 0.05, 0.09, 0.14, 0.12][g.fl];
    for (const x of [g.xF, g.xR]) for (const sd of [-1, 1]) {
      const fs = new THREE.Shape(); fs.absarc(0, 0, ar + ext + 0.04, Math.PI * 0.98, Math.PI * 0.02, true); fs.absarc(0, 0, ar + 0.005, Math.PI * 0.02, Math.PI * 0.98, false);
      const fgeo = new THREE.ExtrudeGeometry(fs, { depth: ext + 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2, curveSegments: 20 });
      if (sd < 0) fgeo.translate(0, 0, -(ext + 0.06));
      mesh(fgeo, plain, body, x, wr, sd * (hw - 0.07));
      if (g.fl === 4) for (let i = 1; i < 8; i++) { const a = i / 8 * Math.PI; const sp = mesh(new THREE.SphereGeometry(0.018, 6, 4), M.chrome, body, x + Math.cos(a) * (ar + 0.01), wr + Math.sin(a) * (ar + 0.01), sd * (hw - 0.03 + ext * 1.2)); sp.castShadow = false; }
    }
  }
  const hd = k.hood | 0, hm = (cf + hl - 0.3) / 2, hlen = hl - 0.3 - cf;
  const onHood = (len, h, wdt, mat, X, z) => { const m = box(len, h, wdt, mat, X, hoodTop(X) + h / 2 - 0.01, z || 0); return m; };
  if (hd === 1) onHood(hlen * 0.32, 0.08, 0.36, M.dark, hm);
  if (hd === 2) onHood(hlen * 0.95, 0.015, W * 0.72, M.carbon, hm + 0.05);
  if (hd === 3) for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) onHood(0.05, 0.02, 0.22, M.black, hm - 0.2 + i * 0.12, sd * hw * 0.42);
  if (hd === 4) { onHood(0.6, 0.2, 0.5, M.dark, cf + 0.45); onHood(0.5, 0.22, 0.42, M.chrome, cf + 0.45); }
  if (hd === 5) for (let i = 0; i < 6; i++) onHood(0.04, 0.02, W * 0.4, M.black, hm - 0.25 + i * 0.1);
  if (hd === 6) for (const sd of [-1, 1]) onHood(hlen * 0.95, 0.015, 0.2, M.carbon, hm + 0.05, sd * 0.25);
  if (hd === 7) { const m = onHood(hlen * 0.7, 0.06, W * 0.38, plain, hm); m.scale.set(1, 1, 1); }
  const mr = k.mirror | 0;
  for (const sd of [-1, 1]) {
    const mx = cf - 0.14, my = hoodH + 0.1, mz = sd * (cw / 2 + 0.1);
    if (mr === 0) { const m = box(0.09, 0.08, 0.15, plain, mx, my, mz); m.rotation.y = sd * 0.2; box(0.06, 0.03, 0.08, plain, mx + 0.02, my - 0.04, mz - sd * 0.08); }
    else if (mr === 1) { box(0.03, 0.12, 0.03, M.dark, mx + 0.2, my - 0.06, mz - sd * 0.04); box(0.07, 0.06, 0.13, M.dark, mx + 0.2, my + 0.02, mz); }
    else if (mr === 2) box(0.1, 0.1, 0.17, M.carbon, mx, my, mz);
    else { const m = box(0.18, 0.06, 0.15, plain, mx, my, mz); m.rotation.y = sd * 0.3; }
  }
  // спойлер
  const sp = k.spoiler | 0;
  const wing = (chord, span, up, x, mat, plate, strutMat) => {
    box(chord, 0.035, span, mat, x, deckTop + up, 0);
    if (plate) for (const sd of [-1, 1]) box(chord + 0.1, plate, 0.025, M.dark, x, deckTop + up + 0.02, sd * span / 2);
    for (const sd of [-1, 1]) box(0.05, up, 0.03, strutMat || M.dark, x + chord * 0.15, deckTop + up / 2, sd * span * 0.3);
  };
  if (sp === 1) box(0.08, 0.035, W * 0.8 * tailK, plain, -hl + 0.12, deckTop, 0);
  if (sp === 2) { const m = box(0.3, 0.07, W * 0.84 * tailK, plain, -hl + 0.12, deckTop + 0.01, 0); m.rotation.z = 0.25; }
  if (sp === 3) wing(0.3, W * 0.95, 0.3, -hl + 0.22, M.dark, 0.2);
  if (sp === 4) wing(0.3, W * 0.97, 0.34, -hl + 0.2, plain, 0.16);
  if (sp === 5) { wing(0.18, W * 0.92, 0.38, -hl + 0.24, M.dark, 0.26); box(0.18, 0.03, W * 0.92, M.dark, -hl + 0.1, deckTop + 0.26, 0); }
  if (sp === 6) wing(0.34, W + 0.05, 0.3, -hl + 0.22, plain, 0.22);
  if (sp === 7) wing(0.32, W + 0.24, 0.32, -hl + 0.2, M.dark, 0.3);
  if (sp === 8) wing(0.16, W * 0.6, 0.12, -hl + 0.2, plain, 0);
  if (sp === 9) wing(0.46, W + 0.18, 0.46, -hl + 0.12, M.carbon, 0.36);

  // неон
  if (p.neon && !o.noNeon) {
    const ng = new THREE.PlaneGeometry(L + 1.4, W + 1.4); ng.rotateX(-Math.PI / 2);
    const nm = new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(p.neon), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
    const n = new THREE.Mesh(ng, nm); n.position.y = 0.02; root.add(n); own.push(ng); extraMats.push(nm);
  }
  // контактная тень
  if (!o.noShadow) {
    const sg = new THREE.PlaneGeometry(L * 1.25, W * 1.45); sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 });
    const sh = new THREE.Mesh(sg, sm); sh.position.y = 0.012; sh.renderOrder = -1; root.add(sh); own.push(sg); extraMats.push(sm);
  }

  // колёса: шина с профилем боковины, диск со спицами, суппорт и тормозной диск
  const wheels = [];
  if (!o.noWheels) {
    const tw = 0.235 + g.fl * 0.02, zw = hw - 0.13 + g.fl * 0.04;
    const big = ['super', 'hyper', 'gt', 'muscle'].includes(g.type), rimR = wr * (big ? 0.72 : g.type === 'suv' || g.type === 'pickup' ? 0.6 : 0.67);
    const tp = [[rimR + 0.004, -tw / 2 + 0.03], [wr - 0.04, -tw / 2], [wr - 0.01, -tw / 2 + 0.022], [wr, -tw / 2 + 0.06], [wr, tw / 2 - 0.06], [wr - 0.01, tw / 2 - 0.022], [wr - 0.04, tw / 2], [rimR + 0.004, tw / 2 - 0.03]].map(([r, y]) => new THREE.Vector2(r, y));
    const nsp = g.type === 'super' || g.type === 'hyper' ? 10 : g.type === 'suv' || g.type === 'pickup' || g.type === 'rally' ? 6 : g.type === 'muscle' ? 5 : 7;
    for (const [x, front] of [[g.xF, true], [g.xR, false]]) for (const sd of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(x, wr, sd * zw); root.add(piv);
      const side = new THREE.Group(); side.scale.z = sd; piv.add(side);
      const spin = new THREE.Group(); side.add(spin);
      const tyre = new THREE.LatheGeometry(tp, 40); tyre.rotateX(Math.PI / 2); mesh(tyre, M.tyre, spin);
      const barrel = new THREE.CylinderGeometry(rimR, rimR, tw - 0.05, 32, 1, true); barrel.rotateX(Math.PI / 2); mesh(barrel, M.barrel, spin);
      cyl(rimR - 0.01, 0.01, M.dark, 0, 0, -tw / 2 + 0.05, 'z', spin, 28);
      const lip = new THREE.TorusGeometry(rimR - 0.004, 0.012, 6, 40); mesh(lip, wheelMat, spin, 0, 0, tw / 2 - 0.028);
      const fz = tw / 2 - 0.045;
      for (let i = 0; i < nsp; i++) {
        const sw = nsp >= 10 ? 0.028 : nsp === 5 ? 0.07 : 0.05, ln = rimR - 0.05;
        const sg = new THREE.BoxGeometry(ln, sw, 0.03); sg.translate(ln / 2 + 0.045, 0, 0);
        const m = mesh(sg, wheelMat, spin, 0, 0, fz); m.rotation.z = i * Math.PI * 2 / nsp + (nsp >= 10 ? (i % 2) * 0.12 : 0); m.rotation.y = -0.12;
      }
      cyl(0.065, 0.045, wheelMat, 0, 0, fz + 0.005, 'z', spin, 18);
      cyl(0.03, 0.05, M.dark, 0, 0, fz + 0.01, 'z', spin, 12);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; cyl(0.011, 0.05, M.chrome, Math.cos(a) * 0.045, Math.sin(a) * 0.045, fz + 0.01, 'z', spin, 6); }
      cyl(rimR * 0.82, 0.022, M.disc, 0, 0, fz - 0.06, 'z', side, 28);
      box(0.15, 0.08, 0.05, M.caliper, rimR * 0.62, 0, fz - 0.035, side).rotation.z = 0.5;
      wheels.push({ piv, spin, front, sd });
    }
  }
  root.traverse(m => { if (m.isMesh && m.material !== M.glass) { m.castShadow = !o.noCast; } });
  return {
    root, body, wheels, headPts, tailPts, g, H, wr, xR: g.xR, zw: hw - 0.13,
    setBrake(b) { tailMat.emissiveIntensity = b ? 2.5 : 0.6; },
    dispose() { own.forEach(x => x.dispose()); extraMats.forEach(x => x.dispose()); extraTex.forEach(x => x.dispose()); }
  };
}
const lookKey = l => l.car + JSON.stringify(l.kit) + JSON.stringify(l.paint);

// ---------- частицы (дым, снег) ----------
const PV = 'attribute float size; attribute float alpha; uniform float uScale; varying float vA; void main(){ vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=min(size*uScale/-mv.z, 900.0); gl_Position=projectionMatrix*mv; }';
const PF = 'uniform sampler2D map; uniform vec3 color; uniform vec3 shade; varying float vA; void main(){ vec4 t=texture2D(map, gl_PointCoord); vec3 c=mix(shade, color, smoothstep(0.0,0.9,1.0-gl_PointCoord.y*0.7)); gl_FragColor=vec4(c, t.a*vA); }';
class Puffs {
  constructor(max, color, shade) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos); this.geo.setAttribute('size', this.aSize); this.geo.setAttribute('alpha', this.aAlpha);
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: smokeTex }, color: { value: new THREE.Color(color) }, shade: { value: new THREE.Color(shade || color) }, uScale: { value: 500 } }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false });
    this.points = new THREE.Points(this.geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5;
  }
  spawn(x, y, z, vx, vy, vz, s0, s1, life, a0) {
    if (this.n >= this.max) return; const i = this.n++, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
  }
  update(dt, drag, grav) {
    const f = Math.max(0, 1 - drag * dt); let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        const l = --this.n; if (i !== l) { for (let c = 0; c < 3; c++) { this.p[i * 3 + c] = this.p[l * 3 + c]; this.v[i * 3 + c] = this.v[l * 3 + c]; } this.age[i] = this.age[l]; this.life[i] = this.life[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l]; this.a0[i] = this.a0[l]; }
        continue;
      }
      const j = i * 3; this.v[j] *= f; this.v[j + 2] *= f; this.v[j + 1] = this.v[j + 1] * f + grav * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] = Math.max(0.05, this.p[j + 1] + this.v[j + 1] * dt); this.p[j + 2] += this.v[j + 2] * dt;
      i++;
    }
    const P = this.aPos.array, S = this.aSize.array, A = this.aAlpha.array;
    for (let k = 0; k < this.n; k++) {
      const t = this.age[k] / this.life[k];
      P[k * 3] = this.p[k * 3]; P[k * 3 + 1] = this.p[k * 3 + 1]; P[k * 3 + 2] = this.p[k * 3 + 2];
      S[k] = this.s0[k] + (this.s1[k] - this.s0[k]) * (1 - (1 - t) * (1 - t));
      A[k] = this.a0[k] * Math.pow(1 - t, 1.3) * Math.min(1, this.age[k] * 6);
    }
    this.geo.setDrawRange(0, this.n); this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = true;
  }
  shift(dx) { for (let k = 0; k < this.n; k++) this.p[k * 3] += dx; }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
// Следы шин на асфальте
class Trail {
  constructor(max, w, mat) {
    this.max = max; this.w = w; this.pts = [];
    this.geo = new THREE.BufferGeometry(); this.pos = new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    const idx = []; for (let i = 0; i < max - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
  }
  add(x, z) {
    const l = this.pts[this.pts.length - 1]; if (l && Math.hypot(l[0] - x, l[1] - z) < 0.35) return;
    this.pts.push([x, z]); if (this.pts.length > this.max) this.pts.shift();
    const A = this.pos.array, n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const [px, pz] = this.pts[i]; A.set([px - dz * this.w, 0.014, pz + dx * this.w, px + dz * this.w, 0.014, pz - dx * this.w], i * 6);
    }
    this.pos.needsUpdate = true; this.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
  dispose() { this.geo.dispose(); }
}

// ---------- сцены ----------
let cur = null, raf = 0, last = 0, host = null, opts = {}, lastLabel = null, drag = null;
const SH = () => low() ? 1024 : 2048;
function shadowSetup(light, size) { light.castShadow = !low(); light.shadow.mapSize.set(SH(), SH()); const c = light.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 0.5; c.far = 80; light.shadow.bias = -0.0004; light.shadow.normalBias = 0.02; }
function setCar(slot, look, o) {
  const key = lookKey(look) + (o && o.lights ? 'L' : '');
  if (slot.key === key) return false;
  if (slot.car) { slot.parent.remove(slot.car.root); slot.car.dispose(); }
  slot.car = buildCar(look, o); slot.key = key; slot.parent.add(slot.car.root);
  return true;
}
function rivalLook() {
  const pool = DATA.CARS.filter(c => ['sedan', 'jdm', 'hatch', 'rally'].includes(c.type));
  const def = pool[Math.floor(Math.random() * pool.length)];
  const kit = {}; DATA.KITS.forEach(k => kit[k.id] = 0); kit.spoiler = 1; kit.skirt = 1;
  return { car: def.id, kit, paint: { body: '#15171c', finish: 'gloss', wheel: '#2a2a2a', light: '#ffffff', neon: '', vinyl: 17, v1: '#ffffff', v2: '#ff3b3b' } };
}
function wheelsAnim(car, dist, steer, rearSpin) {
  for (const w of car.wheels) { w.spin.rotation.z = -(w.front ? dist : (rearSpin != null ? rearSpin : dist)) / car.wr; if (w.front) w.piv.rotation.y = steer; }
}

function driftScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07080a); scene.fog = new THREE.FogExp2(0x07080a, 0.03); scene.environment = envTex;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0x8090a8, 0x0a0a0a, 0.5));
  const sun = new THREE.DirectionalLight(0xffe4c8, 2.6); shadowSetup(sun, 9); scene.add(sun, sun.target);
  const asphalt = canvasTex(512, (g, s) => { g.fillStyle = '#4a4b4e'; g.fillRect(0, 0, s, s); noise(g, s, 9000, ['rgba(0,0,0,.35)', 'rgba(255,255,255,.12)', 'rgba(0,0,0,.2)'], 1, 2.5); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(rnd(0, s), rnd(0, s), rnd(40, 140), rnd(20, 70), rnd(0, 3), 0, 7); g.fill(); } }, [70, 70]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), std(0x26272a, { map: asphalt, roughness: 0.9, envMapIntensity: 0.25 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false });
  for (const [a, b] of [[21.5, 21.75], [7.6, 7.8]]) { const r = new THREE.Mesh(new THREE.RingGeometry(a, b, 160), lineMat); r.rotation.x = -Math.PI / 2; r.position.y = 0.011; scene.add(r); }
  // стена из шин и огни вдали
  const tires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.36, 0.36, 0.75, 14), std(0x111111, { roughness: 0.9 }), 200);
  const mm = new THREE.Matrix4(); for (let i = 0; i < 200; i++) { const a = i / 200 * Math.PI * 2; mm.makeTranslation(Math.cos(a) * 28, 0.38, Math.sin(a) * 28); tires.setMatrixAt(i, mm); } tires.receiveShadow = true; scene.add(tires);
  const slot = { parent: scene };
  const smoke = new Puffs(low() ? 550 : 1100, 0xf6f3ee, 0x9ea3ab); scene.add(smoke.points);
  const markMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false });
  const marks = [new Trail(320, 0.13, markMat), new Trail(320, 0.13, markMat)]; marks.forEach(m => scene.add(m.mesh));
  const beams = [];
  let phi = 0, dist = 0, rear = 0, acc = 0, first = true;
  const Rc = 13, v = 13.5;
  const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function attachLights(car) {
    beams.forEach(b => b.parent && b.parent.remove(b)); beams.length = 0;
    const col = new THREE.Color((SAVE.curLook().paint.light) || '#fff6d5');
    for (const hp of car.headPts) {
      const sl = new THREE.SpotLight(col, 70, 40, 0.5, 0.6, 1.6); sl.position.copy(hp); sl.target.position.set(hp.x + 10, -0.6, hp.z * 1.5); car.root.add(sl, sl.target); beams.push(sl, sl.target);
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); gl.scale.set(0.75, 0.75, 1); gl.position.copy(hp).add(new THREE.Vector3(0.05, 0, 0)); car.root.add(gl); beams.push(gl);
    }
  }
  return {
    scene, cam,
    update(dt, t) {
      if (setCar(slot, SAVE.curLook(), { lights: true })) attachLights(slot.car);
      const car = slot.car;
      phi += v / Rc * dt; dist += v * dt; rear += v * 2.6 * dt;
      const beta = 0.66 + Math.sin(t * 0.9) * 0.09 + Math.sin(t * 2.3) * 0.03;
      const pos = new THREE.Vector3(Math.cos(phi) * Rc, 0, Math.sin(phi) * Rc);
      const td = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi)), cd = new THREE.Vector3(-Math.cos(phi), 0, -Math.sin(phi));
      const nose = td.clone().multiplyScalar(Math.cos(beta)).addScaledVector(cd, Math.sin(beta)).normalize();
      const th = Math.atan2(-nose.z, nose.x), tt = Math.atan2(-td.z, td.x);
      car.root.position.copy(pos); car.root.rotation.set(0, th, 0);
      const right = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, th);
      car.body.rotation.x = 0.045 * Math.sign(right.dot(cd) * -1 || 1);
      car.body.position.y = Math.sin(t * 13) * 0.004;
      wheelsAnim(car, dist, clamp(THREE.MathUtils.euclideanModulo(tt - th + Math.PI, Math.PI * 2) - Math.PI, -0.75, 0.75), rear);
      // дым из-под задних колёс
      acc += dt * (low() ? 55 : 110);
      while (acc > 1) {
        acc--;
        for (const sd of [-1, 1]) {
          tmp.set(car.xR - 0.1, 0.25, sd * car.zw).applyMatrix4(car.root.matrixWorld);
          smoke.spawn(tmp.x, tmp.y, tmp.z, td.x * v * 0.12 + rnd(-0.8, 0.8), rnd(0.3, 1.1), td.z * v * 0.12 + rnd(-0.8, 0.8), rnd(0.8, 1.4), rnd(6.5, 11), rnd(3.2, 4.8), rnd(0.5, 0.75));
        }
      }
      smoke.update(dt, 0.55, 0.22);
      car.root.updateMatrixWorld();
      marks.forEach((m, i) => { tmp.set(car.xR, 0, (i ? 1 : -1) * car.zw).applyMatrix4(car.root.matrixWorld); m.add(tmp.x, tmp.z); });
      // камера впереди и снаружи дуги, низко — как на фото
      const view = nose.clone().multiplyScalar(0.8).addScaledVector(td, 0.55).normalize();
      const desired = pos.clone().addScaledVector(view, 14).add(new THREE.Vector3(0, 0.95, 0));
      if (first) { cam.position.copy(desired); first = false; } else cam.position.lerp(desired, Math.min(1, dt * 2.5));
      cam.lookAt(pos.x - td.x * 0.6, 0.7, pos.z - td.z * 0.6);
      // контровой солнечный свет из-за машины
      tmp.subVectors(pos, cam.position).setY(0).normalize();
      sun.position.copy(pos).addScaledVector(tmp, 20).add(new THREE.Vector3(0, 7, 0)); sun.target.position.copy(pos);
    },
    label() { return slot.car ? { p: slot.car.root.position.clone().add(new THREE.Vector3(0, slot.car.H + 0.75, 0)), c: slot.car.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), r: 2.6 } : null; },
    dispose() { if (slot.car) slot.car.dispose(); smoke.dispose(); marks.forEach(m => m.dispose()); disposeScene(scene); }
  };
}

function raceScene() {
  const sky = 0xdce5ef;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 30, 150); scene.environment = envTex;
  const cam = new THREE.PerspectiveCamera(27, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xaeb9c8, 1.5));
  const sun = new THREE.DirectionalLight(0xfff3e2, 2.6); shadowSetup(sun, 14); scene.add(sun, sun.target);
  const snowT = canvasTex(512, (g, s) => { g.fillStyle = '#f3f6fa'; g.fillRect(0, 0, s, s); noise(g, s, 6000, ['rgba(150,170,200,.18)', 'rgba(255,255,255,.9)'], 1, 3); }, [120, 40]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 400), std(0xffffff, { map: snowT, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const roadT = canvasTex(512, (g, s) => { g.fillStyle = '#d9dfe7'; g.fillRect(0, 0, s, s); noise(g, s, 7000, ['rgba(110,125,145,.25)', 'rgba(255,255,255,.7)'], 1, 3); for (const y of [0.22, 0.3, 0.62, 0.7]) { g.fillStyle = 'rgba(120,130,150,.22)'; g.fillRect(0, y * s, s, s * 0.05); } }, [120, 1]);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(1200, 12), std(0xffffff, { map: roadT, roughness: 0.75 })); road.rotation.x = -Math.PI / 2; road.position.y = 0.01; road.receiveShadow = true; scene.add(road);
  // сценарий: валы снега, забор, зрители, ёлки — всё переиспользуется по кругу
  const SPAN = 260, items = [];
  const inst = (geo, mat, n, place) => { const im = new THREE.InstancedMesh(geo, mat, n); im.castShadow = true; im.receiveShadow = true; scene.add(im); const arr = []; for (let i = 0; i < n; i++) arr.push(place(i, im)); items.push({ im, arr }); return im; };
  const bankMat = std(0xf6f9fc, { roughness: 1 });
  inst(new THREE.SphereGeometry(1, 18, 10), bankMat, 70, i => ({ x: i / 70 * SPAN, y: 0, z: 7.6 + rnd(0, 1.2), s: [rnd(3.5, 6), rnd(0.6, 1.0), rnd(1.4, 2)] }));
  inst(new THREE.SphereGeometry(1, 18, 10), bankMat, 70, i => ({ x: i / 70 * SPAN, y: 0, z: -7.4 - rnd(0, 1), s: [rnd(3.5, 6), rnd(0.5, 0.9), rnd(1.3, 1.8)] }));
  inst(new THREE.BoxGeometry(0.16, 2.4, 0.16), M.wood, 66, i => ({ x: i * 4, y: 1.2, z: -10.5, s: [1, 1, 1] }));
  inst(new THREE.BoxGeometry(4, 0.07, 0.05), M.wood, 66, i => ({ x: i * 4 + 2, y: 2.25, z: -10.5, s: [1, 1, 1] }));
  const netT = canvasTex(128, (g, s) => { g.strokeStyle = 'rgba(70,75,80,.9)'; g.lineWidth = 2; for (let i = 0; i <= s; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); } }, [1, 1]);
  netT.repeat.set(20, 1);
  const net = inst(new THREE.PlaneGeometry(40, 2.1), new THREE.MeshBasicMaterial({ map: netT, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }), 8, i => ({ x: i * 40 + 20, y: 1.1, z: -10.45, s: [1, 1, 1] }));
  net.castShadow = false;
  const jackets = ['#2b3a55', '#5a1f2a', '#1f4a3a', '#7a6a55', '#30343c', '#8a2b2b', '#2f5f8a', '#d9a441', '#3d3d45', '#6b4a7a'];
  const crowd = inst(new THREE.CapsuleGeometry(0.24, 1.1, 4, 8), std(0xffffff, { roughness: 0.9 }), 220, (i, im) => { im.setColorAt(i, new THREE.Color(jackets[i % jackets.length])); return { x: rnd(0, SPAN), y: 0.8, z: rnd(-11.2, -14.5), s: [1, rnd(0.9, 1.12), 1] }; });
  inst(new THREE.SphereGeometry(0.17, 10, 8), std(0xd8b49a, { roughness: 0.8 }), 220, i => { const c = items[items.length - 1].arr[i]; return { x: c.x, y: 0.8 + 0.85 * c.s[1], z: c.z, s: [1, 1, 1], follow: c }; });
  inst(new THREE.ConeGeometry(2.4, 8, 10), std(0x2d4a38, { roughness: 0.9 }), 60, () => ({ x: rnd(0, SPAN), y: 4, z: rnd(-26, -60), s: [1, rnd(0.8, 1.4), 1] }));
  inst(new THREE.ConeGeometry(2.42, 3, 10), bankMat, 60, i => { const c = items[items.length - 1].arr[i]; return { x: c.x, y: 4 + 2.9 * c.s[1], z: c.z, s: [1, c.s[1], 1], follow: c }; });
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  function recycle(cx) {
    for (const it of items) {
      let ch = false;
      it.arr.forEach((o, i) => {
        if (o.follow) { if (o.x !== o.follow.x) { o.x = o.follow.x; ch = true; } }
        else { while (o.x < cx - 40) { o.x += SPAN; ch = true; } while (o.x > cx - 40 + SPAN) { o.x -= SPAN; ch = true; } }
        if (ch || !it.init) { ps.set(o.x, o.y, o.z); sc.set(o.s[0], o.s[1], o.s[2]); mtx.compose(ps, q, sc); it.im.setMatrixAt(i, mtx); }
      });
      if (ch || !it.init) { it.im.instanceMatrix.needsUpdate = true; it.init = true; }
    }
  }
  const me = { parent: scene }, riv = { parent: scene };
  const rlook = rivalLook();
  const spray = new Puffs(low() ? 500 : 1000, 0xffffff, 0x9fb0c4); scene.add(spray.points);
  let x = 0, d = 0, acc = 0, first = true;
  const v = 23, tmp = new THREE.Vector3();
  return {
    scene, cam,
    update(dt, t) {
      setCar(me, SAVE.curLook()); setCar(riv, rlook);
      x += v * dt; d += v * dt;
      if (x > 300) { x -= 300; spray.shift(-300); cam.position.x -= 300; }
      const a = 0.2 + Math.sin(t * 1.2) * 0.07;
      me.car.root.position.set(x, 0, 1.9); me.car.root.rotation.set(0, a, 0);
      me.car.body.rotation.x = -0.03; me.car.body.position.y = Math.sin(t * 17) * 0.005;
      wheelsAnim(me.car, d, -a * 0.9, d * 1.35);
      const rx = x + 7 + Math.sin(t * 0.35) * 4;
      riv.car.root.position.set(rx, 0, -2.4); riv.car.root.rotation.set(0, 0.1 + Math.sin(t * 1.5 + 1) * 0.05, 0);
      wheelsAnim(riv.car, d, -0.08, d * 1.2);
      me.car.root.updateMatrixWorld(); riv.car.root.updateMatrixWorld();
      acc += dt * (low() ? 50 : 95);
      while (acc > 1) {
        acc--;
        for (const [c, k] of [[me.car, 1], [riv.car, 0.55]]) {
          if (Math.random() > k) continue;
          const sd = Math.random() < 0.5 ? -1 : 1;
          tmp.set(c.xR - 0.25, 0.2, sd * c.zw * 1.1).applyMatrix4(c.root.matrixWorld);
          spray.spawn(tmp.x, tmp.y, tmp.z, v * rnd(0.35, 0.75), rnd(1, 3.2), rnd(-0.5, 2.6), rnd(0.35, 0.6), rnd(2.4, 4.2), rnd(0.9, 1.6), rnd(0.55, 0.8));
        }
      }
      spray.update(dt, 1.4, -2.2);
      recycle(cam.position.x);
      const desired = new THREE.Vector3(x - 9.5, 2.1, 8.2);
      if (first) { cam.position.copy(desired); first = false; } else cam.position.lerp(desired, Math.min(1, dt * 3));
      cam.lookAt(x + 2.4, 0.7, 0.4);
      sun.position.set(x - 25, 30, 18); sun.target.position.set(x, 0, 0);
    },
    label() { return me.car ? { p: me.car.root.position.clone().add(new THREE.Vector3(0, me.car.H + 0.7, 0)), c: me.car.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)), r: 2.6 } : null; },
    dispose() { if (me.car) me.car.dispose(); if (riv.car) riv.car.dispose(); spray.dispose(); disposeScene(scene); }
  };
}

function garageScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090d); scene.fog = new THREE.Fog(0x07090d, 13, 30); scene.environment = envTex;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), std(0x15171c, { roughness: 0.55, metalness: 0, envMapIntensity: 0.15 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const table = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.45, 0.08, 96), std(0x1f2229, { roughness: 0.45, metalness: 0.2, envMapIntensity: 0.3 })); table.position.y = 0.04; table.receiveShadow = true; scene.add(table);
  const accent = () => new THREE.Color(document.body.classList.contains('race') ? '#3d8bff' : '#c6ff1a');
  const ringMat = new THREE.MeshBasicMaterial({ color: accent() });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.42, 0.025, 8, 160), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; scene.add(ring);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x20232a, 0.6));
  const key = new THREE.SpotLight(0xffffff, 230, 40, 0.55, 0.7, 1.4); key.position.set(2.5, 10, 3); shadowSetup(key, 6); key.shadow.camera.near = 2; scene.add(key, key.target);
  const rim1 = new THREE.DirectionalLight(accent(), 0.65); rim1.position.set(-7, 3, -6); scene.add(rim1);
  const rim2 = new THREE.DirectionalLight(0xa9c4ff, 1.0); rim2.position.set(7, 2.5, -4); scene.add(rim2);
  const tt = new THREE.Group(); tt.position.y = 0.08; scene.add(tt);
  const slot = { parent: tt };
  let rot = -2.3, shift = 0;
  return {
    scene, cam,
    update(dt) {
      const look = opts.look ? opts.look() : SAVE.curLook();
      setCar(slot, look, { lights: true, envI: 0.8 });
      if (!drag) rot += dt * 0.25; tt.rotation.y = rot;
      const ac = accent(); ringMat.color.copy(ac); rim1.color.copy(ac);
      const L = slot.car.g.L, dist = (5.2 + L * 1.05) * (opts.zoom || 1);
      cam.position.set(Math.cos(0.5) * dist, 2.6 + L * 0.15, Math.sin(0.5) * dist); cam.lookAt(0, 0.55, 0);
      shift += ((opts.shift ? opts.shift() : 0) - shift) * Math.min(1, dt * 6);
    },
    drag(dx) { rot += dx * 0.01; },
    viewShift() { return shift; },
    dispose() { if (slot.car) slot.car.dispose(); disposeScene(scene); }
  };
}
function disposeScene(scene) {
  scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => { if (SHARED.has(m)) return; for (const k in m) { const v = m[k]; if (v && v.isTexture && ![carbonTex, smokeTex, glowTex, shadowTex].includes(v)) v.dispose(); } m.dispose(); });
  });
}

// ---------- цикл ----------
const MAKERS = { drift: driftScene, race: raceScene, garage: garageScene };
let curKind = null, sizeKey = '';
function resize() {
  if (!host || !cur) return;
  const w = host.clientWidth, h = host.clientHeight, pr = Math.min(window.devicePixelRatio || 1, low() ? 1 : 1.75);
  const k = w + 'x' + h + '@' + pr; if (k === sizeKey) return; sizeKey = k;
  R.setPixelRatio(pr); R.setSize(w, h, false);
  cur.cam.aspect = w / Math.max(1, h); cur.cam.updateProjectionMatrix();
}
function project(v) { const p = v.clone().project(cur.cam); return { x: (p.x + 1) / 2 * host.clientWidth, y: (1 - p.y) / 2 * host.clientHeight }; }
function loop(now) {
  if (!cur) return;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  resize();
  cur.update(dt, now / 1000);
  // смещение картинки (меню слева / открытая панель гаража справа)
  const w = host.clientWidth, h = host.clientHeight;
  let off = 0;
  if (curKind === 'garage') off = cur.viewShift(); else if (w > 760) off = w * 0.11;
  if (Math.abs(off) > 0.5) cur.cam.setViewOffset(w, h, off, 0, w, h); else cur.cam.clearViewOffset();
  const pts = cur.scene.children.filter(o => o.isPoints);
  pts.forEach(p => { p.material.uniforms.uScale.value = R.domElement.height / (2 * Math.tan(cur.cam.fov * Math.PI / 360)); });
  R.shadowMap.enabled = !low();
  R.render(cur.scene, cur.cam);
  if (cur.label) {
    const lb = cur.label();
    if (lb) { const a = project(lb.p), c = project(lb.c), e = project(lb.c.clone().add(new THREE.Vector3(lb.r, 0, 0))); lastLabel = { x: a.x, y: a.y, hx: c.x, hy: c.y, hr: Math.max(60, Math.hypot(e.x - c.x, e.y - c.y)) }; }
    if (opts.onFrame) opts.onFrame(lastLabel);
  }
  raf = requestAnimationFrame(loop);
}
const canvas = R.domElement;
canvas.addEventListener('pointerdown', e => { if (curKind === 'garage') { drag = { x: e.clientX }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', e => {
  if (drag && cur && cur.drag) { cur.drag(e.clientX - drag.x); drag.x = e.clientX; return; }
  if (curKind !== 'garage') canvas.style.cursor = hit(e) ? 'pointer' : 'default';
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('click', e => { if (curKind !== 'garage' && hit(e) && opts.onCarClick) opts.onCarClick(); });
function hit(e) { if (!lastLabel) return false; const r = canvas.getBoundingClientRect(); return Math.hypot(e.clientX - r.left - lastLabel.hx, e.clientY - r.top - lastLabel.hy) < lastLabel.hr; }

C3.start = function (kind, h, o) {
  C3.stop();
  host = h; opts = o || {}; curKind = kind; sizeKey = ''; lastLabel = null;
  h.prepend(canvas);
  cur = MAKERS[kind]();
  last = performance.now(); raf = requestAnimationFrame(loop);
};
C3.stop = function (kind) {
  if (kind && kind !== curKind && !(kind === 'mode' && (curKind === 'drift' || curKind === 'race'))) return;
  cancelAnimationFrame(raf); raf = 0;
  if (cur) { cur.dispose(); cur = null; }
  curKind = null; if (canvas.parentNode) canvas.remove();
};
C3.kind = () => curKind;
C3.debug = () => cur;

// Вид сверху для игры: тот же размер и масштаб, что и у 2D-спрайта (48 px/м), без колёс (их рисует 2D с поворотом)
C3.topSprite = function (look, lights) {
  const car = buildCar(look, { lights, noWheels: true, noNeon: true, noShadow: true, noCast: true, envI: 0.35 });
  const g = car.g, ppm = 48, wM = g.L + 1.4, hM = g.W + 1.0, cw = Math.ceil(wM * ppm), ch = Math.ceil(hM * ppm);
  SR.setSize(cw, ch, false);
  const cam = new THREE.OrthographicCamera(-cw / ppm / 2, cw / ppm / 2, ch / ppm / 2, -ch / ppm / 2, 0.1, 30);
  cam.position.set(0, 12, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  spriteScene.add(car.root); SR.render(spriteScene, cam); spriteScene.remove(car.root); car.dispose();
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(SR.domElement, 0, 0);
  return { c, w: cw / ppm, h: ch / ppm };
};
// Превью 3/4 для списка машин
C3.thumb = function (look, w, h) {
  const car = buildCar(look, { noNeon: true, noCast: true, envI: 0.7 });
  const d = 2; SR.setSize(w * d, h * d, false);
  const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 50); const L = car.g.L;
  cam.position.set(L * 1.15, L * 0.42, L * 1.25); cam.lookAt(0, 0.55, 0);
  spriteScene.add(car.root); SR.render(spriteScene, cam); spriteScene.remove(car.root); car.dispose();
  const c = document.createElement('canvas'); c.width = w * d; c.height = h * d; c.style.width = w + 'px'; c.style.height = h + 'px';
  c.getContext('2d').drawImage(SR.domElement, 0, 0); return c;
};

C3.ready = true;
window.CAR3D = C3;
window.dispatchEvent(new Event('car3d-ready'));
