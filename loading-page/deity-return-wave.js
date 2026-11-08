/* One left-to-right matte cube crest carries the complete deity frame into the title. */
(() => {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const BAND = .34;
  const vertexSource = `
    precision highp float;
    attribute vec3 corner, normal;
    attribute vec4 patch;
    uniform vec2 view;
    uniform float progress, cellSize, focal, flatPass;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying float front, rise, exchange, heightAbovePlane;
    vec3 turn(vec3 p, vec3 a) {
      vec3 c = cos(a), s = sin(a);
      p = vec3(p.x, p.y*c.x - p.z*s.x, p.y*s.x + p.z*c.x);
      p = vec3(p.x*c.y + p.z*s.y, p.y, -p.x*s.y + p.z*c.y);
      return vec3(p.x*c.z - p.y*s.z, p.x*s.z + p.y*c.z, p.z);
    }
    void main() {
      uv = patch.xy + (corner.xy + .5) * patch.zw;
      swatch = patch.xy + patch.zw * .5;
      if (flatPass > .5) {
        uv = corner.xy + .5;
        swatch = uv; front = 1.; rise = 0.; exchange = 0.;
        surfaceNormal = vec3(0., 0., 1.); heightAbovePlane = 0.;
        gl_Position = vec4(corner.x * 2., -corner.y * 2., .99, 1.);
        return;
      }
      float bend = .026 * sin(swatch.y * 6.) * sin(swatch.x * 3.14159265);
      float age = clamp((progress * 1.34 - swatch.x - bend) / .34, 0., 1.);
      float wave = sin(age * 3.14159265);
      wave *= wave;
      float slope = sin(age * 6.2831853);
      // There is only one crest. Its slope, not another oscillation, tips each cube.
      float variation = sin(swatch.y * view.y / cellSize * 1.73 + swatch.x * view.x / cellSize * .71);
      vec3 angle = vec3((-.18 + .085 * variation) * wave, -.46 * slope,
        .035 * wave * variation);
      float height = cellSize * (1.48 + .17 * variation) * wave;
      float blockSize = cellSize * (1. - .14 * wave);
      vec3 p = vec3((swatch - .5) * view, height - blockSize * .5);
      p += turn(corner * blockSize, angle);
      heightAbovePlane = p.z;
      float w = 1. - p.z / focal;
      vec2 projected = (p.xy + vec2(-.17, -.24) * p.z) / (view * .5);
      gl_Position = vec4(projected.x, -projected.y, -p.z / focal, w);
      surfaceNormal = turn(normal, angle);
      front = max(normal.z, 0.);
      rise = wave;
      exchange = smoothstep(.36, .70, age);
    }`;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D beforePhoto, afterPhoto;
    uniform vec4 beforeCrop, afterCrop;
    uniform vec2 view;
    uniform float progress, cellSize, flatPass;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying float front, rise, exchange, heightAbovePlane;
    vec4 before(vec2 p) { return texture2D(beforePhoto, beforeCrop.xy + p * beforeCrop.zw); }
    vec4 after(vec2 p) { return texture2D(afterPhoto, afterCrop.xy + p * afterCrop.zw); }
    void main() {
      if (flatPass > .5) {
        // Continuous backing photograph prevents black cracks between lifted blocks.
        vec2 cell = (floor(uv * view / cellSize) + .5) * cellSize / view;
        float bend = .026 * sin(cell.y * 6.) * sin(cell.x * 3.14159265);
        float age = clamp((progress * 1.34 - cell.x - bend) / .34, 0., 1.);
        float blend = smoothstep(.36, .70, age);
        if (progress <= 0.) blend = 0.;
        if (progress >= 1.) blend = 1.;
        vec4 ink = mix(before(uv), after(uv), blend);
        float shade = sin(age * 3.14159265);
        ink.rgb *= 1. - .17 * shade * shade;
        gl_FragColor = vec4(ink.rgb * ink.a, ink.a);
        return;
      }
      // Resting areas come from the uninterrupted plane, not a visible grid.
      if (rise < .00002 || heightAbovePlane < -.15) discard;
      vec4 ink = mix(before(uv), after(uv), exchange);
      vec4 sampleColor = mix(before(swatch), after(swatch), exchange);
      vec3 light = normalize(vec3(-.46, -.68, .78));
      float diffuse = max(dot(normalize(surfaceNormal), light), 0.);
      float grey = dot(sampleColor.rgb, vec3(.25, .57, .18));
      vec3 body = mix(sampleColor.rgb, vec3(grey), .55) * .73 + vec3(.032, .030, .029);
      vec3 matte = body * (.48 + diffuse * .67);
      vec3 face = ink.rgb * (1. + rise * (diffuse - light.z) * .64);
      vec3 color = mix(matte, face, front);
      float alpha = mix(sampleColor.a, ink.a, front);
      gl_FragColor = vec4(color * alpha, alpha);
    }`;

  function cropFor(image, width, height) {
    const iw = image?.naturalWidth || image?.videoWidth || image?.width;
    const ih = image?.naturalHeight || image?.videoHeight || image?.height;
    if (!(iw > 0 && ih > 0)) return null;
    const fit = Math.max(width / iw, height / ih), sw = width / fit, sh = height / fit;
    return {iw, ih, sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh};
  }

  function makeField(width, height) {
    const cols = Math.max(8, Math.round(width / Math.sqrt(width * height / 460)));
    const size = width / cols, rows = Math.ceil(height / size), cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      cells.push({x: (x + .5) * size, y: (y + .5) * size,
        u: x * size / width, v: y * size / height});
    }
    return {cells, size, du: size / width, dv: size / height};
  }

  function createGL(canvas, before, after, width, height, field, crops) {
    const gl = canvas.getContext('webgl', {alpha: true, depth: true, antialias: true,
      stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true});
    if (!gl) return null;
    const shaders = [], textures = [];
    let program, buffer, disposed = false;
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (gl.isContextLost()) return;
      textures.forEach(t => gl.deleteTexture(t));
      shaders.forEach(s => gl.deleteShader(s));
      if (program) gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
    }
    try {
      const dpr = Math.min(devicePixelRatio || 1, 1.5, 3072 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const shader = (kind, source) => {
        const result = gl.createShader(kind); shaders.push(result);
        gl.shaderSource(result, source); gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error('Return wave shader unavailable');
        return result;
      };
      program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Return wave program unavailable');
      gl.useProgram(program);
      const corners = [];
      const face = (n, right, down) => {
        for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
          corners.push([...n.map((v, i) => .5 * (v + x * right[i] + y * down[i])), ...n]);
        }
      };
      face([0, 0, 1], [1, 0, 0], [0, 1, 0]);
      face([0, 0, -1], [-1, 0, 0], [0, 1, 0]);
      face([1, 0, 0], [0, 0, -1], [0, 1, 0]);
      face([-1, 0, 0], [0, 0, 1], [0, 1, 0]);
      face([0, -1, 0], [1, 0, 0], [0, 0, 1]);
      face([0, 1, 0], [1, 0, 0], [0, 0, -1]);
      const stride = 10, data = new Float32Array(field.cells.length * 36 * stride);
      let cursor = 0;
      for (const cell of field.cells) for (const corner of corners) {
        data.set([...corner, cell.u, cell.v, field.du, field.dv], cursor); cursor += stride;
      }
      buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [name, length, offset] of [['corner', 3, 0], ['normal', 3, 3], ['patch', 4, 6]]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, length, gl.FLOAT, false, stride * 4, offset * 4);
      }
      [before, after].forEach((image, index) => {
        const texture = gl.createTexture(); textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
        for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.LINEAR);
        for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        let source = image;
        if (Math.max(crops[index].iw, crops[index].ih) > maximum) {
          source = document.createElement('canvas');
          const scale = maximum / Math.max(crops[index].iw, crops[index].ih);
          source.width = Math.max(1, Math.floor(crops[index].iw * scale));
          source.height = Math.max(1, Math.floor(crops[index].ih * scale));
          source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        if (gl.getError() !== gl.NO_ERROR) throw Error('Return wave texture unavailable');
        gl.uniform1i(gl.getUniformLocation(program, index ? 'afterPhoto' : 'beforePhoto'), index);
        const crop = crops[index];
        gl.uniform4f(gl.getUniformLocation(program, index ? 'afterCrop' : 'beforeCrop'),
          crop.sx / crop.iw, crop.sy / crop.ih, crop.sw / crop.iw, crop.sh / crop.ih);
      });
      gl.uniform2f(gl.getUniformLocation(program, 'view'), width, height);
      gl.uniform1f(gl.getUniformLocation(program, 'cellSize'), field.size);
      gl.uniform1f(gl.getUniformLocation(program, 'focal'), Math.max(width, height) * 2.5);
      const progress = gl.getUniformLocation(program, 'progress'), flat = gl.getUniformLocation(program, 'flatPass');
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      gl.depthFunc(gl.LEQUAL); gl.clearColor(0, 0, 0, 0);
      return {name: 'webgl', dispose, draw(time) {
        if (disposed || gl.isContextLost()) return false;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(progress, clamp(time));
        gl.uniform1f(flat, 1); gl.disable(gl.DEPTH_TEST);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (time > 0 && time < 1) {
          gl.uniform1f(flat, 0); gl.enable(gl.DEPTH_TEST);
          gl.drawArrays(gl.TRIANGLES, 0, field.cells.length * 36);
        }
        return true;
      }};
    } catch {
      dispose();
      return null;
    }
  }

  function create2D(canvas, before, after, width, height, field, crops) {
    let target = canvas, ctx = canvas.getContext('2d'), proxy = null;
    // If a driver created a context but rejected the shader, use a temporary 2D
    // surface in exactly the same rectangle. It belongs to this controller only.
    if (!ctx && canvas.parentNode) {
      proxy = document.createElement('canvas'); target = proxy;
      proxy.setAttribute('data-return-wave-proxy', '');
      const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
      Object.assign(proxy.style, {position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        width: `${rect.width || width}px`, height: `${rect.height || height}px`,
        zIndex: style.zIndex, pointerEvents: 'none'});
      proxy.setAttribute('aria-hidden', 'true'); canvas.after(proxy);
      ctx = proxy.getContext('2d');
    }
    if (!ctx) { proxy?.remove(); return null; }
    const dpr = Math.min(devicePixelRatio || 1, 1.25, 2048 / Math.max(width, height));
    target.width = Math.max(1, Math.round(width * dpr));
    target.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Pre-crop just once; all per-frame fragments then use the same pixel coordinates.
    const plates = [before, after].map((image, index) => {
      const plate = document.createElement('canvas'), crop = crops[index];
      plate.width = Math.max(1, Math.round(width)); plate.height = Math.max(1, Math.round(height));
      plate.getContext('2d').drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
      return plate;
    });
    const side = field.size, active = [];
    let disposed = false;
    const polygon = points => {
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
      ctx.closePath(); ctx.fill();
    };
    return {name: '2d', dispose() {
      if (disposed) return;
      disposed = true; active.length = 0; proxy?.remove();
      plates.forEach(plate => { plate.width = plate.height = 1; });
    }, draw(time) {
      if (disposed) return false;
      ctx.globalAlpha = 1; ctx.clearRect(0, 0, width, height);
      if (time <= 0 || time >= 1) { ctx.drawImage(plates[time >= 1 ? 1 : 0], 0, 0, width, height); return true; }
      ctx.drawImage(plates[0], 0, 0, width, height);
      active.length = 0;
      for (const cell of field.cells) {
        const bend = .026 * Math.sin(cell.y / height * 6) * Math.sin(cell.x / width * Math.PI);
        const age = clamp((time * (1 + BAND) - cell.x / width - bend) / BAND);
        if (!age) continue;
        const blend = smooth((age - .36) / .34), wave = Math.sin(Math.PI * age) ** 2;
        const sx = Math.max(0, cell.x - side / 2), sy = Math.max(0, cell.y - side / 2);
        const sw = Math.min(side, width - sx), sh = Math.min(side, height - sy);
        if (blend > 0) {
          ctx.globalAlpha = blend;
          ctx.drawImage(plates[1], sx, sy, sw, sh, sx, sy, sw + .25, sh + .25);
        }
        if (wave > .00002) active.push({cell, wave, age, blend, sx, sy, sw, sh});
      }
      active.sort((a, b) => a.wave - b.wave);
      for (const item of active) {
        const {cell, wave, age, blend, sx, sy, sw, sh} = item;
        const variation = Math.sin(cell.y / side * 1.73 + cell.x / side * .71);
        const depth = side * (1.48 + .17 * variation) * wave, tilt = -.46 * Math.sin(age * Math.PI * 2);
        const scale = 1 / (1 - depth / (Math.max(width, height) * 2.5));
        const x = width / 2 + (cell.x - width / 2 - .17 * depth) * scale;
        const y = height / 2 + (cell.y - height / 2 - .24 * depth) * scale;
        const half = side / 2, thickness = side * (.17 * wave + Math.abs(Math.sin(tilt)) * .6);
        ctx.globalAlpha = wave * .16; ctx.fillStyle = '#07080a';
        ctx.fillRect(sx - side * .08, sy + side * .08, sw + side * .16, sh + side * .2);
        ctx.save(); ctx.globalAlpha = 1; ctx.translate(x, y);
        ctx.rotate(.035 * wave * variation);
        const blockScale = 1 - .14 * wave;
        ctx.transform(Math.cos(tilt) * scale * blockScale, Math.sin(tilt) * .13,
          -.06 * wave, scale * blockScale, 0, 0);
        ctx.fillStyle = '#252528';
        polygon([[-half, half], [half, half], [half + thickness, half + thickness * .58], [-half + thickness, half + thickness * .58]]);
        ctx.fillStyle = '#353237';
        polygon([[half, -half], [half, half], [half + thickness, half + thickness * .58], [half + thickness, -half + thickness * .58]]);
        ctx.drawImage(plates[0], sx, sy, sw, sh, -half, -half, sw, sh);
        ctx.globalAlpha = blend;
        ctx.drawImage(plates[1], sx, sy, sw, sh, -half, -half, sw, sh);
        ctx.globalAlpha = Math.abs(tilt) * .21; ctx.fillStyle = '#141419';
        ctx.fillRect(-half, -half, sw, sh); ctx.restore();
      }
      ctx.globalAlpha = 1;
      return true;
    }};
  }

  window.playDeityReturnWave = (canvas, fromImage, toImage, options = {}) => {
    const width = Math.max(1, options.width || canvas.clientWidth || innerWidth);
    const height = Math.max(1, options.height || canvas.clientHeight || innerHeight);
    const duration = Math.max(1, Number(options.duration) || 2200);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = !!options.reducedMotion || media.matches;
    const crops = [cropFor(fromImage, width, height), cropFor(toImage, width, height)];
    const field = makeField(width, height);
    let renderer = null;
    try {
      if (crops.every(Boolean)) renderer = createGL(canvas, fromImage, toImage, width, height, field, crops)
        || create2D(canvas, fromImage, toImage, width, height, field, crops);
    } catch { /* Completion still hands control to the live destination scene. */ }
    const mode = renderer?.name || 'none';
    canvas.dataset.renderer = mode;
    let resolve, done = false, completed = false, progress = 0, raf = 0, started;
    let reason = 'running';
    const finished = new Promise(complete => { resolve = complete; });
    function report() {
      try { options.onProgress?.(progress); } catch { /* Consumer callbacks cannot strand the transition. */ }
    }
    function stop(success, why = success ? 'complete' : 'cancelled') {
      if (done) return;
      done = true; completed = success; reason = why;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', pagehide);
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
      canvas.removeEventListener('webglcontextlost', lost);
      if (success) {
        progress = 1;
        try { renderer?.draw(1); } catch { /* The live title scene is the final fallback. */ }
        report();
      }
      renderer?.dispose(); renderer = null;
      resolve(success);
    }
    const pagehide = () => stop(true, 'pagehide');
    const visibility = () => { if (document.hidden) stop(true, 'hidden'); };
    const preference = () => { if (media.matches) stop(true, 'reduced-motion'); };
    const lost = event => { event.preventDefault(); stop(true, 'context-lost'); };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (box.width && box.height && (Math.abs(box.width - width) > 4 || Math.abs(box.height - height) > 4)) stop(true, 'resize');
    };
    const frame = () => {
      if (done) return;
      // A queued RAF timestamp can predate a slow texture upload/compositor task.
      // Use the same actual first-frame wall clock that launches the sound cue,
      // so that work cannot consume the opening part of the 2200ms wave.
      const now = performance.now();
      if (started == null) started = now;
      progress = clamp((now - started) / duration);
      try { if (renderer?.draw(progress) === false) { stop(true, 'unavailable'); return; } }
      catch { stop(true, 'unavailable'); return; }
      report();
      if (progress >= 1) stop(true); else if (!done) raf = requestAnimationFrame(frame);
    };
    window.addEventListener('resize', resize, {passive: true});
    window.addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    canvas.addEventListener('webglcontextlost', lost);
    try { renderer?.draw(0); } catch { /* Skip below if rendering is not available. */ }
    if (!renderer || reduced || document.hidden) queueMicrotask(() => stop(true, reduced ? 'reduced-motion' : 'unavailable'));
    else raf = requestAnimationFrame(frame);
    return Object.freeze({finished, cancel: () => stop(false), getState: () => ({
      mode, progress, running: !done, completed, reason, duration,
      reducedMotion: reduced, cubes: field.cells.length, direction: 'left-to-right',
    })});
  };
})();
