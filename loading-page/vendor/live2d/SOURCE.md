# Browser model runtime

The project uses its own Hongzhuang model and artwork. No community character,
texture, motion or expression asset was copied into the game.

## Browser wrapper

`live2d-vendor.js` is the unmodified browser bundle from
[A8Chann/dsh-pet-live2d](https://github.com/A8Chann/dsh-pet-live2d), copied from the
user's existing 大肥鱼 preview. SHA-256:
`5614646efe5fab218317c0adc8ea2c6fe979212ed08de693e46bccbb8bb0c845`.

The upstream `dsh-live2d-pet/package.json` declares PIXI 8.19.0 and
untitled-pixi-live2d-engine 1.3.5. The published browser entry exports Application,
Point, extensions, MotionPriority, configureCubismSDK, Live2DModel and Live2DPlugin.
The bundle's embedded license comments are preserved. The wrapper entry is MIT
licensed (`A8Chann-LICENSE.txt`); this license does not cover the upstream project’s
community character assets, which are not used here.

PIXI and the engine licenses are preserved as `PixiJS-LICENSE.txt` and
`Engine-LICENSE.txt`. Transitive dependency notices are preserved separately;
`dependency-license-sources.json` records their npm package sources. The colord
MIT license is from https://github.com/omgovich/colord/blob/master/LICENSE.md.
These notice package versions document the compatible published license sources;
they do not claim to reconstruct an unavailable upstream bundle lockfile.

The engine also contains Cubism Framework components. These components are under
Live2D's Open Software License, not the wrapper's MIT license. See
`Cubism-Framework-LICENSE.md` copied from the official
[CubismWebFramework repository](https://github.com/Live2D/CubismWebFramework/blob/develop/LICENSE.md)
and the [Live2D Open Software License](https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html).

## Official Cubism Core

Core is not committed into this repository. `scripts/setup-live2d-runtime.py`
downloads it directly from the official URL into the ignored
`output/live2d-runtime/live2dcubismcore.min.js`. The game server exposes that one
verified cache file at `/runtime/live2dcubismcore.min.js`. An existing valid file
works offline. The setup requires Python only and no API key.

- URL: https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
- Verified on: 2026-11-09
- SHA-256: `25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f`
- Size: 207155 bytes
- Modification: none; the full original license header is retained.
- License: [Live2D Proprietary Software License](https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html).

Core identifies itself as Redistributable Code; the linked agreement applies its
own use, publication and redistribution conditions. It is not relicensed by this
repository. The cache strategy follows the existing preview project and keeps
the proprietary runtime out of the source/artwork bundle.

If a future official Core release changes this URL's bytes, setup deliberately
rejects the unknown hash. Update the pin only after testing its model compatibility
and preserving its license notice. Runtime load failure leaves the existing
portrait visible instead of showing an empty canvas.
