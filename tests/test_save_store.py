"""Exercise the real browser storage module with isolated Node VM storage."""
from pathlib import Path
import subprocess
import unittest

class SaveStoreTests(unittest.TestCase):
    def test_store_contract(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", "--test", str(root / "tests/save-store.test.cjs")], cwd=root,
                                capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

if __name__ == "__main__":
    unittest.main()
