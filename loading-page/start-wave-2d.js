/* A smaller set of projected cubes for local files and devices without instanced WebGL. */
(() => {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  const ease = x => { x = clamp(x); return x*x*(3-2*x); };
  const crest = x => x > 0 && x < 1 ? Math.sin(Math.PI*x)**2 : 0;

  window.createStartWave2D = (canvas, photo, options) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const {width, height} = options;
    const dpr = Math.min(1.25, options.dpr || 1);
    canvas.width = Math.max(1, Math.round(width*dpr));
    canvas.height = Math.max(1, Math.round(height*dpr));
    const w = canvas.width, h = canvas.height;
    const side = Math.ceil(Math.max(w/40, h/28, 15*dpr));
    const cols = Math.ceil(w/side), rows = Math.ceil(h/side);
    const focal = Math.max(h*1.5, side*24), radius = Math.hypot(w,h)*.5;
    const sourceX = photo.width/w, sourceY = photo.height/h;

    const probe = document.createElement('canvas');
    probe.width = cols; probe.height = rows;
    const sampler = probe.getContext('2d', {willReadFrequently: true});
    let colors;
    try {
      sampler.drawImage(photo,0,0,w/side,h/side);
      colors = sampler.getImageData(0,0,cols,rows).data;
    } catch { /* Local file pixels can still be painted without reading them. */ }
    const bounds = options.imageBounds;
    const tiles = [];
    for (let row=0; row<rows; row++) for (let col=0; col<cols; col++) {
      const x=col*side, y=row*side, cx=x+side/2, cy=y+side/2;
      const rx=cx-w/2, ry=cy-h/2, r=Math.hypot(rx,ry);
      const i=4*(row*cols+col), noise=((col*431+row*887)%101)/101;
      const visible = colors ? colors[i+3]>3 : !bounds ||
        (cx/dpr>=bounds.left && cx/dpr<=bounds.right && cy/dpr>=bounds.top && cy/dpr<=bounds.bottom);
      const rgb = colors ? [colors[i],colors[i+1],colors[i+2]] : [76,65,64];
      const shade = k => 'rgb('+rgb.map(c=>Math.round((c*.77+13)*k)).join(',')+')';
      tiles.push({x,y,cx,cy,nx:rx/(r||1),ny:ry/(r||1),noise,visible,
        onset:.427*r/radius*(1+.036*Math.sin(3*Math.atan2(ry,rx))),
        split:.293+.035*noise,life:.19+.025*noise,shadow:shade(.49),light:shade(.83)});
    }

    function polygon(a,b,c,d, color) {
      ctx.fillStyle=color;
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]);
      ctx.lineTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.closePath(); ctx.fill();
    }

    function drawCube(tile,x,y,z,size,rx,ry,textureX,textureY,patch,eyeX,eyeY) {
      if (size<.25) return;
      const ax=Math.cos(rx), bx=Math.sin(rx), ay=Math.cos(ry), by=Math.sin(ry);
      function point(u,v,k) {
        const dx=u*ay + (v*bx+k*ax)*by, dy=v*ax-k*bx;
        const depth=z + (v*bx+k*ax)*ay-u*by;
        const zoom=focal/(focal-depth);
        return [w/2+(x-w/2+dx+depth*eyeX)*zoom, h/2+(y-h/2+dy+depth*eyeY)*zoom];
      }
      const s=size/2;
      const a=point(-s,-s,0), b=point(s,-s,0), c=point(s,s,0), d=point(-s,s,0);
      const aa=point(-s,-s,-size),bb=point(s,-s,-size),cc=point(s,s,-size),dd=point(-s,s,-size);
      const facing=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])>0;
      if(facing(b,a,aa)) polygon(b,a,aa,bb,tile.light);
      if(facing(c,b,bb)) polygon(c,b,bb,cc,tile.shadow);
      if(facing(d,c,cc)) polygon(d,c,cc,dd,tile.shadow);
      if(facing(a,d,dd)) polygon(a,d,dd,aa,tile.light);
      if (!facing(a,b,d)) { polygon(aa,bb,cc,dd,tile.shadow); return; }
      ctx.save();
      ctx.transform((b[0]-a[0])/patch,(b[1]-a[1])/patch,(d[0]-a[0])/patch,(d[1]-a[1])/patch,a[0],a[1]);
      ctx.drawImage(photo,textureX*sourceX,textureY*sourceY,patch*sourceX,patch*sourceY,0,0,patch,patch);
      ctx.restore();
    }

    function draw(time, px=0, py=0) {
      ctx.clearRect(0,0,w,h);
      if (time>=1) return true;
      ctx.drawImage(photo,0,0,w,h);
      if (time<=0) return true;
      const active=[];
      for (const tile of tiles) {
        const age=time-tile.onset;
        if (age<=0) continue;
        ctx.clearRect(tile.x,tile.y,side,side);
        if (!tile.visible || age>=tile.split+tile.life) continue;
        // Match the single outward crest and settled fracture pose of WebGL.
        const lift=1.9*crest(clamp(age/tile.split));
        active.push({tile,age,lift});
      }
      active.sort((a,b)=>a.lift-b.lift);
      const eyeX=-.19+px*.15, eyeY=-.36+py*.14;
      for (const {tile,age,lift} of active) {
        const raised=ease(age/.075), z=(lift+.29*raised)*side;
        const pitch=.58*Math.sin(2*Math.PI*clamp(age/tile.split))+.12*raised;
        const rx=tile.ny*pitch, ry=-tile.nx*pitch;
        if (age<tile.split) {
          drawCube(tile,tile.cx,tile.cy,z,side*(1-.048*raised),rx,ry,tile.x,tile.y,side,eyeX,eyeY);
          continue;
        }
        const t=clamp((age-tile.split)/tile.life), drift=side*t*t*(2-t);
        const small=side*.5, span=small*(1-ease((t-.18)/.82));
        ctx.globalAlpha=1-ease((t-.58)/.39);
        for(let i=0;i<4;i++) {
          const k=i%2, j=Math.floor(i/2), sx=k-.5, sy=j-.5;
          drawCube(tile,tile.cx+sx*small+(tile.nx*1.9+sx*1.8)*drift,
            tile.cy+sy*small+(tile.ny*1.9+sy*2+.8*t)*drift,z+drift*(i%3+.3),
            span,rx+t*sy*2.3,ry+t*sx*2.8,tile.x+k*small,tile.y+j*small,small,eyeX,eyeY);
        }
        ctx.globalAlpha=1;
      }
      return true;
    }
    return {draw,dispose(){ canvas.width=canvas.height=1; }};
  };
})();
