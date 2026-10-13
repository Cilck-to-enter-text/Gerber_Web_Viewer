(function(scope){
  'use strict';
  const $=id=>document.getElementById(id);
  let renderer,scene,camera,controls,mesh,viaOverlay,model,active=false,building=false,queued=false,revision=0,currentLayers=[],cached=new Map();
  const NS='http://www.w3.org/2000/svg';
  function vectorData(layer){
    if(cached.has(layer.id))return cached.get(layer.id);
    const doc=new DOMParser().parseFromString(layer.rawSvg,'image/svg+xml');
    // Remove only the renderer's outer Y reflection; work in physical Gerber XY.
    for(const child of doc.documentElement.children)if(child.tagName==='g')child.removeAttribute('transform');
    const paths=new THREE.SVGLoader().parse(new XMLSerializer().serializeToString(doc).replaceAll('currentColor','#000000')).paths;
    const k=layer.units==='in'?.0254:.001;
    const result=paths.flatMap(path=>path.subPaths.map(sub=>({
      points:sub.getPoints(24).map(p=>[p.x*k,p.y*k]),
      closed:sub.autoClose,style:path.userData.style,width:Number(path.userData.style.strokeWidth||0)*k
    }))).filter(p=>p.points.length>1);
    cached.set(layer.id,result);return result;
  }
  function near(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])<.03;}
  function loops(layer){
    const data=vectorData(layer).filter(p=>p.width>0&&p.style.stroke!=='none');
    const done=[],open=[];
    for(const p of data){if(p.closed||near(p.points[0],p.points.at(-1)))done.push(p.points);else open.push(p.points);}
    // Board outlines may be split into independently plotted line/arc segments.
    if(open.length<500){while(open.length){let ring=open.shift(),changed=true;while(changed&&!near(ring[0],ring.at(-1))){changed=false;for(let i=0;i<open.length;i++){let p=open[i];if(near(ring.at(-1),p.at(-1)))p=[...p].reverse();if(near(ring.at(-1),p[0])){ring.push(...p.slice(1));open.splice(i,1);changed=true;break;}}}if(near(ring[0],ring.at(-1)))done.push(ring);}}
    return done.filter(r=>r.length>=4&&Math.abs(PCBModel.area(r))>.1).sort((a,b)=>Math.abs(PCBModel.area(b))-Math.abs(PCBModel.area(a)));
  }
  function copperBounds(){
    let selected=currentLayers.filter(l=>/铜箔/.test(l.type));
    if(!selected.length)selected=currentLayers.filter(l=>l.type!=='钻孔图'&&l.type!=='钻孔');
    if(!selected.length)throw new Error('请先导入铜层或板框文件。');
    return selected.reduce((b,l)=>[Math.min(b[0],l.box[0]),Math.min(b[1],-l.box[1]-l.box[3]),Math.max(b[2],l.box[0]+l.box[2]),Math.max(b[3],-l.box[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  }
  function getOutline(){
    const choice=$('outline-source').value,b=copperBounds();
    const rectangular=()=>{
      const w=Number($('pcb-width').value),h=Number($('pcb-height').value),x=(b[0]+b[2]-w)/2,y=(b[1]+b[3]-h)/2;
      if(!(w>0&&h>0&&w<=1000&&h<=1000))throw new Error('矩形宽高应大于 0 且不超过 1000 mm。');
      return {outer:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],cuts:[],note:'矩形估算：以铜层范围为中心；请按实际板尺寸修正。',estimated:true};
    };
    if(choice==='rectangle')return rectangular();
    const explicit=choice==='auto'?currentLayers.find(l=>l.type==='板框'):currentLayers.find(l=>l.id===choice);
    if(explicit){const rings=loops(explicit);if(!rings.length)throw new Error(`${explicit.name} 未找到闭合的板框线，请选择其他图层或矩形估算。`);return {outer:rings[0],cuts:explicit.type==='板框'?rings.slice(1):[],note:`板框中心线：${explicit.name}。请确认外框与内切槽。`,estimated:false};}
    // PADS references often include the board perimeter in the copper files.
    for(const layer of currentLayers.filter(l=>/顶层铜箔|底层铜箔/.test(l.type))){
      const rings=loops(layer);
      for(const ring of rings){const r=PCBModel.box([ring]),w=b[2]-b[0],h=b[3]-b[1];
        if(Math.abs(r[0]-b[0])<.5&&Math.abs(r[1]-b[1])<.5&&Math.abs(r[2]-b[2])<.5&&Math.abs(r[3]-b[3])<.5&&Math.abs(PCBModel.area(ring))>w*h*.8){return {outer:ring,cuts:[],note:`从 ${layer.name} 提取外框中心线；请核对外形。`,estimated:false};}
      }
    }
    return rectangular();
  }
  function getDrills(){
    const holes=[],platedHoles=[],notes=[];
    for(const layer of currentLayers.filter(l=>l.type==='钻孔')){
      const nonPlated=/npth|non[\s_-]*plated|unplated|非金属化|非镀铜/i.test(layer.name);
      const add=ring=>{holes.push(ring);if(!nonPlated)platedHoles.push(ring);};
      for(const p of vectorData(layer)){
        if(p.style.fill!=='none'&&(p.closed||near(p.points[0],p.points.at(-1))))add(p.points);
        else if(p.width>0&&p.style.stroke!=='none'){
          const a=p.points[0],b=p.points.at(-1),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
          const straight=length>0&&p.points.every(v=>Math.abs((v[0]-a[0])*(b[1]-a[1])-(v[1]-a[1])*(b[0]-a[0]))/length<.005);
          if(straight)add(PCBModel.capsule(a,b,p.width/2));else notes.push(`${layer.name}：曲线铣槽未转换为三维孔。`);
        }
      }
    }
    if(!currentLayers.some(l=>l.type==='钻孔'))notes.push('未导入 Excellon 钻孔文件，模型没有通孔。');
    if(platedHoles.length)notes.push('未标为 NPTH 的钻孔按金属孔壁预览，混合钻孔文件无法逐孔判断镀铜。');
    return {holes,platedHoles,notes:[...new Set(notes)]};
  }
  async function layerImage(layer,color,b,w,h){
    const root=document.createElementNS(NS,'svg');root.setAttribute('xmlns',NS);root.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');root.setAttribute('width',w);root.setAttribute('height',h);root.setAttribute('viewBox',[b[0],-b[3],b[2]-b[0],b[3]-b[1]].join(' '));
    const svg=layer.svg.cloneNode(true);svg.style.display='';svg.style.opacity='1';svg.style.color=color;root.append(svg);
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(root)],{type:'image/svg+xml'}));
    try{return await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`${layer.name} 表面纹理生成失败。`));img.src=url;});}finally{URL.revokeObjectURL(url);}
  }
  async function surface(side,b){
    const ratio=(b[2]-b[0])/(b[3]-b[1]),width=Math.max(64,Math.round(2048*Math.min(1,ratio))),height=Math.max(64,Math.round(2048*Math.min(1,1/ratio)));
    const create=()=>{const c=document.createElement('canvas');c.width=width;c.height=height;return c;};
    const canvas=create(),ctx=canvas.getContext('2d');
    const masked=$('pcb-mask').checked,maskColor=$('pcb-color').value==='custom'?$('pcb-custom-color').value:$('pcb-color').value;
    ctx.fillStyle=masked?maskColor:'#786844';ctx.fillRect(0,0,width,height);
    const draw=async(layers,color,target=ctx)=>{for(const l of layers)target.drawImage(await layerImage(l,color,b,width,height),0,0);};
    const copper=currentLayers.filter(l=>l.type===`${side}层铜箔`),masks=currentLayers.filter(l=>l.type===`${side}层阻焊开窗`);
    const coveredCopper='#'+new THREE.Color(maskColor).lerp(new THREE.Color('#89a58a'),.24).getHexString();
    await draw(copper,masked?coveredCopper:'#d8ac62');
    if(masked&&masks.length){
      const exposed=create(),e=exposed.getContext('2d');await draw(copper,'#dfb76d',e);
      const openings=create(),o=openings.getContext('2d');await draw(masks,'#ffffff',o);
      e.globalCompositeOperation='destination-in';e.drawImage(openings,0,0);ctx.drawImage(exposed,0,0);
    }
    if($('pcb-silk').checked)await draw(currentLayers.filter(l=>l.type===`${side}层丝印`),'#f4f2d8');
    const texture=new THREE.CanvasTexture(canvas);texture.encoding=THREE.sRGBEncoding;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();return texture;
  }
  function init(){
    if(renderer)return;
    if(!scope.THREE||!scope.polygonClipping)throw new Error('三维组件未加载，请确认 vendor 文件夹完整。');
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputEncoding=THREE.sRGBEncoding;
    $('three-canvas').append(renderer.domElement);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.01,10000);camera.up.set(0,1,0);
    controls=new ViewControls(camera,renderer.domElement);controls.addEventListener('change',render);
    scene.add(new THREE.HemisphereLight(0xe5f4ff,0x5e5143,.65));
    const light=new THREE.DirectionalLight(0xffffff,1.1);light.position.set(-50,40,100);scene.add(light);
    const back=new THREE.DirectionalLight(0xb5d3ff,.65);back.position.set(30,-50,-80);scene.add(back);
    const fill=new THREE.DirectionalLight(0xf4e9d8,.4);fill.position.set(80,20,25);scene.add(fill);
    const rim=new THREE.DirectionalLight(0xdceaff,.35);rim.position.set(-70,-20,-25);scene.add(rim);
    new ResizeObserver(resize).observe($('three-canvas'));
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('model-note').textContent='显卡上下文已中断，请刷新网页重新打开文件。';});
    renderer.domElement.addEventListener('dblclick',()=>orient('top'));resize();
  }
  function resize(){if(!renderer)return;const r=$('three-canvas').getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();}
  function render(){if(active&&renderer){PCBViaView.update(scene,$('three-canvas').clientHeight);renderer.render(scene,camera);}}
  function disposeMesh(){if(viaOverlay){scene.remove(viaOverlay);viaOverlay.geometry.dispose();viaOverlay.material.dispose();viaOverlay=null;}if(mesh){scene.remove(mesh);mesh.geometry.dispose();for(const m of mesh.material){m.map?.dispose();m.dispose();}mesh=null;}model=null;}
  function orient(direction){if(!model)return;const w=model.bounds[2]-model.bounds[0],h=model.bounds[3]-model.bounds[1],distance=Math.max(h,w/Math.max(camera.aspect,.2))*1.8;controls.target.set(0,0,0);camera.position.set(0,0,direction==='bottom'?-distance:distance);camera.up.set(0,1,0);$('three-top').setAttribute('aria-pressed',String(direction==='top'));$('three-bottom').setAttribute('aria-pressed',String(direction==='bottom'));controls.update();render();}
  async function rebuild(){
    if(building){queued=true;return;}if(!currentLayers.length)return;
    building=true;const token=++revision;$('model-build').disabled=true;setExportEnabled(false);$('model-note').textContent='正在生成板体和表面…';
    let next,top,bottom;
    const progressToken=ViewLoading.begin('正在准备三维模型…');
    try{
      await ViewLoading.paint();
      init();ViewLoading.update(progressToken,15,'正在识别板框和钻孔…');
      await ViewLoading.paint();const outline=getOutline(),drills=getDrills();
      ViewLoading.update(progressToken,30,'正在生成板体与孔洞…');await ViewLoading.paint();
      next=PCBModel.build(outline.outer,outline.cuts,drills.holes,Number($('pcb-thickness').value),drills.platedHoles);
      ViewLoading.update(progressToken,55,'正在生成正反面纹理…');await ViewLoading.paint();
      [top,bottom]=await Promise.all([surface('顶',next.bounds),surface('底',next.bounds)]);
      ViewLoading.update(progressToken,85,'正在组装三维场景…');await ViewLoading.paint();
      if(token!==revision){next.geometry.dispose();top.dispose();bottom.dispose();return;}
      disposeMesh();model=next;
      const materials=[new THREE.MeshStandardMaterial({map:top,roughness:.58,metalness:.12}),new THREE.MeshStandardMaterial({map:bottom,roughness:.58,metalness:.12}),new THREE.MeshStandardMaterial({color:0xa99a61,roughness:.92,metalness:0}),new THREE.MeshStandardMaterial({color:0x948777,roughness:.72,metalness:.18})];
      mesh=new THREE.Mesh(next.geometry,materials);scene.add(mesh);
      viaOverlay=PCBViaView.create(next,drills.platedHoles,top,bottom);if(viaOverlay)scene.add(viaOverlay);PCBViaView.bind(scene);
      resize();orient('top');
      $('model-note').textContent=[outline.note,'板厚由你设置，Gerber 不提供板厚。',...drills.notes].join(' ');
      $('model-size').textContent=`${(next.bounds[2]-next.bounds[0]).toFixed(2)} × ${(next.bounds[3]-next.bounds[1]).toFixed(2)} × ${next.thickness} mm · ${next.drillCount} 个孔/槽`;
      setExportEnabled(true);
    }catch(e){next?.geometry?.dispose();top?.dispose();bottom?.dispose();$('model-note').textContent=`建模失败：${e.message}`;}
    finally{await ViewLoading.finish(progressToken);building=false;$('model-build').disabled=false;if(queued&&active){queued=false;rebuild();}}
  }
  function enter(layers){
    currentLayers=layers;cached.clear();active=true;$('three-canvas').hidden=false;$('three-settings').hidden=false;
    const select=$('outline-source');select.replaceChildren();
    for(const [value,label] of [['auto','自动识别'],['rectangle','矩形估算'],...layers.filter(l=>/板框|铜箔|图形层/.test(l.type)).map(l=>[l.id,l.name])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    syncRectangleSettings();
    try{const b=copperBounds();$('pcb-width').value=(b[2]-b[0]).toFixed(2);$('pcb-height').value=(b[3]-b[1]).toFixed(2);}catch{}
    rebuild();
  }
  function exit(){active=false;++revision;$('three-canvas').hidden=true;$('three-settings').hidden=true;}
  function syncRectangleSettings(){$('rectangle-settings').hidden=$('outline-source').value!=='rectangle';}
  $('outline-source').addEventListener('change',syncRectangleSettings);
  $('pcb-color').addEventListener('change',()=>{$('custom-mask-settings').hidden=$('pcb-color').value!=='custom';});
  $('model-build').onclick=rebuild;$('three-top').onclick=()=>orient('top');$('three-bottom').onclick=()=>orient('bottom');
  $('export-stl').onclick=()=>{if(!model||building)return;const url=URL.createObjectURL(new Blob([PCBModel.stl(model.geometry)],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download='bare-pcb-mm.stl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  function setExportEnabled(enabled){for(const id of ['export-stl','export-html','three-png','three-jpg'])$(id).disabled=!enabled;}
  async function screenshot(type){
    if(!model||building||!active)return;
    const button=$(type==='image/png'?'three-png':'three-jpg');button.disabled=true;
    try{render();const canvas=PCBExports.snapshotCanvas(renderer.domElement,type==='image/png'&&$('three-transparent').checked);const blob=await PCBExports.canvasBlob(canvas,type);PCBExports.download(blob,type==='image/png'?'pcb-3d.png':'pcb-3d.jpg');}
    catch(error){$('model-note').textContent=`截图失败：${error.message}`;}finally{button.disabled=building||!model;}
  }
  $('three-png').onclick=()=>screenshot('image/png');$('three-jpg').onclick=()=>screenshot('image/jpeg');
  $('export-html').onclick=async()=>{
    if(!model||building)return;const button=$('export-html');button.disabled=true;button.textContent='正在打包…';
    try{
      await new Promise(resolve=>setTimeout(resolve,0));if(!model||building)return;
      const payload={scene:scene.toJSON(),bounds:model.bounds,fileName:$('project').textContent,label:$('model-size').textContent,camera:{position:camera.position.toArray(),up:camera.up.toArray(),target:controls.target.toArray(),fov:camera.fov}};
      const html=PCBExports.standaloneHtml(payload,window.PCB_EXPORT_RUNTIME);PCBExports.download(new Blob([html],{type:'text/html;charset=utf-8'}),'bare-pcb-3d.html');
    }catch(error){$('model-note').textContent=`HTML 导出失败：${error.message}`;}finally{button.disabled=building||!model;button.textContent='导出 HTML';}
  };
  scope.PCB3D={enter,exit,resize,isActive:()=>active};
})(globalThis);
