'use strict';
// Ввод: клавиатура, геймпад, сенсорное управление (джойстик / кнопки / руль) + редактор раскладки
const INPUT = (() => {
  const I = { keys: {}, touch: { steer: 0, throttle: 0, brake: 0, hand: 0, analog: false } };
  const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];

  // Расположение по умолчанию (x, y — проценты экрана; s — масштаб)
  const DEFAULTS = {
    joystick: { stick: { x: 15, y: 70, s: 1 }, gas: { x: 90, y: 64, s: 1 }, brake: { x: 78, y: 76, s: 1 }, hb: { x: 90, y: 88, s: 0.85 } },
    buttons: { left: { x: 8, y: 78, s: 1 }, right: { x: 22, y: 78, s: 1 }, gas: { x: 91, y: 66, s: 1 }, brake: { x: 79, y: 78, s: 1 }, hb: { x: 91, y: 89, s: 0.85 } },
    wheel: { wheel: { x: 15, y: 70, s: 1 }, gas: { x: 90, y: 64, s: 1 }, brake: { x: 78, y: 76, s: 1 }, hb: { x: 90, y: 88, s: 0.85 } },
  };
  const LABEL = { gas: 'ГАЗ', brake: 'ТОРМОЗ', hb: 'РУЧНИК', left: '◀', right: '▶' };
  const WHEEL_SVG = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="9"/><circle cx="50" cy="50" r="12" fill="rgba(255,255,255,.35)"/><path d="M8 52 L38 52 M62 52 L92 52 M50 62 L50 92" stroke="rgba(255,255,255,.55)" stroke-width="8"/><rect x="46" y="4" width="8" height="10" fill="#c6ff1a"/></svg>';

  I.init = function () {
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      I.keys[e.code] = true;
      if (GAME.running) {
        if (GAME_KEYS.includes(e.code)) e.preventDefault();
        if (e.code === 'Escape' || e.code === 'KeyP') GAME.togglePause();
        if (e.code === 'KeyR' && !e.repeat) GAME.respawnPlayer();
        if (e.code === 'KeyC' && !e.repeat) GAME.toggleCamera();
      }
    });
    window.addEventListener('keyup', e => { I.keys[e.code] = false; });
    window.addEventListener('blur', () => { I.keys = {}; });
  };

  I.state = function () {
    const k = I.keys; let steer = 0, throttle = 0, brake = 0, hand = 0, analog = false;
    if (k.ArrowLeft || k.KeyA) steer -= 1; if (k.ArrowRight || k.KeyD) steer += 1;
    if (k.ArrowUp || k.KeyW) throttle = 1; if (k.ArrowDown || k.KeyS) brake = 1; if (k.Space) hand = 1;
    const t = I.touch;
    if (t.analog && Math.abs(t.steer) > 0.02) { steer = t.steer; analog = true; } else if (t.steer) steer = t.steer;
    throttle = Math.max(throttle, t.throttle); brake = Math.max(brake, t.brake); hand = Math.max(hand, t.hand);
    // геймпад
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0; if (Math.abs(ax) > 0.12) { steer = ax; analog = true; }
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
      throttle = Math.max(throttle, rt, p.buttons[0] && p.buttons[0].pressed ? 1 : 0);
      brake = Math.max(brake, lt, p.buttons[1] && p.buttons[1].pressed ? 1 : 0);
      if ((p.buttons[2] && p.buttons[2].pressed) || (p.buttons[5] && p.buttons[5].pressed)) hand = 1;
      if (p.buttons[9] && p.buttons[9].pressed && !I._padStart && GAME.running) GAME.togglePause();
      I._padStart = p.buttons[9] && p.buttons[9].pressed;
    }
    return { steer: U.clamp(steer, -1, 1), throttle, brake, hand, analog };
  };

  function layoutFor(scheme) {
    const s = SAVE.s(); const def = DEFAULTS[scheme]; const cur = (s.layout && s.layout[scheme]) || {};
    const out = {}; for (const id in def) out[id] = Object.assign({}, def[id], cur[id] || {}); return out;
  }

  // Построить элементы управления в контейнере. editable — режим редактора.
  I.build = function (container, scheme, editable, onSelect) {
    container.innerHTML = '';
    I.touch = { steer: 0, throttle: 0, brake: 0, hand: 0, analog: scheme !== 'buttons' };
    const lay = layoutFor(scheme), els = {};
    const alpha = SAVE.s().touchAlpha || 1;
    for (const id in lay) {
      const L = lay[id]; let e;
      if (id === 'stick') { e = U.el('div', 'tc stick'); e.appendChild(U.el('div', 'knob')); }
      else if (id === 'wheel') { e = U.el('div', 'tc wheel', WHEEL_SVG); }
      else { e = U.el('div', 'tc btn-t ' + id + (id === 'left' || id === 'right' ? ' arrow' : ''), LABEL[id]); }
      e.dataset.id = id;
      e.style.left = L.x + '%'; e.style.top = L.y + '%'; e.style.transform = 'translate(-50%,-50%) scale(' + L.s + ')'; e.style.opacity = alpha;
      container.appendChild(e); els[id] = e;
      if (editable) bindEdit(e, container, scheme, onSelect); else bindPlay(e, id);
    }
    return els;
  };

  function bindPlay(e, id) {
    const t = () => I.touch;
    const vib = () => { if (SAVE.s().vibrate && navigator.vibrate) navigator.vibrate(8); };
    if (id === 'stick') {
      const knob = e.firstChild; let pid = null;
      const move = ev => {
        const r = e.getBoundingClientRect(), R = r.width / 2;
        let dx = ev.clientX - (r.left + R), dy = ev.clientY - (r.top + R); const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        knob.style.transform = 'translate(' + dx / (r.width / 150) + 'px,' + dy / (r.width / 150) + 'px)';
        const sx = dx / R, sy = -dy / R;
        t().steer = Math.abs(sx) < 0.08 ? 0 : sx;
        t().throttle = sy > 0.2 ? Math.min(1, (sy - 0.15) / 0.7) : 0;
        t().brake = sy < -0.3 ? Math.min(1, (-sy - 0.25) / 0.6) : 0;
      };
      e.addEventListener('pointerdown', ev => { pid = ev.pointerId; e.setPointerCapture(pid); move(ev); });
      e.addEventListener('pointermove', ev => { if (ev.pointerId === pid) move(ev); });
      const end = ev => { if (ev.pointerId !== pid) return; pid = null; knob.style.transform = ''; t().steer = 0; t().throttle = 0; t().brake = 0; };
      e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
      return;
    }
    if (id === 'wheel') {
      let pid = null, a0 = 0, base = 0, ang = 0;
      const angOf = ev => { const r = e.getBoundingClientRect(); return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2)); };
      const set = a => { ang = U.clamp(a, -2.1, 2.1); e.firstChild.style.transform = 'rotate(' + ang + 'rad)'; t().steer = U.clamp(ang / 1.9, -1, 1); };
      e.addEventListener('pointerdown', ev => { pid = ev.pointerId; e.setPointerCapture(pid); a0 = angOf(ev); base = ang; });
      e.addEventListener('pointermove', ev => { if (ev.pointerId === pid) set(base + U.wrap(angOf(ev) - a0)); });
      const end = ev => {
        if (ev.pointerId !== pid) return; pid = null;
        const back = () => { if (pid !== null) return; set(ang * 0.6); if (Math.abs(ang) > 0.02) requestAnimationFrame(back); else set(0); };
        back();
      };
      e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
      e.firstChild.style.transition = 'none';
      return;
    }
    const key = { gas: 'throttle', brake: 'brake', hb: 'hand' }[id];
    const set = v => {
      if (id === 'left') t().steer = v ? -1 : (t().steer === -1 ? 0 : t().steer);
      else if (id === 'right') t().steer = v ? 1 : (t().steer === 1 ? 0 : t().steer);
      else t()[key] = v ? 1 : 0;
      e.classList.toggle('on', !!v);
    };
    e.addEventListener('pointerdown', ev => { e.setPointerCapture(ev.pointerId); set(1); vib(); });
    e.addEventListener('pointerup', () => set(0)); e.addEventListener('pointercancel', () => set(0));
    e.addEventListener('lostpointercapture', () => set(0));
  }

  function bindEdit(e, container, scheme, onSelect) {
    e.classList.add('editing');
    let pid = null, ox = 0, oy = 0;
    e.addEventListener('pointerdown', ev => {
      pid = ev.pointerId; e.setPointerCapture(pid);
      U.$$('.tc', container).forEach(x => x.classList.remove('sel')); e.classList.add('sel');
      const r = e.getBoundingClientRect(); ox = ev.clientX - (r.left + r.width / 2); oy = ev.clientY - (r.top + r.height / 2);
      if (onSelect) onSelect(e.dataset.id);
    });
    e.addEventListener('pointermove', ev => {
      if (ev.pointerId !== pid) return;
      const W = container.clientWidth, H = container.clientHeight;
      const x = U.clamp((ev.clientX - ox) / W * 100, 3, 97), y = U.clamp((ev.clientY - oy) / H * 100, 5, 96);
      e.style.left = x + '%'; e.style.top = y + '%';
    });
    const end = ev => {
      if (ev.pointerId !== pid) return; pid = null;
      I.saveItem(scheme, e.dataset.id, { x: parseFloat(e.style.left), y: parseFloat(e.style.top) });
    };
    e.addEventListener('pointerup', end); e.addEventListener('pointercancel', end);
  }
  I.saveItem = function (scheme, id, patch) {
    const s = SAVE.s(); if (!s.layout[scheme]) s.layout[scheme] = {};
    s.layout[scheme][id] = Object.assign(layoutFor(scheme)[id], s.layout[scheme][id] || {}, patch);
    SAVE.save();
  };
  I.itemScale = function (scheme, id) { return layoutFor(scheme)[id].s; };
  I.reset = function (scheme) { const s = SAVE.s(); delete s.layout[scheme]; SAVE.save(); };
  I.clear = function () { I.touch = { steer: 0, throttle: 0, brake: 0, hand: 0, analog: false }; };
  return I;
})();
