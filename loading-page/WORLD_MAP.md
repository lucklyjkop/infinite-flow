# 世界入口

系统空间点击「世界入口」，当前画面以一次从左向右推进的立方体隆起组成山脉。地图停留在实时 3D 场景，关卡小景与路线随同一投影轻微响应鼠标；返回时地形反向收拢至进入前的系统空间画面。

每卷六个关卡横向串联，目前提供山海、竹海、雪域三套小景，共十八种。地图沿右侧按需延伸：可回看历史卷，最多预览下一未解锁卷。底部原有小箭头、左右键、拖动及触摸滑动都只平移整张地图，不改变关卡选择。点击场景小景，或聚焦后按 Enter / 空格，直接选中并打开世界档案；右下角不再显示「查看关卡」按钮。

世界档案采用墨青纸绢、旧铜细边、红绳与樱花装饰。左侧展示对应场景、卷和关卡编号及当前状态；右侧展示类型、五级难度印记、三个世界特性、场景简介及探索目标。桌面使用横向双栏，手机使用独立竖版贴图与滚动布局。关闭按钮、返回地图、Escape 或点遮罩都会收起档案并将焦点还给地图节点；拖动地图不会误打开档案。锁定世界可以查看详情，查看不会解锁或增加通关数。

新存档第一关及其周边默认点亮，通关数仍为零。已完成关卡显示独立的梅花金勾印记，当前可探索关保留原色，其余关卡及对应地形为炭黑色。河谷、山道、错落台地和树石、瀑布、桥梁、石阶、灯柱等装饰与地形共享投影和点亮状态。选中、悬停不会解锁。

点亮区域使用黄绿草地、深绿林地、灰白山石和青蓝河流的自然配色；高处偏浅色岩层，坡面保留岩石层次。地形按卷号使用确定性种子生成，同卷反复进入保持一致，不随存档重新随机。

## 方块云与天气

顶部云团由程序生成的三维小立方体构成，不使用云贴图。五组云团缓慢漂移、聚散，阴雨时厚度与明暗逐步变化；天空薄雾、山间雾带、阳光及雨滴同步过渡。天气是游戏内循环：晴 32 秒、阴 30 秒、雨 36 秒、雾 28 秒，每段末尾 8 秒平滑衔接下一段。雨声随雨势淡入淡出，沿用环境音量设置。

`world-map-weather.js` 独立更新天气，不带动静止地形重绘。WebGL 路径使用固定实例缓冲的 180 个立方体，Canvas 2D 回退为 90 个投影方块；雨滴固定为 90 个。天气画布 DPR 上限 1、刷新上限 24 fps。隐藏标签页、关闭地图时停止更新，关闭后释放画布和 GPU 资源；减少动态时保留静态天空，不播放雨滴运动。

## 切卷开销

整卷移动使用图层位移，地形、路线和装饰仅在进度、选择、视角、尺寸或章节改变时重绘。进入动画前准备两块复用画布；相邻章节提前分段生成，单段目标 3 毫秒。几何数据共享缓存最多四卷、预热任务最多四个，重复预热合并，同尺寸 resize 不重建地形。长期浏览不会累计画布或无限保留章节几何。

## 进度接口

每六关组成一卷，完成当前卷的全部六关才解锁下一卷。可探索关与已完成关点亮，但只有 `status === 'completed'` 才是通关记录；新档第一关点亮，通关数仍为零。`select(stageId)` 只保存选择；真实玩法结算后调用 `complete(stageId)`，仅允许按全局顺序推进，重复完成已通关关卡不重复写入。地图没有通关按钮，也尚未实现关卡内的战斗与叙事玩法。

`InfiniteWorldProgress.getState()` 返回固定大小的状态，不创建历史章节数组或已完成 ID 数组：

```js
{
  saveId, completedCount,
  activeChapterIndex,       // Math.floor(completedCount / 6)，从 0 开始
  maxPreviewChapterIndex,   // activeChapterIndex + 1
  selectedChapterIndex, selectedId, nextId
}
```

`getChapter(index)` 按需创建该卷的六个关卡，返回 `{id,index,number,name,templateId,atlas,theme,unlocked,completed,completedCount,litCount,stages}`。卷内 `completedCount` 为 0–6，`litCount` 包含当前可探索关；`stages` 的 `index` 为卷内 0–5，另有 `globalIndex`、`chapterIndex`、`status`（`completed` / `available` / `locked`）、`lighted`、`kind`、`description`、`difficulty: {level, label}`、`traits`、`objective` 和原有的 `id/name/title/number/u/v`。难度为 1–5，特性为三个短标签，目标为简短叙事目标；这些是当前设计元数据，不会执行战斗、改变数值或发放奖励。显示层一次只需取得当前浏览卷及邻接预览；数据层允许回看已解锁旧卷，禁止读取或选中下一预览卷以外的关卡。初始可以预览第二卷，但不能进入其第一关。

首卷的六个 ID 保持为 `mist-ferry`、`red-inn`、`paper-city`、`snow-pass`、`mirror-lake`、`return-peak`。后续为 `chapter-2-stage-1` 至 `chapter-2-stage-6` 等，ID 中的卷号从 1 开始。完成首卷末关会自动将 `nextId` 与选择移至 `chapter-2-stage-1`。`InfiniteWorldProgress.stages` 仅保留首卷静态元数据以兼容旧调用；新界面应使用 `getChapter(index).stages`。

内置三套内容模板依次为：

| 模板 | 六个关卡 | 图集 |
| --- | --- | --- |
| 山海初醒 | 雾渡、红衣客栈、纸人旧城、寒山隘、镜湖、归墟 | `assets/world-map/landmarks.png` |
| 竹海灯影 | 竹影长桥、灯火水镇、红叶书院、飞瀑栈道、云中禅寺、古树祭坛 | `assets/world-map/landmarks-bamboo.png` |
| 雪域天门 | 雪驿、冰湖龙骨、雪岭石寨、风雪钟楼、悬崖索桥、天门云宫 | `assets/world-map/landmarks-snow.png` |

后续卷轮换模板，并添加「第 2 重」等卷名变化。开发时可在首次打开地图前调用 `registerTemplate({id,name,atlas,theme,stages:[{name,kind,description,difficulty,traits,objective}, ...]})` 追加模板，必须恰好提供六关、唯一模板 ID 及本地 PNG 图集路径。详情字段在注册时验证并复制、冻结，旧模板省略时有默认值；循环卷复用稳定的难度与特性。模板顺序决定后续场景轮换，修改内容不会改动章节 ID 或通关数；发布新模板时应同时检查已发布卷的内容连续性。

存档使用 `progress.world = {completedCount,selected}`，大小不随章节数增长。旧版 `completed` 数组按首卷连续前缀迁移；缺少字段时零通关，只读不回写。写入时转成紧凑格式，并取已保存通关数与新值的较大者，避免陈旧导航补丁使进度倒退。各存档独立，未激活存档时只在内存预览，不能完成关卡。数值限定为 JavaScript 安全整数，不预分配无限章节。

## 实现与资源

- `world-map.js` 管理进出、关卡布局、焦点、横向浏览和详情。最多复用两块章节画布，随相机移出复用；不会随着章节增长扩大画布或增加常驻节点。`world-progress.js` 管理关卡状态。
- `world-detail.css` 管理世界档案的自适应布局、入场与交互样式。横版面板、竖版面板、特性标签和难度印记均通过内置生图生成，源图与完整提示词在 `../art-source/imagegen/world-detail/generation.json`，运行贴图在 `assets/world-detail/`。未披露的模型版本和质量档位不做推断。
- `world-map-terrain.js` 使用 WebGL 实例化立方体，具备 Canvas 2D 回退及上下文恢复。闲置且鼠标停止时不持续重绘；隐藏页面和减少动态偏好均有对应处理。移动端使用宽地图，源画面首帧仍按实际视口匹配。
- 新贴图均由内置 image_gen 生成，首批记录在 `../art-source/imagegen/world-map/generation.json`，新增十二个关卡、十二种装饰与通关印记的记录在 `../art-source/imagegen/world-map/expansion/generation.json`，均包含完整提示词与哈希。内置工具没有披露具体模型版本与质量档位。运行贴图在 `assets/world-map/`，原始透明通道保留，小景使用 3×2、装饰使用 4×3 CSS 图集定位。
- 自然地形色彩源图与生成记录保存在 `../art-source/imagegen/world-map/natural-color/`，运行纹理为 `assets/world-map/terrain-pigment-natural.png`。以用户参考的自然色彩为依据，不复制参考中的城市、文字或布局；云团与天气完全由程序生成。
- 地形翻涌、收拢、关卡悬停与选中使用四份独立合成音效，制作参数在 `../audio-source/world-map/design.json`，脚本 `../scripts/build-world-map-audio.py`。没有新增 BGM。

## 验证

```sh
python scripts/check-project.py
python -m unittest discover -s tests
node --test tests/world-progress.test.cjs tests/world-map-terrain.test.cjs tests/world-map-weather.test.cjs
```

浏览器实测使用独立测试存档，覆盖零通关、两关已通关、锁定预览、切档与重载、手机与横屏、入场中断、返回焦点、减少动态、TTS 中断和 Live2D 恢复；测试截图与录屏不进入仓库。

### 世界档案双向重组

关卡造景和详情预览均保持图集单格的 1:1 比例，详情预览上限 310 CSS 像素，避免放大与拉伸。点击后由 `world-detail-morph.js` 将造景纹理分解为带哑光侧面的方块，约 980ms 内重组为完整档案；关闭约 780ms 反向回收。移动端减少方块数量，渲染分辨率上限 1.5 倍，仅过渡期间申请动画帧。减少动态时直接切换；关闭、窗口尺寸变化和页面隐藏均清理过渡画布并恢复原造景。
