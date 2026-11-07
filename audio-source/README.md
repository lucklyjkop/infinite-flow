# 音效原始录音

这里保留当前 17 个运行音效实际使用的 10 段原始录音，不包含已停用的 BGM。作品链接、作者、CC0 许可与用途见 [SOURCES.md](../loading-page/assets/audio/SOURCES.md)。`book/` 使用原作者文件名；`rain/1.ogg` 为雨声，其他三个文件分别是焚烧、书写与木骰录音。

运行游戏只需已经导出的 `loading-page/assets/audio/`。需要重新剪辑制作时，安装带 `libopus` 编码器的 FFmpeg、将它加入 PATH，或设置 `FFMPEG_BIN` 为可执行文件的完整路径；然后运行：

```sh
python -m pip install -r scripts/requirements-audio.txt
python scripts/build-game-audio.py
```

命令从仓库根目录运行。脚本输出运行用 Ogg 到 `loading-page/assets/audio/`，重写相应 manifest，制作中的 WAV 留在忽略提交的 `output/audio-design/wav/`。
