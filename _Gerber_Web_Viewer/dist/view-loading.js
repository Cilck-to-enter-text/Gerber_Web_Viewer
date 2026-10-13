(function (scope) {
  const host = document.getElementById('viewport');
  const overlay = document.createElement('div'); overlay.className = 'view-loading'; overlay.hidden = true;
  const label = document.createElement('p'); label.id = 'view-loading-label'; label.setAttribute('role', 'status');
  const bar = document.createElement('progress'); bar.max = 100; bar.value = 0; bar.setAttribute('aria-labelledby', label.id);
  overlay.append(label, bar); host.append(overlay);
  let revision = 0;
  const paint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  function update(token, value, text) { if (token !== revision) return; bar.value = value; label.textContent = text; }
  scope.ViewLoading = {
    begin(text) { const token = ++revision; overlay.hidden = false; update(token, 0, text); return token; },
    update, paint,
    async finish(token) { if (token !== revision) return; bar.value = 100; await paint(); if (token === revision) overlay.hidden = true; },
    cancel() { revision++; overlay.hidden = true; }
  };
})(globalThis);
