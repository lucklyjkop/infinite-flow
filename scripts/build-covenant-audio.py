"""Author the liquid covenant's own gestures; no recorded or existing UI audio.

Continuous curved resonances suggest a viscous membrane, with a few rounded
micro-cavities. No paper, fibre, noise bursts, click trains or musical phrase.
Only generic DSP/encoding utilities are shared with the material sound tools.
"""
from pathlib import Path
import argparse
import hashlib
import json
import runpy
import subprocess

import numpy as np
from scipy.io.wavfile import read as read_wav, write
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'loading-page/assets/audio'
MASTERS = ROOT / 'output/audio-design/covenant'
RECORD = ROOT / 'audio-source/covenant'
SR = 48000
DSP = runpy.run_path(str(ROOT / 'scripts/build-deity-audio.py'))
band, soften, pan, lay, space, canvas = (
    DSP[name] for name in ['band', 'soften', 'pan', 'lay', 'space', 'canvas'])


def membrane(rng, duration, start, end, weight=1.3):
    """One continuous pressure curve with uneven, damped surface modes."""
    t = np.arange(round(duration * SR)) / SR
    u = t / duration
    shape = (u ** .65) * ((1 - u) ** weight)
    shape /= max(np.max(shape), 1e-9)
    frequency = start + (end - start) * (1 - np.exp(-u * 3.3)) / (1 - np.exp(-3.3))
    frequency *= 1 + .018 * np.sin(t * 17 + rng.uniform(0, 6.28))
    phase = np.cumsum(frequency) * (2 * np.pi / SR)
    x = np.zeros(len(t))
    for i, (ratio, amplitude) in enumerate([(1, 1), (1.43, .23), (2.67, .09), (4.12, .025)]):
        x += amplitude * np.sin(phase * ratio + .23 * np.sin(phase * .42)) * np.exp(-u * i * 1.2)
    return soften(x * shape, .025, min(.17, duration * .36))


def cavity(rng, duration, frequency, drift=-.2):
    """Soft surface tension release, deliberately lacking a hard attack."""
    t = np.arange(round(duration * SR)) / SR
    f = frequency * (1 + drift * (1 - np.exp(-t * 19)))
    phase = np.cumsum(f) * (2 * np.pi / SR)
    envelope = (1 - np.exp(-t / .008)) ** 2 * np.exp(-t * (23 + rng.uniform(-2, 2)))
    wave = np.sin(phase + .18 * np.sin(phase * .57)) + .12 * np.sin(phase * 2.37) * np.exp(-t * 31)
    return soften(wave * envelope, .012, min(.09, duration * .48))


def enter(rng):
    x = canvas(.76)
    flow = membrane(rng, .68, 113, 177, 1.7)
    lay(x, pan(flow, np.linspace(-.12, .12, len(flow))), .015, .22)
    lay(x, pan(cavity(rng, .24, 314, -.13), -.16), .11, .055)
    lay(x, pan(cavity(rng, .29, 418, -.17), .15), .29, .04)
    return soften(space(x, .085), .026, .18)


def leave(rng):
    x = canvas(.40)
    lay(x, pan(membrane(rng, .37, 176, 98, 1.9), -.04), gain=.18)
    lay(x, pan(cavity(rng, .18, 265, -.28), .04), .08, .035)
    return soften(space(x, .045), .018, .11)


def focus(rng):
    x = canvas(.14)
    lay(x, pan(cavity(rng, .14, 518, -.16), 0), gain=.065)
    return soften(x, .013, .065)


def branch(rng):
    x = canvas(.36)
    flow = membrane(rng, .31, 205, 143, 1.45)
    lay(x, pan(flow, np.linspace(-.16, .16, len(flow))), gain=.16)
    lay(x, pan(cavity(rng, .20, 405, -.19), .12), .09, .06)
    return soften(space(x, .035), .018, .10)


def detail_open(rng):
    x = canvas(.62)
    flow = membrane(rng, .56, 132, 225, 1.65)
    lay(x, pan(flow, np.linspace(-.10, .14, len(flow))), gain=.20)
    lay(x, pan(cavity(rng, .25, 359, -.17), -.10), .045, .075)
    lay(x, pan(cavity(rng, .22, 491, -.14), .13), .23, .04)
    return soften(space(x, .075), .022, .15)


def detail_close(rng):
    x = canvas(.34)
    lay(x, pan(membrane(rng, .32, 231, 126, 1.8), -.06), gain=.17)
    lay(x, pan(cavity(rng, .19, 328, -.24), .03), .04, .055)
    return soften(space(x, .04), .018, .10)


def unlock(rng):
    x = canvas(.94)
    lay(x, pan(membrane(rng, .75, 104, 192, 1.8), 0), gain=.23)
    lay(x, pan(cavity(rng, .30, 305, -.10), -.10), .05, .055)
    lay(x, pan(cavity(rng, .36, 457, -.12), .11), .24, .065)
    # A simultaneous inharmonic warm shimmer, not ascending notification notes.
    t = np.arange(round(.55 * SR)) / SR
    shimmer = sum(level * np.sin(2*np.pi*freq*t + rng.uniform(-.05, .05)) * np.exp(-t*decay)
                  for freq, level, decay in [(572, .030, 9), (811, .011, 16), (1227, .004, 28)])
    lay(x, pan(soften(shimmer, .06, .22), .05), .32)
    return soften(space(x, .09), .025, .23)


CUES = [
    ('covenant-enter', 6111301, enter, -27.0, -16.0, 'Low fluid mass opens with a single broad swell and two soft inner cavities.'),
    ('covenant-leave', 6111302, leave, -29.0, -18.0, 'Independent low inward settling for leaving the covenant; not reversed opening audio.'),
    ('covenant-focus', 6111303, focus, -36.0, -25.5, 'A quiet rounded liquid tension touch for hover; no hard transient.'),
    ('covenant-branch', 6111304, branch, -29.0, -18.0, 'Short lateral membrane roll and a subdued cavity release for branch changes.'),
    ('covenant-detail-open', 6111305, detail_open, -26.5, -15.5, 'Viscous membrane unfurling with gently rising body and tiny wet resonances.'),
    ('covenant-detail-close', 6111306, detail_close, -28.5, -17.5, 'A distinct, shorter inward liquid fold for dismissing details.'),
    ('covenant-unlock', 6111307, unlock, -25.0, -14.0, 'Deep seal release with a restrained warm inharmonic glimmer and soft tail.'),
]


def build(ffmpeg=None, names=None):
    available = {cue[0] for cue in CUES}
    selected = available if names is None else set(names)
    if not selected or selected - available:
        raise ValueError(f'Unknown or empty cue selection: {names}')
    ffmpeg = ffmpeg or DSP['find_ffmpeg']()
    for folder in [OUT, MASTERS, RECORD]:
        folder.mkdir(parents=True, exist_ok=True)
    records = []
    for name, seed, generate, rms_db, peak_db, description in CUES:
        if name not in selected:
            continue
        x = band(generate(np.random.default_rng(seed)), 72, 3400)
        x -= x.mean(axis=0)
        x = soften(x, .008, .07)
        rms, peak = np.sqrt(np.mean(x*x)), np.max(np.abs(x))
        x *= min(10**(rms_db/20)/max(rms, 1e-9), 10**(peak_db/20)/max(peak, 1e-9))
        master, dest = MASTERS/(name+'.wav'), OUT/(name+'.ogg')
        write(master, SR, np.int16(np.clip(x, -1, 1)*32767))
        subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(master), '-map_metadata', '-1',
                        '-c:a', 'libopus', '-b:a', '112k', '-application', 'audio', '-vbr', 'on', str(dest)], check=True)
        y, db = DSP['decode'](ffmpeg, dest), DSP['db']
        record = {'name': name, 'file': dest.name,
                  'source': ['Original procedural synthesis / scripts/build-covenant-audio.py'],
                  'design': description, 'loop': False, 'duration': round(len(y)/SR, 5), 'bytes': dest.stat().st_size,
                  'peakDbfs': round(db(np.max(np.abs(y))), 2),
                  'truePeakDbfs': round(db(np.max(np.abs(resample_poly(y, 4, 1, axis=0)))), 2),
                  'rmsDbfs': round(db(np.sqrt(np.mean(y*y))), 2),
                  'boundaryStep': round(float(np.max(np.abs(y[0]-y[-1]))), 6),
                  'seed': seed, 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
                  'masterSha256': hashlib.sha256(master.read_bytes()).hexdigest()}
        if record['truePeakDbfs'] > -10 or record['boundaryStep'] > .001:
            raise ValueError(f'Unexpected peak or edge discontinuity: {record}')
        records.append(record)
    if len({record['masterSha256'] for record in records}) != len(selected):
        raise ValueError('Covenant cues must have unique masters.')
    if all((MASTERS/(cue[0]+'.wav')).exists() for cue in CUES):
        preview = []
        for name, *_ in CUES:
            rate, pcm = read_wav(MASTERS/(name+'.wav'))
            if rate != SR:
                raise ValueError(f'Unexpected sample rate: {name}')
            preview.extend([pcm, np.zeros((round(.48*SR), 2), dtype=np.int16)])
        write(MASTERS/'covenant-preview.wav', SR, np.concatenate(preview))
    updates = {record['name']: record for record in records}
    report_path = RECORD/'design.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {
        'created': '2026-11-13', 'authoring': 'Original curved membrane and damped liquid-cavity synthesis; no recordings, paper, noise layers or existing cue reuse.',
        'sampleRate': SR, 'channels': 2, 'preview': 'output/audio-design/covenant/covenant-preview.wav',
        'truePeakMeasurement': '4x polyphase oversampling of decoded delivery Opus; dBFS.', 'assets': []}
    by_name = {record['name']: record for record in report['assets']}
    by_name.update(updates)
    report['assets'] = [by_name[name] for name, *_ in CUES if name in by_name]
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    manifest_path = OUT/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'format': 'Ogg Opus, 48 kHz stereo', 'assets': []}
    old_names = {item['name'] for item in manifest['assets']}
    manifest['assets'] = [updates.get(item['name'], item) for item in manifest['assets']] + [record for record in records if record['name'] not in old_names]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', choices=[cue[0] for cue in CUES])
    records = build(names=parser.parse_args().only)
    print(json.dumps({'files': len(records), 'bytes': sum(r['bytes'] for r in records),
                      'assets': [{key: r[key] for key in ['name', 'duration', 'truePeakDbfs', 'rmsDbfs', 'boundaryStep']} for r in records]}, indent=2))
