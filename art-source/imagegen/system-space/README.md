# 系统空间素材

2026-11-09，按中央正面 Q 版红妆、两侧六个悬浮入口、底部输入框制作。所有新栅格美术使用内置 `image_gen.imagegen`；具体模型版本与画质档位未由工具披露。提示词请求最高可用画质。

| 源稿 | 运行贴图 | 用途 |
| --- | --- | --- |
| [hongzhuang-chibi-front.png](hongzhuang-chibi-front.png) | `loading-page/assets/system-space/hongzhuang.webp` | 正面角色母版，透明背景 |
| [sanctuary.png](sanctuary.png) | `loading-page/assets/system-space/sanctuary.webp` | 安静的铜环空间背景 |
| [floating-medallion.png](floating-medallion.png) | `loading-page/assets/system-space/floating-medallion.webp` | 六个悬浮入口共用底纹，透明背景 |
| [composer-rounded.png](composer-rounded.png) | `loading-page/assets/system-space/composer-rounded.webp` | 当前输入框底纹，圆润 R 角、透明背景 |
| [composer.png](composer.png) | `loading-page/assets/system-space/composer.webp` | 短对话底纹与输入框初版，透明背景 |
| [panel.png](panel.png) | `loading-page/assets/system-space/panel.webp` | 按需展开的详情面板，透明背景 |

完整提示词、参考图角色与可核实参数：[人物、背景、详情贴图](generation.json)，[悬浮按钮与输入框初版](floating-ui-generation.json)，[圆角输入框](composer-rounded-generation.json)。尺寸、导出和 SHA-256 记录见 [exports.json](exports.json)。运行输入框只裁去透明留白，保留原画和 alpha；未重绘主体。

`references/dafeiyu-front.png` 是用户现有大肥鱼项目的正面母版，用于 Q 版比例与画风参考。红妆身份、衣饰来自 `../deity-space/hongzhuang.png`。当前导出为完整透明插画，尚未拆层或绑定 Cubism，不是可直接运行的 Live2D 模型。页面已预留模型挂载与视线接口。

控件上的线性功能图标是代码内 SVG，功能文字为可访问的界面文字；纹理与透明边缘来自上述生成素材。
