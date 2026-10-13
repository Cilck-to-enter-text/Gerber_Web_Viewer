(function (scope) {
  'use strict';
  function download(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000); }
  function canvasBlob(canvas, type) { return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片编码失败。')), type, .94)); }
  async function svgImage(svg, width, height, transparent, type) {
    const clone = svg.cloneNode(true); clone.removeAttribute('id'); clone.setAttribute('width', width); clone.setAttribute('height', height); clone.style.visibility = '';
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    try {
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('图层图片生成失败。')); i.src = url; });
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
      if (!transparent || type === 'image/jpeg') { ctx.fillStyle = '#0b131c'; ctx.fillRect(0, 0, width, height); } ctx.drawImage(img, 0, 0, width, height);
      return await canvasBlob(canvas, type);
    } finally { URL.revokeObjectURL(url); }
  }
  function snapshotCanvas(source, transparent) { const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height; const ctx = canvas.getContext('2d'); if (!transparent) { ctx.fillStyle = '#0b131c'; ctx.fillRect(0, 0, canvas.width, canvas.height); } ctx.drawImage(source, 0, 0); return canvas; }
  function standaloneHtml(payload, runtime) {
    if (!runtime?.three || !runtime?.controls) throw new Error('离线导出组件未加载，请刷新页面。');
    // No user data is interpolated into executable JavaScript or HTML markup.
    const data = JSON.stringify(payload).replace(/</g, '\\u003c');
    const safeSource = s => s.replace(/<\/script/gi, '<\\/script');
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>裸 PCB 三维模型</title><style>
*{box-sizing:border-box}body{margin:0;background:#12212c;color:#e1ebf4;font:14px "Segoe UI","Microsoft YaHei",sans-serif}header{position:absolute;z-index:2;top:0;left:0;right:0;display:flex;align-items:center;gap:12px;padding:14px 18px;background:#111923de;flex-wrap:wrap}header strong{margin-right:auto;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.face-tools{position:absolute;z-index:2;bottom:19.8px;left:50%;transform:translateX(-50%);display:flex;gap:4.5px;padding:6.3px 9px;background:#111e28;border:.9px solid #304655;border-radius:10.8px;box-shadow:0 9px 22.5px #0003}button{font:12.6px "Segoe UI","Microsoft YaHei",sans-serif;min-height:32.4px;padding:6.3px 9px;border:0;border-radius:5.4px;background:transparent;color:#dce7ef;cursor:pointer;transition:background .15s}button:hover{background:#20333e}button[aria-pressed=true]{background:#70dfb9;color:#0c2b24}button[aria-pressed=true]:hover{background:#94edcc}button:focus-visible{outline:2px solid #70dfb9;outline-offset:3px}#viewer{position:absolute;inset:0 0 79.2px;background:#12212c}canvas{display:block;width:100%;height:100%;touch-action:none}footer{position:absolute;z-index:2;bottom:14px;left:18px;right:18px;color:#a3b7c8;font-size:12px;pointer-events:none}#loading{position:absolute;inset:0;display:grid;place-items:center;z-index:3;background:#0b131ce6;white-space:pre-wrap;padding:24px;text-align:center}footer{user-select:none}@media(max-width:700px){footer{bottom:78px;font-size:10.8px}}[hidden]{display:none!important}
</style></head><body><header><strong id="file-name">裸 PCB 三维模型</strong><span id="size"></span></header><nav class="face-tools" aria-label="查看方向"><button id="top" aria-pressed="true">顶面</button><button id="bottom" aria-pressed="false">底面</button></nav><div id="viewer"></div><footer>拖动旋转 · 滚轮缩放 · 右键平移 · 双击回到顶面 ｜ 独立离线文件</footer><div id="loading">正在加载三维模型…</div>
<script id="model-data" type="application/json">${data}</script>
<script>${safeSource(runtime.three)}</script><script>${safeSource(runtime.controls)}\n${safeSource(scope.PCBViaView?.source || '')}</script>
<script>
(function(){
const loading=document.getElementById('loading');
try{
  const data=JSON.parse(document.getElementById('model-data').textContent),host=document.getElementById('viewer');
  const fileName=data.fileName||'裸 PCB 三维模型';document.getElementById('file-name').textContent=fileName;document.getElementById('file-name').title=fileName;
  document.getElementById('size').textContent=data.label;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;host.append(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(data.camera.fov,1,.01,10000);
  const controls=new ViewControls(camera,renderer.domElement);let scene;
  const render=()=>{if(scene){globalThis.PCBViaView?.update(scene,host.clientHeight);renderer.render(scene,camera)}};controls.addEventListener('change',render);
  const resize=()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();render()};
  const face=sign=>{const b=data.bounds,w=b[2]-b[0],h=b[3]-b[1],d=Math.max(h,w/Math.max(.2,camera.aspect))*1.8;controls.target.set(0,0,0);camera.position.set(0,0,sign*d);camera.up.set(0,1,0);document.getElementById('top').setAttribute('aria-pressed',String(sign===1));document.getElementById('bottom').setAttribute('aria-pressed',String(sign===-1));controls.update();};
  document.getElementById('top').onclick=()=>face(1);document.getElementById('bottom').onclick=()=>face(-1);renderer.domElement.ondblclick=()=>face(1);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();loading.hidden=false;loading.textContent='显卡上下文已中断，请重新打开文件。';});
  let failed=false;const manager=new THREE.LoadingManager();manager.onError=()=>{failed=true;loading.hidden=false;loading.textContent='模型纹理加载失败，请重新导出文件。';};
  new THREE.ObjectLoader(manager).parse(data.scene,result=>{scene=result;globalThis.PCBViaView?.bind(scene);resize();face(1);if(!failed)loading.hidden=true;});
  window.addEventListener('resize',resize);resize();
}catch(error){loading.hidden=false;loading.textContent='无法打开三维模型：'+error.message+'\\n请使用支持 WebGL 的浏览器。';}
})();
</script></body></html>`;
  }
  scope.PCBExports = { download, canvasBlob, svgImage, snapshotCanvas, standaloneHtml };
})(globalThis);
