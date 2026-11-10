const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../loading-page/loading-boughs.js'), 'utf8');

function setup() {
  let now = 0;
  let frameId = 0;
  const callbacks = new Map();
  const events = [];

  function eventTarget() {
    const handlers = new Map();
    return {
      addEventListener(name, callback) {
        if (!handlers.has(name)) handlers.set(name, []);
        handlers.get(name).push(callback);
      },
      dispatchEvent(event) {
        for (const callback of handlers.get(event.type) || []) callback(event);
        events.push(event);
      },
    };
  }

  function context(width = 4, height = 4) {
    const canvas = {width, height, clientWidth: 1440, clientHeight: 900, style: {}};
    const ctx = {
      canvas,
      setTransform() {}, clearRect() {}, drawImage() {}, putImageData() {},
      save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, fillRect() {},
      createImageData(w, h) { return {data: new Uint8ClampedArray(w * h * 4)}; },
    };
    canvas.getContext = () => ctx;
    return ctx;
  }

  function branchAsset() {
    const opacity = context(), heat = context();
    return {
      base: context(), scratch: context(), opacity, heat,
      image: {width: 800, height: 240}, root: .5, width: 2, height: 2,
      field: new Uint8Array([0, 85, 170, 255]),
      bins: Array.from({length: 100}, () => [0, 1, 2, 3]),
      alpha: new Uint8ClampedArray(256), tint: new Uint8ClampedArray(256),
      red: new Uint8Array(256), green: new Uint8Array(256), blue: new Uint8Array(256),
      matte: opacity.createImageData(2, 2), edge: heat.createImageData(2, 2),
      emberSamples: null,
    };
  }

  const window = eventTarget();
  const document = {...eventTarget(), hidden: false};
  const sandbox = {
    window, document, performance: {now: () => now}, devicePixelRatio: 1,
    requestAnimationFrame(callback) { callbacks.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { callbacks.delete(id); },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  vm.runInNewContext(source, sandbox);
  const boughs = new window.LoadingBoughs(context().canvas);
  boughs.loading = true;
  boughs.assets = [branchAsset(), branchAsset()];

  function step(ms = 34) {
    now += ms;
    const scheduled = [...callbacks.values()];
    callbacks.clear();
    for (const callback of scheduled) callback(now);
  }
  function advance(ms) {
    const end = now + ms;
    while (now < end) step(Math.min(34, end - now));
  }
  function hide(value) {
    document.hidden = value;
    document.dispatchEvent({type: 'visibilitychange'});
  }
  const burns = () => events.filter(event => event.type === 'infinite:soundcue' && event.detail.name === 'fire-burn');
  return {boughs, callbacks, step, advance, hide, burns};
}

test('branches spread on their own clock and hold while resources are still loading', () => {
  const f = setup();
  f.boughs.reset();
  f.advance(680);
  const middle = f.boughs.growth;
  assert.ok(middle > .1 && middle < 1);
  f.advance(1700);
  assert.ok(f.boughs.growth >= .999);
  assert.equal(f.boughs.state, 'growing');
  assert.equal(f.callbacks.size, 0);
  f.advance(10000);
  assert.equal(f.boughs.state, 'growing');
  assert.equal(f.burns().length, 0);
});

test('an early resource completion preserves the spread before one burn', async () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  const growth = f.boughs.growth;
  let finished = false;
  const completion = f.boughs.finish().then(() => { finished = true; });
  assert.equal(f.boughs.growth, growth);
  assert.equal(f.boughs.state, 'growing');
  f.advance(1000);
  assert.equal(f.boughs.state, 'growing');
  assert.equal(f.burns().length, 0);
  assert.equal(finished, false);
  f.advance(1000);
  assert.equal(f.boughs.state, 'burning');
  assert.ok(f.boughs.growth >= .999);
  assert.equal(f.burns().length, 1);
  f.advance(1700);
  await completion;
  assert.equal(f.boughs.state, 'idle');
  assert.equal(f.callbacks.size, 0);
});

test('a fully grown tree burns immediately after resources complete', async () => {
  const f = setup();
  f.boughs.reset();
  f.advance(2400);
  const completion = f.boughs.finish();
  assert.equal(f.boughs.state, 'burning');
  assert.equal(f.burns().length, 1);
  f.boughs.finish();
  assert.equal(f.burns().length, 1);
  f.advance(1700);
  await completion;
});

test('replay cancels a pending burn without completing the new opening', async () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  const previous = f.boughs.finish();
  f.boughs.reset();
  await previous;
  f.advance(2400);
  assert.equal(f.boughs.state, 'growing');
  assert.equal(f.burns().length, 0);
});

test('hiding pauses unfinished growth and resumes from the same pose', () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  const growth = f.boughs.growth;
  f.hide(true);
  f.advance(5000);
  assert.equal(f.boughs.growth, growth);
  assert.equal(f.callbacks.size, 0);
  f.hide(false);
  f.advance(1700);
  assert.ok(f.boughs.growth >= .999);
  assert.equal(f.burns().length, 0);
});

test('hiding during queued completion settles it and clears the branches', async () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  const completion = f.boughs.finish();
  f.hide(true);
  await completion;
  assert.equal(f.boughs.state, 'idle');
  assert.equal(f.callbacks.size, 0);
  f.hide(false);
  f.advance(3000);
  assert.equal(f.boughs.state, 'idle');
});

test('reduced motion shows a complete static tree and uses a short fade', async () => {
  const f = setup();
  f.boughs.setMotion(false);
  f.boughs.reset();
  f.advance(34);
  assert.ok(f.boughs.growth >= .999);
  assert.equal(f.callbacks.size, 0);
  const completion = f.boughs.finish();
  f.advance(240);
  await completion;
  assert.equal(f.boughs.state, 'idle');
});

test('enabling reduced motion settles an already queued completion promptly', async () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  const completion = f.boughs.finish();
  f.boughs.setMotion(false);
  f.advance(300);
  await completion;
  assert.equal(f.boughs.state, 'idle');
});

test('restoring motion after a static pose never retracts the branches', () => {
  const f = setup();
  f.boughs.reset();
  f.advance(340);
  f.boughs.setMotion(false);
  f.advance(34);
  const staticGrowth = f.boughs.growth;
  assert.ok(staticGrowth >= .999);
  f.boughs.setMotion(true);
  f.advance(170);
  assert.ok(f.boughs.growth >= staticGrowth);
  assert.equal(f.burns().length, 0);
});

test('missing branch art cannot block resource completion', async () => {
  const f = setup();
  f.boughs.assets = [];
  f.boughs.reset();
  await f.boughs.finish();
  assert.equal(f.boughs.state, 'idle');
  assert.equal(f.callbacks.size, 0);
});
