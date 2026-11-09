"""Exercise the optional Core route without contacting the official CDN."""
from functools import partial
import http.client
from pathlib import Path
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import serve


class QuietHandler(serve.AssetHandler):
    def log_message(self, *_):
        pass


class RuntimeRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder = Path(__file__).resolve().parents[1] / "loading-page"
        cls.server = serve.GamePreviewServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(folder)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, path):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_get_and_head_preserve_script_bytes(self):
        data = b"/* copyright notice */\nwindow.testRuntime = true;"
        cache = SimpleNamespace(read_bytes=lambda: data)
        with patch.object(serve, "live2d_runtime_path", return_value=cache):
            status, headers, body = self.request("GET", serve.RUNTIME_ROUTE + "?v=test")
            self.assertEqual((status, body), (200, data))
            self.assertIn("application/javascript", headers["Content-Type"])
            self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
            status, headers, body = self.request("HEAD", serve.RUNTIME_ROUTE)
            self.assertEqual((status, body), (200, b""))
            self.assertEqual(int(headers["Content-Length"]), len(data))

    def test_offline_runtime_returns_retryable_error_without_details(self):
        with patch.object(serve, "live2d_runtime_path", side_effect=RuntimeError("private local path")):
            status, headers, body = self.request("GET", serve.RUNTIME_ROUTE)
        self.assertEqual(status, 503)
        self.assertEqual(headers["Retry-After"], "5")
        self.assertNotIn(b"private local path", body)

    def test_other_paths_cannot_choose_a_cached_file(self):
        with patch.object(serve, "live2d_runtime_path") as loader:
            status, _, _ = self.request("GET", "/runtime/other-file.js")
            self.assertEqual(status, 404)
            loader.assert_not_called()


if __name__ == "__main__":
    unittest.main()
