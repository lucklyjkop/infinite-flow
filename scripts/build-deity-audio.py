"""Synthesize the deity-space score of short, original material sounds.

No existing recording, UI sound, musical phrase or sample is used as synthesis
input. Preview concatenation can reuse previously rendered local master WAVs.
Requirements: Python 3.10+, NumPy, SciPy and FFmpeg with libopus support.
Run this alone to preserve the other game sounds, or via build-game-audio.py.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import os
import shutil
import subprocess
import wave

import numpy as np
from scipy.io.wavfile import read as read_wav, write
from scipy.signal import butter, resample_poly, sosfilt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'loading-page/assets/audio'
WAV = ROOT / 'output/audio-design/deity'
RECORD = ROOT / 'audio-source/deity-design'
SR = 48000


def band(x, low=90, high=5800):
    return sosfilt(butter(2, [low, high], btype='bandpass', fs=SR, output='sos'), x, axis=0)


def soften(x, attack=.008, release=.08):
    x = x.copy()
    a, b = min(len(x), round(attack*SR)), min(len(x), round(release*SR))
    if a:
        shape = np.sin(np.linspace(0, np.pi/2, a))**2
        x[:a] *= shape[:, None] if x.ndim == 2 else shape
    if b:
        shape = np.cos(np.linspace(0, np.pi/2, b))**2
        x[-b:] *= shape[:, None] if x.ndim == 2 else shape
    return x


def pan(x, position=0):
    """Equal-power pan, including a moving position array for one wave crest."""
    angle = (np.asarray(position)+1)*np.pi/4
    return np.column_stack((x*np.cos(angle), x*np.sin(angle)))


def lay(target, x, at=0, gain=1):
    start = round(at*SR)
    end = min(len(target), start+len(x))
    if end > start:
        target[start:end] += x[:end-start]*gain


def noise(rng, duration, low=180, high=3500):
    n = round(duration*SR)
    x = band(rng.normal(size=n), low, high)
    return x/max(np.sqrt(np.mean(x*x)), 1e-8)


def friction(rng, duration, low=260, high=3600, roughness=14):
    x = noise(rng, duration, low, high)
    t = np.arange(len(x))/SR
    # Smooth nonperiodic pressure variation; never a repeating tremolo/wave.
    knots = np.linspace(0, duration, max(4, int(duration*roughness)))
    pressure = np.interp(t, knots, rng.uniform(.35, 1, len(knots)))
    return soften(x*pressure, min(.04, duration*.16), min(.1, duration*.35))


def contact(rng, duration=.13, body=250, firmness=.45):
    """Heavily damped inharmonic body plus porous surface contact.

    High partials decay much faster than the body: matte stone/ceramic,
    with no pitched UI chime, glass ping or single oscillator beep.
    """
    t = np.arange(round(duration*SR))/SR
    x = np.zeros(len(t))
    ratios = np.array([1, 1.47, 2.13, 2.91, 4.18, 5.43, 6.77])
    for i, ratio in enumerate(ratios):
        freq = body*ratio*rng.uniform(.94, 1.06)
        decay = (23+i*13)*(1.3-firmness*.4)
        x += np.sin(2*np.pi*freq*t+rng.uniform(-.15, .15))*np.exp(-t*decay)/(i+1)**1.15
    x += noise(rng, duration, 460, 4800)*np.exp(-t*(80+firmness*50))*.44
    return soften(x, .0028+(1-firmness)*.003, min(.04, duration*.35))


def space(x, wet=.10):
    """Short, low-passed early reflections, not a large ringing reverb."""
    dry = x.copy()
    for delay, gain, cross in [(.023,.56,True),(.041,.34,False),(.067,.22,True),(.097,.12,False)]:
        shift = round(delay*SR)
        reflected = band(dry, 220, 3200)
        if cross:
            reflected = reflected[:, ::-1]
        x[shift:] += reflected[:-shift]*wet*gain
    return x


def canvas(duration):
    return np.zeros((round(duration*SR), 2))


def single_swell(t, crest, width_before, width_after):
    width = np.where(t < crest, width_before, width_after)
    return np.exp(-.5*((t-crest)/width)**2)


def start_wave(rng):
    x = canvas(2.60)
    t = np.arange(len(x))/SR
    envelope = single_swell(t, .77, .30, .57)
    # One central pressure front opens to the two sides, then falls away.
    for direction in [-1, 1]:
        airy = noise(rng, 2.60, 145, 2400)
        width = np.clip(t/1.28, 0, 1)*.80*direction
        lay(x, pan(airy*envelope, width), gain=.085)
    low = noise(rng, 2.60, 72, 290)*single_swell(t, .64, .19, .38)
    lay(x, pan(low, 0), gain=.065)
    # Closely spaced porous blocks lift inside the single wave front.
    for at in np.sort(rng.uniform(.24, 1.53, 28)):
        strength = .18+.65*np.exp(-((at-.75)/.40)**2)
        side = rng.choice([-1, 1])*np.clip(at/1.30, .12, .88)
        lay(x, pan(contact(rng, .19, rng.uniform(155, 300), .32), side), at, .047*strength)
    return space(x, .10)


def fracture(rng):
    x = canvas(1.80)
    # A broad fracture, followed by small, progressively softer rubble.
    for i, at in enumerate(np.sort(rng.uniform(.035, 1.29, 70))):
        volume = (.5+np.exp(-((at-.20)/.24)**2))*np.exp(-at*1.3)
        piece = contact(rng, rng.uniform(.075, .17), rng.uniform(320, 850), .68)
        lay(x, pan(piece, rng.uniform(-.90, .90)), at, volume*.038)
    t = np.arange(len(x))/SR
    dust = friction(rng, 1.80, 600, 4800, 21)*single_swell(t, .34, .15, .37)
    lay(x, pan(dust, -.18), gain=.054)
    lay(x, pan(contact(rng, .31, 132, .32), .05), .045, .18)
    return space(x, .11)


def assemble(rng):
    x = canvas(1.55)
    t = np.arange(len(x))/SR
    envelope = single_swell(t, .64, .27, .23)
    for side in [-1, 1]:
        air = noise(rng, 1.55, 270, 3100)*envelope
        lay(x, pan(air, side*.9*np.clip(1-t/.97, 0, 1)), gain=.052)
    for at in np.sort(rng.uniform(.11, .98, 39)):
        side = rng.choice([-1, 1])*.85*(1-at/1.12)
        sound = contact(rng, .16, rng.uniform(230, 610), .43)
        lay(x, pan(sound, side), at, .035+.040*at)
    # A felt-backed, broad seating contact and minute joins, no metallic hit.
    lay(x, pan(contact(rng, .29, 174, .27)), 1.015, .16)
    lay(x, pan(contact(rng, .14, 512, .28), -.21), 1.135, .024)
    lay(x, pan(contact(rng, .12, 677, .26), .18), 1.205, .014)
    return space(x, .09)


def return_wave(rng):
    x = canvas(2.20)
    t = np.arange(len(x))/SR
    travel = np.clip(t/1.85, 0, 1)*1.86-.93
    envelope = single_swell(t, .92, .38, .43)
    lay(x, pan(noise(rng, 2.20, 105, 2350)*envelope, travel), gain=.115)
    lay(x, pan(noise(rng, 2.20, 410, 3900)*envelope, travel*.9), gain=.025)
    # Every contact advances to the right; no second crest or radial echoes.
    for at in np.sort(rng.uniform(.16, 1.76, 48)):
        side = -.88+1.76*at/1.82
        strength = .25+.8*np.exp(-((at-.96)/.49)**2)
        lay(x, pan(contact(rng, .16, rng.uniform(205, 550), .36), side), at, .055*strength)
    for at, side, gain in [(1.70,.60,.067),(1.81,.77,.042),(1.91,.88,.018)]:
        lay(x, pan(contact(rng, .19, rng.uniform(240,390), .25), side), at, gain)
    return space(x, .085)


def inscribe(rng):
    x = canvas(.90)
    # Four irregular brush-fibre gestures, with pressure and tiny overlap.
    for at, duration, gain, side in [(0,.28,.075,-.35),(.18,.24,.10,-.12),(.38,.26,.09,.13),(.57,.29,.065,.35)]:
        lay(x, pan(friction(rng, duration, 760, 5300, 40), side), at, gain)
    return space(x, .055)


def branch(rng):
    x = canvas(.40)
    lay(x, pan(friction(rng, .36, 340, 3200, 31), np.linspace(-.4,.4,round(.36*SR))), 0, .095)
    for at in [.08,.15,.23]:
        lay(x, pan(contact(rng, .07, rng.uniform(600,980), .2), rng.uniform(-.3,.3)), at, .015)
    return space(x, .045)


def hover(rng):
    # One uninterrupted fibre brush: no modal impact, granular clicks or echo.
    # A steep band limit suppresses both low knocks and sharp high-frequency grit.
    duration = .20
    n = round(duration*SR)
    texture = sosfilt(butter(4, [480, 2050], btype='bandpass', fs=SR, output='sos'), rng.normal(size=n))
    texture /= max(np.sqrt(np.mean(texture*texture)), 1e-8)
    # Round isolated noise peaks before the final filter, without a pulse layer.
    texture = np.tanh(texture/2.1)*2.1
    pressure = np.interp(np.arange(n)/SR, [0, .07, .14, duration], [.92, 1, .96, .90])
    return pan(texture*pressure, -.04)


def select(rng):
    x = canvas(.20)
    lay(x, pan(contact(rng, .18, 335, .22), -.05), 0, .10)
    lay(x, pan(friction(rng, .14, 620, 3000, 28), .14), .035, .038)
    return space(x, .045)


def confirm(rng):
    x = canvas(.50)
    lay(x, pan(contact(rng, .28, 203, .24)), .008, .15)
    lay(x, pan(friction(rng, .38, 280, 2400, 18), .1), .045, .048)
    lay(x, pan(contact(rng, .18, 468, .17), -.13), .13, .038)
    return space(x, .07)


def back(rng):
    x = canvas(.22)
    lay(x, pan(friction(rng, .21, 400, 2600, 28), np.linspace(.18,-.36,round(.21*SR))), gain=.065)
    lay(x, pan(contact(rng, .12, 284, .12), -.12), .04, .03)
    return space(x, .035)


CUES = [
    ('start-cube-wave', 723051, start_wave, -22.5, -9.5,
     'One pressure crest travels outwards from the center; matte cube lift, broad air, restrained low body.'),
    ('start-cube-fracture', 810263, fracture, -24.0, -10.5,
     'Independent porous-stone fractures and diminishing fine debris; trigger 0.70 seconds after start-cube-wave.'),
    ('deity-cube-assemble', 961733, assemble, -23.0, -10.0,
     'Air and individual block contacts move from the sides inward; softly seat at 1.015 seconds.'),
    ('deity-return-wave', 137819, return_wave, -22.5, -9.5,
     'Single matte cube tide pans continuously left to right and settles as the title image reconstructs.'),
    ('deity-inscribe', 287119, inscribe, -29.0, -15.0,
     'Four new irregular dry brush-fibre gestures for deity-space calligraphy; stereo follows the writing.'),
    ('deity-branch', 398821, branch, -30.0, -17.0,
     'Fine woody-fibre stretch and tiny bark contacts, a short organic growth sound.'),
    ('deity-hover', 421867, hover, -36.0, -24.5,
     'Continuous soft fibre brush; no impact or echo, 480–2050 Hz core, 25 ms onset and 80 ms release for avatar focus.'),
    ('deity-select', 562091, select, -29.0, -14.5,
     'Soft unglazed ceramic contact with a fine cloth tail; deity-avatar activation only.'),
    ('deity-confirm', 631913, confirm, -26.5, -12.0,
     'Warm damped stone seating with an airy fabric release; deity commitment only, no pitched chime.'),
    ('deity-back', 704177, back, -31.0, -17.0,
     'A short leftward cloth retreat with low soft contact before the return wave begins.'),
]


def db(value):
    return 20*np.log10(max(float(value), 1e-12))


def decode(ffmpeg, path):
    raw = subprocess.check_output([str(ffmpeg), '-v', 'error', '-i', str(path), '-f', 'wav',
                                   '-c:a', 'pcm_s16le', '-ac', '2', '-ar', str(SR), '-'])
    with wave.open(io.BytesIO(raw), 'rb') as stream:
        frames = stream.readframes(stream.getnframes())
    return np.frombuffer(frames, np.int16).reshape(-1, 2).astype(float)/32768


def find_ffmpeg():
    ffmpeg = os.environ.get('FFMPEG_BIN') or shutil.which('ffmpeg')
    if not ffmpeg:
        # Optional convenience on art workstations; never a runtime dependency.
        try:
            import imageio_ffmpeg
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass
    if not ffmpeg:
        raise SystemExit('Install FFmpeg with libopus support, or set FFMPEG_BIN.')
    return ffmpeg


def build(ffmpeg=None, names=None):
    ffmpeg = ffmpeg or find_ffmpeg()
    all_names = {cue[0] for cue in CUES}
    selected = all_names if names is None else set(names)
    if not selected or selected-all_names:
        raise ValueError(f'Unknown or empty cue selection: {names}')
    for folder in [OUT, WAV, RECORD]:
        folder.mkdir(parents=True, exist_ok=True)
    records = []
    for name, seed, make, rms_db, peak_db, description in CUES:
        if name not in selected:
            continue
        raw = make(np.random.default_rng(seed))
        x = soften(band(raw, 320, 2600), .025, .08) if name == 'deity-hover' else soften(band(raw, 62, 6500), .008, .085)
        rms, peak = np.sqrt(np.mean(x*x)), np.max(np.abs(x))
        x *= min(10**(rms_db/20)/max(rms,1e-9), 10**(peak_db/20)/max(peak,1e-9))
        master = WAV / (name+'.wav')
        dest = OUT / (name+'.ogg')
        write(master, SR, np.int16(np.clip(x, -1, 1)*32767))
        subprocess.run([str(ffmpeg), '-v', 'error', '-y', '-i', str(master), '-map_metadata', '-1',
                        '-c:a', 'libopus', '-b:a', '112k', '-application', 'audio', '-vbr', 'on', str(dest)], check=True)
        y = decode(ffmpeg, dest)
        record = {'name':name, 'file':dest.name,
                  'source':['Original procedural material synthesis / scripts/build-deity-audio.py'],
                  'design':description, 'loop':False, 'duration':round(len(y)/SR, 5), 'bytes':dest.stat().st_size,
                  'peakDbfs':round(db(np.max(np.abs(y))),2),
                  'truePeakDbfs':round(db(np.max(np.abs(resample_poly(y, 4, 1, axis=0)))),2),
                  'rmsDbfs':round(db(np.sqrt(np.mean(y*y))),2),
                  'boundaryStep':round(float(np.max(np.abs(y[0]-y[-1]))),6),
                  'seed':seed, 'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
                  'masterSha256':hashlib.sha256(master.read_bytes()).hexdigest()}
        if record['truePeakDbfs'] > -8 or record['boundaryStep'] > .001:
            raise ValueError(f'Unexpected peak or edge discontinuity: {record}')
        records.append(record)
    manifest_file = OUT/'manifest.json'
    manifest = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {'format':'Ogg Opus, 48 kHz stereo','assets':[]}
    updates = {record['name']:record for record in records}
    old_names = {record['name'] for record in manifest['assets']}
    manifest['assets'] = [updates.get(record['name'], record) for record in manifest['assets']]+[record for record in records if record['name'] not in old_names]
    manifest['processing'] = 'Edited CC0 title/settings foley; independently authored procedural deity/cube material sounds. Source links and design notes in SOURCES.md.'
    manifest_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    # Partial rebuilds retain all untouched design metadata, file bytes and order.
    report_file = RECORD/'design.json'
    report = json.loads(report_file.read_text(encoding='utf-8')) if report_file.exists() else {'created':'2026-11-08', 'authoring':'Original procedural synthesis; no input audio files or service API.',
              'sampleRate':SR, 'channels':2, 'preview':'output/audio-design/deity/deity-preview.wav',
              'truePeakMeasurement':'4x polyphase oversampling of the decoded delivery Opus waveform; dBFS.',
              'assets':[]}
    report_by_name = {record['name']:record for record in report['assets']}
    report_by_name.update(updates)
    report['assets'] = [report_by_name[cue[0]] for cue in CUES if cue[0] in report_by_name]
    hashes = [record['masterSha256'] for record in report['assets']]
    assert len(set(hashes)) == len(hashes), 'Every cue must have an independent waveform.'
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    # A new preview may reuse old local masters, but never re-encodes other cues.
    if all((WAV/(cue[0]+'.wav')).exists() for cue in CUES):
        masters = []
        for cue in CUES:
            sample_rate, master_pcm = read_wav(WAV/(cue[0]+'.wav'))
            if sample_rate != SR or master_pcm.dtype != np.int16:
                raise ValueError(f'Unexpected master WAV format: {cue[0]}')
            masters.extend([master_pcm, np.zeros((round(.28*SR),2), dtype=np.int16)])
        write(WAV/'deity-preview.wav', SR, np.concatenate(masters))
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', choices=[cue[0] for cue in CUES], help='Rebuild only these cues; preserve all others.')
    built = build(names=parser.parse_args().only)
    print(json.dumps({'files':len(built), 'bytes':sum(record['bytes'] for record in built),
                      'assets':[{key:record[key] for key in ['name','duration','peakDbfs','truePeakDbfs','rmsDbfs','boundaryStep']} for record in built]}, indent=2))
