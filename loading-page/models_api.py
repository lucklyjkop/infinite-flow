"""Small credential-in-memory adapter for the settings model catalogue."""
import http.client
import ipaddress
import json
import socket
import ssl
import time
from urllib.parse import quote, unquote, urlsplit, urlunsplit

MAX_BODY = 2 * 1024 * 1024
MAX_MODELS = 2000
REQUEST_TIMEOUT = 8
TOTAL_TIMEOUT = 18
ANTHROPIC_VERSION = "2026-10-21"
ANTHROPIC_COMPAT_VERSION = "2023-06-01"
# Mihomo/Clash's default DNS Fake-IP pool. A TUN adapter routes these
# synthetic answers back to their original domains; they are not API hosts.
# https://wiki.metacubex.one/config/dns/
TUN_FAKE_IP_POOL = ipaddress.ip_network("198.18.0.0/16")


class CatalogueError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def endpoint_for(base_url):
    if not isinstance(base_url, str) or not base_url.strip() or len(base_url) > 2048:
        raise CatalogueError("address", "请填写完整的接口地址。")
    base_url = base_url.strip()
    if any(ord(char) <= 32 or ord(char) == 127 for char in base_url) or "\\" in base_url:
        raise CatalogueError("address", "接口地址不能包含空格或特殊控制字符。")
    try:
        value = urlsplit(base_url)
        port = value.port
    except ValueError:
        raise CatalogueError("address", "接口地址格式无效。") from None
    if value.scheme not in {"https", "http"} or not value.hostname or value.username or value.password or value.query or value.fragment:
        raise CatalogueError("address", "请使用不含认证信息、查询参数的 HTTP(S) 接口地址。")
    if port is not None and not 1 <= port <= 65535:
        raise CatalogueError("address", "接口端口无效。")
    decoded = unquote(unquote(value.path))
    if any(part in {".", ".."} for part in decoded.split("/")) or "\\" in decoded or any(ord(c) < 32 for c in decoded):
        raise CatalogueError("address", "接口路径无效。")
    path = value.path.rstrip("/")
    # Accept an API root, /v1, /models, or a commonly copied completion endpoint.
    for ending in ("/chat/completions", "/responses", "/messages"):
        if path.endswith(ending):
            path = path[:-len(ending)]
            break
    if not path:
        path = "/v1"
    if not path.endswith("/models"):
        path += "/models"
    try:
        host = value.hostname.encode("idna").decode("ascii").lower().rstrip(".")
    except UnicodeError:
        raise CatalogueError("address", "接口域名无效。") from None
    netloc = f"[{host}]" if ":" in host else host
    if port:
        netloc += f":{port}"
    return urlunsplit((value.scheme, netloc, path, "", ""))


def target_addresses(host, port):
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    explicit_loopback = host == "localhost" or (literal is not None and literal.is_loopback)
    try:
        answers = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        raise CatalogueError("dns", "无法解析接口域名，请检查接口地址。", 502) from None
    addresses = []
    for answer in answers:
        address = answer[4][0]
        ip = ipaddress.ip_address(address)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        # Accept only DNS answers in the default proxy pool, never a literal
        # Fake-IP URL. Keep the original hostname for Host/SNI/certificate
        # validation and pin the socket to this answer, just as for public IPs.
        tun_answer = literal is None and not explicit_loopback and ip in TUN_FAKE_IP_POOL
        if not ((ip.is_global and not ip.is_multicast) or (explicit_loopback and ip.is_loopback) or tun_answer):
            raise CatalogueError("address", "不能连接该保留地址。自托管服务请明确填写 localhost 或回环地址。")
        if address not in addresses:
            addresses.append(address)
    if not addresses:
        raise CatalogueError("dns", "接口域名没有可用地址。", 502)
    return addresses


def request_page(endpoint, headers, deadline):
    parsed = urlsplit(endpoint)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = target_addresses(parsed.hostname, port)
    # Pin the validated address; TLS and Host still use the original hostname.
    # No redirect and no environment-proxy forwarding of credentials.
    remaining = min(REQUEST_TIMEOUT, deadline - time.monotonic())
    if remaining <= 0:
        raise CatalogueError("timeout", "获取模型超时，请稍后重试。", 504)
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    connection = connection_type(parsed.hostname, port, timeout=remaining)
    def connect_address(_address, timeout=remaining, source_address=None):
        last = None
        for address in addresses:
            try:
                return socket.create_connection((address, port), timeout, source_address)
            except OSError as error:
                last = error
        raise last or OSError("No address")
    connection._create_connection = connect_address
    try:
        path = parsed.path + ("?" + parsed.query if parsed.query else "")
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        status = response.status
        if 300 <= status < 400:
            raise CatalogueError("redirect", "接口返回了跳转，请填写最终接口地址后重试。", 502)
        if status != 200:
            messages = {401: "密钥无效或已过期，请检查 API 密钥。", 403: "当前密钥没有读取模型列表的权限。",
                        404: "该地址没有模型列表接口，请检查接口根地址。", 429: "请求过于频繁或额度受限，请稍后重试。"}
            raise CatalogueError(f"upstream_{status}", messages.get(status, f"接口暂时不可用（HTTP {status}）。"), 502)
        chunks, length = [], 0
        while True:
            remaining = min(REQUEST_TIMEOUT, deadline - time.monotonic())
            if remaining <= 0:
                raise CatalogueError("timeout", "获取模型超时，请稍后重试。", 504)
            if connection.sock is not None:
                connection.sock.settimeout(remaining)
            chunk = response.read1(min(65536, MAX_BODY + 1 - length))
            if not chunk:
                break
            chunks.append(chunk)
            length += len(chunk)
            if length > MAX_BODY:
                raise CatalogueError("too_large", "模型列表过大，请缩小接口返回范围后重试。", 502)
        raw = b"".join(chunks)
        try:
            payload = json.loads(raw)
        except (ValueError, UnicodeError):
            raise CatalogueError("format", "接口没有返回有效的 JSON 模型列表。", 502) from None
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise CatalogueError("format", "接口返回格式不兼容，需要包含 data 数组。", 502)
        return payload
    except CatalogueError:
        raise
    except (TimeoutError, socket.timeout):
        raise CatalogueError("timeout", "获取模型超时，请稍后重试。", 504) from None
    except ssl.SSLError:
        raise CatalogueError("tls", "无法验证接口的安全连接，请检查 HTTPS 地址和证书。", 502) from None
    except (OSError, http.client.HTTPException, ValueError):
        raise CatalogueError("connection", "无法连接接口，请检查地址、端口和网络。", 502) from None
    finally:
        connection.close()


def fetch_catalogue(payload):
    if not isinstance(payload, dict):
        raise CatalogueError("request", "请求格式无效。")
    protocol = payload.get("protocol", "openai")
    if not isinstance(protocol, str) or protocol not in {"openai", "anthropic"}:
        raise CatalogueError("protocol", "不支持的接口协议。")
    endpoint = endpoint_for(payload.get("baseUrl"))
    key = payload.get("apiKey", "")
    if not isinstance(key, str) or len(key) > 4096:
        raise CatalogueError("key", "API 密钥格式无效。")
    key = key.strip()
    if any(ord(c) < 33 or ord(c) > 126 for c in key):
        raise CatalogueError("key", "API 密钥中不能包含空格或换行。")
    headers = {"Accept": "application/json", "User-Agent": "InfiniteFlow-ModelCatalogue/1"}
    if protocol == "anthropic":
        headers["anthropic-version"] = (ANTHROPIC_VERSION if urlsplit(endpoint).hostname == "api.anthropic.com"
                                        else ANTHROPIC_COMPAT_VERSION)
        if key:
            headers["x-api-key"] = key
    elif key:
        headers["Authorization"] = f"Bearer {key}"
    models, seen, cursors = [], set(), set()
    deadline = time.monotonic() + TOTAL_TIMEOUT
    url = endpoint + ("?limit=1000" if protocol == "anthropic" else "")
    truncated = False
    for page_number in range(4):
        page = request_page(url, headers, deadline)
        for item_index, item in enumerate(page["data"]):
            if not isinstance(item, dict):
                continue
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 512 or any(ord(c) < 32 for c in identifier):
                continue
            identifier = identifier.strip()
            if identifier in seen or (key and key in identifier):
                continue
            seen.add(identifier)
            # Only IDs cross back into the UI, never raw upstream objects or errors.
            models.append({"id": identifier})
            if len(models) >= MAX_MODELS:
                truncated = item_index + 1 < len(page["data"]) or bool(page.get("has_more"))
                break
        if len(models) >= MAX_MODELS or protocol != "anthropic" or not page.get("has_more"):
            break
        cursor = page.get("last_id")
        if not isinstance(cursor, str) or not cursor or cursor in cursors or len(cursor) > 512 or page_number == 3:
            truncated = True
            break
        cursors.add(cursor)
        url = endpoint + "?limit=1000&after_id=" + quote(cursor, safe="")
    return {"models": models, "count": len(models), "truncated": truncated}
