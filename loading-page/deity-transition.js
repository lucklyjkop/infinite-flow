/* Reveal the generated place-name artwork through soft calligraphic strokes. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  let serial = 0;
  const node = (name, attrs = {}) => {
    const element = document.createElementNS(ns, name);
    Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  };

  window.playDeityLocationReveal = (root, title, branch, {motion = true} = {}) => {
    const animations = [], layers = [];
    let completed = false, guard = 0, resolve;
    const finished = new Promise(done => { resolve = done; });
    const finish = (success = true) => {
      if (completed) return;
      completed = true;
      clearTimeout(guard);
      root.classList.add('location-written');
      root.classList.remove('is-writing-location');
      animations.forEach(animation => animation.cancel());
      layers.forEach(layer => layer.remove());
      resolve(success);
    };
    const result = {finished, finish: () => finish(true), cancel: () => finish(false)};
    if (!motion || !title?.naturalWidth || !branch?.naturalWidth) { finish(); return result; }
    const id = ++serial;
    function layer(image, key, width, height) {
      const svg = node('svg', {class:'deity-growth-layer', viewBox:`0 0 ${width} ${height}`, preserveAspectRatio:'none', 'aria-hidden':'true', focusable:'false'});
      const maskId = `deity-growth-${id}-${key}`;
      const defs = node('defs');
      const filter = node('filter', {id:`${maskId}-soft`, x:'-10%', y:'-10%', width:'120%', height:'120%'});
      filter.append(node('feGaussianBlur', {stdDeviation:key === 'type' ? 2.2 : 1.4}));
      const mask = node('mask', {id:maskId, maskUnits:'userSpaceOnUse', x:0, y:0, width, height, 'mask-type':'alpha'});
      const strokes = node('g', {fill:'none', stroke:'#fff', 'stroke-linecap':'round', 'stroke-linejoin':'round', filter:`url(#${maskId}-soft)`});
      mask.append(strokes); defs.append(filter, mask);
      svg.append(defs, node('image', {href:image.currentSrc || image.src, width, height, preserveAspectRatio:'none', mask:`url(#${maskId})`}));
      image.parentElement.append(svg); layers.push(svg);
      return {strokes, mask, width, height};
    }
    function animate(element, frames, duration, delay = 0) {
      const animation = element.animate(frames, {duration, delay, fill:'both', easing:'cubic-bezier(.22,.68,.28,1)'});
      animations.push(animation);
      return animation;
    }
    function stroke(host, path, width, delay, duration) {
      const mark = node('path', {d:path, 'stroke-width':width, pathLength:1, 'stroke-dasharray':1, 'stroke-dashoffset':1});
      host.append(mark);
      animate(mark, [{strokeDashoffset:'1'}, {strokeDashoffset:'0'}], duration, delay);
    }
    const ink = layer(title, 'type', 1600, 480);
    const twig = layer(branch, 'twig', 1200, 105);
    root.classList.add('is-writing-location');
    const glyphs = [
      [
        ['M 174 47 Q 226 100 275 75', 103],
        ['M 117 180 Q 230 173 292 152', 105],
        ['M 160 266 L 286 233', 91],
        ['M 238 201 Q 233 322 215 338', 91],
        ['M 15 410 Q 183 342 334 348 L 385 362', 97],
      ],
      [
        ['M 490 84 Q 550 117 515 145', 92],
        ['M 560 169 Q 496 223 421 230 M 550 190 Q 514 289 504 331', 99],
        ['M 557 181 Q 576 227 605 248', 74],
        ['M 657 135 Q 713 104 753 143 L 733 228 L 690 264', 103],
        ['M 668 37 L 663 388 L 622 454', 99],
      ],
      [
        ['M 954 67 Q 1008 92 996 108', 99],
        ['M 855 215 Q 860 160 941 147 L 1106 114 L 1134 140', 106],
        ['M 938 209 L 879 263 M 1030 179 Q 1042 217 1092 224', 86],
        ['M 957 285 L 1061 257 M 1002 281 L 987 350', 93],
        ['M 828 391 Q 976 346 1114 360 L 1150 382', 101],
      ],
      [
        ['M 1251 70 Q 1290 91 1264 117', 91],
        ['M 1265 158 L 1216 353', 96],
        ['M 1350 120 L 1468 70 Q 1494 103 1479 390 Q 1445 382 1362 343', 101],
        ['M 1328 200 Q 1371 157 1413 182 L 1397 288 L 1312 280 L 1328 200', 86],
        ['M 1331 240 L 1399 224', 66],
      ],
    ];
    glyphs.forEach((paths, glyph) => paths.forEach(([path, width], index) => stroke(ink.strokes, path, width, glyph * 130 + index * 28, 185)));
    const inkResolve = node('rect', {width:1600, height:480, fill:'#fff'});
    ink.mask.append(inkResolve);
    animate(inkResolve, [{opacity:0}, {opacity:1}], 100, 615);
    stroke(twig.strokes, 'M 0 80 C 75 35 155 59 228 73 S 345 59 409 78 S 561 93 637 91 S 775 93 843 69 S 961 71 1044 73 S 1134 64 1200 53', 43, 650, 270);
    stroke(twig.strokes, 'M 354 65 Q 373 46 375 12 M 807 77 Q 834 65 854 38', 28, 755, 150);
    [[326,48,55,740],[411,63,53,785],[854,43,20,840]].forEach(([cx,cy,r,delay]) => {
      const flower = node('circle', {cx,cy,r,fill:'#fff',stroke:'none'});
      flower.style.transformOrigin = `${cx}px ${cy}px`; twig.strokes.append(flower);
      animate(flower, [{opacity:0,transform:'scale(.2)'},{opacity:1,transform:'scale(1)'}], 120, delay);
    });
    const twigResolve = node('rect', {width:1200,height:105,fill:'#fff'});
    twig.mask.append(twigResolve);
    animate(twigResolve, [{opacity:0},{opacity:1}], 80, 880);
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => finish(true));
    guard = setTimeout(() => finish(true), 1100);
    return result;
  };
})();
