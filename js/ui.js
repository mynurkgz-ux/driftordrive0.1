'use strict';
// Интерфейс: экраны, гараж, выбор карт, мультиплеер-лобби, настройки, аккаунт
const UI = (() => {
  const UIo = { cur: 'main', mode: 'drift', mapsFor: 'play', lastRound: 0 };
  const LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  const KIND = { circuit: 'Кольцо', arena: 'Площадка', oval: 'Овал' };
  const CLASS = ['', 'D', 'C', 'B', 'A', 'S', 'S+'];

  // ---------- базовое ----------
  UIo.init = function () {
    document.body.classList.toggle('mobile', U.isMobile);
    U.$$('[data-go]').forEach(b => b.addEventListener('click', () => { AUDIO.init(); AUDIO.click(); const g = b.dataset.go; if (g === 'drift' || g === 'race') UIo.openMode(g); else if (g === 'garage') UIo.openGarage('main'); }));
    U.$('#btnSettings').onclick = () => { AUDIO.init(); AUDIO.click(); if (UIo.cur === 'settings') UIo.show(UIo.setReturn || 'main'); else UIo.openSettings(); };
    U.$('#brandBtn').onclick = () => { if (!GAME.running) UIo.show('main'); };
    U.$('#btnRegister').onclick = () => authModal('register');
    U.$('#btnLogin').onclick = () => authModal('login');
    U.$('#btnLogout').onclick = () => logout();
    U.$('#nickChip').onclick = () => UIo.openSettings('account');
    // режим
    U.$('#btnPlay').onclick = () => { AUDIO.click(); UIo.openMaps('play'); };
    U.$('#btnMulti').onclick = () => { AUDIO.click(); if (!NET.ok) return UIo.toast('Мультиплееру нужен интернет и Firebase', 'bad'); UIo.openMaps('mp'); };
    U.$('#btnModeBack').onclick = () => { AUDIO.click(); UIo.show('main'); };
    U.$('#btnJoin').onclick = () => UIo.joinRoom(U.$('#joinInput').value);
    U.$('#joinInput').addEventListener('keydown', e => { if (e.key === 'Enter') UIo.joinRoom(e.target.value); });
    U.$('#btnToGarage').onclick = () => UIo.openGarage();
    U.$('#modeCanvas').addEventListener('click', e => { if (modeHit(e)) UIo.openGarage(); });
    U.$('#modeCanvas').addEventListener('mousemove', e => { U.$('#modeCanvas').style.cursor = modeHit(e) ? 'pointer' : 'default'; });
    // гараж
    U.$$('.gbtn').forEach(b => b.onclick = () => openPanel(b.dataset.panel));
    U.$('#drawerClose').onclick = closePanel;
    U.$('#btnGarageBack').onclick = () => { closePanel(); UIo.show(UIo.garageFrom || 'mode'); };
    initGarageDrag();
    // карты, лобби, настройки
    U.$('#btnMapsBack').onclick = () => UIo.show('mode');
    U.$('#btnLobbyBack').onclick = () => leaveLobby();
    U.$('#btnCopyLink').onclick = () => { U.copy(U.$('#lobbyLink').value).then(() => UIo.toast('Ссылка скопирована — отправь её другу', 'good')); };
    U.$('#btnLobbyStart').onclick = () => startRoom();
    U.$('#btnSetBack').onclick = () => UIo.show(UIo.setReturn || 'main');
    U.$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') UIo.closeModal(); });
    window.addEventListener('resize', () => { sizeCanvas(U.$('#bgCanvas')); sizeCanvas(U.$('#modeCanvas')); sizeCanvas(U.$('#garageCanvas')); });
    sizeCanvas(U.$('#bgCanvas'));
    bgLoop();
    window.addEventListener('car3d-ready', () => { CARR.clearCache(); if (UIo.cur === 'mode') modeAnimStart(); if (UIo.cur === 'garage') garageStart(); if (UIo.cur === 'main') mainStart(); });
    UIo.refreshTop();
    UIo.show('main');
  };

  function sizeCanvas(c) { if (!c) return; const d = Math.min(2, window.devicePixelRatio || 1); c.width = Math.round(c.clientWidth * d); c.height = Math.round(c.clientHeight * d); c._d = d; }

  UIo.show = function (id) {
    UIo.cur = id;
    U.$$('.screen').forEach(s => s.classList.toggle('on', s.id === 'scr-' + id));
    document.body.classList.toggle('ingame', id === 'game');
    document.body.classList.toggle('race', (id === 'game' ? GAME.mapInfo().mode : UIo.mode) === 'race' && id !== 'main' && id !== 'settings');
    U.$('#bgCanvas').style.display = ((id === 'main' && !has3d()) || id === 'maps' || id === 'settings' || id === 'lobby') ? 'block' : 'none';
    U.$('#btnSettings').classList.toggle('on', id === 'settings');
    if (id === 'mode') { sizeCanvas(U.$('#modeCanvas')); modeAnimStart(); } else modeAnimStop();
    if (id === 'garage') { sizeCanvas(U.$('#garageCanvas')); garageStart(); } else garageStop();
    if (id === 'main') mainStart();
    if (id !== 'game') exitFullscreenIfGame();
  };
  UIo.refreshTop = function () {
    if (!SAVE.data) return;
    U.$('#moneyTag').textContent = U.money(SAVE.data.money);
    U.$('#nickTop').textContent = NET.displayNick();
    const li = NET.loggedIn();
    U.$('#nickChip').classList.toggle('on', li);
    U.$('#btnRegister').classList.toggle('hidden', li);
    U.$('#btnLogin').classList.toggle('hidden', li);
    U.$('#btnLogout').classList.toggle('hidden', !li);
  };
  UIo.onAuthChanged = function () {
    if (UIo.cur === 'settings') renderSetTab(UIo.setTab);
    if (UIo.cur === 'garage') { garageInfo(); if (curPanel) openPanel(curPanel); }
  };
  let toastT = 0;
  UIo.toast = function (msg, kind) {
    const t = U.$('#toast'); t.textContent = msg; t.className = 'show ' + (kind || '');
    clearTimeout(toastT); toastT = setTimeout(() => t.className = '', 3200);
  };
  UIo.modal = function (html) { const m = U.$('#modal'); U.$('#modalCard').innerHTML = html; m.classList.remove('hidden'); return U.$('#modalCard'); };
  UIo.closeModal = function () { U.$('#modal').classList.add('hidden'); };
  function confirmBox(title, text, okText, onOk, danger) {
    const c = UIo.modal('<h3>' + title + '</h3><p class="sub">' + text + '</p><div class="row"><button class="btn ghost" id="cbNo">Отмена</button><button class="btn ' + (danger ? '' : 'ok') + '" id="cbYes">' + okText + '</button></div>');
    U.$('#cbNo', c).onclick = UIo.closeModal; U.$('#cbYes', c).onclick = () => { UIo.closeModal(); onOk(); };
  }
  // ---------- главный экран: текущая машина на подиуме + карточка ----------
  function mainStart() {
    const id = SAVE.data.current, def = DATA.CAR[id], st = carStats(def, SAVE.cfg(id) || SAVE.newCarCfg(id)), S = SAVE.data.stats || {};
    U.$('#mainCar').innerHTML =
      '<div class="cc-top"><span class="cc-class">' + CLASS[def.tier] + '</span><div><div class="cc-brand">' + U.esc(def.brand) + '</div><div class="cc-name">' + U.esc(def.model) + '</div></div></div>' +
      '<div class="cc-specs"><div><b>' + Math.round(st.hp) + '</b><span>л.с.</span></div><div><b>' + Math.round(st.top) + '</b><span>км/ч</span></div><div><b>' + st.acc.toFixed(1) + '</b><span>0–100, с</span></div><div><b>' + def.drive + '</b><span>привод</span></div></div>' +
      '<div class="cc-stats"><span>Гонок <b>' + (S.races || 0) + '</b></span><span>Побед <b>' + (S.wins || 0) + '</b></span><span>Рекорд дрифта <b>' + U.num(S.bestDrift || 0) + '</b></span></div>';
    if (has3d()) CAR3D.start('garage', U.$('#scr-main'), { look: () => SAVE.curLook(), zoom: innerWidth > 760 ? 1.45 : 1.25, shift: () => innerWidth < 1100 ? innerWidth * 0.13 : 0 });
  }

  // ---------- аккаунт ----------
  function authModal(kind) {
    AUDIO.init();
    const reg = kind === 'register';
    const c = UIo.modal(
      '<h3>' + (reg ? 'Регистрация' : 'Вход') + '</h3><p class="sub">' + (reg ? 'Прогресс гостя перенесётся в аккаунт и будет доступен на любом устройстве.' : 'Войди, чтобы загрузить свой гараж и прогресс.') + '</p>' +
      '<form class="form" id="authForm" autocomplete="on">' +
      (reg ? '<input name="nick" placeholder="Ник" maxlength="16" required autocomplete="nickname">' : '') +
      '<input name="email" type="email" placeholder="Email" required autocomplete="email">' +
      '<input name="pass" type="password" placeholder="Пароль" required minlength="6" autocomplete="' + (reg ? 'new-password' : 'current-password') + '">' +
      '<div class="err" id="authErr"></div>' +
      '<button class="btn" type="submit" id="authGo">' + (reg ? 'Создать аккаунт' : 'Войти') + '</button></form>' +
      '<div class="swap">' + (reg ? 'Уже есть аккаунт? <a id="authSwap">Войти</a>' : 'Нет аккаунта? <a id="authSwap">Регистрация</a> · <a id="authForgot">Забыл пароль</a>') + '</div>');
    U.$('#authSwap', c).onclick = () => authModal(reg ? 'login' : 'register');
    const fg = U.$('#authForgot', c); if (fg) fg.onclick = () => forgotModal(U.$('[name=email]', c).value);
    U.$('#authForm', c).onsubmit = async e => {
      e.preventDefault(); const f = e.target, err = U.$('#authErr', c), go = U.$('#authGo', c);
      const email = f.email.value.trim(), pass = f.pass.value;
      if (reg) { const n = f.nick.value.trim(); if (n.length < 2) { err.textContent = 'Ник — минимум 2 символа'; return; } }
      go.disabled = true; err.textContent = '';
      try {
        if (reg) await NET.register(f.nick.value.trim(), email, pass); else await NET.login(email, pass);
        UIo.closeModal(); UIo.toast(reg ? 'Аккаунт создан! Добро пожаловать, ' + f.nick.value.trim() : 'С возвращением!', 'good');
      } catch (ex) { err.textContent = NET.err(ex); go.disabled = false; }
    };
  }
  function forgotModal(email) {
    const c = UIo.modal('<h3>Сброс пароля</h3><p class="sub">Пришлём письмо со ссылкой для смены пароля.</p><form class="form" id="fgForm"><input name="email" type="email" placeholder="Email" required value="' + U.esc(email || '') + '"><div class="err" id="fgErr"></div><button class="btn">Отправить письмо</button></form><div class="swap"><a id="fgBack">Назад ко входу</a></div>');
    U.$('#fgBack', c).onclick = () => authModal('login');
    U.$('#fgForm', c).onsubmit = async e => { e.preventDefault(); try { await NET.resetPassword(e.target.email.value.trim()); UIo.closeModal(); UIo.toast('Письмо отправлено. Проверь почту (и папку «Спам»)', 'good'); } catch (ex) { U.$('#fgErr', c).textContent = NET.err(ex); } };
  }
  function logout() { confirmBox('Выйти из аккаунта?', 'Прогресс сохранён в облаке. После выхода ты продолжишь как гость.', 'Выйти', async () => { try { await NET.logout(); UIo.toast('Ты вышел из аккаунта'); } catch (e) { UIo.toast(NET.err(e), 'bad'); } }); }

  // ---------- фон меню ----------
  let bgT = 0;
  function bgLoop() {
    const c = U.$('#bgCanvas'), g = c.getContext('2d');
    const streaks = []; for (let i = 0; i < 40; i++) streaks.push({ x: Math.random(), y: Math.random(), l: 0.05 + Math.random() * 0.2, s: 0.2 + Math.random() * 0.7 });
    let last = performance.now();
    const f = now => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; bgT += dt;
      if (c.style.display !== 'none') {
        const W = c.width, H = c.height;
        const gr = g.createRadialGradient(W * 0.75, H * 0.4, 10, W * 0.6, H * 0.5, Math.max(W, H) * 0.8);
        const race = document.body.classList.contains('race');
        gr.addColorStop(0, race ? '#0b1a33' : '#18210a'); gr.addColorStop(0.5, '#0e1118'); gr.addColorStop(1, '#07080c');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
        const step = 60 * (c._d || 1), off = (bgT * 40) % step;
        g.beginPath(); for (let x = -off; x < W; x += step) { g.moveTo(x, 0); g.lineTo(x + H * 0.3, H); } g.stroke();
        for (const s of streaks) {
          s.x -= s.s * dt * 0.6; if (s.x + s.l < 0) { s.x = 1; s.y = Math.random(); }
          const lg = g.createLinearGradient(s.x * W, 0, (s.x + s.l) * W, 0);
          lg.addColorStop(0, race ? 'rgba(61,139,255,.35)' : 'rgba(198,255,26,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
          g.strokeStyle = lg; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x * W, s.y * H); g.lineTo((s.x + s.l) * W, s.y * H); g.stroke();
        }
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  // ---------- экран режима: анимации машины ----------
  let mRaf = 0; const MA = { smoke: [], trail: [], phi: 0, wheel: 0, lines: [], hit: null };
  UIo.openMode = function (mode) {
    UIo.mode = mode;
    U.$('#modeTitle').textContent = mode === 'drift' ? 'ДРИФТ' : 'ГОНКА';
    U.$('#modeHint').textContent = 'Нажми на машину, чтобы открыть гараж';
    MA.smoke = []; MA.trail = []; MA.lines = [];
    UIo.show('mode');
  };
  function modeHit(e) { if (!MA.hit) return false; const r = e.target.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; return Math.hypot(x - MA.hit.x, y - MA.hit.y) < MA.hit.r; }
  const has3d = () => window.CAR3D && window.CAR3D.ready;
  function modeAnimStop() { cancelAnimationFrame(mRaf); mRaf = 0; if (has3d()) CAR3D.stop('mode'); U.$('#modeNick').classList.add('hidden'); }
  function modeAnimStart() {
    modeAnimStop();
    if (has3d()) {
      U.$('#modeCanvas').style.display = 'none';
      const nick = U.$('#modeNick'); nick.textContent = NET.displayNick();
      CAR3D.start(UIo.mode === 'race' ? 'race' : 'drift', U.$('#scr-mode'), {
        onFrame: lb => { if (!lb) return; nick.classList.remove('hidden'); nick.textContent = NET.displayNick(); nick.style.left = lb.x + 'px'; nick.style.top = lb.y + 'px'; },
        onCarClick: () => UIo.openGarage()
      });
      return;
    }
    U.$('#modeCanvas').style.display = 'block';
    const c = U.$('#modeCanvas'), g = c.getContext('2d'); let last = performance.now();
    const f = now => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      const d = c._d || 1, W = c.width / d, H = c.height / d;
      g.setTransform(d, 0, 0, d, 0, 0);
      if (UIo.mode === 'drift') driftScene(g, W, H, dt); else raceScene(g, W, H, dt);
      mRaf = requestAnimationFrame(f);
    };
    mRaf = requestAnimationFrame(f);
  }
  function nickLabel(g, x, y) {
    const t = NET.displayNick(); g.font = '700 16px Manrope, sans-serif'; g.textAlign = 'center';
    const w = g.measureText(t).width + 26;
    g.fillStyle = 'rgba(0,0,0,.6)'; U.rr(g, x - w / 2, y - 28, w, 30, 15); g.fill();
    g.strokeStyle = UIo.mode === 'race' ? 'rgba(61,139,255,.7)' : 'rgba(198,255,26,.7)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillText(t, x, y - 8);
  }
  function driftScene(g, W, H, dt) {
    const wide = W > 760;
    const cx = wide ? W * 0.62 : W * 0.5, cy = wide ? H * 0.52 : H * 0.42;
    const R = Math.min(W, H) * (wide ? 0.22 : 0.2), sc = R / 6.2;
    const bg = g.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#2b2e34'); bg.addColorStop(0.6, '#16181d'); bg.addColorStop(1, '#0a0b0e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.04)'; g.lineWidth = 1; for (let x = (cx % 80); x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = (cy % 80); y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = 'rgba(255,200,61,.18)'; g.setLineDash([14, 12]); g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * 1.55, 0, 7); g.stroke(); g.setLineDash([]);
    MA.phi += dt * 1.15;
    const x = cx + Math.cos(MA.phi) * R, y = cy + Math.sin(MA.phi) * R, h = MA.phi + Math.PI / 2 + 0.62;
    const look = SAVE.curLook(), geo = CARR.geom(look);
    const ca = Math.cos(h), sa = Math.sin(h);
    const rw = s => [x + (ca * geo.xR - sa * s * (geo.hw - 0.15)) * sc, y + (sa * geo.xR + ca * s * (geo.hw - 0.15)) * sc];
    const L = rw(-1), Rr = rw(1);
    MA.trail.push([L, Rr]); if (MA.trail.length > 260) MA.trail.shift();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = sc * 0.26; g.lineCap = 'round';
    for (const k of [0, 1]) { g.beginPath(); MA.trail.forEach((p, i) => i ? g.lineTo(p[k][0], p[k][1]) : g.moveTo(p[k][0], p[k][1])); g.stroke(); }
    if (Math.random() < 0.6) { const w = Math.random() < 0.5 ? L : Rr; MA.smoke.push({ x: w[0], y: w[1], vx: (Math.random() - 0.5) * 30 - Math.cos(MA.phi + Math.PI / 2) * 20, vy: (Math.random() - 0.5) * 30 - Math.sin(MA.phi + Math.PI / 2) * 20, r: sc * 0.4, life: 0, max: 1.1 + Math.random() * 0.6 }); }
    if (MA.smoke.length > 260) MA.smoke.splice(0, MA.smoke.length - 260);
    g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(h);
    CARR.drawTop(g, look, { steer: -0.45 });
    g.restore();
    for (let i = MA.smoke.length - 1; i >= 0; i--) { const p = MA.smoke[i]; p.life += dt; if (p.life > p.max) { MA.smoke.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * sc * 1.6; const a = 0.13 * (1 - p.life / p.max); g.fillStyle = 'rgba(230,230,235,' + a.toFixed(3) + ')'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    nickLabel(g, x, y - sc * 3.2);
    MA.hit = { x, y, r: sc * 3.4 };
  }
  function raceScene(g, W, H, dt) {
    const wide = W > 760;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b1730'); sky.addColorStop(0.45, '#27406b'); sky.addColorStop(0.62, '#e9825a'); sky.addColorStop(0.66, '#1a1d26'); sky.addColorStop(1, '#0d0f14');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const horizon = H * 0.64;
    g.fillStyle = 'rgba(255,210,150,.85)'; g.beginPath(); g.arc(W * 0.72, horizon - 10, Math.min(W, H) * 0.09, Math.PI, 0); g.fill();
    MA.wheel += dt * 30;
    const par = (sp, col, amp, base, seed) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, horizon); const off = (performance.now() / 1000 * sp) % W; for (let x = -10; x <= W + 10; x += 20) { const xx = x + off; const yy = base - (Math.sin(xx * 0.004 + seed) * 0.5 + Math.sin(xx * 0.011 + seed * 2) * 0.3 + 0.8) * amp; g.lineTo(x, yy); } g.lineTo(W, horizon); g.closePath(); g.fill(); };
    par(10, '#1c2740', H * 0.12, horizon, 1); par(40, '#141b2b', H * 0.07, horizon, 3);
    // дорога
    g.fillStyle = '#1b1d23'; g.fillRect(0, horizon, W, H - horizon);
    g.fillStyle = '#2a2d35'; g.fillRect(0, horizon + 2, W, 4);
    const roadY = wide ? H * 0.82 : H * 0.7;
    const off = (performance.now() / 1000 * 1400) % 160;
    g.fillStyle = 'rgba(255,255,255,.75)'; for (let x = -off; x < W; x += 160) g.fillRect(x, roadY + 30, 80, 6);
    // линии скорости
    if (MA.lines.length < 46) MA.lines.push({ x: W + Math.random() * W, y: Math.random() * H * 0.95, l: 60 + Math.random() * 220, s: 1200 + Math.random() * 1800 });
    g.lineWidth = 2;
    for (const l of MA.lines) { l.x -= l.s * dt; if (l.x + l.l < 0) { l.x = W + Math.random() * 200; l.y = Math.random() * H * 0.95; } const lg = g.createLinearGradient(l.x, 0, l.x + l.l, 0); lg.addColorStop(0, 'rgba(61,139,255,0)'); lg.addColorStop(0.5, 'rgba(160,230,255,.5)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = lg; g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(l.x + l.l, l.y); g.stroke(); }
    const look = SAVE.curLook(), geo = CARR.geom(look);
    const sc = Math.min(W * (wide ? 0.42 : 0.8), 640) / geo.L;
    const cx = wide ? W * 0.6 : W * 0.5, cy = roadY + Math.sin(performance.now() / 70) * 1.2;
    // выхлоп и пламя
    if (Math.random() < 0.12) for (let i = 0; i < 4; i++) MA.smoke.push({ x: cx - geo.hl * sc, y: cy - 0.3 * sc, vx: -300 - Math.random() * 200, vy: (Math.random() - 0.5) * 30, r: 6, life: 0, max: 0.25, fire: true });
    for (let i = MA.smoke.length - 1; i >= 0; i--) { const p = MA.smoke[i]; p.life += dt; if (p.life > p.max) { MA.smoke.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 30; g.fillStyle = 'rgba(255,' + (120 + p.life * 400 | 0) + ',40,' + (0.8 * (1 - p.life / p.max)).toFixed(2) + ')'; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    g.save(); g.translate(cx, cy); g.scale(sc, sc);
    CARR.drawSide(g, look, MA.wheel);
    g.restore();
    // блюр-полосы за машиной
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let i = 0; i < 5; i++) g.fillRect(cx - geo.hl * sc - 40 - i * 60, cy - geo.T.side[0] * sc * (0.3 + i * 0.1), 40 + i * 30, 3);
    nickLabel(g, cx, cy - geo.T.side[0] * sc - 26);
    MA.hit = { x: cx, y: cy - geo.T.side[0] * sc / 2, r: geo.hl * sc };
  }

  // ---------- гараж ----------
  let gRaf = 0, gRot = -Math.PI / 2, gDrag = null, curPanel = null;
  const gPrev = { car: null, kit: {}, paint: {} };
  UIo.openGarage = function (from) { UIo.garageFrom = from === 'main' ? 'main' : 'mode'; gPrev.car = null; gPrev.kit = {}; gPrev.paint = {}; UIo.show('garage'); garageInfo(); };
  function gLook() {
    const id = gPrev.car || SAVE.data.current; const cfg = SAVE.cfg(id) || SAVE.newCarCfg(id);
    return { car: id, kit: Object.assign({}, cfg.kit, gPrev.kit), paint: Object.assign({}, cfg.paint, gPrev.paint) };
  }
  function gCfg() { const id = gPrev.car || SAVE.data.current; const cfg = SAVE.cfg(id) || SAVE.newCarCfg(id); return Object.assign({}, cfg, { kit: Object.assign({}, cfg.kit, gPrev.kit) }); }
  function initGarageDrag() {
    const c = U.$('#garageCanvas');
    c.addEventListener('pointerdown', e => { gDrag = { x: e.clientX, r: gRot }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => { if (gDrag) gRot = gDrag.r + (e.clientX - gDrag.x) * 0.01; });
    c.addEventListener('pointerup', () => gDrag = null);
  }
  function garageStop() { cancelAnimationFrame(gRaf); gRaf = 0; if (has3d()) CAR3D.stop('garage'); }
  function garageStart() {
    garageStop();
    if (has3d()) {
      U.$('#garageCanvas').style.display = 'none';
      CAR3D.start('garage', U.$('#scr-garage'), { look: gLook, shift: () => (U.$('#drawer').classList.contains('open') && innerWidth > 760) ? 190 : 0 });
      return;
    }
    U.$('#garageCanvas').style.display = 'block';
    const c = U.$('#garageCanvas'), g = c.getContext('2d'); let last = performance.now();
    const f = now => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      if (!gDrag) gRot += dt * 0.25;
      const d = c._d || 1, W = c.width / d, H = c.height / d;
      g.setTransform(d, 0, 0, d, 0, 0);
      const open = U.$('#drawer').classList.contains('open') && W > 760;
      const cx = open ? Math.max((W - 400) * 0.5, (300 + W - 400) / 2) : W * (W > 760 ? 0.55 : 0.5), cy = H * (W > 760 ? 0.56 : 0.62);
      const bg = g.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7);
      const race = UIo.mode === 'race';
      bg.addColorStop(0, '#2a2f3a'); bg.addColorStop(0.5, '#14171e'); bg.addColorStop(1, '#08090c');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      const look = gLook(), geo = CARR.geom(look);
      const sc = Math.min(H * 0.52, (open ? Math.max(W - 720, W * 0.35) : W) * 0.6, 520) / geo.L;
      const pr = geo.L * sc * 0.62;
      const pg = g.createRadialGradient(cx, cy, pr * 0.2, cx, cy, pr);
      pg.addColorStop(0, '#2f3440'); pg.addColorStop(1, '#1a1d24'); g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, pr, 0, 7); g.fill();
      g.strokeStyle = race ? 'rgba(61,139,255,.55)' : 'rgba(198,255,26,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, pr, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2 + gRot; g.beginPath(); g.moveTo(cx + Math.cos(a) * pr * 0.85, cy + Math.sin(a) * pr * 0.85); g.lineTo(cx + Math.cos(a) * pr * 0.97, cy + Math.sin(a) * pr * 0.97); g.stroke(); }
      g.save(); g.translate(cx, cy); g.scale(sc, sc); g.rotate(gRot);
      CARR.drawTop(g, look, { steer: Math.sin(now / 900) * 0.25 });
      g.restore();
      gRaf = requestAnimationFrame(f);
    };
    gRaf = requestAnimationFrame(f);
  }
  function carStats(def, cfg) {
    const s = PHYS.spec(def, cfg); const m = s.mass;
    const trac = (s.drive === 'AWD' ? 1 : s.drive === 'FWD' ? s.b / s.L : s.a / s.L) * m * 9.81 * (s.gripR + s.gripF) / 2 * 1.1;
    let v = 0, t = 0; while (v < 27.78 && t < 30) { const F = Math.min(s.maxF, s.P / Math.max(v, 1), trac) - s.cd * v * v; v += F / m * 0.02; t += 0.02; }
    return { hp: s.hp, top: s.vmax * 3.6, acc: t, grip: (s.gripF + s.gripR) / 2, mass: m, drive: s.drive };
  }
  function garageInfo() {
    const look = gLook(), def = DATA.CAR[look.car];
    U.$('#gBrand').textContent = def.brand;
    U.$('#gName').textContent = def.model;
    const owned = SAVE.owns(def.id);
    U.$('#gType').innerHTML = DATA.TYPES[def.type].name + ' · ' + def.drive + ' · класс ' + CLASS[def.tier] + (owned ? '' : ' · <span style="color:var(--gold)">' + U.money(def.price) + '</span>');
    const base = carStats(def, SAVE.newCarCfg(def.id)), st = carStats(def, gCfg());
    const row = (name, val, frac, bfrac, unit) => '<div class="stat"><span>' + name + '</span><div class="bar"><i class="' + (frac > bfrac + 0.005 ? 'up' : '') + '" style="width:' + (U.clamp(frac, 0.03, 1) * 100).toFixed(0) + '%"></i></div><b>' + val + (unit || '') + '</b></div>';
    U.$('#gStats').innerHTML =
      row('Мощность', Math.round(st.hp), st.hp / 1700, base.hp / 1700, ' л.с.') +
      row('Макс. ск.', Math.round(st.top), st.top / 460, base.top / 460) +
      row('0–100', st.acc.toFixed(1), (12 - st.acc) / 10, (12 - base.acc) / 10, ' с') +
      row('Сцепление', st.grip.toFixed(2), (st.grip - 0.6) / 0.9, (base.grip - 0.6) / 0.9) +
      row('Масса', Math.round(st.mass), 1 - (st.mass - 600) / 1800, 1 - (base.mass - 600) / 1800, ' кг');
  }
  function carThumb(look, w, h) {
    const c = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1); c.width = w * d; c.height = h * d; c.style.width = w + 'px'; c.style.height = h + 'px';
    const g = c.getContext('2d'), geo = CARR.geom(look), sc = Math.min(w / (geo.L + 1.2), h / (geo.W + 1.0)) * d;
    g.translate(c.width / 2, c.height / 2); g.scale(sc, sc); CARR.drawWheels(g, look, 0); CARR.drawBody(g, look, {});
    return c;
  }

  // панели
  function closePanel() { U.$('#drawer').classList.remove('open'); U.$$('.gbtn').forEach(b => b.classList.remove('on')); curPanel = null; gPrev.car = null; gPrev.kit = {}; gPrev.paint = {}; garageInfo(); }
  function setDrawer(title, tabs, activeTab, onTab) {
    U.$('#drawerTitle').textContent = title;
    const t = U.$('#drawerTabs'); t.innerHTML = '';
    (tabs || []).forEach(([id, name]) => { const b = U.el('button', 'tab' + (id === activeTab ? ' on' : ''), U.esc(name)); b.onclick = () => onTab(id); t.appendChild(b); });
    U.$('#drawerFoot').innerHTML = '';
    return U.$('#drawerBody');
  }
  function foot(html) { U.$('#drawerFoot').innerHTML = html || ''; return U.$('#drawerFoot'); }
  function openPanel(p, tab) {
    AUDIO.init(); AUDIO.click();
    curPanel = p; U.$('#drawer').classList.add('open');
    U.$$('.gbtn').forEach(b => b.classList.toggle('on', b.dataset.panel === p));
    if (p !== 'cars') gPrev.car = null;
    gPrev.kit = {}; gPrev.paint = {};
    ({ cars: panelCars, kits: panelKits, paint: panelPaint, vinyl: panelVinyl, tune: panelTune })[p](tab);
    garageInfo();
  }

  let carsTab = 'all';
  function panelCars(tab) {
    if (tab) carsTab = tab;
    const tabs = [['all', 'Все'], ['own', 'Мои']].concat([1, 2, 3, 4, 5, 6].map(t => ['t' + t, 'Класс ' + CLASS[t]]));
    const body = setDrawer('Машины · ' + DATA.CARS.length, tabs, carsTab, id => panelCars(id));
    const list = DATA.CARS.filter(c => carsTab === 'all' || (carsTab === 'own' ? SAVE.owns(c.id) : c.tier === +carsTab.slice(1)));
    body.innerHTML = '<div class="list"></div>'; const L = U.$('.list', body);
    const items = [];
    list.forEach(def => {
      const owned = SAVE.owns(def.id), cur = SAVE.data.current === def.id;
      const it = U.el('div', 'item' + (cur ? ' cur' : '') + ((gPrev.car || SAVE.data.current) === def.id ? ' sel' : ''));
      it.innerHTML = '<div class="th" style="width:84px;height:46px"></div><div class="meta"><div class="t">' + U.esc(def.name) + '</div><div class="s">' + DATA.TYPES[def.type].name + ' · ' + def.drive + ' · ' + def.hp + ' л.с. · <span class="stars">' + '★'.repeat(def.tier) + '</span></div></div><div class="p ' + (owned ? 'own' : '') + '">' + (cur ? 'В гараже ✓' : owned ? 'Куплена' : U.money(def.price)) + '</div>';
      it.onclick = () => { gPrev.car = def.id === SAVE.data.current ? null : def.id; U.$$('.item', L).forEach(x => x.classList.remove('sel')); it.classList.add('sel'); carFoot(); garageInfo(); AUDIO.click(); };
      L.appendChild(it); items.push([it, def]);
    });
    let i = 0; const draw = () => { const end = Math.min(items.length, i + (has3d() ? 2 : 8)); for (; i < end; i++) { const [it, def] = items[i]; const cfg = SAVE.cfg(def.id) || SAVE.newCarCfg(def.id); const lk = { car: def.id, kit: cfg.kit, paint: cfg.paint }; let th; try { th = has3d() ? CAR3D.thumb(lk, 84, 46) : carThumb(lk, 84, 46); } catch (e) { th = carThumb(lk, 84, 46); } U.$('.th', it).replaceWith(th); } if (i < items.length && curPanel === 'cars') requestAnimationFrame(draw); };
    requestAnimationFrame(draw);
    if (!list.length) body.innerHTML = '<p class="muted" style="padding:20px 4px">Здесь пока пусто.</p>';
    carFoot();
  }
  function carFoot() {
    const id = gPrev.car || SAVE.data.current, def = DATA.CAR[id];
    if (id === SAVE.data.current) { foot('<span class="muted">' + U.esc(def.name) + ' — твоя текущая машина</span>'); return; }
    if (SAVE.owns(id)) { const f = foot('<button class="btn ok" id="fSel" style="flex:1">Выбрать ' + U.esc(def.name) + '</button>'); U.$('#fSel', f).onclick = () => { SAVE.data.current = id; SAVE.save(); gPrev.car = null; NET.mp.updateLook(); UIo.toast(def.name + ' выбрана', 'good'); panelCars(); garageInfo(); }; return; }
    const can = SAVE.data.money >= def.price;
    const f = foot('<button class="btn ' + (can ? '' : 'dis') + '" id="fBuy" style="flex:1">Купить за ' + U.money(def.price) + '</button>');
    U.$('#fBuy', f).onclick = () => {
      if (!SAVE.spend(def.price)) return UIo.toast('Не хватает денег', 'bad');
      SAVE.data.cars[id] = SAVE.newCarCfg(id); SAVE.data.current = id; SAVE.save(); gPrev.car = null; AUDIO.cash();
      UIo.toast('Поздравляем с покупкой: ' + def.name + '!', 'good'); panelCars(); garageInfo();
    };
  }

  let kitTab = 'fbump';
  function panelKits(tab) {
    if (tab) kitTab = tab;
    const def = DATA.CAR[SAVE.data.current], cfg = SAVE.curCfg();
    const body = setDrawer('Обвесы · ' + DATA.KIT_TOTAL, DATA.KITS.map(k => [k.id, k.name]), kitTab, id => { gPrev.kit = {}; panelKits(id); garageInfo(); });
    const K = DATA.KITS.find(k => k.id === kitTab);
    body.innerHTML = '<div class="list"></div>'; const L = U.$('.list', body);
    K.opts.forEach((name, idx) => {
      const own = cfg.kitsOwned.includes(K.id + ':' + idx), inst = cfg.kit[K.id] === idx, price = DATA.kitPrice(def, idx);
      const eff = (DATA.KIT_EFFECT[K.id] || [])[idx] || '';
      const it = U.el('div', 'item' + (inst ? ' cur' : '') + ((gPrev.kit[K.id] !== undefined ? gPrev.kit[K.id] : cfg.kit[K.id]) === idx ? ' sel' : ''));
      it.innerHTML = '<div class="meta"><div class="t">' + U.esc(name) + '</div><div class="s">' + (eff ? U.esc(eff) : K.name) + '</div></div><div class="p ' + (own ? 'own' : '') + '">' + (inst ? 'Установлено ✓' : own ? 'Куплено' : U.money(price)) + '</div>';
      it.onclick = () => { gPrev.kit = { [K.id]: idx }; U.$$('.item', L).forEach(x => x.classList.remove('sel')); it.classList.add('sel'); kitFoot(K, idx); garageInfo(); AUDIO.click(); };
      L.appendChild(it);
    });
    kitFoot(K, gPrev.kit[K.id] !== undefined ? gPrev.kit[K.id] : cfg.kit[K.id]);
  }
  function kitFoot(K, idx) {
    const def = DATA.CAR[SAVE.data.current], cfg = SAVE.curCfg();
    const own = cfg.kitsOwned.includes(K.id + ':' + idx), inst = cfg.kit[K.id] === idx, price = DATA.kitPrice(def, idx);
    if (inst) { foot('<span class="muted">' + U.esc(K.opts[idx]) + ' — установлено</span>'); return; }
    const can = own || SAVE.data.money >= price;
    const f = foot('<button class="btn ' + (can ? '' : 'dis') + '" id="fKit" style="flex:1">' + (own ? 'Установить' : 'Купить и установить · ' + U.money(price)) + '</button>');
    U.$('#fKit', f).onclick = () => {
      if (!own) { if (!SAVE.spend(price)) return UIo.toast('Не хватает денег', 'bad'); cfg.kitsOwned.push(K.id + ':' + idx); AUDIO.cash(); }
      cfg.kit[K.id] = idx; gPrev.kit = {}; SAVE.save(); NET.mp.updateLook(); UIo.toast(K.name + ': ' + K.opts[idx], 'good'); panelKits(); garageInfo();
    };
  }

  let paintTab = 'body';
  function panelPaint(tab) {
    if (tab) paintTab = tab;
    const cfg = SAVE.curCfg(), p = cfg.paint;
    const body = setDrawer('Цвет', [['body', 'Цвет авто'], ['wheel', 'Цвет колёс'], ['light', 'Цвет фар'], ['neon', 'Неон']], paintTab, id => panelPaint(id));
    const key = paintTab;
    const apply = v => { p[key] = v; SAVE.save(); NET.mp.updateLook(); panelPaint(); };
    let h = '';
    if (key === 'body') { h += '<div class="group-t">Покрытие</div><div class="chips">' + DATA.FINISHES.map(([id, n]) => '<button class="chip' + (p.finish === id ? ' on' : '') + '" data-f="' + id + '">' + n + '</button>').join('') + '</div>'; }
    const pal = key === 'light' ? DATA.LIGHT_COLORS : key === 'neon' ? DATA.NEON_COLORS : DATA.PALETTE;
    h += '<div class="group-t">' + ({ body: 'Цвет кузова', wheel: 'Цвет дисков', light: 'Цвет фар', neon: 'Подсветка днища' })[key] + '</div><div class="swatches">';
    h += pal.map(c => '<button class="sw' + ((p[key] || '') === c ? ' on' : '') + '" data-c="' + c + '" style="background:' + (c || 'repeating-linear-gradient(45deg,#333 0 6px,#222 6px 12px)') + '" title="' + (c || 'Без неона') + '"></button>').join('') + '</div>';
    h += '<div class="color-row"><input type="color" id="pc" value="' + (p[key] || '#ff2bd6') + '"><span class="muted">Свой цвет</span></div>';
    body.innerHTML = h;
    U.$$('[data-f]', body).forEach(b => b.onclick = () => { p.finish = b.dataset.f; SAVE.save(); NET.mp.updateLook(); panelPaint(); });
    U.$$('[data-c]', body).forEach(b => b.onclick = () => apply(b.dataset.c));
    const pc = U.$('#pc', body); pc.oninput = () => { p[key] = pc.value; }; pc.onchange = () => apply(pc.value);
    foot('<span class="muted">Покраска бесплатная</span>');
  }

  function panelVinyl() {
    const cfg = SAVE.curCfg(), p = cfg.paint;
    const body = setDrawer('Винил · ' + (DATA.VINYLS.length - 1), null);
    body.innerHTML = '<div class="color-row"><input type="color" id="v1" value="' + p.v1 + '"><span class="muted">Цвет 1</span><input type="color" id="v2" value="' + p.v2 + '"><span class="muted">Цвет 2</span></div><div class="vgrid"></div>';
    const grid = U.$('.vgrid', body);
    DATA.VINYLS.forEach((n, i) => {
      const cell = U.el('div', 'vcell' + (p.vinyl === i ? ' on' : ''));
      cell.appendChild(carThumb({ car: SAVE.data.current, kit: cfg.kit, paint: Object.assign({}, p, { vinyl: i }) }, 110, 64));
      cell.appendChild(U.el('div', '', U.esc(n)));
      cell.onclick = () => { p.vinyl = i; SAVE.save(); NET.mp.updateLook(); U.$$('.vcell', grid).forEach(x => x.classList.remove('on')); cell.classList.add('on'); AUDIO.click(); };
      grid.appendChild(cell);
    });
    ['v1', 'v2'].forEach(k => { const inp = U.$('#' + k, body); inp.oninput = () => { p[k] = inp.value; }; inp.onchange = () => { p[k] = inp.value; SAVE.save(); NET.mp.updateLook(); panelVinyl(); }; });
    foot('<span class="muted">Винил бесплатный · цвета меняются выше</span>');
  }

  let tuneTab = 'up';
  function panelTune(tab) {
    if (tab) tuneTab = tab;
    const def = DATA.CAR[SAVE.data.current], cfg = SAVE.curCfg();
    const body = setDrawer('Тюнинг', [['up', 'Улучшения'], ['susp', 'Подвеска и настройки']], tuneTab, id => panelTune(id));
    if (tuneTab === 'up') {
      body.innerHTML = DATA.UPGRADES.map(u => {
        const lvl = cfg.up[u.id], max = lvl >= u.max, price = Math.round(u.base * (lvl + 1) * (1 + def.tier * 0.4) / 50) * 50;
        return '<div class="up-row"><div class="top"><b>' + u.name + '</b><div class="pips">' + Array.from({ length: u.max }, (_, i) => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('') + '</div></div><div class="d">' + u.desc + '</div>' +
          (max ? '<span class="muted">Максимальный уровень</span>' : '<button class="btn sm ' + (SAVE.data.money >= price ? '' : 'dis') + '" data-up="' + u.id + '" data-p="' + price + '">Улучшить · ' + U.money(price) + '</button>') + '</div>';
      }).join('');
      U.$$('[data-up]', body).forEach(b => b.onclick = () => { const pr = +b.dataset.p; if (!SAVE.spend(pr)) return UIo.toast('Не хватает денег', 'bad'); cfg.up[b.dataset.up]++; SAVE.save(); AUDIO.cash(); panelTune(); garageInfo(); });
      foot('<span class="muted">Улучшения действуют только на эту машину</span>');
    } else {
      body.innerHTML = DATA.TUNE.map(t => '<div class="slider-row"><div class="lab"><span>' + t.name + '</span><b id="tv_' + t.id + '">' + cfg.tune[t.id] + t.unit + '</b></div><input type="range" min="' + t.min + '" max="' + t.max + '" step="' + t.step + '" value="' + cfg.tune[t.id] + '" data-t="' + t.id + '"><div class="hint">' + t.hint + '</div></div>').join('');
      U.$$('[data-t]', body).forEach(r => {
        r.oninput = () => { const t = DATA.TUNE.find(x => x.id === r.dataset.t); cfg.tune[t.id] = +r.value; U.$('#tv_' + t.id).textContent = r.value + t.unit; garageInfo(); };
        r.onchange = () => SAVE.save();
      });
      const f = foot('<button class="btn ghost" id="tReset" style="flex:1">Сбросить настройки</button>');
      U.$('#tReset', f).onclick = () => { cfg.tune = Object.assign({}, DATA.TUNE_DEFAULT); SAVE.save(); panelTune(); garageInfo(); };
    }
  }

  // ---------- выбор карт ----------
  UIo.openMaps = function (forWhat) {
    UIo.mapsFor = forWhat;
    const mode = UIo.mode, maps = DATA.MAPS[mode];
    U.$('#mapsTitle').textContent = (forWhat === 'mp' ? 'Мультиплеер · ' : '') + (mode === 'drift' ? 'Дрифт-карты' : 'Гоночные трассы') + ' · ' + maps.length;
    U.$('#mapsSub').textContent = forWhat === 'mp' ? 'Выбери карту — создадим комнату и ссылку для друга' : (mode === 'drift' ? 'Набери целевые очки, чтобы открыть следующую карту' : 'Финишируй в тройке, чтобы открыть следующую трассу');
    U.$('#mapFilter').innerHTML = '';
    const grid = U.$('#mapGrid'); grid.innerHTML = '';
    const unl = SAVE.data.unlocked[mode];
    const todo = [];
    maps.forEach((m, i) => {
      const locked = i >= unl && forWhat !== 'mp_any';
      const best = SAVE.data.best[m.id];
      const card = U.el('div', 'mcard' + (locked ? ' locked' : ''));
      card.innerHTML = '<canvas width="320" height="200"></canvas><span class="num">#' + (i + 1) + '</span>' + (best ? '<span class="best">' + (mode === 'drift' ? U.num(best) : U.time(best)) + '</span>' : '') +
        (locked ? '<div class="lock">' + LOCK_SVG + '<span>' + (i === unl ? (mode === 'drift' ? 'Набери ' + U.num(maps[i - 1].target) + ' очков на #' + i : 'Займи 1–3 место на #' + i) : 'Закрыто') + '</span><button class="btn sm" data-buy="' + i + '">Открыть · ' + U.money(m.unlockPrice) + '</button></div>' : '') +
        '<div class="info"><div class="n">' + U.esc(m.name) + '</div><div class="m"><span>' + DATA.THEMES[m.theme].name + ' · ' + KIND[m.kind] + '</span><span class="stars">' + '★'.repeat(m.difficulty) + '</span></div><div class="m"><span>' + (mode === 'drift' ? 'Цель: ' + U.num(m.target) : m.laps + ' круга · ' + (m.ai + 1) + ' машин') + '</span><span>' + (mode === 'drift' ? U.clock(m.time) : '$' + U.num(m.reward)) + '</span></div></div>';
      card.onclick = e => {
        if (e.target.dataset.buy) { e.stopPropagation(); buyMap(i); return; }
        if (locked) { UIo.toast('Карта закрыта', 'bad'); return; }
        AUDIO.init(); AUDIO.click();
        if (forWhat === 'mp') createRoom(i); else GAME.start({ mode, mapIdx: i });
      };
      grid.appendChild(card); todo.push([U.$('canvas', card), m]);
    });
    UIo.show('maps');
    let k = 0; const step = () => { if (k >= todo.length || UIo.cur !== 'maps') return; TRACK.preview(todo[k][0], todo[k][1]); k++; setTimeout(step, 0); };
    setTimeout(step, 30);
  };
  function buyMap(i) {
    const mode = UIo.mode, m = DATA.MAPS[mode][i];
    confirmBox('Открыть «' + U.esc(m.name) + '»?', 'Будут открыты все карты до этой включительно.', 'Открыть за ' + U.money(m.unlockPrice), () => {
      if (!SAVE.spend(m.unlockPrice)) return UIo.toast('Не хватает денег', 'bad');
      SAVE.data.unlocked[mode] = Math.max(SAVE.data.unlocked[mode], i + 1); SAVE.save(); AUDIO.cash(); UIo.openMaps(UIo.mapsFor);
    });
  }

  // ---------- мультиплеер ----------
  function roomLink(id) {
    const base = /^https?:/.test(location.protocol) ? location.origin + location.pathname : (window.SITE_URL || '') + '/';
    return base + '?room=' + id;
  }
  async function createRoom(i) {
    UIo.toast('Создаём комнату…');
    try {
      const id = await NET.mp.create(UIo.mode, i);
      await NET.mp.enter(id);
      openLobby(id);
    } catch (e) { UIo.toast('Не удалось создать комнату: ' + NET.err(e), 'bad'); }
  }
  UIo.joinRoom = async function (text) {
    AUDIO.init();
    let code = String(text || '').trim(); const m = code.match(/room=([A-Za-z0-9]+)/); if (m) code = m[1];
    code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) return UIo.toast('Вставь ссылку или код комнаты', 'bad');
    if (!NET.ok) return UIo.toast('Нет соединения с Firebase', 'bad');
    UIo.toast('Подключение к комнате ' + code + '…');
    try {
      const room = await NET.mp.get(code);
      if (!room) return UIo.toast('Комната ' + code + ' не найдена', 'bad');
      UIo.mode = room.mode;
      await NET.mp.enter(code);
      openLobby(code);
    } catch (e) { UIo.toast('Ошибка подключения: ' + NET.err(e), 'bad'); }
  };
  function openLobby(id) {
    UIo.lastRound = 0;
    U.$('#lobbyCode').textContent = id;
    U.$('#lobbyLink').value = roomLink(id);
    try { history.replaceState(null, '', (/^https?:/.test(location.protocol) ? location.pathname : '') + '?room=' + id); } catch (e) { }
    bindLobby();
    UIo.show('lobby');
    renderLobby();
  }
  function bindLobby() {
    NET.mp.onPlayers = () => renderLobby();
    NET.mp.onRoom = r => {
      if (!r) { if (UIo.cur === 'lobby') { UIo.toast('Комната закрыта', 'bad'); leaveLobby(); } return; }
      renderLobby();
      if (r.state === 'run' && (r.round || 0) > UIo.lastRound && UIo.cur === 'lobby') {
        UIo.lastRound = r.round || 0;
        GAME.start({ mode: r.mode, mapIdx: r.map, mp: true, late: Date.now() - (r.startT || 0) > 6000 });
      }
    };
  }
  UIo.backToLobby = function () {
    if (!NET.mp.id) { UIo.show('mode'); return; }
    NET.mp.send({ score: 0, dist: 0, fin: 0, lap: 0 }, true);
    bindLobby(); UIo.show('lobby'); renderLobby();
  };
  function renderLobby() {
    const r = NET.mp.room, P = NET.mp.players || {};
    if (r) {
      const m = DATA.MAPS[r.mode] && DATA.MAPS[r.mode][r.map];
      U.$('#lobbyMap').textContent = (r.mode === 'drift' ? 'Дрифт' : 'Гонка') + (m ? ' · ' + m.name + ' · ' + DATA.THEMES[m.theme].name : '');
      document.body.classList.toggle('race', r.mode === 'race');
    }
    const ids = Object.keys(P).sort((a, b) => (P[a].joined || 0) - (P[b].joined || 0));
    U.$('#lobbyPlayers').innerHTML = ids.map(id => { const p = P[id], car = p.look && DATA.CAR[p.look.car]; return '<li><span>' + U.esc(p.nick || 'Игрок') + (r && r.host === id ? '<span class="host">ХОСТ</span>' : '') + (id === NET.pid ? ' <span class="muted">(ты)</span>' : '') + '</span><span class="muted">' + (car ? U.esc(car.name) : '') + '</span></li>'; }).join('') || '<li class="muted">Загрузка…</li>';
    const host = NET.mp.isHost();
    U.$('#btnLobbyStart').classList.toggle('hidden', !host);
    U.$('#lobbyStatus').textContent = host ? (ids.length < 2 ? 'Отправь ссылку другу. Можно начать и одному.' : 'Все на месте? Жми «Начать»!') : 'Ждём, когда хост начнёт заезд…';
  }
  function startRoom() {
    const r = NET.mp.room; if (!r) return;
    AUDIO.init();
    NET.mp.setRoom({ state: 'run', startT: Date.now(), round: (r.round || 0) + 1 }).catch(e => UIo.toast(NET.err(e), 'bad'));
  }
  async function leaveLobby() {
    await NET.mp.leave();
    try { history.replaceState(null, '', /^https?:/.test(location.protocol) ? location.pathname : location.href.split('?')[0]); } catch (e) { }
    UIo.show('mode');
  }

  // ---------- настройки ----------
  const TABS_PC = [['music', 'Музыка'], ['sound', 'Звук'], ['game', 'Игра'], ['account', 'Аккаунт'], ['link', 'Ссылка на сайт']];
  const TABS_MOB = [['music', 'Музыка'], ['sound', 'Звук'], ['controls', 'Управление'], ['editctl', 'Изменить управление'], ['display', 'Дисплей'], ['game', 'Игра'], ['account', 'Аккаунт'], ['link', 'Ссылка на сайт']];
  UIo.openSettings = function (tab) {
    if (UIo.cur !== 'settings') UIo.setReturn = UIo.cur === 'game' ? 'main' : UIo.cur;
    U.$('#setDevice').textContent = U.isMobile ? 'Мобильная версия' : 'Компьютерная версия';
    const tabs = U.isMobile ? TABS_MOB : TABS_PC;
    const nav = U.$('#setTabs'); nav.innerHTML = '';
    tabs.forEach(([id, n]) => { const b = U.el('button', '', n); b.dataset.tab = id; b.onclick = () => renderSetTab(id); nav.appendChild(b); });
    UIo.show('settings');
    renderSetTab(tab || UIo.setTab || 'music');
  };
  const toggle = (label, on, id) => '<div class="toggle"><span>' + label + '</span><button class="sw-t' + (on ? ' on' : '') + '" id="' + id + '" aria-label="' + label + '"></button></div>';
  const slider = (label, val, id, min, max, step) => '<div class="slider-row"><div class="lab"><span>' + label + '</span><b id="' + id + 'V">' + Math.round(val * 100) + '%</b></div><input type="range" id="' + id + '" min="' + (min || 0) + '" max="' + (max || 1) + '" step="' + (step || 0.05) + '" value="' + val + '"></div>';
  function bindSlider(id, key, fmt) {
    const r = U.$('#' + id); if (!r) return;
    r.oninput = () => { SAVE.s()[key] = +r.value; U.$('#' + id + 'V').textContent = fmt ? fmt(+r.value) : Math.round(r.value * 100) + '%'; AUDIO.apply(); };
    r.onchange = () => SAVE.save();
  }
  function bindToggle(id, key, after) { const b = U.$('#' + id); if (!b) return; b.onclick = () => { const s = SAVE.s(); s[key] = !s[key]; b.classList.toggle('on', s[key]); SAVE.save(); AUDIO.init(); AUDIO.apply(); if (after) after(s[key]); }; }
  function renderSetTab(tab) {
    UIo.setTab = tab;
    U.$$('#setTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const c = U.$('#setContent'), s = SAVE.s();
    switch (tab) {
      case 'music': {
        c.innerHTML = '<h3>Музыка</h3>' + toggle('Музыка в игре', s.musicOn, 'tMusic') + slider('Громкость музыки', s.music, 'sMusic') +
          '<h4>Выбор трека</h4><div class="tracks">' + AUDIO.TRACKS.map((t, i) => '<div class="trk' + (s.musicOn && s.track === i ? ' on' : '') + '" data-trk="' + i + '"><div class="eq"><i></i><i></i><i></i></div><div><div>' + t.name + '</div><div class="s">' + t.style + ' · ' + t.bpm + ' BPM</div></div></div>').join('') + '</div>' +
          '<h4>Своя музыка</h4><label class="btn ghost" style="cursor:pointer">Загрузить mp3/ogg с устройства<input type="file" accept="audio/*" id="fMusic" hidden></label><p class="muted" style="margin-top:8px;font-size:13px">' + (AUDIO.fileName() ? 'Загружено: ' + U.esc(AUDIO.fileName()) : 'Файл играет только у тебя и не загружается в интернет') + '</p>';
        bindToggle('tMusic', 'musicOn', on => { if (on) AUDIO.playMusic(s.track); renderSetTab('music'); });
        bindSlider('sMusic', 'music');
        U.$$('[data-trk]', c).forEach(el => el.onclick = () => { AUDIO.init(); s.track = +el.dataset.trk; s.musicOn = true; SAVE.save(); AUDIO.apply(); AUDIO.playMusic(s.track); renderSetTab('music'); });
        U.$('#fMusic', c).onchange = e => { const f = e.target.files[0]; if (f) { s.musicOn = true; SAVE.save(); AUDIO.apply(); AUDIO.playFile(f); renderSetTab('music'); U.$$('.trk', c).forEach(x => x.classList.remove('on')); } };
        break;
      }
      case 'sound':
        c.innerHTML = '<h3>Звук</h3>' + slider('Общая громкость', s.master, 'sMaster') + slider('Рёв мотора', s.engine, 'sEngine') + slider('Шины и занос', s.tire, 'sTire') +
          slider('Звуки окружения (природа, город, дождь)', s.amb, 'sAmb') + slider('Эффекты (удары, интерфейс)', s.sfx, 'sSfx') +
          '<button class="btn ghost" id="sTest" style="margin-top:6px">Проверить звук мотора</button>';
        bindSlider('sMaster', 'master'); bindSlider('sEngine', 'engine'); bindSlider('sTire', 'tire'); bindSlider('sAmb', 'amb'); bindSlider('sSfx', 'sfx');
        U.$('#sTest', c).onclick = () => {
          AUDIO.init(); const sp = PHYS.spec(DATA.CAR[SAVE.data.current], SAVE.curCfg()); AUDIO.engineStart(sp); let t = 0;
          const iv = setInterval(() => { t += 0.05; const rpm = 900 + Math.sin(Math.min(t, 2.4) / 2.4 * Math.PI) * (sp.redline - 900); AUDIO.engineUpdate(rpm, t < 1.6 ? 1 : 0, 0, 0, 'road'); if (t > 2.6) { clearInterval(iv); AUDIO.engineStop(); } }, 50);
        };
        break;
      case 'controls': {
        const sch = [['joystick', 'Джойстик', '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="3"><circle cx="28" cy="28" r="22"/><circle cx="28" cy="28" r="9" fill="currentColor"/></svg>'],
        ['buttons', 'Кнопки', '<svg viewBox="0 0 56 56" fill="currentColor"><path d="M6 28l12-10v20z"/><path d="M50 28L38 18v20z"/><rect x="22" y="22" width="12" height="12" rx="3"/></svg>'],
        ['wheel', 'Руль', '<svg viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="4"><circle cx="28" cy="28" r="22"/><circle cx="28" cy="28" r="5" fill="currentColor"/><path d="M6 30h17M33 30h17M28 33v17"/></svg>']];
        c.innerHTML = '<h3>Управление</h3><p class="muted" style="margin-bottom:12px">Выбери схему сенсорного управления</p><div class="scheme-grid">' + sch.map(([id, n, svg]) => '<button class="scheme' + (s.scheme === id ? ' on' : '') + '" data-sch="' + id + '">' + svg + n + '</button>').join('') + '</div>' +
          '<div style="margin-top:14px">' + toggle('Вибрация', s.vibrate, 'tVib') + toggle('Помощь в заносе (контрруление)', s.assist, 'tAssist') + '</div>' +
          slider('Прозрачность кнопок', s.touchAlpha, 'sAlpha', 0.3, 1, 0.05);
        U.$$('[data-sch]', c).forEach(b => b.onclick = () => { s.scheme = b.dataset.sch; SAVE.save(); renderSetTab('controls'); });
        bindToggle('tVib', 'vibrate'); bindToggle('tAssist', 'assist'); bindSlider('sAlpha', 'touchAlpha');
        break;
      }
      case 'editctl':
        c.innerHTML = '<h3>Изменить управление</h3><p class="muted" style="margin-bottom:14px">Перемести кнопки так, как тебе удобно, и измени их размер. Текущая схема: <b>' + ({ joystick: 'Джойстик', buttons: 'Кнопки', wheel: 'Руль' })[s.scheme] + '</b></p><button class="btn" id="openLE">Открыть редактор кнопок</button> <button class="btn ghost" id="resetLE">Сбросить расположение</button>';
        U.$('#openLE', c).onclick = openLayoutEditor;
        U.$('#resetLE', c).onclick = () => { INPUT.reset(s.scheme); UIo.toast('Расположение сброшено', 'good'); };
        break;
      case 'display':
        c.innerHTML = '<h3>Дисплей</h3><h4>Ориентация экрана в игре</h4><div class="chips">' + [['landscape', 'Горизонтальная'], ['portrait', 'Вертикальная'], ['auto', 'Автоматически']].map(([id, n]) => '<button class="chip' + (s.orient === id ? ' on' : '') + '" data-or="' + id + '">' + n + '</button>').join('') + '</div>' +
          '<p class="muted" style="font-size:13px;margin-bottom:12px">Ориентация фиксируется при входе в заезд (в полноэкранном режиме).</p>' +
          '<h4>Качество графики</h4><div class="chips">' + [['high', 'Высокое'], ['low', 'Экономное']].map(([id, n]) => '<button class="chip' + (s.quality === id ? ' on' : '') + '" data-q="' + id + '">' + n + '</button>').join('') + '</div>' +
          '<button class="btn ghost" id="fsBtn">Полный экран</button>';
        U.$$('[data-or]', c).forEach(b => b.onclick = () => { s.orient = b.dataset.or; SAVE.save(); UIo.applyOrientation(); renderSetTab('display'); });
        U.$$('[data-q]', c).forEach(b => b.onclick = () => { s.quality = b.dataset.q; SAVE.save(); renderSetTab('display'); });
        U.$('#fsBtn', c).onclick = () => { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => { }); else if (document.exitFullscreen) document.exitFullscreen().catch(() => { }); };
        break;
      case 'game':
        c.innerHTML = '<h3>Игра</h3><h4>Камера</h4><div class="chips">' + [['fixed', 'Север вверху'], ['rotate', 'За машиной']].map(([id, n]) => '<button class="chip' + (s.camera === id ? ' on' : '') + '" data-cam="' + id + '">' + n + '</button>').join('') + '</div>' +
          toggle('Помощь в заносе (контрруление)', s.assist, 'tAssist2') +
          (U.isMobile ? '' : '<h4>Качество графики</h4><div class="chips">' + [['high', 'Высокое'], ['low', 'Экономное']].map(([id, n]) => '<button class="chip' + (s.quality === id ? ' on' : '') + '" data-q="' + id + '">' + n + '</button>').join('') + '</div>') +
          '<h4>Клавиши</h4><div class="keys"><span><kbd>W</kbd><kbd>↑</kbd></span><span>Газ</span><span><kbd>S</kbd><kbd>↓</kbd></span><span>Тормоз / задний ход</span><span><kbd>A</kbd><kbd>D</kbd></span><span>Руль</span><span><kbd>Пробел</kbd></span><span>Ручник (для заноса)</span><span><kbd>R</kbd></span><span>Вернуться на трассу</span><span><kbd>C</kbd></span><span>Сменить камеру</span><span><kbd>Esc</kbd></span><span>Пауза</span></div>' +
          '<p class="muted" style="margin-top:12px;font-size:13px">Поддерживается геймпад: стики/курки, A — газ, B — тормоз, X/RB — ручник.</p>' +
          '<h4>Статистика</h4><p class="muted">Гонок: ' + SAVE.data.stats.races + ' · Побед: ' + SAVE.data.stats.wins + ' · Дрифт-сессий: ' + SAVE.data.stats.drifts + ' · Рекорд дрифта: ' + U.num(SAVE.data.stats.bestDrift) + '</p>';
        U.$$('[data-cam]', c).forEach(b => b.onclick = () => { s.camera = b.dataset.cam; SAVE.save(); renderSetTab('game'); });
        U.$$('[data-q]', c).forEach(b => b.onclick = () => { s.quality = b.dataset.q; SAVE.save(); renderSetTab('game'); });
        bindToggle('tAssist2', 'assist');
        break;
      case 'account': renderAccount(c); break;
      case 'link': {
        const url = window.SITE_URL || location.href.split('?')[0];
        c.innerHTML = '<h3>Ссылка на сайт</h3><p class="muted" style="margin-bottom:12px">Оригинальный сайт игры — делись с друзьями:</p><div class="linkbox"><a href="' + U.esc(url) + '" target="_blank" rel="noopener">' + U.esc(url) + '</a><button class="btn sm" id="cpSite">Копировать</button></div>';
        U.$('#cpSite', c).onclick = () => U.copy(url).then(() => UIo.toast('Ссылка скопирована', 'good'));
        break;
      }
    }
  }
  function renderAccount(c) {
    const li = NET.loggedIn();
    if (!li) {
      c.innerHTML = '<h3>Аккаунт</h3><p class="muted" style="margin-bottom:14px">Сейчас ты играешь как гость <b>' + U.esc(SAVE.data.nick) + '</b>. Прогресс хранится только в этом браузере. Зарегистрируйся, чтобы сохранить гараж в облаке и играть с любого устройства.</p>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px"><button class="btn" id="aReg">Регистрация</button><button class="btn ghost" id="aLog">Вход</button></div>' +
        '<h4>Ник гостя</h4><form class="form" id="nickF"><input name="nick" maxlength="16" value="' + U.esc(SAVE.data.nick) + '"><div class="err" id="nickE"></div><button class="btn ghost">Сохранить ник</button></form>' +
        '<h4>Сброс</h4><button class="btn ghost" id="aWipe" style="color:var(--bad)">Сбросить прогресс гостя</button>';
      U.$('#aReg', c).onclick = () => authModal('register'); U.$('#aLog', c).onclick = () => authModal('login');
      U.$('#aWipe', c).onclick = () => confirmBox('Сбросить прогресс?', 'Все машины, деньги и открытые карты гостя будут удалены.', 'Сбросить', () => { SAVE.data = SAVE.defaults(); SAVE.save(); AUDIO.apply(); UIo.toast('Прогресс сброшен'); renderSetTab('account'); }, true);
    } else {
      const u = NET.user;
      c.innerHTML = '<h3>Аккаунт</h3><p style="margin-bottom:4px">Ник: <b>' + U.esc(NET.nick) + '</b></p><p class="muted" style="margin-bottom:14px">Email: ' + U.esc(u.email || '') + ' · прогресс синхронизируется с облаком</p>' +
        '<h4>Сменить ник</h4><form class="form" id="nickF"><input name="nick" maxlength="16" value="' + U.esc(NET.nick) + '"><div class="err" id="nickE"></div><button class="btn ghost">Сохранить ник</button></form>' +
        '<h4>Сменить пароль</h4><form class="form" id="passF"><input name="old" type="password" placeholder="Текущий пароль" autocomplete="current-password" required><input name="n1" type="password" placeholder="Новый пароль (мин. 6 символов)" autocomplete="new-password" required minlength="6"><input name="n2" type="password" placeholder="Повтори новый пароль" autocomplete="new-password" required><div class="err" id="passE"></div><button class="btn">Сменить пароль</button></form>' +
        '<h4>Забыл пароль?</h4><button class="btn ghost" id="aReset">Отправить письмо для сброса на ' + U.esc(u.email || '') + '</button>' +
        '<h4>Выход</h4><button class="btn ghost" id="aOut">Выйти из аккаунта</button>';
      U.$('#passF', c).onsubmit = async e => {
        e.preventDefault(); const f = e.target, er = U.$('#passE', c);
        if (f.n1.value !== f.n2.value) { er.textContent = 'Новые пароли не совпадают'; return; }
        if (f.n1.value.length < 6) { er.textContent = 'Минимум 6 символов'; return; }
        er.textContent = '';
        try { await NET.changePassword(f.old.value, f.n1.value); f.reset(); UIo.toast('Пароль изменён', 'good'); } catch (ex) { er.textContent = NET.err(ex); }
      };
      U.$('#aReset', c).onclick = async () => { try { await NET.resetPassword(u.email); UIo.toast('Письмо отправлено на ' + u.email, 'good'); } catch (ex) { UIo.toast(NET.err(ex), 'bad'); } };
      U.$('#aOut', c).onclick = logout;
    }
    U.$('#nickF', c).onsubmit = async e => {
      e.preventDefault(); const n = e.target.nick.value.trim(), er = U.$('#nickE', c);
      if (n.length < 2) { er.textContent = 'Минимум 2 символа'; return; }
      try { await NET.changeNick(n); er.textContent = ''; UIo.toast('Ник изменён на ' + n, 'good'); NET.mp.updateLook(); } catch (ex) { er.textContent = NET.err(ex); }
    };
  }

  // Редактор раскладки сенсорных кнопок
  function openLayoutEditor() {
    const s = SAVE.s(), ed = U.$('#layoutEd'), area = U.$('#layoutArea'), size = U.$('#leSize');
    let sel = null;
    const rebuild = () => INPUT.build(area, s.scheme, true, id => { sel = id; size.value = INPUT.itemScale(s.scheme, id); U.$('#leInfo').textContent = 'Выбрано: ' + ({ stick: 'джойстик', wheel: 'руль', gas: 'газ', brake: 'тормоз', hb: 'ручник', left: 'влево', right: 'вправо' })[id]; });
    ed.classList.remove('hidden'); rebuild();
    size.value = 1; U.$('#leInfo').textContent = 'Перетаскивай кнопки пальцем';
    size.oninput = () => { if (!sel) return; const e = U.$('[data-id="' + sel + '"]', area); if (e) e.style.transform = 'translate(-50%,-50%) scale(' + size.value + ')'; };
    size.onchange = () => { if (sel) INPUT.saveItem(s.scheme, sel, { s: +size.value }); };
    U.$('#leReset').onclick = () => { INPUT.reset(s.scheme); sel = null; rebuild(); };
    U.$('#leDone').onclick = () => { ed.classList.add('hidden'); area.innerHTML = ''; UIo.toast('Раскладка сохранена', 'good'); };
  }

  // Ориентация экрана (мобильные)
  UIo.applyOrientation = function (forGame) {
    if (!U.isMobile) return;
    const o = SAVE.s().orient;
    const lock = () => { try { if (screen.orientation && screen.orientation.lock) { if (o === 'auto') screen.orientation.unlock(); else screen.orientation.lock(o).catch(() => { }); } } catch (e) { } };
    if (forGame && o !== 'auto' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().then(lock).catch(lock); UIo._fsByGame = true;
    } else lock();
  };
  function exitFullscreenIfGame() { /* оставляем полноэкранный режим — удобнее на телефоне */ }

  return UIo;
})();
