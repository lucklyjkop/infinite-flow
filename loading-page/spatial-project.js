/* Original photograph, prepared as two occluding surfaces for DepthFlow SLIDE. */
(() => {
  'use strict';

  const TOP_DEPTH = 210;
  const BACK_DEPTH = 102;
  const channelMap = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    // R and B store the two flat depths. G is one everywhere because the
    // portrait texture already has a full-resolution alpha channel for hair.
    context.fillStyle = `rgb(${TOP_DEPTH}, 255, ${BACK_DEPTH})`;
    context.fillRect(0, 0, 1, 1);
    return new Promise((resolve, reject) =>
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode layer map'))));
  };

  async function sourceBlob(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not read spatial photo layer');
    return response.blob();
  }

  // The two 8×8 edge samples produced by the original SLIDE blob loader.
  // These tiny textures are sampled just outside the photographic boundary.
  const edgeSamples = {
    'plate.webp':'Gxwd/yYkJP8kIyT/KCks/zY5QP8wMTf/HR4f/xMUFP8fICH/ICEj/yUlJ/8qKy//NTY8/y4uMv8fHh7/FRUV/yIjJf8mKCv/KCsu/y4vM/8zNDn/LCww/yMhIf8ZGRn/JCYp/ysuM/8uMjj/MzU7/zIzOP8rLC//JCQl/xsdH/8mKCv/KzA2/zM5QP80OUD/MTQ7/yssMf8kJSj/Gx0g/ygrMP81OD3/OT5G/zc9SP8xNj7/Ky4z/yUnKv8cHyL/LDE4/zY9Rf8+RE//OkJN/zE2Pv8rLjT/Jysv/yMnK/8tMzr/Nz9I/ztDTv84P0n/MDU+/ysvNP8qLjL/Ki8z/w==',
    'portrait.webp':'AAAAAAAAAAAAAAAAVVVVBnRkXEBRS0udb1lZFwAAAAAAAAAAAAAAAAAAAAJbSUkOXFJPZ1VHRM14XFwkZjNmBQAAAAAAAAAAMzMzBV5RUSZjTku0a1JNzIhra1ZwQFAQAAAAAAAAAAAtLS0RSD88bl48N+NnQzzmZEVEpmAwNTAAAAAAAAAAAS4pJDI1KifCQiQh50wvKfU8IyDiTiQkVQAAAABVAAADLycjQTklIrlJKSjfOSIe9y8aFe86GxtUAAAAAEBAQAhROjpCRCcmyjghH/QzHRr7LRkW8TEXF1gAAAAASioqGFQ5Nqk3ISDlKhoX+i8cGfwuHRvzLRgVVQ==',
  };

  function edgeTexture(name) {
    return new ImageData(Uint8ClampedArray.from(atob(edgeSamples[name]), c => c.charCodeAt(0)), 8, 8);
  }

  function focusRadius(options = {}) {
    const value = options.depthOfField;
    const radius = value === true ? 2.4 : Number(typeof value === 'object' && value ? value.radius : value);
    return Number.isFinite(radius) ? Math.max(0, Math.min(6, radius)) : 0;
  }

  function settings(options) {
    return {
      forwardSteps: 24, backwardSteps: 12, edgeBlurThreshold: .0001,
      blurMipmapSize: 8, blurMipmapRadius: 0,
      pixelRatio: Math.min(1.5, window.devicePixelRatio || 1),
      depthOfField: focusRadius(options),
    };
  }

  function alignment(token, room) {
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return room;
    if (token?.endsWith('%')) return room * parseFloat(token) / 100;
    if (token?.endsWith('px')) return parseFloat(token);
    return room / 2;
  }

  window.createProjectSpatialRenderer = async function(canvas, plate, portrait, options = {}) {
    if (!window.DepthFlowSlide || !plate.naturalWidth || !portrait.naturalWidth) return null;
    if (plate.naturalWidth * portrait.naturalHeight !== portrait.naturalWidth * plate.naturalHeight) {
      throw new Error('Spatial photo layers must use the same framing');
    }
    const {naturalWidth: width, naturalHeight: height} = portrait;
    const [bottomImage, originalImage, layerMap] = await Promise.all([
      sourceBlob(plate.currentSrc || plate.src), sourceBlob(portrait.currentSrc || portrait.src), channelMap(),
    ]);
    const renderer = await window.DepthFlowSlide.createFlowSlideRenderer(canvas, {
      type:'slide', version:1, width, height, originalImage, bottomImage, originalDepthMap:layerMap, layerMap,
    }, settings(options));
    return camera(canvas, renderer, width, height, options);
  };

  // Decode each source once, in the browser's asynchronous blob decoder.
  // Building a bitmap from an HTMLImageElement can block on another full decode.
  window.createProjectSpatialRenderer.fromURLs = async function(canvas, urls, current, options = {}) {
    const slide = window.DepthFlowSlide;
    if (!slide?.createSlideWithTextures || typeof createImageBitmap !== 'function') return null;
    const results = await Promise.allSettled(urls.map(async url => {
      const blob = await sourceBlob(url);
      if (!current()) return null;
      // ImageBitmap ignores WebGL pixel-store flags: apply orientation and premultiplication here.
      return createImageBitmap(blob, {imageOrientation:'flipY', premultiplyAlpha:'premultiply'});
    }));
    try {
      if (!current() || results.some(result => result.status !== 'fulfilled' || !result.value)) return null;
      const [bottomImage,topImage] = results.map(result => result.value);
      // The edge samples belong to this exact pair; let the general blob factory
      // build its own samples when a caller supplies any other artwork or size.
      if (topImage.width !== 3840 || topImage.height !== 2160 ||
          bottomImage.width !== topImage.width || bottomImage.height !== topImage.height ||
          !urls.every((url,i) => new URL(url,document.baseURI).pathname.endsWith(
            '/assets/spatial-photo/' + (i ? 'portrait' : 'plate') + '.webp'))) return null;
      const {width,height} = topImage;
      const renderer = await slide.createSlideWithTextures(canvas, {
        width, height, topImage, bottomImage,
        layerMap:new ImageData(new Uint8ClampedArray([TOP_DEPTH,255,BACK_DEPTH,255]),1,1),
        topBlurMipmap:edgeTexture('portrait.webp'), bottomBlurMipmap:edgeTexture('plate.webp'),
      }, settings(options));
      return camera(canvas, renderer, width, height, options);
    } finally {
      for (const result of results) if (result.status === 'fulfilled') result.value?.close();
    }
  };

  function camera(canvas, renderer, width, height, options) {
    const target = [0, 0, 0], origin = [0, 0, -1];
    const radius = focusRadius(options);
    const depthOfFieldRadiusUV = [radius / width, radius / height];
    let displayedWidth = width, displayedHeight = height, zoomScale = 1;

    function resize(viewWidth, viewHeight, fit = 'cover', position = '50% 50%') {
      if (!(viewWidth > 0 && viewHeight > 0)) return false;
      const cover = Math.max(viewWidth / width, viewHeight / height);
      const scale = fit === 'contain' ? Math.min(viewWidth / width, viewHeight / height) : cover;
      displayedWidth = scale * width;
      displayedHeight = scale * height;
      // Source UV radii follow the fitted image rectangle, not the drawing-buffer
      // resolution, so 2.4 means 2.4 CSS px on both Retina and ordinary screens.
      depthOfFieldRadiusUV[0] = radius / displayedWidth;
      depthOfFieldRadiusUV[1] = radius / displayedHeight;
      zoomScale = cover / scale;
      const [x, y] = position.split(/\s+/);
      const left = alignment(x, viewWidth - displayedWidth);
      const top = alignment(y, viewHeight - displayedHeight);
      target[0] = (viewWidth - 2 * left) / displayedWidth - 1;
      target[1] = 1 - (viewHeight - 2 * top) / displayedHeight;
      // SLIDE extends edge texels while panning. In contain mode the original
      // image rectangle is the visible area, so letterbox bars stay outside it.
      const inset = [top, viewWidth - left - displayedWidth, viewHeight - top - displayedHeight, left];
      canvas.style.clipPath = fit === 'contain' ? 'inset(' + inset.map(v => Math.max(0, v) + 'px').join(' ') + ')' : '';
      return true;
    }

    return {
      depthOfField: radius,
      resize,
      draw(dx, dy) {
        origin[0] = 2 * dx / displayedWidth;
        origin[1] = -2 * dy / displayedHeight;
        renderer.render({origin, target, zoomScale, depthOfFieldRadiusUV});
        return true;
      },
      dispose() {
        canvas.style.clipPath = '';
        renderer.dispose();
      },
    };
  }
})();
