# 项目美术资源

用户所说的「imag2」指生成当时 OpenAI Image 系列中最新、面向高精度美术制作的模型，使用该模型的最高画质。按用户指定的入口生成；本次折扇使用内置生图。使用 API 时先核对官方模型目录，显式指定模型和最高画质。随源素材保存提示词、生成入口和可核实的参数；内置工具未返回的模型版本或画质档位注明为未披露。

# 项目开发

可运行入口为 `loading-page/`，原生 HTML / CSS / JavaScript，无前端构建依赖。从仓库根目录运行 `python loading-page/serve.py`；Codespaces 使用 `--host 0.0.0.0`。`python scripts/check-project.py` 执行资源路径与语法检查，需要 Python 3.10+ 和 Node.js 22+。

当前美术源稿与生成记录保存在 `art-source/imagegen/`，运行贴图在 `loading-page/assets/`。音效源录音在 `audio-source/`，制作脚本为 `scripts/build-game-audio.py`。当前版本不包含 BGM，环境声默认 25%。不要提交 API 密钥、浏览器存储、本机依赖或 `output/` 临时产物。
