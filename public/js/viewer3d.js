/* Visualizador 3D — mostra escaneamentos/CAD (STL, OBJ, PLY) em tela cheia.
   Usa a biblioteca three.js embutida em /vendor (funciona offline).
   Aparência de estúdio: metal com reflexo de ambiente, sombra suave no chão
   e fundo escuro da identidade. Controles: arrastar gira, roda dá zoom,
   dois dedos no celular. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const Viewer3D = {
  async open(model) {
    const wrap = document.createElement('div');
    wrap.className = 'v3d-wrap';
    wrap.innerHTML = `
      <div class="v3d-top">
        <b>🧊 ${App.esc(model.nome)}</b>
        <div class="spacer"></div>
        <button class="btn sm" id="v3d-rot" title="Girar sozinho">⟳ Girando</button>
        <button class="btn sm" id="v3d-close">✕ Fechar</button>
      </div>
      <div class="v3d-canvas" id="v3d-canvas"><div class="v3d-loading">Carregando modelo 3D…</div></div>
      <div class="v3d-hint">arraste para girar · roda/pinça para zoom · botão direito move</div>`;
    document.body.appendChild(wrap);

    let disposed = false, raf = 0, renderer = null, onResizeFn = null;
    const close = () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (onResizeFn) window.removeEventListener('resize', onResizeFn);
      if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); }
      wrap.remove();
    };
    wrap.querySelector('#v3d-close').onclick = close;

    try {
      const r = await fetch(`/api/models3d/${model.id}/file`, {
        headers: { Authorization: 'Bearer ' + App.token() }
      });
      if (!r.ok) throw new Error('Não consegui baixar o modelo (' + r.status + ')');
      const buf = await r.arrayBuffer();
      if (disposed) return;

      /* ---- geometria conforme o formato ---- */
      const material = new THREE.MeshStandardMaterial({
        color: 0xaeb3ba, metalness: 0.9, roughness: 0.4, side: THREE.DoubleSide
      });
      let object;
      if (model.ext === 'stl') {
        const geo = new STLLoader().parse(buf);
        geo.computeVertexNormals();
        object = new THREE.Mesh(geo, material);
      } else if (model.ext === 'ply') {
        const geo = new PLYLoader().parse(buf);
        geo.computeVertexNormals();
        object = new THREE.Mesh(geo, material);
      } else {
        const text = new TextDecoder().decode(buf);
        object = new OBJLoader().parse(text);
        object.traverse(o => { if (o.isMesh) { o.material = material; o.geometry.computeVertexNormals(); } });
      }
      object.traverse ? object.traverse(o => { if (o.isMesh) o.castShadow = true; }) : null;
      if (object.isMesh) object.castShadow = true;

      /* ---- centraliza: peça apoiada no "chão" (y = 0) ---- */
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const sizeV = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sizeV.x, sizeV.y, sizeV.z) || 1;
      object.position.set(-center.x, -box.min.y, -center.z);

      const holder = wrap.querySelector('#v3d-canvas');
      holder.innerHTML = '';
      const scene = new THREE.Scene();
      scene.add(object);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(holder.clientWidth, holder.clientHeight);
      renderer.setClearColor(0x000000, 0); // fundo vem do CSS (gradiente da identidade)
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.82;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      holder.appendChild(renderer.domElement);

      /* ---- iluminação de estúdio: ambiente refletivo + chave com sombra ---- */
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.62;

      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(maxDim * 1.2, maxDim * 2.2, maxDim * 0.8);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = key.shadow.camera.bottom = -maxDim;
      key.shadow.camera.right = key.shadow.camera.top = maxDim;
      key.shadow.camera.near = maxDim * 0.1;
      key.shadow.camera.far = maxDim * 6;
      key.shadow.bias = -0.0002;
      key.shadow.radius = 6;
      scene.add(key);

      /* ---- chão: disco com gradiente que some no fundo + sombra ---- */
      const tex = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 512;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256);
        grad.addColorStop(0, '#232329');
        grad.addColorStop(0.55, '#121215');
        grad.addColorStop(1, 'rgba(11,11,12,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 512);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(maxDim * 2.4, 64),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -maxDim * 0.001;
      scene.add(floor);
      const shadowCatcher = new THREE.Mesh(
        new THREE.CircleGeometry(maxDim * 2.4, 64),
        new THREE.ShadowMaterial({ opacity: 0.55 })
      );
      shadowCatcher.rotation.x = -Math.PI / 2;
      shadowCatcher.receiveShadow = true;
      scene.add(shadowCatcher);

      /* ---- câmera enquadrada na peça ---- */
      const camera = new THREE.PerspectiveCamera(38, holder.clientWidth / holder.clientHeight, maxDim / 100, maxDim * 30);
      const dist = maxDim * 1.35;
      camera.position.set(dist, maxDim * 0.62, dist * 0.85);
      const target = new THREE.Vector3(0, sizeV.y * 0.42, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(target);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.9;
      controls.minDistance = maxDim * 0.35;
      controls.maxDistance = maxDim * 6;
      controls.maxPolarAngle = Math.PI * 0.55; // não mergulha abaixo do chão

      const rotBtn = wrap.querySelector('#v3d-rot');
      rotBtn.onclick = () => {
        controls.autoRotate = !controls.autoRotate;
        rotBtn.textContent = controls.autoRotate ? '⟳ Girando' : '⟳ Girar sozinho';
      };
      controls.addEventListener('start', () => {
        controls.autoRotate = false;
        rotBtn.textContent = '⟳ Girar sozinho';
      });

      onResizeFn = () => {
        camera.aspect = holder.clientWidth / holder.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(holder.clientWidth, holder.clientHeight);
      };
      window.addEventListener('resize', onResizeFn);

      (function animate() {
        if (disposed) return;
        raf = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      })();
    } catch (e) {
      const holder = wrap.querySelector('#v3d-canvas');
      if (holder) holder.innerHTML = `<div class="v3d-loading">⚠️ ${App.esc(e.message)}</div>`;
    }
    return close;
  }
};

window.Viewer3D = Viewer3D;
