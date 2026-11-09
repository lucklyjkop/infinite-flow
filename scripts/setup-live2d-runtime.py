"""Fetch the unmodified official Cubism Core into the ignored local cache.

The game server imports ensure_runtime(). No npm, model key or global install is
required. Cubism Core remains under Live2D's proprietary license, not this repo's
or the wrapper's license. The SHA pins the exact runtime tested by this project.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import threading
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "output" / "live2d-runtime"
CORE = CACHE / "live2dcubismcore.min.js"
URL = "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js"
SHA256 = "25ae938cb4fe282ce189b357bcc97e603d1e1f7ec78bf04150d401c23cdc792f"
LICENSE = "https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html"
_lock = threading.Lock()


def _valid(content: bytes) -> bool:
    return (hashlib.sha256(content).hexdigest() == SHA256
            and b"Live2D Cubism Core" in content[:2048]
            and b"Redistributable Code" in content[:2048])


def ensure_runtime(timeout: float = 25) -> Path:
    """Return the verified cache file, downloading it only when necessary.

    Errors are deliberately propagated so the caller can keep the portrait
    fallback. A changed upstream file is never silently accepted or rewritten.
    """
    with _lock:
        if CORE.is_file() and _valid(CORE.read_bytes()):
            return CORE
        request = urllib.request.Request(URL, headers={
            "User-Agent": "Mozilla/5.0 (compatible; InfiniteFlowLocalPreview/1.0)",
            "Referer": "https://www.live2d.com/",
        })
        with urllib.request.urlopen(request, timeout=timeout) as response:
            content = response.read(2 * 1024 * 1024)
        if not _valid(content):
            raise RuntimeError("Official Cubism Core did not match the pinned hash/header; cache was not replaced.")
        CACHE.mkdir(parents=True, exist_ok=True)
        temporary = CORE.with_suffix(".download")
        temporary.write_bytes(content)
        temporary.replace(CORE)
        (CACHE / "source.json").write_text(json.dumps({
            "url": URL, "sha256": SHA256, "bytes": len(content),
            "license": LICENSE, "modified": False,
            "note": "Local runtime cache; excluded from Git. Preserve the official license header.",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        return CORE


if __name__ == "__main__":
    print(ensure_runtime())
