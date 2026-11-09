/* Real Cubism MOC3 playback. One stopped-by-default ticker owns model and render
   updates; application inputs are written before physics, never after it. */
(() => {
  'use strict';
  const MODEL_URL = 'assets/live2d/hongzhuang/hongzhuang.model3.json?v=eye-alignment-2';
  const CORE_URL = 'runtime/live2dcubismcore.min.js';
  const VENDOR_URL = 'vendor/live2d/live2d-vendor.js';
  const scripts = new Map();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  let loading = null, app = null, model = null, resizeObserver = null;
  let mount = null, root = null, core = null, parameters = null;
  let prepared = false, attached = false, paused = true, disposed = false;
  let attachSerial = 0, elapsed = 0, dt = 1 / 60, frames = 0;
  let lookX = 0, lookY = 0, blinkAt = -10, nextBlink = 2.6, greetAt = -10, speechLevel = 0;
  let phase = 'idle', error = '', physicsOutputs = [], parameterIds = [];
  let originalNatural = null, originalCoreUpdate = null;
  let debugPose = null;
  const smooth = new Map(), lookup = new Map(), outputIds = new Set();
  const drawn = {};
  const reduced = () => media.matches || window.InfiniteSettings?.getState?.().motion === false;
  const visible = () => Boolean(root && !root.hidden && !document.hidden);

  function script(url, ready) {
    if (ready()) return Promise.resolve();
    if (scripts.has(url)) return scripts.get(url);
    const promise = new Promise((resolve, reject) => {
      const element = document.createElement('script');
      const timeout = setTimeout(() => finish(new Error('Live2D runtime load timed out.')), 30000);
      function finish(failure) {
        clearTimeout(timeout); element.onload = element.onerror = null;
        if (failure) { element.remove(); scripts.delete(url); reject(failure); }
        else resolve();
      }
      element.src = url;
      element.onload = () => finish(ready() ? null : new Error('Live2D runtime did not initialise.'));
      element.onerror = () => finish(new Error('Live2D runtime is unavailable.'));
      document.head.append(element);
    });
    scripts.set(url, promise);
    return promise;
  }
  async function json(url) {
    const response = await fetch(url, {cache:'no-cache', signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`Live2D asset unavailable (${response.status}).`);
    return response.json();
  }
  function targets() {
    if (debugPose) return {
      ParamAngleX:0,ParamAngleY:0,ParamAngleZ:0,ParamBodyAngleX:0,ParamBodyAngleY:0,ParamBodyAngleZ:0,
      ParamEyeBallX:0,ParamEyeBallY:0,ParamEyeLOpen:1,ParamEyeROpen:1,ParamMouthOpenY:0,ParamMouthForm:0,ParamBreath:.5,
      ...debugPose,
    };
    const still = reduced(), t = elapsed;
    if (!still && t >= nextBlink) { blinkAt = t; nextBlink = t + 2.8 + Math.random() * 2.9; }
    const b = t - blinkAt;
    const eyes = still ? 1 : b < 0 ? 1 : b < .075 ? 1 - b / .075 : b < .12 ? 0 : b < .25 ? (b - .12) / .13 : 1;
    const age = t - greetAt;
    const greeting = !still && age >= 0 && age < 1.25 ? Math.sin(age / 1.25 * Math.PI) : 0;
    const x = still ? 0 : lookX, y = still ? 0 : lookY;
    return {
      ParamAngleX: still ? 0 : x * 12 + Math.sin(t * .55) * 1.8,
      ParamAngleY: still ? 0 : -y * 9 - greeting * 6 + Math.sin(t * .7) * .8,
      ParamAngleZ: still ? 0 : -x * 2 + Math.sin(t * .65) * 1,
      ParamBodyAngleX: still ? 0 : x * 2.2 + Math.sin(t * .6) * 1,
      ParamBodyAngleY: 0,
      ParamBodyAngleZ: still ? 0 : Math.sin(t * .6 + .2) * .7,
      ParamEyeBallX: x * .65, ParamEyeBallY: -y * .5,
      ParamEyeLOpen: eyes, ParamEyeROpen: eyes,
      ParamMouthOpenY: still ? 0 : speechLevel, ParamMouthForm: greeting * .45,
      ParamBreath: still ? .5 : (Math.sin(t * 1.75) + 1) * .5,
    };
  }
  function natural() {
    for (const [id, target] of Object.entries(targets())) {
      const index = lookup.get(id);
      if (index === undefined || outputIds.has(id)) continue;
      const value = clamp(target, parameters.minimumValues[index], parameters.maximumValues[index]);
      const previous = smooth.get(id) ?? parameters.values[index];
      const speed = id.includes('EyeLOpen') || id.includes('EyeROpen') ? 48 : id.includes('Mouth') ? 20 : 9;
      const next = reduced() || debugPose ? value : previous + (value - previous) * (1 - Math.exp(-dt * speed));
      smooth.set(id, next); parameters.values[index] = next;
    }
  }
  function layout() {
    if (!app || !model || !mount) return;
    const box = mount.getBoundingClientRect();
    const width = Math.max(1, box.width || 512), height = Math.max(1, box.height || 768);
    app.renderer.resize(width, height);
    const modelWidth = model.internalModel.originalWidth || model.internalModel.width;
    const modelHeight = model.internalModel.originalHeight || model.internalModel.height;
    const scale = Math.min(width / modelWidth, height / modelHeight);
    model.scale.set(scale); model.anchor.set(.5, .5);
    model.position.set(width * .5, height - modelHeight * scale * .5);
    renderStill();
  }
  function renderStill() {
    if (!app || !model) return;
    dt = 1 / 60;
    model.update(dt * 1000);
    app.render();
  }
  function tick(ticker) {
    if (paused || !visible() || reduced() || debugPose) { app?.ticker.stop(); return; }
    dt = clamp(ticker.deltaMS / 1000, .001, .05);
    elapsed += dt; model.update(dt * 1000); frames++;
  }
  function syncPlayback() {
    if (!app || !model) return;
    if (!attached || paused || !visible() || reduced() || debugPose) {
      app.ticker.stop();
      if (attached && visible() && (reduced() || debugPose)) renderStill();
    } else app.ticker.start();
  }
  function setLook(x = 0, y = 0) { lookX = clamp(x, -1, 1); lookY = clamp(y, -1, 1); }
  function setPaused(value) {
    const wasPaused = paused;
    paused = Boolean(value);
    if (paused) { lookX = lookY = speechLevel = 0; }
    if (paused && !wasPaused && prepared && attached) {
      // A modal/return wave freezes the rendered frame. Close the mouth before
      // stopping the ticker so the held frame never retains a speaking pose.
      smooth.set('ParamMouthOpenY', 0);
      renderStill();
    }
    syncPlayback();
  }
  function greet() {
    if (prepared && attached && !paused && !reduced()) greetAt = elapsed;
  }
  function setSpeechLevel(value = 0) { speechLevel = paused ? 0 : clamp(Number(value) || 0, 0, 1); }
  function setDebugPose(value = null) {
    debugPose = value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([id, number]) => lookup.has(id) && !outputIds.has(id) && Number.isFinite(number)))
      : null;
    smooth.clear(); syncPlayback();
    if (prepared) renderStill();
    return getState();
  }
  function inspectModel() {
    if (!core || !parameters) return null;
    const drawables = core._model.drawables;
    return {
      parameters:parameterIds.map((id,index) => ({id,value:parameters.values[index],minimum:parameters.minimumValues[index],maximum:parameters.maximumValues[index],default:parameters.defaultValues[index]})),
      drawables:Array.from(drawables.ids).map((id,index) => ({id,opacity:drawables.opacities[index],texture:drawables.textureIndices[index],vertexCount:drawables.vertexCounts[index],
        positions:Array.from(drawables.vertexPositions[index]),indices:Array.from(drawables.indices[index])})),
    };
  }
  function clearModel() {
    attachSerial++; attached = prepared = false; app?.ticker.stop();
    if (model?.internalModel && originalNatural) model.internalModel.updateNaturalMovements = originalNatural;
    if (core && originalCoreUpdate) core.update = originalCoreUpdate;
    resizeObserver?.disconnect(); resizeObserver = null;
    try { model?.destroy({children:true}); } catch {}
    try { app?.destroy(true, {children:true, texture:false, textureSource:false}); } catch {}
    model = app = core = parameters = null;
    originalNatural = originalCoreUpdate = null;
    lookup.clear(); smooth.clear(); outputIds.clear();
    if (root?.dataset.characterRenderer === 'live2d') root.dataset.characterRenderer = 'illustration';
  }
  async function attach() {
    if (!prepared || !app || !model || !root || root.hidden || disposed) return false;
    const token = ++attachSerial;
    layout(); app.canvas.hidden = false; renderStill();
    // Keep the existing image underneath until a fully decoded MOC draw has
    // reached the compositor; never reveal an empty first canvas.
    if (!document.hidden) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (token !== attachSerial || !visible() || !prepared) return false;
    attached = true;
    const hub = window.InfiniteSystemSpace;
    hub?.setCharacterRenderer(adapter);
    root.dataset.characterRenderer = 'live2d';
    syncPlayback();
    return true;
  }
  const adapter = {kind:'live2d', setLook, setPaused, greet,
    dispose() { if (disposed) return; disposed = true; clearModel(); phase = 'disposed'; }};
  function prepare() {
    if (disposed) return Promise.resolve({ready:false, error:'Renderer disposed.'});
    if (prepared) { if (root && !root.hidden && !attached) void attach(); return Promise.resolve({ready:true}); }
    if (loading) return loading;
    phase = 'loading'; error = '';
    const job = (async () => {
      await Promise.resolve();
      try {
        mount = window.InfiniteSystemSpace?.getCharacterMount(); root = document.getElementById('system-space');
        if (!mount || !root) throw new Error('System character mount is unavailable.');
        const manifest = await json(MODEL_URL);
        if (!manifest.FileReferences?.Moc || !manifest.FileReferences?.Textures?.length) throw new Error('Live2D model manifest is incomplete.');
        physicsOutputs = [];
        if (manifest.FileReferences.Physics) {
          const physics = await json(new URL(manifest.FileReferences.Physics, new URL(MODEL_URL, location.href)));
          physicsOutputs = [...new Set((physics.PhysicsSettings || []).flatMap(setting => (setting.Output || []).map(output => output.Destination?.Id)).filter(Boolean))];
          physicsOutputs.forEach(id => outputIds.add(id));
        }
        await script(CORE_URL, () => Boolean(window.Live2DCubismCore));
        await script(VENDOR_URL, () => Boolean(window.__dshLive2dPetVendor));
        const vendor = window.__dshLive2dPetVendor;
        if (!vendor.__infiniteRegistered) { vendor.extensions.add(vendor.Live2DPlugin); vendor.configureCubismSDK({memorySizeMB:64}); vendor.__infiniteRegistered = true; }
        app = new vendor.Application();
        await app.init({width:512,height:768,backgroundAlpha:0,antialias:true,resolution:Math.min(2,devicePixelRatio || 1),autoDensity:true,preference:'webgl',autoStart:false,preserveDrawingBuffer:false});
        app.canvas.className = 'system-live2d-canvas'; app.canvas.hidden = true; app.canvas.setAttribute('aria-hidden','true'); mount.append(app.canvas);
        model = await vendor.Live2DModel.from(new URL(MODEL_URL, location.href).href, {
          autoUpdate:false,autoFocus:false,autoHitTest:false,eyeBlink:false,
          idleMotionGroup:'__infinite_manual__',motionPreload:'NONE',textureOptions:{lod:'full'},checkMocConsistency:true,
        });
        app.stage.addChild(model); core = model.internalModel.coreModel; parameters = core._model.parameters;
        parameterIds = Array.from(parameters.ids); parameterIds.forEach((id,index) => lookup.set(id,index));
        originalNatural = model.internalModel.updateNaturalMovements;
        originalCoreUpdate = core.update;
        model.internalModel.updateNaturalMovements = natural;
        core.update = function (...args) {
          for (const id of parameterIds) {
            const index = lookup.get(id); if (index !== undefined) drawn[id] = Number(parameters.values[index].toFixed(4));
          }
          return originalCoreUpdate.apply(this, args);
        };
        model.internalModel.motionManager?.stopAllMotions();
        app.ticker.maxFPS = 60; app.ticker.add(tick);
        resizeObserver = new ResizeObserver(layout); resizeObserver.observe(mount);
        prepared = true; phase = 'ready'; layout();
        if (visible()) await attach();
        return {ready:true};
      } catch (failure) {
        error = failure instanceof Error ? failure.message : 'Live2D model could not be loaded.';
        clearModel(); phase = 'fallback';
        return {ready:false,error};
      } finally { if (loading === job) loading = null; }
    })();
    loading = job; return job;
  }
  window.addEventListener('infinite:startgame', () => { void prepare(); });
  window.addEventListener('infinite:systemvisible', () => { if (prepared) void attach(); else void prepare(); });
  window.addEventListener('infinite:systemclosed', () => { attachSerial++; setPaused(true); });
  document.addEventListener('visibilitychange', syncPlayback);
  media.addEventListener('change', syncPlayback);
  window.addEventListener('pagehide', () => { setPaused(true); });
  function getState() {
    return {phase,ready:prepared,attached,paused,ticking:Boolean(app?.ticker.started),debugPose:debugPose ? {...debugPose} : null,
      frames,elapsed,modelUrl:MODEL_URL,parameterIds:[...parameterIds],physicsOutputs:[...physicsOutputs],
      physicsLoaded:Boolean(model?.internalModel.physics),drawableCount:core?._model?.drawables?.count ?? 0,
      drawn:{...drawn},error};
  }
  // Force a draw without advancing model time. The caller copies this buffer
  // synchronously before WebGL's non-preserved drawing buffer can be cleared.
  function captureSource() { if (!prepared || !attached || !app) return null; app.render(); return app.canvas; }
  window.InfiniteSystemLive2D = Object.freeze({prepare,preload:prepare,greet,getState,setDebugPose,inspectModel,captureSource,setSpeechLevel});
})();
