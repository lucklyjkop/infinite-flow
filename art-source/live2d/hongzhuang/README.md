# 红妆 Live2D 首版

从本项目的 Q 版正面红妆重新生成独立透明部件，经技术切片、坐标注册和真实 Cubism 绑定导出。没有使用大肥鱼角色的模型、网格或贴图；大肥鱼仅作为画风与本机工具流程参考。

## 文件

- `generated/`：内置生图的衣服身体、发部件、无五官脸底与五官图集；提示词和工具记录见 `generated/generation.json`。
- `rig-layout/hongzhuang.layout.json`：1024×1536 画布、17 个参与绑定的独立 PNG 部件的层序、语义和位置。
- `rig-layout/layout-preview.png`：注册后的源部件合成（显示张口源图，闭合形态由绑定网格产生）。
- `rig-layout/registration.json`：源图切片区域、目标位置和部件哈希。
- `model/hongzhuang.psd`：17 层可编辑原画；原闭嘴图仍保存在 `rig-layout/mouth-close.png` 供美术参考。
- `model/hongzhuang.psd2live`：含嵌入图片的 PSD2Live 工程，可以继续修改绑定。
- `model/hongzhuang.layout.cmo3`：Cubism 编辑工程。导出有效性由工具与官方 Core 检查；尚未在 Cubism Editor 图形界面中人工编辑验收。
- `model/binding-record.json`：绑定参数、工具校验值和运行文件清单。
- 运行入口：`loading-page/assets/live2d/hongzhuang/hongzhuang.model3.json`，必须与同目录的 MOC、纹理、物理、动作和表情文件一同部署。

## 绑定范围

模型包含 17 个实际绘制网格、20 个参数：左右眼独立眨眼、瞳孔 XY 跟随、张闭嘴、眉毛、头部 XYZ、身体姿态、呼吸、前后发物理和眼睛轻微弹性。提供 Idle、Blink、Nod、Shake 动作及四种基础表情。双瞳各由对应眼白网格裁剪。上睫毛使用独立紧边界图层，下眼线归入眼白，闭眼时随眼白压合；整圈眼线不得作为单个睫毛层，否则绑定器按列求中心线时会把下眼线拉到脸颊。

中性眼球中心按母版校正到画布 X=406/606，虹膜为 80×90。刘海高度为 453，减少遮挡眼眶与眉毛。眨眼落点在眼眶高度 58% 处（边角 28% 加弧深 30%），上睫毛保留 65% 厚度；瞳孔物理形变限制为伸长 3%、收窄 1.5%。这些参数随绑定工程保存，不靠浏览器隐藏错误部件。

嘴部只绑定原始张口贴图 `ArtMeshMouthOpen`，由同一网格连续压合成柔和微笑线再张开。旧版 50px 宽闭嘴笑线与 35px 宽张口层交叉淡出，导致中等开口叠出两条嘴线；原闭嘴图保留但不再参与绑定。当前嘴图注册为 `(488, 598, 35, 18)`，唇缝位于高度 20%（画布 Y=601.6），主要让下唇向下打开。关闭自动生成的唇线，闭口收窄为 0，表情展宽为 3%、微笑强度 5%、微笑整体偏移 0。张闭口固定宽度和中心，不切换位图或透明度；眼睛及其他部件的注册与绑定参数保持原值。

身体、双袖、手和红线保留在连续的同一网格，确保轻幅身体与呼吸形变时红线不断裂；这版未提供独立手指、抬臂或大幅衣袖动作。运行时应使用轻幅转头，参数全幅通过数值检查不代表所有大幅视觉组合均已精修。

## 重现

需要 Python 3.10+、Pillow、NumPy、SciPy，以及本机独立安装的 [PSD2Live 3.6.7](https://github.com/tsunehimatoi/psd2live) portable 与同版本源码中的 `mcp_proxy.py`。项目不携带该工具安装包。当前本机工具位于 `E:/大肥鱼/vendor/psd2live/PSD2Live.exe`；脚本只读取该工具，所有过程与输出均写入本项目。

从仓库根目录运行：

```powershell
python scripts/live2d/prepare-hongzhuang.py
python scripts/live2d/bind-hongzhuang.py --portable "E:/大肥鱼/vendor/psd2live/PSD2Live.exe" --proxy-source "E:/大肥鱼/vendor/psd2live-source" --mesh-spacing 24
python scripts/live2d/package-hongzhuang.py
node scripts/live2d/check-model.cjs
```

重新生成后先运行模型检查与实机预览，再发布运行包。绑定器只启动自己拥有的临时本机回环 MCP 进程，结束后关闭，不依赖常驻服务或 API 密钥。图像处理仅作透明噪点清理、裁切、像素分类分离和注册缩放；没有程序重绘美术。
