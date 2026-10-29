// Каталог объектов сада. Размеры в метрах: w — ширина, h — длина.
export const CATALOG = {
  tree: {
    name: 'Дерево', w: 3, h: 3, shape: 'circle', layer: 4,
    icon: '<svg viewBox="0 0 40 40"><rect x="18" y="24" width="4" height="12" rx="1" fill="#8a6440"/><circle cx="20" cy="16" r="12" fill="#4f8a4b"/><circle cx="16" cy="13" r="4" fill="#6fa55e"/></svg>',
  },
  shrub: {
    name: 'Кустарник', w: 1.2, h: 1.2, shape: 'circle', layer: 3,
    icon: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="26" rx="15" ry="10" fill="#6f9a4a"/><circle cx="13" cy="23" r="6" fill="#82ad5c"/><circle cx="25" cy="20" r="7" fill="#82ad5c"/></svg>',
  },
  flower: {
    name: 'Цветы', w: 1.5, h: 1, shape: 'rect', layer: 1,
    icon: '<svg viewBox="0 0 40 40"><rect x="4" y="26" width="32" height="8" rx="3" fill="#8a6a4a"/><circle cx="12" cy="20" r="5" fill="#e48aa4"/><circle cx="12" cy="20" r="2" fill="#f4d35e"/><circle cx="27" cy="16" r="5" fill="#b48ad8"/><circle cx="27" cy="16" r="2" fill="#fff"/></svg>',
  },
  path: {
    name: 'Дорожка', w: 1, h: 4, shape: 'rect', layer: 0,
    icon: '<svg viewBox="0 0 40 40"><path d="M14 4h12l4 32H10z" fill="#e3d3b0" stroke="#c4ad82" stroke-width="1.5"/><path d="M13 14h14M12 24h16" stroke="#c4ad82" stroke-width="1.5"/></svg>',
  },
  gazebo: {
    name: 'Беседка', w: 3, h: 3, shape: 'rect', layer: 2,
    icon: '<svg viewBox="0 0 40 40"><path d="M4 16L20 5l16 11z" fill="#8a6440"/><rect x="8" y="16" width="3" height="18" fill="#a7835a"/><rect x="29" y="16" width="3" height="18" fill="#a7835a"/><rect x="5" y="32" width="30" height="4" rx="1" fill="#c49a6c"/></svg>',
  },
};

export const FLOWER_COLORS = ['#e48aa4', '#f4d35e', '#ffffff', '#b48ad8', '#f29e6b'];

// Детерминированный генератор случайных чисел: одинаковый узор цветов в 2D и 3D
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
  const rand = seededRandom(obj.id);
  const count = Math.min(200, Math.max(6, Math.round(obj.w * obj.h * 10)));
  const dots = [];
  for (let i = 0; i < count; i++) {
    dots.push({
      x: (rand() - 0.5) * (obj.w - 0.2),
      y: (rand() - 0.5) * (obj.h - 0.2),
      color: FLOWER_COLORS[Math.floor(rand() * FLOWER_COLORS.length)],
    });
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
