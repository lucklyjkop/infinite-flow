# 主神契约

从系统空间的「主神契约」进入天赋／能力页面。每份存档拥有独立的契约点与解锁记录。界面以节点、连线和短标签表达状态，详细规则留在本文，不增加常驻技术说明。

## 节点与点数

「红线契印」为免费起点，默认已解锁。三条分支各含四个节点，共 13 个节点；每条分支依次消耗 2、2、3、4 点，必须先解锁前置节点。

| 分支 | 解锁顺序 |
| --- | --- |
| 灵识 | 观照 `insight` → 聆风 `listen` → 辨妄 `discern` → 照夜 `night` |
| 守心 | 护命 `ward` → 守念 `resolve` → 回息 `renew` → 不灭 `steadfast` |
| 因缘 | 渡界 `crossing` → 问路 `path` → 牵缘 `bond` → 归途 `home` |

每通关一关获得 3 点，每完成一个任务获得 1 点。通关奖励由存档的 `progress.world.completedCount` 推导，旧存档已有通关记录同样计入。任务使用稳定 ID 去重；重复结算和重复解锁均不重复消耗／奖励，也不重复写入存档。查看关卡、打开详情或预览任务不会获得点数。

## 接入

`loading-page/covenant-progress.js` 在 `save-store.js` 之后加载，提供 `window.InfiniteCovenantProgress`：

```js
const contract = window.InfiniteCovenantProgress;
contract.catalog;                 // 冻结的节点目录与 effect 元数据
contract.getState();              // 当前存档点数、已解锁节点、任务记录
contract.unlock('insight');       // 校验前置与余额后持久化
contract.awardTask('mist-ferry:main'); // 只在真实任务完成结算处调用
```

任务 ID 为 1–160 个字符，以英文字母或数字开头，后续可包含字母、数字、`.`、`_`、`:`、`/`、`-`。同一任务的重试必须沿用同一 ID；不同世界／周目中应独立领奖的任务需使用不同 ID。

`getState()` 返回 `saveId`、`earned`、`spent`、`balance`、`unlocked`、`tasks`、`completedCount`、`worldPoints`、`taskPoints`。无活动存档时点数为零，仅显示免费起点，不能领奖或购买。监听 `infinite:covenantchange` 刷新界面，事件 `detail` 为当前状态与 `reason`；操作异常的 `userMessage` 可用作临时反馈。

存档增量字段为 `progress.covenant: { unlocked, tasks }`。余额由通关、任务和解锁记录计算，不另存一份可失配的余额。旧存档只读时不写回；改名、聊天、世界选择等更新会保留契约记录。存储写入失败时原数据保持不变，不发送成功事件。

当前实现记录天赋持有状态及 `effect` 元数据。战斗、剧情检定等实际效果等待对应玩法接入，现有文案不表示这些玩法已经生效。

## 美术与验证

- 生成源稿、提示词和入口记录：`art-source/imagegen/covenant/`。
- 页面运行贴图：`loading-page/assets/covenant/`。
- 控件仍使用内置生图资源：`branch-icons.png`（三系图标）、`ability-mist.png`（烟墨能力铭签）、`unlock-petal.png`（丝绢解锁控件），保持透明通道和原始比例。按用户后续要求，球体及契线改为程序化三维几何，不再请求 `liquid-core.png` 或 `thread.png`；旧源稿留档。
- 视觉以第一个参考视频为构图基础；球壳按用户补充的黑色流体方向制作，呈现持续变形的湿润液膜、孔洞和拉丝，暖金从内腔透出，红色用于契线及少量能量。总览显示完整星图；点击分支后核心退至左侧，支路展开，右下角显示小型铭签。
- 页面实现为 `covenant.js` / `covenant.css`，动态星核为 `covenant-scene.js`；隐藏后停止绘制，减少动态模式只按需更新。
- 液膜采用有体积与法线的程序化曲面、实时形变与湿润反光，不依赖球体贴图，也并非完整物理流体模拟。各节点使用独立种子生成轮廓；三条分支分别强调开孔、包裹和扭结。未解锁呈暗沉封闭状态，可解锁保留银色湿润边缘及微弱红光，解锁后逐渐打开内层并亮起暖金内核。
- 可见画布直接用 WebGL 绘制，取消离屏 WebGL 图集到二维画布的逐帧复制。节点几何分批生成并缓存，后续仅更新着色器参数；高负载下限制渲染像素。控件位置只在发生变化时更新合成变换。契约页面覆盖期间暂停背后标题的 CSS 动画，退出时恢复。
- 首次初始化将 GPU 上下文、两套着色器与缓冲分成独立任务；可用时按 [Khronos 的 KHR_parallel_shader_compile 规范](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/) 非阻塞检查编译完成，再读取链接结果。等待有超时与生命周期保护；上下文恢复也等待初始化完成后重绘。
- `game-preload.js` 在开场资源准备的串行渲染器队列中调用契约预热，保留上下文、着色器、全部 13 个节点的网格与 GPU 缓冲。逐个节点分批准备，切分支只更新目标位置及材质参数，不再临时建模或上传缓冲；上下文恢复也重用几何并重新预热缓冲。浏览器创建 GPU 上下文本身是同步调用，因此将它放在资源准备阶段，而不是交互点击路径。
- 2026-11-13 本机 Chrome、1440×900、DPR 2 的稳态对比：总览／分支各采样 7 秒，旧版约 27.5 次绘制／秒，新版约 60 次；新版没有跨 WebGL → Canvas2D 复制、超过 50ms 的绘制间隔或长任务。该结果为测试环境观测，不是所有设备的帧率保证；`cpuMs` 仅表示 JavaScript 提交时间，不能视为 GPU 耗时。
- 切换性能另从点击当帧开始采样，不能用切换结束后的稳态帧率代替。修复了标签／点击区独立限频造成的约 67ms 一跳，现在与模型使用同一帧位置，静止时仍跳过重复 DOM 写入。本机同环境测首次三分支、往返切换、1.8 秒内连续切换 7 次，以及 CPU 四倍降速：切换期间新增建模与 GPU 缓冲上传均为零；首次点击处理从约 16ms 降为 0.3–0.6ms，运动中标签更新间隔中位数由约 67ms 降至约 18ms。上述切换未出现超过 50ms 的绘制间隔或长任务，结果仅代表本机测试。
- 新增美术遵循项目的 OpenAI Image 系列高精度制作约定，使用用户指定入口；内置工具未返回的模型版本、画质档位应记为「未披露」，不推测参数。
- 数据回归：`node --test tests/covenant-progress.test.cjs tests/save-store.test.cjs tests/world-progress.test.cjs`，覆盖旧档兼容、领奖去重、余额与前置、存档隔离及持久化失败。
