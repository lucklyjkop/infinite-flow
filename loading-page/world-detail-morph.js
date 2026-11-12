/* Finite, demand-driven voxel morph. Uses existing artwork, never a new scene. */
(() => {
 'use strict';let active=null;
 const clamp=v=>Math.max(0,Math.min(1,v)),ease=v=>v*v*(3-2*v);
 function cancel(){active?.finish();}
 async function play(dialog,node,{reverse=false,motion=true}={}){
  cancel();if(!motion||document.hidden||!node)return;
  let stopped=false,frame=0,resolve;const done=new Promise(r=>resolve=r),art=node.querySelector('.world-landmark');
  const restore=art?.style.visibility||'';
  const canvas=document.createElement('canvas');canvas.className='world-detail-cubes';canvas.setAttribute('aria-hidden','true');
  const job={finish(){if(stopped)return;stopped=true;cancelAnimationFrame(frame);canvas.remove();dialog.classList.remove('is-cubing','is-morph-preparing');if(art)art.style.visibility=restore;window.removeEventListener('resize',job.finish);document.removeEventListener('visibilitychange',visibility);if(active===job)active=null;resolve();}};
  function visibility(){if(document.hidden)job.finish();}active=job;
  window.addEventListener('resize',job.finish);document.addEventListener('visibilitychange',visibility);
  dialog.classList.add('is-morph-preparing');
  try{
   await window.DeityReturnCapture.prepare(dialog);if(stopped)return;
   const rect=dialog.getBoundingClientRect(),origin=art.getBoundingClientRect();
   const image=new Image();image.src=innerWidth<=700||innerHeight<=720?'assets/world-detail/dossier-mobile.png':'assets/world-detail/dossier-panel.png';await image.decode();if(stopped)return;
   const atlas=new Image();atlas.src=art.style.backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];await atlas.decode();if(stopped)return;
   dialog.classList.remove('is-morph-preparing');
   const shot=window.captureSceneReturnFrame(dialog),surface=document.createElement('canvas');surface.width=shot.image.width;surface.height=shot.image.height;const sc=surface.getContext('2d');
   if(innerWidth<=700||innerHeight<=720){
    const edge=innerWidth<=700?27:28,scale=surface.width/rect.width,dx=[0,edge*scale,surface.width-edge*scale,surface.width],dy=[0,edge*scale,surface.height-edge*scale,surface.height],sx=[0,90,image.width-90,image.width],sy=[0,90,image.height-90,image.height];
    for(let y=0;y<3;y++)for(let x=0;x<3;x++)sc.drawImage(image,sx[x],sy[y],sx[x+1]-sx[x],sy[y+1]-sy[y],dx[x],dy[y],dx[x+1]-dx[x],dy[y+1]-dy[y]);
   }else sc.drawImage(image,0,0,surface.width,surface.height);sc.drawImage(shot.image,0,0);shot.image.width=shot.image.height=1;

   const column=Number(art.style.getPropertyValue('--column')),row=Number(art.style.getPropertyValue('--row'));
   const ratio=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);
   Object.assign(canvas.style,{left:-rect.x+'px',top:-rect.y+'px',width:innerWidth+'px',height:innerHeight+'px'});
   const ctx=canvas.getContext('2d'),cols=innerWidth<701?12:22,rows=Math.max(8,Math.round(cols*rect.height/rect.width)),w=rect.width/cols,h=rect.height/rows;
   const sample=document.createElement('canvas');sample.width=atlas.width;sample.height=atlas.height;const sampleCtx=sample.getContext('2d',{willReadFrequently:true});sampleCtx.drawImage(atlas,0,0);const pixels=sampleCtx.getImageData(0,0,sample.width,sample.height).data;
   const tiles=[];for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const seed=Math.sin(x*127.1+y*311.7)*43758.5453;const px=Math.floor((column+(x+.5)/cols)*atlas.width/3),py=Math.floor((row+(y+.5)/rows)*atlas.height/2);tiles.push({x,y,alpha:pixels[(py*atlas.width+px)*4+3]/255,n:seed-Math.floor(seed),delay:.16*(x/cols+y/rows)/2});}
   dialog.append(canvas);dialog.classList.add('is-cubing');art.style.visibility='hidden';const start=performance.now(),duration=reverse?780:980;
   function draw(now){if(stopped)return;const progress=clamp((now-start)/duration),timeline=reverse?1-progress:progress;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);
    for(const t of tiles){const local=clamp((timeline-t.delay)/(.84)),p=ease(local),arc=Math.sin(p*Math.PI),sw=origin.width/cols,sh=origin.height/rows;
     const ax=origin.x+(t.x+.5)*sw,ay=origin.y+(t.y+.5)*sh,bx=rect.x+(t.x+.5)*w,by=rect.y+(t.y+.5)*h;
     const cx=ax+(bx-ax)*p+(t.n-.5)*110*arc,cy=ay+(by-ay)*p-arc*(65+t.n*80),tw=sw+(w-sw)*p,th=sh+(h-sh)*p;
     const angle=(t.n-.5)*2.8*arc,depth=Math.min(w,h)*.43*arc,tilt=1-.42*arc;
     ctx.save();ctx.translate(cx,cy);ctx.rotate(angle*.45);ctx.scale(1,tilt);
     const side=(points,color)=>{ctx.beginPath();points.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();};
     ctx.globalAlpha=t.alpha+(1-t.alpha)*p;
     if(depth>.1){side([[-tw/2,th/2],[tw/2,th/2],[tw/2+depth,th/2+depth],[-tw/2+depth,th/2+depth]],'#111b1c');side([[tw/2,-th/2],[tw/2,th/2],[tw/2+depth,th/2+depth],[tw/2+depth,-th/2+depth]],'#30403b');}
     ctx.globalAlpha=1-clamp((p-.32)/.32);ctx.drawImage(atlas,(column+t.x/cols)*atlas.width/3,(row+t.y/rows)*atlas.height/2,atlas.width/3/cols,atlas.height/2/rows,-tw/2,-th/2,tw+.4,th+.4);
     ctx.globalAlpha=clamp((p-.32)/.32);ctx.drawImage(surface,t.x*surface.width/cols,t.y*surface.height/rows,surface.width/cols,surface.height/rows,-tw/2,-th/2,tw+.4,th+.4);
     ctx.restore();
    }
    if(progress<1)frame=requestAnimationFrame(draw);else job.finish();
   }frame=requestAnimationFrame(draw);await done;surface.width=surface.height=1;
  }catch(error){console.warn('World detail morph skipped',error);job.finish();}
 }
 window.InfiniteWorldDetailMorph=Object.freeze({play,cancel});
})();
