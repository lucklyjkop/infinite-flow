// Rebuild the local browser bundle from pinned npm packages. Run in a temporary
// directory with depth-flow@0.1.0, twgl.js@7.0.0 and esbuild installed.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const work = process.cwd();
const esbuild = require(require.resolve('esbuild', {paths: [work]}));
const upstream = path.resolve(work, 'node_modules/depth-flow');
const packageInfo = JSON.parse(fs.readFileSync(path.join(upstream, 'package.json')));
if (packageInfo.version !== '0.1.0') throw Error('Expected depth-flow@0.1.0');

// Use parallel rays for an art-directed two-plane scene. A perspective camera
// changes the outline of a disc at an oblique angle, even on a perfectly flat
// depth plane. Keep the upstream SLIDE intersections and visibility pass.
const parallelCamera = {
  name: 'parallel-camera',
  setup(build) {
    // The ordinary blob factory remains available. The photo already has two
    // decoded full-resolution DOM images and a CPU-readable one-pixel depth map.
    // Let both input paths share all shader, hierarchy, sampler and disposal code.
    build.onLoad({filter: /[\\/]renderer[\\/]slide\.mjs$/}, ({path: sourcePath}) => {
      let source = fs.readFileSync(sourcePath, 'utf8');
      const signature = 'async function createFlowSlideRenderer(canvas, flow, options) {';
      const inputs = /^\tconst (topImage|bottomImage|layerMap|topBlurMipmap|bottomBlurMipmap) = await (.+);$/gm;
      if (!source.includes(signature) || [...source.matchAll(inputs)].length !== 5) {
        throw Error('Unexpected upstream SLIDE texture acquisition');
      }
      source = source.replace(signature, `export function createSlideWithTextures(canvas, flow, options) {
        return createFlowSlideRenderer(canvas, flow, options, flow);
      }
      async function createFlowSlideRenderer(canvas, flow, options, textures) {`)
        .replace(inputs, (_, name, expression) => `\tconst ${name} = textures ? textures.${name} : await ${expression};`);
      return {contents: source};
    });
    // Interpolate premultiplied colors across transparent hair pixels. With
    // straight RGB the black stored in empty texels leaks into their neighbors.
    build.onLoad({filter: /[\\/]renderer[\\/]common\.mjs$/}, ({path: sourcePath}) => {
      const source = fs.readFileSync(sourcePath, 'utf8');
      const marker = 'return twgl.createTexture(gl, {';
      if (!source.includes(marker)) throw Error('Unexpected upstream texture creation');
      // createTexture already sets LINEAR for both filters. Its explicit blur
      // samplers are independent textures, and never sample automatic mip levels.
      return {contents: source.replace(marker, marker + '\n\t\t\tauto: false,\n\t\t\tpremultiplyAlpha: true,')};
    });
    build.onLoad({filter: /[\\/]slide-frag\.mjs$/}, async ({path: sourcePath}) => {
      const {default: upstreamShader} = await import(pathToFileURL(sourcePath).href);
      const from = upstreamShader.indexOf('  // ray calculation');
      const to = upstreamShader.indexOf('  // ray marching', from);
      if (from < 0 || to < from) throw Error('Unexpected upstream camera shader');
      const camera = `  vec2 frame = position * camera_zoom_scale + camera_target_center.xy;
  vec2 slope = camera_position.xy;
  vec3 near_point = vec3(frame + near_plane_center.z * slope, near_plane_center.z);
  vec3 far_point = vec3(frame + far_plane_center.z * slope, far_plane_center.z);
`;
      const withParallelCamera = upstreamShader.slice(0, from) + camera + upstreamShader.slice(to);
      const straightOver = 'current_color = mix(bottom_color, top_color, top_alpha);';
      if (!withParallelCamera.includes(straightOver)) throw Error('Unexpected upstream transparency equation');
      const fragment = withParallelCamera.replace(straightOver,
        'current_color = vec4(top_color.rgb * top_visibility + bottom_color.rgb * (1.f - top_alpha), 1.f);');
      return {contents: 'export default ' + JSON.stringify(fragment)};
    });
  }
};

esbuild.build({
  entryPoints: [path.join(upstream, 'dist/esm/src/depth-flow/renderer/slide.mjs')],
  outfile: path.join(__dirname, 'slide.min.js'),
  bundle: true, platform: 'browser', target: 'es2019', format: 'iife',
  globalName: 'DepthFlowSlide', minify: true, legalComments: 'eof',
  banner: {js: '/*! depth-flow 0.1.0 (MIT), twgl.js 7.0.0 (MIT). See LICENSE-depth-flow.txt and LICENSE-twgl.txt. */'},
  plugins: [parallelCamera],
}).catch(error => {console.error(error); process.exitCode = 1;});
