/* One inward assembly: matte cubes arrive from the four edges and become a scene. */
(() => {
  'use strict';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const duration = 1550;
  const vertex = `
    precision highp float;
    attribute vec3 corner, normal;
    attribute vec2 origin;
    attribute vec4 flight, tune, patch;
    uniform vec2 halfView;
    uniform vec4 cover;
    uniform float progress, cellSize, focal, flatPass;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying float front, moving, alpha;
    vec3 turn(vec3 p, vec3 angle) {
      vec3 c = cos(angle), s = sin(angle);
      p = vec3(p.x, p.y * c.x - p.z * s.x, p.y * s.x + p.z * c.x);
      p = vec3(p.x * c.y + p.z * s.y, p.y, -p.x * s.y + p.z * c.y);
      return vec3(p.x * c.z - p.y * s.z, p.x * s.z + p.y * c.z, p.z);
    }
    void main() {
      if (flatPass > .5) {
        uv = cover.xy + (corner.xy + .5) * cover.zw;
        swatch = uv;
        surfaceNormal = vec3(0., 0., 1.);
        front = 1.; moving = 0.; alpha = 1.;
        gl_Position = vec4(corner.x * 2., -corner.y * 2., 0., 1.);
        return;
      }
      float age = clamp((progress - flight.w) / (.58 + tune.w * .065), 0., 1.);
      float settle = 1. - pow(1. - age, 3.);
      float remain = 1. - settle;
      vec3 angle = tune.xyz * remain;
      float side = cellSize * (.77 + .23 * settle);
      vec3 pose = vec3(origin + flight.xy * remain,
        -side * .5 + flight.z * remain + sin(age * 3.14159265) * cellSize * .55);
      vec3 p = pose + turn(corner * side, angle);
      float w = 1. - p.z / focal;
      // Slightly off-axis light/camera reveals the thickness during flight.
      vec2 xy = (p.xy + vec2(-.12, -.20) * p.z) / halfView;
      gl_Position = vec4(xy.x, -xy.y, -p.z / focal, w);
      uv = cover.xy + (patch.xy + (corner.xy + .5) * patch.zw) * cover.zw;
      swatch = cover.xy + (patch.xy + patch.zw * .5) * cover.zw;
      surfaceNormal = turn(normal, angle);
      front = max(normal.z, 0.);
      moving = remain;
      alpha = smoothstep(0., .075, age);
    }`;
  const fragment = `
    precision mediump float;
    uniform sampler2D photo;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying float front, moving, alpha;
    void main() {
      vec4 face = texture2D(photo, uv);
      vec4 sampleColor = texture2D(photo, swatch);
      vec3 n = normalize(surfaceNormal);
      vec3 light = normalize(vec3(-.45, -.64, .71));
      float diffuse = max(dot(n, light), 0.);
      float grey = dot(sampleColor.rgb, vec3(.24, .62, .14));
      vec3 body = mix(sampleColor.rgb, vec3(grey), .55) * .48 + vec3(.018, .019, .021);
      // Broad diffuse lighting only: no glossy highlight or metallic sparkle.
      vec3 side = body * (.54 + diffuse * .66);
      vec3 ink = face.rgb * (1. + moving * (diffuse - light.z) * .33);
      vec3 rgb = mix(side, ink, front);
      float a = mix(sampleColor.a, face.a, front) * alpha;
      gl_FragColor = vec4(rgb * a, a);
    }`;

  function makeField(width, height) {
    const cols = Math.ceil(width / Math.sqrt(width * height / 420));
    const side = width / cols, rows = Math.ceil(height / side);
    let seed = 720813;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const cells = [];
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = (col + .5) * side - width / 2;
      const y = (row + .5) * side - height / 2;
      const edges = [x + width / 2, width / 2 - x, y + height / 2, height / 2 - y];
      const edge = edges.indexOf(Math.min(...edges));
      const jitter = (random() - .5) * side * 3, beyond = side * (2.5 + random() * 2.5);
      const dx = edge === 0 ? -width / 2 - beyond - x : edge === 1 ? width / 2 + beyond - x : jitter;
      const dy = edge === 2 ? -height / 2 - beyond - y : edge === 3 ? height / 2 + beyond - y : jitter;
      const inward = clamp(Math.min(...edges) / (Math.min(width, height) / 2));
      cells.push({x, y, dx, dy, depth: side * (1.5 + random() * 2.5),
        delay: .025 + inward * .24 + random() * .055,
        rx: (random() - .5) * 1.35, ry: (random() - .5) * 1.35,
        rz: (random() - .5) * .56, noise: random(),
        u: col * side / width, v: row * side / height,
      });
    }
    return {cells, side, du: side / width, dv: side / height};
  }

  function coverBounds(source, width, height) {
    const iw = source.naturalWidth || source.videoWidth || source.width;
    const ih = source.naturalHeight || source.videoHeight || source.height;
    if (!(iw > 0 && ih > 0)) return null;
    const scale = Math.max(width / iw, height / ih);
    const sw = width / scale, sh = height / scale;
    return {iw, ih, sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh};
  }

  function createGL(canvas, image, width, height, field, crop) {
    const gl = canvas.getContext('webgl', {alpha: true, antialias: true, depth: true,
      stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: true});
    if (!gl) return null;
    const buffers = [], shaders = [];
    let program, texture, disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      if (gl.isContextLost()) return;
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      shaders.forEach(shader => gl.deleteShader(shader));
      if (texture) gl.deleteTexture(texture);
      if (program) gl.deleteProgram(program);
    };
    try {
      const dpr = Math.min(devicePixelRatio || 1, 1.5, 3072 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const compile = (kind, code) => {
        const shader = gl.createShader(kind); shaders.push(shader);
        gl.shaderSource(shader, code); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error('Assembly shader failed');
        return shader;
      };
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error('Assembly program failed');
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
      // Static batch, transformed on the GPU. No per-frame uploads or objects.
      const stride = 20, data = new Float32Array(field.cells.length * 36 * stride);
      let cursor = 0;
      for (const cell of field.cells) for (const point of corners) {
        data.set([...point, cell.x, cell.y, cell.dx, cell.dy, cell.depth, cell.delay,
          cell.rx, cell.ry, cell.rz, cell.noise, cell.u, cell.v, field.du, field.dv], cursor);
        cursor += stride;
      }
      const buffer = gl.createBuffer(); buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      for (const [name, count, offset] of [['corner', 3, 0], ['normal', 3, 3], ['origin', 2, 6],
        ['flight', 4, 8], ['tune', 4, 12], ['patch', 4, 16]]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, count, gl.FLOAT, false, stride * 4, offset * 4);
      }
      texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      for (const setting of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, setting, gl.LINEAR);
      for (const setting of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, setting, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      let source = image;
      const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (Math.max(crop.iw, crop.ih) > maximum) {
        source = document.createElement('canvas');
        const ratio = maximum / Math.max(crop.iw, crop.ih);
        source.width = Math.max(1, Math.floor(crop.iw * ratio));
        source.height = Math.max(1, Math.floor(crop.ih * ratio));
        source.getContext('2d').drawImage(image, 0, 0, source.width, source.height);
      }
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      if (gl.getError() !== gl.NO_ERROR) throw Error('Assembly texture failed');
      gl.uniform1i(gl.getUniformLocation(program, 'photo'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'halfView'), width / 2, height / 2);
      gl.uniform4f(gl.getUniformLocation(program, 'cover'), crop.sx / crop.iw, crop.sy / crop.ih,
        crop.sw / crop.iw, crop.sh / crop.ih);
      gl.uniform1f(gl.getUniformLocation(program, 'cellSize'), field.side);
      gl.uniform1f(gl.getUniformLocation(program, 'focal'), Math.max(width, height) * 1.6);
      const progress = gl.getUniformLocation(program, 'progress'), flat = gl.getUniformLocation(program, 'flatPass');
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      return {name: 'webgl', dispose, draw(time) {
        if (disposed || gl.isContextLost()) return false;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(progress, clamp(time));
        // Every cube has settled before this point. Replace seams with one exact plane.
        const completed = time >= .97;
        gl.uniform1f(flat, completed ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, completed ? 6 : field.cells.length * 36);
        return true;
      }};
    } catch {
      dispose();
      return null;
    }
  }

  function create2D(canvas, image, width, height, field, crop) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = Math.min(devicePixelRatio || 1, 1.25, 2048 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const side = field.side, active = [];
    let disposed = false;
    return {name: '2d', dispose() { disposed = true; active.length = 0; }, draw(time) {
      if (disposed) return false;
      ctx.clearRect(0, 0, width, height);
      if (time >= .97) { ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height); return true; }
      active.length = 0;
      for (const cell of field.cells) {
        const age = clamp((time - cell.delay) / (.58 + cell.noise * .065));
        if (!age) continue;
        const rest = (1 - age) ** 3;
        active.push({cell, age, rest});
      }
      // Distant faces first so the emerging near cubes have stable occlusion.
      active.sort((a, b) => a.cell.depth * a.rest - b.cell.depth * b.rest);
      for (const {cell, age, rest} of active) {
        const size = side * (1 - .23 * rest), depth = cell.depth * rest;
        const x = width / 2 + cell.x + cell.dx * rest - depth * .12;
        const y = height / 2 + cell.y + cell.dy * rest - depth * .20;
        const thick = size * rest * .28;
        ctx.save(); ctx.globalAlpha = smooth(age / .075);
        ctx.translate(x, y); ctx.rotate(cell.rz * rest);
        ctx.transform(1, cell.ry * rest * .2, cell.rx * rest * .22, 1, 0, 0);
        ctx.fillStyle = '#161a20';
        ctx.beginPath(); ctx.moveTo(-size / 2, -size / 2); ctx.lineTo(size / 2, -size / 2);
        ctx.lineTo(size / 2 + thick, -size / 2 - thick); ctx.lineTo(-size / 2 + thick, -size / 2 - thick); ctx.fill();
        ctx.fillStyle = '#0c0e13';
        ctx.beginPath(); ctx.moveTo(size / 2, -size / 2); ctx.lineTo(size / 2, size / 2);
        ctx.lineTo(size / 2 + thick, size / 2 - thick); ctx.lineTo(size / 2 + thick, -size / 2 - thick); ctx.fill();
        ctx.drawImage(image, crop.sx + cell.u * crop.sw, crop.sy + cell.v * crop.sh,
          field.du * crop.sw, field.dv * crop.sh, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
      return true;
    }};
  }

  window.playDeityAssembly = (canvas, image, options = {}) => {
    const width = options.width || canvas.clientWidth || innerWidth;
    const height = options.height || canvas.clientHeight || innerHeight;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = !!options.reducedMotion || media.matches;
    const field = makeField(width, height), crop = image && coverBounds(image, width, height);
    let renderer = null;
    try {
      if (crop) renderer = createGL(canvas, image, width, height, field, crop)
        || create2D(canvas, image, width, height, field, crop);
    } catch { /* The live scene can still replace an unavailable canvas. */ }
    const mode = renderer?.name || 'fade';
    canvas.dataset.renderer = mode;
    canvas.style.opacity = reduced ? '0' : '1';
    let resolve, done = false, completed = false, progress = 0, raf = 0, start;
    const finished = new Promise(complete => { resolve = complete; });
    const stop = success => {
      if (done) return;
      done = true; completed = success;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pagehide', skip);
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
      canvas.removeEventListener('webglcontextlost', lost);
      if (success) {
        progress = 1;
        try { renderer?.draw(1); } catch { /* The DOM scene owns the finished image. */ }
        canvas.style.opacity = renderer ? '1' : '0';
      } else canvas.style.opacity = '0';
      renderer?.dispose(); renderer = null;
      resolve(success);
    };
    const skip = () => stop(true);
    const visibility = () => { if (document.hidden) skip(); };
    const preference = () => { if (media.matches) skip(); };
    const lost = event => { event.preventDefault(); skip(); };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      if (Math.abs(box.width - width) > 8 || Math.abs(box.height - height) > 8) skip();
    };
    const frame = now => {
      if (done) return;
      if (start == null) start = now;
      progress = clamp((now - start) / (reduced ? 160 : duration));
      try {
        if (renderer?.draw(reduced ? 1 : progress) === false) { skip(); return; }
      } catch { skip(); return; }
      if (reduced) canvas.style.opacity = String(smooth(progress));
      if (progress >= 1) skip();
      else raf = requestAnimationFrame(frame);
    };
    window.addEventListener('resize', resize, {passive: true});
    window.addEventListener('pagehide', skip);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', preference);
    canvas.addEventListener('webglcontextlost', lost);
    if (!renderer || document.hidden) queueMicrotask(skip);
    else raf = requestAnimationFrame(frame);
    return Object.freeze({finished, cancel: () => stop(false), getState: () => ({
      mode, progress, running: !done, completed, reducedMotion: reduced, cubes: field.cells.length,
    })});
  };
})();
