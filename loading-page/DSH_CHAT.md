# 红妆对话 · DeepSeek Harness

DSH 是对话运行层，**不限定模型供应商**。项目用官方 [DeepSeek Harness Python SDK](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md) 和 [`llm-pi-ai` 多供应商适配器](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md)，接入玩家在系统设置中填写的接口地址、密钥与模型。这里没有网页登录反代，也不读取其他 DSH 项目的账号或配置。

## 安装和启动

```sh
python scripts/setup-dsh-runtime.py
python loading-page/serve.py
```

安装固定的 `deepseek-harness-sdk==0.2.1rc2` 及匹配的官方 runtime 到 `output/dsh-runtime/venv`，需要 Python 3.10+ 及官方 runtime 支持的平台。另一台电脑重新执行安装命令即可，不需要全局 DSH。依赖和本机会话目录不提交 Git。

在系统设置中选择 **OpenAI 兼容** 或 **Anthropic**，填写实际可用的接口地址、密钥、模型 ID 并保存。模型列表可从配置的服务获取；不根据密钥前缀限制服务商，允许 localhost 自托管无密钥服务。

## 协议与地址

| 设置协议 | 地址示例 | 实际请求协议与路径 |
| --- | --- | --- |
| OpenAI 兼容 | `https://gateway.example/v1` | Chat Completions，`/v1/chat/completions` |
| OpenAI 兼容 | `https://gateway.example/v1/responses` | Responses，`/v1/responses` |
| Anthropic | `https://gateway.example` 或 `/v1` | Messages，`/v1/messages` |
| Anthropic | `https://gateway.example/anthropic` | Messages，`/anthropic/v1/messages` |
| OpenAI 兼容 | `https://api.deepseek.com` | Chat Completions，`/v1/chat/completions` |
| Anthropic | `https://api.deepseek.com` | DeepSeek 官方兼容入口，`/anthropic/v1/messages` |

也接受完整的 `/chat/completions`、`/responses` 或 `/messages` 地址。自定义路径前缀保留；Responses 仅在 OpenAI 协议且地址明确以 `/responses` 结尾时使用，不把 Chat Completions 请求冒充 Responses。完整 Messages 地址按输入使用。OpenAI 使用 `Authorization: Bearer`，Anthropic 使用 `x-api-key` 和 `anthropic-version`。

三个协议均由 DSH 官方 `llm-pi-ai` 原生实现，上游 [provider 协议表](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/src/provider.ts) 明确列出 `openai-completions`、`openai-responses` 和 `anthropic-messages`。本项目的本机转发层只处理目标校验、认证和超时，不做未经验证的协议转换。

## 接口与隔离

- `dsh_api.chat(payload)` 接收 `message`、`sessionId?`、`protocol: "openai" | "anthropic"`、`baseUrl`、`apiKey`、`model`，返回 `reply`、`sessionId`、`provider: "dsh"`。协议默认 OpenAI 兼容。前端不需要将 DSH 作为第三种接口协议。
- 密钥从服务器经标准输入进入单次 worker 的内存，只有该 worker 发起到配置目标的 HTTP 请求时使用。DSH SDK 只持有本次本机转发层的随机临时凭据，不接触真实 API 密钥。密钥不放入命令行、日志、提示词或配置文件，也不继承其他应用的密钥。
- 请求沿用 `models_api.target_addresses` 的 DNS 校验，只连接校验后的固定地址，Host/SNI/证书验证仍使用原域名，禁止重定向与环境代理。显式 `localhost` 或回环地址允许自托管，公网域名解析到保留地址会被拒绝。
- 固定 `sdk-minimal` 加 `scripts/dsh-chat.patch.yml`，禁用官方单供应商插件并加载本项目的 `game-chat` 自定义 provider。关闭 shell、文件、图像读取、工作目录及 MCP 工具，不给予角色操作电脑的能力。转发层还会拒绝带工具的请求。工作目录及 home 固定在 `output/dsh-sessions/`。
- DSH 会话日志上传、插件清单上传、文件会话及检查点关闭。当前 Windows native runtime 在实测持久化关闭时缺少原生依赖，因此最近 20 条、总计最多 16000 字的已完成对话保留在 Python 服务内存；重启服务会清空。没有宣称原生 DSH 跨重启恢复可用。
- 单次最多 1200 输出 token；自定义 provider 不请求额外思考档位，供应商默认行为仍由具体接口决定。worker 120 秒超时，外层 128 秒兜底并清理自己创建的子进程。失败返回明确错误，不用固定台词替代实际回复。
- 当前只有文本对话，没有 TTS、语音口型同步或 AI 修改游戏存档功能。

## 检查

```sh
python -m unittest discover -s tests -p "test_dsh_*.py" -v
```

边界测试不依赖外部网络。安装 SDK 后，会额外通过真实 DSH 运行时访问本机模拟的 Chat Completions、Responses、Messages 服务，验证各自的真实报文、中文回复、对话上下文、无工具及无日志上传。模拟服务仅用于测试；产品没有演示回复分支。真实自定义服务和账户可用性需用该服务自己的凭据实际验证。
