/* Camera-relative rotation: every drag uses the current screen axes. */
(function (scope) {
  'use strict';
  class ViewControls extends THREE.EventDispatcher {
    constructor(camera, element) {
      super(); this.object = camera; this.domElement = element; this.target = new THREE.Vector3();
      this.enabled = true; this.minDistance = .1; this.maxDistance = 10000;
      this.pointers = new Map(); this.gesture = null; this.listeners = [];
      element.style.touchAction = 'none';
      const on = (name, fn, options) => { element.addEventListener(name, fn, options); this.listeners.push([name, fn, options]); };
      on('contextmenu', e => e.preventDefault());
      on('pointerdown', e => {
        if (!this.enabled || e.button > 2) return;
        e.preventDefault(); element.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, mode: e.button === 1 ? 'zoom' : e.button === 2 || e.ctrlKey || e.metaKey || e.shiftKey ? 'pan' : 'rotate' });
        this.snapshot();
      });
      on('pointermove', e => {
        const p = this.pointers.get(e.pointerId); if (!p || !this.enabled) return;
        p.x = e.clientX; p.y = e.clientY;
        const points = [...this.pointers.values()], g = this.gesture;
        if (g && points.length > 1) {
          const center = [(points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2];
          const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
          if (g.distance > 0 && distance > 0) this.dolly(g.distance / distance);
          this.pan(center[0] - g.center[0], center[1] - g.center[1]);
        } else if (g) {
          const dx = p.x - g.center[0], dy = p.y - g.center[1];
          if (p.mode === 'pan') this.pan(dx, dy); else if (p.mode === 'zoom') this.dolly(Math.exp(dy * .008)); else this.rotate(dx, dy);
        }
        this.snapshot();
      });
      const release = e => { this.pointers.delete(e.pointerId); this.snapshot(); };
      on('pointerup', release); on('pointercancel', release); on('lostpointercapture', release);
      on('wheel', e => {
        if (!this.enabled) return; e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? Math.max(1, element.clientHeight) : 1;
        this.dolly(Math.exp(Math.max(-200, Math.min(200, e.deltaY * unit)) * .0015));
      }, { passive: false });
      this.update();
    }
    snapshot() { const p = [...this.pointers.values()]; this.gesture = !p.length ? null : p.length === 1 ? { center: [p[0].x, p[0].y], distance: 0 } : { center: [(p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2], distance: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) }; }
    rotate(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(dx || dy)) return;
      const camera = this.object, scale = Math.PI * 2 / Math.max(1, this.domElement.clientHeight);
      // Rotate the eye and its up vector together, so no world-up constraint remains.
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const axis = right.multiplyScalar(-dy).addScaledVector(up, -dx);
      const rotation = new THREE.Quaternion().setFromAxisAngle(axis.normalize(), Math.hypot(dx, dy) * scale);
      camera.position.sub(this.target).applyQuaternion(rotation).add(this.target);
      camera.up.applyQuaternion(rotation).normalize(); this.update();
    }
    pan(dx, dy) {
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const camera = this.object, distance = camera.position.distanceTo(this.target);
      const scale = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, this.domElement.clientHeight);
      const shift = new THREE.Vector3(-dx * scale, dy * scale, 0).applyQuaternion(camera.quaternion);
      camera.position.add(shift); this.target.add(shift); this.update();
    }
    dolly(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      const offset = this.object.position.clone().sub(this.target), length = offset.length(); if (!length) return;
      offset.multiplyScalar(THREE.MathUtils.clamp(length * factor, this.minDistance, this.maxDistance) / length);
      this.object.position.copy(this.target).add(offset); this.update();
    }
    update() { this.object.lookAt(this.target); this.object.updateMatrixWorld(); this.dispatchEvent({ type: 'change' }); }
    dispose() { for (const [name, fn, options] of this.listeners) this.domElement.removeEventListener(name, fn, options); this.pointers.clear(); this.gesture = null; }
  }
  scope.ViewControls = ViewControls;
})(globalThis);
