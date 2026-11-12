'use strict';
// Весь звук синтезируется через Web Audio API — без файлов.
// Двигатель: гармонический спектр по числу цилиндров + шум сгорания + впуск + турбина + вой КПП.
// Шины: тональный визг с «дрожанием», хруст гравия, рёв поребрика, шум дороги и ветра.
// Окружение: отдельная звуковая сцена на каждую тему карты. Музыка: пошаговый секвенсор с сайдчейном.
const AUDIO = (() => {
  const A = {};
  let ctx = null, master = null, comp = null, white = null, brown = null, verb = null;
  const bus = {};
  let musicTimer = null, cur = null, step = 0, nextT = 0, melody = null, fileEl = null, fileSrc = null, fileName = '', duck = null;
  let eng = null, amb = null;

  const TRACKS = [
    { name: 'Гравий и неон', style: 'Darksynth', bpm: 118, root: 38, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 3, 4],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: 'x.xxx.xxx.xxx.xx', lead: 'saw', dens: 0.3, pad: true, arp: true },
    { name: 'Боковой ветер', style: 'Drift Phonk', bpm: 140, root: 41, scale: [0, 1, 3, 5, 7, 8, 10], prog: [0, 0, 5, 6],
      kick: 'x.....x...x..x..', snare: '....x.......x...', hat: 'x.x.x.xxx.x.x.xx', bass: 'x.....x...x.....', lead: 'bell', dens: 0.55, clap: true },
    { name: 'Трасса 7', style: 'House', bpm: 124, root: 45, scale: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 4, 3],
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', bass: '..x...x...x...xx', lead: 'stab', dens: 0.25, clap: true, openHat: true, pad: true },
    { name: 'Холодный старт', style: 'Breakbeat', bpm: 136, root: 43, scale: [0, 2, 3, 5, 7, 8, 11], prog: [0, 5, 6, 4],
      kick: 'x.....x...x.....', snare: '....x..x.x..x...', hat: 'xxx.xxx.xxx.xxxx', bass: 'x..x..x...x.x...', lead: 'square', dens: 0.28, pad: true },
    { name: 'Сонный город', style: 'Lo-fi', bpm: 82, root: 50, scale: [0, 2, 4, 5, 7, 9, 11], prog: [1, 4, 0, 5],
      kick: 'x......x..x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', bass: 'x......x..x.....', lead: 'keys', dens: 0.32, pad: true, crackle: true },
    { name: 'Финишная прямая', style: 'Electro', bpm: 128, root: 40, scale: [0, 2, 3, 5, 7, 8, 10], prog: [0, 0, 3, 4],
      kick: 'x..x..x...x..x..', snare: '....x.......x...', hat: 'x.xxx.xxx.xxx.x.', bass: 'xx.xx.xx.xx.x.xx', lead: 'saw', dens: 0.22, clap: true },
  ];
  A.TRACKS = TRACKS;
  A.ready = () => !!ctx;

  function makeVerb(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    const cv = ctx.createConvolver(); cv.buffer = b; return cv;
  }
  A.init = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC(); } catch (e) { return; }
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.connect(comp); comp.connect(ctx.destination);
    ['music', 'engine', 'tire', 'amb', 'sfx'].forEach(k => { bus[k] = ctx.createGain(); bus[k].connect(master); });
    verb = makeVerb(2.4, 3); const vg = ctx.createGain(); vg.gain.value = 0.35; verb.connect(vg); vg.connect(master);
    const len = ctx.sampleRate * 3;
    white = ctx.createBuffer(1, len, ctx.sampleRate); brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { w[i] = Math.random() * 2 - 1; last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5; }
    duck = ctx.createGain(); duck.connect(bus.music);
    A.apply();
    const s = SAVE.s(); if (s.musicOn) A.playMusic(s.track);
  };
  A.apply = function () {
    if (!ctx) return; const s = SAVE.s(), t = ctx.currentTime;
    master.gain.setTargetAtTime(s.master, t, 0.05);
    bus.music.gain.setTargetAtTime(s.musicOn ? s.music * 0.55 : 0, t, 0.05);
    bus.engine.gain.setTargetAtTime(s.engine, t, 0.05);
    bus.tire.gain.setTargetAtTime(s.tire, t, 0.05);
    bus.amb.gain.setTargetAtTime(s.amb, t, 0.05);
    bus.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    if (s.musicOn && !musicTimer && !(fileEl && !fileEl.paused) && cur === null) A.playMusic(s.track);
    if (!s.musicOn) A.stopMusic();
  };

  // ---------- примитивы ----------
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function gain(v, out) { const g = ctx.createGain(); g.gain.value = v; if (out) g.connect(out); return g; }
  function filt(type, f, q, out) { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q || 0.7; if (out) x.connect(out); return x; }
  function pan(p, out) { if (!ctx.createStereoPanner) return out; const s = ctx.createStereoPanner(); s.pan.value = p; s.connect(out); return s; }
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function src(buf, loop) { const s = ctx.createBufferSource(); s.buffer = buf || white; s.loop = !!loop; return s; }
  function noise(t, dur, type, freq, q, peak, out, buf, f2) {
    const s = src(buf), f = filt(type, freq, q), g = ctx.createGain(); env(g, t, 0.002, peak, dur);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(f); f.connect(g); g.connect(out || bus.sfx); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
    return g;
  }
  function tone(type, f, t, a, peak, d, out, f2) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = ctx.createGain(); env(g, t, a, peak, d); o.connect(g); g.connect(out || bus.sfx); o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function softClip(k) { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); } return c; }

  // ---------- музыка ----------
  function kick(t) {
    tone('sine', 165, t, 0.002, 1, 0.34, bus.music, 44); noise(t, 0.012, 'highpass', 3000, 0.7, 0.25, bus.music);
    if (duck) { duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.35, t); duck.gain.linearRampToValueAtTime(1, t + 0.22); }
  }
  function snare(t) { noise(t, 0.2, 'bandpass', 1900, 0.6, 0.38, bus.music); tone('triangle', 210, t, 0.002, 0.25, 0.09, bus.music, 160); }
  function clap(t) { for (let i = 0; i < 3; i++) noise(t + i * 0.012, 0.04, 'bandpass', 1300, 1.4, 0.32, bus.music); noise(t + 0.036, 0.22, 'bandpass', 1200, 1.1, 0.24, verb); noise(t + 0.036, 0.2, 'bandpass', 1200, 1.1, 0.22, bus.music); }
  function hat(t, v, open) { noise(t, open ? 0.22 : 0.03, 'highpass', 8200, 0.9, v, bus.music); }
  function bass(m, t, dur, T) {
    const o = ctx.createOscillator(); o.type = T.style === 'House' || T.style === 'Lo-fi' ? 'triangle' : 'sawtooth'; o.frequency.value = mtof(m);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = mtof(m - 12);
    const f = filt('lowpass', 900, 4); f.frequency.setValueAtTime(T.style === 'Electro' ? 1800 : 900, t); f.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = ctx.createGain(); env(g, t, 0.006, 0.3, dur); o.connect(f); o2.connect(gain(0.6, f)); f.connect(g); g.connect(duck);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function lead(m, t, dur, kind) {
    const f0 = mtof(m);
    if (kind === 'bell') {
      const g = ctx.createGain(); env(g, t, 0.002, 0.14, 0.28); g.connect(bus.music); g.connect(gain(0.4, verb));
      [1, 1.5, 2.76].forEach((r, i) => { const o = ctx.createOscillator(); o.type = i ? 'sine' : 'square'; o.frequency.value = f0 * r; o.connect(gain(i ? 0.5 : 0.35, g)); o.start(t); o.stop(t + 0.35); });
      return;
    }
    if (kind === 'keys') {
      const g = ctx.createGain(); env(g, t, 0.004, 0.16, dur * 1.8); const f = filt('lowpass', 2200, 0.7, g); g.connect(duck); g.connect(gain(0.5, verb));
      [0, 7].forEach(dt => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f0; o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur * 2); });
      return;
    }
    if (kind === 'stab') {
      const g = ctx.createGain(); env(g, t, 0.004, 0.09, 0.18); const f = filt('lowpass', 2600, 2, g); g.connect(duck); g.connect(gain(0.6, verb));
      [0, 3, 7].forEach(iv => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m + iv); o.connect(f); o.start(t); o.stop(t + 0.25); });
      return;
    }
    const o = ctx.createOscillator(); o.type = kind === 'saw' ? 'sawtooth' : kind;
    o.frequency.value = f0;
    const o2 = ctx.createOscillator(); o2.type = o.type; o2.frequency.value = f0; o2.detune.value = 12;
    const f = filt('lowpass', 2600, 1.5); f.frequency.setValueAtTime(3400, t); f.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain(); env(g, t, 0.01, 0.07, dur); o.connect(f); o2.connect(f); f.connect(g); g.connect(duck); g.connect(gain(0.5, verb));
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function pad(notes, t, dur) {
    const f = filt('lowpass', 1100, 0.8);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + dur * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(duck); g.connect(gain(0.8, verb));
    notes.forEach(m => [-9, 0, 9].forEach(dt => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(t + dur + 0.05); }));
  }
  function noteOf(T, deg, oct) { const sc = T.scale, n = sc.length; const o = Math.floor(deg / n), d = ((deg % n) + n) % n; return T.root + 12 * (oct + o) + sc[d] + 12; }
  function playStep(st, t) {
    const T = cur, i = st % 16, bar = Math.floor(st / 16), sd = 60 / T.bpm / 4;
    const sw = (T.style === 'Lo-fi' && i % 2) ? sd * 0.18 : 0; t += sw;
    const deg = T.prog[bar % T.prog.length];
    if (T.kick[i] === 'x') kick(t);
    if (T.snare[i] === 'x') (T.clap ? clap : snare)(t);
    if (T.hat[i] === 'x') hat(t, i % 4 === 2 ? 0.12 : 0.06, T.openHat && i % 4 === 2);
    if (T.bass[i] === 'x') bass(noteOf(T, deg, -1), t, sd * (T.bass[i + 1] === '.' ? 1.8 : 0.9), T);
    if (T.pad && i === 0) pad([noteOf(T, deg, 0), noteOf(T, deg + 2, 0), noteOf(T, deg + 4, 0)], t, sd * 16);
    if (T.arp && i % 2 === 0) lead(noteOf(T, deg + [0, 2, 4, 7][(i / 2) % 4], 1), t, sd * 1.1, 'square');
    if (T.crackle && Math.random() < 0.35) noise(t + Math.random() * sd, 0.004, 'highpass', 3000, 0.7, 0.05 + Math.random() * 0.06, bus.music);
    const mm = melody[st % 32];
    if (mm !== null && (bar % 4 !== 3 || T.lead === 'bell')) lead(noteOf(T, deg + mm, 1), t, sd * 1.6, T.lead);
  }
  function scheduler() {
    if (!ctx || !cur) return;
    while (nextT < ctx.currentTime + 0.15) { playStep(step, nextT); nextT += 60 / cur.bpm / 4; step++; }
  }
  A.playMusic = function (i) {
    if (!ctx) return;
    A.stopMusic();
    if (i === 'file') { if (fileEl && fileEl.src) { fileEl.play().catch(() => { }); } return; }
    cur = TRACKS[i] || TRACKS[0];
    const r = U.rng(U.hash(cur.name)); const tones = [0, 2, 4, 0, 4, 6, 7, -1, 3, 2];
    melody = []; for (let k = 0; k < 32; k++) melody.push(r() < cur.dens ? tones[Math.floor(r() * tones.length)] : null);
    step = 0; nextT = ctx.currentTime + 0.12;
    musicTimer = setInterval(scheduler, 25);
  };
  A.stopMusic = function () { clearInterval(musicTimer); musicTimer = null; cur = null; if (fileEl) fileEl.pause(); };
  A.playFile = function (file) {
    A.init(); if (!ctx) return;
    A.stopMusic();
    if (!fileEl) { fileEl = new Audio(); fileEl.loop = true; fileSrc = ctx.createMediaElementSource(fileEl); fileSrc.connect(bus.music); }
    fileEl.src = URL.createObjectURL(file); fileName = file.name; fileEl.play().catch(() => { });
  };
  A.fileName = () => fileName;
  A.nowPlaying = () => cur ? cur.name : (fileEl && !fileEl.paused ? fileName : '');

  // ---------- двигатель ----------
  // Спектр одного рабочего цикла (2 оборота): пик на гармонике = числу цилиндров (частота вспышек),
  // плюс «рваные» низкие гармоники — у V8 и трёшек сильнее (бурление), у V12 почти нет (гладкий вой).
  const waves = {};
  function engineWave(cyl) {
    if (waves[cyl]) return waves[cyl];
    const N = 72, re = new Float32Array(N), im = new Float32Array(N), r = U.rng(cyl * 131 + 7);
    const lump = { 3: 0.42, 4: 0.22, 5: 0.3, 6: 0.14, 8: 0.5, 10: 0.2, 12: 0.06 }[cyl] || 0.2;
    const gs = (n, c, w) => Math.exp(-Math.pow((n - c) / w, 2));
    for (let n = 1; n < N; n++) {
      let a = gs(n, cyl, cyl * 0.42) + 0.6 * gs(n, cyl * 2, cyl * 0.6) + 0.32 * gs(n, cyl * 3, cyl * 0.8) + 0.16 * gs(n, cyl * 4, cyl);
      if (n < cyl * 1.6) a += lump * (0.25 + r() * 0.75) / Math.sqrt(n);
      a += 0.05 / n;
      const ph = r() * Math.PI * 2; re[n] = a * Math.cos(ph); im[n] = a * Math.sin(ph);
    }
    return (waves[cyl] = ctx.createPeriodicWave(re, im));
  }
  A.engineStart = function (spec) {
    if (!ctx) return; A.engineStop();
    const cyl = spec.cyl || 4, t = ctx.currentTime, nodes = [];
    const out = gain(0, bus.engine);
    const body = filt('peaking', 110, 1, out); body.gain.value = 5;
    const lp = filt('lowpass', 700, 2.2, body);
    const shaper = ctx.createWaveShaper(); shaper.curve = softClip(cyl >= 8 ? 2.6 : 1.8); shaper.oversample = '2x'; shaper.connect(lp);
    const drive = gain(0.6, shaper);
    // основной тон двигателя
    const osc = ctx.createOscillator(); osc.setPeriodicWave(engineWave(cyl)); osc.connect(drive);
    const osc2 = ctx.createOscillator(); osc2.setPeriodicWave(engineWave(cyl)); osc2.detune.value = 9; osc2.connect(gain(0.45, drive));
    // шум сгорания с амплитудной модуляцией частотой вспышек — даёт «зерно» выхлопа
    const cn = src(brown, true), cbp = filt('bandpass', 300, 0.9), cam = gain(0.04);
    cn.connect(cbp); cbp.connect(cam); cam.connect(drive);
    const mod = ctx.createOscillator(); mod.type = 'square'; const modG = gain(0.05); mod.connect(modG); modG.connect(cam.gain);
    // впуск: шипящий рёв на нагрузке
    const ink = src(white, true), ibp = filt('bandpass', 1200, 1.6), inG = gain(0, out); ink.connect(ibp); ibp.connect(inG);
    // турбина: свист + шорох
    const tb = ctx.createOscillator(); tb.type = 'sine'; const tbG = gain(0, bus.engine); tb.connect(tbG);
    const tn = src(white, true), tnf = filt('bandpass', 4000, 5), tnG = gain(0, bus.engine); tn.connect(tnf); tnf.connect(tnG);
    // вой коробки передач
    const wh = ctx.createOscillator(); wh.type = 'triangle'; const whG = gain(0, bus.engine); wh.connect(filt('bandpass', 900, 1.2, whG));
    // шины
    const sqO = ctx.createOscillator(); sqO.type = 'sawtooth'; sqO.frequency.value = 480;
    const vib1 = ctx.createOscillator(); vib1.frequency.value = 6.3; const v1g = gain(16); vib1.connect(v1g); v1g.connect(sqO.frequency);
    const vib2 = ctx.createOscillator(); vib2.frequency.value = 13.7; const v2g = gain(9); vib2.connect(v2g); v2g.connect(sqO.frequency);
    const sqBp = filt('bandpass', 1150, 2.5), sqG = gain(0, bus.tire); sqO.connect(sqBp); sqBp.connect(sqG);
    const sqN = src(white, true), sqNf = filt('bandpass', 2300, 3), sqNG = gain(0, bus.tire); sqN.connect(sqNf); sqNf.connect(sqNG);
    const gr = src(white, true), grF = filt('highpass', 700, 0.7), grAm = gain(0.5), grG = gain(0, bus.tire); gr.connect(grF); grF.connect(grAm); grAm.connect(grG);
    const grMod = src(white, true), grModF = filt('lowpass', 35, 0.7), grModG = gain(5); grMod.connect(grModF); grModF.connect(grModG); grModG.connect(grAm.gain);
    const rmb = src(brown, true), rmbF = filt('lowpass', 160, 1), rmbAm = gain(0.5), rmbG = gain(0, bus.tire); rmb.connect(rmbF); rmbF.connect(rmbAm); rmbAm.connect(rmbG);
    const curbO = ctx.createOscillator(); curbO.type = 'square'; const curbG = gain(0); curbO.connect(curbG); curbG.connect(rmbAm.gain);
    const road = src(brown, true), roadF = filt('lowpass', 420, 0.7), roadG = gain(0, bus.tire); road.connect(roadF); roadF.connect(roadG);
    const wind = src(white, true), wF = filt('bandpass', 650, 0.5), wG = gain(0, bus.tire); wind.connect(wF); wF.connect(wG);
    const startable = [osc, osc2, cn, mod, ink, tb, tn, wh, sqO, vib1, vib2, sqN, gr, grMod, rmb, curbO, road, wind];
    startable.forEach(n => { n.start(t); nodes.push(n); });
    eng = { osc, osc2, lp, drive, cbp, modG, mod, ibp, inG, out, tb, tbG, tnf, tnG, wh, whG, sqO, sqBp, sqG, sqNG, grG, rmbG, curbO, curbG, roadG, wG, wF, nodes, spec, cyl, lastThr: 0, lastRpm: spec.idle || 900 };
  };
  A.engineUpdate = function (rpm, thr, spd, skid, surf) {
    if (!eng || !ctx) return; const t = ctx.currentTime, s = eng.spec, e = eng;
    const rn = U.clamp((rpm - (s.idle || 900)) / (s.redline - (s.idle || 900)), 0, 1.05);
    const f0 = rpm / 120, fire = f0 * e.cyl;
    e.osc.frequency.setTargetAtTime(f0, t, 0.015); e.osc2.frequency.setTargetAtTime(f0, t, 0.015);
    e.mod.frequency.setTargetAtTime(fire, t, 0.015);
    e.cbp.frequency.setTargetAtTime(Math.min(4000, fire * 1.6 + 120), t, 0.03);
    e.modG.gain.setTargetAtTime(0.02 + thr * 0.09, t, 0.04);
    e.drive.gain.setTargetAtTime(0.45 + thr * 0.9 + rn * 0.3, t, 0.04);
    e.lp.frequency.setTargetAtTime(260 + thr * 1500 + rn * 2400, t, 0.04);
    e.out.gain.setTargetAtTime(0.13 + thr * 0.17 + rn * 0.09, t, 0.05);
    e.ibp.frequency.setTargetAtTime(700 + rn * 2600, t, 0.05);
    e.inG.gain.setTargetAtTime(thr * (0.02 + rn * 0.07), t, 0.06);
    const tl = s.turbo || 0;
    e.tb.frequency.setTargetAtTime(1800 + rn * 4200, t, 0.08);
    e.tbG.gain.setTargetAtTime(tl ? thr * rn * 0.008 * tl : 0, t, 0.15);
    e.tnf.frequency.setTargetAtTime(2500 + rn * 3500, t, 0.1);
    e.tnG.gain.setTargetAtTime(tl ? thr * rn * 0.015 * tl : 0, t, 0.15);
    e.wh.frequency.setTargetAtTime(Math.max(30, spd * 38), t, 0.05);
    e.whG.gain.setTargetAtTime(spd > 2 ? Math.min(0.03, spd / 1200) * (0.4 + (1 - thr) * 0.6) : 0, t, 0.1);
    if (tl && e.lastThr > 0.6 && thr < 0.1 && rn > 0.45) A.blowoff(tl);
    if (e.lastThr > 0.7 && thr < 0.1 && rn > 0.6 && Math.random() < 0.75) A.backfire();
    e.lastThr = thr; e.lastRpm = rpm;
    // шины
    const sk = U.clamp(skid, 0, 1.2), onRoad = surf !== 'off';
    const sq = onRoad && sk > 0.14 ? Math.min(1, (sk - 0.14) * 1.6) : 0;
    e.sqO.frequency.setTargetAtTime(430 + sk * 160 + Math.min(spd, 40) * 1.5, t, 0.08);
    e.sqBp.frequency.setTargetAtTime(1000 + sk * 450, t, 0.08);
    e.sqG.gain.setTargetAtTime(sq * 0.11, t, 0.05);
    e.sqNG.gain.setTargetAtTime(sq * 0.06, t, 0.05);
    e.grG.gain.setTargetAtTime(surf === 'off' ? Math.min(0.3, spd / 40) : 0, t, 0.06);
    e.curbO.frequency.setTargetAtTime(Math.max(4, spd * 2.2), t, 0.05);
    e.curbG.gain.setTargetAtTime(surf === 'curb' ? 0.5 : 0, t, 0.03);
    e.rmbG.gain.setTargetAtTime(surf === 'curb' ? Math.min(0.5, spd / 25) : surf === 'off' ? Math.min(0.35, spd / 30) : 0, t, 0.05);
    e.roadG.gain.setTargetAtTime(Math.min(0.09, spd / 450), t, 0.1);
    e.wF.frequency.setTargetAtTime(500 + spd * 9, t, 0.2);
    e.wG.gain.setTargetAtTime(Math.min(0.1, spd * spd / 22000), t, 0.15);
  };
  A.engineStop = function () {
    if (!eng) return; const e = eng; eng = null;
    try { e.out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); [e.sqG, e.sqNG, e.grG, e.rmbG, e.roadG, e.wG, e.tbG, e.tnG, e.whG].forEach(g => g.gain.setTargetAtTime(0, ctx.currentTime, 0.05)); } catch (x) { }
    setTimeout(() => e.nodes.forEach(n => { try { n.stop(); } catch (x) { } }), 250);
  };
  // хлопки и «стрельба» на сбросе газа
  A.backfire = function () {
    if (!ctx) return; const t = ctx.currentTime, n = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const tt = t + 0.04 + i * (0.05 + Math.random() * 0.09), big = Math.random() < 0.3;
      noise(tt, big ? 0.09 : 0.035, 'bandpass', 900 + Math.random() * 1600, 0.8, big ? 0.55 : 0.3, bus.engine);
      if (big) tone('sine', 90, tt, 0.002, 0.5, 0.12, bus.engine, 45);
    }
  };
  // сброс давления турбины: шипящий свип, на высоких уровнях — «чирикание»
  A.blowoff = function (lvl) {
    if (!ctx) return; const t = ctx.currentTime;
    const g = noise(t, 0.45, 'bandpass', 3600, 2.5, 0.16, bus.engine, white, 900);
    if ((lvl || 1) >= 2) { const l = ctx.createOscillator(); l.frequency.value = 24; const lg = gain(0.08); l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + 0.45); }
  };
  A.shift = function () { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.05, 'bandpass', 700, 1.5, 0.12, bus.engine); tone('sine', 120, t, 0.002, 0.12, 0.06, bus.engine, 70); };

  // ---------- эффекты ----------
  A.hit = function (imp) {
    if (!ctx) return; const t = ctx.currentTime, v = U.clamp(imp / 14, 0.1, 1);
    noise(t, 0.35, 'lowpass', 1800, 0.8, v * 0.7, bus.sfx, white, 300);
    tone('sine', 75, t, 0.002, v * 0.7, 0.22, bus.sfx, 38);
    [311, 523, 817, 1290, 1870].forEach((f, i) => tone('triangle', f * (0.95 + Math.random() * 0.1), t + i * 0.004, 0.001, v * 0.07, 0.18 + Math.random() * 0.2, bus.sfx));
    if (v > 0.5) for (let i = 0; i < 4; i++) noise(t + 0.05 + Math.random() * 0.25, 0.02, 'highpass', 4500, 1, v * 0.12, bus.sfx);
  };
  A.cone = function () { if (!ctx) return; const t = ctx.currentTime; tone('triangle', 320, t, 0.002, 0.2, 0.1, bus.sfx, 170); noise(t, 0.05, 'bandpass', 1400, 2, 0.12, bus.sfx); };
  A.beep = function (hi) {
    if (!ctx) return; const t = ctx.currentTime, f = hi ? 1568 : 784, d = hi ? 0.6 : 0.22;
    tone('sine', f, t, 0.004, 0.2, d, bus.sfx); tone('square', f, t, 0.004, 0.035, d * 0.8, bus.sfx);
    if (hi) tone('sine', f * 1.5, t, 0.004, 0.08, d, bus.sfx);
  };
  A.click = function () { if (!ctx) return; const t = ctx.currentTime; noise(t, 0.008, 'highpass', 5000, 0.8, 0.09, bus.sfx); tone('sine', 2200, t, 0.001, 0.035, 0.025, bus.sfx, 1600); };
  A.cash = function () {
    if (!ctx) return; const t = ctx.currentTime;
    [[1975, 0], [2637, 0.08], [3951, 0.16]].forEach(([f, d]) => { tone('sine', f, t + d, 0.002, 0.1, 0.35, bus.sfx); tone('sine', f * 2.01, t + d, 0.002, 0.03, 0.2, bus.sfx); });
    noise(t, 0.04, 'highpass', 6000, 1, 0.05, bus.sfx);
  };
  A.bad = function () { if (!ctx) return; const t = ctx.currentTime; const f = filt('lowpass', 900, 1, bus.sfx); tone('square', 330, t, 0.004, 0.08, 0.14, f); tone('square', 220, t + 0.15, 0.004, 0.08, 0.22, f); };

  // ---------- окружение ----------
  A.ambStart = function (kind) {
    if (!ctx) return; A.ambStop();
    const nodes = [], timers = [];
    const bed = (buf, type, freq, q, vol) => { const s = src(buf, true), f = filt(type, freq, q), g = gain(vol, bus.amb); s.connect(f); f.connect(g); s.start(0, Math.random() * 2); nodes.push(s); return { g, f }; };
    const lfoOn = (param, rate, depth) => { const o = ctx.createOscillator(); o.frequency.value = rate; const g = gain(depth); o.connect(g); g.connect(param); o.start(); nodes.push(o); };
    const every = (min, max, fn) => { const go = () => { if (ctx.state === 'running') fn(); timers.push(setTimeout(go, min + Math.random() * (max - min))); }; timers.push(setTimeout(go, min * Math.random())); };
    const P = () => pan(Math.random() * 1.6 - 0.8, bus.amb);
    const bird = () => {
      const t = ctx.currentTime, out = P(), b = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 6), kind = Math.random();
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.05);
        if (kind < 0.5) tone('sine', b, tt, 0.006, 0.03, 0.06, out, b * 1.35); else tone('sine', b * 1.3, tt, 0.004, 0.025, 0.05, out, b * 0.8);
      }
    };
    const car = () => {
      const t = ctx.currentTime, d = 2.5 + Math.random() * 2, dir = Math.random() < 0.5 ? -1 : 1;
      const s = src(brown), f = filt('bandpass', 300, 0.8), g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + d / 2); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(240, t + d);
      let o = bus.amb; if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.9 * dir, t); p.pan.linearRampToValueAtTime(0.9 * dir, t + d); p.connect(bus.amb); o = p; }
      s.connect(f); f.connect(g); g.connect(o); s.start(t, Math.random()); s.stop(t + d + 0.1);
    };
    switch (kind) {
      case 'city':
        bed(brown, 'lowpass', 260, 0.6, 0.16); every(2500, 6000, car);
        every(9000, 20000, () => { const t = ctx.currentTime, o = filt('lowpass', 1400, 0.7, P()); tone('square', 415, t, 0.02, 0.025, 0.35, o); tone('square', 349, t, 0.02, 0.02, 0.35, o); });
        break;
      case 'forest': { const l = bed(white, 'highpass', 2200, 0.5, 0.025); lfoOn(l.g.gain, 0.17, 0.018); bed(brown, 'lowpass', 300, 0.5, 0.05); every(1200, 4200, bird);
        every(14000, 26000, () => { const t = ctx.currentTime, o = P(); tone('sine', 660, t, 0.03, 0.04, 0.25, o, 640); tone('sine', 540, t + 0.35, 0.03, 0.04, 0.35, o, 520); }); break; }
      case 'wind': { const w = bed(white, 'bandpass', 420, 0.9, 0.16); lfoOn(w.g.gain, 0.11, 0.1); lfoOn(w.f.frequency, 0.07, 220); const w2 = bed(brown, 'lowpass', 200, 0.6, 0.12); lfoOn(w2.g.gain, 0.19, 0.06);
        every(7000, 15000, () => { const t = ctx.currentTime; noise(t, 2.5, 'bandpass', 900, 8, 0.03, P(), white, 1500); }); break; }
      case 'night': {
        bed(brown, 'lowpass', 220, 0.5, 0.06);
        every(220, 520, () => { const t = ctx.currentTime, o = P(), f = 4300 + Math.random() * 500; for (let i = 0; i < 3; i++) tone('sine', f, t + i * 0.045, 0.004, 0.012, 0.025, o); });
        every(12000, 25000, () => { const t = ctx.currentTime, o = P(); tone('sine', 380, t, 0.05, 0.035, 0.3, o, 340); tone('sine', 380, t + 0.55, 0.05, 0.03, 0.5, o, 330); });
        break;
      }
      case 'neon': {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 50; o.connect(filt('lowpass', 300, 1, gain(0.02, bus.amb))); o.start(); nodes.push(o);
        bed(brown, 'lowpass', 240, 0.6, 0.1); every(3000, 7000, car);
        every(5000, 12000, () => { const t = ctx.currentTime; for (let i = 0; i < 3; i++) noise(t + i * 0.06 * Math.random(), 0.03, 'bandpass', 3000, 3, 0.04, P()); });
        break;
      }
      case 'port': {
        const w = bed(brown, 'lowpass', 380, 0.8, 0.13); lfoOn(w.g.gain, 0.23, 0.07); lfoOn(w.f.frequency, 0.13, 120);
        every(4000, 10000, () => { const t = ctx.currentTime, o = P(); for (let i = 0; i < 3; i++) tone('sine', 1500 + Math.random() * 300, t + i * 0.22, 0.02, 0.03, 0.18, o, 900); });
        every(18000, 35000, () => { const t = ctx.currentTime, f = filt('lowpass', 400, 1, P()); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 82; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.4); g.gain.setValueAtTime(0.06, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 3); o.connect(g); g.connect(f); o.start(t); o.stop(t + 3.1); });
        break;
      }
      case 'crowd': {
        const c1 = bed(brown, 'bandpass', 520, 0.7, 0.08); lfoOn(c1.g.gain, 0.27, 0.03); const c2 = bed(white, 'bandpass', 1100, 1.2, 0.025); lfoOn(c2.g.gain, 0.41, 0.012);
        every(6000, 14000, () => { const t = ctx.currentTime, s = src(white), f = filt('bandpass', 1000, 0.8), g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.08, t + 0.5); g.gain.linearRampToValueAtTime(0.0001, t + 2.4); s.connect(f); f.connect(g); g.connect(bus.amb); s.start(t, Math.random()); s.stop(t + 2.5); });
        break;
      }
      case 'rain': {
        bed(white, 'highpass', 3200, 0.5, 0.11); bed(brown, 'lowpass', 600, 0.5, 0.08);
        every(40, 140, () => noise(ctx.currentTime, 0.006, 'bandpass', 2500 + Math.random() * 3000, 2, 0.02 + Math.random() * 0.03, P()));
        every(15000, 32000, () => { const t = ctx.currentTime, s = src(brown), f = filt('lowpass', 140, 0.8), g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); s.connect(f); f.connect(g); g.connect(bus.amb); s.start(t, Math.random()); s.stop(t + 4.6); });
        break;
      }
    }
    amb = { nodes, timers };
  };
  A.ambStop = function () { if (!amb) return; amb.nodes.forEach(n => { try { n.stop(); } catch (e) { } }); amb.timers.forEach(clearTimeout); amb = null; };

  // Пауза всего звука при сворачивании вкладки
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  return A;
})();
