import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { flowerDots } from './catalog.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

const MATERIALS = {
  around: mat('#e3ead6'),
  border: mat('#d9c7a5'),
  grass: mat('#86b45f'),
  trunk: mat('#7a5634'),
  crown: mat('#4f8a4b', { flatShading: true }),
  shrub: mat('#6f9a4a', { flatShading: true }),
  soil: mat('#7d5f43'),
  path: mat('#e3d3b0'),
  wood: mat('#b88a5c'),
  roof: mat('#7a5634', { flatShading: true }),
};
const flowerMaterials = {};

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

    const around = box(size * 6, 0.1, size * 6, MATERIALS.around);
    around.position.y = -0.16;
    const border = box(W + 0.6, 0.12, L + 0.6, MATERIALS.border);
    border.position.y = -0.07;
    const grass = box(W, 0.1, L, MATERIALS.grass);
    grass.position.y = -0.05;
    this.garden.add(around, border, grass);

    for (const o of state.objects) {
      const g = BUILDERS[o.type](o);
      g.position.set(o.x - W / 2, 0, o.y - L / 2);
      g.rotation.y = (-o.rotation * Math.PI) / 180;
      g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
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

function box(w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.receiveShadow = true;
  return m;
}

const BUILDERS = {
  tree(o) {
    const g = new THREE.Group();
    const r = Math.min(o.w, o.h) / 2;
    const trunkH = 1.2 + r * 0.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.09, r * 0.12, trunkH, 8), MATERIALS.trunk);
    trunk.position.y = trunkH / 2;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), MATERIALS.crown);
    crown.scale.set(o.w / 2, r * 0.95, o.h / 2);
    crown.position.y = trunkH + r * 0.55;
    g.add(trunk, crown);
    return g;
  },

  shrub(o) {
    const g = new THREE.Group();
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), MATERIALS.shrub);
    bush.scale.set(o.w / 2, Math.min(o.w, o.h) * 0.35, o.h / 2);
    bush.position.y = Math.min(o.w, o.h) * 0.3;
    g.add(bush);
    return g;
  },

  flower(o) {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.15, o.h), MATERIALS.soil);
    soil.position.y = 0.075;
    g.add(soil);
    const geo = new THREE.SphereGeometry(0.08, 8, 6);
    for (const d of flowerDots(o)) {
      if (!flowerMaterials[d.color]) flowerMaterials[d.color] = mat(d.color);
      const f = new THREE.Mesh(geo, flowerMaterials[d.color]);
      f.position.set(d.x, 0.25, d.y);
      g.add(f);
    }
    return g;
  },

  path(o) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.04, o.h), MATERIALS.path);
    p.position.y = 0.02;
    g.add(p);
    return g;
  },

  gazebo(o) {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.15, o.h), MATERIALS.wood);
    floor.position.y = 0.075;
    g.add(floor);

    const postH = 2.3;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, postH, 0.15), MATERIALS.wood);
        post.position.set(sx * (o.w / 2 - 0.15), postH / 2 + 0.15, sz * (o.h / 2 - 0.15));
        g.add(post);
      }
    }

    // Четырёхскатная крыша: конус с 4 гранями, растянутый под размер беседки
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.15 / Math.SQRT2, 1, 4), MATERIALS.roof);
    roof.rotation.y = Math.PI / 4;
    const roofWrap = new THREE.Group();
    roofWrap.add(roof);
    roofWrap.scale.set(o.w, 1.2, o.h);
    roofWrap.position.y = postH + 0.15 + 0.6;
    g.add(roofWrap);
    return g;
  },
};
