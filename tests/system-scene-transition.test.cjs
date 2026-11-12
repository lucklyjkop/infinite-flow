const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../loading-page/system-scene-transition.js'), 'utf8');

function setup() {
  const listeners = new Map(), created = [], children = [], animations = [];
  const document = {
    hidden: false,
    body: {append(node) {children.push(node);}},
    createElement(tag) {
      created.push(tag);
      return {tagName:tag, style:{}, setAttribute() {}, remove() {const index=children.indexOf(this);if(index>=0)children.splice(index,1);}};
    },
    addEventListener(type, listener) {if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},
    removeEventListener(type, listener) {listeners.get(type)?.delete(listener);},
  };
  const window = {};
  const page = {isConnected:true, hidden:false, inert:false, style:{opacity:'.95',willChange:'transform'}, animate(keyframes,options) {
    let resolve, reject;
    const animation = {keyframes,options,playState:'running',finished:new Promise((r,j)=>{resolve=r;reject=j;}),
      finish() {this.playState='finished';resolve();},cancel() {this.playState='idle';reject(new Error('cancelled'));}};
    animations.push(animation);return animation;
  }};
  vm.runInNewContext(source,{window,document,Float64Array});
  return {api:window.InfiniteSceneTransition,page,document,created,children,animations,listeners,
    hide() {document.hidden=true;for(const listener of listeners.get('visibilitychange')||[])listener();}};
}

test('a live archive keeps its original DOM, opacity and card art during preparation', () => {
  const env=setup(), cover=env.api.createLive(env.page);
  assert.deepEqual(env.created,['div']); // No approximate canvas image replaces the sliced card.
  assert.equal(env.page.style.opacity,'.95');
  assert.equal(env.page.inert,true);
  assert.equal(cover.getState().stage,'preparing');
  cover.release();
  assert.equal(env.page.style.opacity,'.95');
  assert.equal(env.page.inert,false);
  assert.equal(env.children.length,0);
});

test('the completed fade remains transparent until the caller hides the archive', async () => {
  const env=setup(), cover=env.api.createLive(env.page);
  const done=cover.play(null,{duration:320});
  assert.equal(env.animations[0].options.fill,'forwards');
  assert.equal(env.animations[0].options.duration,320);
  env.animations[0].finish();
  assert.equal(await done,true);
  assert.equal(env.api.getState().visible,true);
  assert.equal(cover.getState().progress,1);
  env.page.hidden=true;
  cover.release();
  assert.equal(env.page.hidden,true);
  assert.equal(env.page.inert,true);
  assert.equal(env.api.getState().visible,false);
  assert.equal(env.page.style.willChange,'transform');
});

test('cancelling a running fade restores the source without touching the next handoff', async () => {
  const env=setup(), first=env.api.createLive(env.page), done=first.play(null);
  first.release();
  const second=env.api.createLive(env.page);
  assert.equal(await done,false);
  assert.equal(second.getState().visible,true);
  assert.equal(env.page.inert,true);
  assert.equal(env.children.length,1);
  second.release();
  assert.equal(env.page.inert,false);
});

test('reduced motion fades immediately without allocating an animation or canvas', async () => {
  const env=setup(), cover=env.api.createLive(env.page);
  assert.equal(await cover.play(null,{reducedMotion:true}),true);
  assert.equal(env.page.style.opacity,'0');
  assert.equal(env.animations.length,0);
  assert.deepEqual(env.created,['div']);
  env.page.hidden=true;cover.release();
  assert.equal(env.page.style.opacity,'.95');
});

test('backgrounding a live fade finishes it and removes its visibility listener', async () => {
  const env=setup(), cover=env.api.createLive(env.page), done=cover.play(null);
  env.hide();
  assert.equal(await done,true);
  assert.equal(env.listeners.get('visibilitychange').size,0);
  cover.release();
});

test('a live cover cannot play twice or accept an absent source', async () => {
  const env=setup();
  assert.throws(()=>env.api.createLive(null));
  assert.throws(()=>env.api.createLive({...env.page,hidden:true}));
  const cover=env.api.createLive(env.page);
  assert.equal(await cover.play(null,{reducedMotion:true}),true);
  assert.equal(await cover.play(null,{reducedMotion:true}),false);
  cover.release();
});
