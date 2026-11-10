"""The opening must wait for actual resource preparation, including retries."""
from pathlib import Path
import subprocess
import unittest


class GamePreloadTests(unittest.TestCase):
    def test_startup_resources(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", "--test", "tests/game-preload.test.cjs"],
                                cwd=root, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
