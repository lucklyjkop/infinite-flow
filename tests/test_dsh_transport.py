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

    def test_tls_keeps_original_hostname_but_socket_pins_validated_ip(self):
        connection = Mock()
        connection.getresponse.return_value = Mock(status=200)
        with dsh_transport.ProviderBridge(request()) as bridge, \
             patch.object(dsh_transport, "target_addresses", return_value=["93.184.216.34"]) as resolve, \
             patch.object(dsh_transport.http.client, "HTTPSConnection", return_value=connection) as create, \
             patch.object(dsh_transport.socket, "create_connection") as socket_connect:
            bridge.open_upstream(b"{}")
            resolve.assert_called_once_with("gateway.example", 443)
            self.assertEqual(create.call_args.args, ("gateway.example", 443))
            self.assertNotIn("context", create.call_args.kwargs)
            connection._create_connection(("gateway.example", 443))
            self.assertEqual(socket_connect.call_args.args[0], ("93.184.216.34", 443))
            self.assertEqual(connection.request.call_args.kwargs["headers"]["Authorization"], "Bearer test-only-secret")
        self.assertEqual(dsh_transport.ProviderBridge.classify(ssl.SSLError("untrusted cert")), "tls")

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
