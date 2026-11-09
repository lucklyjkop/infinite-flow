"""Install the pinned official DSH Python SDK in this project's ignored venv."""
from pathlib import Path
import os
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / "output" / "dsh-runtime" / "venv"
SDK_VERSION = "0.2.1rc2"


def main():
    executable = RUNTIME / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not executable.is_file():
        venv.EnvBuilder(with_pip=True).create(RUNTIME)
    subprocess.run([str(executable), "-m", "pip", "install", "--disable-pip-version-check",
                    f"deepseek-harness-sdk=={SDK_VERSION}"], check=True)
    subprocess.run([str(executable), "-c", "from deepseek_harness import DeepSeekHarness; print('DSH runtime ready.')"], check=True)
    print(f"Runtime: {executable}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError) as error:
        print(f"DSH installation failed ({type(error).__name__}); rerun this command to retry.", file=sys.stderr)
        raise SystemExit(1) from None
