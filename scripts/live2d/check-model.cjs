#!/usr/bin/env node
'use strict';

/* Read-only Cubism export verification. No downloads, drawing or model edits.
 * Usage: node scripts/live2d/check-model.cjs [path/to/name.model3.json]
 *          [--core path/to/live2dcubismcore.min.js] [--out report-directory]
 * The official Core stays in the ignored local runtime cache, not this script.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const EPSILON = 1e-5;
const REQUIRED = [
  'ParamEyeLOpen', 'ParamEyeROpen', 'ParamEyeBallX', 'ParamEyeBallY',
  'ParamMouthOpenY', 'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
  'ParamBodyAngleX', 'ParamBreath',
];

function options(argv) {
  const result = {
    model: path.join(ROOT, 'loading-page/assets/live2d/hongzhuang/hongzhuang.model3.json'),
    core: process.env.LIVE2D_CORE_PATH || path.join(ROOT, 'output/live2d-runtime/live2dcubismcore.min.js'),
    out: path.join(ROOT, 'output/hongzhuang-live2d/verification'),
  };
  let positional = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return {help:true};
    if (arg === '--core' || arg === '--out') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
      result[arg.slice(2)] = path.resolve(argv[++i]);
    } else if (arg.startsWith('-') || positional) throw Error(`Unexpected argument: ${arg}`);
    else { result.model = path.resolve(arg); positional = true; }
  }
  return result;
}

function json(file) { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function localName(file) {
  const relative = path.relative(ROOT, file);
  return relative.startsWith('..') ? file : relative.split(path.sep).join('/');
}
function finiteArray(value) { return value && Array.from(value).every(Number.isFinite); }
function bounds(vertices) {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  for (const points of vertices) for (let i = 0; i < points.length; i += 2) {
    left = Math.min(left, points[i]); right = Math.max(right, points[i]);
    bottom = Math.min(bottom, points[i + 1]); top = Math.max(top, points[i + 1]);
  }
  return Number.isFinite(left) ? {left, bottom, right, top, width:right-left, height:top-bottom} : null;
}

async function loadCore(file) {
  if (!fs.existsSync(file)) throw Error(`Official Cubism Core is missing: ${localName(file)}. Run the project runtime setup or pass --core.`);
  const logs = [];
  const quietConsole = Object.fromEntries(['log','warn','error','info','debug'].map(key => [key, (...args) => {
    if (logs.length < 20) logs.push(args.map(String).join(' ').slice(0, 500));
  }]));
  const context = vm.createContext({
    require, process, Buffer, __dirname:path.dirname(file), __filename:file,
    console:quietConsole, setTimeout, clearTimeout, module:{exports:{}}, exports:{},
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename:file, timeout:10000});
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const core = context.Live2DCubismCore;
      if (core?.Version?.csmGetVersion() > 0) return {core, logs};
    } catch { /* Emscripten may still be initializing its embedded WASM. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw Error('Official Cubism Core did not initialize within 10 seconds.');
}

async function main(config) {
  const report = {
    schema:1, model:localName(config.model), checkedAt:new Date().toISOString(),
    scope:'File integrity and native Core geometry checks; not a replacement for visual rigging review.',
    checks:[], files:[], parameters:[], physicsGroups:[], motions:[], expressions:[], combinedPoses:[],
    errors:[], warnings:[], core:null,
  };
  const check = (name, passed, detail, severity = 'error') => {
    report.checks.push({name, passed:Boolean(passed), ...(detail === undefined ? {} : {detail})});
    if (!passed) report[severity === 'warning' ? 'warnings' : 'errors'].push(name);
    return Boolean(passed);
  };
  let model, moc;
  try {
    const document = json(config.model);
    check('model3 Version is 3', document.Version === 3);
    const references = document.FileReferences || {};
    const base = path.dirname(config.model);
    const resolved = new Map();
    function reference(label, value, required = false) {
      if (value === undefined && !required) return null;
      if (!check(`${label} has a relative file path`, typeof value === 'string' && value.length > 0 && !/[?#]/.test(value) && !/^(?:[a-z]+:|[\\/])/i.test(value))) return null;
      const file = path.resolve(base, value.replace(/\\/g, '/'));
      const relative = path.relative(base, file);
      if (!check(`${label} stays inside the model package`, relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) return null;
      if (!check(`${label} file exists`, fs.existsSync(file) && fs.statSync(file).isFile(), value)) return null;
      let current = base, exact = true;
      for (const part of relative.split(path.sep)) {
        if (!fs.readdirSync(current).includes(part)) exact = false;
        current = path.join(current, part);
      }
      check(`${label} path has portable letter case`, exact, value);
      const size = fs.statSync(file).size;
      check(`${label} file is non-empty`, size > 0);
      if (!resolved.has(file)) {
        report.files.push({file:value.replace(/\\/g, '/'), bytes:size, sha256:sha(file)});
        resolved.set(file, {file, value});
      }
      return file;
    }
    const mocFile = reference('Moc', references.Moc, true);
    check('Moc uses .moc3', typeof references.Moc === 'string' && /\.moc3$/i.test(references.Moc));
    check('Textures is a non-empty array', Array.isArray(references.Textures) && references.Textures.length > 0);
    const textureFiles = (references.Textures || []).map((value, index) => reference(`Texture ${index}`, value, true));
    for (const [index, file] of textureFiles.entries()) if (file) {
      const header = fs.readFileSync(file);
      if (/\.png$/i.test(file)) {
        check(`Texture ${index} is a PNG`, header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
        if (header.length >= 24) check(`Texture ${index} dimensions are valid`, header.readUInt32BE(16) > 0 && header.readUInt32BE(20) > 0,
          {width:header.readUInt32BE(16), height:header.readUInt32BE(20)});
      }
    }
    const physicsFile = reference('Physics', references.Physics, true);
    for (const label of ['DisplayInfo','Pose','UserData']) {
      const file = reference(label, references[label]);
      if (file) { json(file); check(`${label} is valid JSON`, true); }
    }
    const motionFiles = [];
    for (const [group, items] of Object.entries(references.Motions || {})) {
      if (!check(`Motion group ${group} is an array`, Array.isArray(items))) continue;
      for (const [index, item] of items.entries()) {
        const label = `Motion ${group}[${index}]`;
        const file = reference(label, item.File, true);
        if (file) motionFiles.push({file, group, label});
        reference(`${label} Sound`, item.Sound);
      }
    }
    const expressionFiles = [];
    check('Expressions is an array', references.Expressions === undefined || Array.isArray(references.Expressions));
    for (const [index, item] of (references.Expressions || []).entries()) {
      const label = `Expression ${item.Name || index}`;
      const file = reference(label, item.File, true);
      if (file) expressionFiles.push({file, label});
    }
    if (!mocFile) throw Error('A readable .moc3 is required for native checks.');
    const loaded = await loadCore(config.core);
    const C = loaded.core;
    report.core = {file:localName(config.core), sha256:sha(config.core), version:C.Version.csmGetVersion(), logs:loaded.logs};
    const bytes = fs.readFileSync(mocFile);
    check('MOC3 magic is valid', bytes.subarray(0, 4).toString('ascii') === 'MOC3');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const consistent = Boolean(C.Moc.prototype.hasMocConsistency(arrayBuffer));
    if (!check('Official Core confirms MOC consistency', consistent)) throw Error('Native MOC consistency check failed.');
    moc = C.Moc.fromArrayBuffer(arrayBuffer);
    if (!check('Official Core constructs Moc', Boolean(moc))) throw Error('Native Moc construction failed.');
    model = C.Model.fromMoc(moc);
    if (!check('Official Core constructs Model', Boolean(model))) throw Error('Native Model construction failed.');
    const parameters = model.parameters;
    const drawables = model.drawables;
    const ids = Array.from(parameters.ids);
    const parameterSet = new Set(ids);
    const partSet = new Set(Array.from(model.parts.ids));
    const drawableIds = Array.from(drawables.ids);
    const defaults = Array.from(parameters.defaultValues);
    check('Parameter IDs are unique', parameterSet.size === parameters.count);
    check('Drawable IDs are unique', new Set(drawableIds).size === drawables.count);
    check('Model contains multiple drawable meshes', drawables.count > 1, drawables.count);
    for (let i = 0; i < parameters.count; i++) {
      const lo = parameters.minimumValues[i], hi = parameters.maximumValues[i], initial = defaults[i];
      check(`${ids[i]} has a finite ordered range`, [lo,hi,initial].every(Number.isFinite) && lo <= initial && initial <= hi, {min:lo,max:hi,default:initial});
    }
    for (let i = 0; i < drawables.count; i++) {
      const points = drawables.vertexPositions[i], uv = drawables.vertexUvs[i], indices = drawables.indices[i];
      check(`${drawableIds[i]} has valid mesh data`, finiteArray(points) && finiteArray(uv) && points.length === drawables.vertexCounts[i] * 2 && uv.length === points.length && indices.length % 3 === 0 && Array.from(indices).every(v => v >= 0 && v < drawables.vertexCounts[i]));
      check(`${drawableIds[i]} texture index exists`, drawables.textureIndices[i] >= 0 && drawables.textureIndices[i] < textureFiles.length);
      check(`${drawableIds[i]} clipping masks exist`, Array.from(drawables.masks[i]).every(v => v >= 0 && v < drawables.count));
    }
    report.drawableMeshes = drawableIds.map((id,index) => ({
      id, vertices:drawables.vertexCounts[index], triangles:drawables.indices[index].length / 3,
      texture:drawables.textureIndices[index], masks:Array.from(drawables.masks[index], value => drawableIds[value]),
    }));
    for (const mesh of report.drawableMeshes.filter(item => /irid|iris/i.test(item.id))) {
      const side = mesh.id.match(/([LR])(?:\d+)?$/)?.[1];
      if (side) check(`${mesh.id} is clipped by its own eye white`, mesh.masks.some(id => new RegExp(`eyewhite${side}(?:\\d+)?$`, 'i').test(id)), mesh.masks);
    }
    function snapshot() {
      return {
        vertices:drawables.vertexPositions.map(points => Array.from(points)),
        opacity:Array.from(drawables.opacities), orders:Array.from(drawables.renderOrders),
      };
    }
    function pose(values = {}) {
      parameters.values.set(defaults);
      for (const [id, value] of Object.entries(values)) {
        const index = ids.indexOf(id);
        if (index >= 0) parameters.values[index] = value;
      }
      model.update();
      return snapshot();
    }
    const neutral = pose();
    report.neutralBounds = bounds(neutral.vertices);
    check('Neutral geometry has visible extent', report.neutralBounds?.width > 0 && report.neutralBounds?.height > 0);
    function compare(state) {
      let changedCoordinates = 0, invalidCoordinates = 0, changedOpacities = 0, invalidOpacities = 0, maxDelta = 0;
      const changedDrawables = [], changedOpacityDrawables = [];
      for (let j = 0; j < state.vertices.length; j++) {
        let changed = false;
        for (let k = 0; k < state.vertices[j].length; k++) {
          const value = state.vertices[j][k];
          if (!Number.isFinite(value)) invalidCoordinates++;
          const delta = Math.abs(value - neutral.vertices[j][k]);
          if (delta > EPSILON) {changedCoordinates++;changed=true;maxDelta=Math.max(maxDelta,delta);}
        }
        if (changed) changedDrawables.push(drawableIds[j]);
        if (!Number.isFinite(state.opacity[j]) || state.opacity[j] < -EPSILON || state.opacity[j] > 1 + EPSILON) invalidOpacities++;
        if (Math.abs(state.opacity[j] - neutral.opacity[j]) > EPSILON) {changedOpacities++;changedOpacityDrawables.push(drawableIds[j]);}
      }
      return {changedCoordinates, invalidCoordinates, maxDelta, changedDrawables, changedOpacities, invalidOpacities, changedOpacityDrawables, bounds:bounds(state.vertices)};
    }
    for (let i = 0; i < parameters.count; i++) {
      const extremes = [parameters.minimumValues[i],parameters.maximumValues[i]].map(value => ({value,...compare(pose({[ids[i]]:value}))}));
      report.parameters.push({id:ids[i],min:parameters.minimumValues[i],max:parameters.maximumValues[i],default:defaults[i],extremes});
      check(`${ids[i]} extrema are finite`, extremes.every(item => item.invalidCoordinates === 0 && item.invalidOpacities === 0));
    }
    function parameterWorks(id) {
      const result = report.parameters.find(item => item.id === id);
      return result?.extremes.some(item => item.changedCoordinates > 0 || item.changedOpacities > 0) || false;
    }
    for (const id of REQUIRED) {
      check(`Required parameter ${id} exists`, parameterSet.has(id));
      if (parameterSet.has(id)) check(`${id} changes native geometry or opacity`, parameterWorks(id));
    }
    report.inertParameters = ids.filter(id => !parameterWorks(id));
    if (report.inertParameters.length) check('All declared parameters have a visible effect', false, report.inertParameters, 'warning');
    for (const [name, expected] of [['EyeBlink',['ParamEyeLOpen','ParamEyeROpen']],['LipSync',['ParamMouthOpenY']]]) {
      const group = (document.Groups || []).find(item => item.Name === name && item.Target === 'Parameter');
      check(`${name} group contains the expected parameters`, Boolean(group) && expected.every(id => group.Ids?.includes(id)));
    }
    for (const group of document.Groups || []) if (group.Target === 'Parameter') check(`Group ${group.Name} references native parameters`, (group.Ids || []).every(id => parameterSet.has(id)));
    const physics = physicsFile && json(physicsFile);
    if (physics) {
      check('Physics Version is 3', physics.Version === 3);
      check('Physics contains groups', Array.isArray(physics.PhysicsSettings) && physics.PhysicsSettings.length > 0);
      let inputs = 0, outputs = 0, particles = 0;
      for (const group of physics.PhysicsSettings || []) {
        const inputIds = (group.Input || []).map(item => item.Source?.Id);
        const outputIds = (group.Output || []).map(item => item.Destination?.Id);
        const missing = [...inputIds,...outputIds].filter(id => !parameterSet.has(id));
        report.physicsGroups.push({id:group.Id, inputs:inputIds, outputs:outputIds, missingParameters:missing});
        check(`Physics ${group.Id} parameters exist`, !missing.length, missing);
        check(`Physics ${group.Id} output parameters affect the model`, outputIds.every(parameterWorks), outputIds.filter(id => !parameterWorks(id)));
        const vertices = group.Vertices || [];
        check(`Physics ${group.Id} particles are finite`, vertices.length > 0 && vertices.every(item => [item.Position?.X,item.Position?.Y,item.Mobility,item.Delay,item.Acceleration,item.Radius].every(Number.isFinite)));
        check(`Physics ${group.Id} outputs address particles`, (group.Output || []).every(item => Number.isInteger(item.VertexIndex) && item.VertexIndex >= 0 && item.VertexIndex < vertices.length));
        inputs += inputIds.length; outputs += outputIds.length; particles += vertices.length;
      }
      for (const [field, value] of Object.entries({PhysicsSettingCount:report.physicsGroups.length,TotalInputCount:inputs,TotalOutputCount:outputs,VertexCount:particles})) {
        if (physics.Meta?.[field] !== undefined) check(`Physics metadata ${field} matches`, physics.Meta[field] === value, {expected:value,actual:physics.Meta[field]});
      }
    }
    for (const item of motionFiles) {
      const motion = json(item.file), summary = {file:localName(item.file),group:item.group,curves:[],segments:0,points:0};
      check(`${item.label} Version is 3`, motion.Version === 3);
      check(`${item.label} duration and FPS are finite`, Number.isFinite(motion.Meta?.Duration) && motion.Meta.Duration >= 0 && Number.isFinite(motion.Meta?.Fps) && motion.Meta.Fps > 0);
      for (const curve of motion.Curves || []) {
        const targetValid = curve.Target === 'Parameter' ? parameterSet.has(curve.Id) : curve.Target === 'PartOpacity' ? partSet.has(curve.Id) : curve.Target === 'Model' && ['EyeBlink','LipSync','Opacity'].includes(curve.Id);
        check(`${item.label} curve ${curve.Id} target exists`, targetValid);
        const segments = curve.Segments || [];
        let position = 2, count = 0, pointCount = 1, lastTime = segments[0], valid = segments.length >= 2 && finiteArray(segments);
        while (position < segments.length && valid) {
          const kind = segments[position++], size = kind === 1 ? 6 : [0,2,3].includes(kind) ? 2 : 0;
          if (!size || position + size > segments.length) {valid=false;break;}
          const time = segments[position + size - 2];
          if (time < lastTime - EPSILON || time > motion.Meta.Duration + EPSILON) valid = false;
          lastTime = time; position += size; count++; pointCount += kind === 1 ? 3 : 1;
        }
        check(`${item.label} curve ${curve.Id} segments are valid`, valid && position === segments.length);
        summary.curves.push({id:curve.Id,target:curve.Target,segments:count,points:pointCount});
        summary.segments += count; summary.points += pointCount;
      }
      for (const [field,value] of Object.entries({CurveCount:summary.curves.length,TotalSegmentCount:summary.segments,TotalPointCount:summary.points})) if (motion.Meta?.[field] !== undefined) check(`${item.label} metadata ${field} matches`, motion.Meta[field] === value, {expected:value,actual:motion.Meta[field]});
      report.motions.push(summary);
    }
    for (const item of expressionFiles) {
      const expression = json(item.file), refs = expression.Parameters || [];
      check(`${item.label} references real parameters`, refs.every(value => parameterSet.has(value.Id)));
      check(`${item.label} values and blend modes are valid`, refs.every(value => Number.isFinite(value.Value) && ['Add','Multiply','Overwrite'].includes(value.Blend || 'Add')));
      report.expressions.push({file:localName(item.file),parameters:refs.map(value => value.Id)});
    }
    const combinedIds = ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamEyeLOpen','ParamEyeROpen','ParamMouthOpenY'].filter(id => parameterSet.has(id));
    for (let mask = 0; mask < 2 ** combinedIds.length; mask++) {
      const values = Object.fromEntries(combinedIds.map((id, bit) => {const index=ids.indexOf(id);return [id,mask & (1 << bit) ? parameters.maximumValues[index] : parameters.minimumValues[index]];}));
      const result = compare(pose(values));
      report.combinedPoses.push({values,invalidCoordinates:result.invalidCoordinates,invalidOpacities:result.invalidOpacities,maxDelta:result.maxDelta});
    }
    check('Combined head, eyes and mouth extrema remain finite', report.combinedPoses.every(item => !item.invalidCoordinates && !item.invalidOpacities), {poses:report.combinedPoses.length});
    report.drawableCount = drawables.count;
    report.drawableIds = drawableIds;
    report.parameterCount = parameters.count;
    pose();
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    try { model?.release(); } catch { /* Native data is disposable even after a failed check. */ }
    try { moc?._release(); } catch { /* Some Core versions expose only the private release entry. */ }
    report.pass = report.errors.length === 0;
    fs.mkdirSync(config.out, {recursive:true});
    const output = path.join(config.out, 'model-check.json');
    fs.writeFileSync(output, JSON.stringify(report,null,2) + '\n');
    console.log(JSON.stringify({pass:report.pass,checks:report.checks.length,parameters:report.parameterCount || 0,drawables:report.drawableCount || 0,combinedPoses:report.combinedPoses.length,errors:report.errors,warnings:report.warnings,report:localName(output)},null,2));
    if (!report.pass) process.exitCode = 1;
  }
}

try {
  const config = options(process.argv.slice(2));
  if (config.help) console.log('node scripts/live2d/check-model.cjs [name.model3.json] [--core official-core.min.js] [--out report-directory]');
  else main(config).catch(error => {console.error(error.message);process.exitCode=1;});
} catch (error) { console.error(error.message); process.exitCode = 1; }
