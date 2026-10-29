import { CATALOG, clampObject, clampSize, flowerDots, stonePositions, accentDots, seededRandom } from './catalog.js';

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
      ctx.fillStyle = 'rgba(36, 64, 42, 0.55)';
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
    ctx.fillStyle = '#cfe2b5';
    ctx.fillRect(x0, y0, width * s, length * s);
    ctx.restore();

    // Сетка: тонкие линии каждый метр, заметные каждые 5 м
    ctx.lineWidth = 1;
    for (let i = 0; i <= Math.floor(width); i++) {
      ctx.strokeStyle = i % 5 === 0 ? 'rgba(47, 93, 58, 0.22)' : 'rgba(47, 93, 58, 0.08)';
      ctx.beginPath();
      ctx.moveTo(x0 + i * s + 0.5, y0);
      ctx.lineTo(x0 + i * s + 0.5, y0 + length * s);
      ctx.stroke();
    }
    for (let j = 0; j <= Math.floor(length); j++) {
      ctx.strokeStyle = j % 5 === 0 ? 'rgba(47, 93, 58, 0.22)' : 'rgba(47, 93, 58, 0.08)';
      ctx.beginPath();
      ctx.moveTo(x0, y0 + j * s + 0.5);
      ctx.lineTo(x0 + width * s, y0 + j * s + 0.5);
      ctx.stroke();
    }

    ctx.strokeStyle = '#4f8a4b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, width * s, length * s);

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

// ---------- Отрисовка объектов (в локальных координатах, центр в 0,0) ----------
function drawShape(ctx, o, scale) {
  const def = CATALOG[o.type];
  DRAWERS[def.kind](ctx, o.w * scale, o.h * scale, o, scale, def);
}

// Осветлить (amt > 0) или затемнить (amt < 0) цвет #rrggbb
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(Math.min(255, Math.max(0, amt > 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function ellipse(ctx, w, h) {
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
}

function shadow(ctx, w, h, round) {
  ctx.fillStyle = 'rgba(36, 64, 42, 0.16)';
  ctx.beginPath();
  if (round) ctx.ellipse(3, 4, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fill();
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

const DRAWERS = {
  tree(ctx, w, h, o, scale, def) {
    shadow(ctx, w, h, true);
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.15, 1, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, shade(def.crown, 0.3));
    g.addColorStop(1, shade(def.crown, -0.25));
    ctx.fillStyle = g;
    ellipse(ctx, w, h);
    ctx.fill();
    ctx.strokeStyle = shade(def.crown, -0.4);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (def.fruit) {
      for (const d of accentDots(o, 12)) dot(ctx, d.x * w, d.y * h, Math.max(1.5, 0.1 * scale), def.fruit);
    }
    dot(ctx, 0, 0, Math.max(2, Math.min(w, h) * 0.06), def.trunk === '#eeeae0' ? '#9a948a' : def.trunk);
  },

  conifer(ctx, w, h, o, scale, def) {
    shadow(ctx, w, h, true);
    // три вложенные «звёзды» — вид ели сверху
    for (let k = 0; k < 3; k++) {
      const f = 1 - k * 0.3;
      ctx.fillStyle = shade(def.color, k * 0.18);
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + k * 0.3;
        const rr = (i % 2 ? 0.36 : 0.5) * f;
        ctx.lineTo(Math.cos(a) * w * rr, Math.sin(a) * h * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
  },

  shrub(ctx, w, h, o, scale, def) {
    shadow(ctx, w, h, true);
    ctx.fillStyle = def.color;
    ellipse(ctx, w, h);
    ctx.fill();
    // «пушистый» край из маленьких кругов
    ctx.fillStyle = shade(def.color, 0.15);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * w * 0.28, Math.sin(a) * h * 0.28, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = shade(def.color, -0.3);
    ctx.lineWidth = 1;
    ellipse(ctx, w, h);
    ctx.stroke();
    if (def.berry) {
      for (const d of accentDots(o, 9)) dot(ctx, d.x * w, d.y * h, Math.max(1.5, 0.08 * scale), def.berry);
    }
  },

  hedge(ctx, w, h, o, scale, def) {
    shadow(ctx, w, h, false);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.3);
    ctx.fill();
    ctx.fillStyle = shade(def.color, 0.15);
    const alongW = w >= h;
    const len = alongW ? w : h;
    const r = (alongW ? h : w) * 0.3;
    for (let t = -len / 2 + r * 1.3; t < len / 2 - r; t += r * 1.6) {
      dot(ctx, alongW ? t : 0, alongW ? 0 : t, r, ctx.fillStyle);
    }
  },

  flowerbed(ctx, w, h, o, scale, def) {
    ctx.fillStyle = '#8a6a4a';
    ctx.beginPath();
    if (def.shape === 'circle') ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    else ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.2);
    ctx.fill();
    const r = Math.max(1.5, 0.09 * scale);
    for (const d of flowerDots(o)) dot(ctx, d.x * scale, d.y * scale, r, d.color);
  },

  path(ctx, w, h, o, scale, def) {
    ctx.lineWidth = 1;
    if (def.pattern === 'stones') {
      for (const s of stonePositions(o)) {
        dot(ctx, s.x * scale, s.y * scale, s.r * scale, def.fill);
        ctx.strokeStyle = def.line;
        ctx.stroke();
      }
      return;
    }
    ctx.fillStyle = def.fill;
    ctx.strokeStyle = def.line;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    if (def.pattern === 'tiles') {
      const step = 0.5 * scale;
      ctx.beginPath();
      for (let y = -h / 2 + step; y < h / 2 - 1; y += step) { ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); }
      for (let x = -w / 2 + step; x < w / 2 - 1; x += step) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); }
      ctx.stroke();
    } else if (def.pattern === 'boards') {
      const step = 0.2 * scale;
      ctx.beginPath();
      for (let x = -w / 2 + step; x < w / 2 - 1; x += step) { ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); }
      ctx.stroke();
    } else if (def.pattern === 'gravel') {
      const rand = seededRandom(o.id);
      const count = Math.min(600, Math.round(o.w * o.h * 40));
      ctx.fillStyle = def.line;
      for (let i = 0; i < count; i++) {
        ctx.fillRect((rand() - 0.5) * w, (rand() - 0.5) * h, 1.5, 1.5);
      }
    }
  },

  pool(ctx, w, h, o, scale) {
    const rim = Math.min(0.3 * scale, Math.min(w, h) * 0.15);
    ctx.fillStyle = '#ece2cf';
    ctx.strokeStyle = '#cbbb9c';
    ctx.lineWidth = 1;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#8fd3ea');
    g.addColorStop(1, '#3f9cc4');
    ctx.fillStyle = g;
    ctx.fillRect(-w / 2 + rim, -h / 2 + rim, w - rim * 2, h - rim * 2);
    // блики на воде
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const y = -h / 2 + (h * i) / 4;
      ctx.moveTo(-w * 0.25, y);
      ctx.quadraticCurveTo(0, y - 4, w * 0.25, y);
    }
    ctx.stroke();
  },

  pond(ctx, w, h, o, scale) {
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, '#4f9fbf');
    g.addColorStop(1, '#7cc0d6');
    ctx.fillStyle = g;
    ellipse(ctx, w, h);
    ctx.fill();
    ctx.strokeStyle = '#a9a294';
    ctx.lineWidth = Math.max(2, 0.12 * scale);
    ctx.stroke();
    // кувшинки
    for (const d of accentDots(o, 4)) dot(ctx, d.x * w * 0.9, d.y * h * 0.9, Math.max(2, 0.15 * scale), '#6fa55e');
  },

  fountain(ctx, w, h) {
    shadow(ctx, w, h, true);
    ctx.fillStyle = '#d8cfbf';
    ellipse(ctx, w, h);
    ctx.fill();
    ctx.strokeStyle = '#ada391';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#7cc6e0';
    ellipse(ctx, w * 0.82, h * 0.82);
    ctx.fill();
    ctx.fillStyle = '#d8cfbf';
    ellipse(ctx, w * 0.3, h * 0.3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#bfe6f3';
    ellipse(ctx, w * 0.16, h * 0.16);
    ctx.fill();
  },

  gazebo(ctx, w, h) {
    shadow(ctx, w, h, false);
    ctx.fillStyle = '#c49a6c';
    ctx.fillRect(-w / 2, -h / 2, w, h);
    // скаты крыши
    ctx.strokeStyle = '#8a6440';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, h / 2);
    ctx.moveTo(w / 2, -h / 2); ctx.lineTo(-w / 2, h / 2);
    ctx.stroke();
    ctx.strokeStyle = '#7a5634';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#7a5634';
    ctx.fillRect(-3, -3, 6, 6);
  },

  shed(ctx, w, h) {
    shadow(ctx, w, h, false);
    // двускатная крыша, конёк вдоль длины
    ctx.fillStyle = '#9c5b45';
    ctx.fillRect(-w / 2, -h / 2, w / 2, h);
    ctx.fillStyle = '#b56d53';
    ctx.fillRect(0, -h / 2, w / 2, h);
    ctx.strokeStyle = '#6e3d2e';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.beginPath();
    ctx.moveTo(0, -h / 2);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
  },

  bench(ctx, w, h) {
    shadow(ctx, w, h, false);
    ctx.fillStyle = '#b88a5c';
    ctx.fillRect(-w / 2, -h / 2 + h * 0.3, w, h * 0.7);
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(-w / 2, -h / 2, w, h * 0.22); // спинка
    ctx.strokeStyle = '#8a6440';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const y = -h / 2 + h * 0.3 + (h * 0.7 * i) / 3;
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(w / 2, y);
    }
    ctx.stroke();
  },

  lamp(ctx, w, h) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 1.2);
    g.addColorStop(0, 'rgba(255, 221, 120, 0.6)');
    g.addColorStop(1, 'rgba(255, 221, 120, 0)');
    ctx.fillStyle = g;
    ellipse(ctx, w * 2.4, h * 2.4);
    ctx.fill();
    ctx.fillStyle = '#3d3f3a';
    ellipse(ctx, w, h);
    ctx.fill();
    ctx.fillStyle = '#ffd86b';
    ellipse(ctx, w * 0.5, h * 0.5);
    ctx.fill();
  },
};
