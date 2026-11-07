# 当前美术源文件

`imagegen/` 保存当前版本实际使用的源 PNG、提示词、可核实的生成参数和裁切记录，沿用原 `output/imagegen/` 的相对目录。未收录早期废稿、重复预览、安装包与生成服务凭据。

| 源文件 | 游戏中的导出目录 |
| --- | --- |
| `imagegen/nai-v5-user-style-v3-fixed.*`：批准的背景、原始尺寸图和参数 | `loading-page/assets/hongzhuang-nai-v3-4k.webp`；空间照片分层在 `loading-page/assets/spatial-photo/` |
| `imagegen/folding-fan-brocade.*`、`loading-bough-*.png`、`loading-boughs.json` | `loading-page/assets/loading-ui/` |
| `imagegen/sakura-calligraphy.png`、`sakura-branch.png`、`sakura-title.json` | `loading-page/assets/menu-ui/` 的标题与樱枝 |
| `imagegen/sakura-menu-atlas.*`、`title-ui-atlas-v2.*` | `loading-page/assets/menu-ui/` 的按钮状态与文字 |
| `imagegen/settings-folio/` 的纸页、封面、场景、屏风人物、梅枝、骰子、控件和左侧选中图集 | `loading-page/assets/settings-folio/` |

设置页的 `imported/imported-1.png` 至 `imported-3.png` 是用户提供的三张原始无字控件。`reference-layout.png` 和 `reference-controls.png` 是用户提供的设计参考；它们用于后续生成时核对风格，不由游戏加载。元数据中提到的原始 ZIP 是来源记录，已解出的三张 PNG 均在仓库内，无需该 ZIP 即可继续编辑。

元数据中原电脑的绝对文件路径已换成仓库根目录下的相对路径；原本的相对路径仍相对于所在元数据文件。`archive-index.json` 记录收录文件的大小和 SHA-256。页面运行始终读取 `loading-page/assets/`，修改源图后需按对应 manifest 的尺寸、裁切和透明通道要求更新该目录中的导出图。

内置生图未披露的模型编号或画质档位继续保留为未知；已有 API 生成记录按原记录保存。此目录不另行授予素材许可，第三方素材的来源说明以对应记录为准。
