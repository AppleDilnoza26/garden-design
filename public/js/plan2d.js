import { CATALOG, clampObject, clampSize, flowerDots, stonePositions, stoneShape, pondOutline, seededRandom } from './catalog.js';
import * as T from './textures.js';

const PADDING = 48;        // отступ от краёв холста, px
const HANDLE_OFFSET = 22;  // расстояние ручки поворота от объекта, px
const HANDLE_RADIUS = 8;
const RESIZE_SIZE = 10;    // размер квадратной ручки изменения размера, px
const ROTATE_STEP = 5;     // шаг поворота ручкой, градусы

// 2D-план участка на Canvas: отрисовка, выбор, перемещение, поворот и изменение размера объектов
export class Plan2D {
  constructor(canvas, state, { onSelect, onChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.action = null;

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', () => this.onUp());
    canvas.addEventListener('pointercancel', () => this.onUp());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.dpr = window.devicePixelRatio || 1;
    this.cssW = rect.width;
    this.cssH = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.render();
  }

  // ---------- Координаты ----------
  fit() {
    const { width, length } = this.state;
    this.scale = Math.min((this.cssW - PADDING * 2) / width, (this.cssH - PADDING * 2) / length);
    this.originX = (this.cssW - width * this.scale) / 2;
    this.originY = (this.cssH - length * this.scale) / 2;
  }

  toScreen(x, y) {
    return { x: this.originX + x * this.scale, y: this.originY + y * this.scale };
  }

  toWorld(px, py) {
    return { x: (px - this.originX) / this.scale, y: (py - this.originY) / this.scale };
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  selected() {
    return this.state.objects.find((o) => o.id === this.state.selectedId) || null;
  }

  sortedObjects() {
    return [...this.state.objects].sort((a, b) => CATALOG[a.type].layer - CATALOG[b.type].layer);
  }

  // ---------- Попадание курсора ----------
  hitTest(px, py) {
    const p = this.toWorld(px, py);
    const list = this.sortedObjects().reverse(); // верхние объекты проверяем первыми
    return list.find((o) => {
      const r = (-o.rotation * Math.PI) / 180;
      const dx = p.x - o.x;
      const dy = p.y - o.y;
      const lx = dx * Math.cos(r) - dy * Math.sin(r);
      const ly = dx * Math.sin(r) + dy * Math.cos(r);
      if (CATALOG[o.type].shape === 'circle') {
        return (lx * lx) / (o.w * o.w / 4) + (ly * ly) / (o.h * o.h / 4) <= 1;
      }
      return Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.h / 2;
    }) || null;
  }

  // Точка объекта в локальных пикселях (lx, ly от центра) → экранные координаты
  localToScreen(o, lx, ly) {
    const c = this.toScreen(o.x, o.y);
    const r = (o.rotation * Math.PI) / 180;
    return { x: c.x + lx * Math.cos(r) - ly * Math.sin(r), y: c.y + lx * Math.sin(r) + ly * Math.cos(r) };
  }

  hitRotateHandle(o, px, py) {
    const h = this.localToScreen(o, 0, -(o.h * this.scale) / 2 - HANDLE_OFFSET);
    return Math.hypot(px - h.x, py - h.y) <= HANDLE_RADIUS + 4;
  }

  hitResizeHandle(o, px, py) {
    const h = this.localToScreen(o, (o.w * this.scale) / 2 + 4, (o.h * this.scale) / 2 + 4);
    return Math.abs(px - h.x) <= RESIZE_SIZE && Math.abs(py - h.y) <= RESIZE_SIZE;
  }

  // ---------- Мышь / касания ----------
  onDown(e) {
    const { px, py } = this.pointer(e);
    const sel = this.selected();
    if (sel && this.hitRotateHandle(sel, px, py)) {
      this.action = { type: 'rotate', obj: sel };
    } else if (sel && this.hitResizeHandle(sel, px, py)) {
      // Противоположный угол остаётся на месте
      const r = (sel.rotation * Math.PI) / 180;
      const ax = sel.x - (sel.w / 2) * Math.cos(r) + (sel.h / 2) * Math.sin(r);
      const ay = sel.y - (sel.w / 2) * Math.sin(r) - (sel.h / 2) * Math.cos(r);
      this.action = { type: 'resize', obj: sel, ax, ay };
    } else {
      const obj = this.hitTest(px, py);
      if (obj) {
        const w = this.toWorld(px, py);
        this.action = { type: 'move', obj, dx: w.x - obj.x, dy: w.y - obj.y };
      }
      this.onSelect(obj ? obj.id : null);
    }
    if (this.action) this.canvas.setPointerCapture(e.pointerId);
    this.render();
  }

  onMove(e) {
    const { px, py } = this.pointer(e);
    if (!this.action) {
      const sel = this.selected();
      if (sel && this.hitRotateHandle(sel, px, py)) this.canvas.style.cursor = 'grab';
      else if (sel && this.hitResizeHandle(sel, px, py)) this.canvas.style.cursor = 'nwse-resize';
      else this.canvas.style.cursor = this.hitTest(px, py) ? 'move' : 'default';
      return;
    }

    const obj = this.action.obj;
    if (this.action.type === 'move') {
      const w = this.toWorld(px, py);
      obj.x = w.x - this.action.dx;
      obj.y = w.y - this.action.dy;
    } else if (this.action.type === 'rotate') {
      const c = this.toScreen(obj.x, obj.y);
      const angle = (Math.atan2(px - c.x, -(py - c.y)) * 180) / Math.PI;
      obj.rotation = ((Math.round(angle / ROTATE_STEP) * ROTATE_STEP) % 360 + 360) % 360;
      this.canvas.style.cursor = 'grabbing';
    } else {
      const p = this.toWorld(px, py);
      const { ax, ay } = this.action;
      const r = (obj.rotation * Math.PI) / 180;
      const dx = p.x - ax;
      const dy = p.y - ay;
      obj.w = clampSize(dx * Math.cos(r) + dy * Math.sin(r));
      obj.h = clampSize(-dx * Math.sin(r) + dy * Math.cos(r));
      obj.x = ax + (obj.w / 2) * Math.cos(r) - (obj.h / 2) * Math.sin(r);
      obj.y = ay + (obj.w / 2) * Math.sin(r) + (obj.h / 2) * Math.cos(r);
    }
    clampObject(obj, this.state);
    this.onChange();
    this.render();
  }

  onUp() {
    this.action = null;
  }

  // ---------- Отрисовка ----------
  render() {
    if (!this.cssW) return;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this.fit();

    this.drawPlot(ctx);
    for (const o of this.sortedObjects()) this.drawObject(ctx, o);

    const sel = this.selected();
    if (sel) this.drawSelection(ctx, sel);

    if (!this.state.objects.length) {
      ctx.fillStyle = 'rgba(255, 255, 245, 0.85)';
      ctx.font = '15px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Выберите объект слева, чтобы добавить его на план', this.cssW / 2, this.cssH / 2);
    }
  }

  drawPlot(ctx) {
    const { width, length } = this.state;
    const s = this.scale;
    const x0 = this.originX;
    const y0 = this.originY;

    ctx.fillStyle = '#f5efe4';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.shadowColor = 'rgba(36, 64, 42, 0.18)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    // газон с натуральной текстурой травы
    ctx.translate(x0, y0);
    ctx.fillStyle = pattern(ctx, T.grass(), T.METERS.grass, s);
    ctx.fillRect(0, 0, width * s, length * s);
    ctx.restore();

    // Сетка: едва заметные линии каждый метр, чуть ярче каждые 5 м
    ctx.lineWidth = 1;
    for (let i = 0; i <= Math.floor(width); i++) {
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(255, 255, 240, 0.2)' : 'rgba(255, 255, 240, 0.07)';
      ctx.beginPath();
      ctx.moveTo(x0 + i * s + 0.5, y0);
      ctx.lineTo(x0 + i * s + 0.5, y0 + length * s);
      ctx.stroke();
    }
    for (let j = 0; j <= Math.floor(length); j++) {
      ctx.strokeStyle = j % 5 === 0 ? 'rgba(255, 255, 240, 0.2)' : 'rgba(255, 255, 240, 0.07)';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + j * s + 0.5);
      ctx.lineTo(x0 + width * s, y0 + j * s + 0.5);
      ctx.stroke();
    }

    // каменный бордюр
    ctx.strokeStyle = '#b3ac9c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 - 1.5, y0 - 1.5, width * s + 3, length * s + 3);

    // Подписи размеров
    ctx.fillStyle = '#2f5d3a';
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${width} м`, x0 + (width * s) / 2, y0 - 18);
    ctx.save();
    ctx.translate(x0 - 18, y0 + (length * s) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${length} м`, 0, 0);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  drawObject(ctx, o) {
    const c = this.toScreen(o.x, o.y);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    drawShape(ctx, o, this.scale);
    ctx.restore();
  }

  drawSelection(ctx, o) {
    const c = this.toScreen(o.x, o.y);
    const w = o.w * this.scale;
    const h = o.h * this.scale;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    ctx.strokeStyle = '#2f5d3a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8);
    ctx.setLineDash([]);

    // Ручка поворота
    ctx.beginPath();
    ctx.moveTo(0, -h / 2 - 4);
    ctx.lineTo(0, -h / 2 - HANDLE_OFFSET + HANDLE_RADIUS);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -h / 2 - HANDLE_OFFSET, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#4f8a4b';
    ctx.stroke();

    // Ручка изменения размера (правый нижний угол)
    ctx.fillStyle = '#4f8a4b';
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.rect(w / 2 + 4 - RESIZE_SIZE / 2 - 1, h / 2 + 4 - RESIZE_SIZE / 2 - 1, RESIZE_SIZE + 2, RESIZE_SIZE + 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Миниатюра объекта для каталога (тот же рисунок, что и на плане)
export function drawThumbnail(type, cssSize = 40) {
  const def = CATALOG[type];
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.round(cssSize * dpr);
  canvas.style.width = canvas.style.height = cssSize + 'px';
  const ctx = canvas.getContext('2d');
  const scale = (cssSize * 0.82) / Math.max(def.w, def.h);
  ctx.setTransform(dpr, 0, 0, dpr, cssSize / 2 * dpr, cssSize / 2 * dpr);
  drawShape(ctx, { id: type, type, w: def.w, h: def.h, rotation: 0 }, scale);
  return canvas;
}


// ---------- Отрисовка объектов (вид сверху, в локальных координатах, центр в 0,0) ----------
function drawShape(ctx, o, scale) {
  const def = CATALOG[o.type];
  DRAWERS[def.kind](ctx, o.w * scale, o.h * scale, o, scale, def);
}

// Узор из текстуры в масштабе плана: одна плитка текстуры = meters метров
const patternCache = new WeakMap();
function pattern(ctx, canvas, meters, scale, rotate = 0) {
  let map = patternCache.get(ctx);
  if (!map) patternCache.set(ctx, (map = new Map()));
  let p = map.get(canvas);
  if (!p) map.set(canvas, (p = ctx.createPattern(canvas, 'repeat')));
  const k = (meters * scale) / canvas.width;
  p.setTransform(new DOMMatrix().rotate(rotate).scale(k));
  return p;
}

function ellipse(ctx, w, h) {
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
}

// Мягкая тень от солнца (сдвиг вправо-вниз в экранных координатах при любом повороте объекта)
function withShadow(ctx, size, draw, strength = 0.45) {
  ctx.save();
  ctx.shadowColor = `rgba(15, 22, 10, ${strength})`;
  ctx.shadowBlur = Math.max(3, size * 0.12);
  ctx.shadowOffsetX = size * 0.08;
  ctx.shadowOffsetY = size * 0.1;
  draw();
  ctx.restore();
}

// Объёмное затенение: свет падает с верхнего левого угла плана
function shadeOver(ctx, o, w, h, shapeFn, dark = '#6f7068') {
  const r = (-o.rotation * Math.PI) / 180;
  const lx = (-0.2 * Math.cos(r) + 0.2 * Math.sin(r)) * w;
  const ly = (-0.2 * Math.sin(r) - 0.2 * Math.cos(r)) * h;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createRadialGradient(lx, ly, 0, 0, 0, Math.max(w, h) * 0.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#d6d6cc');
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  shapeFn();
  ctx.fill();
  ctx.restore();
}

// Яркость грани крыши в зависимости от её направления относительно солнца
function facetLight(ctx, o, nx, ny, path) {
  const r = (o.rotation * Math.PI) / 180;
  const wx = nx * Math.cos(r) - ny * Math.sin(r);
  const wy = nx * Math.sin(r) + ny * Math.cos(r);
  const b = -(wx + wy) * 0.707;
  ctx.fillStyle = b > 0 ? `rgba(255, 248, 230, ${b * 0.16})` : `rgba(10, 8, 5, ${-b * 0.32})`;
  path();
  ctx.fill();
}

function drawImageAt(ctx, img, x, y, sw, sh, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
}

// Крона из пучков листвы
function crown(ctx, w, h, o, leaves, base, clusters, k = 1) {
  const rand = seededRandom(o.id + '2d');
  withShadow(ctx, Math.min(w, h), () => {
    ctx.fillStyle = base;
    ellipse(ctx, w * 0.8, h * 0.8);
    ctx.fill();
  }, 0.5);
  const m = Math.min(w, h);
  for (let i = 0; i < clusters; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.3;
    const s = (0.4 + rand() * 0.22) * m * k;
    drawImageAt(ctx, leaves, Math.cos(a) * r * w, Math.sin(a) * r * h, s * (w / m), s * (h / m), rand() * 6.3);
  }
  shadeOver(ctx, o, w, h, () => ellipse(ctx, w, h));
}

const DRAWERS = {
  tree(ctx, w, h, o, scale, def) {
    crown(ctx, w, h, o, T.foliage(def.preset), '#2a3a20', 30);
  },

  conifer(ctx, w, h, o, scale, def) {
    if (def.form === 'column') {
      crown(ctx, w, h, o, T.foliage('thuja'), '#283a20', 16, 1.25);
      return;
    }
    const rand = seededRandom(o.id + '2d');
    withShadow(ctx, Math.min(w, h), () => {
      ctx.fillStyle = '#121c12';
      ellipse(ctx, w * 0.95, h * 0.95);
      ctx.fill();
    }, 0.55);
    const branch = T.needles();
    const m = Math.min(w, h);
    for (const ring of [{ n: 20, len: 0.5 }, { n: 14, len: 0.36 }, { n: 9, len: 0.22 }]) {
      const off = rand() * 6;
      for (let i = 0; i < ring.n; i++) {
        const a = (i / ring.n) * Math.PI * 2 + off;
        const L = ring.len * m * (0.9 + rand() * 0.2);
        ctx.save();
        ctx.scale(w / m, h / m);
        ctx.rotate(a);
        ctx.drawImage(branch, 0, -L * 0.3, L, L * 0.6);
        ctx.restore();
      }
    }
    shadeOver(ctx, o, w, h, () => ellipse(ctx, w, h), '#5e6058');
  },

  shrub(ctx, w, h, o, scale, def) {
    crown(ctx, w, h, o, T.foliage(def.preset), '#283a20', 18, 1.25);
  },

  hedge(ctx, w, h, o, scale) {
    const rand = seededRandom(o.id + '2d');
    const rr = Math.min(w, h) * 0.3;
    const shape = () => { ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, rr); };
    withShadow(ctx, Math.min(w, h) * 1.4, () => { ctx.fillStyle = '#16211a'; shape(); ctx.fill(); }, 0.55);
    ctx.save();
    shape();
    ctx.clip();
    const leaves = T.foliage('hedge');
    const step = Math.max(3, 0.28 * scale);
    for (let x = -w / 2; x < w / 2 + step; x += step) {
      for (let y = -h / 2; y < h / 2 + step; y += step) {
        const s = step * 1.7;
        drawImageAt(ctx, leaves, x + (rand() - 0.5) * step, y + (rand() - 0.5) * step, s, s, rand() * 6.3);
      }
    }
    ctx.restore();
    shadeOver(ctx, o, w, h, shape);
  },

  flowerbed(ctx, w, h, o, scale, def) {
    const shape = () => {
      ctx.beginPath();
      if (def.shape === 'circle') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.08);
    };
    ctx.fillStyle = pattern(ctx, T.soil(), 0.6, scale);
    shape();
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 22, 14, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const leaves = T.foliage('shrub');
    const headSize = { daisy: 0.11, rose: 0.13, tulip: 0.1, lavender: 0.16 }[def.plant];
    const dots = flowerDots(o);
    for (const d of dots) {
      const s = 0.24 * scale * d.size;
      drawImageAt(ctx, leaves, d.x * scale, d.y * scale, s, s, d.angle);
    }
    for (const d of dots) {
      const s = Math.max(2, headSize * scale * d.size);
      drawImageAt(ctx, T.flowerTop(def.plant, d.color), d.x * scale, d.y * scale, s, s, d.angle);
    }
  },

  path(ctx, w, h, o, scale, def) {
    if (def.pattern === 'stones') {
      const fill = pattern(ctx, T.stone(), 0.6, scale);
      for (const s of stonePositions(o)) {
        const shape = stoneShape(s.seed);
        const path = () => {
          ctx.beginPath();
          shape.forEach((k, i) => {
            const a = (i / shape.length) * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * s.r * k * scale, Math.sin(a) * s.r * k * 0.85 * scale);
          });
          ctx.closePath();
        };
        ctx.save();
        ctx.translate(s.x * scale, s.y * scale);
        ctx.rotate(s.angle);
        withShadow(ctx, s.r * scale, () => { ctx.fillStyle = fill; path(); ctx.fill(); }, 0.4);
        ctx.strokeStyle = 'rgba(40, 38, 34, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    const tex = { tiles: T.pavers, gravel: T.gravel, boards: T.wood }[def.pattern]();
    const draw = () => {
      ctx.fillStyle = pattern(ctx, tex, 1, scale);
      ctx.fillRect(-w / 2, -h / 2, w, h);
    };
    if (def.pattern === 'boards') withShadow(ctx, Math.min(w, h) * 0.3, draw, 0.35);
    else draw();
    ctx.strokeStyle = def.pattern === 'gravel' ? '#3a3530' : 'rgba(30, 26, 20, 0.35)';
    ctx.lineWidth = def.pattern === 'gravel' ? 2 : 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
  },

  pool(ctx, w, h, o, scale) {
    const rim = Math.min(0.35 * scale, Math.min(w, h) * 0.12);
    withShadow(ctx, Math.min(w, h) * 0.15, () => {
      ctx.fillStyle = pattern(ctx, T.travertine(), 0.6, scale);
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }, 0.3);
    const iw = w - rim * 2, ih = h - rim * 2;
    ctx.save();
    ctx.translate(-iw / 2, -ih / 2);
    ctx.fillStyle = pattern(ctx, T.poolTiles(), 0.5, scale);
    ctx.fillRect(0, 0, iw, ih);
    const g = ctx.createLinearGradient(0, 0, iw, ih);
    g.addColorStop(0, 'rgba(60, 130, 140, 0.35)');
    g.addColorStop(1, 'rgba(10, 55, 70, 0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, iw, ih);
    // тень от бортика и мягкие блики
    const band = Math.max(2, rim * 0.9);
    let sg = ctx.createLinearGradient(0, 0, 0, band);
    sg.addColorStop(0, 'rgba(5, 25, 30, 0.45)');
    sg.addColorStop(1, 'rgba(5, 25, 30, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, iw, band);
    sg = ctx.createLinearGradient(0, 0, band, 0);
    sg.addColorStop(0, 'rgba(5, 25, 30, 0.45)');
    sg.addColorStop(1, 'rgba(5, 25, 30, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, band, ih);
    const rand = seededRandom(o.id + 'caustic');
    ctx.strokeStyle = 'rgba(220, 245, 245, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = rand() * iw, y = rand() * ih, l = (0.4 + rand()) * scale;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + l / 2, y - l * 0.2, x + l, y);
      ctx.stroke();
    }
    ctx.restore();
    // лестница
    ctx.strokeStyle = '#c9cdcf';
    ctx.lineWidth = Math.max(1, 0.04 * scale);
    for (const x of [-0.22, 0.22]) {
      ctx.beginPath();
      ctx.moveTo(x * scale, -h / 2 - 0.1 * scale);
      ctx.lineTo(x * scale, -h / 2 + rim + 0.15 * scale);
      ctx.stroke();
    }
  },

  pond(ctx, w, h, o, scale) {
    const outline = pondOutline(o);
    const path = (k) => {
      ctx.beginPath();
      outline.forEach((p) => ctx.lineTo(p.x * k * scale, p.y * k * scale));
      ctx.closePath();
    };
    ctx.fillStyle = pattern(ctx, T.soil(), 0.6, scale);
    path(1.08);
    ctx.fill();
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, '#16261f');
    g.addColorStop(1, '#344b3f');
    ctx.fillStyle = g;
    path(1);
    ctx.fill();
    const sky = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    sky.addColorStop(0, 'rgba(200, 215, 220, 0.25)');
    sky.addColorStop(0.5, 'rgba(200, 215, 220, 0.05)');
    sky.addColorStop(1, 'rgba(200, 215, 220, 0)');
    ctx.fillStyle = sky;
    ctx.fill();
    const rand = seededRandom(o.id + 'pondfx');
    // кувшинки
    for (let k = 0; k < 4; k++) {
      const p = outline[Math.floor(rand() * outline.length)];
      const t = 0.3 + rand() * 0.35;
      const r = (0.13 + rand() * 0.07) * scale;
      const a0 = rand() * 6.3;
      ctx.fillStyle = '#3a5730';
      ctx.beginPath();
      ctx.moveTo(p.x * t * scale, p.y * t * scale);
      ctx.arc(p.x * t * scale, p.y * t * scale, r, a0 + 0.3, a0 + Math.PI * 2 - 0.3);
      ctx.closePath();
      ctx.fill();
    }
    // камни по берегу
    const fill = pattern(ctx, T.stone(), 0.6, scale);
    const per = Math.max(1, Math.round(0.28 / ((Math.PI * (o.w + o.h) / 2) / outline.length)));
    for (let i = 0; i < outline.length; i += per) {
      const p = outline[i];
      const rs = (0.1 + rand() * 0.15) * scale;
      const tilt = rand() * 3;
      withShadow(ctx, rs * 2, () => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(p.x * 1.03 * scale, p.y * 1.03 * scale, rs * 1.3, rs, tilt, 0, Math.PI * 2);
        ctx.fill();
      }, 0.45);
    }
  },

  fountain(ctx, w, h, o, scale) {
    const k = Math.min(1.5, Math.max(0.5, Math.min(o.w, o.h) / 2));
    const stoneFill = pattern(ctx, T.travertine(), 0.6, scale);
    withShadow(ctx, Math.min(w, h) * 0.3, () => { ctx.fillStyle = stoneFill; ellipse(ctx, w, h); ctx.fill(); }, 0.4);
    const water = (ww, hh) => {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(ww, hh) / 2);
      g.addColorStop(0, '#23535d');
      g.addColorStop(1, '#4b7f88');
      ctx.fillStyle = g;
      ellipse(ctx, ww, hh);
      ctx.fill();
    };
    water(w * 0.86, h * 0.86);
    ctx.strokeStyle = 'rgba(230, 245, 245, 0.25)';
    ctx.lineWidth = 1;
    for (const f of [0.5, 0.62, 0.74]) { ellipse(ctx, w * f, h * f); ctx.stroke(); }
    const bowl = 0.74 * k * scale;
    withShadow(ctx, bowl * 0.4, () => { ctx.fillStyle = stoneFill; ellipse(ctx, bowl, bowl); ctx.fill(); }, 0.45);
    water(bowl * 0.88, bowl * 0.88);
    ctx.fillStyle = stoneFill;
    ellipse(ctx, bowl * 0.15, bowl * 0.15);
    ctx.fill();
    shadeOver(ctx, o, w, h, () => ellipse(ctx, w, h), '#9a9a92');
  },

  gazebo(ctx, w, h, o, scale) {
    const ov = 0.3 * scale;
    const ex = w / 2 + ov, ey = h / 2 + ov;
    const facets = [
      { pts: [[-ex, -ey], [ex, -ey]], n: [0, -1], rot: 0 },
      { pts: [[ex, -ey], [ex, ey]], n: [1, 0], rot: 90 },
      { pts: [[ex, ey], [-ex, ey]], n: [0, 1], rot: 0 },
      { pts: [[-ex, ey], [-ex, -ey]], n: [-1, 0], rot: 90 },
    ];
    withShadow(ctx, Math.min(w, h) * 0.5, () => { ctx.fillStyle = '#3a302b'; ctx.fillRect(-ex, -ey, ex * 2, ey * 2); }, 0.55);
    for (const f of facets) {
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(f.pts[0][0], f.pts[0][1]);
        ctx.lineTo(f.pts[1][0], f.pts[1][1]);
        ctx.lineTo(0, 0);
        ctx.closePath();
      };
      ctx.fillStyle = pattern(ctx, T.shingles(), 1, scale, f.rot);
      path();
      ctx.fill();
      facetLight(ctx, o, f.n[0], f.n[1], path);
    }
    ctx.strokeStyle = 'rgba(25, 20, 18, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-ex, -ey); ctx.lineTo(ex, ey);
    ctx.moveTo(ex, -ey); ctx.lineTo(-ex, ey);
    ctx.stroke();
    ctx.strokeRect(-ex, -ey, ex * 2, ey * 2);
    ctx.fillStyle = '#4a3d32';
    ellipse(ctx, 0.12 * scale, 0.12 * scale);
    ctx.fill();
  },

  shed(ctx, w, h, o, scale) {
    const ov = 0.25 * scale;
    const ex = w * 0.45 + ov, ey = h * 0.45 + ov;
    withShadow(ctx, Math.min(w, h) * 0.6, () => { ctx.fillStyle = '#3a302b'; ctx.fillRect(-ex, -ey, ex * 2, ey * 2); }, 0.55);
    for (const side of [-1, 1]) {
      const path = () => { ctx.beginPath(); ctx.rect(side < 0 ? -ex : 0, -ey, ex, ey * 2); };
      ctx.fillStyle = pattern(ctx, T.shingles(), 1, scale, 90);
      path();
      ctx.fill();
      facetLight(ctx, o, side, 0, path);
    }
    ctx.fillStyle = '#2e2724';
    ctx.fillRect(-0.06 * scale, -ey, 0.12 * scale, ey * 2);
    ctx.strokeStyle = 'rgba(25, 20, 18, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-ex, -ey, ex * 2, ey * 2);
  },

  bench(ctx, w, h, o, scale) {
    const wood = pattern(ctx, T.wood(), 1, scale, 90);
    const seatD = h * 0.68;
    withShadow(ctx, Math.min(w, h), () => {
      ctx.fillStyle = '#2a221a';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }, 0.45);
    const n = 4;
    const slat = (seatD / n) * 0.85;
    ctx.fillStyle = wood;
    for (let i = 0; i < n; i++) ctx.fillRect(-w / 2, h / 2 - 0.06 * scale - slat - i * (seatD / n), w, slat);
    for (let i = 0; i < 3; i++) ctx.fillRect(-w / 2, -h / 2 + i * 0.045 * scale, w, 0.03 * scale);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(-w / 2, -h / 2, w, 0.14 * scale);
    ctx.fillStyle = '#252624';
    for (const sx of [-1, 1]) ctx.fillRect(sx * (w / 2 - 0.08 * scale) - 0.025 * scale, -h / 2, 0.05 * scale, h);
  },

  lamp(ctx, w, h) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 2.5);
    g.addColorStop(0, 'rgba(255, 214, 140, 0.45)');
    g.addColorStop(1, 'rgba(255, 214, 140, 0)');
    ctx.fillStyle = g;
    ellipse(ctx, w * 5, h * 5);
    ctx.fill();
    withShadow(ctx, Math.min(w, h), () => {
      ctx.fillStyle = '#222321';
      ctx.save();
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-w * 0.42, -h * 0.42, w * 0.84, h * 0.84);
      ctx.restore();
    }, 0.5);
    ctx.fillStyle = '#3a3b38';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.4); ctx.lineTo(w * 0.4, 0); ctx.lineTo(0, 0); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd58a';
    ellipse(ctx, w * 0.12, h * 0.12);
    ctx.fill();
  },
};
