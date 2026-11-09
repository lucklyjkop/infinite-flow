"""Exercise atmospheric phases and render scheduling with an isolated clock."""
from pathlib import Path
import subprocess
import unittest


class WorldWeatherTests(unittest.TestCase):
    def test_weather_contract(self):
        root = Path(__file__).resolve().parents[1]
        result = subprocess.run(["node", "--test", str(root / "tests/world-map-weather.test.cjs")],
                                cwd=root, capture_output=True, text=True, encoding="utf-8", timeout=30)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
