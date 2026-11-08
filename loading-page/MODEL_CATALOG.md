# 模型 ID 获取

从项目根目录运行 `python loading-page/serve.py`，在系统设置 → 模型接口中填写接口地址与密钥，然后打开「模型 ID」纸艺下拉框。首次打开会获取模型，可在下拉内筛选、选择或刷新；也可在下拉内输入模型 ID，点击「使用输入的模型 ID」手动指定。选择只修改当前草稿；点击保存设置才保存，关闭设置会回滚未保存修改。

列表浮层、搜索和选中项仅使用纸质贴图，不附加实色底板。根据可视区域自动向上或向下展开，软键盘出现时重新定位。较长列表在浮层内部滚动，不带动设置页；方向键选择、Enter 确认，第一次 Escape 或原生返回请求只收起列表。未填写地址时不显示说明，输入模型 ID 后才显示手动使用按钮；加载中、空列表和失败时仍可手动指定。

浏览器通过同源 `POST /api/models` 请求本地预览服务，由预览服务向填写的地址发送模型列表请求。静态托管和直接打开 HTML 文件不提供这个接口；Codespaces 运行同一服务并转发端口即可。没有填写密钥时不发送认证头，适用于无需认证的本机自托管服务。

## 协议与地址

| 协议 | 请求 | 认证与版本 |
| --- | --- | --- |
| OpenAI 兼容 | `GET {接口根地址}/models` | `Authorization: Bearer …` |
| Anthropic | `GET {接口根地址}/models?limit=1000` | `x-api-key: …`；官方 `api.anthropic.com` 使用 `anthropic-version: 2026-10-21`；第三方兼容服务使用 `2023-06-01` |

纯域名默认补 `/v1/models`。填写 `/v1`、`/api/v1` 等前缀时保留该前缀；已填 `/models` 不重复追加；常见 `/chat/completions`、`/responses`、`/messages` 端点会转换成同前缀的 `/models`。

只读取响应 `data[].id`，不猜测模型名称。Anthropic 使用 `has_more` / `last_id` 翻页，最多四页、2000 个不同 ID；截取时界面明确提示。返回空列表、401、403、404、429、网络错误、超时和不兼容 JSON 均有对应提示。修改地址、协议或密钥以及关闭设置都会取消当前浏览器请求并丢弃过期结果。

## 请求边界

接口只接受同源 JSON POST，单次请求体限制 16 KiB，上游单页限制 2 MiB。单次网络等待上限 8 秒，分页与响应体读取共用 18 秒预算；浏览器 22 秒后取消。操作系统 DNS 解析遵循系统解析超时。浏览器取消后，已开始的服务器请求仍按网络超时收尾。

服务端不保存或记录密钥、不读取环境中的其他密钥、不返回上游错误正文。只有用户在设置中显式保存时，原有设置逻辑才将密钥保存到当前浏览器会话；模型列表本身仅保存在内存中。模型代理不使用系统 HTTP 代理，不跟随 HTTP 跳转；先检查 DNS 地址，再固定已验证地址进行连接，HTTPS 仍验证原始域名。允许公网地址以及明确填写的 `localhost` / 回环 IP；拒绝其他内网、链路本地、云元数据、保留或组播地址。

## 核对来源与测试

截至 2026-11-08，协议依据：[OpenAI List models](https://developers.openai.com/api/reference/resources/models/methods/list)、[Anthropic List models](https://platform.claude.com/docs/en/api/models/list)、[Anthropic authentication](https://platform.claude.com/docs/en/manage-claude/authentication)、[Anthropic 2026-10-21 migration](https://platform.claude.com/docs/en/api/migration-2026-10-21)。Anthropic 官方仍接受 `x-api-key`；第三方采用经典版本以兼容已有网关，模型列表只使用两个版本共同的 ID 与分页字段。

运行 `python -m unittest discover -s tests -p "test_models_api.py" -v`。测试使用临时端口上的本机假接口，验证认证头、路径、分页、错误、重定向、请求来源及密钥不进入日志；不使用真实 API 密钥，也不产生模型调用费用。
