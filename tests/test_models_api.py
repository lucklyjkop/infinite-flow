"""Network and request-boundary regression tests; only disposable local fake keys."""
from contextlib import contextmanager, redirect_stderr
from functools import partial
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO, StringIO
from pathlib import Path
import http.client
import json
import socket
import sys
import threading
import time
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import models_api
import serve

FAKE_KEY = "local-test-credential-only"


@contextmanager
def upstream(responder):
    requests = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            requests.append({"path": self.path, "headers": dict(self.headers)})
            status, body, headers = responder(self.path)
            raw = body if isinstance(body, bytes) else json.dumps(body).encode()
            try:
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def fetch(base, protocol="openai", **kwargs):
    return models_api.fetch_catalogue({"baseUrl": base, "protocol": protocol, "apiKey": FAKE_KEY, **kwargs})


class CatalogueTests(unittest.TestCase):
    def test_openai_headers_endpoint_and_normalized_ids(self):
        data = {"data": [{"id": "model-a", "secret": FAKE_KEY}, {"id": "model-b"}, {"id": "model-a"},
                         {"id": FAKE_KEY}, {"id": "bad\nvalue"}, {"id": ""}, {"name": "invalid"}, "invalid"]}
        with upstream(lambda _: (200, data, {})) as (url, requests):
            result = fetch(url + "/v1/chat/completions")
        self.assertEqual(result, {"models": [{"id": "model-a"}, {"id": "model-b"}], "count": 2, "truncated": False})
        self.assertEqual(requests[0]["path"], "/v1/models")
        self.assertEqual(requests[0]["headers"]["Authorization"], "Bearer " + FAKE_KEY)
        self.assertNotIn(FAKE_KEY, json.dumps(result))

    def test_anthropic_pagination_and_gateway_headers(self):
        def respond(path):
            if "after_id=" in path:
                return 200, {"data": [{"id": "claude-b"}], "has_more": False}, {}
            return 200, {"data": [{"id": "claude-a"}], "has_more": True, "last_id": "cursor/a"}, {}
        with upstream(respond) as (url, requests):
            result = fetch(url + "/v1", "anthropic")
        self.assertEqual(result["count"], 2)
        self.assertEqual(requests[1]["path"], "/v1/models?limit=1000&after_id=cursor%2Fa")
        self.assertEqual(requests[0]["headers"]["x-api-key"], FAKE_KEY)
        self.assertEqual(requests[0]["headers"]["anthropic-version"], "2023-06-01")
        self.assertNotIn("Authorization", requests[0]["headers"])

    def test_official_anthropic_version(self):
        with patch.object(models_api, "request_page", return_value={"data": []}) as request:
            fetch("https://api.anthropic.com/v1", "anthropic")
        self.assertEqual(request.call_args.args[1]["anthropic-version"], "2026-10-21")

    def test_upstream_errors_are_static_and_never_echo_credentials(self):
        for status in (401, 403, 404, 429, 500):
            with self.subTest(status=status), upstream(lambda _: (status, {"error": FAKE_KEY}, {})) as (url, _):
                with self.assertRaises(models_api.CatalogueError) as error:
                    fetch(url)
                self.assertEqual(error.exception.code, f"upstream_{status}")
                self.assertNotIn(FAKE_KEY, str(error.exception))

    def test_redirect_is_not_followed(self):
        with upstream(lambda _: (302, b"", {"Location": "/credential-sink"})) as (url, requests):
            with self.assertRaises(models_api.CatalogueError) as error:
                fetch(url)
        self.assertEqual(error.exception.code, "redirect")
        self.assertEqual(len(requests), 1)

    def test_empty_invalid_and_oversized_responses(self):
        for body, code in ((b"not-json", "format"), ({"models": []}, "format"), (b"x" * 129, "too_large")):
            with self.subTest(code=code), patch.object(models_api, "MAX_BODY", 128), upstream(lambda _: (200, body, {})) as (url, _):
                with self.assertRaises(models_api.CatalogueError) as error:
                    fetch(url)
                self.assertEqual(error.exception.code, code)
        with upstream(lambda _: (200, {"data": []}, {})) as (url, _):
            self.assertEqual(fetch(url)["models"], [])

    def test_timeout(self):
        def delayed(_):
            time.sleep(.18)
            return 200, {"data": []}, {}
        with patch.object(models_api, "REQUEST_TIMEOUT", .04), upstream(delayed) as (url, _):
            with self.assertRaises(models_api.CatalogueError) as error:
                fetch(url)
        self.assertEqual(error.exception.code, "timeout")

    def test_pagination_loop_and_limit_are_bounded(self):
        page = {"data": [{"id": "a"}], "has_more": True, "last_id": "same"}
        with patch.object(models_api, "request_page", return_value=page) as request:
            result = fetch("https://example.com/v1", "anthropic")
        self.assertEqual(request.call_count, 2)
        self.assertTrue(result["truncated"])
        with patch.object(models_api, "MAX_MODELS", 2), patch.object(models_api, "request_page", return_value={"data": [{"id": "a"}, {"id": "b"}, {"id": "c"}]}):
            result = fetch("https://example.com/v1")
        self.assertEqual(result["count"], 2)
        self.assertTrue(result["truncated"])

    def test_endpoint_validation(self):
        for url in ("file:///etc/passwd", "https://user:pass@example.com", "https://example.com/?token=x", "https://example.com/#x", "https://example.com:99999", "https://example.com/../v1", "https://example.com/%252e%252e/v1", "https://example.com/\\v1", "https://example.com/\nv1"):
            with self.subTest(url=url), self.assertRaises(models_api.CatalogueError):
                models_api.endpoint_for(url)
        self.assertEqual(models_api.endpoint_for("https://example.com/"), "https://example.com/v1/models")
        self.assertEqual(models_api.endpoint_for("https://example.com/api/models/"), "https://example.com/api/models")
        for payload in ({"protocol": []}, {"protocol": "openai", "baseUrl": "https://example.com", "apiKey": "x\ny"}):
            with self.assertRaises(models_api.CatalogueError):
                models_api.fetch_catalogue(payload)

    def test_address_validation_explicit_loopback_only(self):
        for ip in ("169.254.169.254", "10.0.0.1", "127.0.0.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "100.100.100.200"):
            answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 80))]
            with self.subTest(ip=ip), patch.object(socket, "getaddrinfo", return_value=answer), self.assertRaises(models_api.CatalogueError):
                models_api.target_addresses("api.evil.example", 80)
        with patch.object(socket, "getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]):
            self.assertEqual(models_api.target_addresses("localhost", 80), ["127.0.0.1"])

    def test_proxy_fake_ip_pool_is_only_allowed_for_resolved_domains(self):
        for ip in ("198.18.0.1", "198.18.255.254"):
            answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]
            with self.subTest(ip=ip), patch.object(socket, "getaddrinfo", return_value=answers):
                self.assertEqual(models_api.target_addresses("gateway.example", 443), [ip])
                for host in (ip, "localhost"):
                    with self.subTest(host=host), self.assertRaises(models_api.CatalogueError):
                        models_api.target_addresses(host, 443)

    def test_fake_ip_exception_does_not_expand_to_other_reserved_ranges(self):
        for ip in ("198.19.0.1", "192.0.2.1", "0.0.0.0", "169.254.169.254", "100.100.100.200"):
            answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))]
            with self.subTest(ip=ip), patch.object(socket, "getaddrinfo", return_value=answers), self.assertRaises(models_api.CatalogueError):
                models_api.target_addresses("gateway.example", 443)

    def test_mixed_fake_ip_and_reserved_dns_is_rejected_before_connection(self):
        for ip in ("10.0.0.1", "127.0.0.1", "169.254.169.254", "::1", "::ffff:127.0.0.1"):
            answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))
                       for address in ("198.18.0.11", ip)]
            with self.subTest(ip=ip), patch.object(socket, "getaddrinfo", return_value=answers), \
                 patch.object(models_api.http.client, "HTTPSConnection") as connection:
                with self.assertRaises(models_api.CatalogueError):
                    fetch("https://gateway.example/v1")
                connection.assert_not_called()

    def test_catalogue_connects_to_fake_ip_with_original_host_and_no_domain_relookup(self):
        real_dns, real_connect = socket.getaddrinfo, socket.create_connection
        domain_lookups, destinations = [], []
        fake_ip = "198.18.0.11"
        def resolve(host, port, *args, **kwargs):
            if host == "gateway.example":
                domain_lookups.append((host, port))
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (fake_ip, port))]
            return real_dns(host, port, *args, **kwargs)
        def connect(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
            destinations.append(address)
            self.assertEqual(address[0], fake_ip)
            return real_connect(("127.0.0.1", address[1]), timeout, source_address)
        with upstream(lambda _: (200, {"data": [{"id": "proxy-model"}]}, {})) as (url, requests):
            port = int(url.rsplit(":", 1)[1])
            with patch.object(socket, "getaddrinfo", side_effect=resolve), patch.object(socket, "create_connection", side_effect=connect):
                result = fetch(f"http://gateway.example:{port}/v1")
        self.assertEqual(result["models"], [{"id": "proxy-model"}])
        self.assertEqual(domain_lookups, [("gateway.example", port)])
        self.assertEqual(destinations, [(fake_ip, port)])
        self.assertEqual(requests[0]["headers"]["Host"], f"gateway.example:{port}")
        self.assertEqual(requests[0]["headers"]["Authorization"], "Bearer " + FAKE_KEY)

    def test_fake_ip_catalogue_keeps_tls_hostname_and_default_certificate_validation(self):
        connection, response = Mock(), Mock(status=200)
        response.read1.side_effect = [b'{"data":[]}', b""]
        connection.getresponse.return_value = response
        answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("198.18.0.11", 443))]
        with patch.object(socket, "getaddrinfo", return_value=answers) as resolve, \
             patch.object(models_api.http.client, "HTTPSConnection", return_value=connection) as create, \
             patch.object(socket, "create_connection") as connect:
            self.assertEqual(fetch("https://gateway.example/v1")["models"], [])
            self.assertEqual(create.call_args.args, ("gateway.example", 443))
            self.assertNotIn("context", create.call_args.kwargs)
            connection._create_connection(("gateway.example", 443))
            self.assertEqual(connect.call_args.args[0], ("198.18.0.11", 443))
            resolve.assert_called_once_with("gateway.example", 443, type=socket.SOCK_STREAM)


class PreviewBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.logs = StringIO()
        cls.log_context = redirect_stderr(cls.logs)
        cls.log_context.__enter__()
        cls.server = serve.GamePreviewServer(("127.0.0.1", 0), partial(serve.AssetHandler, directory=str(Path(__file__).resolve().parents[1] / "loading-page")))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.log_context.__exit__(None, None, None)

    def post(self, payload, **headers):
        client = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        host = f"127.0.0.1:{self.server.server_port}"
        initial = {"Content-Type": "application/json", "Origin": "http://" + host, "Sec-Fetch-Site": "same-origin"}
        initial.update(headers)
        try:
            client.request("POST", "/api/models", body=json.dumps(payload), headers=initial)
            response = client.getresponse()
            return response.status, dict(response.headers), json.loads(response.read())
        finally:
            client.close()

    def test_full_proxy_request_and_no_secret_logging(self):
        with upstream(lambda _: (200, {"data": [{"id": "model-a"}]}, {})) as (url, requests):
            status, headers, body = self.post({"baseUrl": url, "protocol": "openai", "apiKey": FAKE_KEY})
        self.assertEqual(status, 200)
        self.assertEqual(body["models"], [{"id": "model-a"}])
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(len(requests), 1)
        self.assertNotIn(FAKE_KEY, self.logs.getvalue())

    def test_origin_and_body_boundaries(self):
        for header in ({"Origin": "https://unrelated.example"}, {"Origin": ""}, {"Origin": "http://"}, {"Origin": "http://[invalid"}, {"Sec-Fetch-Site": "cross-site"}):
            with self.subTest(header=header), patch.object(serve, "fetch_catalogue") as fetch_mock:
                self.assertEqual(self.post({}, **header)[0], 403)
                fetch_mock.assert_not_called()
        self.assertEqual(self.post({}, **{"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.post({"apiKey": "x" * 17000})[0], 413)

    def test_rejected_split_post_body_returns_json(self):
        # HTTP clients may send headers and body in separate TCP writes. Closing
        # while the body is arriving can otherwise reset the response on Windows.
        for _ in range(12):
            with socket.create_connection(("127.0.0.1", self.server.server_port), timeout=2) as client:
                body = b'{"apiKey":"local-test-credential-only"}'
                headers = (f"POST /api/models HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\n"
                           "Origin: https://unrelated.example\r\nContent-Type: application/json\r\n"
                           f"Content-Length: {len(body)}\r\n\r\n").encode()
                client.sendall(headers)
                time.sleep(.015)
                client.sendall(body)
                response = http.client.HTTPResponse(client)
                response.begin()
                self.assertEqual(response.status, 403)
                self.assertEqual(response.getheader("Connection"), "close")
                self.assertEqual(json.loads(response.read())["code"], "origin")

    def test_rejection_drain_is_bounded_by_bytes(self):
        handler = object.__new__(serve.AssetHandler)
        handler.headers = {"Content-Length": "999999999"}
        handler.rfile = BytesIO(b"x" * (handler.rejection_drain_limit + 4096))
        with socket.socket() as client:
            handler.connection = client
            handler.drain_rejected_body()
        self.assertEqual(handler.rfile.tell(), handler.rejection_drain_limit)

    def test_rejection_drain_is_bounded_by_time(self):
        with socket.create_connection(("127.0.0.1", self.server.server_port), timeout=2) as client:
            request = (f"POST /api/models HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\n"
                       "Origin: https://unrelated.example\r\nContent-Length: 999999999\r\n\r\n").encode()
            before = time.monotonic()
            client.sendall(request)
            response = http.client.HTTPResponse(client)
            response.begin()
            self.assertEqual(response.status, 403)
            self.assertEqual(json.loads(response.read())["code"], "origin")
            self.assertLess(time.monotonic() - before, 1.5)


if __name__ == "__main__":
    unittest.main()
