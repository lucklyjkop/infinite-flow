"""Per-worker, loopback-only transport for native DSH pi-ai provider adapters.

No protocol conversion: pi-ai implements Chat Completions, Responses or Messages.
This relay only pins validated destinations, supplies in-memory authentication,
and refuses redirects. User credentials never enter the DSH runtime itself.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hmac
import http.client
import json
import secrets
import socket
import ssl
import threading
import time
from urllib.parse import urlsplit, urlunsplit

from models_api import CatalogueError, endpoint_for, target_addresses

MAX_BODY = 2 * 1024 * 1024
MAX_REQUEST = 256 * 1024


def target_for(base_url, protocol):
    """Normalize copied API roots or full endpoints without guessing providers."""
    catalogue = urlsplit(endpoint_for(base_url))
    path = catalogue.path[:-len("/models")]
    original_path = urlsplit(base_url.strip()).path.rstrip("/")
    if protocol == "openai":
        responses = original_path.endswith("/responses")
        path += "/responses" if responses else "/chat/completions"
        if original_path.endswith(("/responses", "/chat/completions")):
            path = original_path
        wire_api = "openai-responses" if responses else "openai-completions"
    elif protocol == "anthropic":
        # Only DeepSeek's official Anthropic route needs this special prefix.
        if catalogue.hostname == "api.deepseek.com" and path in {"", "/v1"}:
            path = "/anthropic"
        if not path.endswith("/v1"):
            path += "/v1"
        path += "/messages"
        if original_path.endswith("/messages"):
            path = original_path
        wire_api = "anthropic-messages"
    else:
        raise CatalogueError("protocol", "不支持的接口协议。")
    return urlunsplit((catalogue.scheme, catalogue.netloc, path, "", "")), wire_api


class ProviderBridge:
    def __init__(self, request):
        self.request = request
        self.token = secrets.token_urlsafe(32)
        self.error = None
        self.deadline = time.monotonic() + min(request.get("timeout", 120), 120)
        self.path = {"openai-completions": "/v1/chat/completions", "openai-responses": "/v1/responses",
                     "anthropic-messages": "/v1/messages"}[request["wireApi"]]
        self.connection = None
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def do_POST(self):
                presented = (self.headers.get("x-api-key", "") if request["protocol"] == "anthropic"
                             else self.headers.get("Authorization", "").removeprefix("Bearer "))
                if self.path.split("?")[0] != bridge.path or not hmac.compare_digest(presented, bridge.token):
                    self.send_error(403)
                    return
                sent_headers = False
                try:
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= MAX_REQUEST:
                        raise CatalogueError("request", "Invalid request")
                    self.connection.settimeout(10)
                    body = self.rfile.read(size)
                    value = json.loads(body)
                    if not isinstance(value, dict) or value.get("tools"):
                        raise CatalogueError("request", "Tools are unavailable")
                    connection, response = bridge.open_upstream(body)
                    self.send_response(200)
                    self.send_header("Content-Type", response.getheader("Content-Type", "text/event-stream"))
                    self.send_header("Connection", "close")
                    self.end_headers()
                    sent_headers = True
                    length = 0
                    while True:
                        remaining = min(30, bridge.deadline - time.monotonic())
                        if remaining <= 0:
                            raise CatalogueError("timeout", "Request timed out")
                        if connection.sock is not None:
                            connection.sock.settimeout(remaining)
                        chunk = response.read1(min(65536, MAX_BODY + 1 - length))
                        if not chunk:
                            break
                        length += len(chunk)
                        if length > MAX_BODY:
                            raise CatalogueError("too_large", "Response is too large")
                        self.wfile.write(chunk)
                        self.wfile.flush()
                except Exception as error:
                    bridge.error = bridge.classify(error)
                    if not sent_headers:
                        try:
                            self.send_error(502, "Configured provider unavailable")
                        except OSError:
                            pass
                finally:
                    if bridge.connection:
                        bridge.connection.close()
                    self.close_connection = True

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=0.05), daemon=True)

    @staticmethod
    def classify(error):
        if isinstance(error, CatalogueError):
            return error.code
        if isinstance(error, (TimeoutError, socket.timeout)):
            return "timeout"
        if isinstance(error, ssl.SSLError):
            return "tls"
        return "connection"

    def open_upstream(self, body):
        parsed = urlsplit(self.request["endpoint"])
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = target_addresses(parsed.hostname, port)
        remaining = min(30, self.deadline - time.monotonic())
        if remaining <= 0:
            raise CatalogueError("timeout", "Request timed out")
        connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_type(parsed.hostname, port, timeout=remaining)
        self.connection = connection

        def connect_address(_address, timeout=remaining, source_address=None):
            last = None
            for address in addresses:
                try:
                    return socket.create_connection((address, port), timeout, source_address)
                except OSError as error:
                    last = error
            raise last or OSError("No address")

        # Host header, SNI and TLS certificate checks use the original hostname;
        # the socket uses only the already validated address, with no relookup.
        connection._create_connection = connect_address
        headers = {"Content-Type": "application/json", "Accept": "text/event-stream, application/json",
                   "User-Agent": "InfiniteFlow-DSH/1"}
        key = self.request["apiKey"]
        if self.request["protocol"] == "anthropic":
            headers["anthropic-version"] = "2023-06-01"
            if key:
                headers["x-api-key"] = key
        elif key:
            headers["Authorization"] = "Bearer " + key
        connection.request("POST", parsed.path, body=body, headers=headers)
        response = connection.getresponse()
        if 300 <= response.status < 400:
            raise CatalogueError("redirect", "Redirect refused")
        if response.status != 200:
            raise CatalogueError("upstream", "Provider request failed")
        return connection, response

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        if self.connection:
            self.connection.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
