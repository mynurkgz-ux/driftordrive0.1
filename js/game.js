'use strict';
// Игровой процесс: дрифт-сессии и гонки, ИИ, столкновения, частицы, камера, HUD, мультиплеер
const GAME = (() => {
  const G = { running: false };
  let cv, ctx, W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  let tr = null, th = null, mode = 'drift', map = null, mapIdx = 0, mp = false;
  let cars = [], player = null, smoke = [], cones = [], rain = [];
  let state = 'countdown', tState = 0, clock = 0, raceStart = 0, timeLeft = 0, lastCount = -1, finishOrder = 0;
  let drift = null, paused = false, resultShown = false, resultTimer = 0;
  const remotes = {};
  const cam = { x: 0, y: 0, s: 20, rot: 0, zoom: 1 };
  const skid = { buf: new Float32Array(9000 * 4), n: 0, head: 0, cap: 9000 };
  let lightC, lctx, mini, mmc, mmx, hudCache = {};
  let el = {};

  G.init = function () {
    cv = U.$('#gameCanvas'); ctx = cv.getContext('2d');
    lightC = document.createElement('canvas'); lctx = lightC.getContext('2d');
    mmc = U.$('#minimap'); mmx = mmc.getContext('2d');
    el = { tl: U.$('#hudTL'), top: U.$('#hudTop'), board: U.$('#hudBoard'), spd: U.$('#spdVal'), gear: U.$('#gearVal'), rpm: U.$('#rpmBar'), big: U.$('#bigMsg'), feed: U.$('#feed') };
    window.addEventListener('resize', resize);
    U.$('#pauseBtn').addEventListener('click', () => G.togglePause());
    U.$('#pmResume').addEventListener('click', () => G.togglePause(false));
    U.$('#pmRespawn').addEventListener('click', () => { G.respawnPlayer(); G.togglePause(false); });
    U.$('#pmRestart').addEventListener('click', () => { if (!mp) G.restart(); });
    U.$('#pmQuit').addEventListener('click', () => G.quit());
    const pmM = U.$('#pmMusic'), pmS = U.$('#pmSfx');
    pmM.addEventListener('input', () => { SAVE.s().music = +pmM.value; AUDIO.apply(); SAVE.save(); });
    pmS.addEventListener('input', () => { const v = +pmS.value; const s = SAVE.s(); s.sfx = v; s.engine = v; s.tire = v; AUDIO.apply(); SAVE.save(); });
  };

  function resize() {
    if (!cv) return;
    const q = SAVE.s().quality === 'low' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    dpr = q; W = cv.clientWidth || innerWidth; H = cv.clientHeight || innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    lightC.width = Math.round(W * dpr / 2); lightC.height = Math.round(H * dpr / 2);
  }

  // ---------- создание машин ----------
  function makeCar(look, cfg, o) {
    const def = DATA.CAR[look.car] || DATA.CAR[DATA.STARTER];
    const c = {
      look, def, cfg, spec: PHYS.spec(def, cfg), geom: CARR.geom(look),
      x: 0, y: 0, h: 0, vx: 0, vy: 0, w: 0, steer: 0, axl: 0, input: { steer: 0, throttle: 0, brake: 0, hand: 0 },
      seg: 0, pseg: 0, nd: 0, dist: 0, lapsDone: 0, lapStart: 0, lastLap: 0, bestLap: Infinity, finished: false, finT: 0, place: 0,
      rpm: 900, gear: 1, shiftT: 0, spd: 0, vxl: 0, vyl: 0, skid: 0, spinR: 0, surf: 'road', hitCD: 0, stuck: 0,
      skidPrev: null, nick: '', skill: 1, aiOff: 0, aiOffT: 0, aiTimer: 0, lastThr: 0
    };
    return Object.assign(c, o || {});
  }
  function aiLook(r, tier) {
    const pool = DATA.CARS.filter(c => Math.abs(c.tier - tier) <= 1);
    const def = pool[Math.floor(r() * pool.length)];
    const kit = {}; DATA.KITS.forEach(k => kit[k.id] = r() < 0.45 ? 0 : Math.floor(r() * k.opts.length));
    const P = DATA.PALETTE;
    return {
      car: def.id, kit, paint: {
        body: P[Math.floor(r() * P.length)], finish: DATA.FINISHES[Math.floor(r() * 4)][0], wheel: ['#c8ccd2', '#222', '#ffd700', '#e0e0e0', '#b33'][Math.floor(r() * 5)],
        light: '#fff6d5', neon: r() < 0.2 ? DATA.NEON_COLORS[1 + Math.floor(r() * 8)] : '', vinyl: r() < 0.6 ? 1 + Math.floor(r() * 23) : 0, v1: P[Math.floor(r() * P.length)], v2: '#111111'
      }
    };
  }
  function aiCfg(look, lvl) {
    const c = SAVE.newCarCfg(look.car); c.kit = look.kit; c.paint = look.paint;
    c.up = { engine: Math.min(5, lvl), turbo: Math.min(3, Math.floor(lvl / 2)), tires: Math.min(4, lvl), weight: Math.min(3, Math.floor(lvl / 2)), brakes: Math.min(3, lvl) };
    c.tune.steer = 38;
    return c;
  }
  function place(c, seg, lat) {
    const p = tr.pts[seg], n = tr.nrm[seg], t = tr.tan[seg];
    c.x = p.x + n.x * lat; c.y = p.y + n.y * lat; c.h = Math.atan2(t.y, t.x);
    c.vx = c.vy = c.w = 0; c.steer = 0; c.seg = c.pseg = seg; c.skidPrev = null;
  }

  // ---------- запуск ----------
  G.start = function (o) {
    mode = o.mode; mapIdx = o.mapIdx; map = DATA.MAPS[mode][mapIdx]; mp = !!o.mp;
    tr = TRACK.build(map); th = tr.theme;
    cars = []; smoke = []; skid.n = 0; skid.head = 0; for (const k in remotes) delete remotes[k];
    paused = false; resultShown = false; resultTimer = 0; finishOrder = 0; hudCache = {};
    cones = (tr.cones || []).map(c => ({ x: c.x, y: c.y, vx: 0, vy: 0, a: 0, w: 0, hit: false }));
    document.body.classList.toggle('race', mode === 'race');
    const look = SAVE.curLook(), cfg = SAVE.curCfg();
    player = makeCar(look, cfg, { isPlayer: true, nick: NET.displayNick() });
    player.spec.tcs = mode === 'race' && SAVE.s().assist;
    cars.push(player);
    const r = U.rng((map.seed ^ Date.now()) >>> 0);
    if (tr.kind === 'arena') {
      const slot = mp ? mpSlot() : 0;
      player.x = tr.spawn.x; player.y = tr.spawn.y + (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 7; player.h = 0;
    } else if (mode === 'race') {
      const nAI = mp ? 0 : map.ai, total = nAI + 1;
      const pSlot = mp ? mpSlot() : Math.min(total - 1, 3);
      const lvl = Math.floor(mapIdx / 6);
      const names = DATA.AI_NAMES.slice().sort(() => r() - 0.5);
      let ai = 0;
      for (let i = 0; i < Math.max(total, pSlot + 1); i++) {
        let c;
        if (i === pSlot) c = player;
        else if (ai < nAI) {
          const lk = aiLook(r, Math.min(6, 1 + Math.floor(mapIdx / 6) + (r() < 0.3 ? 1 : 0)));
          c = makeCar(lk, aiCfg(lk, lvl), { isAI: true, nick: names[ai % names.length], skill: map.aiSkill * (0.94 + r() * 0.08), aiOffT: (r() - 0.5) * tr.hw * 0.6 });
          c.spec.tcs = true; c.spec.gripR *= 1.06;
          cars.push(c); ai++;
        } else continue;
        const row = Math.floor(i / 2), seg = (tr.N - 4 - row * 3) % tr.N;
        place(c, seg, (i % 2 ? -1 : 1) * tr.hw * 0.42);
        c.dist = -(tr.N - seg);
      }
    } else {
      const slot = mp ? mpSlot() : 0;
      place(player, (tr.N - slot * 4) % tr.N, slot % 2 ? -3 : 3);
      if (!slot) place(player, 2, 0);
    }
    state = 'countdown'; tState = 0; clock = 0; lastCount = -1;
    if (mp && o.late) { state = 'run'; raceStart = 0; }
    timeLeft = mode === 'drift' ? map.time : 0;
    drift = { total: 0, combo: 0, mult: 1, chainT: 0, idle: 0, best: 0, angle: 0 };
    cam.x = player.x; cam.y = player.y; cam.rot = SAVE.s().camera === 'rotate' ? -player.h - Math.PI / 2 : 0; cam.zoom = 1;
    mini = TRACK.minimap(tr, 170);
    rain = []; if (th.rain) for (let i = 0; i < 140; i++) rain.push({ x: Math.random(), y: Math.random(), s: 0.8 + Math.random() * 0.6 });
    U.$('#pauseMenu').classList.add('hidden'); U.$('#resultMenu').classList.add('hidden');
    U.$('#pmRestart').classList.toggle('hidden', mp);
    UI.show('game');
    if (U.isMobile) UI.applyOrientation(true);
    resize();
    buildHUD();
    if (U.isMobile) INPUT.build(U.$('#touch'), SAVE.s().scheme, false); else INPUT.clear();
    AUDIO.init(); AUDIO.engineStart(player.spec); AUDIO.ambStart(th.amb);
    if (mp) {
      NET.mp.onPlayers = onPlayers; onPlayers(NET.mp.players);
      NET.mp.send({ score: 0, dist: player.dist, fin: 0, lap: 0 }, true);
    }
    G.running = true; last = performance.now();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  };
  function mpSlot() { const ids = Object.keys(NET.mp.players).sort((a, b) => (NET.mp.players[a].joined || 0) - (NET.mp.players[b].joined || 0)); const i = ids.indexOf(NET.pid); return Math.max(0, i) % 8; }

  G.restart = function () { G.stop(); G.start({ mode, mapIdx }); };
  G.stop = function () {
    G.running = false; cancelAnimationFrame(raf);
    AUDIO.engineStop(); AUDIO.ambStop(); INPUT.clear();
    U.$('#touch').innerHTML = '';
    NET.mp.onPlayers = null;
  };
  G.quit = function () {
    G.stop();
    if (mp) { UI.backToLobby(); }
    else UI.show('mode');
  };
  G.togglePause = function (v) {
    if (!G.running || resultShown) return;
    paused = v === undefined ? !paused : v;
    U.$('#pauseMenu').classList.toggle('hidden', !paused);
    if (paused) { U.$('#pmMusic').value = SAVE.s().music; U.$('#pmSfx').value = SAVE.s().sfx; }
  };
  G.toggleCamera = function () { const s = SAVE.s(); s.camera = s.camera === 'rotate' ? 'fixed' : 'rotate'; SAVE.save(); feed(s.camera === 'rotate' ? 'Камера: за машиной' : 'Камера: север вверху', ''); };
  G.respawnPlayer = function () { if (!G.running || !player) return; respawn(player); if (mode === 'drift' && drift.combo > 0) failCombo('Респаун — комбо сброшено'); };
  function respawn(c) {
    if (tr.kind === 'arena') { c.x = U.clamp(c.x, -tr.w / 2 + 6, tr.w / 2 - 6); c.y = U.clamp(c.y, -tr.h / 2 + 6, tr.h / 2 - 6); c.vx = c.vy = c.w = 0; return; }
    const n = TRACK.nearest(tr, c.x, c.y, 0, tr.N);
    const d = c.dist; place(c, n.seg, 0); c.dist = d;
  }

  // ---------- главный цикл ----------
  function loop(now) {
    if (!G.running) return;
    let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; if (dt <= 0) dt = 0.001;
    try { update(dt); render(); } catch (e) { console.error(e); }
    raf = requestAnimationFrame(loop);
  }

  function update(dt) {
    const frozen = paused && !mp;
    if (frozen) { AUDIO.engineUpdate(player.rpm, 0, 0, 0, 'road'); return; }
    clock += dt;
    const inp = paused ? { steer: 0, throttle: 0, brake: 0, hand: 0 } : INPUT.state();
    // обратный отсчёт
    if (state === 'countdown') {
      tState += dt; const n = 3 - Math.floor(tState);
      if (n !== lastCount) { lastCount = n; if (n > 0) { bigMsg(String(n)); AUDIO.beep(false); } }
      if (tState >= 3) { state = 'run'; raceStart = clock; bigMsg('СТАРТ!', 900); AUDIO.beep(true); cars.forEach(c => c.lapStart = clock); }
    }
    // ввод игрока
    const canDrive = state === 'run' && !(mode === 'race' && player.finished && !mp) && !(mode === 'drift' && state === 'done');
    if (state === 'countdown') player.input = { steer: inp.steer, throttle: 0, brake: 0, hand: 1, revving: inp.throttle };
    else if (canDrive || (mode === 'race' && player.finished)) player.input = { steer: inp.steer, throttle: inp.throttle, brake: inp.brake, hand: inp.hand, analog: inp.analog };
    else player.input = { steer: 0, throttle: 0, brake: 0, hand: 1 };
    if (mode === 'race' && player.finished && !mp) aiControl(player, dt);
    else steerPlayer(player, player.input, dt);
    for (const c of cars) if (c.isAI) { if (state === 'run') aiControl(c, dt); else { c.input = { steer: 0, throttle: 0, brake: 0, hand: 1 }; } }
    // физика
    const sub = 4, h = dt / sub;
    for (let k = 0; k < sub; k++) for (const c of cars) { PHYS.step(c, h, surface(c)); collideWorld(c); }
    updateRemotes(dt);
    collideCars();
    updateCones(dt);
    for (const c of cars) {
      if (c.hitCD > 0) c.hitCD -= dt;
      progress(c); PHYS.gearbox(c, dt); emit(c, dt);
      if (c.isPlayer && c.lastThr > 0.7 && c.input.throttle < 0.1 && c.rpm > c.spec.redline * 0.62) flames(c);
      c.lastThr = c.input.throttle;
    }
    if (state === 'countdown' && player.input.revving) player.rpm = U.lerp(player.rpm, player.spec.redline * 0.85, dt * 6);
    if (mode === 'drift') updateDrift(dt); else updateRace(dt);
    updateParticles(dt);
    AUDIO.engineUpdate(player.rpm, state === 'countdown' ? (player.input.revving || 0) : player.input.throttle, player.spd, player.skid, player.surf);
    updateCamera(dt);
    if (mp) NET.mp.send({ s: [+player.x.toFixed(2), +player.y.toFixed(2), +player.h.toFixed(3), +player.vx.toFixed(2), +player.vy.toFixed(2), +player.steer.toFixed(2)], score: drift.total, dist: Math.round(player.dist), fin: player.finT || 0, lap: player.lapsDone });
    if (resultTimer > 0) { resultTimer -= dt; if (resultTimer <= 0) showResults(); }
    updateHUD();
  }

  // Руление игрока: ограничение угла на скорости (для клавиатуры) + помощь контрруления
  function steerPlayer(c, inp, dt) {
    const s = c.spec, v = c.spd;
    const beta = c.vxl > 1 ? Math.atan2(c.vyl, c.vxl) : 0;
    let target;
    if (inp.analog) target = inp.steer * s.steerMax;
    else { const lim = Math.abs(beta) > 0.2 ? 1 : U.lerp(1, 0.38, U.clamp(v / 45, 0, 1)); target = inp.steer * s.steerMax * lim; }
    if (SAVE.s().assist && v > 4 && c.vxl > 0) {
      const cs = U.clamp(beta * 0.9, -s.steerMax, s.steerMax);
      if (Math.abs(inp.steer) < 0.1) target = cs * 0.85;
      else target = U.clamp(target + cs * 0.4, -s.steerMax, s.steerMax);
    }
    const rate = inp.analog ? 9 : 4.5;
    c.steer += U.clamp(target - c.steer, -rate * dt, rate * dt);
  }

  // ---------- ИИ ----------
  function aiControl(c, dt) {
    const N = tr.N, s = c.spec;
    c.aiTimer -= dt; if (c.aiTimer <= 0) { c.aiTimer = 2 + Math.random() * 4; c.aiOffT = (Math.random() - 0.5) * tr.hw * 0.9; }
    c.aiOff += (c.aiOffT - c.aiOff) * Math.min(1, dt * 0.6);
    // уклонение от машины впереди
    for (const o of cars) { if (o === c) continue; const dx = o.x - c.x, dy = o.y - c.y; const ahead = dx * Math.cos(c.h) + dy * Math.sin(c.h); const side = -dx * Math.sin(c.h) + dy * Math.cos(c.h); if (ahead > 0 && ahead < 14 && Math.abs(side) < 2.6) c.aiOffT = U.clamp(c.aiOff + (side > 0 ? -3 : 3), -tr.hw * 0.7, tr.hw * 0.7); }
    const look = Math.floor(4 + c.spd * 0.42 / tr.step);
    const i = (c.seg + look) % N, p = tr.pts[i], n = tr.nrm[i];
    const tx = p.x + n.x * c.aiOff, ty = p.y + n.y * c.aiOff;
    const err = U.wrap(Math.atan2(ty - c.y, tx - c.x) - c.h);
    const beta = c.vxl > 1 ? Math.atan2(c.vyl, c.vxl) : 0;
    let st = err * 2.0 - c.w * 0.1 + beta * 0.8;
    if (Math.abs(err) > 1.9 && c.spd < 6) { // развернуло — сдаём назад
      c.input = { steer: -Math.sign(err), throttle: 0, brake: 1, hand: 0 };
      c.steer += U.clamp(-Math.sign(err) * s.steerMax - c.steer, -6 * dt, 6 * dt); return;
    }
    c.steer += U.clamp(U.clamp(st, -1, 1) * Math.min(s.steerMax, 0.7) - c.steer, -6 * dt, 6 * dt);
    const vt = Math.min(tr.vt[(c.seg + 2) % N], tr.vt[(c.seg + 5) % N]) * c.skill * (c.isPlayer ? 0.8 : 1);
    const v = c.vxl;
    c.input = { steer: 0, throttle: v < vt ? 1 : v < vt + 1.5 ? 0.3 : 0, brake: v > vt + 2 ? U.clamp((v - vt) / 6, 0.2, 1) : 0, hand: 0 };
    if (Math.abs(beta) > 0.3) c.input.throttle *= 0.4;
    if (c.spd < 1.5 && state === 'run') c.stuck += dt; else c.stuck = 0;
    if (c.stuck > 3) { respawn(c); c.stuck = 0; }
  }

  // ---------- поверхность и столкновения ----------
  const SURF = { road: null, curb: null, off: null };
  function surface(c) {
    if (tr.kind === 'arena') { c.surf = 'road'; return { mu: th.mu, drag: 0, name: 'road' }; }
    const d = c.nd;
    if (d < tr.hw + 0.3) { c.surf = 'road'; return { mu: th.mu, drag: 0 }; }
    if (d < tr.hw + 1.0) { c.surf = 'curb'; return { mu: th.mu * 0.95, drag: 0.03 }; }
    c.surf = 'off'; return { mu: th.mu * th.off, drag: th.offDrag };
  }
  function impulse(c, px, py, nx, ny, e, fr) {
    const s = c.spec, rx = px - c.x, ry = py - c.y;
    const vpx = c.vx - c.w * ry, vpy = c.vy + c.w * rx, vn = vpx * nx + vpy * ny;
    if (vn >= 0) return 0;
    const rn = rx * ny - ry * nx, j = -(1 + e) * vn / (1 / s.mass + rn * rn / s.I);
    c.vx += j * nx / s.mass; c.vy += j * ny / s.mass; c.w += rn * j / s.I;
    const tx = -ny, ty = nx, vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx;
    let jt = -vt / (1 / s.mass + rt * rt / s.I); jt = U.clamp(jt, -fr * j, fr * j);
    c.vx += jt * tx / s.mass; c.vy += jt * ty / s.mass; c.w += rt * jt / s.I;
    if (-vn > 2.5 && c.hitCD <= 0) { c.hitCD = 0.35; onHit(c, -vn); }
    return -vn;
  }
  function corners(c) {
    const g = c.geom, ca = Math.cos(c.h), sa = Math.sin(c.h), out = [];
    for (const [lx, ly] of [[g.hl * 0.95, -g.hw], [g.hl * 0.95, g.hw], [-g.hl * 0.95, -g.hw], [-g.hl * 0.95, g.hw]]) out.push([c.x + ca * lx - sa * ly, c.y + sa * lx + ca * ly]);
    return out;
  }
  function collideWorld(c) {
    if (tr.kind === 'arena') {
      const hw = tr.w / 2, hh = tr.h / 2;
      for (const [x, y] of corners(c)) {
        if (x > hw) { c.x -= x - hw; impulse(c, x, y, -1, 0, 0.3, 0.4); }
        if (x < -hw) { c.x += -hw - x; impulse(c, x, y, 1, 0, 0.3, 0.4); }
        if (y > hh) { c.y -= y - hh; impulse(c, x, y, 0, -1, 0.3, 0.4); }
        if (y < -hh) { c.y += -hh - y; impulse(c, x, y, 0, 1, 0.3, 0.4); }
      }
      const g = c.geom, ca = Math.cos(c.h), sa = Math.sin(c.h);
      for (const o of tr.obst) {
        if (Math.abs(o.x - c.x) > o.r + g.hl + 1 || Math.abs(o.y - c.y) > o.r + g.hl + 1) continue;
        for (const f of [-0.62, 0, 0.62]) {
          const cx = c.x + ca * g.hl * f, cy = c.y + sa * g.hl * f, dx = cx - o.x, dy = cy - o.y, d = Math.hypot(dx, dy), md = o.r + g.hw;
          if (d < md && d > 1e-4) { const nx = dx / d, ny = dy / d; c.x += nx * (md - d); c.y += ny * (md - d); impulse(c, o.x + nx * o.r, o.y + ny * o.r, nx, ny, 0.3, 0.4); }
        }
      }
      return;
    }
    const nr = TRACK.nearest(tr, c.x, c.y, c.seg, 10); c.seg = nr.seg; c.nd = nr.d;
    if (nr.d > tr.wall - c.geom.hl - 0.5) {
      for (const [x, y] of corners(c)) {
        const q = TRACK.nearest(tr, x, y, nr.seg, 8), pen = q.d - tr.wall;
        if (pen > 0) { c.x -= q.nx * pen; c.y -= q.ny * pen; impulse(c, x, y, -q.nx, -q.ny, 0.25, 0.35); }
      }
    }
  }
  function onHit(c, imp) {
    if (c.isPlayer) {
      AUDIO.hit(imp);
      if (SAVE.s().vibrate && navigator.vibrate) navigator.vibrate(Math.min(60, imp * 4));
      if (mode === 'drift' && drift.combo > 0 && imp > 3) failCombo('Удар! Комбо сгорело');
      for (let i = 0; i < 6; i++) spawnSmoke(c.x, c.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.6, '200,200,200');
    }
  }
  function collideCars() {
    const all = cars.concat(Object.values(remotes).filter(r => r.ready));
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      let a = all[i], b = all[j];
      if (a.isRemote && b.isRemote) continue;
      if (a.isRemote) { const t = a; a = b; b = t; }
      if (Math.abs(a.x - b.x) > 7 || Math.abs(a.y - b.y) > 7) continue;
      const ca = Math.cos(a.h), sa = Math.sin(a.h), cb = Math.cos(b.h), sb = Math.sin(b.h);
      for (const fa of [-0.6, 0, 0.6]) for (const fb of [-0.6, 0, 0.6]) {
        const ax = a.x + ca * a.geom.hl * fa, ay = a.y + sa * a.geom.hl * fa, bx = b.x + cb * b.geom.hl * fb, by = b.y + sb * b.geom.hl * fb;
        const dx = ax - bx, dy = ay - by, d = Math.hypot(dx, dy), md = a.geom.hw + b.geom.hw;
        if (d < md && d > 1e-4) {
          const nx = dx / d, ny = dy / d, pen = md - d;
          if (b.isRemote) { a.x += nx * pen; a.y += ny * pen; } else { a.x += nx * pen / 2; a.y += ny * pen / 2; b.x -= nx * pen / 2; b.y -= ny * pen / 2; }
          impulse2(a, b, bx + nx * b.geom.hw, by + ny * b.geom.hw, nx, ny);
        }
      }
    }
  }
  function impulse2(a, b, px, py, nx, ny) {
    const rax = px - a.x, ray = py - a.y, rbx = px - b.x, rby = py - b.y;
    const vax = a.vx - a.w * ray, vay = a.vy + a.w * rax, vbx = b.vx - b.w * rby, vby = b.vy + b.w * rbx;
    const vn = (vax - vbx) * nx + (vay - vby) * ny; if (vn >= 0) return;
    const rna = rax * ny - ray * nx, rnb = rbx * ny - rby * nx;
    const ima = 1 / a.spec.mass, imb = b.isRemote ? 0 : 1 / b.spec.mass, iia = 1 / a.spec.I, iib = b.isRemote ? 0 : 1 / b.spec.I;
    const j = -1.2 * vn / (ima + imb + rna * rna * iia + rnb * rnb * iib);
    a.vx += j * nx * ima; a.vy += j * ny * ima; a.w += rna * j * iia;
    b.vx -= j * nx * imb; b.vy -= j * ny * imb; b.w -= rnb * j * iib;
    if (-vn > 2.5) { if (a.isPlayer || b.isPlayer) { if (a.hitCD <= 0 || b.hitCD <= 0) { a.hitCD = b.hitCD = 0.35; onHit(a.isPlayer ? a : b, -vn); } } }
  }
  function updateCones(dt) {
    for (const k of cones) {
      for (const c of cars.concat(Object.values(remotes))) {
        const dx = k.x - c.x, dy = k.y - c.y, d = Math.hypot(dx, dy);
        if (d < c.geom.hl * 0.9 && d > 1e-3) {
          const sp = Math.hypot(c.vx, c.vy); k.vx = c.vx * 1.15 + dx / d * (2 + sp * 0.2); k.vy = c.vy * 1.15 + dy / d * (2 + sp * 0.2); k.w = (Math.random() - 0.5) * 18;
          if (!k.hit && c.isPlayer) { k.hit = true; AUDIO.cone(); }
        }
      }
      k.x += k.vx * dt; k.y += k.vy * dt; k.a += k.w * dt;
      const f = Math.pow(0.12, dt); k.vx *= f; k.vy *= f; k.w *= f;
    }
  }

  // ---------- прогресс по трассе ----------
  function progress(c) {
    if (tr.kind === 'arena') return;
    let d = c.seg - c.pseg; if (d > tr.N / 2) d -= tr.N; if (d < -tr.N / 2) d += tr.N;
    if (Math.abs(d) < 40) c.dist += d; c.pseg = c.seg;
  }

  // ---------- дрифт ----------
  function updateDrift(dt) {
    const c = player; const beta = c.vxl > 0.5 ? Math.abs(Math.atan2(c.vyl, c.vxl)) * 180 / Math.PI : 0;
    drift.angle = beta;
    if (state !== 'run') return;
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; if (drift.combo > 0) bank(); state = 'done'; finishDrift(); return; }
    const ok = c.spd > 6.5 && beta > 10 && beta < 115 && c.surf !== 'off';
    if (ok) {
      drift.idle = 0; drift.chainT += dt;
      const nm = Math.min(5, 1 + Math.floor(drift.chainT / 2) * 0.5);
      if (nm > drift.mult) { drift.mult = nm; feed('x' + nm.toFixed(1), 'gold'); }
      drift.combo += beta * c.spd * dt * 0.55 * (c.surf === 'curb' ? 0.8 : 1);
    } else if (drift.combo > 0) {
      if (c.surf === 'off') { failCombo('Вылет! Комбо сгорело'); return; }
      drift.idle += dt; if (drift.idle > 1.1) bank();
    }
  }
  function bank() {
    const pts = Math.round(drift.combo * drift.mult);
    if (pts > 0) { drift.total += pts; drift.best = Math.max(drift.best, pts); feed('+' + U.num(pts), pts > 3000 ? 'gold' : 'good'); }
    drift.combo = 0; drift.chainT = 0; drift.mult = 1; drift.idle = 0;
  }
  function failCombo(msg) { drift.combo = 0; drift.chainT = 0; drift.mult = 1; drift.idle = 0; feed(msg, 'bad'); AUDIO.bad(); }
  function finishDrift() {
    bigMsg('ФИНИШ', 1400);
    const score = drift.total, passed = score >= map.target;
    const money = Math.round(score / 25) + (passed ? 1500 + mapIdx * 200 : 0);
    const key = map.id, prev = SAVE.data.best[key] || 0; const record = score > prev;
    if (record) SAVE.data.best[key] = score;
    let unlocked = false;
    if (passed && SAVE.data.unlocked.drift < mapIdx + 2 && mapIdx + 1 < DATA.MAPS.drift.length) { SAVE.data.unlocked.drift = mapIdx + 2; unlocked = true; }
    SAVE.data.stats.drifts++; SAVE.data.stats.bestDrift = Math.max(SAVE.data.stats.bestDrift, score);
    SAVE.data.money += money; SAVE.save(); AUDIO.cash();
    G.result = { type: 'drift', score, passed, money, record, unlocked, best: drift.best };
    resultTimer = 1.6;
  }

  // ---------- гонка ----------
  function updateRace(dt) {
    if (state !== 'run') return;
    for (const c of cars) {
      const done = Math.max(0, Math.floor(c.dist / tr.N));
      if (done > c.lapsDone) {
        const lt = clock - c.lapStart; c.lapStart = clock; c.lapsDone = done; c.lastLap = lt; c.bestLap = Math.min(c.bestLap, lt);
        if (c.isPlayer && done < map.laps) { feed('Круг ' + done + ': ' + U.time(lt), 'good'); if (done === map.laps - 1) bigMsg('ПОСЛЕДНИЙ КРУГ', 1200); }
      }
      if (!c.finished && c.lapsDone >= map.laps) {
        c.finished = true; c.finT = clock - raceStart; c.place = ++finishOrder;
        if (c.isPlayer) finishRace();
      }
    }
  }
  function standings() {
    const list = cars.map(c => ({ nick: c.nick, me: c.isPlayer, fin: c.finished ? c.finT : 0, dist: c.dist, best: c.bestLap, car: c.def.name }));
    if (mp) for (const id in remotes) { const r = remotes[id]; list.push({ nick: r.nick, me: false, fin: r.fin || 0, dist: r.dist || 0, best: Infinity, car: r.def.name, remote: true }); }
    list.sort((a, b) => (a.fin && b.fin) ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.dist - a.dist);
    return list;
  }
  function finishRace() {
    const st = standings(); const pos = st.findIndex(x => x.me) + 1;
    bigMsg(pos === 1 ? 'ПОБЕДА!' : pos + '-е место', 1600);
    const mult = [1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.06][pos - 1] || 0.05;
    const money = Math.round(map.reward * mult * (mp ? 0.5 : 1));
    const key = map.id, prev = SAVE.data.best[key]; const record = !prev || player.finT < prev;
    if (record) SAVE.data.best[key] = +player.finT.toFixed(2);
    let unlocked = false;
    if (pos <= 3 && SAVE.data.unlocked.race < mapIdx + 2 && mapIdx + 1 < DATA.MAPS.race.length) { SAVE.data.unlocked.race = mapIdx + 2; unlocked = true; }
    SAVE.data.stats.races++; if (pos === 1) SAVE.data.stats.wins++;
    SAVE.data.money += money; SAVE.save(); AUDIO.cash();
    G.result = { type: 'race', pos, money, time: player.finT, best: player.bestLap, record, unlocked };
    if (mp) NET.mp.send({ fin: +player.finT.toFixed(2), dist: Math.round(player.dist), lap: player.lapsDone }, true);
    resultTimer = 2;
  }

  function showResults() {
    resultShown = true; paused = false; U.$('#pauseMenu').classList.add('hidden');
    const r = G.result, card = U.$('#resultCard');
    let h = '';
    if (r.type === 'drift') {
      h += '<h2>Дрифт-сессия завершена</h2><div class="res-big">' + U.num(r.score) + '</div><div class="res-sub">очков · цель ' + U.num(map.target) + (r.passed ? ' — <span style="color:var(--ok)">выполнено!</span>' : ' — не достигнута') + '</div>';
      h += '<div class="res-reward"><div><b>' + U.money(r.money) + '</b><span>награда</span></div><div><b>' + U.num(r.best) + '</b><span>лучшее комбо</span></div>' + (r.record ? '<div><b>★</b><span>новый рекорд</span></div>' : '') + '</div>';
      if (r.unlocked) h += '<p class="res-sub" style="color:var(--ok)">Открыта новая карта: ' + U.esc(DATA.MAPS.drift[mapIdx + 1].name) + '</p>';
      if (mp) { const list = [{ nick: player.nick, score: drift.total, me: true }].concat(Object.values(remotes).map(x => ({ nick: x.nick, score: x.score || 0 }))).sort((a, b) => b.score - a.score); h += '<table class="res-table">' + list.map((x, i) => '<tr class="' + (x.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + U.esc(x.nick) + '</td><td>' + U.num(x.score) + '</td></tr>').join('') + '</table>'; }
    } else {
      h += '<h2>' + (r.pos === 1 ? 'Победа!' : 'Финиш') + '</h2><div class="res-big">' + r.pos + '<small style="font-size:.4em"> место</small></div><div class="res-sub">Время: ' + U.time(r.time) + ' · лучший круг ' + U.time(r.best) + '</div>';
      h += '<div class="res-reward"><div><b>' + U.money(r.money) + '</b><span>награда</span></div>' + (r.record ? '<div><b>★</b><span>рекорд трассы</span></div>' : '') + '</div>';
      if (r.unlocked) h += '<p class="res-sub" style="color:var(--ok)">Открыта новая трасса: ' + U.esc(DATA.MAPS.race[mapIdx + 1].name) + '</p>';
      h += '<table class="res-table">' + standings().map((x, i) => '<tr class="' + (x.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + U.esc(x.nick) + '<br><small class="muted">' + U.esc(x.car) + '</small></td><td>' + (x.fin ? U.time(x.fin) : 'на трассе') + '</td></tr>').join('') + '</table>';
    }
    const next = !mp && mapIdx + 1 < DATA.MAPS[mode].length && mapIdx + 1 < SAVE.data.unlocked[mode];
    h += '<div class="res-btns">' + (mp ? '<button class="btn" id="rsLobby">В лобби</button>' : '<button class="btn" id="rsAgain">Ещё раз</button>' + (next ? '<button class="btn ok" id="rsNext">Следующая карта</button>' : '')) + '<button class="btn ghost" id="rsGarage">Гараж</button><button class="btn ghost" id="rsMenu">В меню</button></div>';
    card.innerHTML = h;
    U.$('#resultMenu').classList.remove('hidden');
    const on = (id, fn) => { const b = U.$('#' + id); if (b) b.onclick = fn; };
    on('rsAgain', () => G.restart());
    on('rsNext', () => { G.stop(); G.start({ mode, mapIdx: mapIdx + 1 }); });
    on('rsLobby', () => { G.stop(); UI.backToLobby(); });
    on('rsGarage', () => { G.stop(); if (mp) NET.mp.leave(); UI.openGarage(); });
    on('rsMenu', () => { G.stop(); if (mp) NET.mp.leave(); UI.show('mode'); });
  }

  // ---------- мультиплеер ----------
  function onPlayers(list) {
    const seen = {};
    for (const id in list) {
      if (id === NET.pid) continue; const p = list[id]; seen[id] = 1;
      if (!p.look || !DATA.CAR[p.look.car]) continue;
      let r = remotes[id];
      const lk = p.look, key = JSON.stringify(lk);
      if (!r || r.lookKey !== key) {
        const cfg = SAVE.newCarCfg(lk.car); cfg.kit = Object.assign(cfg.kit, lk.kit || {}); cfg.paint = Object.assign(cfg.paint, lk.paint || {});
        const look = { car: lk.car, kit: cfg.kit, paint: cfg.paint };
        const old = r; r = makeCar(look, cfg, { isRemote: true }); r.lookKey = key;
        if (old) { r.x = old.x; r.y = old.y; r.h = old.h; r.ready = old.ready; }
        remotes[id] = r;
      }
      r.nick = p.nick || 'Игрок'; r.score = p.score || 0; r.dist = p.dist || 0; r.fin = p.fin || 0;
      if (Array.isArray(p.s) && (p.s[0] || p.s[1])) {
        r.net = { x: p.s[0], y: p.s[1], h: p.s[2], vx: p.s[3], vy: p.s[4], st: p.s[5], at: performance.now() };
        if (!r.ready) { r.x = r.net.x; r.y = r.net.y; r.h = r.net.h; r.ready = true; }
      }
    }
    for (const id in remotes) if (!seen[id]) delete remotes[id];
  }
  function updateRemotes(dt) {
    const now = performance.now();
    for (const id in remotes) {
      const r = remotes[id]; if (!r.net) continue;
      const age = Math.min(0.5, (now - r.net.at) / 1000);
      const px = r.net.x + r.net.vx * age, py = r.net.y + r.net.vy * age;
      const k = Math.min(1, dt * 10);
      if (Math.hypot(px - r.x, py - r.y) > 25) { r.x = px; r.y = py; } else { r.x += (px - r.x) * k; r.y += (py - r.y) * k; }
      r.h += U.wrap(r.net.h - r.h) * k; r.vx = r.net.vx; r.vy = r.net.vy; r.steer = r.net.st || 0; r.w = 0;
      const ca = Math.cos(r.h), sa = Math.sin(r.h);
      r.vxl = ca * r.vx + sa * r.vy; r.vyl = -sa * r.vx + ca * r.vy; r.spd = Math.hypot(r.vx, r.vy);
      r.skid = Math.min(1.2, Math.abs(r.vyl) / 5); r.input = { brake: 0 };
      if (now - r.net.at > 12000) r.ready = false;
      emit(r, dt);
    }
  }

  // ---------- частицы и следы ----------
  function spawnSmoke(x, y, vx, vy, a, col) {
    const max = SAVE.s().quality === 'low' ? 160 : 380; if (smoke.length > max) smoke.shift();
    smoke.push({ x, y, vx, vy, r: 0.5 + Math.random() * 0.4, life: 0, max: 1.3 + Math.random() * 0.9, a, c: col });
  }
  function flames(c) {
    const g = c.geom, ca = Math.cos(c.h), sa = Math.sin(c.h);
    for (let i = 0; i < 3; i++) smoke.push({ x: c.x - ca * (g.hl + 0.3), y: c.y - sa * (g.hl + 0.3), vx: c.vx - ca * 6, vy: c.vy - sa * 6, r: 0.25, life: 0, max: 0.18, a: 1, c: '255,140,40', fire: true });
  }
  function emit(c, dt) {
    if (!c.geom) return;
    const g = c.geom, ca = Math.cos(c.h), sa = Math.sin(c.h);
    const rx = c.x + ca * g.xR, ry = c.y + sa * g.xR, ox = -sa * (g.hw - 0.15), oy = ca * (g.hw - 0.15);
    const L = [rx + ox, ry + oy], R = [rx - ox, ry - oy];
    const sk = c.skid || 0;
    if (sk > 0.32 && c.surf !== 'off' && c.spd > 1) {
      if (c.skidPrev) { pushSkid(c.skidPrev[0], c.skidPrev[1], L[0], L[1]); pushSkid(c.skidPrev[2], c.skidPrev[3], R[0], R[1]); }
      c.skidPrev = [L[0], L[1], R[0], R[1]];
      const rate = (sk - 0.3) * 20 * dt * (SAVE.s().quality === 'low' ? 0.5 : 1);
      for (let i = 0; i < rate + Math.random(); i++) { const w = Math.random() < 0.5 ? L : R; spawnSmoke(w[0], w[1], c.vx * 0.25 + (Math.random() - 0.5) * 2, c.vy * 0.25 + (Math.random() - 0.5) * 2, Math.min(0.2, sk * 0.14), th.smoke); }
    } else c.skidPrev = null;
    if (c.surf === 'off' && c.spd > 5 && Math.random() < c.spd * dt * 0.8) { const w = Math.random() < 0.5 ? L : R; spawnSmoke(w[0], w[1], c.vx * 0.15, c.vy * 0.15, 0.35, th.id === 'snow' ? '250,250,255' : th.id === 'desert' ? '210,180,120' : '120,100,70'); }
  }
  function pushSkid(x1, y1, x2, y2) {
    if (Math.hypot(x2 - x1, y2 - y1) > 4) return;
    const i = skid.head * 4; skid.buf[i] = x1; skid.buf[i + 1] = y1; skid.buf[i + 2] = x2; skid.buf[i + 3] = y2;
    skid.head = (skid.head + 1) % skid.cap; if (skid.n < skid.cap) skid.n++;
  }
  function updateParticles(dt) {
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i]; p.life += dt; if (p.life > p.max) { smoke.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; const f = Math.pow(0.25, dt); p.vx *= f; p.vy *= f; p.r += dt * (p.fire ? 1 : 2.4);
    }
    if (th.rain) for (const d of rain) { d.y += dt * d.s * 1.6; d.x -= dt * 0.15; if (d.y > 1) { d.y -= 1; d.x = Math.random(); } if (d.x < 0) d.x += 1; }
  }

  // ---------- камера ----------
  function updateCamera(dt) {
    const base = Math.min(W, H) / (U.isMobile ? 26 : 30);
    const zt = 1 - Math.min(0.45, player.spd / 95);
    cam.zoom += (zt - cam.zoom) * Math.min(1, dt * 1.5);
    cam.s = base * cam.zoom;
    const tx = player.x + player.vx * 0.32, ty = player.y + player.vy * 0.32;
    cam.x += (tx - cam.x) * Math.min(1, dt * 5); cam.y += (ty - cam.y) * Math.min(1, dt * 5);
    if (SAVE.s().camera === 'rotate') { const target = -player.h - Math.PI / 2; cam.rot += U.wrap(target - cam.rot) * Math.min(1, dt * 4); }
    else cam.rot += U.wrap(0 - cam.rot) * Math.min(1, dt * 4);
  }
  function camTransform(c, scale) {
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.translate(W / 2, H / 2); c.rotate(cam.rot); c.scale(cam.s, cam.s); c.translate(-cam.x, -cam.y);
  }
  function toScreen(x, y) {
    const dx = x - cam.x, dy = y - cam.y, cs = Math.cos(cam.rot), sn = Math.sin(cam.rot);
    return [W / 2 + (dx * cs - dy * sn) * cam.s, H / 2 + (dx * sn + dy * cs) * cam.s];
  }

  // ---------- отрисовка ----------
  function render() {
    const R = Math.hypot(W, H) / 2 / cam.s + 4;
    const v = { x0: cam.x - R, y0: cam.y - R, x1: cam.x + R, y1: cam.y + R };
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = th.ground; ctx.fillRect(0, 0, cv.width, cv.height);
    camTransform(ctx, dpr);
    TRACK.drawGround(ctx, tr, v);
    TRACK.draw(ctx, tr, v, mode === 'race');
    // следы шин
    if (skid.n) {
      ctx.strokeStyle = th.skid; ctx.lineWidth = 0.24; ctx.lineCap = 'round'; ctx.beginPath();
      const b = skid.buf; for (let i = 0; i < skid.n; i++) { const k = i * 4; ctx.moveTo(b[k], b[k + 1]); ctx.lineTo(b[k + 2], b[k + 3]); }
      ctx.stroke(); ctx.lineCap = 'butt';
    }
    TRACK.drawObstacles(ctx, tr);
    for (const k of cones) { ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-0.3, -0.25, 0.7, 0.7); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.35, -0.35); ctx.lineTo(0.35, -0.35); ctx.lineTo(0.35, 0.35); ctx.lineTo(-0.35, 0.35); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, 7); ctx.fill(); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, 7); ctx.fill(); ctx.restore(); }
    // машины
    const lights = th.night;
    const drawCar = c => {
      if (c.x < v.x0 - 5 || c.x > v.x1 + 5 || c.y < v.y0 - 5 || c.y > v.y1 + 5) return;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.h);
      CARR.drawTop(ctx, c.look, { steer: c.steer, brake: c.input && c.input.brake > 0 && c.vxl > 0.5, reverse: c.vxl < -0.5, lights });
      ctx.restore();
    };
    for (const id in remotes) if (remotes[id].ready) drawCar(remotes[id]);
    for (const c of cars) if (!c.isPlayer) drawCar(c);
    drawCar(player);
    // дым
    for (const p of smoke) {
      const k = p.life / p.max, a = p.a * (1 - k) * (p.fire ? 1 : 0.9);
      ctx.fillStyle = 'rgba(' + p.c + ',' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    TRACK.drawDecos(ctx, tr, v, clock);
    // ночь: тьма с вырезанными фарами и фонарями
    if (th.night) {
      const s = 0.5 * dpr;
      lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = th.id === 'neon' ? 'rgba(8,4,24,.8)' : 'rgba(3,6,16,.84)'; lctx.fillRect(0, 0, lightC.width, lightC.height);
      lctx.globalCompositeOperation = 'destination-out';
      camTransform(lctx, s);
      for (const l of tr.lamps) {
        if (l.x < v.x0 - 15 || l.x > v.x1 + 15 || l.y < v.y0 - 15 || l.y > v.y1 + 15) continue;
        const gr = lctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 15); gr.addColorStop(0, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = gr; lctx.fillRect(l.x - 15, l.y - 15, 30, 30);
      }
      const beam = c => {
        lctx.save(); lctx.translate(c.x, c.y); lctx.rotate(c.h);
        let gr = lctx.createRadialGradient(0, 0, 0, 0, 0, 6); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); lctx.fillStyle = gr; lctx.fillRect(-6, -6, 12, 12);
        lctx.scale(1, 0.5); gr = lctx.createRadialGradient(4, 0, 1, 12, 0, 26); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = gr; lctx.beginPath(); lctx.arc(12, 0, 26, 0, 7); lctx.fill(); lctx.restore();
      };
      cars.forEach(beam); for (const id in remotes) if (remotes[id].ready) beam(remotes[id]);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lightC, 0, 0, cv.width, cv.height);
      // тёплое свечение фонарей
      camTransform(ctx, dpr); ctx.globalCompositeOperation = 'lighter';
      for (const l of tr.lamps) { if (l.x < v.x0 || l.x > v.x1 || l.y < v.y0 || l.y > v.y1) continue; const gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 9); gr.addColorStop(0, th.id === 'neon' ? 'rgba(255,43,214,.22)' : 'rgba(255,200,120,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(l.x - 9, l.y - 9, 18, 18); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // ники над машинами
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 12px Manrope, sans-serif'; ctx.textAlign = 'center';
    const tag = c => { if (!c.ready && c.isRemote) return; const [sx, sy] = toScreen(c.x, c.y); if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) return; const t = c.nick || ''; const w = ctx.measureText(t).width + 12; ctx.fillStyle = 'rgba(0,0,0,.5)'; U.rr(ctx, sx - w / 2, sy - cam.s * 2.6 - 16, w, 18, 6); ctx.fill(); ctx.fillStyle = c.isPlayer ? '#ffd27a' : '#fff'; ctx.fillText(t, sx, sy - cam.s * 2.6 - 3); };
    for (const c of cars) if (!c.isPlayer) tag(c);
    for (const id in remotes) tag(remotes[id]);
    if (mp) tag(player);
    // дождь
    if (th.rain) { ctx.strokeStyle = 'rgba(190,210,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); for (const d of rain) { const x = d.x * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14 * d.s); } ctx.stroke(); }
    drawMinimap();
  }
  function drawMinimap() {
    const s = mmc.width; mmx.clearRect(0, 0, s, s); mmx.drawImage(mini.c, 0, 0);
    const dot = (c, col, r) => { mmx.fillStyle = col; mmx.beginPath(); mmx.arc(mini.ox + c.x * mini.sc, mini.oy + c.y * mini.sc, r, 0, 7); mmx.fill(); };
    for (const c of cars) if (!c.isPlayer) dot(c, '#ff4d5e', 4);
    for (const id in remotes) if (remotes[id].ready) dot(remotes[id], '#3d8bff', 4.5);
    mmx.strokeStyle = '#000'; mmx.lineWidth = 2; dot(player, '#ffc83d', 5.5);
  }

  // ---------- HUD ----------
  function buildHUD() {
    if (mode === 'drift') {
      el.tl.innerHTML = '<div class="hbox"><div class="k">Очки</div><div class="v" id="hScore">0</div></div><div class="hbox"><div class="k">Время</div><div class="v" id="hTime">0:00</div></div><div class="hbox"><div class="k">Цель</div><div class="v"><small>' + U.num(map.target) + '</small></div></div>';
      el.top.innerHTML = '<div class="combo" id="hCombo"><div><span class="pts" id="hCPts">0</span><span class="mul" id="hMul">x1</span></div><div class="ang" id="hAng">0°</div><div class="cbar"><i id="hCBar"></i></div></div>';
    } else {
      el.tl.innerHTML = '<div class="hbox"><div class="k">Позиция</div><div class="v" id="hPos">1/1</div></div><div class="hbox"><div class="k">Круг</div><div class="v" id="hLap">1/' + map.laps + '</div></div><div class="hbox"><div class="k">Время</div><div class="v" id="hRT">0:00.00</div><div class="k" id="hBest" style="margin-top:2px"></div></div>';
      el.top.innerHTML = '';
    }
    el.board.innerHTML = '';
    el.big.className = ''; el.feed.innerHTML = '';
    hudCache = {};
  }
  const setT = (id, v) => { if (hudCache[id] === v) return; hudCache[id] = v; const e = document.getElementById(id); if (e) e.textContent = v; };
  function updateHUD() {
    const kmh = Math.round(Math.abs(player.vxl) * 3.6);
    setT('spdVal', String(kmh));
    setT('gearVal', player.vxl < -0.5 ? 'R' : player.spd < 0.5 && !player.input.throttle ? 'N' : String(player.gear));
    el.rpm.style.width = (U.clamp(player.rpm / player.spec.redline, 0, 1) * 100).toFixed(1) + '%';
    if (mode === 'drift') {
      setT('hScore', U.num(drift.total)); setT('hTime', U.clock(timeLeft));
      const cb = U.$('#hCombo');
      if (cb) {
        const on = drift.combo > 0; if (hudCache.combo !== on) { cb.classList.toggle('on', on); hudCache.combo = on; }
        if (on) { setT('hCPts', U.num(drift.combo)); setT('hMul', 'x' + drift.mult.toFixed(1)); setT('hAng', Math.round(drift.angle) + '°'); const b = U.$('#hCBar'); if (b) b.style.width = ((drift.chainT % 2) / 2 * 100).toFixed(0) + '%'; }
      }
      if (mp && (clock * 4 | 0) !== hudCache.boardT) {
        hudCache.boardT = clock * 4 | 0;
        const list = [{ nick: player.nick, score: drift.total, me: true }].concat(Object.values(remotes).map(x => ({ nick: x.nick, score: x.score || 0 }))).sort((a, b) => b.score - a.score);
        el.board.innerHTML = list.slice(0, 8).map((x, i) => '<div class="' + (x.me ? 'me' : '') + '"><span>' + (i + 1) + '. ' + U.esc(x.nick) + '</span><b>' + U.num(x.score) + '</b></div>').join('');
      }
    } else {
      if ((clock * 4 | 0) !== hudCache.boardT) {
        hudCache.boardT = clock * 4 | 0;
        const st = standings(); const pos = st.findIndex(x => x.me) + 1;
        setT('hPos', pos + '/' + st.length);
        el.board.innerHTML = st.slice(0, 8).map((x, i) => '<div class="' + (x.me ? 'me' : '') + '"><span>' + (i + 1) + '. ' + U.esc(x.nick) + '</span><b>' + (x.fin ? U.time(x.fin) : '') + '</b></div>').join('');
      }
      setT('hLap', Math.min(map.laps, player.lapsDone + 1) + '/' + map.laps);
      setT('hRT', state === 'run' ? U.time(player.finished ? player.finT : clock - raceStart) : '0:00.00');
      setT('hBest', isFinite(player.bestLap) ? 'лучший ' + U.time(player.bestLap) : '');
    }
  }
  let bigT = 0;
  function bigMsg(t, ms) { el.big.innerHTML = t; el.big.className = 'on'; clearTimeout(bigT); bigT = setTimeout(() => el.big.className = '', ms || 750); }
  function feed(t, cls) { const d = U.el('div', cls || '', U.esc(t)); el.feed.appendChild(d); setTimeout(() => d.remove(), 1600); while (el.feed.children.length > 4) el.feed.firstChild.remove(); }

  G.isMp = () => mp;
  G.mapInfo = () => ({ mode, mapIdx });
  return G;
})();
