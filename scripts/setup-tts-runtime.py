"""Install this project's isolated, pinned online TTS client (no API key)."""
from pathlib import Path
import json
import os
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "output" / "tts-runtime" / "venv"
VERSION = "7.3.1"


def main():
    executable = RUNTIME / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    marker = RUNTIME.parent / "installed.json"
    marker.unlink(missing_ok=True)
    if not executable.is_file():
        venv.EnvBuilder(with_pip=True).create(RUNTIME)
    subprocess.run([str(executable), "-m", "pip", "install", "--disable-pip-version-check",
                    "-r", str(ROOT / "scripts" / "tts-requirements.txt")], check=True)
    subprocess.run([str(executable), "-c",
                    "import edge_tts, aiohttp; from importlib.metadata import version; "
                    f"assert version('edge-tts') == {VERSION!r}; print('TTS runtime ready.')"], check=True)
    marker.write_text(json.dumps({"edge_tts": VERSION, "online": True}), encoding="utf-8")
    print("Built-in Xiaoxiao/Yunxi voices are ready; synthesis requires an internet connection.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"TTS installation failed ({type(error).__name__}); rerun this command to retry.", file=sys.stderr)
        raise SystemExit(1) from None
