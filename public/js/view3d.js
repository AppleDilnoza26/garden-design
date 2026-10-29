import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, flowerDots, stonePositions, accentDots, seededRandom } from './catalog.js';

// Материалы кешируем по цвету и параметрам, чтобы не создавать их заново при каждой пересборке
const materials = {};
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!materials[key]) materials[key] = new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  return materials[key];
}
const flat = (color) => mat(color, { flatShading: true });
const WATER = { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 };

// 3D-визуализация сада на Three.js
export class View3D {
  constructor(container) {
    this.container = container;
    this.ready = false;
    this.running = false;
    this.lastSize = '';
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eef3e6');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.44; // не опускаемся ниже уровня земли

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7a8f5a', 1.4));
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.sun, this.sun.target);

    this.garden = new THREE.Group();
    this.scene.add(this.garden);

    new ResizeObserver(() => this.resize()).observe(this.container);
    this.ready = true;
  }

  show(state) {
    if (!this.ready) this.init();
    this.build(state);
    this.resize();
    if (!this.running) {
      this.running = true;
      this.loop();
    }
  }

  hide() {
    this.running = false;
  }

  loop() {
    if (!this.running) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.loop());
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Полностью пересобираем сцену из состояния проекта
  build(state) {
    this.garden.traverse((o) => o.geometry && o.geometry.dispose());
    this.garden.clear();

    const { width: W, length: L } = state;
    const size = Math.max(W, L);

    const around = box(size * 6, 0.1, size * 6, mat('#e3ead6'));
    around.position.y = -0.16;
    const border = box(W + 0.6, 0.12, L + 0.6, mat('#d9c7a5'));
    border.position.y = -0.07;
    const grass = box(W, 0.1, L, mat('#86b45f'));
    grass.position.y = -0.05;
    this.garden.add(around, border, grass);

    for (const o of state.objects) {
      const def = CATALOG[o.type];
      const g = BUILDERS[def.kind](o, def);
      g.position.set(o.x - W / 2, 0, o.y - L / 2);
      g.rotation.y = (-o.rotation * Math.PI) / 180;
      g.traverse((m) => { if (m.isMesh) { m.castShadow = !m.material.transparent; m.receiveShadow = true; } });
      this.garden.add(g);
    }

    // Солнце и тени под размер участка
    this.sun.position.set(size * 0.6, size * 1.2, size * 0.4);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.8;
    cam.right = cam.top = size * 0.8;
    cam.far = size * 4;
    cam.updateProjectionMatrix();

    // Камеру ставим заново только при смене размеров участка
    const key = `${W}x${L}`;
    if (key !== this.lastSize) {
      this.lastSize = key;
      this.camera.position.set(size * 0.25, size * 0.9, size * 1.3);
      this.controls.target.set(0, 0, 0);
      this.controls.maxDistance = size * 4;
      this.controls.update();
    }
  }
}

// ---------- Вспомогательные функции ----------
function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.receiveShadow = true;
  return m;
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  return m;
}

// Цилиндр с эллипсом в основании (w × d)
function ellipseCylinder(w, h, d, material, y, segments = 32) {
  const m = mesh(new THREE.CylinderGeometry(0.5, 0.5, h, segments), material, 0, y, 0);
  m.scale.set(w, 1, d);
  return m;
}

// Точка на поверхности эллипсоида с полуосями rx, ry, rz (направление берём из случайной точки)
function onSurface(d, rx, ry, rz) {
  const v = new THREE.Vector3(d.x, d.z - 0.3, d.y).normalize();
  return { x: v.x * rx, y: v.y * ry, z: v.z * rz };
}

// ---------- Модели объектов ----------
const BUILDERS = {
  tree(o, def) {
    const g = new THREE.Group();
    const r = Math.min(o.w, o.h) / 2;
    const trunkH = (def.tall ? 2 : 1.2) + r * 0.6;
    g.add(mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.12, trunkH, 8), mat(def.trunk), 0, trunkH / 2, 0));
    const crownY = trunkH + r * 0.55;
    const crownH = r * (def.tall ? 1.3 : 0.95);
    const crown = mesh(new THREE.IcosahedronGeometry(1, 1), flat(def.crown), 0, crownY, 0);
    crown.scale.set(o.w / 2, crownH, o.h / 2);
    g.add(crown);
    if (def.fruit) {
      const geo = new THREE.SphereGeometry(Math.max(0.07, r * 0.07), 8, 6);
      for (const d of accentDots(o, 14)) {
        const p = onSurface(d, o.w / 2, crownH, o.h / 2);
        g.add(mesh(geo, mat(def.fruit), p.x, crownY + p.y, p.z));
      }
    }
    return g;
  },

  conifer(o, def) {
    const g = new THREE.Group();
    const r = Math.min(o.w, o.h) / 2;
    const height = r * 2 * def.heightK;
    const trunkH = height * 0.12;
    g.add(mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.1, trunkH, 6), mat('#6e4c30'), 0, trunkH / 2, 0));
    // три яруса конусов
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.28;
      const tierH = height * 0.45;
      const cone = mesh(new THREE.ConeGeometry(0.5, 1, 8), flat(def.color), 0, trunkH + i * height * 0.26 + tierH / 2, 0);
      cone.scale.set(o.w * f, tierH, o.h * f);
      g.add(cone);
    }
    return g;
  },

  shrub(o, def) {
    const g = new THREE.Group();
    const r = Math.min(o.w, o.h);
    const bush = mesh(new THREE.IcosahedronGeometry(1, 1), flat(def.color), 0, r * 0.3, 0);
    bush.scale.set(o.w / 2, r * 0.35, o.h / 2);
    g.add(bush);
    if (def.berry) {
      const geo = new THREE.SphereGeometry(Math.max(0.05, r * 0.06), 8, 6);
      for (const d of accentDots(o, 12)) {
        const p = onSurface(d, o.w / 2, r * 0.35, o.h / 2);
        g.add(mesh(geo, mat(def.berry), p.x, r * 0.3 + Math.abs(p.y), p.z));
      }
    }
    return g;
  },

  hedge(o, def) {
    const g = new THREE.Group();
    const height = Math.min(1.8, Math.max(0.8, Math.min(o.w, o.h) * 1.4));
    g.add(mesh(new THREE.BoxGeometry(o.w, height, o.h, 4, 2, 2), flat(def.color), 0, height / 2, 0));
    return g;
  },

  flowerbed(o, def) {
    const g = new THREE.Group();
    if (def.shape === 'circle') g.add(ellipseCylinder(o.w, 0.15, o.h, mat('#7d5f43'), 0.075));
    else g.add(mesh(new THREE.BoxGeometry(o.w, 0.15, o.h), mat('#7d5f43'), 0, 0.075, 0));
    const tall = o.type === 'flower_lavender' || o.type === 'flower_tulips';
    const geo = tall ? new THREE.CapsuleGeometry(0.05, 0.12, 2, 6) : new THREE.SphereGeometry(0.08, 8, 6);
    for (const d of flowerDots(o)) g.add(mesh(geo, mat(d.color), d.x, tall ? 0.32 : 0.25, d.y));
    return g;
  },

  path(o, def) {
    const g = new THREE.Group();
    if (def.pattern === 'stones') {
      const geo = new THREE.CylinderGeometry(1, 1, 0.06, 12);
      for (const s of stonePositions(o)) {
        const st = mesh(geo, flat(def.fill), s.x, 0.03, s.y);
        st.scale.set(s.r, 1, s.r * 0.85);
        g.add(st);
      }
      return g;
    }
    const thick = def.pattern === 'boards' ? 0.12 : 0.04;
    g.add(mesh(new THREE.BoxGeometry(o.w, thick, o.h), mat(def.fill), 0, thick / 2, 0));
    if (def.pattern === 'boards') {
      // щели между досками
      const geo = new THREE.BoxGeometry(0.015, 0.01, o.h);
      for (let x = -o.w / 2 + 0.2; x < o.w / 2 - 0.05; x += 0.2) g.add(mesh(geo, mat(def.line), x, thick + 0.002, 0));
    }
    return g;
  },

  pool(o) {
    const g = new THREE.Group();
    const rim = Math.min(0.3, Math.min(o.w, o.h) * 0.15);
    const stone = mat('#ece2cf');
    const h = 0.2;
    g.add(mesh(new THREE.BoxGeometry(o.w, h, rim), stone, 0, h / 2, -o.h / 2 + rim / 2));
    g.add(mesh(new THREE.BoxGeometry(o.w, h, rim), stone, 0, h / 2, o.h / 2 - rim / 2));
    g.add(mesh(new THREE.BoxGeometry(rim, h, o.h - rim * 2), stone, -o.w / 2 + rim / 2, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(rim, h, o.h - rim * 2), stone, o.w / 2 - rim / 2, h / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(o.w - rim * 2, 0.02, o.h - rim * 2), mat('#2f86ad'), 0, 0.01, 0));
    g.add(mesh(new THREE.BoxGeometry(o.w - rim * 2, 0.14, o.h - rim * 2), mat('#6cc4e4', WATER), 0, 0.09, 0));
    return g;
  },

  pond(o) {
    const g = new THREE.Group();
    g.add(ellipseCylinder(o.w, 0.06, o.h, mat('#4f9fbf', WATER), 0.03));
    // камни по краю
    const rand = seededRandom(o.id);
    const count = Math.max(8, Math.round((Math.PI * (o.w + o.h)) / 2 / 0.35));
    const geo = new THREE.DodecahedronGeometry(0.18, 0);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const s = mesh(geo, flat('#a9a294'), Math.cos(a) * o.w / 2, 0.06, Math.sin(a) * o.h / 2);
      s.scale.set(1 + rand() * 0.5, 0.6, 1 + rand() * 0.5);
      g.add(s);
    }
    // кувшинки
    const pad = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 12);
    for (const d of accentDots(o, 4)) g.add(mesh(pad, mat('#6fa55e'), d.x * o.w * 0.9, 0.07, d.y * o.h * 0.9));
    return g;
  },

  fountain(o) {
    const g = new THREE.Group();
    const stone = mat('#d8cfbf');
    const k = Math.min(1.5, Math.max(0.5, Math.min(o.w, o.h) / 2)); // масштаб по высоте
    g.add(ellipseCylinder(o.w, 0.45 * k, o.h, stone, 0.225 * k));
    g.add(ellipseCylinder(o.w * 0.86, 0.05, o.h * 0.86, mat('#7cc6e0', WATER), 0.43 * k));
    g.add(mesh(new THREE.CylinderGeometry(0.08 * k, 0.12 * k, 0.9 * k, 12), stone, 0, 0.9 * k, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.4 * k, 0.25 * k, 0.15 * k, 20), stone, 0, 1.4 * k, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.36 * k, 0.36 * k, 0.03, 20), mat('#7cc6e0', WATER), 0, 1.47 * k, 0));
    g.add(mesh(new THREE.ConeGeometry(0.06 * k, 0.5 * k, 8), mat('#bfe6f3', { ...WATER, opacity: 0.7 }), 0, 1.72 * k, 0));
    return g;
  },

  gazebo(o) {
    const g = new THREE.Group();
    const wood = mat('#b88a5c');
    g.add(mesh(new THREE.BoxGeometry(o.w, 0.15, o.h), wood, 0, 0.075, 0));
    const postH = 2.3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.15, postH, 0.15), wood, sx * (o.w / 2 - 0.15), postH / 2 + 0.15, sz * (o.h / 2 - 0.15)));
      }
    }
    // Четырёхскатная крыша: конус с 4 гранями, растянутый под размер беседки
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15 / Math.SQRT2, 1, 4), flat('#7a5634'));
    roof.rotation.y = Math.PI / 4;
    const roofWrap = new THREE.Group();
    roofWrap.add(roof);
    roofWrap.scale.set(o.w, 1.2, o.h);
    roofWrap.position.y = postH + 0.15 + 0.6;
    g.add(roofWrap);
    return g;
  },

  shed(o) {
    const g = new THREE.Group();
    const wallH = 2.1;
    g.add(mesh(new THREE.BoxGeometry(o.w * 0.92, wallH, o.h * 0.92), mat('#efe6d4'), 0, wallH / 2, 0));
    // дверь на передней стене
    g.add(mesh(new THREE.BoxGeometry(Math.min(0.9, o.w * 0.3), 1.8, 0.04), mat('#8a6440'), 0, 0.9, o.h * 0.46 + 0.02));
    // двускатная крыша: треугольник, вытянутый вдоль длины
    const shape = new THREE.Shape();
    shape.moveTo(-o.w / 2, 0);
    shape.lineTo(o.w / 2, 0);
    shape.lineTo(0, Math.min(1.4, o.w * 0.4));
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: o.h, bevelEnabled: false });
    roofGeo.translate(0, 0, -o.h / 2);
    g.add(mesh(roofGeo, flat('#9c5b45'), 0, wallH, 0));
    return g;
  },

  bench(o) {
    const g = new THREE.Group();
    const wood = mat('#b88a5c');
    const dark = mat('#5a4a3a');
    g.add(mesh(new THREE.BoxGeometry(o.w, 0.06, o.h * 0.7), wood, 0, 0.45, o.h * 0.15));
    g.add(mesh(new THREE.BoxGeometry(o.w, 0.4, 0.05), wood, 0, 0.75, -o.h / 2 + 0.05));
    const legGeo = new THREE.BoxGeometry(0.06, 0.45, 0.06);
    for (const sx of [-1, 1]) {
      for (const z of [-o.h / 2 + 0.05, o.h / 2 - 0.08]) {
        g.add(mesh(legGeo, dark, sx * (o.w / 2 - 0.1), 0.225, z));
      }
    }
    return g;
  },

  lamp(o) {
    const g = new THREE.Group();
    const r = Math.min(o.w, o.h) / 2;
    const metal = mat('#3d3f3a');
    g.add(mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.8, 0.12, 12), metal, 0, 0.06, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 2, 8), metal, 0, 1.06, 0));
    g.add(mesh(new THREE.SphereGeometry(Math.max(0.12, r * 0.6), 16, 12), mat('#ffd86b', { emissive: '#ffcc55', emissiveIntensity: 0.8 }), 0, 2.15, 0));
    return g;
  },
};
