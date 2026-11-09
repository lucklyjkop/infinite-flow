"""Fixed online TTS worker: bounded stdin, MP3 stdout, no text/audio files."""
import asyncio
import json
import sys

from tts_api import MAX_AUDIO, VOICES, validate


class AudioTooLarge(Exception):
    pass


async def synthesize(request, edge_tts, aiohttp):
    for attempt in range(2):
        chunks, length = [], 0
        try:
            # Fresh sockets on the one transient retry; preserve TLS validation.
            communicator = edge_tts.Communicate(request["text"], VOICES[request["voice"]]["voice"],
                rate=f"{request['rate'] - 100:+d}%", pitch="+0Hz", connect_timeout=12, receive_timeout=15)
            async def collect():
                nonlocal length
                async for chunk in communicator.stream():
                    if chunk.get("type") != "audio":
                        continue
                    length += len(chunk["data"])
                    if length > MAX_AUDIO:
                        raise AudioTooLarge()
                    chunks.append(chunk["data"])
                return b"".join(chunks)
            return await asyncio.wait_for(collect(), timeout=26)
        except (aiohttp.ClientSSLError, aiohttp.ClientConnectorCertificateError, aiohttp.ClientResponseError):
            raise
        except (TimeoutError, asyncio.TimeoutError, aiohttp.ClientConnectionError,
                edge_tts.exceptions.NoAudioReceived, edge_tts.exceptions.WebSocketError):
            if attempt:
                raise
            await asyncio.sleep(.35)


def main():
    code = "upstream"
    try:
        import aiohttp
        import edge_tts
    except ImportError:
        sys.stdout.buffer.write(b'{"code":"runtime"}')
        return 1
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError("Invalid input")
        request = validate(json.loads(raw))
        audio = asyncio.run(asyncio.wait_for(synthesize(request, edge_tts, aiohttp), timeout=54))
        if not audio:
            code = "empty"
        else:
            sys.stdout.buffer.write(audio)
            return 0
    except AudioTooLarge:
        code = "too_large"
    except (TimeoutError, asyncio.TimeoutError):
        code = "timeout"
    except (aiohttp.ClientSSLError, aiohttp.ClientConnectorCertificateError):
        code = "tls"
    except aiohttp.ClientResponseError:
        code = "upstream"
    except aiohttp.ClientError:
        code = "connection"
    except edge_tts.exceptions.NoAudioReceived:
        code = "empty"
    except Exception:
        pass
    # Never serialize exceptions: upstream errors may contain request text.
    sys.stdout.buffer.write(json.dumps({"code": code}).encode("ascii"))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
