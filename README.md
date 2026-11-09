# 无限流

以红妆、樱枝和雨幕为主题的游戏入口原型：资源加载、空间照片标题页、纸艺系统设置、方块转场与主神选择。开始游戏后进入「主神空间」，选择红妆并确认可进入「系统空间」：中央 Q 版正面 Live2D 红妆、两侧悬浮功能和底部输入框。角色支持眨眼、视线跟随、呼吸和头发物理；文本对话通过官方 DeepSeek Harness 连接你配置的模型接口。首个可玩世界尚未接入。

## 在另一台电脑继续开发

安装 Git 和 Python 3.10 或以上版本，登录有仓库权限的 GitHub 账号，然后运行：

```sh
git clone https://github.com/lucklyjkop/infinite-flow.git
cd infinite-flow
python loading-page/serve.py
```

macOS / Linux 如果没有 `python` 命令，改用 `python3`。预览不需要 npm 安装，不需要生图密钥。

首次启动会从 Live2D 官方下载经过校验的 Cubism Core 到本机缓存，之后可离线使用。下载失败时页面保留角色插画；可运行 `python scripts/setup-live2d-runtime.py` 重试。Core 缓存在 `output/`，不随 Git 提交。

需要 AI 对话时，另执行一次 `python scripts/setup-dsh-runtime.py` 安装本项目隔离的 DSH 运行环境。在游戏设置中选择 OpenAI 兼容或 Anthropic 协议，填写自己的接口地址、密钥和模型 ID 并保存。支持自定义服务与明确的 localhost 服务；具体端点规则见 [DSH 对话接入](loading-page/DSH_CHAT.md)。最近对话保留在服务内存，重启预览服务会清空。

- 完整加载流程：[http://127.0.0.1:4173/](http://127.0.0.1:4173/)
- 直接进入标题：[http://127.0.0.1:4173/?screen=title](http://127.0.0.1:4173/?screen=title)
- 停止预览：在终端按 Ctrl+C。

每次换电脑先 `git pull --ff-only`。完成修改后提交并推送，另一台电脑才能拉取到：

```sh
git status
git add loading-page art-source audio-source scripts README.md
git commit -m "描述本次修改"
git push
```

若两台电脑需要同时改动，先用 `git switch -c feature/功能名` 创建分支再开发，通过 Pull Request 合并。GitHub 同步代码和素材；浏览器的存档、音量偏好和会话密钥不会自动跨电脑同步。

## 不安装本地环境：GitHub Codespaces

在仓库页面点击 **Code → Codespaces → Create codespace on main**。仓库已提供开发容器配置，容器启动后会运行预览服务，并转发 4173 端口。在 **Ports** 面板打开该端口即可预览。若服务没有启动，可在云端终端执行：

```sh
python loading-page/serve.py --host 0.0.0.0
```

在 Codespaces 的 Source Control 中提交并推送后，本地使用 `git pull --ff-only` 同步。

## 开发与验证

页面是原生 HTML / CSS / JavaScript。修改后刷新浏览器即可；静态图片、音效、Live2D 模型和渲染器封装均包含在仓库中。Cubism Core 按上面的首次启动步骤缓存，浏览器从本机预览服务加载。

```sh
# 可选：安装 Node.js 22+ 后执行资源引用和语法检查
python scripts/check-project.py
python -m unittest discover -s tests -p "test_*.py"
```

每次 push 和 Pull Request 都会在 GitHub Actions 执行同一检查。视觉与声音仍需在真实浏览器中确认：首次点击解锁音频，标题菜单点击与选中是独立反馈，环境声默认 25%，当前不包含 BGM。

| 目录 | 内容 |
| --- | --- |
| `loading-page/` | 可独立运行的游戏入口、交互、动画与本地素材 |
| `art-source/` | 当前设计的源图、提示词与处理记录 |
| `audio-source/` | CC0 原始录音，以及主神空间原创音效的设计与复现记录 |
| `scripts/` | 跨平台项目检查 |
| `.devcontainer/` | GitHub Codespaces / VS Code 开发容器 |
| `.github/workflows/` | 自动资源与语法检查 |

详细的游戏接入接口见 [loading-page/README.md](loading-page/README.md)。Live2D 可编辑工程、图层和制作步骤见 [红妆制作说明](art-source/live2d/hongzhuang/README.md)。素材来源与许可见 [音效来源](loading-page/assets/audio/SOURCES.md)、[空间渲染器来源](loading-page/vendor/depth-flow/SOURCE.md) 和 [Live2D 运行依赖](loading-page/vendor/live2d/SOURCE.md)。本仓库没有将项目美术或代码整体授予开源许可。

设置页的模型 ID 使用纸艺下拉框，填写接口地址和密钥后打开即可获取模型；支持筛选、刷新和手动输入。该功能依赖随项目提供的 Python `/api/models` 服务，详见 [模型列表接口](loading-page/MODEL_CATALOG.md)。

模型接口密钥只在运行页面中填写，保存在当前浏览器会话；不写进代码、提交、提示词或仓库。历史试验、生成缓存、安装包、录屏和本机依赖目录不属于运行所需文件，留在原电脑中。
