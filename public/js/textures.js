// Процедурные натуральные текстуры на Canvas. Используются и в 2D (как узоры), и в 3D (как CanvasTexture).
// Все бесшовные текстуры повторяются без стыков. Каждая создаётся один раз и кешируется.
import { seededRandom } from './catalog.js';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// ---------- Цвет ----------
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const css = (c, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0}, ${Math.min(255, c[1] * k) | 0}, ${Math.min(255, c[2] * k) | 0})`;
const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// ---------- Бесшовный шум ----------
function lattice(rand, px, py) {
  const g = new Float32Array(px * py);
  for (let i = 0; i < g.length; i++) g[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = x - xi;
    const v = y - yi;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const at = (i, j) => g[(((j % py) + py) % py) * px + (((i % px) + px) % px)];
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
}

// Фрактальный шум size×size, значения 0..1. sx/sy — растяжение (для волокон древесины и коры)
function fbm(size, period, octaves, seed, sx = 1, sy = 1) {
  const rand = seededRandom('noise' + seed);
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const px = Math.round(period * sx * 2 ** o);
    const py = Math.round(period * sy * 2 ** o);
    const n = lattice(rand, px, py);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) out[y * size + x] += n((x / size) * px, (y / size) * py) * amp;
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// Попиксельная заливка: fn(i, x, y) → [r, g, b]
function paint(canvas, fn) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const c = fn(i, x, y);
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return ctx;
}

// Рисуем фигуру и её копии у краёв — чтобы текстура оставалась бесшовной
function wrapped(size, x, y, margin, draw) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px > -margin && px < size + margin && py > -margin && py < size + margin) draw(px, py);
    }
  }
}

// Карта нормалей из яркости исходной текстуры (для рельефа в 3D)
export function normalMap(source, strength = 2) {
  return cached('normal:' + strength + ':' + cacheKeyOf(source), () => {
    const w = source.width;
    const h = source.height;
    const data = source.getContext('2d').getImageData(0, 0, w, h).data;
    const height = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) height[i] = (data[i * 4] * 0.3 + data[i * 4 + 1] * 0.59 + data[i * 4 + 2] * 0.11) / 255;
    const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
    const out = makeCanvas(w, h);
    paint(out, (i, x, y) => {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      return [(-dx / len * 0.5 + 0.5) * 255, (dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
    });
    return out;
  });
}

const keys = new WeakMap();
let keyCounter = 0;
function cacheKeyOf(obj) {
  if (!keys.has(obj)) keys.set(obj, ++keyCounter);
  return keys.get(obj);
}

// ======================================================================
// Покрытия (размер в метрах, который покрывает одна плитка текстуры, указан в METERS)
// ======================================================================
export const METERS = { grass: 2, soil: 1, pavers: 1, gravel: 1, stone: 1, travertine: 1, wood: 1, bark: 0.6, birch: 0.6, shingles: 1, siding: 1, poolTiles: 0.5, water: 2 };

export function grass() {
  return cached('grass', () => {
    const S = 512;
    const c = makeCanvas(S);
    const f = fbm(S, 4, 5, 11);
    const f2 = fbm(S, 2, 3, 12);
    const dark = rgb('#34492a'), mid = rgb('#4f6634'), dry = rgb('#76744a');
    const ctx = paint(c, (i) => {
      const t = clamp01((f[i] - 0.5) * 2.2 + 0.5);
      return mix(mix(dark, mid, t), dry, clamp01((f2[i] - 0.56) * 2.5) * 0.6);
    });
    // отдельные травинки
    const rand = seededRandom('grass');
    const blades = ['#425c2c', '#56703a', '#334826', '#647a42', '#76804c', '#4b6530'];
    ctx.lineCap = 'round';
    for (let i = 0; i < 14000; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const len = 3 + rand() * 8;
      const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
      ctx.strokeStyle = pick(rand, blades);
      ctx.globalAlpha = 0.3 + rand() * 0.45;
      ctx.lineWidth = 0.7 + rand() * 0.9;
      wrapped(S, x, y, 12, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      });
    }
    ctx.globalAlpha = 1;
    return c;
  });
}

export function soil() {
  return cached('soil', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 6, 5, 21);
    const rand = seededRandom('soil');
    const a = rgb('#2e2219'), b = rgb('#4e3b2a');
    const ctx = paint(c, (i) => mix(a, b, clamp01((f[i] - 0.5) * 2.5 + 0.5 + (rand() - 0.5) * 0.25)));
    // мульча и комочки
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = pick(rand, ['#5d4630', '#3a2b1e', '#6b5238', '#241a12']);
      ctx.globalAlpha = 0.6;
      const x = rand() * S, y = rand() * S, w = 1 + rand() * 4, h = 1 + rand() * 1.5;
      wrapped(S, x, y, 6, (px, py) => ctx.fillRect(px, py, w, h));
    }
    ctx.globalAlpha = 1;
    return c;
  });
}

// Бетонная тротуарная плитка 50×50 см (2×2 на метр)
export function pavers() {
  return cached('pavers', () => {
    const S = 512;
    const T = S / 2;
    const c = makeCanvas(S);
    const f = fbm(S, 24, 4, 31);
    const rand = seededRandom('pavers');
    const tones = [rgb('#a39b8c'), rgb('#9a9283'), rgb('#aca495'), rgb('#958c7c')];
    const cell = [0, 1, 2, 3].map(() => pick(rand, tones));
    const grout = rgb('#5f584d');
    paint(c, (i, x, y) => {
      const lx = x % T;
      const ly = y % T;
      const e = Math.min(lx, ly, T - 1 - lx, T - 1 - ly);
      if (e < 3) return grout;
      let col = cell[Math.floor(x / T) + Math.floor(y / T) * 2];
      let k = 0.82 + f[i] * 0.32 + (Math.random() - 0.5) * 0.05;
      if (e < 9) k *= lx < 9 || ly < 9 ? 1.06 : 0.86; // скос кромки
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    return c;
  });
}

// Мелкий гравий
export function gravel() {
  return cached('gravel', () => {
    const S = 512;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5c554b';
    ctx.fillRect(0, 0, S, S);
    const rand = seededRandom('gravel');
    const tones = ['#9a9184', '#857d70', '#aaa192', '#757064', '#b2a690', '#8d8170', '#6d675d'];
    for (let i = 0; i < 4200; i++) {
      const x = rand() * S;
      const y = rand() * S;
      const r = 2.5 + rand() * 5;
      const k = 0.6 + rand() * 0.5;
      const a = rand() * Math.PI;
      const color = pick(rand, tones);
      wrapped(S, x, y, 10, (px, py) => {
        ctx.fillStyle = 'rgba(20, 18, 15, 0.5)';
        ctx.beginPath();
        ctx.ellipse(px + 1.2, py + 1.5, r, r * k, a, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(px - r * 0.35, py - r * 0.35, 0, px, py, r);
        g.addColorStop(0, '#d8d0c0');
        g.addColorStop(0.35, color);
        g.addColorStop(1, '#4a453d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * k, a, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return c;
  });
}

// Природный камень (серый гранит / песчаник)
export function stone() {
  return cached('stone', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 4, 6, 41);
    const f2 = fbm(S, 8, 3, 42);
    const a = rgb('#6c6960'), b = rgb('#a39e92');
    paint(c, (i) => {
      let col = mix(a, b, clamp01((f[i] - 0.5) * 2.4 + 0.5));
      if (Math.abs(f2[i] - 0.5) < 0.012) col = mix(col, [60, 58, 52], 0.5); // прожилки
      const k = 0.92 + Math.random() * 0.16;
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    return c;
  });
}

// Светлый травертин — бортики бассейна, фонтан
export function travertine() {
  return cached('travertine', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 3, 5, 51, 1, 3);
    const rand = seededRandom('trav');
    const a = rgb('#b8ab92'), b = rgb('#d6ccb8');
    const ctx = paint(c, (i) => {
      const col = mix(a, b, clamp01((f[i] - 0.5) * 2.5 + 0.5));
      const k = 0.95 + Math.random() * 0.08;
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = 'rgba(110, 95, 70, 0.45)';
      const x = rand() * S, y = rand() * S, w = 1 + rand() * 4;
      wrapped(S, x, y, 6, (px, py) => ctx.fillRect(px, py, w, 1 + rand()));
    }
    return c;
  });
}

// Доски 20 см с волокнами (настил, беседка, скамейка). Волокна идут вдоль оси V.
export function wood() {
  return cached('wood', () => {
    const S = 512;
    const c = makeCanvas(S);
    const grain = fbm(S, 2, 5, 61, 10, 1);
    const knots = fbm(S, 6, 2, 62);
    const rand = seededRandom('wood');
    const boards = 5;
    const BW = S / boards;
    const tones = [rgb('#7a5c40'), rgb('#6e5139'), rgb('#856548'), rgb('#735840'), rgb('#7f6347')];
    const weather = rgb('#7d766a');
    const shift = tones.map(() => rand() * S);
    paint(c, (i, x, y) => {
      const b = Math.floor(x / BW);
      const lx = x - b * BW;
      if (lx < 2.5 || lx > BW - 2) return [38, 30, 22]; // щель между досками
      const yy = Math.floor((y + shift[b]) % S);
      const g = grain[yy * S + x];
      let col = mix(tones[b], weather, 0.25);
      let k = 0.78 + g * 0.42;
      if (knots[i] > 0.78) k *= 0.8;
      if (lx < 6 || lx > BW - 6) k *= 0.9;
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    return c;
  });
}

// Кора лиственного дерева: вертикальные борозды
export function bark() {
  return cached('bark', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 3, 5, 71, 6, 1);
    const f2 = fbm(S, 4, 4, 72);
    const a = rgb('#2b241e'), b = rgb('#5f5144');
    paint(c, (i) => {
      const v = f[i] * 0.75 + f2[i] * 0.25;
      let col = mix(a, b, clamp01((v - 0.45) * 2.5 + 0.5));
      if (v < 0.42) col = mix(col, [22, 18, 14], 0.6); // глубокие трещины
      return col;
    });
    return c;
  });
}

// Кора берёзы: белая с тёмными чечевичками
export function birchBark() {
  return cached('birch', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 4, 4, 81, 1, 3);
    const ctx = paint(c, (i) => {
      const k = 0.85 + f[i] * 0.2;
      return [222 * k, 217 * k, 205 * k];
    });
    const rand = seededRandom('birch');
    for (let i = 0; i < 150; i++) {
      const x = rand() * S, y = rand() * S, w = 5 + rand() * 30, h = 1 + rand() * 3;
      ctx.fillStyle = `rgba(35, 32, 28, ${0.55 + rand() * 0.4})`;
      wrapped(S, x, y, 40, (px, py) => {
        ctx.beginPath();
        ctx.ellipse(px, py, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    return c;
  });
}

// Гибкая черепица: ряды вдоль оси U, ряды друг под другом по V
export function shingles() {
  return cached('shingles', () => {
    const S = 512;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rand = seededRandom('shingles');
    const rows = 8;
    const RH = S / rows;
    const tones = ['#4b3f39', '#55463e', '#3f3531', '#5c4c42', '#4f4440'];
    ctx.fillStyle = '#211b18';
    ctx.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -RH * 0.5 : 0;
      while (x < S) {
        const w = RH * (0.8 + rand() * 0.5);
        const y = r * RH;
        const g = ctx.createLinearGradient(0, y, 0, y + RH);
        const base = pick(rand, tones);
        g.addColorStop(0, '#2a2320');
        g.addColorStop(0.25, base);
        g.addColorStop(1, base);
        ctx.fillStyle = g;
        ctx.fillRect(x + 1.5, y + 1, w - 3, RH - 3);
        x += w;
      }
    }
    // зернистая посыпка
    const img = ctx.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const k = 0.85 + Math.random() * 0.3;
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  });
}

// Деревянная обшивка домика (крашеная, приглушённый серо-зелёный)
export function siding() {
  return cached('siding', () => {
    const S = 256;
    const c = makeCanvas(S);
    const grain = fbm(S, 1, 5, 91, 1, 8);
    const boards = 6;
    const BH = S / boards;
    const base = rgb('#7c8676');
    paint(c, (i, x, y) => {
      const ly = y % BH;
      let k = 0.88 + grain[i] * 0.2;
      if (ly < 3) k *= 0.55; // тень под доской
      else if (ly < 5) k *= 1.08;
      return [base[0] * k, base[1] * k, base[2] * k];
    });
    return c;
  });
}

// Мозаика бассейна
export function poolTiles() {
  return cached('poolTiles', () => {
    const S = 256;
    const c = makeCanvas(S);
    const n = 10;
    const T = S / n;
    const rand = seededRandom('pool');
    const tones = [rgb('#3d8197'), rgb('#4a8fa4'), rgb('#5698aa'), rgb('#36778c')];
    const cells = Array.from({ length: n * n }, () => pick(rand, tones));
    paint(c, (i, x, y) => {
      const lx = x % T, ly = y % T;
      if (lx < 2 || ly < 2) return [200, 212, 210];
      const col = cells[Math.floor(y / T) * n + Math.floor(x / T)];
      const k = 0.9 + Math.random() * 0.15;
      return [col[0] * k, col[1] * k, col[2] * k];
    });
    return c;
  });
}

// Высоты мелкой ряби воды (для карты нормалей)
export function waterRipples() {
  return cached('water', () => {
    const S = 256;
    const c = makeCanvas(S);
    const f = fbm(S, 5, 5, 101);
    paint(c, (i) => {
      const v = f[i] * 255;
      return [v, v, v];
    });
    return c;
  });
}

// ======================================================================
// Листва (прозрачные «карточки» с множеством листьев)
// ======================================================================
const FOLIAGE = {
  broadleaf: { colors: ['#456230', '#527037', '#5f7d40', '#3c592a', '#6a8445'], leaf: 13, count: 320 },
  birch:     { colors: ['#6e8a40', '#7f9a4a', '#617d38', '#8ea454'], leaf: 9, count: 400 },
  apple:     { colors: ['#4f6c36', '#5c7a3e', '#698847', '#46622f'], leaf: 12, count: 320, fruit: ['#a8392c', '#b84a30', '#a85a30'], fruitCount: 10 },
  sakura:    { colors: ['#5f7240', '#6b7e46'], leaf: 9, count: 60, blossom: ['#e2b4c0', '#ecc6d0', '#d6a0b0', '#f2dce2'], blossomCount: 340 },
  shrub:     { colors: ['#3f5a30', '#4b6838', '#577540', '#62804a'], leaf: 11, count: 650 },
  rose:      { colors: ['#3e5630', '#4a6638', '#557240'], leaf: 11, count: 600, rose: ['#9a2434', '#b43a4a', '#c85a68'], roseCount: 12 },
  hedge:     { colors: ['#3f5a30', '#4a6638', '#56723f', '#618048'], leaf: 6, count: 1300, square: true },
  thuja:     { colors: ['#4a6a34', '#577a3c', '#648644', '#3f5c2e'], leaf: 7, count: 1300 },
};

function drawLeaf(ctx, x, y, len, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -len * 0.34, len / 2, 0);
  ctx.quadraticCurveTo(0, len * 0.34, -len / 2, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 240, 0.07)';
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.quadraticCurveTo(0, -len * 0.34, len / 2, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-len / 2, 0);
  ctx.lineTo(len / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function foliage(preset) {
  return cached('foliage:' + preset, () => {
    const p = FOLIAGE[preset];
    const S = 256;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const rand = seededRandom('foliage' + preset);
    const R = S * 0.46;
    const point = () => {
      if (p.square) return [S * 0.03 + rand() * S * 0.94, S * 0.03 + rand() * S * 0.94];
      const a = rand() * Math.PI * 2;
      const r = R * Math.pow(rand(), 0.6);
      return [S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r];
    };
    // веточки
    if (!p.square) {
      ctx.strokeStyle = '#3b2e22';
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = rand() * Math.PI * 2;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(S / 2, S / 2);
        ctx.lineTo(S / 2 + Math.cos(a) * R * 0.8, S / 2 + Math.sin(a) * R * 0.8);
        ctx.stroke();
      }
    }
    for (let i = 0; i < p.count; i++) {
      const [x, y] = point();
      // нижние/правые листья темнее — объём внутри пучка
      const shade = 0.72 + 0.4 * (1 - (x + y) / (2 * S)) + (rand() - 0.5) * 0.2;
      drawLeaf(ctx, x, y, p.leaf * (0.7 + rand() * 0.6), rand() * Math.PI * 2, css(rgb(pick(rand, p.colors)), shade));
    }
    for (let i = 0; i < (p.blossomCount || 0); i++) {
      const [x, y] = point();
      const col = pick(rand, p.blossom);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#c99a70';
      ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
    }
    for (let i = 0; i < (p.fruitCount || 0); i++) {
      const [x, y] = point();
      const r = 4 + rand() * 2;
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
      g.addColorStop(0, '#d9a070');
      g.addColorStop(0.35, pick(rand, p.fruit));
      g.addColorStop(1, '#4a1610');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < (p.roseCount || 0); i++) {
      const [x, y] = point();
      drawRoseBloom(ctx, x, y, 5 + rand() * 2.5, pick(rand, p.rose));
    }
    return c;
  });
}

function drawRoseBloom(ctx, x, y, r, color) {
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
  g.addColorStop(0, css(rgb(color), 1.25));
  g.addColorStop(1, css(rgb(color), 0.6));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 0, 8, 0.45)';
  ctx.lineWidth = 0.8;
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath();
    ctx.arc(x, y, r * k * 0.27, k, k + 4);
    ctx.stroke();
  }
}

// Ветка ели: стебель слева направо, густая хвоя
export function needles() {
  return cached('needles', () => {
    const W = 256, H = 128;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rand = seededRandom('needles');
    const greens = ['#2b4428', '#33502e', '#3c5b34', '#46663b', '#263c22'];
    ctx.lineCap = 'round';
    const twigs = [[8, H / 2, W - 8, H / 2 + 6]];
    for (let x = 30; x < W - 30; x += 20) {
      const len = (W - x) * 0.45;
      twigs.push([x, H / 2, x + len * 0.8, H / 2 - len * 0.45]);
      twigs.push([x + 8, H / 2, x + 8 + len * 0.8, H / 2 + len * 0.5]);
    }
    for (const [x0, y0, x1, y1] of twigs) {
      ctx.strokeStyle = '#3a2c20';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const steps = Math.hypot(x1 - x0, y1 - y0) / 2;
      const dir = Math.atan2(y1 - y0, x1 - x0);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t;
        for (const side of [-1, 1]) {
          const a = dir + side * (0.9 + rand() * 0.4);
          const l = 5 + rand() * 4;
          ctx.strokeStyle = pick(rand, greens);
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
          ctx.stroke();
        }
      }
    }
    return c;
  });
}

// ======================================================================
// Растения для клумб и газона (вид сбоку, основание внизу по центру)
// ======================================================================
export function plantCard(kind, color = '#ffffff') {
  return cached('plant:' + kind + color, () => {
    const W = 128, H = 256;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const rand = seededRandom('plant' + kind + color);
    ctx.lineCap = 'round';

    const blade = (x0, h, lean, width, col) => {
      const tipX = x0 + lean;
      const g = ctx.createLinearGradient(0, H, 0, H - h);
      g.addColorStop(0, kind === 'tuft' ? '#34492a' : '#1e2a16');
      g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 - width, H);
      ctx.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, tipX, H - h);
      ctx.quadraticCurveTo(x0 + lean * 0.3 + width * 0.5, H - h * 0.6, x0 + width, H);
      ctx.fill();
    };
    const stem = (x0, x1, y1, col = '#4a5e32', w = 1.6) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x0, H);
      ctx.quadraticCurveTo(x0, (H + y1) / 2, x1, y1);
      ctx.stroke();
    };
    const base = rgb(color);

    if (kind === 'tuft' || kind === 'reed') {
      const n = kind === 'reed' ? 16 : 34;
      const greens = kind === 'reed' ? ['#66703f', '#737a46', '#57643a'] : ['#3f5a2c', '#4a6431', '#55703a', '#425c2e', '#5b7140'];
      for (let i = 0; i < n; i++) {
        const x0 = W / 2 + (rand() - 0.5) * 40;
        const h = (kind === 'reed' ? 170 : 90) + rand() * (kind === 'reed' ? 80 : 150);
        blade(x0, h, (rand() - 0.5) * 70, kind === 'reed' ? 2.2 : 2.6, pick(rand, greens));
      }
      if (kind === 'reed') {
        for (let i = 0; i < 3; i++) {
          const x = W / 2 + (rand() - 0.5) * 36;
          const y = 20 + rand() * 50;
          stem(x, x, y + 30, '#5d6238', 2);
          ctx.fillStyle = '#4e3524';
          ctx.beginPath();
          ctx.ellipse(x, y + 18, 4.5, 15, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (kind === 'daisy') {
      for (let i = 0; i < 9; i++) blade(W / 2 + (rand() - 0.5) * 30, 50 + rand() * 50, (rand() - 0.5) * 60, 5, '#4f6a36');
      for (let i = 0; i < 5; i++) {
        const x1 = W / 2 + (rand() - 0.5) * 80;
        const y1 = 40 + rand() * 110;
        stem(W / 2 + (rand() - 0.5) * 16, x1, y1);
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          ctx.fillStyle = css(base, 0.85 + rand() * 0.25);
          ctx.beginPath();
          ctx.ellipse(x1 + Math.cos(a) * 7, y1 + Math.sin(a) * 4, 6, 2.6, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#9a7a2a';
        ctx.beginPath();
        ctx.ellipse(x1, y1, 3.5, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'rose') {
      for (let i = 0; i < 6; i++) stem(W / 2 + (rand() - 0.5) * 20, W / 2 + (rand() - 0.5) * 90, 40 + rand() * 80, '#3c4a28', 2);
      for (let i = 0; i < 120; i++) {
        const x = W / 2 + (rand() - 0.5) * 100;
        const y = 70 + rand() * 170;
        drawLeaf(ctx, x, y, 11 + rand() * 5, rand() * Math.PI * 2, css(rgb(pick(rand, ['#2c3f24', '#36502c', '#405a32'])), 0.8 + rand() * 0.4));
      }
      for (let i = 0; i < 5; i++) drawRoseBloom(ctx, W / 2 + (rand() - 0.5) * 80, 40 + rand() * 90, 9 + rand() * 3, color);
    } else if (kind === 'tulip') {
      for (let i = 0; i < 3; i++) blade(W / 2 + (rand() - 0.5) * 30, 90 + rand() * 50, (rand() - 0.5) * 40, 9, '#5a7148');
      for (let i = 0; i < 3; i++) {
        const x1 = W / 2 + (rand() - 0.5) * 60;
        const y1 = 30 + rand() * 50;
        stem(W / 2 + (rand() - 0.5) * 20, x1, y1 + 14, '#58703e', 2.5);
        const g = ctx.createLinearGradient(0, y1 - 14, 0, y1 + 16);
        g.addColorStop(0, css(base, 1.15));
        g.addColorStop(1, css(base, 0.55));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x1 - 10, y1 - 10);
        ctx.lineTo(x1 - 4, y1 - 4);
        ctx.lineTo(x1, y1 - 14);
        ctx.lineTo(x1 + 4, y1 - 4);
        ctx.lineTo(x1 + 10, y1 - 10);
        ctx.quadraticCurveTo(x1 + 12, y1 + 14, x1, y1 + 16);
        ctx.quadraticCurveTo(x1 - 12, y1 + 14, x1 - 10, y1 - 10);
        ctx.fill();
      }
    } else if (kind === 'lavender') {
      for (let i = 0; i < 26; i++) blade(W / 2 + (rand() - 0.5) * 50, 40 + rand() * 50, (rand() - 0.5) * 60, 1.6, '#76836a');
      for (let i = 0; i < 26; i++) {
        const x1 = W / 2 + (rand() - 0.5) * 110;
        const y1 = 10 + rand() * 70;
        stem(W / 2 + (rand() - 0.5) * 24, x1, y1 + 40, '#6b7a5e', 1.3);
        for (let k = 0; k < 14; k++) {
          ctx.fillStyle = css(base, 0.7 + rand() * 0.5);
          ctx.beginPath();
          ctx.ellipse(x1 + (rand() - 0.5) * 4, y1 + k * 3, 2.2, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return c;
  });
}

// Цветок сверху (для 2D-плана)
export function flowerTop(kind, color) {
  return cached('top:' + kind + color, () => {
    const S = 32;
    const c = makeCanvas(S);
    const ctx = c.getContext('2d');
    const base = rgb(color);
    if (kind === 'rose') {
      drawRoseBloom(ctx, S / 2, S / 2, 11, color);
    } else if (kind === 'lavender') {
      for (let k = 0; k < 9; k++) {
        ctx.fillStyle = css(base, 0.7 + (k % 3) * 0.2);
        ctx.beginPath();
        ctx.ellipse(S / 2 + Math.sin(k) * 3, 5 + k * 2.6, 3, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const petals = kind === 'tulip' ? 6 : 10;
      for (let k = 0; k < petals; k++) {
        const a = (k / petals) * Math.PI * 2;
        ctx.fillStyle = css(base, 0.8 + (k % 2) * 0.25);
        ctx.beginPath();
        ctx.ellipse(S / 2 + Math.cos(a) * 7, S / 2 + Math.sin(a) * 7, kind === 'tulip' ? 7 : 7.5, kind === 'tulip' ? 5 : 3, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = kind === 'tulip' ? '#3a2a1a' : '#a07c2c';
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    return c;
  });
}

// Небо для 3D: равнопромежуточная проекция (верх — небо, низ — земля), мягкий солнечный ореол
export function skyPanorama(sunAzimuth, sunElevation) {
  return cached('sky', () => {
    const W = 1024, H = 512;
    const c = makeCanvas(W, H);
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6f93b8');
    g.addColorStop(0.32, '#9db7cc');
    g.addColorStop(0.49, '#d6dcd8');
    g.addColorStop(0.5, '#d3d9d4');
    g.addColorStop(0.56, '#cdd3cc');
    g.addColorStop(1, '#b9bfb2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // лёгкие облака
    const rand = seededRandom('clouds');
    for (let i = 0; i < 70; i++) {
      const x = rand() * W;
      const y = H * (0.18 + rand() * 0.27);
      const r = 20 + rand() * 60;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // солнечный ореол
    const sx = ((sunAzimuth / (Math.PI * 2)) % 1) * W;
    const sy = H * (0.5 - sunElevation / Math.PI);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160);
    sg.addColorStop(0, 'rgba(255, 248, 225, 1)');
    sg.addColorStop(0.1, 'rgba(255, 240, 205, 0.8)');
    sg.addColorStop(1, 'rgba(255, 235, 200, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H / 2);
    return c;
  });
}
