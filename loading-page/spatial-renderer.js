/* One photograph projected onto a continuous relief mesh. */
(() => {
  'use strict';

  const vertexSource = `
    attribute vec3 source;
    attribute vec3 camera;
    uniform vec2 screenScale;
    varying highp vec3 sourceProjector;
    void main() {
      // Projective photo coordinates retain the native image at the original camera pose.
      sourceProjector = vec3(source.xy * source.z, source.z);
      gl_Position = vec4(camera.xy * screenScale * camera.z, 0., camera.z);
    }`;

  const fragmentSource = `
    precision highp float;
    varying highp vec3 sourceProjector;
    uniform sampler2D photo;
    void main() {
      gl_FragColor = texture2D(photo, sourceProjector.xy / sourceProjector.z);
    }`;

  function decodeMesh(geometry) {
    if (!geometry) return null;
    const { cols, rows, depth, ringLock } = geometry;
    const count = (cols + 1) * (rows + 1);
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1 ||
        count > 65535 || typeof depth !== 'string') return null;
    const bytes = atob(depth);
    if (bytes.length !== count) return null;
    const lock = typeof ringLock === 'string' ? atob(ringLock) : '';
    if (lock && lock.length !== count) return null;
    const rigidWeight = new Float32Array(count);
    const vertices = new Float32Array(count * 3);
    const indices = new Uint16Array(cols * rows * 6);
    const stride = cols + 1;
    let cursor = 0;
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        const index = y * stride + x;
        vertices[3 * index] = x / cols;
        vertices[3 * index + 1] = y / rows;
        vertices[3 * index + 2] = 1 / (.46 + 1.35 * bytes.charCodeAt(index) / 255);
        if (lock) rigidWeight[index] = lock.charCodeAt(index) / 255;
        if (x === cols || y === rows) continue;
        const a = index, b = a + 1, c = a + stride, d = c + 1;
        indices[cursor++] = a; indices[cursor++] = b; indices[cursor++] = d;
        indices[cursor++] = a; indices[cursor++] = d; indices[cursor++] = c;
      }
    }
    return { cols, rows, count, vertices, indices, rigidWeight };
  }

  function smoothEdge(distance, width) {
    const t = Math.min(1, Math.max(0, distance / width));
    return t * t * (3 - 2 * t);
  }

  // getComputedStyle() supplies percentages for the current layouts. Also
  // accept pixel offsets, edge keywords and the usual percent +/- px calc().
  function alignment(value, spare, axis) {
    if (!value || value === 'center') return spare / 2;
    if (value === (axis ? 'top' : 'left')) return 0;
    if (value === (axis ? 'bottom' : 'right')) return spare;
    const calc = /^calc\(\s*(-?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(value);
    if (calc) return spare * Number(calc[1]) / 100 + (calc[2] === '-' ? -1 : 1) * Number(calc[3]);
    if (/^-?[\d.]+%$/.test(value)) return spare * parseFloat(value) / 100;
    if (/^-?[\d.]+(?:px)?$/.test(value)) return parseFloat(value);
    return spare / 2;
  }

  function imagePosition(position, spareX, spareY) {
    let [x, y] = String(position || '50% 50%').match(/calc\([^)]*\)|[^\s]+/g) || [];
    if (x === 'top' || x === 'bottom' || y === 'left' || y === 'right') [x, y] = [y, x];
    return [alignment(x, spareX, 0), alignment(y, spareY, 1)];
  }

  window.createSpatialRenderer = function createSpatialRenderer(canvas, image, geometry) {
    if (!canvas || !image?.naturalWidth) return null;
    let gl, program, texture;
    let disposed = false;
    const shaders = [], buffers = [];

    function dispose() {
      if (disposed) return;
      disposed = true;
      if (!gl || gl.isContextLost()) return;
      gl.useProgram(null);
      if (texture) gl.deleteTexture(texture);
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      if (program) gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    try {
      const mesh = decodeMesh(geometry);
      if (!mesh) return null;
      gl = canvas.getContext('webgl', {
        alpha: true, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: 'low-power',
      });
      if (!gl) return null;
      if (Math.max(image.naturalWidth, image.naturalHeight) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;
      function compile(type, code) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('shader allocation');
        shaders.push(shader);
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader compilation');
        return shader;
      }
      program = gl.createProgram();
      if (!program) throw new Error('program allocation');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('shader link');
      gl.useProgram(program);

      function bindBuffer(target, data, usage, attribute) {
        const buffer = gl.createBuffer();
        if (!buffer) throw new Error('mesh buffer');
        buffers.push(buffer);
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, data, usage);
        if (attribute) {
          const location = gl.getAttribLocation(program, attribute);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
        }
        return buffer;
      }
      const projected = new Float32Array(mesh.count * 3);
      bindBuffer(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW, 'source');
      const cameraBuffer = bindBuffer(gl.ARRAY_BUFFER, projected.byteLength, gl.DYNAMIC_DRAW, 'camera');
      bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

      texture = gl.createTexture();
      if (!texture) throw new Error('texture allocation');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('texture upload');
      gl.uniform1i(gl.getUniformLocation(program, 'photo'), 0);
      gl.clearColor(0, 0, 0, 0);

      const screenScale = gl.getUniformLocation(program, 'screenScale');
      const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      const rest = new Float32Array(mesh.count * 3); // Original screen XY and edge weight.
      let focal = 1, minimumArea = 0, ready = false;

      function resize(cssWidth, cssHeight, fit = 'cover', objectPosition = '50% 50%') {
        if (disposed || gl.isContextLost() || !(cssWidth > 0 && cssHeight > 0)) return false;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5,
          Math.min(4096, maxViewport[0]) / cssWidth, Math.min(4096, maxViewport[1]) / cssHeight);
        const width = Math.max(1, Math.round(cssWidth * dpr));
        const height = Math.max(1, Math.round(cssHeight * dpr));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform2f(screenScale, 2 / cssWidth, -2 / cssHeight);
        const sx = cssWidth / image.naturalWidth, sy = cssHeight / image.naturalHeight;
        const scale = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
        const imageWidth = image.naturalWidth * scale, imageHeight = image.naturalHeight * scale;
        const [left, top] = imagePosition(objectPosition, cssWidth - imageWidth, cssHeight - imageHeight);
        const rim = Math.max(24, Math.min(145, Math.min(imageWidth, imageHeight) * .14));
        for (let i = 0; i < rest.length; i += 3) {
          const u = mesh.vertices[i], v = mesh.vertices[i + 1];
          rest[i] = left + u * imageWidth - cssWidth * .5;
          rest[i + 1] = top + v * imageHeight - cssHeight * .5;
          rest[i + 2] = smoothEdge(Math.min(u, 1 - u) * imageWidth, rim) *
            smoothEdge(Math.min(v, 1 - v) * imageHeight, rim);
        }
        focal = 1.4 * cssHeight;
        minimumArea = .08 * (imageWidth / mesh.cols) * (imageHeight / mesh.rows);
        ready = true;
        return true;
      }

      function project(dx, dy) {
        // Camera centre translates by (-dx/f, -dy/f) in world space, then
        // turns towards the original focus point on the optical axis.
        const aimX = dx * .92 / focal, aimY = dy * .92 / focal;
        const forwardLength = Math.hypot(aimX, aimY, 1);
        const fx = aimX / forwardLength, fy = aimY / forwardLength, fz = 1 / forwardLength;
        const sideLength = Math.hypot(fx, fz);
        const rx = fz / sideLength, rz = -fx / sideLength;
        const downX = fy * rz, downY = sideLength, downZ = -fy * rx;
        for (let i = 0; i < rest.length; i += 3) {
          const x = rest[i], y = rest[i + 1], edge = rest[i + 2];
          const z = mesh.vertices[i + 2];
          const cameraX = (x * z + dx) / focal, cameraY = (y * z + dy) / focal;
          const cameraZ = fx * cameraX + fy * cameraY + fz * z;
          if (cameraZ < .01) return false;
          const magnification = focal / cameraZ;
          const nextX = (rx * cameraX + rz * z) * magnification;
          const nextY = (downX * cameraX + downY * cameraY + downZ * z) * magnification;
          const lock = mesh.rigidWeight[i / 3];
          const relief = edge * (1 - lock);
          // Each point on the metal hoop follows the same screen translation.
          // Keep the outer image boundary fixed, including the letterbox edges.
          const rigidTravel = edge > 0 ? -.20 * lock : 0;
          projected[i] = x + (nextX - x) * relief + dx * rigidTravel;
          projected[i + 1] = y + (nextY - y) * relief + dy * rigidTravel;
          // Matching the original projector W also fixes UV interpolation inside
          // each rigid triangle, including triangles whose vertex depths differ.
          projected[i + 2] = z + (cameraZ - z) * relief;
        }
        // Keep the map one-to-one even on a tiny viewport or a steep depth
        // transition. A positive signed area for every triangle plus a fixed
        // rectangular boundary prevents overdraw of a second silhouette.
        for (let i = 0; i < mesh.indices.length; i += 3) {
          const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
          const area = (projected[b] - projected[a]) * (projected[c + 1] - projected[a + 1]) -
            (projected[b + 1] - projected[a + 1]) * (projected[c] - projected[a]);
          if (area < minimumArea) return false;
        }
        return true;
      }

      function draw(offsetX = 0, offsetY = 0) {
        if (disposed || !ready || gl.isContextLost() || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return false;
        let dx = offsetX, dy = offsetY;
        for (let attempts = 0; !project(dx, dy); attempts++) {
          dx *= .75;
          dy *= .75;
          if (attempts === 6) {
            if (!project(0, 0)) return false;
            break;
          }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, cameraBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, projected);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
        return true;
      }

      return { resize, draw, dispose };
    } catch {
      dispose();
      return null;
    }
  };
})();
