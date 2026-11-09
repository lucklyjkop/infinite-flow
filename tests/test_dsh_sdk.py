"""Optional real-SDK smoke test against a local fake Messages provider only."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import sys
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import dsh_api


@unittest.skipUnless(dsh_api.runtime_python().is_file(), "Optional DSH runtime is not installed")
class RealSdkTests(unittest.TestCase):
    def test_native_openai_chat_completions_and_responses_custom_gateways(self):
        received = []
        reply = "红线在，我会陪你。"
        model = "custom-family/game-model"
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                received.append((self.path, dict(self.headers), value))
                if self.path.endswith("/chat/completions"):
                    chunks = [
                        {"id": "chat-test", "object": "chat.completion.chunk", "created": 1, "model": model,
                         "choices": [{"index": 0, "delta": {"role": "assistant", "content": reply}, "finish_reason": None}]},
                        {"id": "chat-test", "object": "chat.completion.chunk", "created": 1, "model": model,
                         "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
                         "usage": {"prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20}},
                    ]
                    data = "".join("data: " + json.dumps(item, ensure_ascii=False) + "\n\n" for item in chunks) + "data: [DONE]\n\n"
                else:
                    response = {"id": "resp-test", "object": "response", "created_at": 1, "status": "in_progress", "model": model, "output": []}
                    item = {"id": "msg-test", "type": "message", "role": "assistant", "status": "in_progress", "content": []}
                    text = {"type": "output_text", "text": reply, "annotations": []}
                    completed_item = {**item, "status": "completed", "content": [text]}
                    chunks = [
                        {"type": "response.created", "response": response},
                        {"type": "response.output_item.added", "output_index": 0, "item": item},
                        {"type": "response.content_part.added", "item_id": "msg-test", "output_index": 0, "content_index": 0,
                         "part": {"type": "output_text", "text": "", "annotations": []}},
                        {"type": "response.output_text.delta", "item_id": "msg-test", "output_index": 0, "content_index": 0, "delta": reply},
                        {"type": "response.output_text.done", "item_id": "msg-test", "output_index": 0, "content_index": 0, "text": reply},
                        {"type": "response.content_part.done", "item_id": "msg-test", "output_index": 0, "content_index": 0, "part": text},
                        {"type": "response.output_item.done", "output_index": 0, "item": completed_item},
                        {"type": "response.completed", "response": {**response, "status": "completed", "output": [completed_item],
                         "usage": {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20,
                                   "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}}}},
                    ]
                    data = "".join("event: " + item["type"] + "\ndata: " + json.dumps(item, ensure_ascii=False) + "\n\n" for item in chunks)
                encoded = data.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for suffix in ["/custom/v1", "/custom/v1/responses"]:
                with self.subTest(suffix=suffix):
                    value = dsh_api.chat({"message": "你好", "apiKey": "sk-proj-test-only", "model": model,
                                          "protocol": "openai", "baseUrl": f"http://127.0.0.1:{server.server_port}" + suffix})
                    self.assertEqual(value["reply"], reply)
            self.assertEqual([r[0] for r in received], ["/custom/v1/chat/completions", "/custom/v1/responses"])
            for path, headers, body in received:
                self.assertEqual(headers["Authorization"], "Bearer sk-proj-test-only")
                self.assertNotIn("x-api-key", headers)
                self.assertEqual(body["model"], model)
                self.assertFalse(body.get("tools"))
                self.assertTrue(body["stream"])
                self.assertNotIn("dsh_session_log", body)
            self.assertEqual(received[0][2]["max_tokens"], 1200)
            self.assertEqual(received[1][2]["max_output_tokens"], 1200)
            self.assertIn("messages", received[0][2])
            self.assertIn("input", received[1][2])
            self.assertNotIn("messages", received[1][2])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_role_chat_has_no_tools_or_log_upload_and_retains_completed_context(self):
        received = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                value = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                received.append((self.path, value, dict(self.headers)))
                events = [
                    {"type": "message_start", "message": {"id": "local-test", "type": "message", "role": "assistant",
                     "content": [], "model": "deepseek-flash", "stop_reason": None, "stop_sequence": None,
                     "usage": {"input_tokens": 10, "output_tokens": 0}}},
                    {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
                    {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "红线在，我会陪你。"}},
                    {"type": "content_block_stop", "index": 0},
                    {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 10}},
                    {"type": "message_stop"},
                ]
                data = "".join("event: " + item["type"] + "\ndata: " + json.dumps(item, ensure_ascii=False) + "\n\n" for item in events).encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            payload = {"message": "你好", "apiKey": "test-only-not-a-real-credential", "model": "deepseek-flash",
                       "protocol": "anthropic", "baseUrl": f"http://127.0.0.1:{server.server_port}/anthropic"}
            first = dsh_api.chat(payload)
            second = dsh_api.chat({**payload, "message": "还记得刚才吗？", "sessionId": first["sessionId"]})
            self.assertEqual(first["reply"], "红线在，我会陪你。")
            self.assertEqual(second["sessionId"], first["sessionId"])
            self.assertEqual(len(received), 2)
            for path, body, headers in received:
                self.assertEqual(path, "/anthropic/v1/messages")
                self.assertFalse(body.get("tools"))
                self.assertNotIn("dsh_session_log", body)
                self.assertNotIn("dsh_plugin_packages", body)
                self.assertEqual(headers["x-api-key"], "test-only-not-a-real-credential")
                self.assertEqual(headers["anthropic-version"], "2023-06-01")
                self.assertNotEqual(body.get("thinking", {}).get("type"), "enabled")
                self.assertEqual(body["max_tokens"], 1200)
            self.assertIn("红线在，我会陪你。", json.dumps(received[-1][1]["messages"], ensure_ascii=False))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
