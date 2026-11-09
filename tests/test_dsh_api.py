"""Chat boundary checks run without installing the optional SDK or making calls."""
from pathlib import Path
import json
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import dsh_api

KEY = "test-only-not-a-real-credential"


class DshChatTests(unittest.TestCase):
    def setUp(self):
        dsh_api._active.clear()
        dsh_api._history.clear()
        self.payload = {"message": "你好", "apiKey": KEY, "model": "deepseek-flash",
                        "baseUrl": "https://api.deepseek.com/v1"}

    def test_openai_stays_openai_and_anthropic_uses_official_compat_prefix(self):
        value = dsh_api.validate(self.payload)
        self.assertEqual(value["endpoint"], "https://api.deepseek.com/v1/chat/completions")
        self.assertEqual(value["wireApi"], "openai-completions")
        self.assertRegex(value["sessionId"], r"^[0-9a-f]{32}$")
        value = dsh_api.validate({**self.payload, "protocol": "anthropic"})
        self.assertEqual(value["endpoint"], "https://api.deepseek.com/anthropic/v1/messages")
        self.assertEqual(value["wireApi"], "anthropic-messages")

    def test_custom_endpoints_and_provider_neutral_credentials(self):
        for base, protocol, expected, wire in [
            ("https://gateway.example/v1", "openai", "/v1/chat/completions", "openai-completions"),
            ("https://gateway.example/v1/responses", "openai", "/v1/responses", "openai-responses"),
            ("https://gateway.example/custom/responses", "openai", "/custom/responses", "openai-responses"),
            ("https://gateway.example/chat/completions", "openai", "/chat/completions", "openai-completions"),
            ("https://gateway.example/anthropic", "anthropic", "/anthropic/v1/messages", "anthropic-messages"),
            ("http://localhost:8000/v1", "openai", "/v1/chat/completions", "openai-completions"),
            ("http://127.0.0.1:8000/v1/messages", "anthropic", "/v1/messages", "anthropic-messages"),
        ]:
            with self.subTest(base=base):
                value = dsh_api.validate({**self.payload, "baseUrl": base, "protocol": protocol, "apiKey": "sk-proj-test-only"})
                self.assertTrue(value["endpoint"].endswith(expected))
                self.assertEqual(value["wireApi"], wire)
        self.assertEqual(dsh_api.validate({**self.payload, "apiKey": ""})["apiKey"], "")

    def test_rejects_invalid_message_session_protocol_and_malformed_destinations(self):
        for extra in [{"message": " "}, {"message": "x" * 4001}, {"sessionId": "../../other"},
                      {"baseUrl": "https://name:password@gateway.example/v1"}, {"baseUrl": "file:///tmp/api"},
                      {"baseUrl": "https://gateway.example/v1?secret=query"}, {"protocol": "dsh"},
                      {"apiKey": "a\nb"}, {"apiKey": None}, {"model": ""}]:
            with self.subTest(extra=extra), self.assertRaises(dsh_api.ChatError):
                dsh_api.validate({**self.payload, **extra})

    def test_missing_runtime_is_explicit(self):
        with patch.object(dsh_api, "runtime_python", return_value=SimpleNamespace(is_file=lambda: False)):
            with self.assertRaises(dsh_api.ChatError) as failure:
                dsh_api.chat(self.payload)
        self.assertEqual((failure.exception.code, failure.exception.status), ("runtime", 503))

    def run_stub(self, output, payload=None):
        process = Mock()
        process.communicate.return_value = (json.dumps(output, ensure_ascii=False), None)
        with patch.object(dsh_api, "runtime_python", return_value=Path(sys.executable)), \
             patch.object(dsh_api, "SESSION_ROOT") as folder, \
             patch.object(dsh_api.subprocess, "Popen", return_value=process) as launch:
            result = dsh_api.chat(payload or self.payload)
        return result, process, launch

    def test_key_only_travels_over_stdin_and_context_stays_in_memory(self):
        result, process, launch = self.run_stub({"reply": "我在。"})
        self.assertNotIn(KEY, str(launch.call_args))
        sent = json.loads(process.communicate.call_args.args[0])
        self.assertEqual(sent["apiKey"], KEY)
        result2, process2, _ = self.run_stub({"reply": "记得。"}, {**self.payload, "message": "记得吗？", "sessionId": result["sessionId"]})
        sent2 = json.loads(process2.communicate.call_args.args[0])
        self.assertEqual(sent2["history"], [{"role": "user", "content": "你好"}, {"role": "assistant", "content": "我在。"}])
        self.assertEqual(result["sessionId"], result2["sessionId"])
        self.assertNotIn(KEY, json.dumps(dsh_api._history))

    def test_worker_failure_never_leaks_diagnostics(self):
        with self.assertRaises(dsh_api.ChatError) as failure:
            self.run_stub({"error": True, "code": "upstream", "message": KEY})
        self.assertEqual(failure.exception.status, 502)
        self.assertNotIn(KEY, failure.exception.message)
        self.assertEqual(dsh_api._history, {})
        self.assertFalse(dsh_api._active)

    def test_reused_session_does_not_leak_history_to_different_route_or_account(self):
        for extra in [{"baseUrl": "https://different.example/v1"}, {"protocol": "anthropic"},
                      {"apiKey": "another-test-account"}, {"model": "other-model"}]:
            with self.subTest(extra=extra):
                first, _, _ = self.run_stub({"reply": "原连接的私人回复。"})
                _, process, _ = self.run_stub({"reply": "新连接的回复。"}, {**self.payload, **extra, "sessionId": first["sessionId"]})
                self.assertEqual(json.loads(process.communicate.call_args.args[0])["history"], [])

    def test_transport_failures_are_safe_and_actionable(self):
        for code in ["redirect", "dns", "tls", "address", "connection", "too_large"]:
            with self.subTest(code=code), self.assertRaises(dsh_api.ChatError) as failure:
                self.run_stub({"error": True, "code": code, "message": KEY})
            self.assertEqual(failure.exception.code, code)
            self.assertNotIn(KEY, failure.exception.message)

    def test_timeout_stops_only_owned_worker_and_releases_busy_slot(self):
        process = Mock()
        process.communicate.side_effect = [subprocess.TimeoutExpired("worker", 128), ("", None)]
        with patch.object(dsh_api, "runtime_python", return_value=Path(sys.executable)), \
             patch.object(dsh_api, "SESSION_ROOT"), \
             patch.object(dsh_api.subprocess, "Popen", return_value=process), \
             patch.object(dsh_api, "_stop_owned_worker") as stop:
            with self.assertRaises(dsh_api.ChatError) as failure:
                dsh_api.chat(self.payload)
            stop.assert_called_once_with(process)
        self.assertEqual(failure.exception.status, 504)
        self.assertFalse(dsh_api._active)

    def test_other_app_credentials_and_injection_env_are_not_inherited(self):
        with patch.dict(dsh_api.os.environ, {"OPENAI_API_KEY": KEY, "DEEPSEEK_API_KEY": KEY,
                        "DSH_HOME": "other-home", "PYTHONPATH": "other-python", "NODE_OPTIONS": "--require unsafe"}):
            result = dsh_api._child_environment()
        for key in ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "DSH_HOME", "PYTHONPATH", "NODE_OPTIONS"]:
            self.assertNotIn(key, result)


if __name__ == "__main__":
    unittest.main()
