"""Serve the game locally, or on a forwarded port in a cloud workspace."""

from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class GamePreviewServer(ThreadingHTTPServer):
    # Cold browser tabs can request many independent images and scripts at once.
    request_queue_size = 128


class AssetHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 20


if __name__ == "__main__":
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--host", default="127.0.0.1",
                        help="Bind address; use 0.0.0.0 for Codespaces/containers")
    options = parser.parse_args()
    handler = partial(AssetHandler, directory=str(Path(__file__).resolve().parent))
    with GamePreviewServer((options.host, options.port), handler) as server:
        print(f"Game preview: http://127.0.0.1:{server.server_port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
