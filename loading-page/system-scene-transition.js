/* A complete source frame covers target preparation. Settled cubes uncover the
   live destination, including its weather, rather than cutting to it at the end. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  let current = null, last = null;
  function create(from) {
    if (!from?.image || !from.width || !from.height) throw new Error('页面画面尚未准备好，请重试。');
    current?.release();
    const layer = document.createElement('div');
    layer.id = 'system-scene-transition'; layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {position:'fixed',inset:'0',zIndex:'40',pointerEvents:'auto',overflow:'hidden',isolation:'isolate'});
    const hold = document.createElement('canvas'), canvas = document.createElement('canvas');
    for (const child of [hold,canvas]) Object.assign(child.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block'});
    hold.width=from.image.width;hold.height=from.image.height;
    hold.getContext('2d').drawImage(from.image,0,0);canvas.hidden=true;
    layer.append(hold,canvas);document.body.append(layer);
    let player=null,released=false,direction='right-to-left',progress=0;
    const columns=Math.max(8,Math.round(from.width/Math.sqrt(from.width*from.height/460)));
    const side=from.width/columns,rows=Math.ceil(from.height/side);
    const settled=new Float64Array(rows);
    function reveal(value) {
      progress=clamp(value);
      if(progress<=0){canvas.style.clipPath='none';return;}
      if(progress>=1){canvas.style.clipPath='inset(0 100% 0 0)';return;}
      for(let row=0;row<rows;row++){
        const v=(row+.5)*side/from.height;
        let count=0;
        for(let index=0;index<columns;index++){
          const column=direction==='right-to-left'?columns-1-index:index,u=(column+.5)/columns;
          const travel=direction==='right-to-left'?1-u:u;
          const threshold=(travel+.026*Math.sin(6*v)*Math.sin(Math.PI*u)+.34)/1.34;
          if(threshold>progress)break;
          count++;
        }
        settled[row]=count*side;
      }
      const rtl=direction==='right-to-left',points=[rtl?'0% 0%':'100% 0%'];
      for(let row=0;row<rows;row++){
        let safe=settled[row];
        for(let neighbor=Math.max(0,row-2);neighbor<=Math.min(rows-1,row+2);neighbor++)safe=Math.min(safe,settled[neighbor]);
        // The extra cell keeps lifted cube sides and shadows over their source.
        const edge=Math.max(0,Math.min(from.width,safe-side));
        const x=((rtl?from.width-edge:edge)/from.width*100).toFixed(4);
        points.push(`${x}% ${Math.min(100,row*side/from.height*100).toFixed(4)}%`,`${x}% ${Math.min(100,(row+1)*side/from.height*100).toFixed(4)}%`);
      }
      points.push(rtl?'0% 100%':'100% 100%');canvas.style.clipPath=`polygon(${points.join(',')})`;
    }
    const api=Object.freeze({
      async play(to,options={}){
        if(released||!to?.image)return false;
        direction=options.direction==='left-to-right'?'left-to-right':'right-to-left';
        if(!window.playDeityReturnWave)throw new Error('方块过渡尚未准备好。');
        player=window.playDeityReturnWave(canvas,from.image,to.image,{...options,width:from.width,height:from.height,direction,onProgress(value){reveal(value);options.onProgress?.(value);}});
        canvas.hidden=false;hold.remove();
        const completed=await player.finished;
        last=api.getState();return completed&&!released;
      },
      release(){if(released)return;last=api.getState();released=true;player?.cancel();layer.remove();hold.width=hold.height=canvas.width=canvas.height=1;if(current===api)current=null;},
      getState:()=>({visible:!released,progress,direction,stage:player?'wave':'preparing',wave:player?.getState()||null}),
    });
    current=api;return api;
  }
  window.InfiniteSceneTransition=Object.freeze({create,getState:()=>current?.getState()||{visible:false,last}});
})();
