"""The DSH endpoint must use the same local-origin boundary as settings."""
from functools import partial
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import serve
from dsh_api import ChatError


class QuietHandler(serve.AssetHandler):
    def log_message(self, *_):
        pass


class ChatRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.GamePreviewServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(Path(__file__).resolve().parents[1] / "loading-page")))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, origin=None, payload=None):
        url = f"http://127.0.0.1:{self.server.server_port}"
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            connection.request("POST", "/api/chat", body=json.dumps(payload or {"message": "你好", "protocol": "openai"}, ensure_ascii=False).encode("utf-8"),
                               headers={"Content-Type": "application/json", "Origin": origin or url})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            connection.close()

    def test_custom_protocol_payload_reaches_bridge(self):
        result = {"reply": "我在。", "sessionId": "0" * 32, "provider": "dsh"}
        with patch.object(serve, "chat", return_value=result) as bridge:
            status, headers, body = self.post()
        self.assertEqual((status, body), (200, result))
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(bridge.call_args.args[0], {"message": "你好", "protocol": "openai"})

    def test_cross_origin_request_never_calls_bridge(self):
        with patch.object(serve, "chat") as bridge:
            status, _, body = self.post("https://unrelated.example")
        self.assertEqual((status, body["code"]), (403, "origin"))
        bridge.assert_not_called()

    def test_saved_unicode_history_larger_than_old_limit_reaches_bridge(self):
        payload = {"message": "继续", "protocol": "openai", "history": [
            {"role": "user", "content": "问题" * 2000},
            {"role": "assistant", "content": "答复" * 6000},
        ]}
        result = {"reply": "继续了。", "sessionId": "1" * 32, "provider": "dsh"}
        with patch.object(serve, "chat", return_value=result) as bridge:
            status, _, body = self.post(payload=payload)
        self.assertEqual((status, body), (200, result))
        self.assertEqual(bridge.call_args.args[0], payload)

    def test_actionable_bridge_failure_is_returned(self):
        with patch.object(serve, "chat", side_effect=ChatError("timeout", "回应超时，请重试。", 504)):
            status, _, body = self.post()
        self.assertEqual((status, body), (504, {"error": "回应超时，请重试。", "code": "timeout"}))

    def test_stream_response_sends_progress_and_final_result(self):
        def stream(payload, on_progress):
            on_progress({"type": "thinking", "delta": "整理故事"})
            on_progress({"type": "text", "delta": "我在。"})
            return {"reply": "我在。", "sessionId": "0" * 32, "provider": "dsh"}
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            with patch.object(serve, "chat", side_effect=stream):
                connection.request("POST", "/api/chat", body=b'{"message":"hi"}', headers={
                    "Content-Type": "application/json", "Accept": "application/x-ndjson",
                    "Origin": f"http://127.0.0.1:{self.server.server_port}"})
                response = connection.getresponse()
                self.assertEqual(response.status, 200)
                self.assertIn("application/x-ndjson", response.getheader("Content-Type"))
                self.assertEqual(response.getheader("X-Accel-Buffering"), "no")
                events = [json.loads(line) for line in response.read().splitlines()]
                self.assertEqual([event["type"] for event in events], ["thinking", "text", "done"])
                self.assertEqual(events[-1]["reply"], "我在。")
        finally:
            connection.close()

    def test_stream_error_is_a_single_terminal_event(self):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        try:
            with patch.object(serve, "chat", side_effect=ChatError("timeout", "回应超时，请重试。", 504)):
                connection.request("POST", "/api/chat", body=b'{"message":"hi"}', headers={
                    "Content-Type": "application/json", "Accept": "application/x-ndjson",
                    "Origin": f"http://127.0.0.1:{self.server.server_port}"})
                response = connection.getresponse()
                self.assertEqual([json.loads(line) for line in response.read().splitlines()],
                                 [{"type": "error", "error": "回应超时，请重试。", "code": "timeout"}])
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
