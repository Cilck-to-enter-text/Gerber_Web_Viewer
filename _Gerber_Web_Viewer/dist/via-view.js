/* A display-only cover for small vias; the drilled board/STL stays untouched. */
(function install(scope) {
  'use strict';
  const materials = new WeakMap();
  function opacity(pixels) { const t = Math.max(0, Math.min(1, (pixels - 6) / 12)); return 1 - t * t * (3 - 2 * t); }
  function bind(scene) {
    const entries = [];
    scene.traverse(object => {
      if (!object.isMesh || !object.userData.softVias) return;
      const material = object.material, viewport = { value: 600 };
      material.onBeforeCompile = shader => {
        shader.uniforms.viaViewportHeight = viewport;
        shader.vertexShader = 'attribute float viaDiameter;\nuniform float viaViewportHeight;\nvarying float vViaPixels;\nvarying vec2 vViaUV;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
          vViaUV=uv;
          vViaPixels=viaDiameter*viaViewportHeight*projectionMatrix[1][1]/(2.0*max(0.01,-mvPosition.z));`);
        shader.fragmentShader = 'varying float vViaPixels;\nvarying vec2 vViaUV;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float viaRadius=length(vViaUV-0.5)*2.0;
          diffuseColor.rgb*=mix(0.82,1.0,smoothstep(0.60,0.82,viaRadius));
          diffuseColor.a*=(1.0-smoothstep(6.0,18.0,vViaPixels))*(1.0-smoothstep(0.84,1.0,viaRadius));`);
      };
      material.customProgramCacheKey = () => 'soft-vias-v1'; material.needsUpdate = true; entries.push(viewport);
    });
    materials.set(scene, entries);
  }
  function update(scene, height) { if (!materials.has(scene)) bind(scene); for (const uniform of materials.get(scene)) uniform.value = Math.max(1, height); }
  function inside(point, ring) { let result = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result; } return result; }
  function select(model, holes) {
    return holes.flatMap(ring => {
      const b = ring.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
      const diameter = Math.max(b[2] - b[0], b[3] - b[1]), radius = diameter / 2, x = (b[0] + b[2]) / 2, y = (b[1] + b[3]) / 2;
      // Do not infer electrical function: only soften small, circular, interior holes.
      if (diameter <= 0 || diameter > .6 || ring.length < 12 || ring.some(p => Math.abs(Math.hypot(p[0] - x, p[1] - y) - radius) > radius * .04)) return [];
      const rim = Array.from({ length: 48 }, (_, i) => [x + 1.35 * radius * Math.cos(i * Math.PI / 24), y + 1.35 * radius * Math.sin(i * Math.PI / 24)]);
      const polygon = model.polygons.find(poly => inside([x, y], poly[0]));
      if (!polygon || rim.some(p => !inside(p, polygon[0])) || polygon.slice(1).some(r => !inside([x, y], r) && rim.some(p => inside(p, r)))) return [];
      return [{ x, y, radius, diameter }];
    });
  }
  function create(model, holes, top, bottom) {
    const vias = select(model, holes); if (!vias.length) return null;
    const positions = [], normals = [], uvs = [], colors = [], diameters = [], bounds = model.bounds;
    const sample = texture => { const canvas = texture.image; return { width: canvas.width, height: canvas.height, data: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data }; };
    const surfaces = [sample(top), sample(bottom)];
    for (const via of vias) for (const sign of [1, -1]) {
      const surface = surfaces[sign === 1 ? 0 : 1], samples = [];
      // Use nearby board colour instead of the bright annular copper ring.
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12, r = via.radius * 2.4;
        const px = Math.max(0, Math.min(surface.width - 1, Math.round((via.x + r * Math.cos(angle) - bounds[0]) / (bounds[2] - bounds[0]) * (surface.width - 1))));
        const py = Math.max(0, Math.min(surface.height - 1, Math.round((bounds[3] - via.y - r * Math.sin(angle)) / (bounds[3] - bounds[1]) * (surface.height - 1))));
        const k = (py * surface.width + px) * 4;
        samples.push([surface.data[k], surface.data[k + 1], surface.data[k + 2]]);
      }
      samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
      const rgb = samples[Math.floor(samples.length * .3)], color = new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
      const add = (x, y) => { positions.push(via.x - model.center[0] + x * via.radius * 1.35, via.y - model.center[1] + y * via.radius * 1.35, sign * (model.thickness / 2 + .002)); normals.push(0, 0, sign); uvs.push(x / 2 + .5, y / 2 + .5); colors.push(color.r, color.g, color.b); diameters.push(via.diameter); };
      for (let i = 0; i < 48; i++) { const a = sign * i * Math.PI / 24, b = sign * (i + 1) * Math.PI / 24; add(0, 0); add(Math.cos(a), Math.sin(a)); add(Math.cos(b), Math.sin(b)); }
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, data, size] of [['position', positions, 3], ['normal', normals, 3], ['uv', uvs, 2], ['color', colors, 3], ['viaDiameter', diameters, 1]]) geometry.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: .75, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Small via display'; mesh.userData.softVias = true; mesh.userData.viaCount = vias.length; mesh.renderOrder = 1;
    return mesh;
  }
  scope.PCBViaView = { create, select, bind, update, opacity, source: '(' + install.toString() + ')(globalThis);' };
})(globalThis);
