import { CATALOG, CATEGORIES, clampObject, clampSize } from './catalog.js';
import { Plan2D, drawThumbnail } from './plan2d.js';
import { View3D } from './view3d.js';

const STORAGE_KEY = 'gardendesign-project';
const MIN_SIZE = 2;
const MAX_SIZE = 200;

const state = { width: 20, length: 15, objects: [], selectedId: null };
let mode = '2d';

const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'),
  width: $('input-width'),
  length: $('input-length'),
  area: $('area-info'),
  categories: $('categories'),
  catalog: $('catalog'),
  objW: $('input-obj-w'),
  objH: $('input-obj-h'),
  selEmpty: $('selection-empty'),
  selBody: $('selection-body'),
  selName: $('selection-name'),
  rotation: $('input-rotation'),
  rotationValue: $('rotation-value'),
  view3d: $('view3d'),
  toast: $('toast'),
};

const plan = new Plan2D($('plan-canvas'), state, {
  onSelect: (id) => { state.selectedId = id; updatePanel(); },
  onChange: updatePanel,
});
const view3d = new View3D(els.view3d);

// ---------- Объекты ----------
function addObject(type) {
  const def = CATALOG[type];
  // Новые объекты раскладываем по кругу от центра, чтобы они не ложились друг на друга
  const n = state.objects.length;
  const angle = n * 2.4;
  const dist = n ? Math.min(state.width, state.length) * 0.08 * (1 + (n % 4)) : 0;
  const obj = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    x: state.width / 2 + Math.cos(angle) * dist,
    y: state.length / 2 + Math.sin(angle) * dist,
    w: def.w,
    h: def.h,
    rotation: 0,
  };
  clampObject(obj, state);
  state.objects.push(obj);
  state.selectedId = obj.id;
  refresh();
}

function selectedObject() {
  return state.objects.find((o) => o.id === state.selectedId) || null;
}

function deleteSelected() {
  if (!state.selectedId) return;
  state.objects = state.objects.filter((o) => o.id !== state.selectedId);
  state.selectedId = null;
  refresh();
}

function resizeSelected() {
  const obj = selectedObject();
  if (!obj) return;
  const read = (input, fallback) => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? clampSize(v) : fallback;
  };
  obj.w = read(els.objW, obj.w);
  obj.h = read(els.objH, obj.h);
  clampObject(obj, state);
  refresh();
}

function rotateSelected(deg, absolute = false) {
  const obj = selectedObject();
  if (!obj) return;
  obj.rotation = (((absolute ? deg : obj.rotation + deg) % 360) + 360) % 360;
  clampObject(obj, state);
  refresh();
}

// ---------- Интерфейс ----------
function updatePanel() {
  const obj = selectedObject();
  els.selEmpty.hidden = !!obj;
  els.selBody.hidden = !obj;
  if (obj) {
    els.selName.textContent = CATALOG[obj.type].name;
    // не перебиваем поле, пока пользователь в нём печатает
    if (document.activeElement !== els.objW) els.objW.value = obj.w;
    if (document.activeElement !== els.objH) els.objH.value = obj.h;
    els.rotation.value = obj.rotation;
    els.rotationValue.textContent = `${obj.rotation}°`;
  }
  els.width.value = state.width;
  els.length.value = state.length;
  els.area.textContent = `Площадь: ${+(state.width * state.length).toFixed(2)} м² · объектов: ${state.objects.length}`;
}

function refresh() {
  updatePanel();
  plan.render();
  if (mode === '3d') view3d.show(state);
}

function setMode(next) {
  mode = next;
  document.querySelectorAll('.mode-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  els.stage.classList.toggle('mode-3d', mode === '3d');
  els.view3d.hidden = mode !== '3d';
  if (mode === '3d') view3d.show(state);
  else { view3d.hide(); plan.resize(); }
}

function applySize() {
  const read = (input, fallback) => {
    const v = parseFloat(input.value);
    return Number.isFinite(v) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, v)) : fallback;
  };
  state.width = read(els.width, state.width);
  state.length = read(els.length, state.length);
  state.objects.forEach((o) => clampObject(o, state));
  refresh();
}

let toastTimer;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200);
}

// ---------- Сохранение в браузере ----------
function saveProject() {
  const data = { width: state.width, length: state.length, objects: state.objects };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    toast('Проект сохранён в браузере');
  } catch {
    toast('Не удалось сохранить проект');
  }
}

function loadProject(silent = false) {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch { /* повреждённые данные — считаем, что сохранения нет */ }

  if (!data || !Array.isArray(data.objects)) {
    if (!silent) toast('Сохранённый проект не найден');
    return false;
  }
  state.width = Number(data.width) || 20;
  state.length = Number(data.length) || 15;
  state.objects = data.objects.filter((o) => CATALOG[o.type]);
  state.selectedId = null;
  refresh();
  if (!silent) toast('Проект открыт');
  return true;
}

function clearProject() {
  if (state.objects.length && !confirm('Удалить все объекты с плана?')) return;
  state.objects = [];
  state.selectedId = null;
  refresh();
}

// ---------- События ----------
function showCategory(categoryId) {
  els.categories.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.category === categoryId);
  });
  els.catalog.innerHTML = '';
  for (const [type, def] of Object.entries(CATALOG)) {
    if (def.category !== categoryId) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = `${def.name}, ${def.w}×${def.h} м`;
    btn.append(drawThumbnail(type));
    const label = document.createElement('span');
    label.textContent = def.name;
    btn.append(label);
    btn.addEventListener('click', () => addObject(type));
    els.catalog.appendChild(btn);
  }
}

for (const cat of CATEGORIES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.category = cat.id;
  btn.textContent = cat.name;
  btn.addEventListener('click', () => showCategory(cat.id));
  els.categories.appendChild(btn);
}
showCategory(CATEGORIES[0].id);

document.querySelectorAll('.mode-switch button').forEach((b) => {
  b.addEventListener('click', () => setMode(b.dataset.mode));
});

els.width.addEventListener('change', applySize);
els.length.addEventListener('change', applySize);
els.objW.addEventListener('change', resizeSelected);
els.objH.addEventListener('change', resizeSelected);
els.rotation.addEventListener('input', () => rotateSelected(Number(els.rotation.value), true));
$('btn-rotate-left').addEventListener('click', () => rotateSelected(-15));
$('btn-rotate-right').addEventListener('click', () => rotateSelected(15));
$('btn-delete').addEventListener('click', deleteSelected);
$('btn-save').addEventListener('click', saveProject);
$('btn-open').addEventListener('click', () => loadProject());
$('btn-clear').addEventListener('click', clearProject);

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  else if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') rotateSelected(e.shiftKey ? -15 : 15);
  else if (e.key === 'Escape') { state.selectedId = null; refresh(); }
});

// При запуске открываем сохранённый проект, если он есть
if (!loadProject(true)) refresh();
