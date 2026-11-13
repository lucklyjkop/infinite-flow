/* Prepare the actual playable scenes during the opening, including hidden CSS
   plates. Retained decoded images complement the browser's normal HTTP cache;
   no save data, API replies or credentials are stored by this loader. */
(() => {
  'use strict';
  const images = new Map(), complete = new Set(), listeners = new Set();
  const dynamicImages = [
    'assets/spatial-photo/plate.webp', 'assets/spatial-photo/portrait.webp',
    'assets/deity-space/nai-plate.webp', 'assets/deity-space/nai-portrait.webp',
  ];
  let job = null, ready = false, progress = 0, total = 0, finished = 0;
  let failed = [], fallbacks = [];
  function imageURL(value, base = document.baseURI) {
    try {
      const url = new URL(value, base);
      return url.origin === location.origin && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname) ? url.href : null;
    } catch { return null; }
  }
  function discoverImages() {
    const urls = new Set();
    const add = (value, base) => { const url = imageURL(value, base); if (url) urls.add(url); };
    const fromCSS = (value, base) => {
      for (const match of (value || '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(match[1], base);
    };
    function rules(list, base) {
      for (const rule of list) {
        if (rule.style) fromCSS(rule.style.cssText, base);
        if (rule.cssRules) rules(rule.cssRules, base);
      }
    }
    for (const sheet of document.styleSheets) {
      // External styles are not part of this site's resource bundle.
      try { rules(sheet.cssRules, sheet.href || document.baseURI); } catch {}
    }
    for (const image of document.querySelectorAll('img')) {
      add(image.currentSrc || image.src);
      for (const part of (image.srcset || '').split(',')) add(part.trim().split(/\s+/)[0]);
    }
    for (const source of document.querySelectorAll('picture source')) {
      for (const part of (source.srcset || '').split(',')) add(part.trim().split(/\s+/)[0]);
    }
    for (const element of document.querySelectorAll('[style]')) fromCSS(element.getAttribute('style'));
    dynamicImages.forEach(value => add(value));
    return [...urls];
  }
  function decodeImage(url) {
    if (images.has(url)) return images.get(url).promise;
    const image = new Image();
    image.decoding = 'async';
    const entry = {image, promise:null};
    entry.promise = new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer); image.onload = image.onerror = null;
        if (error) { images.delete(url); reject(error); } else resolve(image);
      };
      const timer = setTimeout(() => finish(new Error('Image preparation timed out.')), 30000);
      image.onerror = () => finish(new Error('Image preparation failed.'));
      image.onload = async () => {
        try {
          await image.decode(); if (!image.naturalWidth) throw new Error('Empty image.');
          // A successful cache refill does not repair an earlier failed DOM img.
          // Restore those elements too, so the ready scene can actually paint.
          for (const element of document.querySelectorAll('img')) {
            if (!element.complete || element.naturalWidth || imageURL(element.currentSrc || element.src) !== url) continue;
            const source = element.getAttribute('src');
            element.removeAttribute('src'); element.src = source || url;
            await element.decode();
          }
          finish();
        }
        catch (error) { finish(error); }
      };
      image.src = url;
    });
    images.set(url, entry);
    return entry.promise;
  }
  function notify() {
    progress = total ? Math.min(99, finished / total * 99) : 0;
    listeners.forEach(listener => listener(progress));
  }
  function task(key, weight, run) { return {key, weight, run}; }
  function bounded(run) {
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('Scene preparation timed out.')),45000);
      Promise.resolve().then(run).then(value => { clearTimeout(timer); resolve(value); },error => { clearTimeout(timer); reject(error); });
    });
  }
  async function runTasks(tasks, concurrency) {
    let index = 0;
    await Promise.all(Array.from({length:Math.min(concurrency,tasks.length)}, async () => {
      while (index < tasks.length) {
        const item = tasks[index++];
        try {
          if (!complete.has(item.key)) { await bounded(item.run); complete.add(item.key); }
          finished += item.weight; notify();
        } catch { failed.push(item.key); }
      }
    }));
  }
  function requireAPI(owner, method) {
    if (typeof owner?.[method] !== 'function') throw new Error('Scene preparation is unavailable.');
    return owner[method]();
  }
  function prepare({onProgress} = {}) {
    if (ready) { onProgress?.(100); return Promise.resolve(getState()); }
    if (onProgress) { listeners.add(onProgress); onProgress(progress); }
    if (!job) {
      job = (async () => {
        failed = []; finished = 0;
        const pictures = discoverImages().map(url => task(url,1,() => decodeImage(url)));
        const scenes = [
          task('map-images',8,() => requireAPI(window.InfiniteWorldMap,'preload')),
          task('save-images',2,async () => {
            const value = await requireAPI(window.InfiniteSaveUI,'preload');
            if (!Array.isArray(value) || value.some(result => result === false)) throw new Error('Save images are incomplete.');
          }),
          task('system-images',3,async () => {
            const value = await requireAPI(window.InfiniteSystemSpace,'preload');
            if (!value?.complete) throw new Error('System images are incomplete.');
          }),
          task('deity-images',2,async () => {
            const value = await requireAPI(window.InfiniteDeitySpace,'preload');
            if (!value || value.failed > 0) throw new Error('Deity images are incomplete.');
          }),
          task('audio',3,async () => {
            const value = await requireAPI(window.InfiniteAudio,'preload');
            if (value?.ready === false) throw new Error('Audio files are incomplete.');
          }),
          task('character',10,async () => {
            const value = await requireAPI(window.InfiniteSystemLive2D,'prepare');
            // The existing illustration remains available on devices without
            // Cubism/WebGL support; it is a deliberate, visible fallback.
            if (!value?.ready) {
              if (value?.retryable !== false) throw new Error('Character resources are incomplete.');
              fallbacks.push('character-illustration');
            }
          }),
        ];
        const renderers = [
          task('map-preparation',10,() => requireAPI(window.InfiniteWorldMap,'prepare')),
          task('covenant-preparation',4,async () => {
            // Driver/context creation belongs to startup preparation, never the
            // first interactive click. Geometry and programs are retained.
            if (!await requireAPI(window.InfiniteCovenant,'preload')) throw new Error('Covenant preparation is incomplete.');
          }),
        ];
        total = [...pictures,...scenes,...renderers].reduce((sum,item) => sum + item.weight,0);
        notify();
        await Promise.all([runTasks(pictures,4),runTasks(scenes,3)]);
        if (!failed.length) await runTasks(renderers,1);
        if (failed.length) throw new Error('Startup assets are incomplete.');
        ready = true; progress = 100;
        listeners.forEach(listener => listener(100));
        return getState();
      })().finally(() => { job = null; listeners.clear(); });
    }
    return job;
  }
  function getState() {
    return {ready,loading:Boolean(job),progress,total,finished,decodedImages:images.size,failed:[...failed],fallbacks:[...fallbacks]};
  }
  window.InfiniteGamePreload = Object.freeze({prepare,getState});
})();
