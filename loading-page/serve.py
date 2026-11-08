"""Serve the game locally, or on a forwarded port in a cloud workspace."""

from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import time
from urllib.parse import urlsplit

from models_api import CatalogueError, fetch_catalogue


class GamePreviewServer(ThreadingHTTPServer):
    # Cold browser tabs can request many independent images and scripts at once.
    request_queue_size = 128


class AssetHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 20
    rejection_drain_limit = 65536
    rejection_drain_timeout = .25

    def drain_rejected_body(self):
        """Avoid a TCP reset for an ordinary split-header/body rejected POST.

        Untrusted/unfinished uploads get both a byte cap and an absolute deadline;
        they are discarded as bytes and never interpreted or logged.
        """
        if getattr(self, "_request_body_consumed", False):
            return
        self._request_body_consumed = True
        try:
            declared = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            declared = self.rejection_drain_limit
        if self.headers.get("Transfer-Encoding"):
            declared = self.rejection_drain_limit
        remaining = min(max(declared, 0), self.rejection_drain_limit)
        previous_timeout = self.connection.gettimeout()
        deadline = time.monotonic() + self.rejection_drain_timeout
        try:
            while remaining:
                budget = deadline - time.monotonic()
                if budget <= 0:
                    break
                self.connection.settimeout(budget)
                chunk = self.rfile.read1(min(8192, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
        except (OSError, ValueError):
            pass
        finally:
            self.connection.settimeout(previous_timeout)

    def reject_json(self, status, payload):
        self.close_connection = True
        self.drain_rejected_body()
        self.send_json(status, payload)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if self.close_connection:
            self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def do_POST(self):
        self._request_body_consumed = False
        if self.path != "/api/models":
            self.reject_json(404, {"error": "未知接口。", "code": "not_found"})
            return
        # A same-origin JSON POST is required; no CORS permission is exposed.
        try:
            origin = urlsplit(self.headers.get("Origin", ""))
        except ValueError:
            origin = urlsplit("")
        expected = {self.headers.get("Host", "").lower(), self.headers.get("X-Forwarded-Host", "").split(",")[0].strip().lower()}
        if (origin.scheme not in {"http", "https"} or not origin.netloc or origin.username or origin.password
                or origin.path or origin.query or origin.fragment or origin.netloc.lower() not in expected
                or self.headers.get("Sec-Fetch-Site", "same-origin") not in {"same-origin", "none"}):
            self.reject_json(403, {"error": "请从当前游戏设置页面获取模型。", "code": "origin"})
            return
        try:
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json" or self.headers.get("Transfer-Encoding"):
                raise CatalogueError("request", "需要 JSON 请求。", 415)
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 16384:
                raise CatalogueError("request", "请求长度无效。", 413)
            # Even when this bounded read times out, do not read its buffered
            # stream again from the error path.
            self._request_body_consumed = True
            payload = json.loads(self.rfile.read(length))
            result = fetch_catalogue(payload)
            self.send_json(200, result)
        except CatalogueError as error:
            self.reject_json(error.status, {"error": error.message, "code": error.code})
        except (ValueError, UnicodeError):
            self.reject_json(400, {"error": "请求格式无效。", "code": "request"})
        except (OSError, TimeoutError):
            self.reject_json(408, {"error": "请求超时，请重试。", "code": "timeout"})


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--host", default="127.0.0.1",
                        help="Bind address; use 0.0.0.0 for Codespaces/containers")
    options = parser.parse_args()
    handler = partial(AssetHandler, directory=str(Path(__file__).resolve().parent))
    with GamePreviewServer((options.host, options.port), handler) as server:
        print(f"Game preview: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
