# DepthFlow SLIDE

This folder vendors the SLIDE WebGL2 renderer from [K024/depth-flow](https://github.com/K024/depth-flow/tree/c10135d655a76831f40ebed9efec6c7a6b9473b8), npm `depth-flow@0.1.0`, and its WebGL dependency `twgl.js@7.0.0`. Both licenses are included. Rendering is local. The build includes the renderer, not the project's model downloads or scene editor.

The included build script changes the upstream camera rays to parallel rays for this two-plane illustration. The SLIDE renderer uploads premultiplied textures and uses the matching alpha-over equation so transparent texels beside a hair do not darken its edge during filtering. Upstream handles layer intersection and visibility. The prepared photo layers use a one-pixel uniform layer-depth map.

The local `createSlideWithTextures` entry accepts decoded full-size textures and the two edge samples. It shares its renderer, depth hierarchy and shader with the public blob factory. Automatic mipmap generation is disabled on the five explicitly linear samplers. The depth-bounds hierarchy still creates its own levels. The project adapter fetches the two source blobs and decodes them concurrently into flipped, premultiplied bitmaps with `createImageBitmap(blob, options)`. It checks the active scene generation before uploading and releases the bitmaps afterwards. The public blob factory remains available as a fallback.

The 8 × 8 RGBA edge samples in `spatial-project.js` come from the original blob path with `blurMipmapSize: 8` and `blurMipmapRadius: 0`. They belong to `assets/spatial-photo/portrait.webp` (SHA-256 prefix `2f43b7b4b0a1`) and `plate.webp` (`58f423786ec6`). If either artwork is replaced, regenerate its sample with the upstream `createBlurMipmap(await getImageDataFromBlob(blob), 8, 0)` and encode the returned RGBA bytes as base64. The primary image samplers use the full 3840 × 2160 layers.

To reproduce the bundle, install `depth-flow@0.1.0`, `twgl.js@7.0.0` and `esbuild@0.25.12` in a temporary folder, then run `node <path-to-this-folder>/build.cjs` from the temporary folder.
