# 世界入口音效

四个原始程序合成的短音效，由 `scripts/build-world-map-audio.py` 制作。没有使用已有标题、主神或设置音效的波形，也没有下载录音或调用服务。沿用项目的噪声滤波、等功率声像、阻尼材质等数学工具，分别编排新的频谱、包络、种子与接触时间。

| 事件 | 声音设计 | 时长 |
| --- | --- | --- |
| `world-tectonic-rise` | 单次低沉岩层压力推进，零散石缝滑动与细石落定 | 2.35 秒 |
| `world-tectonic-fold` | 独立的内收岩层与柔和归拢接触 | 1.35 秒 |
| `world-node-focus` | 轻而短的玉石共振，用于移到世界节点时的反馈 | 0.18 秒 |
| `world-node-select` | 低石质触点叠加短玉鸣，确认选中世界 | 0.34 秒 |

节点悬停与选中声已在 2026-11-09 改为纯阻尼共振：以非整数倍振动模态和短空间反射形成玉石材质，不使用纸张、纤维、摩擦或噪声层。地图展开和收拢的岩层声音保持原样。

所有成品为 48 kHz 双声道 Ogg Opus，带独立首尾渐变，不含 BGM。运行时走现有音效总线，受总音量与音效音量控制。焦点事件限速，地图退出时停止 `world-map` 分组；浏览器隐藏和页面退出沿用统一停止逻辑。

复现需要项目已有 NumPy、SciPy 与支持 libopus 的 FFmpeg：

```powershell
python scripts/build-world-map-audio.py
# 仅重建节点反馈，保留展开、收拢及其他声音的文件字节
python scripts/build-world-map-audio.py --only world-node-focus world-node-select
```

可通过 `FFMPEG_BIN` 指定 FFmpeg。交付音效在 `loading-page/assets/audio/world-*.ogg`；未压缩母带与连续试听在忽略目录 `output/audio-design/world-map/`。`design.json` 保存参数、种子、哈希、解码电平与 4 倍过采样真峰值。

单独重建节点时，试听文件为 `output/audio-design/world-map/world-node-preview.wav`；设计记录合并更新，保留未重建的条目。
