// Реалистичные 3D-модели объектов сада: натуральные текстуры, рельеф, листва из множества листьев
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { flowerDots, stonePositions, stoneShape, pondOutline, seededRandom, pointInObject, CATALOG } from './catalog.js';
import * as T from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Текстуры и материалы ----------
let anisotropy = 4;
export function setAnisotropy(n) { anisotropy = n; }

const texCache = new Map();
function tex(canvas, srgb = true) {
  let t = texCache.get(canvas);
  if (!t) {
    t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(canvas, t);
  }
  return t;
}

const matCache = new Map();
function material(key, make) {
  if (!matCache.has(key)) matCache.set(key, make());
  return matCache.get(key);
}

// Материал поверхности: цветовая текстура + карта рельефа из неё же
function surface(fn, { normal = 2, roughness = 0.9, color = '#ffffff', side = THREE.FrontSide } = {}) {
  return material(['s', fn.name, normal, roughness, color, side].join('|'), () => {
    const canvas = fn();
    return new THREE.MeshStandardMaterial({
      map: tex(canvas),
      normalMap: normal ? tex(T.normalMap(canvas, normal), false) : null,
      roughness,
      color,
      side,
    });
  });
}

// Прозрачная текстура без тёмной каймы: пустые пиксели получают средний цвет листьев,
// иначе при уменьшении (mipmap) края листвы смешиваются с чёрным и растения выглядят грязно-тёмными
function alphaTex(canvas) {
  let t = texCache.get(canvas);
  if (t) return t;
  const { width: w, height: h } = canvas;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] > 200) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
  }
  r /= n || 1; g /= n || 1; b /= n || 1;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = ((h - 1 - y) * w + x) * 4; // переворот по вертикали, как у CanvasTexture
      const a = src[s + 3];
      const k = a / 255;
      // полупрозрачные края плавно переходят к среднему цвету листвы
      data[d] = a ? Math.min(255, src[s] * k + r * (1 - k)) : r;
      data[d + 1] = a ? Math.min(255, src[s + 1] * k + g * (1 - k)) : g;
      data[d + 2] = a ? Math.min(255, src[s + 2] * k + b * (1 - k)) : b;
      data[d + 3] = a;
    }
  }
  t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  texCache.set(canvas, t);
  return t;
}

// Листва и растения: прозрачные карточки, цвет вершин даёт объём и разнообразие оттенков
function leafMaterial(canvas) {
  return material(canvas, () => {
    const m = new THREE.MeshStandardMaterial({
      map: alphaTex(canvas),
      alphaTest: 0.4,
      vertexColors: true,
      roughness: 1,
      envMapIntensity: 0.55,
    });
    // На дальних mip-уровнях мелкие листья «растворяются» — компенсируем потерю непрозрачности
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        {
          vec2 tuv = vMapUv * vec2(textureSize(map, 0));
          vec2 ddx = dFdx(tuv);
          vec2 ddy = dFdy(tuv);
          float mip = max(0.0, 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy))));
          diffuseColor.a *= 1.0 + mip * 0.3;
        }
        #include <alphatest_fragment>`);
    };
    return m;
  });
}

function plain(color, roughness = 0.9, metalness = 0) {
  return material(['p', color, roughness, metalness].join('|'), () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
}

const waterNormal = () => tex(T.normalMap(T.waterRipples(), 3), false);
function water(color, opacity, extra = {}) {
  return material(['w', color, opacity, JSON.stringify(extra)].join('|'), () => new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity,
    normalMap: waterNormal(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    envMapIntensity: 1.3,
    depthWrite: false,
    ...extra,
  }));
}

// Медленная рябь на воде
export function animate(dt) {
  const n = texCache.size ? waterNormal() : null;
  if (n) {
    n.offset.x += dt * 0.02;
    n.offset.y += dt * 0.013;
  }
}

// ---------- Геометрия ----------
// UV в метрах по направлению нормали — текстура ложится без растяжения на любой размер
function worldUV(geo, meters = 1) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / meters;
    uv[i * 2 + 1] = v / meters;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function box(w, h, d, mat, x, y, z, meters = 1) {
  return mesh(worldUV(new THREE.BoxGeometry(w, h, d), meters), mat, x, y, z);
}

// Произвольный многоугольник (треугольник или четырёхугольник) с заданными UV
function polygon(points, uvs, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
  geo.setIndex(points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Ветка/ствол: конус от точки a к точке b
function limb(a, b, r0, r1, mat) {
  const dir = V().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 9, 3);
  scaleUV(geo, Math.max(1, Math.round((2 * Math.PI * r0) / T.METERS.bark)), len / T.METERS.bark);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  return m;
}

// Камень неправильной формы
function rockGeometry(seed, detail = 2) {
  let geo = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);
  const rand = seededRandom(seed);
  const a = rand() * 10, b = rand() * 10, c = rand() * 10;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.85 + 0.15 * Math.sin(x * 3 + a) * Math.cos(y * 2.5 + b) + 0.08 * Math.sin(z * 5 + c);
    x *= k; y *= k; z *= k;
    if (y < -0.35) y = -0.35;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return worldUV(geo, 0.6);
}

// Сборщик «карточек» листвы в один меш. Каждая карточка двусторонняя, но с общей нормалью,
// направленной наружу кроны — так листва освещается мягко и объёмно, без тёмной изнанки.
const UV_FULL = [[0, 0], [1, 0], [1, 1], [0, 1]];
class Cards {
  constructor() {
    this.p = []; this.n = []; this.c = []; this.uv = []; this.i = [];
  }

  quad(pts, normal, color, uv = UV_FULL) {
    const b = this.p.length / 3;
    pts.forEach((v, k) => {
      this.p.push(v.x, v.y, v.z);
      this.n.push(normal.x, normal.y, normal.z);
      this.c.push(color, color * 0.98, color * 0.94);
      this.uv.push(uv[k][0], uv[k][1]);
    });
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
  }

  // Пучок листьев: квадратная карточка со случайной ориентацией
  clump(center, size, rand, normal, color) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3));
    const r = V(size / 2, 0, 0).applyQuaternion(q);
    const u = V(0, size / 2, 0).applyQuaternion(q);
    const c = center;
    this.quad([c.clone().sub(r).sub(u), c.clone().add(r).sub(u), c.clone().add(r).add(u), c.clone().sub(r).add(u)], normal, color);
  }

  // Растение сбоку: две перекрещённые вертикальные карточки
  cross(base, width, height, yaw, color) {
    for (const a of [yaw, yaw + Math.PI / 2]) {
      const d = V(Math.cos(a) * width / 2, 0, Math.sin(a) * width / 2);
      const top = V(0, height, 0);
      const n = V(Math.sin(a) * 0.25, 1, -Math.cos(a) * 0.25).normalize();
      this.quad([base.clone().sub(d), base.clone().add(d), base.clone().add(d).add(top), base.clone().sub(d).add(top)], n, color);
    }
  }

  mesh(mat) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setIndex(this.i);
    return new THREE.Mesh(geo, mat);
  }
}

// Случайное направление на сфере
function randomDir(rand) {
  const u = rand() * 2 - 1;
  const a = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return V(s * Math.cos(a), u, s * Math.sin(a));
}

// Заполнить «лепесток» кроны пучками листьев (плотнее у поверхности, темнее внутри)
function fillLobe(cards, rand, lobe, crown, size, count) {
  for (let k = 0; k < count; k++) {
    const d = randomDir(rand);
    const rr = 0.55 + 0.45 * Math.cbrt(rand());
    const pos = V(
      lobe.c.x + d.x * lobe.r * rr * crown.sx,
      Math.max(0.05, lobe.c.y + d.y * lobe.r * rr * crown.sy),
      lobe.c.z + d.z * lobe.r * rr * crown.sz,
    );
    const rel = V().subVectors(pos, crown.c);
    const normal = V(rel.x / crown.sx, rel.y / crown.sy, rel.z / crown.sz).normalize().add(V(0, 0.35, 0)).normalize();
    const outer = clamp(rel.length() / crown.r, 0, 1.1);
    const height = clamp((pos.y - crown.bottom) / crown.height, 0, 1);
    const ao = (0.42 + 0.32 * outer + 0.12 * height) * (0.85 + rand() * 0.25);
    cards.clump(pos, size * (0.75 + rand() * 0.5), rand, normal, ao);
  }
}

// ---------- Ограничение числа точечных источников света от фонарей ----------
let lampLights = 0;
export function resetBuild() { lampLights = 0; }

// ======================================================================
// Модели
// ======================================================================
export const BUILDERS = {
  tree(o, def) {
    const g = new THREE.Group();
    const rand = seededRandom(o.id + 'tree');
    const R = Math.min(o.w, o.h) / 2;
    const sx = o.w / 2 / R, sz = o.h / 2 / R;
    const Ry = R * (def.tall ? 1.3 : def.low ? 0.78 : 0.92);
    const trunkH = def.tall ? 2.4 + R * 0.7 : def.low ? 0.9 + R * 0.35 : 1.6 + R * 0.5;
    const H = trunkH + Ry * 1.55;
    const crown = { c: V(0, H - Ry, 0), r: R, sx, sy: Ry / R, sz, bottom: H - Ry * 2, height: Ry * 2 };
    const trunkR = Math.max(0.05, R * (def.tall ? 0.07 : 0.1));
    const barkMat = surface(def.bark === 'birch' ? T.birchBark : T.bark, { normal: 4, roughness: 0.95 });

    // Ствол с лёгким наклоном и утолщением у земли
    const top = V((rand() - 0.5) * 0.25 * R, trunkH, (rand() - 0.5) * 0.25 * R);
    g.add(limb(V(0, 0, 0), top, trunkR, trunkR * 0.72, barkMat));
    g.add(limb(V(0, -0.02, 0), V(top.x * 0.1, 0.3, top.z * 0.1), trunkR * 1.5, trunkR * 0.98, barkMat));

    // «Лепестки» кроны и скелетные ветви к ним
    const lobes = [];
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.6;
      const el = (rand() - 0.35) * 0.9;
      lobes.push({ c: V(Math.cos(a) * R * 0.5 * sx, crown.c.y + el * Ry * 0.55, Math.sin(a) * R * 0.5 * sz), r: R * (0.5 + rand() * 0.18) });
    }
    lobes.push({ c: V(0, crown.c.y + Ry * 0.42, 0), r: R * 0.55 });

    for (const lobe of lobes) {
      const t = 0.75 + rand() * 0.25;
      const start = V().lerpVectors(V(0, 0, 0), top, t);
      const end = V().lerpVectors(start, lobe.c, 0.85);
      g.add(limb(start, end, trunkR * 0.5, trunkR * 0.16, barkMat));
      const mid = V().lerpVectors(start, end, 0.55);
      const twig = lobe.c.clone().add(randomDir(rand).multiplyScalar(lobe.r * 0.5));
      g.add(limb(mid, twig, trunkR * 0.22, trunkR * 0.07, barkMat));
    }

    // Тёмная сердцевина — крона не просвечивает насквозь
    const core = mesh(new THREE.IcosahedronGeometry(1, 2), plain('#26341c', 1), crown.c.x, crown.c.y, crown.c.z);
    core.scale.set(R * 0.45 * sx, Ry * 0.45, R * 0.45 * sz);
    g.add(core);

    // Листва
    const cards = new Cards();
    const size = clamp(R * 0.55, 0.45, 1.1);
    for (const lobe of lobes) fillLobe(cards, rand, lobe, crown, size, Math.round(lobe.r * lobe.r * 120) + 24);
    g.add(cards.mesh(leafMaterial(T.foliage(def.preset))));
    return g;
  },

  conifer(o, def) {
    const g = new THREE.Group();
    const rand = seededRandom(o.id + 'conifer');
    const R = Math.min(o.w, o.h) / 2;
    const sx = o.w / 2 / R, sz = o.h / 2 / R;
    const H = R * 2 * def.heightK;
    const barkMat = surface(T.bark, { normal: 4, roughness: 0.95 });
    g.add(limb(V(0, 0, 0), V(0, H * 0.96, 0), Math.max(0.04, R * 0.08), 0.015, barkMat));
    const cards = new Cards();

    if (def.form === 'spruce') {
      // Тёмный конус внутри и ярусы веток с хвоей, опущенные вниз
      const core = mesh(new THREE.ConeGeometry(R * 0.55, H * 0.82, 12), plain('#1d2c1b', 1), 0, H * 0.12 + H * 0.41, 0);
      core.scale.set(sx, 1, sz);
      g.add(core);
      const step = Math.max(0.16, H / 30);
      let level = 0;
      for (let y = H * 0.1; y < H * 0.97; y += step, level++) {
        const t = (y - H * 0.1) / (H * 0.87);
        const rr = R * Math.pow(1 - t, 0.95) * (0.9 + rand() * 0.2) + 0.12;
        const count = 6 + Math.round(rr * 7);
        for (let b = 0; b < count; b++) {
          const a = (b / count) * Math.PI * 2 + rand() * 0.5 + level * 0.7;
          const d = V(Math.cos(a) * sx, 0, Math.sin(a) * sz);
          const base = V(d.x * 0.04, y, d.z * 0.04);
          const tip = V(d.x * rr, y - rr * 0.32 + (rand() - 0.5) * 0.06, d.z * rr);
          const w = rr * 0.55 + 0.15;
          const twist = (rand() - 0.5) * 0.9;
          const perp = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Math.cos(twist)).add(V(0, Math.sin(twist), 0));
          const ao = 0.62 + 0.3 * t + rand() * 0.15;
          cards.quad(
            [base.clone().addScaledVector(perp, -w * 0.2), base.clone().addScaledVector(perp, w * 0.2), tip.clone().addScaledVector(perp, w / 2), tip.clone().addScaledVector(perp, -w / 2)],
            d.clone().normalize().add(V(0, 0.7, 0)).normalize(),
            ao,
            [[0, 0], [0, 1], [1, 1], [1, 0]],
          );
        }
      }
      g.add(cards.mesh(leafMaterial(T.needles())));
    } else {
      // Колонновидная туя: плотные пучки по веретенообразному силуэту
      const profile = (t) => R * (t < 0.15 ? 0.65 + (t / 0.15) * 0.35 : Math.pow((1 - t) / 0.85, 0.75));
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector2(profile(i / 12) * 0.72, (i / 12) * H));
      const core = mesh(new THREE.LatheGeometry(pts, 14), plain('#25361e', 1));
      core.scale.set(sx, 1, sz);
      g.add(core);
      const count = Math.round(H * R * 130) + 40;
      const size = clamp(R * 0.6, 0.22, 0.6);
      for (let k = 0; k < count; k++) {
        const t = rand();
        const a = rand() * Math.PI * 2;
        const r = profile(t) * (0.75 + rand() * 0.3);
        const pos = V(Math.cos(a) * r * sx, 0.05 + t * H * 0.97, Math.sin(a) * r * sz);
        const normal = V(Math.cos(a), 0.35, Math.sin(a)).normalize();
        cards.clump(pos, size * (0.8 + rand() * 0.4), rand, normal, (0.55 + 0.35 * t) * (0.85 + rand() * 0.25));
      }
      g.add(cards.mesh(leafMaterial(T.foliage('thuja'))));
    }
    return g;
  },

  shrub(o, def) {
    const g = new THREE.Group();
    const rand = seededRandom(o.id + 'shrub');
    const R = Math.min(o.w, o.h) / 2;
    const sx = o.w / 2 / R, sz = o.h / 2 / R;
    const Ry = R * 0.8;
    const crown = { c: V(0, Ry * 0.85, 0), r: R, sx, sy: Ry / R, sz, bottom: 0, height: Ry * 1.9 };
    const core = mesh(new THREE.IcosahedronGeometry(1, 2), plain('#24321b', 1), 0, crown.c.y * 0.9, 0);
    core.scale.set(R * 0.48 * sx, Ry * 0.45, R * 0.48 * sz);
    g.add(core);
    const lobes = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rand() * 0.8;
      lobes.push({ c: V(Math.cos(a) * R * 0.35 * sx, crown.c.y + (rand() - 0.4) * Ry * 0.3, Math.sin(a) * R * 0.35 * sz), r: R * 0.62 });
    }
    lobes.push({ c: V(0, crown.c.y + Ry * 0.3, 0), r: R * 0.55 });
    const cards = new Cards();
    const size = clamp(R * 0.55, 0.22, 0.6);
    for (const lobe of lobes) fillLobe(cards, rand, lobe, crown, size, Math.round(lobe.r * lobe.r * 130) + 12);
    g.add(cards.mesh(leafMaterial(T.foliage(def.preset))));
    return g;
  },

  hedge(o, def) {
    const g = new THREE.Group();
    const rand = seededRandom(o.id + 'hedge');
    const H = clamp(Math.min(o.w, o.h) * 1.4, 0.8, 1.8);
    g.add(box(o.w - 0.1, H - 0.06, o.h - 0.1, plain('#26361f', 1), 0, (H - 0.06) / 2, 0));
    // Пучки листьев по всем граням стриженой изгороди
    const cards = new Cards();
    const faces = [
      { n: V(0, 1, 0), u: V(1, 0, 0), v: V(0, 0, 1), c: V(0, H, 0), su: o.w, sv: o.h },
      { n: V(1, 0, 0), u: V(0, 0, 1), v: V(0, 1, 0), c: V(o.w / 2, H / 2, 0), su: o.h, sv: H },
      { n: V(-1, 0, 0), u: V(0, 0, 1), v: V(0, 1, 0), c: V(-o.w / 2, H / 2, 0), su: o.h, sv: H },
      { n: V(0, 0, 1), u: V(1, 0, 0), v: V(0, 1, 0), c: V(0, H / 2, o.h / 2), su: o.w, sv: H },
      { n: V(0, 0, -1), u: V(1, 0, 0), v: V(0, 1, 0), c: V(0, H / 2, -o.h / 2), su: o.w, sv: H },
    ];
    const area = faces.reduce((s, f) => s + f.su * f.sv, 0);
    const spacing = Math.max(0.26, Math.sqrt(area / 2500));
    for (const f of faces) {
      for (let a = -f.su / 2 + spacing / 2; a < f.su / 2; a += spacing) {
        for (let b = -f.sv / 2 + spacing / 2; b < f.sv / 2; b += spacing) {
          const pos = f.c.clone()
            .addScaledVector(f.u, a + (rand() - 0.5) * spacing * 0.6)
            .addScaledVector(f.v, b + (rand() - 0.5) * spacing * 0.6)
            .addScaledVector(f.n, (rand() - 0.6) * 0.06);
          const ao = (0.62 + 0.38 * clamp(pos.y / H, 0, 1)) * (0.85 + rand() * 0.25);
          cards.clump(pos, spacing * 1.6, rand, f.n.clone().add(V(0, 0.3, 0)).normalize(), ao);
        }
      }
    }
    g.add(cards.mesh(leafMaterial(T.foliage(def.preset))));
    return g;
  },

  flowerbed(o, def) {
    const g = new THREE.Group();
    const soilMat = surface(T.soil, { normal: 3, roughness: 1 });
    const soil = def.shape === 'circle'
      ? mesh(worldUV(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 40).scale(o.w, 1, o.h), 0.6), soilMat, 0, 0.04, 0)
      : box(o.w, 0.08, o.h, soilMat, 0, 0.04, 0, 0.6);
    g.add(soil);
    const sizes = { daisy: [0.32, 0.42], rose: [0.45, 0.6], tulip: [0.28, 0.48], lavender: [0.5, 0.58] };
    const [pw, ph] = sizes[def.plant];
    const byColor = new Map();
    for (const d of flowerDots(o)) {
      if (!byColor.has(d.color)) byColor.set(d.color, new Cards());
      byColor.get(d.color).cross(V(d.x, 0.07, d.y), pw * d.size, ph * d.size, d.angle, 0.8 + d.size * 0.25);
    }
    for (const [color, cards] of byColor) g.add(cards.mesh(leafMaterial(T.plantCard(def.plant, color))));
    return g;
  },

  path(o, def) {
    const g = new THREE.Group();
    if (def.pattern === 'stones') {
      const mat = surface(T.stone, { normal: 4, roughness: 0.85 });
      for (const s of stonePositions(o)) {
        const shape = stoneShape(s.seed);
        const geo = new THREE.CylinderGeometry(1, 1, 0.07, 24, 1);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const a = (Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 1) % 1;
          const f = a * shape.length;
          const k0 = shape[Math.floor(f) % shape.length];
          const k1 = shape[(Math.floor(f) + 1) % shape.length];
          let k = k0 + (k1 - k0) * (f % 1);
          if (p.getY(i) > 0) k *= 0.94; // скруглённая верхняя кромка
          p.setXYZ(i, p.getX(i) * k * s.r, p.getY(i), p.getZ(i) * k * s.r * 0.85);
        }
        geo.computeVertexNormals();
        const st = mesh(worldUV(geo, 0.6), mat, s.x, 0.025, s.y);
        st.rotation.y = s.angle;
        g.add(st);
      }
      return g;
    }
    if (def.pattern === 'tiles') {
      g.add(box(o.w, 0.05, o.h, surface(T.pavers, { normal: 3, roughness: 0.92 }), 0, 0.025, 0, T.METERS.pavers));
    } else if (def.pattern === 'gravel') {
      g.add(box(o.w, 0.03, o.h, surface(T.gravel, { normal: 5, roughness: 1 }), 0, 0.015, 0, T.METERS.gravel));
      // бордюрная лента по краям
      const edge = plain('#3a3530', 0.7, 0.3);
      g.add(box(0.025, 0.06, o.h, edge, -o.w / 2, 0.03, 0), box(0.025, 0.06, o.h, edge, o.w / 2, 0.03, 0));
    } else {
      g.add(box(o.w, 0.1, o.h, surface(T.wood, { normal: 2.5, roughness: 0.8 }), 0, 0.05, 0, T.METERS.wood));
    }
    return g;
  },

  pool(o) {
    const g = new THREE.Group();
    const rim = Math.min(0.35, Math.min(o.w, o.h) * 0.12);
    const coping = surface(T.travertine, { normal: 2.5, roughness: 0.75 });
    const ch = 0.12;
    const iw = o.w - rim * 2, ih = o.h - rim * 2;
    g.add(
      box(o.w, ch, rim, coping, 0, ch / 2, -o.h / 2 + rim / 2, 0.6),
      box(o.w, ch, rim, coping, 0, ch / 2, o.h / 2 - rim / 2, 0.6),
      box(rim, ch, ih, coping, -o.w / 2 + rim / 2, ch / 2, 0, 0.6),
      box(rim, ch, ih, coping, o.w / 2 - rim / 2, ch / 2, 0, 0.6),
    );
    // дно с мозаикой, затемнённое «глубиной», и вода сверху
    g.add(box(iw, 0.01, ih, surface(T.poolTiles, { normal: 1.5, roughness: 0.4, color: '#7fa4ac' }), 0, 0.005, 0, T.METERS.poolTiles));
    const wgeo = new THREE.PlaneGeometry(iw, ih).rotateX(-Math.PI / 2);
    scaleUV(wgeo, iw / T.METERS.water, ih / T.METERS.water);
    g.add(mesh(wgeo, water('#1d5d6e', 0.72), 0, 0.09, 0));
    // хромированная лестница
    const steel = plain('#c9cdcf', 0.18, 1);
    for (const x of [-0.22, 0.22]) {
      const curve = new THREE.CatmullRomCurve3([V(x, 0.02, -o.h / 2 + rim + 0.16), V(x, 0.6, -o.h / 2 + rim + 0.12), V(x, 0.82, -o.h / 2 + rim * 0.5), V(x, 0.55, -o.h / 2 - 0.08), V(x, ch, -o.h / 2 - 0.12)]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.02, 8), steel));
    }
    return g;
  },

  pond(o) {
    const g = new THREE.Group();
    const rand = seededRandom(o.id + 'pondfx');
    const outline = pondOutline(o);
    const toShape = (k) => new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x * k, -p.y * k)));
    // влажная почва по берегу, тёмное дно и вода
    const shore = mesh(new THREE.ShapeGeometry(toShape(1.08), 6).rotateX(-Math.PI / 2), surface(T.soil, { normal: 2, roughness: 0.7 }), 0, 0.006, 0);
    worldUV(shore.geometry, 0.6);
    g.add(shore);
    const wgeo = new THREE.ShapeGeometry(toShape(1), 6).rotateX(-Math.PI / 2);
    worldUV(wgeo, T.METERS.water);
    g.add(mesh(wgeo, water('#22352b', 0.9), 0, 0.035, 0));
    // камни по берегу
    const rockMat = surface(T.stone, { normal: 3, roughness: 0.85 });
    const per = Math.max(1, Math.round(0.28 / ((Math.PI * (o.w + o.h) / 2) / outline.length)));
    for (let i = 0; i < outline.length; i += per) {
      const p = outline[i];
      const rs = 0.1 + rand() * 0.15;
      const r = mesh(rockGeometry(o.id + 'r' + i, 1), rockMat, p.x * 1.03, rs * 0.25, p.y * 1.03);
      r.scale.set(rs * 1.3, rs * 0.65, rs);
      r.rotation.y = rand() * 6.3;
      g.add(r);
    }
    // камыш в двух местах берега
    const reeds = new Cards();
    for (let c = 0; c < 2; c++) {
      const p = outline[Math.floor(rand() * outline.length)];
      for (let k = 0; k < 5; k++) {
        reeds.cross(V(p.x * 0.92 + (rand() - 0.5) * 0.3, 0.02, p.y * 0.92 + (rand() - 0.5) * 0.3), 0.45, 0.9 + rand() * 0.4, rand() * 3, 0.85 + rand() * 0.2);
      }
    }
    g.add(reeds.mesh(leafMaterial(T.plantCard('reed'))));
    // кувшинки
    const padMat = plain('#34502c', 0.5);
    for (let k = 0; k < 4; k++) {
      const p = outline[Math.floor(rand() * outline.length)];
      const t = 0.3 + rand() * 0.35;
      const pad = mesh(new THREE.CircleGeometry(0.13 + rand() * 0.07, 18, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2), padMat, p.x * t, 0.04, p.y * t);
      pad.rotation.y = rand() * 6.3;
      g.add(pad);
    }
    return g;
  },

  fountain(o) {
    const g = new THREE.Group();
    const k = clamp(Math.min(o.w, o.h) / 2, 0.5, 1.5);
    const stoneMat = surface(T.travertine, { normal: 3, roughness: 0.8 });
    const lathe = (pts) => {
      const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 48);
      return scaleUV(geo, 6, 1);
    };
    // чаша внизу (растягивается по размеру объекта)
    const basin = mesh(lathe([[0, 0], [0.5, 0], [0.5, 0.3 * k], [0.47, 0.35 * k], [0.44, 0.35 * k], [0.43, 0.1 * k], [0, 0.1 * k]]), stoneMat);
    basin.scale.set(o.w, 1, o.h);
    g.add(basin);
    const bw = mesh(new THREE.CircleGeometry(0.43, 48).rotateX(-Math.PI / 2), water('#2f6f7c', 0.8));
    bw.position.y = 0.29 * k;
    bw.scale.set(o.w, 1, o.h);
    g.add(bw);
    // постамент и верхняя чаша (масштаб k)
    const top = new THREE.Group();
    top.scale.setScalar(k);
    top.add(mesh(lathe([[0.14, 0.1], [0.11, 0.18], [0.075, 0.3], [0.065, 0.72], [0.1, 0.8], [0.06, 0.86], [0, 0.86]]), stoneMat));
    top.add(mesh(lathe([[0, 0.84], [0.12, 0.86], [0.34, 0.95], [0.37, 1], [0.34, 1.0], [0.12, 0.93], [0, 0.93]]), stoneMat));
    top.add(mesh(new THREE.CircleGeometry(0.33, 40).rotateX(-Math.PI / 2), water('#2f6f7c', 0.8), 0, 0.985, 0));
    top.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.18, 12), stoneMat, 0, 1.06, 0));
    top.add(mesh(new THREE.CylinderGeometry(0.008, 0.02, 0.3, 8), water('#dcecef', 0.45), 0, 1.3, 0));
    // струи, стекающие с края верхней чаши
    const curtain = new THREE.CylinderGeometry(0.37, 0.41, 0.7, 40, 1, true);
    scaleUV(curtain, 4, 1);
    top.add(mesh(curtain, water('#d6e8ea', 0.22, { side: THREE.DoubleSide }), 0, 0.64, 0));
    g.add(top);
    return g;
  },

  gazebo(o) {
    const g = new THREE.Group();
    const wood = surface(T.wood, { normal: 2.5, roughness: 0.8 });
    const darkWood = surface(T.wood, { normal: 2.5, roughness: 0.8, color: '#8a7a68' });
    const stoneMat = surface(T.stone, { normal: 3, roughness: 0.9 });
    const postH = 2.3;
    const base = 0.18;
    g.add(box(o.w + 0.1, 0.1, o.h + 0.1, stoneMat, 0, 0.05, 0, 0.6));
    g.add(box(o.w, 0.08, o.h, wood, 0, 0.14, 0));
    const px = o.w / 2 - 0.1, pz = o.h / 2 - 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.14, postH, 0.14, wood, sx * px, base + postH / 2, sz * pz));

    // перила: три стороны целиком, спереди — вход посередине
    const railing = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.2) return;
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const bar = (h, t, y) => g.add(alongX ? box(len, h, t, darkWood, cx, y, cz) : box(t, h, len, darkWood, cx, y, cz));
      bar(0.06, 0.08, base + 0.95);
      bar(0.05, 0.05, base + 0.25);
      for (let s = 0.14; s < len - 0.05; s += 0.14) {
        const t = s / len;
        g.add(box(0.035, 0.66, 0.035, darkWood, x0 + (x1 - x0) * t, base + 0.6, z0 + (z1 - z0) * t));
      }
    };
    railing(-px, -pz, px, -pz);
    railing(-px, -pz, -px, pz);
    railing(px, -pz, px, pz);
    const gap = Math.min(1.1, o.w * 0.4) / 2;
    railing(-px, pz, -gap, pz);
    railing(gap, pz, px, pz);

    // балки по верху
    const beamY = base + postH + 0.06;
    g.add(box(o.w, 0.14, 0.12, darkWood, 0, beamY, -pz), box(o.w, 0.14, 0.12, darkWood, 0, beamY, pz));
    g.add(box(0.12, 0.14, o.h, darkWood, -px, beamY, 0), box(0.12, 0.14, o.h, darkWood, px, beamY, 0));

    // четырёхскатная крыша из гибкой черепицы
    const roofMat = surface(T.shingles, { normal: 3, roughness: 0.9, side: THREE.DoubleSide });
    const ov = 0.3;
    const ex = o.w / 2 + ov, ez = o.h / 2 + ov;
    const ey = beamY + 0.05;
    const roofH = clamp(Math.max(o.w, o.h) * 0.42, 0.9, 2.2);
    const apex = V(0, ey + roofH, 0);
    const corners = [V(-ex, ey, ez), V(ex, ey, ez), V(ex, ey, -ez), V(-ex, ey, -ez)];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const L = a.distanceTo(b);
      const slant = V().lerpVectors(a, b, 0.5).distanceTo(apex);
      g.add(polygon([a, b, apex], [[0, 0], [L, 0], [L / 2, slant]], roofMat));
      // карнизная доска
      const mid = V().lerpVectors(a, b, 0.5);
      const fascia = Math.abs(a.x - b.x) > 0.01 ? box(L, 0.1, 0.04, darkWood, mid.x, ey - 0.03, mid.z) : box(0.04, 0.1, L, darkWood, mid.x, ey - 0.03, mid.z);
      g.add(fascia);
    }
    g.add(mesh(new THREE.ConeGeometry(0.06, 0.3, 8), darkWood, 0, apex.y + 0.1, 0));
    return g;
  },

  shed(o) {
    const g = new THREE.Group();
    const W = o.w * 0.9, D = o.h * 0.9, wallH = 2.1, base = 0.12;
    const sidingMat = surface(T.siding, { normal: 3, roughness: 0.85 });
    const trim = plain('#d5d0c4', 0.8);
    const wood = surface(T.wood, { normal: 2.5, roughness: 0.8 });
    g.add(box(W + 0.12, base, D + 0.12, surface(T.stone, { normal: 3, roughness: 0.9 }), 0, base / 2, 0, 0.6));
    g.add(box(W, wallH, D, sidingMat, 0, base + wallH / 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, wallH, 0.08, trim, sx * W / 2, base + wallH / 2, sz * D / 2));

    // фронтоны
    const top = base + wallH;
    const rh = Math.min(1.3, W * 0.38);
    for (const side of [1, -1]) {
      const shape = new THREE.Shape([new THREE.Vector2(-W / 2, 0), new THREE.Vector2(W / 2, 0), new THREE.Vector2(0, rh)]);
      const gable = mesh(new THREE.ShapeGeometry(shape), sidingMat, 0, top, side * D / 2);
      if (side < 0) gable.rotation.y = Math.PI;
      g.add(gable);
    }

    // двускатная крыша
    const roofMat = surface(T.shingles, { normal: 3, roughness: 0.9, side: THREE.DoubleSide });
    const ov = 0.25;
    const ez = D / 2 + ov;
    const ridge = V(0, top + rh + 0.04, 0);
    for (const sx of [-1, 1]) {
      const ex = sx * (W / 2 + ov);
      const ey = top - ov * (rh / (W / 2));
      const slant = Math.hypot(W / 2 + ov, ridge.y - ey);
      g.add(polygon([V(ex, ey, -ez), V(ex, ey, ez), V(0, ridge.y, ez), V(0, ridge.y, -ez)], [[0, 0], [ez * 2, 0], [ez * 2, slant], [0, slant]], roofMat));
      g.add(box(0.04, 0.12, ez * 2, wood, ex, ey - 0.04, 0));
    }
    g.add(box(0.12, 0.06, ez * 2, plain('#2e2724', 0.9), 0, ridge.y + 0.01, 0));

    // дверь и окно
    const doorW = Math.min(0.9, W * 0.32);
    g.add(box(doorW + 0.1, 1.95, 0.04, trim, -W * 0.15, base + 0.975, D / 2 + 0.02));
    g.add(box(doorW, 1.85, 0.05, wood, -W * 0.15, base + 0.925, D / 2 + 0.03));
    g.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), plain('#2a2a28', 0.35, 0.8), -W * 0.15 + doorW * 0.38, base + 0.95, D / 2 + 0.07));
    if (D > 1.2) {
      const glass = material('glass', () => new THREE.MeshPhysicalMaterial({ color: '#27343a', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.6 }));
      g.add(box(0.05, 0.8, 0.9, trim, W / 2 + 0.02, base + 1.35, 0));
      g.add(box(0.04, 0.68, 0.78, glass, W / 2 + 0.035, base + 1.35, 0));
      g.add(box(0.05, 0.68, 0.04, trim, W / 2 + 0.05, base + 1.35, 0), box(0.05, 0.04, 0.78, trim, W / 2 + 0.05, base + 1.35, 0));
    }
    return g;
  },

  bench(o) {
    const g = new THREE.Group();
    const wood = surface(T.wood, { normal: 2, roughness: 0.7 });
    const iron = plain('#252624', 0.45, 0.6);
    const seatD = o.h * 0.68;
    const n = 4;
    const slat = (seatD / n) * 0.85;
    // доски сиденья: волокна вдоль длины скамейки
    for (let i = 0; i < n; i++) {
      const geo = worldUV(new THREE.BoxGeometry(slat, 0.035, o.w), 1).rotateY(Math.PI / 2);
      g.add(mesh(geo, wood, 0, 0.43, o.h / 2 - 0.06 - slat / 2 - i * (seatD / n)));
    }
    // спинка
    const back = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const geo = worldUV(new THREE.BoxGeometry(0.075, 0.025, o.w), 1).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      back.add(mesh(geo, wood, 0, 0.12 + i * 0.11, 0));
    }
    back.position.set(0, 0.42, -o.h / 2 + 0.07);
    back.rotation.x = -0.18;
    g.add(back);
    // чугунные боковины
    for (const sx of [-1, 1]) {
      const x = sx * (o.w / 2 - 0.08);
      g.add(box(0.05, 0.43, 0.05, iron, x, 0.215, o.h / 2 - 0.08));
      const leg = box(0.05, 0.86, 0.05, iron, x, 0.43, -o.h / 2 + 0.1);
      leg.rotation.x = -0.12;
      g.add(leg);
      g.add(box(0.04, 0.05, seatD + 0.05, iron, x, 0.4, o.h / 2 - 0.06 - seatD / 2));
      g.add(box(0.05, 0.04, seatD * 0.9, iron, x, 0.66, o.h / 2 - 0.06 - seatD * 0.45));
      g.add(box(0.04, 0.24, 0.04, iron, x, 0.54, o.h / 2 - 0.1));
    }
    return g;
  },

  lamp(o) {
    const g = new THREE.Group();
    const k = clamp(Math.min(o.w, o.h) / 0.4, 0.6, 2);
    const iron = plain('#222321', 0.4, 0.7);
    const lantern = new THREE.Group();
    lantern.scale.setScalar(k);
    lantern.add(mesh(new THREE.LatheGeometry([[0, 0], [0.12, 0], [0.11, 0.06], [0.06, 0.1], [0.04, 0.26], [0, 0.26]].map(([r, y]) => new THREE.Vector2(r, y)), 24), iron));
    lantern.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.9, 12), iron, 0, 1.2, 0));
    const glass = material('lampGlass', () => new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf87', emissiveIntensity: 1.3, roughness: 0.3 }));
    lantern.add(mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), glass, 0, 2.27, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lantern.add(box(0.02, 0.26, 0.02, iron, sx * 0.085, 2.27, sz * 0.085));
    lantern.add(box(0.22, 0.03, 0.22, iron, 0, 2.14, 0));
    const cap = mesh(new THREE.ConeGeometry(0.17, 0.14, 4), iron, 0, 2.47, 0);
    cap.rotation.y = Math.PI / 4;
    lantern.add(cap);
    g.add(lantern);
    if (lampLights < 6) {
      lampLights++;
      const light = new THREE.PointLight('#ffcf8a', 3, 7, 2);
      light.position.y = 2.27 * k;
      g.add(light);
    }
    return g;
  },
};

// ======================================================================
// Газон: травяное покрытие, бордюр и пучки травы (кроме мест под дорожками, водой и постройками)
// ======================================================================
const HARD = new Set(['path', 'pool', 'pond', 'fountain', 'gazebo', 'shed', 'flowerbed', 'hedge']);

export function buildLawn(state) {
  const { width: W, length: L } = state;
  const g = new THREE.Group();
  const size = Math.max(W, L);

  const lawnGeo = worldUV(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2), T.METERS.grass);
  const lawn = mesh(lawnGeo, surface(T.grass, { normal: 1.5, roughness: 0.97 }), 0, 0, 0);
  lawn.userData.noShadow = true;
  g.add(lawn);

  // приглушённая «дальняя» трава вокруг участка
  const aroundGeo = worldUV(new THREE.PlaneGeometry(size * 40, size * 40).rotateX(-Math.PI / 2), 3);
  const around = mesh(aroundGeo, surface(T.grass, { normal: 1, roughness: 1, color: '#c3c7ae' }), 0, -0.03, 0);
  around.userData.noShadow = true;
  g.add(around);

  // каменный бордюр по периметру
  const kerb = surface(T.stone, { normal: 3, roughness: 0.9, color: '#d8d6ce' });
  const t = 0.1;
  g.add(
    box(W + t * 2, 0.06, t, kerb, 0, 0.03, -L / 2 - t / 2, 0.6),
    box(W + t * 2, 0.06, t, kerb, 0, 0.03, L / 2 + t / 2, 0.6),
    box(t, 0.06, L, kerb, -W / 2 - t / 2, 0.03, 0, 0.6),
    box(t, 0.06, L, kerb, W / 2 + t / 2, 0.03, 0, 0.6),
  );

  // пучки травы
  const rand = seededRandom('lawn' + W + 'x' + L);
  const blockers = state.objects.filter((o) => HARD.has(CATALOG[o.type].kind));
  const count = Math.min(16000, Math.round(W * L * 22));
  const cards = new Cards();
  for (let i = 0; i < count; i++) {
    const x = rand() * W;
    const y = rand() * L;
    if (blockers.some((o) => pointInObject(o, x, y, 0.1))) continue;
    cards.cross(V(x - W / 2, 0, y - L / 2), 0.14 + rand() * 0.1, 0.06 + rand() * 0.08, rand() * 3, 0.85 + rand() * 0.15);
  }
  const tufts = cards.mesh(leafMaterial(T.plantCard('tuft')));
  tufts.userData.noShadow = true;
  g.add(tufts);
  return g;
}
