import * as THREE from 'three';
import { animate } from 'animejs';
import { rasterSize } from './raster.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PRELOAD_BYTES = 24 * 1024 ** 2;

// An actual flexible sheet: 64 columns follow an arc whose curvature relaxes
// at both ends of a turn. Front and back keep independent PDF textures.
export class BookRenderer {
  constructor(host, document, page, onChange, onError) {
    this.host = host;
    this.document = document;
    this.onChange = onChange;
    this.onError = onError;
    this.page = page;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.textures = new Map();
    this.pendingTextures = new Map();
    this.retiredTextures = new Set();
    this.neededPages = new Set();
    this.preloadVersion = 0;
    this.version = 0;
    this.disposed = false;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', 'PDF book. Drag a page to turn; drag empty space or use the middle mouse button to pan; scroll to zoom.');
    host.append(this.canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 10000);
    this.camera.position.z = 5000;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.scene.add(new THREE.AmbientLight(0xffffff, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(-400, 600, 1000);
    this.scene.add(light);
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.left = this.flatPage();
    this.right = this.flatPage();
    this.sheetGeometry = new THREE.PlaneGeometry(1, 1, 64, 12);
    // Matte paper only needs diffuse lighting. Avoid the physically based
    // material's global specular lookup texture and its per-renderer listeners.
    this.front = new THREE.Mesh(this.sheetGeometry, new THREE.MeshLambertMaterial({ side: THREE.FrontSide }));
    this.back = new THREE.Mesh(this.sheetGeometry, new THREE.MeshLambertMaterial({ side: THREE.BackSide }));
    this.front.frustumCulled = this.back.frustumCulled = false;
    // Mirror the back's UV, so its text reads normally when the sheet lands.
    this.back.material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n vec4 sampledDiffuseColor = texture2D(map, vec2(1.0 - vMapUv.x, vMapUv.y));\n diffuseColor *= sampledDiffuseColor;\n#endif');
    };
    this.group.add(this.front, this.back);
    this.front.visible = this.back.visible = false;
    this.onWheel = event => {
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1;
      this.setZoom(this.zoom * Math.exp(-event.deltaY * unit * .0015), event.clientX, event.clientY);
    };
    this.onDown = event => this.pointerDown(event);
    this.onMove = event => this.pointerMove(event);
    this.onUp = event => this.pointerUp(event);
    this.onContext = event => event.preventDefault();
    // Keep Chromium's middle-click autoscroll from stealing the pointer mid-pan.
    this.onMiddleDown = event => { if (event.button === 1) event.preventDefault(); };
    this.onLost = event => { if (this.drag?.id === event.pointerId) this.pointerUp(event, true); };
    this.onContextLost = event => { event.preventDefault(); if (!this.disposed) this.onError(new Error('3D rendering stopped. Switched to scroll view.')); };
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    host.addEventListener('wheel', this.onWheel, { passive: false });
    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('pointermove', this.onMove);
    host.addEventListener('pointerup', this.onUp);
    host.addEventListener('pointercancel', this.onLost);
    host.addEventListener('lostpointercapture', this.onLost);
    host.addEventListener('contextmenu', this.onContext);
    host.addEventListener('mousedown', this.onMiddleDown);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  flatPage() {
    const mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.group.add(mesh);
    return mesh;
  }

  spreads() {
    if (this.spreadCache?.single === this.single) return this.spreadCache.pages;
    if (this.single) {
      const pages = Array.from({ length: this.document.total }, (_, i) => [null, i + 1]);
      this.spreadCache = { single: true, pages };
      return pages;
    }
    const spreads = [[null, 1]];
    for (let page = 2; page <= this.document.total; page += 2) spreads.push([page, page + 1 <= this.document.total ? page + 1 : null]);
    this.spreadCache = { single: false, pages: spreads };
    return spreads;
  }

  resize() {
    if (this.disposed) return;
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height) return;
    const single = width < 650;
    if (this.turn) this.cancelTurn();
    if (single !== this.single) {
      this.cancelTurn();
      this.single = single;
    }
    this.width = width;
    this.height = height;
    // Bound the multisampled drawing buffer on very large / high-DPI displays.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4 * 1024 ** 2 / (width * height))));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.fov = 2 * Math.atan(height / (2 * this.camera.position.z)) * 180 / Math.PI;
    this.camera.updateProjectionMatrix();
    // Reserve enough height for perspective expansion as the paper lifts.
    const safeHeight = (height - 40) * this.camera.position.z / (this.camera.position.z + this.document.aspect * (height - 40));
    this.fit = Math.max(10, Math.min(safeHeight, (width - 60) / (this.document.aspect * (single ? 1 : 2))));
    this.showPage(this.page);
  }

  resolution() { return this.turn?.size || rasterSize(this.fit * this.zoom * Math.max(1, this.document.aspect) * this.renderer.getPixelRatio()); }

  setNeeded(pages, anchor = this.index) {
    clearTimeout(this.preloadTimer);
    this.preloadVersion++;
    this.host.dataset.preload = 'false';
    this.neededPages = new Set(pages.filter(Boolean));
    this.requiredPages = new Set(this.neededPages);
    const size = this.resolution();
    // Keep just the adjacent spreads, with a separate byte budget for pages
    // outside the visible/turning set. High zoom automatically reduces lookahead.
    const height = Math.ceil(size / Math.max(1, this.document.aspect));
    const bytes = Math.ceil(height * this.document.aspect) * height * 4;
    let available = PRELOAD_BYTES;
    const direction = this.travelDirection || 1;
    for (const index of [anchor + direction, anchor - direction]) {
      for (const page of this.spreads()[index] || []) {
        if (!page || this.neededPages.has(page)) continue;
        if (bytes > available) continue;
        available -= bytes;
        this.neededPages.add(page);
      }
    }
    for (const [key, pending] of this.pendingTextures) {
      if (!this.neededPages.has(pending.page) || pending.size !== size) { pending.controller.abort(); this.pendingTextures.delete(key); }
    }
    for (const [page, texture] of this.textures) {
      if (!this.neededPages.has(page) || texture.userData.size !== size) { this.retiredTextures.add(texture); this.textures.delete(page); }
    }
    this.releaseRetired();
  }

  schedulePreload() {
    const version = this.preloadVersion;
    this.host.dataset.preload = 'true';
    this.preloadTimer = setTimeout(async () => {
      try {
        // Decode one page at a time, after the current spread has painted.
        for (const page of this.neededPages) {
          if (this.disposed || (this.turn && !this.turn.ready) || version !== this.preloadVersion) return;
          if (this.requiredPages.has(page)) continue;
          try {
            const texture = await this.texture(page);
            if (this.disposed || version !== this.preloadVersion) return;
            if (texture?.image) this.renderer.initTexture(texture);
            this.releaseRetired();
          } catch { /* A speculative failure is retried when that page is requested. */ }
        }
      } finally {
        if (!this.disposed && version === this.preloadVersion) this.host.dataset.preload = 'false';
      }
    }, 80);
  }

  getCacheStats() {
    const textures = [...this.textures.entries()];
    return { textures: textures.length, preloadLimit: PRELOAD_BYTES,
      preloadBytes: textures.filter(([page]) => !this.requiredPages.has(page)).reduce((sum, [, texture]) => sum + texture.userData.bytes, 0) };
  }

  disposeTexture(texture) {
    texture.dispose();
    texture.userData.release?.();
    texture.onUpdate = null;
    texture.image = null;
  }

  releaseRetired() {
    const inUse = new Set([this.left, this.right, this.front, this.back].filter(mesh => mesh.visible).map(mesh => mesh.material.map));
    for (const texture of this.retiredTextures) {
      if (!inUse.has(texture)) { this.disposeTexture(texture); this.retiredTextures.delete(texture); }
    }
  }

  async texture(page) {
    if (!page) return null;
    const size = this.resolution();
    const existing = this.textures.get(page);
    if (existing?.userData.size === size) return existing;
    const key = `${page}:${size}`;
    if (this.pendingTextures.has(key)) return this.pendingTextures.get(key).promise;
    const controller = new AbortController();
    const promise = (async () => {
      const lease = await this.document.acquire(page, size, controller.signal);
      let canvas = lease.canvas;
      if (this.disposed || !this.neededPages.has(page) || size !== this.resolution()) { lease.release(); return null; }
      let ownedCanvas = false;
      try {
        // Mixed-size pages keep their proportions inside a book-sized sheet.
        if (Math.abs(canvas.width / canvas.height - this.document.aspect) > .005) {
          const source = canvas;
          canvas = window.document.createElement('canvas');
          canvas.height = Math.round(size / Math.max(1, this.document.aspect));
          canvas.width = Math.round(canvas.height * this.document.aspect);
          ownedCanvas = true;
          const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          const fit = Math.min(canvas.width / source.width, canvas.height / source.height);
          context.drawImage(source, (canvas.width - source.width * fit) / 2, (canvas.height - source.height * fit) / 2, source.width * fit, source.height * fit);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          lease.release(true);
          if (ownedCanvas) canvas.width = canvas.height = 0;
        };
        texture.userData = { size, release, bytes: canvas.width * canvas.height * 4 };
        // Once uploaded, WebGL owns the pixels. Context loss already switches
        // to scroll view, so a second CPU copy is unnecessary for recovery.
        texture.onUpdate = () => {
          release();
          texture.image = null;
          texture.onUpdate = null;
          texture.userData.release = null;
        };
        if (ownedCanvas) lease.release(true);
        const previous = this.textures.get(page);
        if (previous) this.retiredTextures.add(previous);
        this.textures.set(page, texture);
        return texture;
      } catch (error) {
        lease.release();
        if (ownedCanvas) canvas.width = canvas.height = 0;
        throw error;
      }
    })().catch(error => { if (error.name !== 'AbortError') throw error; return null; })
      .finally(() => { if (this.pendingTextures.get(key)?.promise === promise) this.pendingTextures.delete(key); });
    this.pendingTextures.set(key, { page, size, controller, promise });
    return promise;
  }

  async showPage(page) {
    const version = ++this.version;
    const spreads = this.spreads();
    this.index = Math.max(0, spreads.findIndex(spread => spread.includes(page)));
    this.current = spreads[this.index];
    this.page = this.current[0] || this.current[1];
    this.emit();
    this.host.dataset.busy = 'true';
    this.setNeeded(this.current);
    try {
      const [left, right] = await Promise.all(this.current.map(p => this.texture(p)));
      if (this.disposed || version !== this.version) return;
      this.setFlat(this.left, left, -1);
      this.setFlat(this.right, right, 1);
      this.front.visible = this.back.visible = false;
      this.front.material.map = this.back.material.map = null;
      this.host.dataset.busy = 'false';
      this.updateTransform();
      this.releaseRetired();
      this.emit();
      this.schedulePreload();
    } catch (error) { if (!this.disposed) this.onError(error); }
  }

  setFlat(mesh, texture, side) {
    mesh.visible = Boolean(texture);
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    mesh.scale.set(this.document.aspect, 1, 1);
    mesh.position.set(this.single ? 0 : side * this.document.aspect / 2, 0, 0);
  }

  updateTransform() {
    const scale = this.fit * this.zoom;
    // Center an isolated cover/back cover in the viewport.
    const centerFor = pages => !pages?.[0] ? -this.document.aspect / 2 : !pages?.[1] ? this.document.aspect / 2 : 0;
    const center = this.single ? 0 : this.turn
      ? centerFor(this.current) * (1 - this.turn.progress) + centerFor(this.turn.target) * this.turn.progress
      : centerFor(this.current);
    this.group.scale.setScalar(scale);
    this.group.position.set(this.pan.x + center * scale, this.pan.y, 0);
    this.draw();
  }

  draw() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
    this.host.dataset.pan = `${Math.round(this.pan.x)},${Math.round(this.pan.y)}`;
  }

  emit() {
    if (!this.disposed) this.onChange({ page: this.page, total: this.document.total, zoom: this.zoom, atStart: this.index === 0, atEnd: this.index === this.spreads().length - 1 });
  }

  setZoom(value, clientX, clientY) {
    const next = clamp(value, .35, 4);
    const rect = this.host.getBoundingClientRect();
    const x = clientX === undefined ? 0 : clientX - rect.left - this.width / 2;
    const y = clientY === undefined ? 0 : this.height / 2 - (clientY - rect.top);
    const ratio = next / this.zoom;
    this.pan.x = x - (x - this.pan.x) * ratio;
    this.pan.y = y - (y - this.pan.y) * ratio;
    this.zoom = next;
    this.updateTransform();
    this.emit();
    this.refreshResolution();
  }

  refreshResolution() {
    clearTimeout(this.resolutionTimer);
    this.resolutionTimer = setTimeout(() => {
      if (!this.disposed && !this.turn && this.current.some(page => page && this.textures.get(page)?.userData.size !== this.resolution())) this.showPage(this.page);
    }, 180);
  }

  fitToWindow() { this.pan = { x: 0, y: 0 }; this.zoom = 1; this.updateTransform(); this.emit(); this.refreshResolution(); }
  fitToScreen() { this.fitToWindow(); }
  goTo(page) { if (!Number.isFinite(page)) return; this.cancelTurn(); this.showPage(clamp(Math.round(page), 1, this.document.total)); }
  next() { this.startTurn(1); }
  prev() { this.startTurn(-1); }

  async startTurn(direction, interactive = false) {
    if (this.turn || this.disposed || this.host.dataset.busy === 'true') return false;
    const target = this.spreads()[this.index + direction];
    if (!target) return false;
    const turn = { direction, progress: 0, target, ready: false, size: this.resolution() };
    this.turn = turn;
    this.travelDirection = direction;
    const current = this.current;
    try {
      const pages = this.single ? (direction === 1 ? [current[1], target[1], null, target[1]] : [target[1], current[1], null, target[1]])
        : direction === 1 ? [current[1], target[0], current[0], target[1]] : [target[1], current[0], target[0], current[1]];
      this.setNeeded(pages, this.index + direction);
      const textures = await Promise.all(pages.map(page => this.texture(page)));
      if (this.disposed || this.turn !== turn) return false;
      this.front.material.map = textures[0];
      this.back.material.map = textures[1];
      this.front.material.needsUpdate = this.back.material.needsUpdate = true;
      this.front.visible = this.back.visible = true;
      this.setFlat(this.left, textures[2], -1);
      this.setFlat(this.right, textures[3], 1);
      this.releaseRetired();
      turn.ready = true;
      this.bend(turn.progress);
      this.schedulePreload();
      if (!interactive) this.finishTurn(true);
      else if (turn.released !== undefined) this.finishTurn(turn.released);
      return true;
    } catch (error) { this.cancelTurn(); if (!this.disposed) this.onError(error); return false; }
  }

  bend(progress) {
    if (!this.turn?.ready) return;
    this.turn.progress = progress;
    // Both directions use the same physical sheet, traversed in reverse.
    const p = this.turn.direction === 1 ? progress : 1 - progress;
    const angle = Math.PI * p;
    const curl = Math.sin(Math.PI * p) * 1.65;
    const width = this.document.aspect;
    const positions = this.sheetGeometry.attributes.position;
    const uv = this.sheetGeometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      // Integrate the changing tangent along the paper's width. Arc length
      // stays constant, so the sheet bends without stretching its text.
      const base = angle - curl * .55;
      const a = base + curl * u;
      const x = curl < .0001 ? u * width * Math.cos(angle) : width * (Math.sin(a) - Math.sin(base)) / curl;
      const z = curl < .0001 ? u * width * Math.sin(angle) : width * (Math.cos(base) - Math.cos(a)) / curl;
      const corner = Math.sin(Math.PI * p) * Math.pow(u, 2) * (v - .5) * .065;
      const offset = this.single ? (this.turn.direction === 1 ? -width / 2 : width / 2) : 0;
      positions.setXYZ(i, x + offset, v - .5, Math.max(0, z) + corner + .003);
    }
    positions.needsUpdate = true;
    this.sheetGeometry.computeVertexNormals();
    this.host.dataset.turn = progress.toFixed(3);
    this.updateTransform();
  }

  finishTurn(complete) {
    const turn = this.turn;
    if (!turn) return;
    if (!turn.ready) { turn.released = complete; return; }
    this.animation?.pause();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.animation = animate(turn, {
      progress: complete ? 1 : 0,
      duration: reduced ? 0 : Math.max(180, 850 * Math.abs((complete ? 1 : 0) - turn.progress)),
      ease: 'inOutSine',
      onUpdate: () => this.bend(turn.progress),
      onComplete: () => {
        if (this.disposed || this.turn !== turn) return;
        const page = complete ? turn.target[0] || turn.target[1] : this.page;
        this.turn = null;
        delete this.host.dataset.turn;
        this.showPage(page);
      },
    });
  }

  cancelTurn() {
    this.animation?.pause();
    this.turn = null;
    this.drag = null;
    if (this.front) this.front.visible = this.back.visible = false;
    delete this.host.dataset.turn;
    this.host.classList.remove('is-panning');
  }

  hitTest(event) {
    const rect = this.host.getBoundingClientRect();
    const x = (event.clientX - rect.left - this.width / 2 - this.group.position.x) / (this.fit * this.zoom);
    const y = (this.height / 2 - (event.clientY - rect.top) - this.pan.y) / (this.fit * this.zoom);
    const w = this.document.aspect;
    const onPage = Math.abs(y) <= .5 && (this.single
      ? this.right.visible && Math.abs(x) <= w / 2
      : (this.left.visible && x >= -w && x < 0) || (this.right.visible && x >= 0 && x <= w));
    const direction = x > 0 ? 1 : -1;
    const canTurn = Boolean(this.spreads()[this.index + direction]);
    return { onPage, direction, canTurn };
  }

  pointerDown(event) {
    if (this.turn || event.button > 1) return;
    this.host.focus();
    const { onPage, direction, canTurn } = this.hitTest(event);
    // Left-click is exclusively for turning on paper, including at boundaries
    // and with modifier keys. Only empty space can start a left-button pan.
    if (event.button === 0 && onPage && !canTurn) return;
    const mode = event.button === 0 && onPage ? 'turn' : 'pan';
    this.host.style.cursor = '';
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: { ...this.pan }, mode, direction, moved: false };
    this.host.setPointerCapture(event.pointerId);
    if (mode === 'turn') this.startTurn(direction, true);
    else this.host.classList.add('is-panning');
    event.preventDefault();
  }

  pointerMove(event) {
    const drag = this.drag;
    if (!drag) {
      if (!this.turn) {
        const { onPage, canTurn } = this.hitTest(event);
        this.host.style.cursor = onPage ? (canTurn ? 'pointer' : 'default') : 'grab';
      }
      return;
    }
    if (drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.mode === 'pan') {
      this.pan = { x: drag.pan.x + dx, y: drag.pan.y - dy };
      this.updateTransform();
    } else if (this.turn) {
      this.turn.progress = clamp(-dx * drag.direction / (this.document.aspect * this.fit * this.zoom * 1.6), 0, 1);
      this.bend(this.turn.progress);
    }
  }

  pointerUp(event, cancelled = false) {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.id) return;
    this.drag = null;
    this.host.classList.remove('is-panning');
    if (this.host.hasPointerCapture(event.pointerId)) this.host.releasePointerCapture(event.pointerId);
    if (drag.mode === 'turn') this.finishTurn(!cancelled && (!drag.moved || (this.turn?.progress || 0) > .32));
  }

  destroy() {
    this.disposed = true;
    clearTimeout(this.preloadTimer);
    this.preloadVersion++;
    clearTimeout(this.resolutionTimer);
    this.cancelTurn();
    this.observer.disconnect();
    for (const [event, handler] of [['wheel', this.onWheel], ['pointerdown', this.onDown], ['pointermove', this.onMove], ['pointerup', this.onUp], ['pointercancel', this.onLost], ['lostpointercapture', this.onLost], ['contextmenu', this.onContext], ['mousedown', this.onMiddleDown]]) this.host.removeEventListener(event, handler);
    this.pendingTextures.forEach(pending => pending.controller.abort());
    this.pendingTextures.clear();
    this.textures.forEach(texture => this.disposeTexture(texture));
    this.retiredTextures.forEach(texture => this.disposeTexture(texture));
    this.textures.clear();
    this.retiredTextures.clear();
    this.geometry.dispose();
    this.sheetGeometry.dispose();
    [this.left, this.right, this.front, this.back].forEach(mesh => mesh.material.dispose());
    this.renderer.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.forceContextLoss();
    this.canvas.width = this.canvas.height = 1;
    this.canvas.remove();
  }
}
