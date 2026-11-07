/* Project the title photograph onto the fronts of a field of solid, matte cubes. */
(() => {
  'use strict';

  const vertex = `
    precision highp float;
    attribute vec3 corner, normal;
    attribute vec4 pose, rotation, patch, material;
    uniform vec2 halfView, eye;
    uniform float focal, flatPass;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying vec4 finish;

    vec3 rotatePoint(vec3 p, vec4 q) {
      return p + 2.0 * cross(q.xyz, cross(q.xyz, p) + q.w * p);
    }
    void main() {
      if (flatPass > .5) {
        uv = corner.xy + .5;
        swatch = uv;
        surfaceNormal = vec3(0.,0.,1.);
        finish = vec4(0.,1.,0.,1.);
        gl_Position = vec4(2.0*corner.x, -2.0*corner.y, 0., 1.);
        return;
      }
      vec3 p = pose.xyz + rotatePoint(corner * pose.w, rotation);
      float w = 1.0 - p.z / focal;
      vec2 xy = (p.xy + eye * p.z) / halfView;
      gl_Position = vec4(xy.x, -xy.y, -p.z / focal, w);
      surfaceNormal = rotatePoint(normal, rotation);
      uv = patch.xy + (corner.xy + 0.5) * patch.zw;
      swatch = patch.xy + vec2(0.5) * patch.zw;
      // Only the outside skin of the original photo bears its sharp print.
      finish = vec4(material.x, material.y * max(normal.z, 0.0), material.z, material.w);
    }`;

  const fragment = `
    precision highp float;
    uniform sampler2D photo;
    uniform float flatPass, progress, cellSize;
    uniform vec2 halfView, grid;
    varying vec2 uv, swatch;
    varying vec3 surfaceNormal;
    varying vec4 finish;
    void main() {
      vec4 face = texture2D(photo, uv);
      if (flatPass > .5) {
        // The unvisited photograph is a continuous plane. This avoids MSAA
        // grid seams leaking outside the moving front of the wave.
        vec2 p = (uv - .5) * 2.0 * halfView;
        vec2 center = (floor(p/cellSize + grid*.5) + .5 - grid*.5) * cellSize;
        float theta = dot(center,center) > .0001 ? atan(center.y,center.x) : 0.;
        float speed = .427 * (1.0 + .037*sin(3.0*theta+.35) + .021*cos(5.0*theta));
        float arrival = length(center) * speed / length(halfView);
        if (progress > arrival) discard;
        gl_FragColor = vec4(face.rgb * face.a, face.a);
        return;
      }
      vec4 ink = texture2D(photo, swatch);
      vec3 pigment = ink.rgb;
      float paper = dot(pigment, vec3(.25,.54,.21));
      vec3 body = mix(vec3(paper), pigment, .68) * .78 + vec3(.044,.040,.037);
      vec3 n = normalize(surfaceNormal);
      vec3 light = normalize(vec3(-.47,-.67,.79));
      float diffuse = max(0.0, dot(n, light));
      float sideLight = .57 + .62 * diffuse + .055 * max(-n.y, 0.0);
      float faceLight = 1.0 + finish.x * ((diffuse - light.z) * .74 + finish.z * .032);
      vec3 rgb = mix(body * sideLight, face.rgb * faceLight, finish.y);
      float alpha = finish.w * mix(ink.a, face.a, finish.y);
      if (alpha < .002) discard;
      gl_FragColor = vec4(rgb * alpha, alpha);
    }`;

  const TAU = Math.PI * 2;
  const clamp = x => Math.max(0, Math.min(1, x));
  function smooth(a, b, value) {
    const f = clamp((value - a) / (b - a));
    return f * f * (3 - 2 * f);
  }
  // Height and derivative of a compact water crest share the same support.
  function crest(phase) {
    if (phase <= 0 || phase >= 1) return 0;
    const s = Math.sin(Math.PI * phase);
    return s * s;
  }
  function slope(phase) {
    return phase > 0 && phase < 1 ? Math.PI * Math.sin(TAU * phase) : 0;
  }

  function cubeMesh() {
    const data = [];
    function face(n, right, down) {
      for (const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]) {
        data.push(...n.map((v, i) => .5 * (v + x * right[i] + y * down[i])), ...n);
      }
    }
    face([0,0,1], [1,0,0], [0,1,0]);
    face([0,0,-1], [-1,0,0], [0,1,0]);
    face([1,0,0], [0,0,-1], [0,1,0]);
    face([-1,0,0], [0,0,1], [0,1,0]);
    face([0,-1,0], [1,0,0], [0,0,1]);
    face([0,1,0], [1,0,0], [0,0,-1]);
    return new Float32Array(data);
  }

  function createField(width, height) {
    // Screen-space square footprints, including the partially visible edge cells.
    const cols = Math.ceil(width / Math.max(14, width / 54, height / 34));
    const size = width / cols;
    const rows = Math.ceil(height / size);
    const radius = Math.hypot(width, height) * .5;
    const cells = [];
    let seed = 789021;
    const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col + .5 - cols / 2) * size;
        const y = (row + .5 - rows / 2) * size;
        const r = Math.hypot(x,y);
        const theta = Math.atan2(y,x);
        const speed = .427 * (1 + .037 * Math.sin(3 * theta + .35) + .021 * Math.cos(5 * theta));
        const nx = r ? x / r : 0, ny = r ? y / r : 0;
        const cell = {
          x, y, nx, ny, u: col / cols, v: .5 + (y - size / 2) / height,
          onset: r * speed / radius, grad: speed / radius,
          split: .30 + random() * .023, life: .182 + random() * .034,
          tint: 2 * random() - 1, children: [],
        };
        for (let i = 0; i < 8; i++) {
          const sx = i & 1 ? 1 : -1, sy = i & 2 ? 1 : -1, sz = i & 4 ? 1 : -1;
          const angle = random() * TAU, az = random() * 1.6 - .8;
          const planar = Math.sqrt(1-az*az);
          const radial = .75 + random() * 1.5;
          const tangent = (random() - .5) * 1.9;
          cell.children.push({
            sx, sy, sz,
            vx: nx * radial - ny * tangent + sx * (.5 + random() * .7),
            vy: ny * radial + nx * tangent + sy * (.4 + random() * .7),
            vz: sz * (.8 + random()) + .55 + random() * 1.4,
            ax: Math.cos(angle) * planar, ay: Math.sin(angle) * planar, az,
            spin: (.75 + random() * 2.1) * (i % 2 ? 1 : -1),
          });
        }
        cells.push(cell);
      }
    }
    return {cells, cols, rows, size, du: size / width, dv: size / height};
  }

  window.createStartWaveGL = function createStartWaveGL(canvas, capturedCanvas, options = {}) {
    if (!canvas || !capturedCanvas?.width || !capturedCanvas.height) return null;
    const width = options.width || canvas.clientWidth || capturedCanvas.width;
    const height = options.height || canvas.clientHeight || capturedCanvas.height;
    if (!(width > 0 && height > 0)) return null;

    let gl, program, texture, disposed = false;
    const buffers = [], shaders = [];
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (!gl || gl.isContextLost()) return;
      if (texture) gl.deleteTexture(texture);
      buffers.forEach(buffer => gl.deleteBuffer(buffer));
      if (program) gl.deleteProgram(program);
      shaders.forEach(shader => gl.deleteShader(shader));
    }

    try {
      gl = canvas.getContext('webgl', {alpha:true, antialias:true, depth:true, stencil:false,
        premultipliedAlpha:true, preserveDrawingBuffer:false});
      if (!gl) return null;
      const instancing = gl.getExtension('ANGLE_instanced_arrays');
      if (!instancing) return null;
      const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      const dpr = Math.min(options.dpr || window.devicePixelRatio || 1, 1.5,
        Math.min(4096, viewport[0]) / width, Math.min(4096, viewport[1]) / height);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));

      function compile(kind, source) {
        const shader = gl.createShader(kind);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        return shader;
      }
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);

      function makeBuffer(data, usage) {
        const buffer = gl.createBuffer();
        buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, usage);
        return buffer;
      }
      function attribute(name, dimensions, stride, offset, divisor) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, dimensions, gl.FLOAT, false, stride * 4, offset * 4);
        instancing.vertexAttribDivisorANGLE(location, divisor);
      }
      makeBuffer(cubeMesh(), gl.STATIC_DRAW);
      attribute('corner',3,6,0,0);
      attribute('normal',3,6,3,0);
      const {cells, cols, rows, size, du, dv} = createField(width, height);
      const data = new Float32Array(cells.length * 8 * 16);
      const instances = makeBuffer(data.byteLength, gl.DYNAMIC_DRAW);
      attribute('pose',4,16,0,1); attribute('rotation',4,16,4,1);
      attribute('patch',4,16,8,1); attribute('material',4,16,12,1);

      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      let source = capturedCanvas;
      const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (Math.max(source.width,source.height) > maximum) {
        const factor = maximum / Math.max(source.width,source.height);
        source = document.createElement('canvas');
        source.width = Math.max(1, Math.floor(capturedCanvas.width * factor));
        source.height = Math.max(1, Math.floor(capturedCanvas.height * factor));
        source.getContext('2d').drawImage(capturedCanvas,0,0,source.width,source.height);
      }
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      if (gl.getError() !== gl.NO_ERROR) throw Error('wave photo upload failed');
      gl.uniform1i(gl.getUniformLocation(program,'photo'),0);
      gl.uniform2f(gl.getUniformLocation(program,'halfView'),width/2,height/2);
      gl.uniform1f(gl.getUniformLocation(program,'focal'),Math.max(size * 22, height * 1.3));
      gl.uniform2f(gl.getUniformLocation(program,'grid'),cols,rows);
      gl.uniform1f(gl.getUniformLocation(program,'cellSize'),size);
      const eye = gl.getUniformLocation(program,'eye');
      const flatPass = gl.getUniformLocation(program,'flatPass');
      const progress = gl.getUniformLocation(program,'progress');
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0,0,0,0);

      let cursor = 0;
      function cube(x,y,z,side, qx,qy,qz,qw, u,v,su,sv, lifted,print,tint,alpha) {
        let k = cursor;
        data[k++]=x; data[k++]=y; data[k++]=z; data[k++]=side;
        data[k++]=qx; data[k++]=qy; data[k++]=qz; data[k++]=qw;
        data[k++]=u; data[k++]=v; data[k++]=su; data[k++]=sv;
        data[k++]=lifted; data[k++]=print; data[k++]=tint; data[k++]=alpha;
        cursor = k;
      }
      function draw(t, pointerX = 0, pointerY = 0) {
        if (disposed || gl.isContextLost() || !Number.isFinite(t)) return false;
        const time = clamp(t);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (time === 1) return true;
        if (time < .47) {
          gl.uniform1f(flatPass,1);
          gl.uniform1f(progress,time);
          gl.drawArrays(gl.TRIANGLES,0,6);
        }
        gl.uniform1f(flatPass,0);
        gl.uniform2f(eye, -.21 + .15 * Math.max(-1,Math.min(1,pointerX)),
                          -.40 + .14 * Math.max(-1,Math.min(1,pointerY)));
        cursor = 0;
        for (const cell of cells) {
          const age = time - cell.onset;
          if (age >= cell.split + cell.life) continue;
          if (age <= 0) continue;
          const active = smooth(0,.075,age);
          // One crest passes each cube once, settling at the fracture time.
          // Fragments inherit that settled pose instead of another oscillation.
          const wavePhase = clamp(age / cell.split);
          const wave = 1.9 * crest(wavePhase);
          const gradient = -cell.grad * size * 1.9 * slope(wavePhase) / cell.split;
          // Leave steps between successive heights so the wave exposes the
          // sides of the cubes instead of bending a perfectly smooth sheet.
          const angle = .57 * Math.atan(gradient) + (.15 + .09*cell.tint) * active;
          const sine = Math.sin(angle * .5);
          const tiltX = cell.ny*sine, tiltY = -cell.nx*sine, tiltW = Math.cos(angle*.5);
          const twist = .051 * active * cell.tint;
          const sr = Math.sin(twist), cr = Math.cos(twist);
          const qx = tiltX*cr + tiltY*sr, qy = tiltY*cr - tiltX*sr, qz = tiltW*sr, qw = tiltW*cr;
          const side = size * (1 - .085 * active);
          const z = size*(wave*(1+.10*cell.tint)+(.29+.19*cell.tint)*active)-side*.5;
          const cx = cell.x + cell.nx * size * wave * .14;
          const cy = cell.y + cell.ny * size * wave * .14;
          if (age < cell.split) {
            cube(cx,cy,z,side, qx,qy,qz,qw, cell.u,cell.v,du,dv, active,1,cell.tint,1);
            continue;
          }
          const phase = clamp((age-cell.split)/cell.life);
          const drift = phase*phase*(2-phase), distance = size*drift;
          const shrink = 1-smooth(.18,1,phase);
          const alpha = 1-smooth(.58,.97,phase);
          if (alpha < .006) continue;
          for (const child of cell.children) {
            const {sx,sy,sz} = child;
            const lx = sx * side*.25, ly = sy * side*.25, lz = sz * side*.25;
            // Transform the eight child centres into their parent's last pose.
            const tx = 2*(qy*lz-qz*ly), ty = 2*(qz*lx-qx*lz), tz = 2*(qx*ly-qy*lx);
            const wx = cx+lx+qw*tx+qy*tz-qz*ty + distance*child.vx;
            const wy = cy+ly+qw*ty+qz*tx-qx*tz + distance*(child.vy+1.35*phase);
            const wz = z+lz+qw*tz+qx*ty-qy*tx + distance*child.vz;
            const twist = child.spin * drift * .5;
            const s = Math.sin(twist), a = child.ax*s, b = child.ay*s, c = child.az*s, d = Math.cos(twist);
            cube(wx,wy,wz,side*.5*shrink,
                 qw*a+qx*d+qy*c-qz*b, qw*b-qx*c+qy*d+qz*a, qw*c+qx*b-qy*a+qz*d, qw*d-qx*a-qy*b-qz*c,
                 cell.u+(sx>0?du*.5:0),cell.v+(sy>0?dv*.5:0),du*.5,dv*.5,
                 1,sz>0?1:0,cell.tint,alpha);
          }
        }
        if (cursor) {
          gl.bindBuffer(gl.ARRAY_BUFFER,instances);
          gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,cursor));
          instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,36,cursor/16);
        }
        return true;
      }
      return {draw, dispose};
    } catch {
      dispose();
      return null;
    }
  };
})();
