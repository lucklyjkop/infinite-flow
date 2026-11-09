# 音效素材与处理

以下录音由原作者以 CC0 发布。本项目进行了选段、滤波、柔化瞬态、音量平衡、淡入淡出及组合剪辑；选中反馈额外叠加了一层本项目原创的轻弦共鸣。资源本地加载，不依赖外部音效服务。核对日期：2026-11-07。

| 原录音 | 作者 | 原始页面／许可 | 使用位置 |
|---|---|---|---|
| Rain (loopable), `1.ogg` | Ylmir | [作品与 CC0](https://opengameart.org/content/rain-loopable) | 雨滴环境，25.6 秒柔和循环 |
| Fire Crackling, `fire-1_0.ogg` | AntumDeluge | [作品与 CC0](https://opengameart.org/content/fire-crackling/) | 梅枝焚化、余烬尾音 |
| Book Flip Sounds | Voltiment555 | [作品与 CC0](https://opengameart.org/content/book-flip-sounds) | 展页、收页、纸签、分枝生长的纤维摩擦 |
| Sound Walk - Writing.wav | JennaW_ksc | [作品与 CC0](https://freesound.org/people/JennaW_ksc/sounds/537718/) | 书法显现、滑杆细微摩擦；使用作者公开的高质量预览录音 |
| Wooden dice on wodden table roll, `Holzwürfel_auf_Holztisch_2.flac` | Wuzzy | [作品与 CC0](https://opengameart.org/content/wooden-dice-on-wodden-table-roll) | 骰子单次触地、纸面按钮及开关触感 |

运行资源为 Ogg Opus、48 kHz、双声道。原有 17 个音效、10 个主神空间独立音效、4 个世界地图音效及4个系统空间界面音效的峰值、响度、来源对应记录在 `manifest.json`。[制作脚本](../../../scripts/build-game-audio.py)保留处理过程，[原始录音](../../../audio-source/)随仓库保存，编辑后的无损 WAV 写入本机 `output/audio-design/wav/`。当前版本不播放背景音乐，环境音默认 25%。

短声保留轻微材质随机变化，运行时限制触发频率与叠音数量。骰子录音只截取一次触地，弹跳声由实际动画触点安排；滑杆不是每个指针事件都播放声音。雨声循环经过 1.4 秒等功率交叉衔接，打开设置时降低环境音，离开画面及切换后台时收尾。

## 开始游戏与主神空间的独立声音

`start-cube-wave`、`start-cube-fracture`、`deity-cube-assemble`、`deity-return-wave` 与 `deity-inscribe`、`deity-branch`、`deity-hover`、`deity-select`、`deity-confirm`、`deity-back` 为本项目原创程序化合成声音。它们没有使用上表录音或既有 UI 音频 buffer，每条使用独立种子、材质配比和时序生成。

制作包括单峰空气压力、受阻尼的哑光石/陶材质接触、颗粒裂解、纤维摩擦和短空间反射。开始游戏波浪由中央向外张开，主神拼合由两侧向内，返回波浪只从左向右经过一次。没有电子提示音或背景配乐。[合成脚本](../../../scripts/build-deity-audio.py)、[设计与复现说明](../../../audio-source/deity-design/README.md)、[种子与测量记录](../../../audio-source/deity-design/design.json)随仓库保存。试听 WAV 写入本机 `output/audio-design/deity/`。


## 世界节点与系统空间界面

世界节点的 `world-node-focus`、`world-node-select` 以及系统空间的 `system-ui-focus`、`system-ui-select`、`system-ui-back`、`system-ui-send` 使用本项目原创的玉石／轻金属阻尼共振。节点选中带一层低石质触点，系统激活声更轻，关闭声更低，发送声为克制的上行双触点。它们不使用上表纸张录音，也不含噪声、纤维或摩擦层。

[世界地图合成脚本](../../../scripts/build-world-map-audio.py)与[系统界面合成脚本](../../../scripts/build-system-ui-audio.py)保留固定种子和制作参数，支持 `--only` 单独更新指定音效。完整声音库重建也会包含这些条目。设计、峰值与哈希分别记录在 [世界地图](../../../audio-source/world-map/design.json)和[系统界面](../../../audio-source/system-ui/design.json)中；试听母带仅写入忽略目录 `output/audio-design/`。此次只替换两个世界节点文件并新增四个系统界面文件，展开、收拢、主神、标题和纸艺设置的声音未重编码。
