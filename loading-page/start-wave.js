/* Own one playback, from the frame beneath the pointer to an empty scene. */
(() => {
  'use strict';
  window.playStartWave = (world, {motion, pointer}) => {
    const bounds=world.getBoundingClientRect();
    const width=bounds.width, height=bounds.height;
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced=!motion || media.matches;
    const art=document.getElementById('world-art');
    const scale=Math.min(width/art.naturalWidth,height/art.naturalHeight);
    const xb=(width-art.naturalWidth*scale)/2, yb=(height-art.naturalHeight*scale)/2;
    const options={width,height,dpr:Math.min(window.devicePixelRatio||1,1.5),
      imageBounds:world.dataset.display==='contain'?{left:xb,top:yb,right:width-xb,bottom:height-yb}:null};
    let canvas=document.getElementById('start-wave');
    let photo, renderer, name='fade';

    // A canvas cannot change its context type after WebGL has claimed it.
    function freshCanvas() {
      const next=canvas.cloneNode(false);
      canvas.replaceWith(next);
      canvas=next;
    }
    try {
      // Capture before changing state: disabling the spatial camera returns it to neutral.
      photo=window.captureStartWaveScene(world);
      if (photo && !reduced) {
        if (location.protocol!=='file:') {
          if (canvas.dataset.renderer && canvas.dataset.renderer!=='webgl') freshCanvas();
          renderer=window.createStartWaveGL?.(canvas,photo,options);
        }
        if (renderer) name='webgl';
        else {
          freshCanvas();
          renderer=window.createStartWave2D?.(canvas,photo,options);
          if (renderer) name='2d';
        }
      }
      if (photo && !renderer) {
        freshCanvas();
        canvas.width=photo.width; canvas.height=photo.height;
        const flat=canvas.getContext('2d');
        if(flat) {
          flat.drawImage(photo,0,0);
          renderer={draw(t){canvas.style.opacity=String(1-t);return true;},dispose(){canvas.width=canvas.height=1;}};
        }
      }
    } catch { /* Fade the live scene if the browser cannot produce a snapshot. */ }

    let tx=0,ty=0;
    function aim(e) {
      tx=Math.max(-1,Math.min(1,2*(e.clientX-bounds.left)/width-1));
      ty=Math.max(-1,Math.min(1,2*(e.clientY-bounds.top)/height-1));
    }
    if(pointer) aim(pointer);
    let x=tx,y=ty;
    canvas.style.opacity='';
    canvas.dataset.renderer=name;
    try {
      if (renderer?.draw(0,x,y)===false) throw new Error('Start frame unavailable');
    } catch {
      renderer?.dispose();
      renderer=null;
      canvas.dataset.renderer=name='fade';
    }
    const liveFade=!renderer;
    world.classList.toggle('wave-live-fade',liveFade);
    world.dataset.state='starting';
    window.dispatchEvent(new Event('infinite:starttransition'));

    const duration=name==='fade'||liveFade?180:2600;
    let resolve, id=0, done=false;
    const finished=new Promise(complete=>{resolve=complete;});
    let start,previous;
    function stop(completed) {
      if(done) return;
      done=true;
      cancelAnimationFrame(id);
      world.removeEventListener('pointermove',aim);
      document.removeEventListener('visibilitychange',visibility);
      media.removeEventListener('change',preference);
      window.removeEventListener('pagehide',skip);
      window.removeEventListener('resize',resize);
      if(completed) world.dataset.state='start-ended';
      renderer?.dispose();
      renderer=null; photo=null;
      canvas.style.opacity='';
      world.classList.remove('wave-live-fade');
      if(completed) window.dispatchEvent(new Event('infinite:starttransitionend'));
      resolve(completed);
    }
    function skip() { stop(true); }
    function visibility() { if(document.hidden) skip(); }
    function preference() { if(media.matches) skip(); }
    function resize() {
      const b=world.getBoundingClientRect();
      if(Math.abs(b.width-width)>8||Math.abs(b.height-height)>8) skip();
    }
    function frame(now) {
      if(done) return;
      if(start===undefined) start=previous=now;
      const t=Math.min(1,(now-start)/duration);
      const follow=1-Math.exp(-(now-previous)/100);
      previous=now;
      x+=(tx-x)*follow; y+=(ty-y)*follow;
      try {
        if (renderer?.draw(t,x,y)===false) { skip(); return; }
      } catch { skip(); return; }
      if(t>=1) skip();
      else id=requestAnimationFrame(frame);
    }
    world.addEventListener('pointermove',aim,{passive:true});
    document.addEventListener('visibilitychange',visibility);
    media.addEventListener('change',preference);
    window.addEventListener('pagehide',skip);
    window.addEventListener('resize',resize,{passive:true});
    if(document.hidden) skip();
    else id=requestAnimationFrame(frame);
    return {finished,cancel:()=>stop(false)};
  };
})();
