# 主神契约音效

本组使用原创程序化液膜与空腔共振合成，不取用现有音频、纸张录音或其他页面的波形。生成脚本为 `scripts/build-covenant-audio.py`，固定种子、响度、解码后真峰值和哈希保存在 `design.json`。

| 文件 | 动作 | 设计 |
| --- | --- | --- |
| `covenant-enter` | 进入主神契约 | 低频液体舒展，单次渐强 |
| `covenant-leave` | 返回系统空间 | 向内沉降、短收尾 |
| `covenant-focus` | 悬停／键盘聚焦 | 极轻的液面张力触感 |
| `covenant-branch` | 切换分支 | 短促横向流动 |
| `covenant-detail-open` | 打开详情／查看前置 | 黏性液膜展开、柔和空腔共振 |
| `covenant-detail-close` | 外侧点击／返回／Escape 收起详情 | 独立的液膜回收声，不倒放展开声 |
| `covenant-unlock` | 成功解锁 | 低沉解封，暖色微光尾音 |

不使用硬瞬态、噪声摩擦、连续爆裂或旋律。所有条目采用独立种子、包络及声部组合，48 kHz 立体声 Ogg Opus；开头和结尾均柔化。运行时动作之间交叉淡出，悬停限频，并避免自动聚焦再次触发选中声。声音由音效音量控制，减少动态模式下仍保留用户操作声音。

单独重建：`python scripts/build-covenant-audio.py`；更新单项：`python scripts/build-covenant-audio.py --only covenant-detail-open`。完整 `build-game-audio.py` 也会包含本组，其他场景的音频不会被本脚本重编码。

无损母带与顺序试听写入忽略目录 `output/audio-design/covenant/`。试听顺序与上表一致，间隔 0.48 秒；游戏界面不显示这些制作说明。
