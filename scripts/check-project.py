"""Check portable game files and syntax; needs Python 3.10+ and Node.js 22+."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import ast
import json
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "loading-page"
errors = []
checked = set()


def asset(source, url):
    if not url or url.startswith(("#", "data:", "blob:")):
        return
    parsed = urlsplit(url)
    if parsed.scheme or parsed.netloc:
        return
    target = (GAME / unquote(parsed.path).lstrip("/") if url.startswith("/")
              else source.parent / unquote(parsed.path)).resolve()
    if not target.is_relative_to(GAME):
        errors.append(f"Asset outside game directory: {source.name}: {url}")
        return
    if not target.is_file():
        errors.append(f"Missing asset: {source.name}: {url}")
        return
    # Windows accepts case mismatches that would break Linux/Codespaces.
    current = GAME
    for part in target.relative_to(GAME).parts:
        if part not in {p.name for p in current.iterdir()}:
            errors.append(f"Case mismatch: {source.name}: {url}")
            return
        current /= part
    checked.add(target)


class References(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in {"img", "script", "audio", "video", "source"}:
            asset(GAME / "index.html", attrs.get("src"))
        if tag == "link" and attrs.get("rel") in {"stylesheet", "preload", "icon"}:
            asset(GAME / "index.html", attrs.get("href"))


References().feed((GAME / "index.html").read_text(encoding="utf-8"))
for file in GAME.glob("*.css"):
    for match in re.finditer(r"url\(\s*['\"]?([^)'\"]+)", file.read_text(encoding="utf-8")):
        asset(file, match[1].strip())
for file in GAME.glob("*.js"):
    for match in re.finditer(r"(['\"])(assets/[^'\"]+)\1", file.read_text(encoding="utf-8")):
        if '${' not in match[2] and re.search(r"\.(?:webp|png|jpg|jpeg|ogg|json|js|woff2)(?:[?#].*)?$", match[2]):
            asset(file, match[2])
for file in GAME.rglob("*.json"):
    try:
        json.loads(file.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        errors.append(f"Invalid JSON: {file.relative_to(ROOT)}: {exc}")
manifest = GAME / "assets/audio/manifest.json"
for sample in json.loads(manifest.read_text(encoding="utf-8"))["assets"]:
    asset(manifest, sample["file"])
for file in [*GAME.glob("*.py"), *ROOT.joinpath("scripts").glob("*.py"), *ROOT.joinpath("tests").glob("test_*.py")]:
    try:
        ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
    except SyntaxError as exc:
        errors.append(str(exc))
node = shutil.which("node")
if not node:
    errors.append("Node.js is needed for JavaScript syntax checks (not for previewing the game).")
else:
    for file in [*GAME.glob("*.js"), *GAME.joinpath("assets/loading-ui").glob("*.js")]:
        result = subprocess.run([node, "--check", str(file)], capture_output=True, text=True)
        if result.returncode:
            errors.append(result.stderr.strip())
if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"PASS: {len(checked)} asset references, JSON, Python and JavaScript syntax.")
