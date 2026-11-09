# 世界入口音效

四个原始程序合成的短音效，由 `scripts/build-world-map-audio.py` 制作。没有使用已有标题、主神或设置音效的波形，也没有下载录音或调用服务。沿用项目的噪声滤波、等功率声像、阻尼材质等数学工具，分别编排新的频谱、包络、种子与接触时间。

| 事件 | 声音设计 | 时长 |
| --- | --- | --- |
| `world-tectonic-rise` | 单次低沉岩层压力推进，零散石缝滑动与细石落定 | 2.35 秒 |
| `world-tectonic-fold` | 独立的内收岩层与柔和归拢接触 | 1.35 秒 |
| `world-node-focus` | 连续轻纤维摩擦，极轻玉质余韵 | 0.22 秒 |
| `world-node-select` | 温暖阻尼玉质接触与纸面落定 | 0.32 秒 |

所有成品为 48 kHz 双声道 Ogg Opus，带独立首尾渐变，不含 BGM。运行时走现有音效总线，受总音量与音效音量控制。焦点事件限速，地图退出时停止 `world-map` 分组；浏览器隐藏和页面退出沿用统一停止逻辑。

复现需要项目已有 NumPy、SciPy 与支持 libopus 的 FFmpeg：

```powershell
python scripts/build-world-map-audio.py
```

可通过 `FFMPEG_BIN` 指定 FFmpeg。交付贴图同级音效在 `loading-page/assets/audio/world-*.ogg`；未压缩母带与连续试听在忽略目录 `output/audio-design/world-map/`。`design.json` 保存参数、种子、哈希、解码电平与 4 倍过采样真峰值。
