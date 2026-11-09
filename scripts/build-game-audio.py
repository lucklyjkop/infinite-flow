"""Prepare restrained UI foley from the CC0 recordings listed in SOURCES.md."""
from pathlib import Path
import json
import subprocess
import os
import shutil
import io
import wave
import runpy
import numpy as np
from scipy.signal import butter, sosfilt, resample_poly, find_peaks
from scipy.io.wavfile import write

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'audio-source'
OUT = ROOT / 'loading-page/assets/audio'
WAV = ROOT / 'output/audio-design/wav'
FF = os.environ.get('FFMPEG_BIN') or shutil.which('ffmpeg')
if not FF:
    raise SystemExit('Install FFmpeg with libopus support, or set FFMPEG_BIN to its executable path.')
SR = 48000
OUT.mkdir(parents=True, exist_ok=True)
WAV.mkdir(parents=True, exist_ok=True)
records = []

def read(path):
    raw = subprocess.check_output([str(FF), '-v', 'error', '-i', str(path), '-f', 'wav', '-c:a', 'pcm_s16le', '-ac', '2', '-ar', str(SR), '-'])
    with wave.open(io.BytesIO(raw), 'rb') as stream:
        frames = stream.readframes(stream.getnframes())
    return np.frombuffer(frames, np.int16).reshape(-1, 2).astype(np.float64) / 32768

def cut(x, start, duration):
    return x[round(start*SR):round((start+duration)*SR)].copy()

def filtered(x, lo=100, hi=5500):
    return sosfilt(butter(2, [lo, hi], btype='bandpass', fs=SR, output='sos'), x, axis=0)

def speed(x, rate):
    return resample_poly(x, 1000, round(rate*1000), axis=0)

def fade(x, attack=.01, release=.07):
    x = x.copy()
    a, b = min(len(x), round(attack*SR)), min(len(x), round(release*SR))
    if a: x[:a] *= (np.sin(np.linspace(0, np.pi/2, a))**2)[:, None]
    if b: x[-b:] *= (np.cos(np.linspace(0, np.pi/2, b))**2)[:, None]
    return x

def mix(duration, parts):
    x = np.zeros((round(duration*SR), 2))
    for at, signal, gain in parts:
        a = round(at*SR); n = min(len(signal), len(x)-a)
        if n > 0: x[a:a+n] += signal[:n] * gain
    return x

def normal(x, rms=.13, peak=.58):
    x = x - x.mean(axis=0)
    level = np.sqrt(np.mean(x*x))
    # Round rare microphone handling spikes before setting the mix level.
    # This keeps quiet fibres audible without sharp isolated pops.
    threshold = max(level * 5, 1e-8)
    x = np.tanh(x / threshold) * threshold
    level = np.sqrt(np.mean(x*x))
    return x * min(rms / max(level, 1e-9), peak / max(np.max(np.abs(x)), 1e-9))

def peak_clip(x, duration=.18, before=.008):
    # Select one contact rather than playing a prerecorded multi-bounce roll.
    mono = np.abs(x).mean(axis=1)
    p = int(np.argmax(mono))
    return cut(x, max(0, p/SR-before), duration)

def save(name, x, sources, description, loop=False, rms=.13, peak=.58):
    x = normal(x, rms, peak)
    if not loop: x = fade(x, .004, min(.06, len(x)/SR*.3))
    write(WAV / (name+'.wav'), SR, np.int16(np.clip(x, -1, 1)*32767))
    dest = OUT / (name+'.ogg')
    subprocess.run([str(FF), '-v', 'error', '-y', '-i', str(WAV/(name+'.wav')), '-c:a', 'libopus', '-b:a', '112k' if loop else '80k', '-vbr', 'on', str(dest)], check=True)
    y = read(dest)
    records.append({'name':name, 'file':dest.name, 'source':sources, 'design':description, 'loop':loop,
        'duration':round(len(y)/SR, 5), 'bytes':dest.stat().st_size,
        'peakDbfs':round(20*np.log10(max(np.max(np.abs(y)),1e-9)),2),
        'rmsDbfs':round(20*np.log10(max(np.sqrt(np.mean(y*y)),1e-9)),2),
        'boundaryStep':round(float(np.max(np.abs(y[0]-y[-1]))),6)})

rain = filtered(read(SOURCE/'rain/1.ogg'), 120, 5800)
n = round(1.4*SR)
w = np.linspace(0, np.pi/2, n)[:,None]
loop = np.concatenate([rain[n:-n], rain[-n:]*np.cos(w)+rain[:n]*np.sin(w)])
save('rain-loop', loop, ['Ylmir/rain/1.ogg'], 'Window rain; softened low/high ends; 1.4-second equal-power loop join.', True, .10, .45)

fire = filtered(read(SOURCE/'fire.ogg'), 180, 6000)
save('fire-burn', fade(cut(fire,.12,1.55),.12,.32), ['AntumDeluge/fire-1_0.ogg'], 'Short fireplace ignition/crackle, rounded onset and long ember tail.', rms=.15)

paper = {i:filtered(read(SOURCE/f'book/BookFlip{i}.wav'),180,5200) for i in [1,2,4,6,10,12]}
save('menu-open', fade(speed(paper[2],.9),.035,.16), ['Voltiment555/BookFlip2.wav'], 'One soft paper unfolding movement, low-passed with rounded release.')
save('menu-close', fade(speed(paper[4],.83),.02,.17), ['Voltiment555/BookFlip4.wav'], 'Separate slower paper fold with a soft closing contact.')
rustle = speed(paper[6],.73)
save('branch-grow', fade(cut(rustle,.04,.86),.12,.23), ['Voltiment555/BookFlip6.wav'], 'Low, fine fibre rustle shaped into an organic growth swell.', rms=.12)

writing = filtered(read(SOURCE/'writing.mp3'), 320, 5400)
# Find a sustained, quiet writing section without the initial handling sound.
energies = [(float(np.sqrt(np.mean(cut(writing,s,1.08)**2))),s) for s in np.arange(3,43,.5)]
target = np.median([v[0] for v in energies])
start = min(energies, key=lambda pair:abs(pair[0]-target))[1]
stroke = fade(cut(writing,start,1.08),.045,.13)
save('brush-write', stroke, ['JennaW_ksc/537718 writing'], f'Pencil-on-paper texture, softened into a dry brush stroke; source excerpt {start:.1f}s.', rms=.14)

dice = filtered(read(SOURCE/'dice.flac'), 120, 6500)
hit = fade(peak_clip(dice,.15),.002,.07)
save('dice-land', hit, ['Wuzzy/Holzwürfel_auf_Holztisch_2.flac'], 'One wooden-die contact; animation schedules actual diminishing bounces.', rms=.18, peak=.67)

touch = filtered(speed(hit,.78),180,3600)
short = fade(cut(touch,0,.11),.003,.055)
softpaper = fade(peak_clip(paper[10],.19),.016,.09)
save('ui-tap', mix(.19,[(0,short,.8),(.012,softpaper,.25)]), ['Wuzzy/dice','Voltiment555/BookFlip10.wav'], 'Muted paper-backed touch, short warm contact.', rms=.09, peak=.43)
save('ui-tab', fade(speed(softpaper,1.1),.012,.10), ['Voltiment555/BookFlip10.wav'], 'Light paper index sliding, softer and longer than a button.', rms=.09, peak=.40)
save('ui-toggle-on', mix(.18,[(0,speed(short,1.08),.8),(.058,speed(short,1.22),.38)]), ['Wuzzy/dice'], 'Two small upward contacts for engaging the plum toggle.', rms=.12, peak=.5)
save('ui-toggle-off', mix(.20,[(0,speed(short,.83),.65),(.075,speed(short,.73),.24)]), ['Wuzzy/dice'], 'Lower, softer settling contacts for releasing the toggle.', rms=.11, peak=.46)
slider = fade(cut(stroke,.27,.095),.014,.038)
save('ui-slider', filtered(slider,480,3900), ['JennaW_ksc/writing'], 'Quiet fibre rub for occasional slider value steps, no tonal beep.', rms=.075, peak=.27)
save('ui-select-open', fade(speed(paper[12],1.55),.026,.16), ['Voltiment555/BookFlip12.wav'], 'Small paper slip unfolding, shortened to a dropdown.', rms=.11, peak=.44)
save('ui-select', mix(.21,[(0,softpaper,.4),(.025,short,.6)]), ['Voltiment555/BookFlip10.wav','Wuzzy/dice'], 'Paper slip settling with a restrained selection contact.', rms=.10, peak=.43)
save('ui-save', mix(.34,[(0,speed(short,.67),.9),(.09,softpaper,.45)]), ['Wuzzy/dice','Voltiment555/BookFlip10.wav'], 'Low paper-stamp confirmation with a soft fibre tail.', rms=.14, peak=.56)
save('ui-back', fade(speed(softpaper,.74),.026,.16), ['Voltiment555/BookFlip10.wav'], 'Soft retreating paper movement.', rms=.09, peak=.4)

# An original, very quiet plucked-string overtone under the paper selection.
# Fast-damping upper partials keep this separate from the actual click contact.
t = np.arange(round(.32*SR))/SR
pluck = np.zeros_like(t)
for harmonic in range(1,13):
    pluck += np.sin(2*np.pi*392*harmonic*(1+.00012*harmonic*harmonic)*t) * np.exp(-t*(9+harmonic*3)) / harmonic**1.6
pluck *= np.sin(np.minimum(t/.014,1)*np.pi/2)**2
pluck = np.stack([pluck, pluck], axis=1)
save('ui-focus', mix(.32,[(0,softpaper,.30),(.015,pluck,.018)]), ['Voltiment555/BookFlip10.wav','Original plucked harmonic layer'], 'Paper index brush with a faint warm string resonance; distinct from button activation.', rms=.07, peak=.32)

(OUT/'manifest.json').write_text(json.dumps({'format':'Ogg Opus, 48 kHz stereo', 'processing':'Edited CC0 recorded foley; selection resonance composed in this script. Source links in SOURCES.md.', 'assets':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(records),'bytes':sum(x['bytes'] for x in records),'assets':records},ensure_ascii=False,indent=2))

# The deity scene has its own original material score. Rebuilding title/settings
# foley must not remove those independent entries from the shared manifest.
deity_builder = runpy.run_path(str(ROOT / 'scripts/build-deity-audio.py'))
deity_records = deity_builder['build'](ffmpeg=FF)
print(json.dumps({'independentDeityCues':len(deity_records), 'bytes':sum(x['bytes'] for x in deity_records)}))

# Retain the independent world-map score when rebuilding the shared sound bank.
world_builder = runpy.run_path(str(ROOT / 'scripts/build-world-map-audio.py'))
world_records = world_builder['build'](ffmpeg=FF)
print(json.dumps({'independentWorldCues':len(world_records), 'bytes':sum(x['bytes'] for x in world_records)}))
