/* Save-bound portrait blobs stay in IndexedDB rather than growing JSON saves. */
(() => {
  'use strict';
  let database;
  const error=message=>Object.assign(new Error(message),{userMessage:message});
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      const request=indexedDB.open('infinite-player-portraits',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('portraits');
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
      request.onerror=()=>{database=null;reject(error('形象未能读取，请检查浏览器存储权限。'));};
      request.onblocked=()=>{database=null;reject(error('形象存储暂时忙碌，请关闭其他旧页面后重试。'));};
    });return database;
  }
  async function transaction(mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('portraits',mode),request=action(tx.objectStore('portraits'));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(error('形象未能保存，原图片已保留。'));});}
  async function encode(file){
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw error('请选择 PNG、JPG 或 WebP 图片。');
    if(file.size>12*1024*1024)throw error('图片请控制在 12 MB 以内。');
    const url=URL.createObjectURL(file),image=new Image();
    try{
      image.src=url;await image.decode();const w=image.naturalWidth,h=image.naturalHeight;
      if(!w||!h||w*h>32000000||Math.max(w,h)>16384)throw error('图片尺寸过大，请缩小后重试。');
      const scale=Math.min(1,1200/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.9));canvas.width=canvas.height=1;
      if(!blob||blob.size>2*1024*1024)throw error('图片未能处理，请换一张图片。');
      return blob;
    }catch(cause){throw cause.userMessage?cause:error('图片无法打开，请选择有效的图片文件。');}
    finally{URL.revokeObjectURL(url);}
  }
  async function put(id,file){const blob=await encode(file);if(!window.InfiniteSaves.get(id))throw error('这份存档已不存在。');await transaction('readwrite',store=>store.put(blob,id));if(!window.InfiniteSaves.get(id)){await remove(id);throw error('这份存档已不存在。');}return blob;}
  const get=id=>transaction('readonly',store=>store.get(id));
  const remove=id=>transaction('readwrite',store=>store.delete(id));
  window.addEventListener('infinite:savedeleted',e=>{void remove(e.detail.id).catch(()=>{});});
  window.InfinitePortraits=Object.freeze({get,put,remove});
})();
