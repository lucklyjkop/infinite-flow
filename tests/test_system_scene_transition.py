"""Live archive fades preserve browser-painted card geometry through scene handoff."""
from pathlib import Path
import subprocess
import unittest


class SystemSceneTransitionTests(unittest.TestCase):
    def test_live_cover_lifecycle(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "--test", "tests/system-scene-transition.test.cjs"],
            cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
