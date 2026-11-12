'use strict';
// Все игровые данные: темы карт, типы кузовов, машины, обвесы, винилы, карты
const DATA = (() => {
  // ---------- Темы окружения ----------
  const THEME_BASE = {
    road: '#2c2f34', curb: ['#ececec', '#d63031'], wall: '#a5abb2', wallAlt: '#d63031', line: 'rgba(255,255,255,.55)',
    mu: 1, off: 0.72, offDrag: 0.12, smoke: '225,225,225', skid: 'rgba(12,12,12,.4)', night: false, rain: false, amb: 'city'
  };
  const THEMES = {
    city: { name: 'Город', ground: '#4b5057', g2: '#555a61', deco: 'city', amb: 'city' },
    forest: { name: 'Лес', ground: '#3e6c33', g2: '#4a7a3d', deco: 'forest', amb: 'forest', wall: '#7a5a3a', wallAlt: '#e8e8e8' },
    snow: { name: 'Снег', ground: '#e6edf4', g2: '#f4f8fb', road: '#9eaab6', curb: ['#ffffff', '#2b6ee0'], wall: '#c9d6e3', wallAlt: '#2b6ee0', mu: 0.62, off: 0.75, offDrag: 0.16, smoke: '255,255,255', skid: 'rgba(60,75,95,.35)', deco: 'snow', amb: 'wind' },
    desert: { name: 'Пустыня', ground: '#d8b678', g2: '#e3c48a', road: '#5f564c', curb: ['#f3e6c4', '#c0392b'], wall: '#b08a5a', mu: 0.9, off: 0.66, smoke: '226,198,150', skid: 'rgba(50,35,20,.35)', deco: 'desert', amb: 'wind' },
    night: { name: 'Ночь', ground: '#1f2c1c', g2: '#26351f', road: '#25282c', night: true, deco: 'nightcity', amb: 'night' },
    neon: { name: 'Неон', ground: '#15132a', g2: '#1c1938', road: '#1d1c2b', curb: ['#ff2bd6', '#1fe3ff'], wall: '#8a3bff', wallAlt: '#1fe3ff', line: 'rgba(31,227,255,.6)', night: true, deco: 'neon', amb: 'neon' },
    port: { name: 'Порт', ground: '#545b62', g2: '#5d646b', deco: 'port', amb: 'port', wall: '#e0b13a', wallAlt: '#222' },
    mountain: { name: 'Горы', ground: '#5e6b49', g2: '#6a7752', deco: 'mountain', amb: 'wind', wall: '#9a9a92', wallAlt: '#e8e8e8' },
    track: { name: 'Автодром', ground: '#4d8a3a', g2: '#58964a', deco: 'track', amb: 'crowd' },
    wet: { name: 'Дождь', ground: '#2e3b33', g2: '#36443b', road: '#212428', mu: 0.74, rain: true, deco: 'city', amb: 'rain', skid: 'rgba(8,8,8,.25)', smoke: '200,210,220' },
  };
  for (const k in THEMES) THEMES[k] = Object.assign({}, THEME_BASE, THEMES[k], { id: k });

  // ---------- Типы кузовов ----------
  // shape: [начало лобового стекла, длина лобового, конец крыши, длина заднего стекла, ширина крыши, скругление носа, скругление кормы] (доли длины)
  // side:  [высота, высота капота, высота багажника] (м)
  // wr — радиус колеса, gc — дорожный просвет (м)
  const TYPES = {
    jdm: { name: 'Купе', L: 4.45, W: 1.76, mass: 1240, grip: 1.00, wf: 0.53, cyl: 6, shape: [0.12, 0.15, -0.16, 0.13, 0.70, 0.30, 0.22], side: [1.30, 0.82, 0.88], wr: 0.315, gc: 0.15 },
    sedan: { name: 'Седан', L: 4.75, W: 1.82, mass: 1480, grip: 0.97, wf: 0.54, cyl: 6, shape: [0.15, 0.14, -0.16, 0.13, 0.72, 0.26, 0.20], side: [1.42, 0.88, 0.94], wr: 0.33, gc: 0.16 },
    hatch: { name: 'Хэтчбек', L: 4.05, W: 1.74, mass: 1120, grip: 1.00, wf: 0.60, cyl: 4, shape: [0.20, 0.15, -0.36, 0.08, 0.74, 0.30, 0.16], side: [1.45, 0.88, 1.22], wr: 0.31, gc: 0.15 },
    muscle: { name: 'Маслкар', L: 4.85, W: 1.92, mass: 1620, grip: 0.93, wf: 0.56, cyl: 8, shape: [0.04, 0.13, -0.20, 0.13, 0.70, 0.18, 0.14], side: [1.33, 0.92, 0.95], wr: 0.34, gc: 0.16 },
    super: { name: 'Суперкар', L: 4.55, W: 1.98, mass: 1420, grip: 1.10, wf: 0.43, cyl: 10, shape: [0.08, 0.17, -0.12, 0.10, 0.62, 0.42, 0.24], side: [1.15, 0.72, 0.86], wr: 0.34, gc: 0.12 },
    gt: { name: 'Гран-туризмо', L: 4.65, W: 1.92, mass: 1530, grip: 1.05, wf: 0.52, cyl: 8, shape: [0.06, 0.16, -0.16, 0.12, 0.66, 0.34, 0.24], side: [1.28, 0.82, 0.9], wr: 0.34, gc: 0.14 },
    suv: { name: 'Внедорожник', L: 4.85, W: 1.97, mass: 2050, grip: 0.88, wf: 0.55, cyl: 8, shape: [0.20, 0.12, -0.40, 0.06, 0.80, 0.20, 0.14], side: [1.78, 1.12, 1.42], wr: 0.385, gc: 0.26 },
    rally: { name: 'Ралли', L: 4.30, W: 1.80, mass: 1280, grip: 1.02, wf: 0.57, cyl: 4, shape: [0.16, 0.15, -0.30, 0.10, 0.74, 0.26, 0.18], side: [1.42, 0.9, 1.1], wr: 0.325, gc: 0.2 },
    hyper: { name: 'Гиперкар', L: 4.65, W: 2.04, mass: 1360, grip: 1.16, wf: 0.42, cyl: 12, shape: [0.04, 0.18, -0.10, 0.09, 0.58, 0.45, 0.28], side: [1.12, 0.68, 0.8], wr: 0.35, gc: 0.11 },
    wagon: { name: 'Универсал', L: 4.85, W: 1.84, mass: 1560, grip: 0.96, wf: 0.55, cyl: 6, shape: [0.16, 0.14, -0.40, 0.06, 0.74, 0.24, 0.14], side: [1.48, 0.88, 1.36], wr: 0.33, gc: 0.16 },
    pickup: { name: 'Пикап', L: 5.25, W: 1.98, mass: 2120, grip: 0.87, wf: 0.58, cyl: 8, shape: [0.20, 0.12, -0.06, 0.05, 0.80, 0.18, 0.08], side: [1.82, 1.15, 1.05], wr: 0.4, gc: 0.28 },
    kei: { name: 'Кей-кар', L: 3.40, W: 1.48, mass: 760, grip: 0.95, wf: 0.62, cyl: 3, shape: [0.24, 0.14, -0.40, 0.06, 0.80, 0.34, 0.20], side: [1.62, 0.98, 1.4], wr: 0.28, gc: 0.15 },
  };

  // ---------- Машины (75 шт.) ----------
  const TIER = {
    hp: [0, 150, 230, 330, 450, 640, 980],
    top: [0, 195, 225, 258, 292, 335, 395],
    price: [0, 8000, 20000, 42000, 85000, 170000, 360000]
  };
  const BRANDS = [
    ['Kaze', [['Breeze S13', 'jdm', 1, 'RWD'], ['Breeze S14', 'jdm', 2, 'RWD'], ['Breeze S15 Spec-R', 'jdm', 3, 'RWD'], ['Tsubame 86', 'jdm', 1, 'RWD'], ['Gale Z', 'jdm', 3, 'RWD'], ['Typhoon GT-X', 'gt', 5, 'AWD'], ['Kei Mini', 'kei', 1, 'FWD']]],
    ['Hoshi', [['Ryu R7', 'jdm', 3, 'RWD'], ['Kitsune 2000', 'jdm', 2, 'RWD'], ['Tora Supreme', 'jdm', 4, 'RWD'], ['Ninja Evo', 'rally', 3, 'AWD'], ['Sakura Type-R', 'hatch', 2, 'FWD'], ['Shogun V', 'sedan', 3, 'RWD'], ['Tengu NX', 'super', 4, 'RWD']]],
    ['Nordwerk', [['N3 Coupe', 'sedan', 2, 'RWD'], ['N3 M-Sport', 'sedan', 3, 'RWD'], ['N5 Turbo', 'sedan', 4, 'RWD'], ['N8 Gran', 'gt', 4, 'RWD'], ['Kombi RS', 'wagon', 3, 'AWD'], ['Blitz 9', 'super', 4, 'RWD'], ['X-Trek', 'suv', 3, 'AWD']]],
    ['Ironhorse', [['Stallion 69', 'muscle', 2, 'RWD'], ['Stallion GT500', 'muscle', 4, 'RWD'], ['Tornado SS', 'muscle', 3, 'RWD'], ['Hellfire Demon', 'muscle', 5, 'RWD'], ['Outlaw 77', 'muscle', 2, 'RWD'], ['Coyote', 'pickup', 2, 'RWD'], ['Patriot Track', 'gt', 4, 'RWD']]],
    ['Veloce', [['Furia', 'super', 5, 'RWD'], ['Tempesta', 'super', 5, 'AWD'], ['Aquila GT', 'gt', 4, 'RWD'], ['Lampo', 'super', 4, 'RWD'], ['Vento Spider', 'super', 4, 'RWD'], ['Diavolo SV', 'hyper', 6, 'AWD'], ['Piccola', 'hatch', 1, 'FWD']]],
    ['Volkov', [['Taiga 4x4', 'suv', 1, 'AWD'], ['Sever Classic', 'sedan', 1, 'RWD'], ['Burya Sport', 'sedan', 2, 'RWD'], ['Kometa GT', 'gt', 3, 'RWD'], ['Sputnik R', 'rally', 2, 'AWD'], ['Baikal Kombi', 'wagon', 1, 'RWD'], ['Vostok Hyper', 'hyper', 6, 'AWD']]],
    ['Albion', [['Spitfire Roadster', 'jdm', 2, 'RWD'], ['Monarch V12', 'gt', 5, 'RWD'], ['Sterling DB', 'gt', 4, 'RWD'], ['Knight Mini', 'hatch', 1, 'FWD'], ['Windsor Estate', 'wagon', 2, 'RWD'], ['Falcon Lite', 'super', 3, 'RWD'], ['Crest Rally', 'rally', 3, 'AWD']]],
    ['Solaris', [['Pixel', 'hatch', 1, 'FWD'], ['Rallye 2', 'rally', 2, 'AWD'], ['Mistral Turbo', 'hatch', 3, 'RWD'], ['Etoile Coupe', 'jdm', 2, 'FWD'], ['Comete', 'super', 5, 'RWD'], ['Lune Berline', 'sedan', 2, 'FWD'], ['Alpin A1', 'jdm', 3, 'RWD']]],
    ['Apex', [['One', 'hyper', 6, 'RWD'], ['Zero', 'hyper', 6, 'AWD'], ['Nova', 'super', 5, 'RWD'], ['Quantum E', 'hyper', 6, 'AWD'], ['Vortex', 'super', 5, 'RWD'], ['Phantom', 'hyper', 6, 'RWD'], ['Eclipse', 'gt', 5, 'AWD']]],
    ['Dune', [['Runner', 'pickup', 2, 'AWD'], ['Scorpion', 'rally', 3, 'AWD'], ['Sand Viper', 'rally', 4, 'AWD'], ['Baja Trophy', 'pickup', 4, 'AWD'], ['Mesa', 'suv', 2, 'AWD'], ['Rattler', 'rally', 2, 'RWD'], ['Dust Devil', 'rally', 5, 'AWD']]],
    ['Hanma', [['Drift King', 'jdm', 4, 'RWD'], ['Street 240', 'jdm', 2, 'RWD'], ['Missile', 'jdm', 5, 'RWD'], ['Garage Hero', 'sedan', 3, 'RWD'], ['Midnight', 'sedan', 4, 'RWD']]],
  ];
  const CARS = [], CAR = {};
  BRANDS.forEach(([brand, models]) => models.forEach(([model, type, tier, drive]) => {
    const id = (brand + '-' + model).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const r = U.rng(U.hash(id)); const T = TYPES[type];
    const hp = Math.round(TIER.hp[tier] * (0.88 + r() * 0.24) / 5) * 5;
    const mass = Math.round(T.mass * (0.93 + r() * 0.14) * (tier >= 5 ? 0.95 : 1) / 10) * 10;
    const top = Math.round(TIER.top[tier] * (0.95 + r() * 0.1) * (type === 'suv' || type === 'pickup' ? 0.9 : 1));
    const grip = +(T.grip * (0.97 + r() * 0.06) * (1 + 0.025 * (tier - 1))).toFixed(3);
    const accel = +(4.6 + tier * 0.75 + (drive === 'AWD' ? 0.8 : 0)).toFixed(2);
    const price = Math.round(TIER.price[tier] * (0.85 + r() * 0.3) / 500) * 500;
    const c = { id, brand, model, name: brand + ' ' + model, type, tier, drive, hp, mass, top, grip, accel, price, lmul: 0.97 + r() * 0.06, wmul: 0.98 + r() * 0.04 };
    CARS.push(c); CAR[id] = c;
  }));
  const STARTER = 'kaze-breeze-s13';
  CAR[STARTER].price = 0;
  CARS.sort((a, b) => a.price - b.price || a.tier - b.tier);

  // ---------- Обвесы (60 вариантов на каждую машину) ----------
  const KITS = [
    { id: 'fbump', name: 'Передний бампер', opts: ['Стандарт', 'Сплиттер', 'Широкий «ракета»', 'Агрессивный', 'Канарды', 'Ралли-свет', 'Кенгурятник', 'Карбоновая губа'] },
    { id: 'head', name: 'Фары', opts: ['Стандарт', 'Круглые', 'Узкие', 'Злые', 'Поп-ап', 'LED-полоса', 'Двойные', 'Квадратные'] },
    { id: 'hood', name: 'Капот', opts: ['Стандарт', 'Воздухозаборник', 'Карбон', 'Жабры', 'Шейкер', 'Вентилируемый', 'Карбон-полосы', 'Горб'] },
    { id: 'roof', name: 'Крыша', opts: ['Стандарт', 'Карбон', 'Воздухозаборник', 'Багажник', 'Люк', 'Панорама'] },
    { id: 'mirror', name: 'Зеркала', opts: ['Стандарт', 'Гоночные', 'Карбон', 'Аэро'] },
    { id: 'skirt', name: 'Пороги', opts: ['Без порогов', 'Стандартные', 'Карбон', 'Широкие', '«Ракета»'] },
    { id: 'fender', name: 'Расширители', opts: ['Нет', 'Малые', 'Широкие', 'Огромные', 'Клёпаные'] },
    { id: 'spoiler', name: 'Спойлер', opts: ['Нет', 'Губа', 'Утиный хвост', 'GT-крыло', 'Лебединая шея', 'Двойное крыло', 'Дрифт-крыло', '«Ракета»', 'Мини', 'Тайм-атак'] },
    { id: 'rbump', name: 'Задний бампер', opts: ['Стандарт', 'Диффузор', 'Большой диффузор', 'Двойной выхлоп', 'Центральный выхлоп', 'Квадро-выхлоп'] },
  ];
  const KIT_TOTAL = KITS.reduce((s, k) => s + k.opts.length, 0);
  const KIT_EFFECT = {
    spoiler: ['', '+прижим', '+прижим', '++прижим зада', '++прижим зада', '++прижим зада', '+прижим', '++прижим', '+прижим', '+++прижим зада'],
    fbump: ['', '+прижим перед', '+прижим перед', '', '+прижим перед', '', '', '+прижим перед'],
    fender: ['', '+1.5% сцепл.', '+3% сцепл.', '+4.5% сцепл.', '+6% сцепл.'],
    hood: ['', '', '−12 кг', '', '', '', '−6 кг', ''],
    roof: ['', '−8 кг', '', '', '', ''],
  };
  function kitPrice(car, idx) { return idx === 0 ? 0 : Math.round((400 + idx * 300) * (1 + car.tier * 0.35) / 50) * 50; }

  // ---------- Покраска и винилы ----------
  const PALETTE = ['#e63946', '#ff6b35', '#ffb703', '#ffe14d', '#8ac926', '#2a9d8f', '#06d6a0', '#00b4d8', '#3a86ff', '#1d3557', '#7b2cbf', '#c77dff',
    '#ff4fa3', '#ffffff', '#d9dde3', '#9aa3ad', '#5c636e', '#2b2f36', '#111111', '#7f5539', '#c9a227', '#3d5a40', '#9d0208', '#14213d'];
  const FINISHES = [['gloss', 'Глянец'], ['metal', 'Металлик'], ['matte', 'Мат'], ['pearl', 'Перламутр'], ['chrome', 'Хром']];
  const VINYLS = ['Нет', 'Гоночные полосы', 'Боковая полоса', 'Тонкие полосы', 'Пламя', 'Шахматка', 'Камуфляж', 'Зебра', 'Тигр', 'Молнии', 'Звёзды', 'Горошек',
    'Соты', 'Градиент', 'Карбон', 'Номер', 'Восходящее солнце', 'Волны', 'Трайбл', 'Пиксели', 'Брызги', 'Диагональ', 'Сакура', 'Клетка'];
  const LIGHT_COLORS = ['#fff6d5', '#ffffff', '#cfe8ff', '#7fd4ff', '#ffd27a', '#ffe14d', '#b48cff', '#ff6b9a', '#7dff9a', '#ff4d4d'];
  const NEON_COLORS = ['', '#ff2bd6', '#1fe3ff', '#3dff7a', '#ff4d4d', '#ffe14d', '#7b5cff', '#ffffff', '#ff8c1a'];

  // ---------- Тюнинг ----------
  const UPGRADES = [
    { id: 'engine', name: 'Двигатель', max: 5, base: 2500, desc: '+12% мощности за уровень, выше макс. скорость' },
    { id: 'turbo', name: 'Турбина', max: 3, base: 4000, desc: '+10% мощности, звук турбины' },
    { id: 'tires', name: 'Шины', max: 4, base: 1500, desc: '+5% сцепления за уровень' },
    { id: 'weight', name: 'Облегчение', max: 3, base: 3000, desc: '−5% массы за уровень' },
    { id: 'brakes', name: 'Тормоза', max: 3, base: 1200, desc: '+12% тормозного усилия' },
  ];
  const TUNE = [
    { id: 'steer', name: 'Угол поворота колёс', min: 25, max: 65, step: 1, unit: '°', hint: 'Больше угол — легче держать глубокий занос' },
    { id: 'fstiff', name: 'Жёсткость подвески — перед', min: 1, max: 10, step: 1, unit: '', hint: 'Жёстче перед — больше недостаточной поворачиваемости' },
    { id: 'rstiff', name: 'Жёсткость подвески — зад', min: 1, max: 10, step: 1, unit: '', hint: 'Жёстче зад — машина легче уходит в занос' },
    { id: 'fcamber', name: 'Развал — перед', min: -8, max: 0, step: 0.5, unit: '°', hint: 'До −4° добавляет сцепления передней оси' },
    { id: 'rcamber', name: 'Развал — зад', min: -8, max: 0, step: 0.5, unit: '°', hint: 'Больше развал — меньше сцепление зада' },
    { id: 'height', name: 'Клиренс', min: 1, max: 10, step: 1, unit: '', hint: 'Ниже — чуть больше сцепления' },
    { id: 'diff', name: 'Блокировка дифференциала', min: 0, max: 100, step: 5, unit: '%', hint: 'Выше — стабильнее и агрессивнее занос' },
    { id: 'bias', name: 'Баланс тормозов (перед)', min: 40, max: 75, step: 1, unit: '%', hint: 'Меньше — задние колёса блокируются раньше' },
  ];
  const TUNE_DEFAULT = { steer: 42, fstiff: 5, rstiff: 5, fcamber: -3, rcamber: -1, height: 5, diff: 70, bias: 60 };

  // ---------- Карты ----------
  const DRIFT_LIST = [
    ['Пустая парковка', 'city', 'arena'], ['Лесной серпантин', 'forest', 'circuit'], ['Ночной город', 'night', 'circuit'], ['Заводской двор', 'port', 'arena'],
    ['Снежная петля', 'snow', 'circuit'], ['Пустынный каньон', 'desert', 'circuit'], ['Портовые доки', 'port', 'circuit'], ['Горный перевал', 'mountain', 'circuit'],
    ['Неоновый квартал', 'neon', 'circuit'], ['Мокрый асфальт', 'wet', 'circuit'], ['Аэродром', 'track', 'arena'], ['Ледяное озеро', 'snow', 'arena'],
    ['Старый автодром', 'track', 'circuit'], ['Промзона', 'city', 'circuit'], ['Туманный лес', 'forest', 'circuit'], ['Дюны', 'desert', 'arena'],
    ['Набережная', 'night', 'circuit'], ['Красная гора', 'mountain', 'circuit'], ['Киберпарк', 'neon', 'arena'], ['Ливень', 'wet', 'circuit'],
    ['Зимний город', 'snow', 'circuit'], ['Контейнерный терминал', 'port', 'circuit'], ['Пригород', 'forest', 'circuit'], ['Солёное озеро', 'desert', 'arena'],
    ['Вершина', 'mountain', 'circuit'], ['Полночь', 'neon', 'circuit'], ['Стадион', 'track', 'arena'], ['Тоннели', 'city', 'circuit'],
    ['Северное сияние', 'snow', 'circuit'], ['Закат', 'desert', 'circuit'], ['Шторм', 'wet', 'arena'], ['Король дрифта', 'night', 'circuit'],
  ];
  const RACE_LIST = [
    ['Кольцо Север', 'track', 'circuit'], ['Гран-при Город', 'city', 'circuit'], ['Лесная трасса', 'forest', 'circuit'], ['Пустынное ралли', 'desert', 'circuit'],
    ['Ночной спринт', 'night', 'circuit'], ['Снежное кольцо', 'snow', 'circuit'], ['Портовая гонка', 'port', 'circuit'], ['Горная трасса', 'mountain', 'circuit'],
    ['Неон GP', 'neon', 'circuit'], ['Дождевой спринт', 'wet', 'circuit'], ['Автодром Восток', 'track', 'circuit'], ['Скоростной овал', 'track', 'oval'],
    ['Береговая линия', 'city', 'circuit'], ['Каньон', 'desert', 'circuit'], ['Таёжная', 'forest', 'circuit'], ['Мегаполис', 'night', 'circuit'],
    ['Арктика', 'snow', 'circuit'], ['Мираж', 'desert', 'oval'], ['Перевал', 'mountain', 'circuit'], ['Ночной экспресс', 'night', 'circuit'],
    ['Синтвейв', 'neon', 'circuit'], ['Тайфун', 'wet', 'circuit'], ['Индустрия', 'port', 'circuit'], ['Национальный парк', 'forest', 'circuit'],
    ['Большой овал', 'city', 'oval'], ['Солнечная долина', 'track', 'circuit'], ['Ледник', 'snow', 'circuit'], ['Хайвей', 'night', 'oval'],
    ['Вулкан', 'mountain', 'circuit'], ['Финал Гран-при', 'track', 'circuit'], ['Легенда', 'neon', 'circuit'], ['Чемпионат', 'track', 'circuit'],
  ];
  function mkMaps(list, mode) {
    return list.map(([name, theme, kind], i) => {
      const r = U.rng(U.hash(mode + name) + i);
      const m = { id: mode[0] + i, idx: i, mode, name, theme, kind, seed: U.hash(name) + i * 7919, difficulty: 1 + Math.floor(i / 7) };
      if (kind === 'arena') { m.w = 210 + r() * 110; m.h = 150 + r() * 80; }
      else if (kind === 'oval') { m.R = 230 + r() * 70; m.n = 14; m.jitter = 0.03; m.ax = 1.7; m.ay = 0.75; m.width = 14; m.runoff = 7; }
      else if (mode === 'drift') {
        m.R = 120 + r() * 75 + i * 2; m.n = 9 + Math.floor(r() * 6); m.jitter = 0.22 + r() * 0.24;
        m.ax = 0.8 + r() * 0.5; m.ay = 0.8 + r() * 0.4; m.width = (theme === 'mountain' ? 12.5 : 14.5) + r() * 3.5; m.runoff = 7;
      } else {
        m.R = 220 + r() * 130 + i * 3; m.n = 10 + Math.floor(r() * 7); m.jitter = 0.2 + r() * 0.28;
        m.ax = 0.8 + r() * 0.55; m.ay = 0.8 + r() * 0.45; m.width = (theme === 'mountain' ? 10 : 11) + r() * 2.5; m.runoff = 6;
      }
      if (mode === 'drift') { m.time = 150; m.target = 12000 + i * 3000; }
      else { m.laps = kind === 'oval' ? 4 : 3; m.ai = 5; m.aiSkill = 0.8 + i * 0.0065; m.reward = 2000 + i * 450; }
      m.unlockPrice = 2500 + i * 1500;
      return m;
    });
  }
  const MAPS = { drift: mkMaps(DRIFT_LIST, 'drift'), race: mkMaps(RACE_LIST, 'race') };

  const AI_NAMES = ['Тень', 'Бродяга', 'Ronin', 'Фантом', 'Шершень', 'Сокол', 'Viper', 'Буря', 'Призрак', 'Neo', 'Кобра', 'Волк', 'Шторм', 'Ястреб', 'Kaito', 'Drifter', 'Барон', 'Ракета', 'Комета', 'Мрак'];

  return { THEMES, TYPES, TIER, CARS, CAR, STARTER, KITS, KIT_TOTAL, KIT_EFFECT, kitPrice, PALETTE, FINISHES, VINYLS, LIGHT_COLORS, NEON_COLORS, UPGRADES, TUNE, TUNE_DEFAULT, MAPS, AI_NAMES };
})();
