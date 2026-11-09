"""Bounded role-chat adapter for the official DeepSeek Harness Python SDK.

This module uses only stdlib. The optional SDK runs in an isolated worker venv;
request credentials travel over stdin, never argv, files or server diagnostics.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import signal
import subprocess
import threading
import time
import uuid
from models_api import CatalogueError
from dsh_transport import target_for

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "output" / "dsh-runtime" / "venv"
WORKER = ROOT / "scripts" / "dsh-chat-worker.py"
SESSION_ROOT = ROOT / "output" / "dsh-sessions"
TIMEOUT = 120
MAX_REPLY = 12000
MAX_HISTORY_MESSAGES = 20
MAX_HISTORY_CHARS = 16000
_active = set()
_history = {}
_lock = threading.Lock()


class ChatError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def runtime_python():
    return RUNTIME / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def runtime_status():
    return {"installed": runtime_python().is_file(), "provider": "dsh", "version": "0.2.1rc2"}


def validate_history(value):
    """Saved context consists only of complete player/character exchanges."""
    if not isinstance(value, list) or len(value) > MAX_HISTORY_MESSAGES or len(value) % 2:
        raise ChatError("history", "存档对话记录格式无效，请重新载入存档。")
    result, total = [], 0
    for index, item in enumerate(value):
        expected = "user" if index % 2 == 0 else "assistant"
        limit = 4000 if expected == "user" else MAX_REPLY
        if not isinstance(item, dict) or item.get("role") != expected:
            raise ChatError("history", "存档对话记录格式无效，请重新载入存档。")
        content = item.get("content")
        if not isinstance(content, str) or not content.strip() or len(content) > limit:
            raise ChatError("history", "存档对话记录长度无效，请重新载入存档。")
        content = content.strip()
        total += len(content)
        if total > MAX_HISTORY_CHARS:
            raise ChatError("history", "存档对话上下文过长，请重新载入存档。")
        # Strip extra object fields, including names, instructions and tool data.
        result.append({"role": expected, "content": content})
    return result


def validate(payload):
    if not isinstance(payload, dict):
        raise ChatError("request", "对话请求格式无效。")
    message = payload.get("message")
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        raise ChatError("message", "请输入不超过 4000 字的内容。")
    key = payload.get("apiKey", "")
    if not isinstance(key, str):
        raise ChatError("key", "API 密钥格式无效。")
    key = key.strip()
    if len(key) > 4096 or any(ord(c) < 33 or ord(c) > 126 for c in key):
        raise ChatError("key", "API 密钥格式无效。")
    model = payload.get("model", "")
    if not isinstance(model, str) or not model.strip() or len(model) > 200 or any(ord(c) < 32 for c in model):
        raise ChatError("model", "请先选择或填写模型 ID。")
    protocol = payload.get("protocol", "openai")
    if not isinstance(protocol, str) or protocol not in {"openai", "anthropic"}:
        raise ChatError("protocol", "请选择 OpenAI 兼容或 Anthropic 接口协议。")
    try:
        endpoint, wire_api = target_for(payload.get("baseUrl") or "https://api.deepseek.com", protocol)
    except CatalogueError as error:
        raise ChatError(error.code, error.message, error.status) from None
    session = payload.get("sessionId") or uuid.uuid4().hex
    if not isinstance(session, str) or not re.fullmatch(r"[0-9a-f]{32}", session):
        raise ChatError("session", "对话会话无效，请重新进入系统空间。")
    request = {"message": message.strip(), "apiKey": key, "model": model.strip(),
               "protocol": protocol, "endpoint": endpoint, "wireApi": wire_api,
               "sessionId": session, "timeout": TIMEOUT}
    if "history" in payload:
        request["history"] = validate_history(payload["history"])
    return request


def _child_environment():
    # The optional runtime must not inherit another app's model credentials,
    # DSH home, Python imports, or Node injection options.
    allowed = {"SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE",
               "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    environment["PYTHONIOENCODING"] = "utf-8"
    environment["PYTHONUTF8"] = "1"
    return environment


def _stop_owned_worker(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=subprocess.CREATE_NO_WINDOW, timeout=10, check=False)
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    process.kill()


def chat(payload):
    request = validate(payload)
    # A reused session id must not send one provider's conversation to another
    # destination/account. Store only an in-memory digest, never credentials.
    route = hashlib.sha256(json.dumps([request["endpoint"], request["wireApi"], request["model"], request["apiKey"]],
                                     ensure_ascii=False).encode("utf-8")).hexdigest()
    executable = runtime_python()
    if not executable.is_file():
        raise ChatError("runtime", "DSH 运行环境尚未安装，请运行 python scripts/setup-dsh-runtime.py。", 503)
    session = request["sessionId"]
    with _lock:
        if session in _active or len(_active) >= 3:
            raise ChatError("busy", "红妆正在回应，请稍候再发送。", 409)
        _active.add(session)
        previous = _history.get(session, {})
        # An explicit saved history is authoritative, including an empty list.
        # Only legacy clients which omit it fall back to the in-memory session.
        if "history" not in request:
            request["history"] = list(previous.get("messages", [])) if previous.get("route") == route else []
    try:
        SESSION_ROOT.mkdir(parents=True, exist_ok=True)
        process = subprocess.Popen([str(executable), str(WORKER)],
                                   cwd=str(SESSION_ROOT), env=_child_environment(),
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   text=True, encoding="utf-8", start_new_session=os.name != "nt",
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            output, _ = process.communicate(json.dumps(request, ensure_ascii=False), timeout=TIMEOUT + 8)
        except subprocess.TimeoutExpired:
            _stop_owned_worker(process)
            process.communicate(timeout=5)
            raise ChatError("timeout", "红妆回应超时，请稍后再试。", 504) from None
        try:
            result = json.loads(output) if len(output) < 256000 else None
        except ValueError:
            result = None
        if not isinstance(result, dict):
            raise ChatError("runtime", "DSH 未返回有效回复，请检查运行环境。", 502)
        if result.get("error"):
            code = result.get("code")
            if code == "timeout":
                raise ChatError("timeout", "红妆回应超时，请稍后再试。", 504)
            if code == "runtime":
                raise ChatError("runtime", "DSH 运行环境不可用，请重新运行安装脚本。", 503)
            if code in {"redirect", "address", "dns", "tls", "connection", "too_large"}:
                messages = {"redirect": "接口返回了跳转，请填写最终接口地址后重试。",
                            "address": "接口目标地址不可用。自托管服务请明确填写 localhost 或回环地址。",
                            "dns": "无法解析接口域名，请检查接口地址。",
                            "tls": "无法验证接口的 HTTPS 证书。",
                            "connection": "无法连接所配置的接口，请检查地址和网络。",
                            "too_large": "接口回复过大，请稍后重试。"}
                raise ChatError(code, messages[code], 502)
            raise ChatError("upstream", "DSH 对话失败，请检查接口协议、地址、密钥、模型和账户额度。", 502)
        reply = result.get("reply")
        if not isinstance(reply, str) or not reply.strip() or len(reply) > MAX_REPLY:
            raise ChatError("reply", "DSH 没有返回可显示的回复，请稍后再试。", 502)
        reply = reply.strip()
        with _lock:
            messages = [*request["history"], {"role": "user", "content": request["message"]},
                        {"role": "assistant", "content": reply}][-MAX_HISTORY_MESSAGES:]
            while sum(len(m["content"]) for m in messages) > MAX_HISTORY_CHARS and len(messages) > 2:
                messages = messages[2:]
            _history[session] = {"messages": messages, "touched": time.monotonic(), "route": route}
            if len(_history) > 50:
                oldest = min((key for key in _history if key not in _active),
                             key=lambda key: _history[key]["touched"], default=None)
                if oldest:
                    del _history[oldest]
        return {"reply": reply, "sessionId": session, "provider": "dsh"}
    except ChatError:
        raise
    except (OSError, subprocess.SubprocessError):
        raise ChatError("runtime", "无法启动 DSH 对话，请检查运行环境。", 503) from None
    finally:
        with _lock:
            _active.discard(session)
