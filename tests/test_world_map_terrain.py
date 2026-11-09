"""Keep terrain topology and first-frame projection checks in the CI suite."""
from pathlib import Path
import subprocess
import unittest


class WorldMapTerrainTests(unittest.TestCase):
    def test_terrain_geometry_and_projection(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(
            ["node", "--test", str(root / "tests" / "world-map-terrain.test.cjs")],
            cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
