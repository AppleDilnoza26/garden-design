// Категории каталога
export const CATEGORIES = [
  { id: 'trees', name: 'Деревья' },
  { id: 'shrubs', name: 'Кусты' },
  { id: 'flowers', name: 'Цветы' },
  { id: 'paths', name: 'Дорожки' },
  { id: 'water', name: 'Вода' },
  { id: 'decor', name: 'Постройки' },
];

// Приглушённые природные оттенки цветов
export const FLOWER_COLORS = ['#d98a9e', '#e3c45a', '#f2efe6', '#9a7fc0', '#d9895a'];

// Каталог объектов сада. Размеры в метрах: w — ширина, h — длина.
// kind — как строить объект (одинаково в 2D и 3D), остальные поля — его параметры.
export const CATALOG = {
  // Деревья (preset — тип листвы)
  tree:        { name: 'Лиственное', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, preset: 'broadleaf', bark: 'bark' },
  tree_birch:  { name: 'Берёза', category: 'trees', kind: 'tree', w: 2.5, h: 2.5, shape: 'circle', layer: 5, preset: 'birch', bark: 'birch', tall: true },
  tree_apple:  { name: 'Яблоня', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, preset: 'apple', bark: 'bark', low: true },
  tree_sakura: { name: 'Сакура', category: 'trees', kind: 'tree', w: 3, h: 3, shape: 'circle', layer: 5, preset: 'sakura', bark: 'bark', low: true },
  tree_spruce: { name: 'Ель', category: 'trees', kind: 'conifer', w: 2.5, h: 2.5, shape: 'circle', layer: 5, form: 'spruce', heightK: 2.4 },

  // Кусты
  shrub:       { name: 'Кустарник', category: 'shrubs', kind: 'shrub', w: 1.2, h: 1.2, shape: 'circle', layer: 4, preset: 'shrub' },
  shrub_rose:  { name: 'Розовый куст', category: 'shrubs', kind: 'shrub', w: 1, h: 1, shape: 'circle', layer: 4, preset: 'rose' },
  shrub_thuja: { name: 'Туя', category: 'shrubs', kind: 'conifer', w: 0.8, h: 0.8, shape: 'circle', layer: 4, form: 'column', heightK: 3 },
  shrub_hedge: { name: 'Живая изгородь', category: 'shrubs', kind: 'hedge', w: 4, h: 0.8, shape: 'rect', layer: 4, preset: 'hedge' },

  // Цветы (plant — вид растений в клумбе)
  flower:          { name: 'Клумба микс', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, plant: 'daisy', colors: FLOWER_COLORS },
  flower_round:    { name: 'Круглая клумба', category: 'flowers', kind: 'flowerbed', w: 2, h: 2, shape: 'circle', layer: 2, plant: 'daisy', colors: FLOWER_COLORS },
  flower_roses:    { name: 'Розы', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, plant: 'rose', colors: ['#8e1c2c', '#b23a4c', '#d68a96'] },
  flower_tulips:   { name: 'Тюльпаны', category: 'flowers', kind: 'flowerbed', w: 1.5, h: 1, shape: 'rect', layer: 2, plant: 'tulip', colors: ['#b8322a', '#d9b24a', '#c9604a'] },
  flower_lavender: { name: 'Лаванда', category: 'flowers', kind: 'flowerbed', w: 2, h: 0.8, shape: 'rect', layer: 2, plant: 'lavender', colors: ['#6f5a9a', '#7d68a8', '#62508a'] },

  // Дорожки и покрытия
  path:        { name: 'Плитка', category: 'paths', kind: 'path', w: 1, h: 4, shape: 'rect', layer: 0, pattern: 'tiles' },
  path_gravel: { name: 'Гравий', category: 'paths', kind: 'path', w: 1, h: 4, shape: 'rect', layer: 0, pattern: 'gravel' },
  path_stones: { name: 'Камни', category: 'paths', kind: 'path', w: 0.8, h: 4, shape: 'rect', layer: 0, pattern: 'stones' },
  path_deck:   { name: 'Настил', category: 'paths', kind: 'path', w: 3, h: 3, shape: 'rect', layer: 0, pattern: 'boards' },

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
  for (const ch of String(seedText)) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Позиции растений внутри клумбы (локальные координаты в метрах)
export function flowerDots(obj) {
  const def = CATALOG[obj.type];
  const rand = seededRandom(obj.id);
  const count = Math.min(250, Math.max(6, Math.round(obj.w * obj.h * 9)));
  const dots = [];
  while (dots.length < count) {
    const x = rand() - 0.5;
    const y = rand() - 0.5;
    const color = def.colors[Math.floor(rand() * def.colors.length)];
    const angle = rand() * Math.PI * 2;
    if (def.shape === 'circle' && x * x + y * y > 0.18) continue; // только внутри круга
    dots.push({ x: x * (obj.w - 0.2), y: y * (obj.h - 0.2), color, angle, size: 0.85 + rand() * 0.3 });
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
    const angle = rand() * Math.PI * 2;
    stones.push(alongH ? { x: b, y: a, r, angle, seed: obj.id + i } : { x: a, y: b, r, angle, seed: obj.id + i });
  }
  return stones;
}

// Неровная форма природного камня: множители радиуса по кругу
export function stoneShape(seedText, points = 12) {
  const rand = seededRandom(seedText);
  return Array.from({ length: points }, () => 0.8 + rand() * 0.25);
}

// Неровный контур пруда (локальные координаты в метрах), одинаковый в 2D и 3D
export function pondOutline(obj, points = 48) {
  const rand = seededRandom(obj.id + 'pond');
  const phase = [rand() * 6, rand() * 6, rand() * 6];
  const out = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 0.88 + 0.06 * Math.sin(a * 2 + phase[0]) + 0.04 * Math.sin(a * 3 + phase[1]) + 0.025 * Math.sin(a * 5 + phase[2]);
    out.push({ x: Math.cos(a) * (obj.w / 2) * k, y: Math.sin(a) * (obj.h / 2) * k });
  }
  return out;
}

// Лежит ли точка (в метрах участка) внутри объекта, с запасом pad
export function pointInObject(o, x, y, pad = 0) {
  const r = (-o.rotation * Math.PI) / 180;
  const dx = x - o.x;
  const dy = y - o.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  const hw = o.w / 2 + pad;
  const hh = o.h / 2 + pad;
  if (CATALOG[o.type].shape === 'circle') return (lx * lx) / (hw * hw) + (ly * ly) / (hh * hh) <= 1;
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
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
