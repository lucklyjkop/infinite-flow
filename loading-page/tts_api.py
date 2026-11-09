"""Built-in online voices, synthesized in a bounded, credential-free worker.

Only the fixed Edge voice allowlist reaches the runtime. Text and audio stay in
memory; the HTTP server never imports optional packages or installs on request.
"""
from pathlib import Path
import json
import os
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "output" / "tts-runtime" / "venv"
WORKER = Path(__file__).with_name("tts_worker.py")
VERSION = "7.3.1"
TIMEOUT = 60
MAX_AUDIO = 8 * 1024 * 1024
MAX_TEXT = 1500
VOICES = {
    "female": {"name": "晓晓", "gender": "female", "voice": "zh-CN-XiaoxiaoNeural"},
    "male": {"name": "云希", "gender": "male", "voice": "zh-CN-YunxiNeural"},
}
_slots = threading.BoundedSemaphore(2)


class TTSError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def runtime_python():
    return RUNTIME / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def _installed():
    try:
        marker = json.loads((RUNTIME.parent / "installed.json").read_text(encoding="utf-8"))
        return runtime_python().is_file() and marker.get("edge_tts") == VERSION
    except (OSError, ValueError, AttributeError):
        return False


def runtime_status():
    return {"ready": _installed(), "engine": "edge-neural", "online": True,
            "voices": [{"id": identifier, "name": item["name"], "gender": item["gender"]}
                       for identifier, item in VOICES.items()]}


def validate(payload):
    if not isinstance(payload, dict) or set(payload) - {"text", "voice", "rate"}:
        raise TTSError("request", "语音请求格式无效。")
    text = payload.get("text")
    if (not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT
            or any((ord(char) < 32 and char not in "\n\r\t") or ord(char) == 127
                   or 0xD800 <= ord(char) <= 0xDFFF for char in text)):
        raise TTSError("text", "朗读内容需为 1–1500 字。")
    voice = payload.get("voice", "female")
    if not isinstance(voice, str) or voice not in VOICES:
        raise TTSError("voice", "请选择内置男声或女声。")
    rate = payload.get("rate", 100)
    if isinstance(rate, bool) or not isinstance(rate, (int, float)) or not 75 <= rate <= 125:
        raise TTSError("rate", "语速需在 75%–125% 之间。")
    return {"text": text.strip(), "voice": voice, "rate": round(rate)}


def _environment():
    allowed = {"SYSTEMROOT", "WINDIR", "COMSPEC", "PATH", "PATHEXT", "TEMP", "TMP", "HOME", "USERPROFILE",
               "APPDATA", "LOCALAPPDATA", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR"}
    environment = {key: value for key, value in os.environ.items() if key.upper() in allowed}
    environment.update(PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    return environment


def _worker_failure(code):
    errors = {
        "runtime": ("语音运行环境未就绪，请运行 python scripts/setup-tts-runtime.py。", 503),
        "timeout": ("语音合成超时，请稍后重试。", 504),
        "tls": ("无法验证语音服务的安全连接，请检查网络。", 502),
        "connection": ("暂时无法连接在线语音服务，请检查网络后重试。", 502),
        "upstream": ("在线语音服务暂时不可用，请稍后重试。", 502),
        "too_large": ("语音内容过长，请缩短后重试。", 502),
        "empty": ("语音服务未返回可播放的声音，请重试。", 502),
    }
    message, status = errors.get(code, errors["upstream"])
    return TTSError(code if code in errors else "upstream", message, status)


def synthesize(payload):
    request = validate(payload)
    if not _installed():
        raise _worker_failure("runtime")
    if not _slots.acquire(blocking=False):
        raise TTSError("busy", "语音正在生成，请稍候再试。", 429)
    process = None
    try:
        process = subprocess.Popen([str(runtime_python()), str(WORKER)], cwd=str(ROOT), env=_environment(),
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        try:
            output, _ = process.communicate(json.dumps(request, ensure_ascii=False).encode("utf-8"), timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate(timeout=5)
            raise _worker_failure("timeout") from None
        if len(output) > MAX_AUDIO:
            raise _worker_failure("too_large")
        if process.returncode != 0:
            try:
                result = json.loads(output) if len(output) <= 2048 else None
            except (ValueError, UnicodeError):
                result = None
            raise _worker_failure(result.get("code") if isinstance(result, dict) else "upstream")
        # Edge emits raw MP3 frames, optionally an ID3 tag. Do not serve a worker
        # traceback, error JSON, or HTML response as audio after a runtime fault.
        if len(output) < 128 or not (output.startswith(b"ID3") or (output[0] == 0xFF and output[1] & 0xE0 == 0xE0)):
            raise _worker_failure("empty")
        return output
    except TTSError:
        raise
    except OSError:
        raise _worker_failure("runtime") from None
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.communicate(timeout=5)
        _slots.release()
