/* Millimeter geometry shared by the 3D viewer and geometry verification. */
(function(scope){
  'use strict';
  const area=ring=>ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
  const box=rings=>rings.flat().reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
  const close=ring=>{const p=ring.map(p=>[p[0],p[1]]);if(p.length&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])>1e-8)p.push([...p[0]]);return p;};
  function circle(x,y,r,count=32){return Array.from({length:count},(_,i)=>[x+Math.cos(i/count*Math.PI*2)*r,y+Math.sin(i/count*Math.PI*2)*r]);}
  function capsule(a,b,r){const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);return [...Array.from({length:17},(_,i)=>{const t=angle-Math.PI/2+i*Math.PI/16;return [b[0]+r*Math.cos(t),b[1]+r*Math.sin(t)];}),...Array.from({length:17},(_,i)=>{const t=angle+Math.PI/2+i*Math.PI/16;return [a[0]+r*Math.cos(t),a[1]+r*Math.sin(t)];})];}
  function styleWalls(geometry,center,holes,platedHoles){
    const p=geometry.attributes.position,n=geometry.attributes.normal,plated=new Set(platedHoles);
    const rings=holes.map(r=>({ring:r,bounds:box([r]),plated:plated.has(r)}));
    const onRing=(x,y,r)=>r.some((a,i)=>{
      const b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
      if(!length)return false;
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/length));
      return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<.0001;
    });
    const normals=new Map(),smooth=[],key=(i,material)=>[p.getX(i).toFixed(5),p.getY(i).toFixed(5),material].join(',');
    geometry.clearGroups();let start=0,last=-1;
    for(let i=0;i<p.count;i+=3){
      const zs=[p.getZ(i),p.getZ(i+1),p.getZ(i+2)],cap=Math.max(...zs)-Math.min(...zs)<1e-6;
      let material=cap?(zs[0]>0?0:1):2;
      if(!cap){
        const xs=[p.getX(i),p.getX(i+1),p.getX(i+2)],ys=[p.getY(i),p.getY(i+1),p.getY(i+2)];
        const x=(Math.min(...xs)+Math.max(...xs))/2+center[0],y=(Math.min(...ys)+Math.max(...ys))/2+center[1];
        const ring=rings.find(r=>x>=r.bounds[0]-.0001&&x<=r.bounds[2]+.0001&&y>=r.bounds[1]-.0001&&y<=r.bounds[3]+.0001&&onRing(x,y,r.ring));
        if(ring){
          material=ring.plated?3:2;
          for(let j=i;j<i+3;j++){
            const k=key(j,material),v=new THREE.Vector3().fromBufferAttribute(n,j),pool=normals.get(k)||[];
            // Count each adjacent face once, regardless of its triangulation.
            if(!pool.some(a=>a.dot(v)>.999999))pool.push(v);
            normals.set(k,pool);smooth.push([j,k]);
          }
        }
      }
      if(material!==last){if(last!==-1)geometry.addGroup(start,i-start,last);start=i;last=material;}
    }
    geometry.addGroup(start,p.count-start,last);
    for(const [i,k] of smooth){
      const original=new THREE.Vector3().fromBufferAttribute(n,i),average=new THREE.Vector3();
      // Smooth curved hole walls, retaining sharp slot corners and flat board faces.
      for(const v of normals.get(k))if(v.dot(original)>.7071)average.add(v);
      average.normalize();n.setXYZ(i,average.x,average.y,average.z);
    }
    n.needsUpdate=true;
  }
  function build(outer,cutouts,holes,thickness,platedHoles=holes){
    if(!Number.isFinite(thickness)||thickness<.2||thickness>6)throw new Error('板厚应为 0.2–6 mm。');
    if(outer.length<3||Math.abs(area(outer))<.01)throw new Error('板框无效。');
    if(holes.length>2000)throw new Error('三维建模一次最多支持 2000 个钻孔/槽孔。');
    const b=box([outer]);
    if(b[2]-b[0]>1000||b[3]-b[1]>1000)throw new Error('板框超过 1000 mm，请检查坐标单位或板框来源。');
    const candidates=holes.filter(r=>{const h=box([r]);return h[2]>b[0]&&h[0]<b[2]&&h[3]>b[1]&&h[1]<b[3];});
    let polygons=[[close(outer),...cutouts.map(close)]];
    // Boolean subtraction also handles overlapping drills and castellated edge holes.
    for(let i=0;i<candidates.length;i+=100)polygons=scope.polygonClipping.difference(polygons,...candidates.slice(i,i+100).map(r=>[close(r)]));
    if(!polygons.length)throw new Error('钻孔或内切区域覆盖了整个板框，请检查图层选择。');
    const center=[(b[0]+b[2])/2,(b[1]+b[3])/2];
    const shapes=polygons.map(poly=>{
      const shape=new THREE.Shape(poly[0].map(p=>new THREE.Vector2(p[0]-center[0],p[1]-center[1])));
      shape.holes=poly.slice(1).map(r=>new THREE.Path(r.map(p=>new THREE.Vector2(p[0]-center[0],p[1]-center[1]))));return shape;
    });
    const extruded=new THREE.ExtrudeGeometry(shapes,{depth:thickness,bevelEnabled:false,steps:1,curveSegments:12});
    // Parameterized ExtrudeGeometry JSON rebuilds default UVs and discards edits.
    // Store explicit buffers so HTML export retains UVs, centered Z and face groups.
    const geometry=new THREE.BufferGeometry().copy(extruded);
    delete geometry.parameters; // Three.js r147 copy also copies constructor parameters.
    extruded.dispose();
    geometry.translate(0,0,-thickness/2);
    const uv=geometry.getAttribute('uv'),pos=geometry.getAttribute('position');
    for(let i=0;i<uv.count;i++)uv.setXY(i,(pos.getX(i)+center[0]-b[0])/(b[2]-b[0]),(pos.getY(i)+center[1]-b[1])/(b[3]-b[1]));
    uv.needsUpdate=true;geometry.computeBoundingBox();
    styleWalls(geometry,center,candidates,platedHoles);
    return {geometry,polygons,bounds:b,center,thickness,drillCount:candidates.length,area:polygons.reduce((sum,p)=>sum+Math.abs(area(p[0]))-p.slice(1).reduce((s,h)=>s+Math.abs(area(h)),0),0)};
  }
  function stl(geometry){
    const g=geometry.index?geometry.toNonIndexed():geometry, p=g.getAttribute('position'), triangles=p.count/3;
    const buffer=new ArrayBuffer(84+triangles*50),data=new DataView(buffer);
    new Uint8Array(buffer,0,80).set(new TextEncoder().encode('Gerber Lab bare PCB; coordinates in millimeters'));
    data.setUint32(80,triangles,true);let offset=84;
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),edge=new THREE.Vector3();
    for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);normal.subVectors(c,b).cross(edge.subVectors(a,b)).normalize();for(const v of [normal,a,b,c])for(const n of [v.x,v.y,v.z]){data.setFloat32(offset,n,true);offset+=4;}data.setUint16(offset,0,true);offset+=2;}
    if(g!==geometry)g.dispose();return buffer;
  }
  scope.PCBModel={area,box,close,circle,capsule,build,stl};
})(globalThis);
