import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG } from './catalog.js';
import { BUILDERS, buildLawn, animate, resetBuild, setAnisotropy } from './models3d.js';
import { skyPanorama } from './textures.js';

// Положение солнца: мягкий послеполуденный свет
const SUN_AZIMUTH = 0.7;
const SUN_ELEVATION = 0.75;

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
    // Киношная тональная кривая: мягкие светлые участки, без «кислотных» цветов
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.container.appendChild(this.renderer.domElement);
    setAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();

    // Небо и рассеянный свет от него (image-based lighting)
    const skyTex = new THREE.CanvasTexture(skyPanorama(SUN_AZIMUTH, SUN_ELEVATION));
    skyTex.mapping = THREE.EquirectangularReflectionMapping;
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(skyTex).texture;
    this.scene.environmentIntensity = 0.65;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.47; // не опускаемся ниже уровня земли

    this.scene.add(new THREE.HemisphereLight('#dfe8f2', '#4a4a32', 0.35));
    this.sun = new THREE.DirectionalLight('#fff0dc', 2.6);
    this.sun.castShadow = true;
    const shadowSize = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.garden = new THREE.Group();
    this.scene.add(this.garden);

    this.clock = new THREE.Clock();
    new ResizeObserver(() => this.resize()).observe(this.container);
    this.ready = true;
  }

  show(state) {
    if (!this.ready) this.init();
    this.build(state);
    this.resize();
    if (!this.running) {
      this.running = true;
      this.clock.getDelta();
      this.loop();
    }
  }

  hide() {
    this.running = false;
  }

  loop() {
    if (!this.running) return;
    animate(this.clock.getDelta());
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
    resetBuild();

    const { width: W, length: L } = state;
    const size = Math.max(W, L);
    this.garden.add(buildLawn(state));

    for (const o of state.objects) {
      const def = CATALOG[o.type];
      const g = BUILDERS[def.kind](o, def);
      g.position.set(o.x - W / 2, 0, o.y - L / 2);
      g.rotation.y = (-o.rotation * Math.PI) / 180;
      this.garden.add(g);
    }

    this.garden.traverse((m) => {
      if (!m.isMesh) return;
      m.receiveShadow = true;
      m.castShadow = !m.material.transparent && !m.userData.noShadow;
    });

    // Дымка к горизонту: дальний план мягко растворяется
    this.scene.fog = new THREE.Fog('#d3d9d4', size * 1.1, size * 4);

    // Солнце и тени под размер участка
    const d = size * 1.3;
    this.sun.position.set(Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION) * d, Math.sin(SUN_ELEVATION) * d, Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION) * d);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.75;
    cam.right = cam.top = size * 0.75;
    cam.near = 0.5;
    cam.far = d * 2.5;
    cam.updateProjectionMatrix();

    // Камеру ставим заново только при смене размеров участка
    const key = `${W}x${L}`;
    if (key !== this.lastSize) {
      this.lastSize = key;
      this.camera.position.set(size * 0.3, size * 0.4, size * 1.0);
      this.controls.target.set(0, 0, 0);
      this.controls.maxDistance = size * 3;
      this.controls.update();
    }
  }
}
