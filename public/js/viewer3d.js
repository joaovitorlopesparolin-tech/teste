/* Visualizador 3D — mostra escaneamentos/CAD (STL, OBJ, PLY) em tela cheia.
   Usa a biblioteca three.js embutida em /vendor (funciona offline).
   Aparência: peça em alumínio usinado sobre o fundo escuro da identidade,
   com luz de recorte vermelha. Controles: arrastar gira, roda dá zoom,
   dois dedos no celular. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

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
        color: 0xb9bdc4, metalness: 0.82, roughness: 0.38,
        flatShading: false, side: THREE.DoubleSide
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

      /* ---- centraliza e enquadra ---- */
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const sizeV = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(sizeV.x, sizeV.y, sizeV.z) || 1;
      object.position.sub(center);

      const holder = wrap.querySelector('#v3d-canvas');
      holder.innerHTML = '';
      const scene = new THREE.Scene();
      scene.add(object);

      /* ---- luzes: estúdio escuro com recorte vermelho ---- */
      scene.add(new THREE.HemisphereLight(0xdde3ea, 0x14161a, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 1.6);
      key.position.set(1, 1.4, 1).multiplyScalar(maxDim);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x9fb4cc, 0.5);
      fill.position.set(-1.2, 0.4, -0.8).multiplyScalar(maxDim);
      scene.add(fill);
      const rim = new THREE.PointLight(0xe43146, maxDim * maxDim * 0.9, maxDim * 6);
      rim.position.set(-0.8, -0.6, 1.2).multiplyScalar(maxDim);
      scene.add(rim);

      const camera = new THREE.PerspectiveCamera(42, holder.clientWidth / holder.clientHeight, maxDim / 100, maxDim * 20);
      camera.position.set(maxDim * 1.25, maxDim * 0.7, maxDim * 1.25);

      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(holder.clientWidth, holder.clientHeight);
      renderer.setClearColor(0x0b0b0c, 1);
      holder.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.1;

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
