"""Verify voice playback ownership and lifecycle with isolated browser events."""
from pathlib import Path
import subprocess
import unittest


class SystemTTSBrowserTests(unittest.TestCase):
    def test_voice_playback_lifecycle(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", "--test", str(root / "tests" / "system-tts.test.cjs"),
                                 str(root / "tests" / "speech-envelope.test.cjs")],
                                cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
