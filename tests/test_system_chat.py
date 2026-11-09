"""Exercise browser save/chat isolation using Node's isolated event environment."""
from pathlib import Path
import subprocess
import unittest


class SystemChatBrowserTests(unittest.TestCase):
    def test_save_bound_conversations(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", "--test", str(root / "tests" / "system-chat.test.cjs")],
                                cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
