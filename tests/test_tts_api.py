"""TTS input/worker limits and HTTP routes; no live network or credentials."""
from functools import partial
import http.client
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "loading-page"))
import tts_api
import tts_worker
import serve

AUDIO = b"\xff\xf3" + b"\x00" * 1022
REQUEST = {"text": "红线相连，欢迎回来。", "voice": "female", "rate": 100}


class VoiceValidationTests(unittest.TestCase):
    def test_both_fixed_voices_and_trimmed_unicode_text(self):
        for voice in ("female", "male"):
            self.assertEqual(tts_api.validate({"text": "  你好🌸  ", "voice": voice, "rate": 105}),
                             {"text": "你好🌸", "voice": voice, "rate": 105})
        self.assertEqual(tts_api.validate({"text": "🌸" * 1500})["voice"], "female")

    def test_rejects_arbitrary_configuration_and_invalid_inputs(self):
        cases = [None, [], {"text": ""}, {"text": " \t"}, {"text": "a" * 1501},
                 {"text": "\u0000"}, {"text": "\ud800"}, {"text": 12},
                 {"text": "test", "voice": "zh-CN-YunxiNeural"}, {"text": "test", "voice": []},
                 {"text": "test", "url": "http://127.0.0.1"},
                 *[{"text": "test", "rate": value} for value in [74,126,True,"100",[],float("nan"),float("inf")]]]
        for case in cases:
            with self.subTest(case=case), self.assertRaises(tts_api.TTSError):
                tts_api.validate(case)

    def test_status_contains_only_public_voice_metadata(self):
        with patch.object(tts_api, "_installed", return_value=True):
            result = tts_api.runtime_status()
        self.assertEqual(set(result), {"ready", "engine", "online", "voices"})
        self.assertTrue(result["ready"])
        self.assertEqual([voice["id"] for voice in result["voices"]], ["female", "male"])
        self.assertNotIn(str(tts_api.ROOT), json.dumps(result))


class VoiceWorkerTests(unittest.TestCase):
    def worker(self, output=AUDIO, code=0):
        process = Mock(returncode=code)
        process.communicate.return_value = (output, None)
        process.poll.return_value = code
        return process

    def test_returns_mp3_and_passes_text_only_over_stdin(self):
        process = self.worker()
        with patch.object(tts_api, "_installed", return_value=True), \
             patch.object(tts_api.subprocess, "Popen", return_value=process) as spawn, \
             patch.dict(os.environ, {"API_KEY": "do-not-inherit", "HTTP_PROXY": "private-proxy", "PYTHONPATH": "injected"}):
            self.assertEqual(tts_api.synthesize(REQUEST), AUDIO)
        self.assertNotIn(REQUEST["text"], repr(spawn.call_args.args))
        environment = spawn.call_args.kwargs["env"]
        self.assertNotIn("API_KEY", environment)
        self.assertNotIn("HTTP_PROXY", environment)
        self.assertNotIn("PYTHONPATH", environment)
        sent = json.loads(process.communicate.call_args.args[0])
        self.assertEqual(sent, REQUEST)
        self.assertEqual(process.communicate.call_args.kwargs["timeout"], 60)

    def test_missing_runtime_does_not_spawn_or_install(self):
        with patch.object(tts_api, "_installed", return_value=False), patch.object(tts_api.subprocess, "Popen") as spawn:
            with self.assertRaises(tts_api.TTSError) as result:
                tts_api.synthesize(REQUEST)
        self.assertEqual((result.exception.code,result.exception.status),("runtime",503))
        spawn.assert_not_called()

    def test_concurrency_is_bounded_and_recoverable(self):
        with patch.object(tts_api, "_installed", return_value=True), patch.object(tts_api.subprocess, "Popen") as spawn:
            tts_api._slots.acquire(); tts_api._slots.acquire()
            try:
                with self.assertRaises(tts_api.TTSError) as result:
                    tts_api.synthesize(REQUEST)
                self.assertEqual((result.exception.code,result.exception.status),("busy",429))
                spawn.assert_not_called()
            finally:
                tts_api._slots.release(); tts_api._slots.release()

    def test_timeout_kills_own_worker_and_releases_slot(self):
        process = self.worker()
        process.communicate.side_effect = [subprocess.TimeoutExpired("worker",60),(b"",None)]
        with patch.object(tts_api, "_installed", return_value=True), patch.object(tts_api.subprocess, "Popen", return_value=process):
            with self.assertRaises(tts_api.TTSError) as result:
                tts_api.synthesize(REQUEST)
        self.assertEqual(result.exception.code,"timeout")
        process.kill.assert_called_once()
        self.assertTrue(tts_api._slots.acquire(blocking=False))
        tts_api._slots.release()

    def test_worker_errors_never_echo_text_or_tracebacks(self):
        for output, code, expected in [(b'{"code":"connection","detail":"private-dialogue"}',1,"connection"),
                                       (b"private-dialogue traceback",1,"upstream"),
                                       (b"{\"code\":\"private-dialogue\"}",1,"upstream"),
                                       (b"<html>no audio</html>",0,"empty"),
                                       (b"x" * 2049,1,"upstream")]:
            with self.subTest(expected=expected), patch.object(tts_api, "_installed", return_value=True), \
                 patch.object(tts_api.subprocess, "Popen", return_value=self.worker(output,code)):
                with self.assertRaises(tts_api.TTSError) as result:
                    tts_api.synthesize(REQUEST)
                self.assertEqual(result.exception.code,expected)
                self.assertNotIn("private-dialogue",result.exception.message)

    def test_audio_size_limit(self):
        with patch.object(tts_api, "MAX_AUDIO", 1023), patch.object(tts_api, "_installed", return_value=True), \
             patch.object(tts_api.subprocess, "Popen", return_value=self.worker()):
            with self.assertRaises(tts_api.TTSError) as result:
                tts_api.synthesize(REQUEST)
            self.assertEqual(result.exception.code,"too_large")


class VoiceStreamTests(unittest.IsolatedAsyncioTestCase):
    def modules(self, communicator):
        class ConnectionError(Exception):
            pass
        class CertificateError(ConnectionError):
            pass
        class ResponseError(Exception):
            pass
        class EmptyAudio(Exception):
            pass
        class WebSocketError(Exception):
            pass
        edge=SimpleNamespace(Communicate=communicator,exceptions=SimpleNamespace(NoAudioReceived=EmptyAudio,WebSocketError=WebSocketError))
        http=SimpleNamespace(ClientSSLError=CertificateError,ClientConnectorCertificateError=CertificateError,
                             ClientResponseError=ResponseError,ClientConnectionError=ConnectionError)
        return edge,http

    async def test_failed_attempt_audio_is_discarded_and_new_socket_used(self):
        calls=[]
        def factory(text,voice,**options):
            attempt=len(calls)
            calls.append((text,voice,options))
            async def stream():
                if attempt==0:
                    yield {"type":"audio","data":b"partial"}
                    raise http.ClientConnectionError("private-text")
                yield {"type":"WordBoundary","text":"not-audio"}
                yield {"type":"audio","data":AUDIO}
            return SimpleNamespace(stream=stream)
        edge,http=self.modules(factory)
        with patch.object(tts_worker.asyncio,"sleep",new=AsyncMock()):
            result=await tts_worker.synthesize({"text":"你好","voice":"male","rate":110},edge,http)
        self.assertEqual(result,AUDIO)
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0][1],"zh-CN-YunxiNeural")
        self.assertEqual(calls[0][2]["rate"],"+10%")

    async def test_tls_failure_is_not_retried(self):
        calls=[]
        def factory(*args,**kwargs):
            calls.append(True)
            async def stream():
                raise http.ClientSSLError("certificate")
                yield
            return SimpleNamespace(stream=stream)
        edge,http=self.modules(factory)
        with self.assertRaises(http.ClientSSLError):
            await tts_worker.synthesize(REQUEST,edge,http)
        self.assertEqual(len(calls),1)

    async def test_stream_size_is_bounded_before_joining(self):
        async def stream():
            yield {"type":"audio","data":AUDIO}
        edge,http=self.modules(lambda *_args,**_kwargs:SimpleNamespace(stream=stream))
        with patch.object(tts_worker,"MAX_AUDIO",100),self.assertRaises(tts_worker.AudioTooLarge):
            await tts_worker.synthesize(REQUEST,edge,http)


class QuietHandler(serve.AssetHandler):
    def log_message(self, *_):
        pass


class VoiceRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = serve.GamePreviewServer(("127.0.0.1",0),partial(QuietHandler,directory=str(tts_api.ROOT / "loading-page")))
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def request(self, method="POST", path="/api/tts", payload=REQUEST, **headers):
        origin=f"http://127.0.0.1:{self.server.server_port}"
        defaults={"Content-Type":"application/json","Origin":origin,"Sec-Fetch-Site":"same-origin"}
        defaults.update(headers)
        client=http.client.HTTPConnection("127.0.0.1",self.server.server_port,timeout=3)
        try:
            client.request(method,path,body=json.dumps(payload,ensure_ascii=False).encode("utf-8") if method=="POST" else None,headers=defaults)
            response=client.getresponse()
            return response.status,dict(response.getheaders()),response.read()
        finally:
            client.close()

    def test_mp3_response_and_no_cache(self):
        with patch.object(serve,"synthesize_tts",return_value=AUDIO) as synthesize:
            status,headers,body=self.request()
        self.assertEqual((status,body),(200,AUDIO))
        self.assertEqual(headers["Content-Type"],"audio/mpeg")
        self.assertEqual(headers["Cache-Control"],"no-store")
        self.assertNotIn("Access-Control-Allow-Origin",headers)
        synthesize.assert_called_once_with(REQUEST)

    def test_status_route_has_no_private_paths(self):
        with patch.object(tts_api,"_installed",return_value=True):
            status,headers,body=self.request("GET","/api/tts/status")
        value=json.loads(body)
        self.assertEqual(status,200)
        self.assertTrue(value["ready"])
        self.assertEqual(headers["Cache-Control"],"no-store")
        self.assertEqual(len(value["voices"]),2)

    def test_rejects_cross_origin_and_oversized_body_without_synthesis(self):
        for headers,payload,expected in [({"Origin":"https://unrelated.example"},REQUEST,403),
                                         ({"Sec-Fetch-Site":"cross-site"},REQUEST,403),
                                         ({"Content-Type":"text/plain"},REQUEST,415),
                                         ({},{"text":"a"*17000},413)]:
            with self.subTest(expected=expected), patch.object(serve,"synthesize_tts") as synthesize:
                status,_,body=self.request(payload=payload,**headers)
                self.assertEqual(status,expected)
                self.assertIn("code",json.loads(body))
                synthesize.assert_not_called()

    def test_runtime_failure_is_json(self):
        with patch.object(serve,"synthesize_tts",side_effect=tts_api.TTSError("timeout","语音合成超时，请重试。",504)):
            status,headers,body=self.request()
        self.assertEqual(status,504)
        self.assertIn("application/json",headers["Content-Type"])
        self.assertEqual(json.loads(body),{"code":"timeout","error":"语音合成超时，请重试。"})


if __name__ == "__main__":
    unittest.main()
