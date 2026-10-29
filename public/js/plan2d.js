import { CATALOG, clampObject, flowerDots } from './catalog.js';

const PADDING = 48;        // отступ от краёв холста, px
const HANDLE_OFFSET = 22;  // расстояние ручки поворота от объекта, px
const HANDLE_RADIUS = 8;
const ROTATE_STEP = 5;     // шаг поворота ручкой, градусы

// 2D-план участка на Canvas: отрисовка, выбор, перемещение и поворот объектов
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

  handlePos(o) {
    const c = this.toScreen(o.x, o.y);
    const r = (o.rotation * Math.PI) / 180;
    const d = (o.h * this.scale) / 2 + HANDLE_OFFSET;
    return { x: c.x + d * Math.sin(r), y: c.y - d * Math.cos(r) };
  }

  hitHandle(o, px, py) {
    const h = this.handlePos(o);
    return Math.hypot(px - h.x, py - h.y) <= HANDLE_RADIUS + 4;
  }

  // ---------- Мышь / касания ----------
  onDown(e) {
    const { px, py } = this.pointer(e);
    const sel = this.selected();
    if (sel && this.hitHandle(sel, px, py)) {
      this.action = { type: 'rotate', obj: sel };
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
      if (sel && this.hitHandle(sel, px, py)) this.canvas.style.cursor = 'grab';
      else this.canvas.style.cursor = this.hitTest(px, py) ? 'move' : 'default';
      return;
    }

    const obj = this.action.obj;
    if (this.action.type === 'move') {
      const w = this.toWorld(px, py);
      obj.x = w.x - this.action.dx;
      obj.y = w.y - this.action.dy;
    } else {
      const c = this.toScreen(obj.x, obj.y);
      const angle = (Math.atan2(px - c.x, -(py - c.y)) * 180) / Math.PI;
      obj.rotation = ((Math.round(angle / ROTATE_STEP) * ROTATE_STEP) % 360 + 360) % 360;
      this.canvas.style.cursor = 'grabbing';
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
    const w = o.w * this.scale;
    const h = o.h * this.scale;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate((o.rotation * Math.PI) / 180);
    DRAWERS[o.type](ctx, w, h, o, this.scale);
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
    ctx.restore();
  }
}

// ---------- Функции отрисовки объектов (в локальных координатах, центр в 0,0) ----------
function shadow(ctx, w, h, round) {
  ctx.fillStyle = 'rgba(36, 64, 42, 0.16)';
  ctx.beginPath();
  if (round) ctx.ellipse(3, 4, w / 2, h / 2, 0, 0, Math.PI * 2);
  else ctx.rect(-w / 2 + 3, -h / 2 + 4, w, h);
  ctx.fill();
}

const DRAWERS = {
  tree(ctx, w, h) {
    shadow(ctx, w, h, true);
    const g = ctx.createRadialGradient(-w * 0.15, -h * 0.15, 2, 0, 0, Math.max(w, h) / 2);
    g.addColorStop(0, '#86b866');
    g.addColorStop(1, '#3f6e2e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2f5523';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#7a5634';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, Math.min(w, h) * 0.06), 0, Math.PI * 2);
    ctx.fill();
  },

  shrub(ctx, w, h) {
    shadow(ctx, w, h, true);
    ctx.fillStyle = '#6f9a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    // «пушистый» край из маленьких кругов
    ctx.fillStyle = '#82ad5c';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * w * 0.28, Math.sin(a) * h * 0.28, Math.min(w, h) * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = '#4c7531';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  flower(ctx, w, h, o, scale) {
    ctx.fillStyle = '#8a6a4a';
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.2);
    ctx.fill();
    const r = Math.max(2, 0.09 * scale);
    for (const d of flowerDots(o)) {
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(d.x * scale, d.y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  path(ctx, w, h, o, scale) {
    ctx.fillStyle = '#e3d3b0';
    ctx.strokeStyle = '#c4ad82';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.stroke();
    // плитки каждые 0.5 м
    ctx.lineWidth = 1;
    const step = 0.5 * scale;
    for (let y = -h / 2 + step; y < h / 2 - 1; y += step) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, y);
      ctx.lineTo(w / 2, y);
      ctx.stroke();
    }
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
    ctx.fillRect(-4, -4, 8, 8);
  },
};
