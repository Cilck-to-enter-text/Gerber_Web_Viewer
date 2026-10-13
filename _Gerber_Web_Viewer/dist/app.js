'use strict';
const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
function setSidebarCollapsed(collapsed) {
  document.querySelector('main').classList.toggle('sidebar-collapsed', collapsed);
  const button = $('toggle-sidebar');
  button.setAttribute('aria-expanded', String(!collapsed));
  button.title = collapsed ? '展开图层面板' : '收起图层面板';
  button.setAttribute('aria-label', button.title);
}
$('toggle-sidebar').onclick = () => setSidebarCollapsed(!document.querySelector('main').classList.contains('sidebar-collapsed'));
const sidebarResize = $('sidebar-resize');
let sidebarDrag = null, sidebarFrame = 0, sidebarPending = 0;
function paintSidebarWidth() {
  sidebarFrame = 0;
  document.querySelector('main').style.setProperty('--sidebar-width', sidebarPending + '%');
}
sidebarResize.addEventListener('pointerdown', event => {
  const main = document.querySelector('main');
  if (event.button !== 0 || main.classList.contains('sidebar-collapsed') || window.innerWidth <= 558) return;
  event.preventDefault();
  sidebarDrag = { id: event.pointerId, x: event.clientX, width: $('layer-panel').getBoundingClientRect().width, total: main.getBoundingClientRect().width };
  sidebarResize.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing-sidebar');
});
sidebarResize.addEventListener('pointermove', event => {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.id) return;
  const width = Math.max(265.5, Math.min(sidebarDrag.total * .6, sidebarDrag.width + event.clientX - sidebarDrag.x));
  sidebarPending = 100 * width / sidebarDrag.total;
  if (!sidebarFrame) sidebarFrame = requestAnimationFrame(paintSidebarWidth);
});
function finishSidebarResize(event) {
  if (!sidebarDrag || event.pointerId !== sidebarDrag.id) return;
  if (sidebarFrame) { cancelAnimationFrame(sidebarFrame); paintSidebarWidth(); }
  sidebarDrag = null; document.body.classList.remove('resizing-sidebar');
  if (sidebarResize.hasPointerCapture(event.pointerId)) sidebarResize.releasePointerCapture(event.pointerId);
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) sidebarResize.addEventListener(event, finishSidebarResize);
const layerSplitter = $('layer-splitter');
let layerSplitDrag = null, layerSplitFrame = 0, layerSplitPending = 0;
function setLayerSplitHeight(height) {
  const controls = $('sidebar-controls');
  const panelHeight = $('layer-panel').getBoundingClientRect().height;
  const contentHeight = Array.from(controls.children).reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
  if (!panelHeight || !contentHeight || $('layer-splitter').hidden) return;
  const maximum = Math.min(contentHeight, Math.max(80, panelHeight - 108));
  const minimum = Math.min(160, maximum);
  const value = Math.max(minimum, Math.min(maximum, height)) + 'px';
  if (controls.style.getPropertyValue('--controls-height') !== value) controls.style.setProperty('--controls-height', value);
}
function paintLayerSplit() { layerSplitFrame = 0; setLayerSplitHeight(layerSplitPending); }
layerSplitter.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  layerSplitDrag = { id: event.pointerId, y: event.clientY, height: $('sidebar-controls').getBoundingClientRect().height };
  layerSplitter.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing-layer-split');
});
layerSplitter.addEventListener('pointermove', event => {
  if (!layerSplitDrag || event.pointerId !== layerSplitDrag.id) return;
  layerSplitPending = layerSplitDrag.height + event.clientY - layerSplitDrag.y;
  if (!layerSplitFrame) layerSplitFrame = requestAnimationFrame(paintLayerSplit);
});
function finishLayerSplit(event) {
  if (!layerSplitDrag || event.pointerId !== layerSplitDrag.id) return;
  if (layerSplitFrame) { cancelAnimationFrame(layerSplitFrame); paintLayerSplit(); }
  layerSplitDrag = null; document.body.classList.remove('resizing-layer-split');
  if (layerSplitter.hasPointerCapture(event.pointerId)) layerSplitter.releasePointerCapture(event.pointerId);
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) layerSplitter.addEventListener(event, finishLayerSplit);
layerSplitter.addEventListener('keydown', event => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault(); setLayerSplitHeight($('sidebar-controls').getBoundingClientRect().height + (event.key === 'ArrowUp' ? -16 : 16));
});
layerSplitter.addEventListener('dblclick', () => $('sidebar-controls').style.removeProperty('--controls-height'));
const layerSplitObserver = new ResizeObserver(() => {
  const height = parseFloat($('sidebar-controls').style.getPropertyValue('--controls-height'));
  if (Number.isFinite(height)) setLayerSplitHeight(height);
});
for (const element of [$('layer-panel'), ...$('sidebar-controls').children]) layerSplitObserver.observe(element);
// Keep the existing 2D working surface; mount 3D controls alongside it.
const threeSettings = document.createElement('div'); threeSettings.id = 'three-settings'; threeSettings.hidden = true;
threeSettings.innerHTML = `<h2>裸 PCB 模型</h2><button id="model-build" class="primary">更新模型</button><p class="model-update-hint">修改参数后，请点击“更新模型”使设置生效。</p><p id="model-size"></p><p id="model-note" role="status" aria-live="polite"></p><p class="model-help">正反面自动组合铜层、阻焊和丝印。STL 包含板体、孔和槽，不含表面颜色、走线纹理与元器件。</p><label>板厚（mm）<input id="pcb-thickness" type="number" min="0.2" max="6" step="0.1" value="1.6"></label><label>板框来源<select id="outline-source"></select></label><fieldset id="rectangle-settings" hidden><legend>矩形估算尺寸（mm）</legend><div class="size-fields"><label>宽<input id="pcb-width" type="number" min="0.1" max="1000" step="0.1"></label><label>长<input id="pcb-height" type="number" min="0.1" max="1000" step="0.1"></label></div><small>选择矩形估算时生效。</small></fieldset><label>阻焊颜色<select id="pcb-color"><option value="#165b3e">绿色</option><option value="#17456e">蓝色</option><option value="#642820">红色</option><option value="#1a2028">黑色</option><option value="custom">自定义</option></select></label><label id="custom-mask-settings" hidden>自定义阻焊颜色<input id="pcb-custom-color" type="color" value="#165b3e" title="选择自定义阻焊颜色"></label><label class="check-line"><input id="pcb-mask" type="checkbox" checked> 显示阻焊</label><label class="check-line"><input id="pcb-silk" type="checkbox" checked> 显示丝印</label>`;
$('layers').after(threeSettings);
const threeCanvas = document.createElement('div'); threeCanvas.id = 'three-canvas'; threeCanvas.hidden = true; $('viewport').append(threeCanvas);
const MAX_FILE = 15 * 1024 * 1024, MAX_TOTAL = 80 * 1024 * 1024, MAX_LAYERS = 80;
let layers = [], bounds = null, view = null, originalView = null, mirrored = false, busy = false, sequence = 0;
let viewFrame = 0, viewMetricsDirty = true, lastViewBox = '', lastZoom = '', lastScaleWidth = '', lastScaleLabel = '';
let layerFilter = null;
let soloState = null;
let selectedLayerId = null;
let worker = null;
if (location.protocol !== 'file:') { try { worker = new Worker('worker.js'); } catch { } }
function parseLayer(text, id) {
  if (!worker) return convertGerber(text, id);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); worker = null; reject(new Error('解析超过 30 秒，请尝试较小的文件。')); }, 30000);
    worker.onmessage = ({ data }) => { if (data.id !== id) return; clearTimeout(timer); data.error ? reject(new Error(data.error)) : resolve(data.result); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); worker = null; reject(new Error('解析进程中断，请重新打开文件。')); };
    worker.postMessage({ text, id });
  });
}
function classify(name) {
  const n = name.toLowerCase().split(/[\\/]/).pop();
  // LCEDA layer palette; numbered inner layers follow stack position, not net name.
  const innerNumber = n.match(/(?:inner[_ -]*|in)(\d+)/)?.[1] || n.match(/\.(g)(\d+)$/)?.[2];
  const stackNumber = n.match(/(?:^|[_-])l(\d+)[_-]/)?.[1];
  const innerIndex = innerNumber ? Number(innerNumber) - 1 : stackNumber ? Number(stackNumber) - 2 : null;
  const innerColors = ['#999966', '#008000', '#00ff00', '#000080'];
  const innerColor = fallback => innerIndex !== null && innerIndex >= 0 ? innerColors[innerIndex % innerColors.length] : fallback;
  if (/\.(drl|xln|exc|nc)$/.test(n)) return ['钻孔', '#c0c0c0', 95];
  if (/drill/.test(n)) return ['钻孔图', '#c0c0c0', 96];
  if (/silk.*(top)|\.gto$/.test(n)) return ['顶层丝印', '#ffcc00', 80];
  if (/silk.*(bot)|\.gbo$/.test(n)) return ['底层丝印', '#66cc33', 81];
  if (/solder.*top|\.gts$/.test(n)) return ['顶层阻焊开窗', '#800080', 60];
  if (/solder.*bot|\.gbs$/.test(n)) return ['底层阻焊开窗', '#aa00ff', 61];
  if (/pas[te]*.*top|\.gtp$/.test(n)) return ['顶层锡膏', '#808080', 70];
  if (/pas[te]*.*bot|\.gbp$/.test(n)) return ['底层锡膏', '#800000', 71];
  if (/outline|edge.cuts|boardoutline|\.(gko|gml|gm1)$/.test(n)) return ['板框', '#ff00ff', 90];
  if (/^top\.(pho|gbr|ger|gerber|art)$|l1[_-]?top|top.*copper|f[._]cu|\.gtl$/.test(n)) return ['顶层铜箔', '#ff0000', 40];
  if (/^bot\.(pho|gbr|ger|gerber|art)$|bottom|bot.*copper|b[._]cu|\.gbl$/.test(n)) return ['底层铜箔', '#0000ff', 10];
  if (/gnd|ground/.test(n)) return ['内层 · GND', innerColor('#999966'), 20];
  if (/power|pwr/.test(n)) return ['内层 · 电源', innerColor('#008000'), 21];
  if (/\.(g[1-9]\d*)$|inner|in\d[._]cu/.test(n)) return ['内层铜箔', innerColor('#999966'), 25];
  return ['图形层', '#ffffff', 50];
}
function isCandidate(name) {
  if (/(^|\/)(__MACOSX|\.)/.test(name)) return false;
  return /\.(pho|gbr|ger|gerber|gtl|gbl|g\d+|gts|gbs|gto|gbo|gtp|gbp|gko|gm\d+|gml|drl|xln|exc|nc|art|txt)$/i.test(name);
}
function isPlot(text) { return /%FS|%MO|%AD|G0?4|D0?[123]\*|M48|METRIC|INCH|T\d+C[\d.]/i.test(text); }
async function unpack(files) {
  let expanded = 0;
  const results = [], notes = [];
  async function add(name, size, read) {
    if (size > MAX_FILE) throw new Error(`${name} 超过单文件 15 MB 上限。`);
    expanded += size;
    if (expanded > MAX_TOTAL) throw new Error('解压后的数据超过 80 MB 上限。');
    const text = await read();
    if (text.length > MAX_FILE || expanded + text.length - size > MAX_TOTAL) throw new Error('解压后的文件过大。');
    if (!isPlot(text)) { notes.push(`${name}：不是可识别的 Gerber / 钻孔数据，已跳过。`); return; }
    if (results.length >= MAX_LAYERS) throw new Error(`一次最多打开 ${MAX_LAYERS} 个图层。`);
    results.push({ name: name.split('/').pop(), text });
  }
  async function zipRead(data, depth) {
    const zip = await JSZip.loadAsync(data);
    const entries = Object.values(zip.files).filter(e => !e.dir && !e.name.startsWith('__MACOSX/') && !e.name.split('/').pop().startsWith('.'));
    if (entries.length > 1000) throw new Error('压缩包文件数量超过 1000，请仅选择 Gerber 文件。');
    const plots = entries.filter(e => isCandidate(e.name));
    if (plots.length) {
      for (const e of plots) await add(e.name, e._data.uncompressedSize, () => e.async('string'));
    } else if (depth < 2) {
      for (const e of entries.filter(e => /\.zip$/i.test(e.name))) {
        if (e._data.uncompressedSize > MAX_TOTAL) throw new Error('嵌套压缩包过大。');
        expanded += e._data.uncompressedSize;
        if (expanded > MAX_TOTAL) throw new Error('解压后的数据超过 80 MB 上限。');
        await zipRead(await e.async('uint8array'), depth + 1);
      }
    }
  }
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL) throw new Error('所选文件总大小超过 80 MB。');
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) await zipRead(await file.arrayBuffer(), 0);
    else await add(file.name, file.size, () => file.text());
  }
  return { results, notes };
}
function addMessage(text) { const li = document.createElement('li'); li.textContent = text; $('messages').append(li); }
function showNotes(notes) {
  $('messages').replaceChildren(); notes.forEach(addMessage);
  $('diagnostics').hidden = !notes.length;
  $('diagnostic-title').textContent = `解析提示 ${notes.length}`;
  $('diagnostic-title').title = '展开检查相关图层的解析提示';
}
function loading(value) {
  busy = value; $('loading').hidden = !value;
  for (const id of ['open', 'empty-open']) $(id).disabled = value;
}
async function openFiles(files, title) {
  if (busy || !files.length) return;
  $('empty-error').hidden = true;
  setViewMode(false, false);
  setSidebarCollapsed(false);
  loading(true); $('progress').textContent = '正在读取文件…';
  const next = [], notes = [];
  try {
    const unpacked = await unpack(Array.from(files)); notes.push(...unpacked.notes);
    if (!unpacked.results.length) throw new Error('没有找到 Gerber 或钻孔文件，请选择 .pho、.gbr、.drl 等文件或包含它们的 ZIP。');
    for (let i = 0; i < unpacked.results.length; i++) {
      const { name, text } = unpacked.results[i];
      $('progress').textContent = `正在解析 ${i + 1} / ${unpacked.results.length}：${name}`;
      await new Promise(resolve => setTimeout(resolve, 0));
      try {
        const id = `layer-${++sequence}`;
        const result = await parseLayer(text, id);
        notes.push(...result.warnings.map(w => `${name} · ${w}`));
        if (result.empty) { notes.push(`${name}：图层没有可绘制内容。`); continue; }
        const parsed = new DOMParser().parseFromString(result.svg, 'image/svg+xml');
        if (parsed.querySelector('parsererror')) throw new Error('SVG 生成失败。');
        const svg = parsed.documentElement;
        const vb = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
        if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) throw new Error('图层坐标范围无效。');
        // Place each SVG at its real-world origin in millimeters; preserve its own Y-axis transform.
        const box = gerberBoxMm(vb, result.units);
        svg.setAttribute('x', box[0]); svg.setAttribute('y', box[1]);
        svg.setAttribute('width', box[2]); svg.setAttribute('height', box[3]);
        svg.setAttribute('overflow', 'visible');
        const [type, color, order] = classify(name);
        const visible = isCopperLayer({ type }) || type === '顶层丝印' || type === '底层丝印' || type === '钻孔';
        next.push({ id, name, type, color, order, box, svg, rawSvg: result.svg, units: result.units, visible, opacity: type === '顶层丝印' ? 1 : .85 });
      } catch (error) { notes.push(`${name}：无法绘制，${error.message}`); }
    }
    if (!next.length) throw new Error('未能绘制任何图层。请检查文件格式或解析提示。');
    layers = next.sort((a, b) => a.order - b.order); layerFilter = null; soloState = null; selectedLayerId = null;
    if (!layers.some(l => l.visible)) layers[layers.length - 1].visible = true;
    updateLayerStack(false);
    bounds = layerBounds(layers);
    mirrored = false; $('two-top').setAttribute('aria-pressed', 'true'); $('two-bottom').setAttribute('aria-pressed', 'false'); $('world').removeAttribute('transform');
    $('project').textContent = title || Array.from(files).map(f => f.name).join('、');
    $('project').title = $('project').textContent;
    $('count').textContent = layers.length; $('empty').hidden = true;
    document.body.classList.remove('empty-state');
    $('dimensions').textContent = `图形范围 ${(bounds[2] - bounds[0]).toFixed(2)} × ${(bounds[3] - bounds[1]).toFixed(2)} mm`;
    renderControls(); fit(); showNotes(notes);
    $('status').textContent = `已载入 ${layers.length} 个图层${notes.length ? ' · 有解析提示' : ''}`;
  } catch (error) { showNotes([error.message, ...notes]); $('diagnostics').open = true; $('status').textContent = error.message; if (!layers.length) { $('empty-error').textContent = [error.message, ...notes].join('\n'); $('empty-error').hidden = false; } }
  finally { loading(false); $('files').value = ''; updateTools(); }
}
function toggleSolo(layer) {
  if (busy || !layers.includes(layer)) return;
  if (soloState?.id === layer.id) {
    layers.forEach(l => { l.visible = soloState.visibility.get(l.id) ?? l.visible; }); soloState = null;
  } else {
    // Switching solo targets keeps the visibility settings from before solo mode.
    if (!soloState) soloState = { id: layer.id, visibility: new Map(layers.map(l => [l.id, l.visible])) };
    soloState.id = layer.id; layers.forEach(l => { l.visible = l === layer; });
  }
  renderControls();
}
function selectLayerRow(id) {
  selectedLayerId = id;
  document.querySelectorAll('.layer').forEach(row => row.classList.toggle('selected', row.dataset.layerId === id));
}
function renderControls() {
  $('layers').replaceChildren();
  const rank = layer => layer.type === '顶层铜箔' ? 0 : layer.type.startsWith('内层') ? 1 : layer.type === '底层铜箔' ? 2 : /顶层丝印/.test(layer.type) ? 3 : /底层丝印/.test(layer.type) ? 4 : /阻焊/.test(layer.type) ? 5 : /锡膏/.test(layer.type) ? 6 : layer.type === '板框' ? 7 : layer.type === '钻孔' ? 8 : 9;
  const list = [...layers].sort((a, b) => rank(a) - rank(b) || a.order - b.order);
  if (!list.some(l => l.id === selectedLayerId && (layerFilter === null || isCopperLayer(l) === layerFilter))) selectedLayerId = list.find(l => layerFilter === null || isCopperLayer(l) === layerFilter)?.id || null;
  list.forEach(layer => {
    const row = document.createElement('div'); row.className = 'layer'; row.dataset.layerId = layer.id; row.classList.toggle('selected', selectedLayerId === layer.id); row.style.setProperty('--layer-color', layer.color);
    row.tabIndex = 0; row.setAttribute('aria-label', `调整 ${layer.name} 图层`);
    row.addEventListener('pointerdown', () => selectLayerRow(layer.id)); row.addEventListener('focusin', () => selectLayerRow(layer.id));
    row.hidden = layerFilter !== null && isCopperLayer(layer) !== layerFilter;
    const top = document.createElement('div'); top.className = 'layer-top';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = layer.visible; check.id = `check-${layer.id}`;
    const swatch = document.createElement('input'); swatch.type = 'color'; swatch.value = layer.color; swatch.className = 'swatch'; swatch.setAttribute('aria-label', `${layer.name} 颜色`);
    const label = document.createElement('label'); label.htmlFor = check.id;
    const name = document.createElement('span'); name.className = 'layer-name'; name.textContent = layer.type;
    const file = document.createElement('span'); file.className = 'filename'; file.textContent = layer.name; file.title = layer.name;
    label.append(name, file);
    const solo = document.createElement('button'); solo.textContent = '单独'; solo.className = 'solo'; solo.title = soloState?.id === layer.id ? '再次点击恢复之前的图层显示' : `仅显示 ${layer.name}`; solo.setAttribute('aria-label', `${layer.name}：${solo.title}`); solo.setAttribute('aria-pressed', String(soloState?.id === layer.id));
    top.append(check, swatch, label, solo);
    const opacity = document.createElement('div'); opacity.className = 'opacity';
    const opacityTitle = document.createElement('span'); opacityTitle.className = 'opacity-title'; opacityTitle.textContent = '不透明度';
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '100'; slider.value = Math.round(layer.opacity * 100); slider.setAttribute('aria-label', `${layer.name} 不透明度`);
    const output = document.createElement('output'); output.textContent = `${slider.value}%`;
    opacity.append(opacityTitle, slider, output); row.append(top, opacity); $('layers').append(row);
    function update() { layer.svg.style.display = layer.visible ? '' : 'none'; layer.svg.style.color = layer.color; layer.svg.style.opacity = layer.opacity; row.classList.toggle('off', !layer.visible); syncLayerGroups(); }
    check.onchange = () => { soloState = null; layer.visible = check.checked; renderControls(); };
    swatch.oninput = () => { layer.color = swatch.value; row.style.setProperty('--layer-color', layer.color); update(); };
    slider.oninput = () => { layer.opacity = Number(slider.value) / 100; output.textContent = `${slider.value}%`; update(); };
    solo.onclick = () => toggleSolo(layer); update();
  });
  if (layers.length && !layers.some(l => layerFilter === null || isCopperLayer(l) === layerFilter)) {
    const empty = document.createElement('div'); empty.className = 'layer-empty'; empty.textContent = '当前文件没有此类图层'; $('layers').append(empty);
  }
  syncLayerGroups();
}
function isCopperLayer(layer) { return /^(顶层铜箔|底层铜箔|内层)/.test(layer.type); }
function restoreDefaultVisibility() {
  if (busy || !layers.length) return;
  soloState = null;
  layers.forEach(layer => { layer.visible = isCopperLayer(layer) || layer.type === '顶层丝印' || layer.type === '底层丝印' || layer.type === '钻孔'; });
  renderControls();
}
function syncLayerGroups() {
  for (const [id, copper] of [['layers-all', null], ['copper-only', true], ['non-copper-only', false]]) {
    $(id).setAttribute('aria-pressed', String(layerFilter === copper));
  }
  const category = layerFilter === null ? '全部图层' : layerFilter ? '铜箔层' : '非铜箔层';
  $('all').title = `显示当前分类中的所有图层（${category}）`;
  $('none').title = `隐藏当前分类中的所有图层（${category}）`;
}
function selectLayerGroup(copper) {
  if (busy) return;
  layerFilter = copper; renderControls();
}
function setCategoryVisibility(visible) {
  if (busy) return;
  soloState = null;
  layers.forEach(layer => {
    if (layerFilter === null || isCopperLayer(layer) === layerFilter) layer.visible = visible;
  });
  renderControls();
}
function updateTools() { for (const id of ['all', 'none', 'restore-default', 'layers-all', 'copper-only', 'non-copper-only', 'fit', 'minus', 'plus', 'two-top', 'two-bottom', 'export', 'export-png', 'export-jpg', 'mode-3d']) $(id).disabled = !layers.length || busy; }
function setViewMode(three, showProgress = true) {
  if (three && (!layers.length || busy)) return;
  ViewLoading.cancel();
  if (three) flushView();
  $('mode-2d').setAttribute('aria-pressed', String(!three)); $('mode-3d').setAttribute('aria-pressed', String(three));
  $('tools-2d').hidden = three; $('tools-3d').hidden = !three; $('layers').hidden = three; document.querySelector('.layer-actions').hidden = three;
  $('layer-splitter').hidden = three; $('layer-panel').classList.toggle('sidebar-three', three);
  $('exports-2d').disabled = three; $('exports-3d').disabled = !three;
  $('export-hint').textContent = three ? '当前为三维视图，导出二维图像请先切换到“二维布线”。' : '当前为二维视图，导出三维图像请先切换到“3D 裸板”。';
  $('board').style.visibility = three ? 'hidden' : ''; $('scale').hidden = three || !view; $('viewport').classList.toggle('mode-three', three);
  document.querySelector('.workspace').classList.toggle('workspace-three', three);
  document.querySelector('.canvas-help').textContent = three ? '拖动旋转 · 滚轮缩放 · 右键平移 · 双击复位' : '拖动平移 · 滚轮缩放 · 双击适应';
  if (three) PCB3D.enter(layers); else window.PCB3D?.exit();
  if (!three) {
    applyView(true);
    if (showProgress && layers.length) {
      const token = ViewLoading.begin('正在准备二维图层…');
      ViewLoading.paint().then(() => {
        if (window.PCB3D?.isActive()) return;
        flushView(); ViewLoading.update(token, 85, '正在绘制二维视图…');
        return ViewLoading.finish(token);
      });
    }
  }
}
$('mode-2d').onclick = () => setViewMode(false); $('mode-3d').onclick = () => setViewMode(true);
function layerBounds(items) { return items.reduce((b, l) => [Math.min(b[0], l.box[0]), Math.min(b[1], l.box[1]), Math.max(b[2], l.box[0] + l.box[2]), Math.max(b[3], l.box[1] + l.box[3])], [Infinity, Infinity, -Infinity, -Infinity]); }
function fit() {
  if (!bounds) return;
  const visible = layers.filter(l => l.visible);
  const b = visible.length ? layerBounds(visible) : bounds;
  if (mirrored) { const x = b[0]; b[0] = bounds[0] + bounds[2] - b[2]; b[2] = bounds[0] + bounds[2] - x; }
  const rect = $('viewport').getBoundingClientRect(), aspect = rect.width / rect.height;
  let w = (b[2] - b[0]) * 1.18, h = (b[3] - b[1]) * 1.18;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  view = [(b[0] + b[2] - w) / 2, (b[1] + b[3] - h) / 2, w, h]; originalView = [...view]; applyView(true);
}
function applyView(metricsChanged = false) {
  if (!view) return; viewMetricsDirty ||= metricsChanged;
  // Pointer events update logical coordinates immediately; paint only the latest view.
  if (!viewFrame) viewFrame = requestAnimationFrame(renderView);
}
function renderView() {
  viewFrame = 0; if (!view || window.PCB3D?.isActive()) return;
  // Read layout before DOM writes, and skip all ruler work during plain panning.
  let percentage, scaleWidth, scaleLabel;
  if (viewMetricsDirty) {
    const pixelsPerMm = $('viewport').clientWidth / view[2];
    if (pixelsPerMm > 0) {
      const target = 90 / pixelsPerMm, power = 10 ** Math.floor(Math.log10(target));
      const mm = [1, 2, 5, 10].map(n => n * power).reverse().find(n => n <= target) || power;
      percentage = `${Math.round(originalView[2] / view[2] * 100)}%`; scaleWidth = `${mm * pixelsPerMm}px`; scaleLabel = `${Number(mm.toPrecision(3))} mm`; viewMetricsDirty = false;
    }
  }
  const box = view.join(' '); if (box !== lastViewBox) { $('board').setAttribute('viewBox', box); lastViewBox = box; }
  if (percentage !== undefined) {
    if (percentage !== lastZoom) { $('zoom').value = percentage; lastZoom = percentage; }
    if (scaleWidth !== lastScaleWidth) { $('scale-line').style.width = scaleWidth; lastScaleWidth = scaleWidth; }
    if (scaleLabel !== lastScaleLabel) { $('scale-label').textContent = scaleLabel; lastScaleLabel = scaleLabel; }
    if ($('scale').hidden) $('scale').hidden = false;
  }
}
function flushView() { if (viewFrame) { cancelAnimationFrame(viewFrame); viewFrame = 0; renderView(); } }
function zoom(factor, px = .5, py = .5) { if (!view) return; const ratio = originalView[2] / (view[2] * factor); if (ratio < .05 || ratio > 200) return; view = [view[0] + view[2] * px * (1 - factor), view[1] + view[3] * py * (1 - factor), view[2] * factor, view[3] * factor]; applyView(true); }
$('fit').onclick = fit; $('plus').onclick = () => zoom(.8); $('minus').onclick = () => zoom(1.25);
function updateLayerStack(bottom) {
  function depth(layer) {
    if (/^(钻孔|钻孔图|板框)$/.test(layer.type)) return 100 + layer.order;
    let z = layer.order;
    if (/^顶层/.test(layer.type)) z = /铜箔/.test(layer.type) ? 40 : /阻焊/.test(layer.type) ? 60 : /锡膏/.test(layer.type) ? 70 : 80;
    else if (/^底层/.test(layer.type)) z = /铜箔/.test(layer.type) ? -40 : /阻焊/.test(layer.type) ? -60 : /锡膏/.test(layer.type) ? -70 : -80;
    return bottom ? -z : z;
  }
  $('world').replaceChildren(...[...layers].sort((a, b) => depth(a) - depth(b)).map(layer => layer.svg));
}
function setBoardSide(bottom) {
  if (!bounds || busy || mirrored === bottom) return;
  mirrored = bottom;
  $('two-top').setAttribute('aria-pressed', String(!bottom));
  $('two-bottom').setAttribute('aria-pressed', String(bottom));
  if (bottom) $('world').setAttribute('transform', `translate(${bounds[0] + bounds[2]} 0) scale(-1 1)`);
  else $('world').removeAttribute('transform');
  updateLayerStack(bottom);
  fit();
}
$('two-top').onclick = () => setBoardSide(false);
$('two-bottom').onclick = () => setBoardSide(true);
$('grid').onclick = () => { $('grid').setAttribute('aria-pressed', String($('viewport').classList.toggle('grid'))); };
$('all').onclick = () => setCategoryVisibility(true); $('none').onclick = () => setCategoryVisibility(false);
$('restore-default').onclick = restoreDefaultVisibility;
$('copper-only').onclick = () => selectLayerGroup(true); $('non-copper-only').onclick = () => selectLayerGroup(false);
$('layers-all').onclick = () => selectLayerGroup(null);
for (const id of ['open', 'empty-open']) $(id).onclick = () => $('files').click();
$('files').onchange = e => openFiles(e.target.files);
const vp = $('viewport');
vp.addEventListener('wheel', e => { if (!view || busy || window.PCB3D?.isActive()) return; e.preventDefault(); const r = vp.getBoundingClientRect(); zoom(Math.exp(Math.max(-100, Math.min(100, e.deltaY)) * .0025), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); }, { passive: false });
const pointers = new Map(); let gesture = null;
function setupGesture() { const p = [...pointers.values()]; if (!view || !p.length) { gesture = null; return; } gesture = { view: [...view], rect: vp.getBoundingClientRect(), point: p[0], center: p.length > 1 ? [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2] : p[0], distance: p.length > 1 ? Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) : 0 }; }
vp.addEventListener('pointerdown', e => { if (!view || busy || e.button !== 0 || window.PCB3D?.isActive() || e.target.closest('button,input,select,textarea,.view-loading')) return; e.preventDefault(); window.getSelection()?.removeAllRanges(); pointers.set(e.pointerId, [e.clientX, e.clientY]); vp.setPointerCapture(e.pointerId); setupGesture(); });
vp.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId) || !gesture) return; if (e.pointerType === 'mouse' && (e.buttons & 1) === 0) { pointers.delete(e.pointerId); setupGesture(); return; } e.preventDefault(); pointers.set(e.pointerId, [e.clientX, e.clientY]); const p = [...pointers.values()], g = gesture, r = g.rect;
  if (p.length > 1 && g.distance > 0) { const dist = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); const factor = g.distance / Math.max(dist, 1); const nw = g.view[2] * factor, nh = g.view[3] * factor; const ratio = originalView[2] / nw; if (ratio < .05 || ratio > 200) return; const center = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]; view = [g.view[0] + (g.center[0] - r.left) / r.width * g.view[2] - (center[0] - r.left) / r.width * nw, g.view[1] + (g.center[1] - r.top) / r.height * g.view[3] - (center[1] - r.top) / r.height * nh, nw, nh]; }
  else view = [g.view[0] - (p[0][0] - g.point[0]) * g.view[2] / r.width, g.view[1] - (p[0][1] - g.point[1]) * g.view[3] / r.height, g.view[2], g.view[3]]; applyView(p.length > 1);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) vp.addEventListener(name, e => { pointers.delete(e.pointerId); setupGesture(); });
vp.ondblclick = e => { if (e.target.closest('button') || window.PCB3D?.isActive()) return; fit(); };
vp.addEventListener('selectstart', e => e.preventDefault());
vp.addEventListener('dragstart', e => e.preventDefault());
function cancelCanvasDrag() {
  const ids = [...pointers.keys()]; pointers.clear(); gesture = null;
  for (const id of ids) if (vp.hasPointerCapture(id)) vp.releasePointerCapture(id);
}
window.addEventListener('blur', cancelCanvasDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) cancelCanvasDrag(); });
document.addEventListener('keydown', e => { if (e.target.matches('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return; if (e.key.toLowerCase() === 'f') { e.preventDefault(); fit(); } if (e.key === '+' || e.key === '=') zoom(.8); if (e.key === '-') zoom(1.25); });
let dragDepth = 0; document.addEventListener('dragenter', e => { if (!e.dataTransfer.types.includes('Files')) return; e.preventDefault(); dragDepth++; if (!busy) $('drop-hint').hidden = false; });
document.addEventListener('dragover', e => { e.preventDefault(); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-hint').hidden = true; } });
document.addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop-hint').hidden = true; openFiles(e.dataTransfer.files); });
new ResizeObserver(() => { if (view) { const r = vp.getBoundingClientRect(); if (!r.width || !r.height) return; const h = view[2] * r.height / r.width; view[1] += (view[3] - h) / 2; view[3] = h; if (pointers.size) setupGesture(); applyView(true); } }).observe(vp);
$('export').onclick = () => {
  if (!layers.length) return;
  const shown = layers.filter(l => l.visible); if (!shown.length) { $('status').textContent = '请先显示至少一个图层再导出。'; return; }
  const b = layerBounds(shown); if (mirrored) { const x = b[0]; b[0] = bounds[0] + bounds[2] - b[2]; b[2] = bounds[0] + bounds[2] - x; }
  const svg = $('board').cloneNode(true); svg.removeAttribute('id'); const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * .03;
  svg.setAttribute('viewBox', [b[0] - p, b[1] - p, w + 2 * p, h + 2 * p].join(' ')); svg.setAttribute('width', `${w + 2 * p}mm`); svg.setAttribute('height', `${h + 2 * p}mm`);
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('x', b[0] - p); bg.setAttribute('y', b[1] - p); bg.setAttribute('width', w + 2 * p); bg.setAttribute('height', h + 2 * p); bg.setAttribute('fill', '#0b131c'); svg.prepend(bg);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })); const a = document.createElement('a'); a.href = url; a.download = 'gerber-view.svg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); $('status').textContent = '已导出当前可见图层 SVG';
};
updateTools();
async function exportRaster(type) {
  if (busy || !view) return;
  if (!layers.some(l => l.visible)) { $('status').textContent = '请先显示至少一个图层再导出。'; return; }
  flushView();
  const button = $(type === 'image/png' ? 'export-png' : 'export-jpg'); button.disabled = true;
  try {
    const rect = $('viewport').getBoundingClientRect(), factor = Math.min(2, 4096 / Math.max(rect.width, rect.height));
    const blob = await PCBExports.svgImage($('board'), Math.max(1, Math.round(rect.width * factor)), Math.max(1, Math.round(rect.height * factor)), $('png-transparent').checked, type);
    PCBExports.download(blob, type === 'image/png' ? 'gerber-view.png' : 'gerber-view.jpg'); $('status').textContent = '已导出当前二维视图';
  } catch (error) { $('status').textContent = error.message; } finally { button.disabled = busy || !layers.length; }
}
$('export-png').onclick = () => exportRaster('image/png'); $('export-jpg').onclick = () => exportRaster('image/jpeg');
// Optional WebMCP interface; unavailable browsers retain the complete UI.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => { }); } catch { } };
  register({ name: 'get_gerber_layers', description: '列出当前打开的 Gerber 图层及可见状态。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: () => ({ layers: layers.map(({ id, name, type, visible, opacity }) => ({ id, name, type, visible, opacity })), busy }) });
  register({ name: 'set_gerber_visible_layers', description: '一次设置要显示的图层 ID，其他图层隐藏，并适应窗口。', inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: input => { if (busy) throw new Error('文件正在解析。'); if (!input || !Array.isArray(input.ids) || input.ids.some(id => !layers.some(l => l.id === id))) throw new Error('图层 ID 无效。'); soloState = null; layers.forEach(l => l.visible = input.ids.includes(l.id)); renderControls(); fit(); return { visibleIds: layers.filter(l => l.visible).map(l => l.id) }; } });
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
