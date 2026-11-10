"""The opening branches animate independently of resource progress."""
from pathlib import Path
import subprocess
import unittest


class LoadingBoughsTests(unittest.TestCase):
    def test_animation_lifecycle(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "--test", "tests/loading-boughs.test.cjs"],
            cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
