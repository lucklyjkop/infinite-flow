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
- 本轮内置生图产物：`branch-icons.png`（三系图标）、`ability-petal.png`（有机花瓣能力面板）、`unlock-petal.png`（丝绢解锁控件）、`thread.png`（红丝契线）。源图保留透明通道；契线沿曲线采样贴合，面板保持原始比例。
- 页面实现为 `covenant.js` / `covenant.css`，动态星核为 `covenant-scene.js`；隐藏后停止绘制，减少动态模式只按需更新。
- 新增美术遵循项目的 OpenAI Image 系列高精度制作约定，使用用户指定入口；内置工具未返回的模型版本、画质档位应记为「未披露」，不推测参数。
- 数据回归：`node --test tests/covenant-progress.test.cjs tests/save-store.test.cjs tests/world-progress.test.cjs`，覆盖旧档兼容、领奖去重、余额与前置、存档隔离及持久化失败。
