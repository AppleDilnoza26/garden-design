// Категории каталога
export const CATEGORIES = [
  { id: 'trees', name: 'Деревья' },
  { id: 'shrubs', name: 'Кусты' },
  { id: 'flowers', name: 'Цветы' },
  { id: 'paths', name: 'Дорожки' },
  { id: 'water', name: 'Вода' },
  { id: 'decor', name: 'Постройки' },
];

export const FLOWER_COLORS = ['#e48aa4', '#f4d35e', '#ffffff', '#b48ad8', '#f29e6b'];

// Каталог объектов сада. Размеры в метрах: w — ширина, h — длина.
// kind — как рисовать объект (одинаково в 2D и 3D), остальные поля — его цвета и параметры.
export const CATALOG = {
  // Деревья
  tree:        { name: 'Лиственное', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, crown: '#4f8a4b', trunk: '#7a5634' },
  tree_birch:  { name: 'Берёза', category: 'trees', kind: 'tree', w: 2.5, h: 2.5, shape: 'circle', layer: 5, crown: '#7fae55', trunk: '#eeeae0', tall: true },
  tree_apple:  { name: 'Яблоня', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, crown: '#5a9447', trunk: '#6e4c30', fruit: '#d2453a' },
  tree_sakura: { name: 'Сакура', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, crown: '#efa7bf', trunk: '#5e4030' },
  tree_spruce: { name: 'Ель', category: 'trees', kind: 'conifer', w: 2.5, h: 2.5, shape: 'circle', layer: 5, color: '#2f5d3a', heightK: 2.4 },

  // Кусты
  shrub:       { name: 'Кустарник', category: 'shrubs', kind: 'shrub', w: 1.2, h: 1.2, shape: 'circle', layer: 4, color: '#6f9a4a' },
  shrub_rose:  { name: 'Розовый куст', category: 'shrubs', kind: 'shrub', w: 1, h: 1, shape: 'circle', layer: 4, color: '#4f7f3a', berry: '#d23b5a' },
  shrub_thuja: { name: 'Туя', category: 'shrubs', kind: 'conifer', w: 0.8, h: 0.8, shape: 'circle', layer: 4, color: '#3f7040', heightK: 3 },
  shrub_hedge: { name: 'Живая изгородь', category: 'shrubs', kind: 'hedge', w: 4, h: 0.8, shape: 'rect', layer: 4, color: '#4f7f3a' },

  // Цветы
  flower:          { name: 'Клумба микс', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, colors: FLOWER_COLORS },
  flower_round:    { name: 'Круглая клумба', category: 'flowers', kind: 'flowerbed', w: 2, h: 2, shape: 'circle', layer: 2, colors: FLOWER_COLORS },
  flower_roses:    { name: 'Розы', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, colors: ['#c8243c', '#e45a78', '#f29aae'] },
  flower_tulips:   { name: 'Тюльпаны', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, colors: ['#e63b2e', '#f4d35e', '#f29e6b'] },
  flower_lavender: { name: 'Лаванда', category: 'flowers', kind: 'flowerbed', w: 2, h: 0.8, shape: 'rect', layer: 2, colors: ['#8e6cc4', '#a585d8', '#7556b0'] },

  // Дорожки и покрытия
  path:        { name: 'Плитка', category: 'paths', kind: 'path', w: 1, h: 4, shape: 'rect', layer: 0, pattern: 'tiles', fill: '#e3d3b0', line: '#c4ad82' },
  path_gravel: { name: 'Гравий', category: 'paths', kind: 'path', w: 1, h: 4, shape: 'rect', layer: 0, pattern: 'gravel', fill: '#d3cec4', line: '#a39d90' },
  path_stones: { name: 'Камни', category: 'paths', kind: 'path', w: 0.8, h: 4, shape: 'rect', layer: 0, pattern: 'stones', fill: '#bdb8ad', line: '#8f897d' },
  path_deck:   { name: 'Настил', category: 'paths', kind: 'path', w: 3, h: 3, shape: 'rect', layer: 0, pattern: 'boards', fill: '#c49a6c', line: '#8a6440' },

  // Вода
  pool:     { name: 'Бассейн', category: 'water', kind: 'pool', w: 4, h: 8, shape: 'rect', layer: 1 },
  pond:     { name: 'Пруд', category: 'water', kind: 'pond', w: 3, h: 2, shape: 'circle', layer: 1 },
  fountain: { name: 'Фонтан', category: 'water', kind: 'fountain', w: 2, h: 2, shape: 'circle', layer: 3 },

  // Постройки и декор
  gazebo: { name: 'Беседка', category: 'decor', kind: 'gazebo', w: 3, h: 3, shape: 'rect', layer: 3 },
  shed:   { name: 'Домик', category: 'decor', kind: 'shed', w: 3, h: 2.5, shape: 'rect', layer: 3 },
  bench:  { name: 'Скамейка', category: 'decor', kind: 'bench', w: 1.6, h: 0.6, shape: 'rect', layer: 3 },
  lamp:   { name: 'Фонарь', category: 'decor', kind: 'lamp', w: 0.4, h: 0.4, shape: 'circle', layer: 6 },
};

export const MIN_OBJECT_SIZE = 0.2;
export const MAX_OBJECT_SIZE = 50;

// Детерминированный генератор случайных чисел: одинаковый узор в 2D и 3D
export function seededRandom(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Позиции цветов внутри клумбы (локальные координаты в метрах)
export function flowerDots(obj) {
  const def = CATALOG[obj.type];
  const rand = seededRandom(obj.id);
  const count = Math.min(250, Math.max(6, Math.round(obj.w * obj.h * 10)));
  const dots = [];
  while (dots.length < count) {
    const x = rand() - 0.5;
    const y = rand() - 0.5;
    const color = def.colors[Math.floor(rand() * def.colors.length)];
    if (def.shape === 'circle' && x * x + y * y > 0.18) continue; // только внутри круга
    dots.push({ x: x * (obj.w - 0.2), y: y * (obj.h - 0.2), color });
  }
  return dots;
}

// Камни для дорожки из камней: вдоль длинной стороны
export function stonePositions(obj) {
  const rand = seededRandom(obj.id);
  const alongH = obj.h >= obj.w;
  const len = alongH ? obj.h : obj.w;
  const across = alongH ? obj.w : obj.h;
  const count = Math.max(1, Math.floor(len / 0.75));
  const step = len / count;
  const stones = [];
  for (let i = 0; i < count; i++) {
    const a = -len / 2 + step * (i + 0.5);
    const b = (i % 2 ? 1 : -1) * across * 0.12;
    const r = Math.min(across * 0.42, step * 0.42) * (0.85 + rand() * 0.15);
    stones.push(alongH ? { x: b, y: a, r } : { x: a, y: b, r });
  }
  return stones;
}

// Точки на поверхности кроны/куста: яблоки, бутоны (нормализованные, -0.5..0.5)
export function accentDots(obj, count) {
  const rand = seededRandom(obj.id + 'a');
  const dots = [];
  while (dots.length < count) {
    const x = rand() - 0.5;
    const y = rand() - 0.5;
    if (x * x + y * y < 0.16) dots.push({ x, y, z: rand() });
  }
  return dots;
}

// Не даём объекту выйти за границы участка (с учётом поворота)
export function clampObject(obj, plot) {
  const r = (obj.rotation * Math.PI) / 180;
  const ex = Math.abs((obj.w / 2) * Math.cos(r)) + Math.abs((obj.h / 2) * Math.sin(r));
  const ey = Math.abs((obj.w / 2) * Math.sin(r)) + Math.abs((obj.h / 2) * Math.cos(r));
  obj.x = ex * 2 > plot.width ? plot.width / 2 : Math.min(Math.max(obj.x, ex), plot.width - ex);
  obj.y = ey * 2 > plot.length ? plot.length / 2 : Math.min(Math.max(obj.y, ey), plot.length - ey);
}

export function clampSize(v) {
  return Math.round(Math.min(MAX_OBJECT_SIZE, Math.max(MIN_OBJECT_SIZE, v)) * 10) / 10;
}
