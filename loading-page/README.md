# 无限流 · 加载与标题页面

游戏入口原型。通过下方 Python HTTP 服务预览，无需安装前端依赖；请勿直接双击 HTML，音效与部分渲染资源需要 HTTP 加载。云端和换电脑开发说明见[仓库首页](../README.md)。

开场中央先透出原画，墨雾沿不规则的柔边向四周散开，约 2.45 秒后散尽。墨雾透明度分段预烘焙，浏览器只合成两层贴图。减少动态模式使用约 200 毫秒的淡入。十一簇樱枝从四边分批蔓入，竖屏采用单独的枝条位置。画面下方的五片暗胭脂绢扇带有暗金绣边和樱花镂空。第一片绕扇心轻摆一次，余下四片随进度在 23%、50%、74% 和 98% 展开。

加载到 100% 时，折扇碎散，樱枝同时从不同的枝端或枝根开始焚化。火线沿着木质分叉推进，灰屑随之飘起，约 1.53 秒后进入标题页，依次显出题字、花枝和菜单。减少动态模式使用静态枝条和约 160 毫秒的淡出。枝条源稿和提示词见 `../art-source/imagegen/loading-boughs.json`，折扇见 `../art-source/imagegen/folding-fan-brocade.*`。

标题菜单为「开始游戏 / 继续游戏 / 系统设置 / 退出游戏」。支持鼠标、触摸、方向键、Enter 与 Esc。系统设置可调整亮度、动态效果、画面适配，点击「保存设置」后保存在本机。系统减少动态偏好优先于动态开关。没有有效存档时「继续游戏」禁用。退出确认后进入静止退出画面，可返回标题；普通浏览器网页不会尝试关闭浏览器窗口。

环境动态：暗红色薄花瓣有三种不对称轮廓，随风飘落，翻到侧面时收窄为细线。桌面 38 片、手机 22 片。雨幕分背景雨丝与菜单前的近景雨滴；近景雨滴的轨迹与每个按钮的实际上沿相交后生成弹跳水珠、水纹和短暂水光。四个按钮（包括暂无存档的继续按钮）都有碰撞面，按屏幕布局更新。弹窗打开时暂停隐藏菜单上的碰撞；关闭动态、退出或页面隐藏时停止动画，减少动态偏好下不播放雨幕。所有 Canvas 均不拦截点击。

空间视差使用本地打包的 [DepthFlow Web](https://github.com/K024/depth-flow) SLIDE 渲染器。原图拆成透明人物和补全铜环的底图，放在 `assets/spatial-photo/`。鼠标移动时，长发和肩膀一起掠过圆环，发束之间透出后景。指针离开后平滑回正并显示原图。WebGL 不可用或直接打开本地文件时，Canvas 2D 使用相同的两个图层。关闭动态或启用系统减少动态偏好后显示静态原图。

`rain.js` 为无依赖 Canvas 粒子模块，限制远景雨滴 260、近景雨滴 20、溅射水珠 180、水纹 24 的最大数量。雨滴使用运动线段与按钮上沿求交。`glass-rain.js` 单独绘制贴屏水珠，依据同一张原画的缩略图模拟局部折射。水珠短暂停留、下滑并留下逐渐淡去的细痕。镜头水珠随开场雨幕显现，弹窗、开始游戏过场和减少动态模式下停止。可通过 `InfiniteWeather.getState()` 查看远雨、花瓣和贴屏水珠的运行状态。

「无限流」行书题字与下方的细樱花枝由内置 Image 生图分别生成，源稿和提示词见 `../art-source/imagegen/sakura-title.json`。四项菜单的书法字来自 `../art-source/imagegen/title-ui-atlas-v2.png`。按钮底纹来自樱花红三态图集 `../art-source/imagegen/sakura-menu-atlas.png`。选中时显示盛开的樱花，待选时显示单瓣，没有有效存档时显示暗银锁。按钮提示词和裁切范围记录在 `../art-source/imagegen/sakura-menu-atlas.json`。

独立透明 UI 贴图导出到 `assets/menu-ui/`：

- `sakura-calligraphy.webp`：标题页的「无限流」行书题字。
- `sakura-selected.webp`、`sakura-idle.webp`、`sakura-locked.webp`：带状态标记的三款透明按钮底纹，各为 945 × 145。
- `sakura-branch.webp`：题字下方横向舒展的樱花枝。
- `label-new.png`、`label-continue.png`、`label-settings.png`、`label-exit.png`：四项菜单文字。

加载页和标题页的唯一背景是用户指定的 `../art-source/imagegen/nai-v5-user-style-v3-fixed.4k.png`，采用用户提供的画师串与 NAI V5 Full。原图 1920 × 1088，经 NAI 专用放大工具到 3840 × 2176，再上下各裁 8 像素成为 3840 × 2160；网页始终使用同尺寸 WebP 副本 `assets/hongzhuang-nai-v3-4k.webp`。花瓣由 Canvas 绘制，不需要额外图片。适配横屏、手机竖屏、减少动态偏好及页面隐藏状态。

提示词里的数字结尾标签需保留关闭符前的空格，例如 `2::artist:bm94199 ::`。该空格被删除时，NAI 会将末尾 `94199::` 解析为权重，导致本次彩噪故障。已经用同一种子与同参数进行单变量复验并修正。

## 本地服务

在本目录运行以下命令。服务固定使用本项目的素材目录，并允许浏览器复用连接。

```powershell
python serve.py
```

完整流程：http://127.0.0.1:4173/ 。直接预览标题：http://127.0.0.1:4173/?screen=title 。

## 接入实际游戏

默认演示的进度从 0% 走到 100% 用时 4.2 秒。背景解码后启动开场；接入游戏资源下载器后，由外部进度决定扇片出现的时机。调用：

```js
window.InfiniteLoading.useExternalProgress();
window.InfiniteLoading.updateProgress(35); // 0—100，来自实际资源加载
window.addEventListener('infinite:ready', () => { /* 所有资源准备完成 */ });
```

标题页已接入加载完成事件。点击「开始游戏」时，当前空间照片化为立方体，单个波峰由中心向四周推进；每块方块只抬起、回落一次，随后碎开消散，约 2.6 秒后画面收暗。WebGL 与 2D 回退使用相同的单峰节奏。随后在中间偏上逐笔写出「主神空间」，细樱枝随后生长，约 0.96 秒后，448 个左右的哑光方块从四边向内拼回新场景，重组约 1.55 秒。「继续游戏」使用已有存档的入口。接入玩法时可在点击事件内接管，并按需等待内置过场：

```js
window.addEventListener('infinite:startgame', async event => {
  event.preventDefault();
  const { mode, save } = event.detail; // new | continue
  if (mode === 'new' && !await event.detail.playTransition()) return;
  window.InfiniteTitle.hide();
  // 游戏在此创建新旅程或读取 save。
});
// 存档必须具有非空 id，其余字段由游戏定义。
window.InfiniteTitle.setSave({ id: 'journey-001', title: '第一重世界', timestamp: Date.now() });
// 游戏返回主菜单时：
window.InfiniteTitle.returnToTitle();
```

`InfiniteTitle.clearSave()` 清除本机存档；`InfiniteLoading.replay()` 重播完整加载。不要仅为启用继续按钮而创建虚假存档。正式游戏应校验自身存档格式。

`assets/menu-ui/manifest.json` 记录原书法图集的源图哈希、裁切区域和尺寸。标题与菜单有语义文字供辅助工具读取，按钮的交互区域覆盖整行。

系统设置使用 `assets/settings-folio/` 的纸艺贴图与独立屏风、人物、梅枝、骰子图层。`settings-folio.js` 管理四类设置及草稿，点击「保存设置」写入本机，返回撤回未保存的预览。模型页的模型 ID 使用统一纸艺下拉框：打开时经同源 `/api/models` 获取模型，可筛选、刷新、重试或手动填写。支持 OpenAI 兼容和 Anthropic；当前「检查配置」仍只检查字段格式，模型获取才会实际请求远端。密钥仅保存在当前浏览器会话。服务边界与协议见 [MODEL_CATALOG.md](MODEL_CATALOG.md)。`infinite:settings` 派发预览值，`infinite:settingssaved` 派发已保存值，均不包含密钥。总音量、环境音、界面音效及掷骰音效均已接入实际混音。环境音默认 25%，当前不包含背景音乐。

`settings-paper-select.js` 将原生字段增强为纸艺下拉，保留真实表单值、键盘交互及全屏请求。`settings-folio-art.js` 的独立时间轴负责梅枝、屏风人物、红线和骰子进退场。原始图集、提示词和切图记录保存在 `../art-source/imagegen/settings-folio/`。

设置返回标题时，`settings-folio-transition.css` 配合控制器从当前姿态收拢纸页，880 ms 内直接显露背后的标题画面，完全透明后关闭 modal。`title-return.js/.css` 接收 `infinite:settingsreturnstart/end/cancel`，以局部笔画遮罩让现有樱花枝、书法标题与菜单接续出现，约 1420 ms 完成。结束或中断会释放动画并还原原图；减少动态、切后台及连续 Esc 有即时收尾。左侧选中书签为内置生图生成的 `navigation-selected.webp`，源图与提示词保存在 `../art-source/imagegen/settings-folio/navigation-selected.png` 和 `navigation-manifest.json`。

`game-audio.js` 使用一套 AudioContext 混合 27 个本地音效，当前不包含 BGM。首次真实鼠标／触摸／键盘操作后解锁声音；雨声柔和循环，环境音默认 25%，设置打开时轻微压低，退出或开始游戏时淡出。标题的实际选中项变化播放纸签轻擦与轻弦共鸣，同一项内移动、禁用项或程序默认选中不重复响。开始、设置、退出等实际点击另外触发纸面轻触音，在切换界面状态之前播放。枝条生长、焚化、书法显现、纸页开合及骰子触地按实际动画节点触发，取消动画会停止对应声音。按钮、分类、下拉、开关和滑杆使用不同音色，滑杆限频，整体最多 12 个短声部。切后台停止短声并暂停音频，返回恢复环境音，不补播旧反馈。

开始游戏与主神空间新增 10 条独立原创材质音效，由 `../scripts/build-deity-audio.py` 合成，未取用旧菜单、书写或骰子录音。开始方块波峰首帧播放 `start-cube-wave`，700 ms 后接 `start-cube-fracture`；题字与樱枝使用 `deity-inscribe` / `deity-branch`，四周拼合使用 `deity-cube-assemble`。头像悬停、选择、确认、返回各自使用 `deity-hover/select/confirm/back`。悬停改为 200 ms 柔纤维摩擦声，停留 85 ms 才播放，600 ms 内不重复；快速划过或直接点击不会叠加悬停声，键盘焦点保留反馈。返回方块波使用 `deity-return-wave`，与画面同为 2200 ms、左至右声像移动。组别取消同时停止尚未开始的延迟声音；减少动态不播放长转场音。制作种子、时长与峰值记录在 `../audio-source/deity-design/`。

`assets/audio/SOURCES.md` 和 `manifest.json` 保存 CC0 录音及剪辑信息，源录音见 `../audio-source/`，跨平台制作脚本为 `../scripts/build-game-audio.py`。旧版本未标记的默认环境音 60% 在载入时迁移到 25%；其他自定义音量保留。新保存的配置带默认版本标记，用户随后主动设为 60% 也会保留。

## 验证

### 主神空间

`deity-space.js/.css` 使用左侧头像列表和右侧红妆的构图，不再显示黑色锁定人物。每次进入先处于待选择状态：头像柔暗，悬停或键盘聚焦只提亮预览；点击、Enter 或 Space 才选中并启用确认按钮。返回标题使用简洁箭头文字；确认按钮与头像框由内置生图制作透明贴图。确认只记录本次界面选择，不创建假存档或进入未制作的世界。

主神场景由 NAI V5 Full（High）生成一张完整的人景合一原画，沿用标题的画师串。原图 1920 × 1088，经 NAI 专用 2 倍放大并裁至 3840 × 2160；源图、正负提示词和可核实参数在 `../art-source/imagegen/deity-space/nai-scene/`。`nai-scene.webp` 用于静态显示，`nai-plate.webp` 和 `nai-portrait.webp` 仅作为同一画幅的内部空间层，页面没有独立缩放摆位的人物组件。头像从同一张原图裁出。

主神与标题共用 `SpatialPhoto` / DepthFlow SLIDE，通过可选资源路径创建独立相机，保持两场景互不干扰。鼠标移动时平滑产生小幅视差；返回、后台或减少动态时停止。按钮与头像框源稿和提示词在 `../art-source/imagegen/deity-space/ui-roster/`。新的米金淡红行书地名与末笔樱花由内置 Image 生成，源稿/提示词在 `location-calligraphy.png/.json`；下方复用原标题页的细樱枝。`deity-transition.js` 使用注册到原字形的局部笔划遮罩揭示题字，再展开樱枝，动画完成恢复原图。所有运行素材位于 `assets/deity-space/`。

主神空间启用约 2.4 CSS px 的远景虚化，人物层保持清晰；标题场景默认不启用这项效果。WebGL 只对后景采样，2D 降级在尺寸变化时缓存模糊后景，静止不保留动画循环。`deity-occlusion.js` 使用原人物透明轮廓遮挡题字及枝条，跟随相机实际渲染位置；头像与操作按钮不参与遮挡，返回快照保留相同遮挡关系。遮罩 URL 预先安装并在宣告阶段预热，末帧只改变遮罩坐标，避免首次合成时题字闪空。窄屏竖屏沿用同一字贴图排为两行，保持地名可读。

`deity-assembly.js` 批量绘制四边飞入的哑光立方体，以新场景整图快照为表面，结束后由同裁切位置的空间照片接管。每次入场使用新的隐藏画布，同步绘制空白首帧后才显示；拼合后保留完整终帧，在其覆盖下解码、上传并绘制中性位置的景深画面，跨两帧预热后用 140 ms 撤去覆盖，最后退役画布并启用交互。准备有超时与取消处理；首次 WebGL 绘制失败会有界降级到 2D，均失败则保留原图。这样不会在入场闪出旧背景、结束时闪黑，或进入后再突然切换景深。减少动态模式使用短淡入。进入主神空间会停止原标题页的雨滴、花瓣和空间相机。

返回时，`deity-return-capture.js` 同步保存当前空间视角与完整 UI，并合成标题页的原背景、书法、樱枝及菜单贴图；`deity-return-wave.js` 在约 2200 ms 内以单道左→右哑光立体方块浪峰切换两幅画面。浪峰经过的左侧已经组成标题，右侧仍保留主神画面。每块只抬升、倾转、落定一次，首尾恢复完整平面；此时不再叠加设置页返回用的书写动画或旧声音。约 460 个方块批量提交，活动范围约屏宽三分之一，并提供 Canvas 2D 降级。返回期间仅冻结标题相机并阻止重复操作，雨、花瓣、屏幕水滴与溅射继续更新；`deity-return-weather.js` 按每行方块落定时刻裁剪四层动态天气，已经拼好的区域马上恢复动态，未拼好的区域继续遮住，目标快照不再包含静态天气。完成或中断会释放快照、GPU 资源与事件监听，并还原天气层的遮罩和层级。Esc、切后台、窗口缩放、减少动态和取消都有收尾路径。

`InfiniteDeitySpace.open()`、`.close()`、`.getState()`、`.preload()` 可用于调试。选中头像时，`deity-selection.js/.css` 沿实际贴图轮廓描亮边框，减少动态模式立即完成；重复点击同一已选头像不重播。角色确认时派发 `infinite:deityselected`，默认由 `system-space-flow.js` 接入系统空间。正式游戏可在该流程脚本之前注册监听接管此事件：

```js
window.addEventListener('infinite:deityselected', event => {
  event.preventDefault();
  const { id, name } = event.detail; // hongzhuang / 红妆
  // 在这里创建实际角色与世界；真正保存后再调用 InfiniteTitle.setSave。
});
```

### 系统空间

`system-space.js/.css` 使用中央正面 Q 版红妆、左右六个悬浮徽记与底部固定输入框。世界入口、轮回记录、行囊、主神契约点击后才展开详情；系统设置与返回主神是实际入口。空档案和行囊如实显示为空，不创建虚假存档。徽记错落展开并轻微浮动，输入框保持稳定；减少动态、弹窗与页面隐藏时暂停动态。返回时先准备好主神场景，再收起当前界面。

角色使用 `system-live2d.js/.css` 加载真正的 Cubism MOC3，入口为 `assets/live2d/hongzhuang/hongzhuang.model3.json`。18 个网格、20 个参数支持独立眨眼、瞳孔跟随、头身轻转、呼吸、嘴型与头发物理。网页默认闭嘴，点击人物轻轻点头；未来语音口型需另接驱动。衣袖、手与红线属于同一个连续身体网格，首版未独立制作抬臂和手指动作。

渲染器通过 `InfiniteSystemSpace.getCharacterMount()` 和 `.setCharacterRenderer(renderer)` 接收视线及暂停状态。原插画保留到模型完整首帧绘制后再切换；加载失败仍显示插画。只有一个受控 ticker 更新参数、物理和渲染，隐藏、详情弹窗及设置页打开时暂停，减少动态模式显示静态原生模型。`InfiniteSystemLive2D.getState()`、`.inspectModel()` 和 `.setDebugPose(parameters|null)` 用于开发验收。

Cubism Core 由 `../scripts/setup-live2d-runtime.py` 从官方地址下载到忽略的 `../output/live2d-runtime/`，校验 SHA-256 后经 `serve.py` 的 `/runtime/live2dcubismcore.min.js` 提供；启动服务时自动预热，有缓存后不需要联网。模型贴图与运行依赖的其他部分都在仓库内，详见 `vendor/live2d/SOURCE.md`。仅用通用静态文件服务器时不会提供该 Core 路由，应使用项目的 Python 服务。

大肥鱼项目作为 Q 版比例、画风与制作流程参考，没有复制它的角色模型或贴图。原 UI 源图在 `../art-source/imagegen/system-space/`；本次拆层素材、完整提示词、PSD、Cubism `.cmo3` 与绑定工程在 `../art-source/live2d/hongzhuang/`。使用内置生图工具，工具未披露具体模型版本和质量档位。

底部输入支持 Enter 发送、Shift+Enter 换行及中文输入法。`system-chat.js` 接管可取消的 `infinite:systemmessage`，将已保存的模型连接配置提交给本地 `/api/chat`，通过官方 DSH SDK 的原生多协议插件连接自定义 OpenAI 兼容或 Anthropic 接口。成功回复显示在可滚动、可收起的对话贴图中；等待时阻止重复发送，失败保留输入并显示具体错误，离开场景后不展示迟到的回复。设置草稿不会替代已保存的连接配置，切换连接会清除旧对话会话。安装与协议详情见 [DSH_CHAT.md](DSH_CHAT.md)。当前没有 TTS 和语音口型同步。世界入口的 `infinite:journeyrequest` 仍未接入可玩世界，保持未启程状态。

### 项目检查

从仓库根目录运行 `python scripts/check-project.py`，检查当前页面的静态引用、路径大小写、音频与 Live2D 模型引用、JSON 与 Python / JavaScript 语法（语法检查需要 Node.js 22+）。模型列表接口和 Core 本地路由另运行 `python -m unittest discover -s tests -p "test_*.py"`。GitHub Actions 会在 push 和 Pull Request 中运行上述检查。修改 Live2D 绑定后，在官方 Core 缓存就绪时运行 `node scripts/live2d/check-model.cjs`，检查实际 MOC、全部参数极值、组合姿态、遮罩及物理引用；再在浏览器确认动作外观。

修改交互或动画后还应实测：完整加载到标题、鼠标和键盘选中/点击、设置保存与放弃草稿、关闭转场、开始游戏单次波浪、前后台切换、窄屏布局及系统减少动态偏好。音频需要真实操作解锁；无存档时继续按钮保持禁用。该自动检查不代替这些视觉和听感验证。
