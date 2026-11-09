"""Package the browser preview for GitHub Pages; Python API routes stay local."""
from pathlib import Path
import runpy
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "loading-page"
TARGET = ROOT / "output" / "pages"


def main():
    setup = runpy.run_path(str(ROOT / "scripts" / "setup-live2d-runtime.py"))
    core = setup["ensure_runtime"]()
    if TARGET.exists():
        shutil.rmtree(TARGET)
    shutil.copytree(SOURCE, TARGET, ignore=shutil.ignore_patterns(
        "__pycache__", "*.py", "*.pyc", "*.cjs", ".env*", "*.pem", "*.key",
    ))
    runtime = TARGET / "runtime"
    runtime.mkdir(exist_ok=True)
    shutil.copy2(core, runtime / core.name)
    shutil.copy2(core.parent / "source.json", runtime / "source.json")
    (TARGET / ".nojekyll").touch()
    print(f"Pages artifact: {TARGET}")


if __name__ == "__main__":
    main()
