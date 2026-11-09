# 世界入口

系统空间点击「世界入口」，当前画面以一次从左向右推进的立方体隆起组成山脉。地图停留在实时 3D 场景，关卡小景与路线随同一投影轻微响应鼠标；返回时地形反向收拢至进入前的系统空间画面。

六个关卡从左到右为：雾渡、红衣客栈、纸人旧城、寒山隘、镜湖、归墟。新存档没有通关记录，地形为炭黑色；当前可探索关卡保留可辨识的灰阶小景。只有已通关区域恢复原始石色、苔色与红色植被。选中与悬停不会染色或解锁。地图可水平拖动、触摸滑动及左右键导航，关卡详情展示对应世界小景与开启条件。

## 进度接口

`InfiniteWorldProgress.getState()` 读取当前存档的 `progress.world`。`select(stageId)` 保存选择；游戏真正结算通关后调用 `complete(stageId)`，它只允许推进下一关，重复完成已通关关卡不重复写入。地图本身只负责展示和选关，没有伪造的通关按钮，也尚未实现关卡内的战斗与叙事玩法。

旧存档缺少地图字段时默认零通关，现有对话与导航更新保留地图进度。各存档分别保存，不会将测试数据写入用户存档。

## 实现与资源

- `world-map.js` 管理进出、关卡布局、焦点、横向浏览和详情；`world-progress.js` 管理关卡状态。
- `world-map-terrain.js` 使用 WebGL 实例化立方体，具备 Canvas 2D 回退及上下文恢复。闲置且鼠标停止时不持续重绘；隐藏页面和减少动态偏好均有对应处理。移动端使用宽地图，源画面首帧仍按实际视口匹配。
- 新贴图均由内置 image_gen 生成，提示词、入口、可核实参数和哈希保存在 `../art-source/imagegen/world-map/generation.json`。内置工具没有披露具体模型版本与质量档位。运行贴图在 `assets/world-map/`，原始透明通道保留，小景使用 CSS 图集定位。
- 地形翻涌、收拢、关卡悬停与选中使用四份独立合成音效，制作参数在 `../audio-source/world-map/design.json`，脚本 `../scripts/build-world-map-audio.py`。没有新增 BGM。

## 验证

```sh
python scripts/check-project.py
python -m unittest discover -s tests
node --test tests/world-progress.test.cjs tests/world-map-terrain.test.cjs
```

浏览器实测使用独立测试存档，覆盖零通关、两关已通关、锁定预览、切档与重载、手机与横屏、入场中断、返回焦点、减少动态、TTS 中断和 Live2D 恢复；测试截图与录屏不进入仓库。
