"""Destination pinning and credential boundaries of the per-turn relay."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import http.client
import json
import socket
import ssl
import sys
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import dsh_transport
import models_api


def request(endpoint="https://gateway.example/v1/chat/completions"):
    return {"endpoint": endpoint, "protocol": "openai", "wireApi": "openai-completions",
            "apiKey": "test-only-secret", "timeout": 10}


class TransportTests(unittest.TestCase):
    def test_redirect_is_not_followed_or_forwarded_to_sdk(self):
        calls = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                self.rfile.read(int(self.headers["Content-Length"]))
                calls.append((self.path, self.headers.get("Authorization")))
                self.send_response(307)
                self.send_header("Location", "/second-target-must-not-be-called")
                self.send_header("Content-Length", "0")
                self.end_headers()
        upstream = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        try:
            with dsh_transport.ProviderBridge(request(f"http://127.0.0.1:{upstream.server_port}/v1/chat/completions")) as bridge:
                connection = http.client.HTTPConnection("127.0.0.1", bridge.server.server_port, timeout=5)
                body = json.dumps({"model": "fake", "messages": [{"role": "user", "content": "hello"}]})
                connection.request("POST", bridge.path, body, {"Authorization": "Bearer " + bridge.token, "Content-Type": "application/json"})
                response = connection.getresponse()
                self.assertEqual(response.status, 502)
                self.assertIsNone(response.getheader("Location"))
                self.assertNotIn(b"test-only-secret", response.read())
                connection.close()
                self.assertEqual(bridge.error, "redirect")
            self.assertEqual(calls, [("/v1/chat/completions", "Bearer test-only-secret")])
        finally:
            upstream.shutdown()
            upstream.server_close()
            thread.join()

    def test_dns_resolving_to_private_addresses_is_rejected_before_connection(self):
        with dsh_transport.ProviderBridge(request()) as bridge:
            for address in ["10.0.0.9", "127.0.0.1", "169.254.169.254"]:
                answers = [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))]
                with self.subTest(address=address), patch.object(models_api.socket, "getaddrinfo", return_value=answers), \
                     patch.object(dsh_transport.http.client, "HTTPSConnection") as connect:
                    with self.assertRaises(models_api.CatalogueError) as error:
                        bridge.open_upstream(b"{}")
                    self.assertEqual(error.exception.code, "address")
                    connect.assert_not_called()

    def test_mixed_fake_ip_and_private_dns_is_rejected_before_connection(self):
        with dsh_transport.ProviderBridge(request()) as bridge:
            for address in ("10.0.0.9", "127.0.0.1", "169.254.169.254", "198.19.0.1"):
                answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 443))
                           for ip in ("198.18.0.10", address)]
                with self.subTest(address=address), patch.object(socket, "getaddrinfo", return_value=answers), \
                     patch.object(dsh_transport.http.client, "HTTPSConnection") as connect:
                    with self.assertRaises(models_api.CatalogueError) as error:
                        bridge.open_upstream(b"{}")
                    self.assertEqual(error.exception.code, "address")
                    connect.assert_not_called()

    def test_tls_keeps_original_hostname_but_socket_pins_validated_ip(self):
        for address in ("93.184.216.34", "198.18.0.10"):
            connection = Mock()
            connection.getresponse.return_value = Mock(status=200)
            answers = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 443))]
            with self.subTest(address=address), dsh_transport.ProviderBridge(request()) as bridge, \
                 patch.object(socket, "getaddrinfo", return_value=answers) as resolve, \
                 patch.object(dsh_transport.http.client, "HTTPSConnection", return_value=connection) as create, \
                 patch.object(socket, "create_connection") as socket_connect:
                bridge.open_upstream(b"{}")
                self.assertEqual(create.call_args.args, ("gateway.example", 443))
                self.assertNotIn("context", create.call_args.kwargs)
                connection._create_connection(("gateway.example", 443))
                self.assertEqual(socket_connect.call_args.args[0], (address, 443))
                resolve.assert_called_once_with("gateway.example", 443, type=socket.SOCK_STREAM)
                self.assertEqual(connection.request.call_args.kwargs["headers"]["Authorization"], "Bearer test-only-secret")
        self.assertEqual(dsh_transport.ProviderBridge.classify(ssl.SSLError("untrusted cert")), "tls")

    def test_fake_ip_transport_reaches_socket_with_original_host(self):
        received, domain_lookups, destinations = [], [], []
        fake_ip = "198.18.0.10"
        real_dns, real_connect = socket.getaddrinfo, socket.create_connection
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                received.append((self.path, self.headers.get("Host"), body))
                self.send_response(200)
                self.send_header("Content-Length", "2")
                self.end_headers()
                self.wfile.write(b"{}")
        upstream = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=upstream.serve_forever, daemon=True)
        thread.start()
        def resolve(host, port, *args, **kwargs):
            if host == "gateway.example":
                domain_lookups.append((host, port))
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (fake_ip, port))]
            return real_dns(host, port, *args, **kwargs)
        def connect(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
            destinations.append(address)
            self.assertEqual(address[0], fake_ip)
            return real_connect(("127.0.0.1", address[1]), timeout, source_address)
        port = upstream.server_port
        try:
            with dsh_transport.ProviderBridge(request(f"http://gateway.example:{port}/v1/chat/completions")) as bridge, \
                 patch.object(socket, "getaddrinfo", side_effect=resolve), \
                 patch.object(socket, "create_connection", side_effect=connect):
                connection, response = bridge.open_upstream(b'{"model":"test"}')
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b"{}")
            self.assertEqual(domain_lookups, [("gateway.example", port)])
            self.assertEqual(destinations, [(fake_ip, port)])
            self.assertEqual(received, [("/v1/chat/completions", f"gateway.example:{port}", b'{"model":"test"}')])
        finally:
            upstream.shutdown()
            upstream.server_close()
            thread.join()

    def test_relay_requires_ephemeral_auth_and_does_not_accept_tools(self):
        with dsh_transport.ProviderBridge(request()) as bridge, patch.object(bridge, "open_upstream") as upstream:
            for auth, body, expected in [("", {}, 403), ("Bearer " + bridge.token, {"tools": [{"name": "shell"}]}, 502)]:
                connection = http.client.HTTPConnection("127.0.0.1", bridge.server.server_port, timeout=5)
                connection.request("POST", bridge.path, json.dumps(body), {"Authorization": auth})
                response = connection.getresponse()
                self.assertEqual(response.status, expected)
                response.read()
                connection.close()
            upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
