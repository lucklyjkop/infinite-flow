# 音效素材与处理

以下录音由原作者以 CC0 发布。本项目进行了选段、滤波、柔化瞬态、音量平衡、淡入淡出及组合剪辑；选中反馈额外叠加了一层本项目原创的轻弦共鸣。资源本地加载，不依赖外部音效服务。核对日期：2026-11-07。

| 原录音 | 作者 | 原始页面／许可 | 使用位置 |
|---|---|---|---|
| Rain (loopable), `1.ogg` | Ylmir | [作品与 CC0](https://opengameart.org/content/rain-loopable) | 雨滴环境，25.6 秒柔和循环 |
| Fire Crackling, `fire-1_0.ogg` | AntumDeluge | [作品与 CC0](https://opengameart.org/content/fire-crackling/) | 梅枝焚化、余烬尾音 |
| Book Flip Sounds | Voltiment555 | [作品与 CC0](https://opengameart.org/content/book-flip-sounds) | 展页、收页、纸签、分枝生长的纤维摩擦 |
| Sound Walk - Writing.wav | JennaW_ksc | [作品与 CC0](https://freesound.org/people/JennaW_ksc/sounds/537718/) | 书法显现、滑杆细微摩擦；使用作者公开的高质量预览录音 |
| Wooden dice on wodden table roll, `Holzwürfel_auf_Holztisch_2.flac` | Wuzzy | [作品与 CC0](https://opengameart.org/content/wooden-dice-on-wodden-table-roll) | 骰子单次触地、纸面按钮及开关触感 |

运行资源为 Ogg Opus、48 kHz、双声道。17 个音效及峰值、响度、来源对应记录在 `manifest.json`。[制作脚本](../../../scripts/build-game-audio.py)保留处理过程，[原始录音](../../../audio-source/)随仓库保存，编辑后的无损 WAV 写入本机 `output/audio-design/wav/`。当前版本不播放背景音乐，环境音默认 25%。

短声保留轻微材质随机变化，运行时限制触发频率与叠音数量。骰子录音只截取一次触地，弹跳声由实际动画触点安排；滑杆不是每个指针事件都播放声音。雨声循环经过 1.4 秒等功率交叉衔接，打开设置时降低环境音，离开画面及切换后台时收尾。
