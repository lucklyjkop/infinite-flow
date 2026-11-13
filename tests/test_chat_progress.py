"""Provider-independent progress parsing and a real isolated SDK streaming turn."""
import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'loading-page'))
from chat_progress import ProgressTap
import dsh_api


class ProgressTests(unittest.TestCase):
    def parse(self, values):
        events = []
        tap = ProgressTap(events.append)
        data = ''.join('data: ' + json.dumps(value, ensure_ascii=False) + '\r\n\r\n' for value in values).encode()
        for byte in data:
            tap.feed(bytes([byte]))
        tap.finish()
        return events

    def test_byte_boundaries_and_only_explicit_public_fields(self):
        self.assertEqual(self.parse([
            {'choices': [{'delta': {'reasoning_content': '考虑🌸'}}]},
            {'choices': [{'delta': {'content': '<b>你好</b>'}}]},
            {'signature': 'secret', 'redacted_thinking': 'never', 'error': 'private'},
        ]), [{'type': 'thinking', 'delta': '考虑🌸'}, {'type': 'text', 'delta': '<b>你好</b>'}])

    def test_messages_and_responses(self):
        self.assertEqual(self.parse([
            {'type': 'content_block_delta', 'delta': {'type': 'thinking_delta', 'thinking': '甲'}},
            {'type': 'content_block_delta', 'delta': {'type': 'text_delta', 'text': '乙'}},
            {'type': 'response.reasoning_summary_text.delta', 'delta': '丙'},
            {'type': 'response.output_text.delta', 'delta': '丁'},
        ]), [{'type': kind, 'delta': text} for kind, text in [('thinking', '甲'), ('text', '乙'), ('thinking', '丙'), ('text', '丁')]])

    def test_limits_and_json_fallback(self):
        output = []
        tap = ProgressTap(output.append)
        tap.feed(json.dumps({'choices': [{'message': {'reasoning_content': '思' * 15000, 'content': '答'}}]}).encode())
        tap.finish()
        self.assertEqual(len(output[0]['delta']), 12000)
        self.assertEqual(output[1], {'type': 'text', 'delta': '答'})

    @unittest.skipUnless(dsh_api.runtime_python().is_file(), 'Optional SDK not installed')
    def test_real_worker_streams_and_keeps_thinking_out_of_saved_history(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                self.rfile.read(int(self.headers['Content-Length']))
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Connection', 'close')
                self.end_headers()
                for delta in [{'role': 'assistant', 'reasoning_content': '先整理这段故事。'}, {'content': '<p>红线在，我会陪你。</p>'}, {}]:
                    value = {'id': 'chat-test', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'test-model',
                             'choices': [{'index': 0, 'delta': delta, 'finish_reason': None if delta else 'stop'}]}
                    self.wfile.write(('data: ' + json.dumps(value, ensure_ascii=False) + '\n\n').encode())
                    self.wfile.flush()
                self.wfile.write(b'data: [DONE]\n\n')
                self.close_connection = True
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        events = []
        try:
            result = dsh_api.chat({'message': '你好', 'model': 'test-model', 'baseUrl': f'http://127.0.0.1:{server.server_port}/v1'}, on_progress=events.append)
            self.assertIn({'type': 'thinking', 'delta': '先整理这段故事。'}, events)
            self.assertIn({'type': 'text', 'delta': '<p>红线在，我会陪你。</p>'}, events)
            self.assertEqual(result['reply'], '<p>红线在，我会陪你。</p>')
            self.assertNotIn('先整理', json.dumps(dsh_api._history, ensure_ascii=False))
            self.assertFalse(dsh_api._active)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
