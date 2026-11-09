# 系统空间界面音效

四个独立的原创短声，由 `scripts/build-system-ui-audio.py` 以非整数倍阻尼共振合成。没有录音输入、外部音效服务、纸张／纤维摩擦或噪声层；短空间反射为声音增加少量宽度。

| 事件 | 声音设计 | 时长 |
| --- | --- | --- |
| `system-ui-focus` | 轻而短的高玉鸣，仅用于真实切换焦点 | 0.16 秒 |
| `system-ui-select` | 温暖低触点与玉石／轻金属共振，用于按钮激活 | 0.27 秒 |
| `system-ui-back` | 较低且更短的玉鸣，用于收起与返回 | 0.23 秒 |
| `system-ui-send` | 克制的上行双触点，用于发送消息 | 0.32 秒 |

成品为 Ogg Opus、48 kHz、双声道；运行时使用音效总线，与总音量、音效音量同步。`design.json` 记录种子、实际解码响度、4倍过采样真峰值、首尾边界与文件哈希。

使用项目的 NumPy、SciPy 和 FFmpeg/libopus 复现：

```sh
python scripts/build-system-ui-audio.py
# 可选：只重建指定音效
python scripts/build-system-ui-audio.py --only system-ui-select
```

支持 `FFMPEG_BIN`。本次生成使用 NumPy 2.3.5、SciPy 1.17.0；没有新增运行时依赖。无损母带和四声连续试听位于忽略目录 `output/audio-design/system-ui/`，不会作为网站文件发布。完整 `build-game-audio.py` 会在其他声音重建后添加这组独立音效。
