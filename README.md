# 无限流

以红妆、樱枝和雨幕为主题的游戏入口原型：资源加载、空间照片标题页、纸艺系统设置、方块转场与主神选择。开始游戏后进入「主神空间」，左侧头像选择红妆，右侧以 NAI 整幅场景呈现并支持空间视差；首个可玩世界尚未接入。

## 在另一台电脑继续开发

安装 Git 和 Python 3.10 或以上版本，登录有仓库权限的 GitHub 账号，然后运行：

```sh
git clone https://github.com/lucklyjkop/infinite-flow.git
cd infinite-flow
python loading-page/serve.py
```

macOS / Linux 如果没有 `python` 命令，改用 `python3`。预览不需要 npm 安装，不需要生图密钥。

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

页面是原生 HTML / CSS / JavaScript。修改后刷新浏览器即可；静态图片、音效、渲染器均包含在仓库中，无需外部素材 CDN。

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
| `audio-source/` | 当前音效使用的 CC0 原始录音 |
| `scripts/` | 跨平台项目检查 |
| `.devcontainer/` | GitHub Codespaces / VS Code 开发容器 |
| `.github/workflows/` | 自动资源与语法检查 |

详细的游戏接入接口见 [loading-page/README.md](loading-page/README.md)。素材来源与许可见 [音效来源](loading-page/assets/audio/SOURCES.md) 和 [空间渲染器来源](loading-page/vendor/depth-flow/SOURCE.md)。本仓库没有将项目美术或代码整体授予开源许可。

设置页的模型 ID 使用纸艺下拉框，填写接口地址和密钥后打开即可获取模型；支持筛选、刷新和手动输入。该功能依赖随项目提供的 Python `/api/models` 服务，详见 [模型列表接口](loading-page/MODEL_CATALOG.md)。

模型接口密钥只在运行页面中填写，保存在当前浏览器会话；不写进代码、提交、提示词或仓库。历史试验、生成缓存、安装包、录屏和本机依赖目录不属于运行所需文件，留在原电脑中。
