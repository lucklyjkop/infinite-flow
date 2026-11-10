/* Cached alpha silhouettes supply roof/foliage contacts, not DOM rectangles. */
(() => {
  'use strict';
  const SIZE=64;
  function create(assets){
    const masks=new Map(),scratch=document.createElement('canvas');scratch.width=scratch.height=SIZE;
    const context=scratch.getContext('2d',{willReadFrequently:true});
    function mask(image,column,row,columns,rows){
      const key=[image.src,column,row].join(':');if(masks.has(key))return masks.get(key);
      context.clearRect(0,0,SIZE,SIZE);const w=image.naturalWidth/columns,h=image.naturalHeight/rows;
      context.drawImage(image,column*w,row*h,w,h,0,0,SIZE,SIZE);
      const pixels=context.getImageData(0,0,SIZE,SIZE).data,alpha=new Uint8Array(SIZE*SIZE),tops=[];
      for(let i=0;i<alpha.length;i++)alpha[i]=pixels[i*4+3];
      for(let x=2;x<SIZE-2;x+=2)for(let y=1;y<SIZE-6;y++){
        if(alpha[y*SIZE+x]>100&&alpha[(y+1)*SIZE+x]>100){tops.push({u:(x+.5)/SIZE,v:(y+.5)/SIZE});break;}
      }
      const result={alpha,tops};masks.set(key,result);return result;
    }
    // Read image alpha once, before weather starts; no readbacks in animation.
    for(const key of ['landmarks','bamboo','snow'])for(let i=0;i<6;i++)mask(assets[key],i%3,Math.floor(i/3),3,2);
    for(let i=0;i<12;i++)mask(assets.props,i%4,Math.floor(i/4),4,3);
    let builds=0;
    function sample(pages,{camera,pageWidth,width,height,progress,offsetX=0,offsetY=0}){
      if(progress<.94)return [];
      const ground=[],sprites=[],bodies=[];
      for(const page of pages){
        if(page.el.hidden)continue;const offset=page.index*pageWidth-camera;
        for(const p of page.renderer.getWeatherSurfaces())if(p.x+offset>=0&&p.x+offset<width)ground.push({...p,x:p.x+offset+offsetX,y:p.y+offsetY});
        const atlas=page.data.theme==='bamboo'?assets.bamboo:page.data.theme==='snow'?assets.snow:assets.landmarks;
        const items=[...Array.from(page.nodes.children,(node,i)=>({el:node.querySelector('.world-landmark'),mask:mask(atlas,i%3,Math.floor(i/3),3,2),light:page.data.stages[i].lighted?1:.48,id:page.index+':landmark:'+i})),...Array.from(page.props.children,(el,i)=>({el,mask:mask(assets.props,page.decorations[i].type%4,Math.floor(page.decorations[i].type/4),4,3),light:el.dataset.lighted==='true'?1:.48,id:page.index+':prop:'+i}))];
        for(const item of items){
          const r=item.el.getBoundingClientRect();if(r.right<0||r.left>width||r.bottom<0||r.top>height||!r.width||!r.height)continue;
          bodies.push({rect:r,alpha:item.mask.alpha});
          for(let i=0;i<item.mask.tops.length;i++){const p=item.mask.tops[i],x=r.left+p.u*r.width,y=r.top+p.v*r.height;if(x<0||x>=width||y<0||y>=height)continue;sprites.push({x,y,kind:'scenery',light:item.light,id:item.id+':'+i});}
        }
      }
      // Discard ground contacts hidden behind a painted building or tree.
      const points=ground.filter(p=>!bodies.some(({rect:r,alpha})=>p.x>=r.left&&p.x<r.right&&p.y>=r.top&&p.y<r.bottom&&alpha[Math.floor((p.y-r.top)/r.height*SIZE)*SIZE+Math.floor((p.x-r.left)/r.width*SIZE)]>90));
      // Keep contact density balanced: large ground planes still receive most rain.
      const stride=Math.max(1,Math.ceil(sprites.length/Math.max(1,points.length*.65)));
      for(let i=0;i<sprites.length;i+=stride)points.push(sprites[i]);builds++;return points;
    }
    return {sample,getState:()=>({maskCount:masks.size,builds}),dispose(){masks.clear();scratch.width=scratch.height=1;}};
  }
  window.InfiniteWeatherSurfaces=Object.freeze({create});
})();
