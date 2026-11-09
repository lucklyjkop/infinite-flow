"""Author four original, restrained material cues for the tectonic world map.

Uses the project's procedural material primitives, never existing sound files.
Run independently; no installed game sound outside this set is re-encoded.
"""
from pathlib import Path
import hashlib
import json
import runpy
import subprocess

import numpy as np
from scipy.io.wavfile import write
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'loading-page/assets/audio'
MASTERS = ROOT / 'output/audio-design/world-map'
RECORD = ROOT / 'audio-source/world-map'
SR = 48000
MATERIAL = runpy.run_path(str(ROOT / 'scripts/build-deity-audio.py'))
band, soften, pan, lay, noise, friction, contact, space, canvas = (
    MATERIAL[name] for name in ['band', 'soften', 'pan', 'lay', 'noise', 'friction', 'contact', 'space', 'canvas'])


def uplift(rng):
    """One broad pressure ridge, followed by progressively smaller sediment."""
    duration = 2.35
    x = canvas(duration)
    t = np.arange(len(x)) / SR
    pressure = np.exp(-.5*((t-.95)/np.where(t<.95,.42,.50))**2)
    travel = np.clip((t-.18)/1.7,0,1)*1.30-.65
    low = noise(rng,duration,58,220)
    body = noise(rng,duration,170,940)
    upper = friction(rng,duration,720,3100,9)
    lay(x,pan(low*pressure,travel*.55),gain=.12)
    lay(x,pan(body*pressure,travel),gain=.075)
    lay(x,pan(upper*pressure**1.4,travel),gain=.027)
    # Large seams move only once. Nonuniform timing avoids a repeated click train.
    for at, gain, pitch in [(.24,.034,115),(.56,.043,139),(.93,.053,121),(1.28,.046,168),(1.57,.030,203)]:
        seam = soften(contact(rng,.34,pitch,.12),.025,.18)
        lay(x,pan(seam,-.6+1.2*at/1.7),at,gain)
    for at in np.sort(rng.uniform(1.46,2.11,19)):
        settling = contact(rng,rng.uniform(.07,.13),rng.uniform(410,980),.15)
        lay(x,pan(settling,rng.uniform(-.58,.68)),at,.015*np.exp(-(at-1.4)*2.8))
    return soften(space(x,.065),.15,.31)


def fold(rng):
    """A different inward pressure curve, not a reversed opening recording."""
    duration = 1.35
    x = canvas(duration)
    t = np.arange(len(x))/SR
    pressure = np.sin(np.clip((t-.015)/1.25,0,1)*np.pi)**1.8
    sweep = np.clip(t/1.08,0,1)*-1.12+.56
    lay(x,pan(noise(rng,duration,72,360)*pressure,sweep*.7),gain=.11)
    lay(x,pan(friction(rng,duration,310,2100,7)*pressure,sweep),gain=.055)
    for at, side, volume in [(.20,.52,.030),(.47,.21,.036),(.76,-.12,.027),(.95,-.42,.020)]:
        lay(x,pan(soften(contact(rng,.24,rng.uniform(165,245),.12),.022,.13),side),at,volume)
    lay(x,pan(soften(contact(rng,.26,132,.08),.03,.17),-.16),.93,.032)
    return soften(space(x,.045),.085,.25)


def focus(rng):
    duration = .22
    x = canvas(duration)
    t = np.arange(len(x))/SR
    # A smooth fibre contact rather than a hard pluck or bright notification ping.
    envelope = np.sin(np.linspace(0,np.pi,len(t)))**1.7
    fibre = noise(rng,duration,650,2150)*envelope
    jade = (np.sin(2*np.pi*610*t)*np.exp(-t*23)
            + .13*np.sin(2*np.pi*1378*t)*np.exp(-t*48))
    jade *= np.sin(np.minimum(t/.025,1)*np.pi/2)**2
    lay(x,pan(fibre,-.04),gain=.040)
    lay(x,pan(jade,.04),gain=.012)
    return soften(x,.027,.085)


def select(rng):
    x = canvas(.32)
    t = np.arange(len(x))/SR
    body = (np.sin(2*np.pi*329*t)*np.exp(-t*20)
            + .20*np.sin(2*np.pi*718*t)*np.exp(-t*39)
            + .07*np.sin(2*np.pi*1411*t)*np.exp(-t*62))
    body *= np.sin(np.minimum(t/.015,1)*np.pi/2)**2
    lay(x,pan(body),gain=.060)
    lay(x,pan(friction(rng,.24,370,2450,11),.09),.025,.032)
    return soften(space(x,.035),.015,.10)


CUES = [
    ('world-tectonic-rise',911091,uplift,-25.0,-12.0,
     'Single left-to-right low mineral pressure ridge, sparse rounded seams, and a gentle fine-sediment release; 2.35 seconds.'),
    ('world-tectonic-fold',911092,fold,-27.0,-13.0,
     'Independent inward settling gesture with lower-energy folded stone and a soft close; 1.35 seconds, not reversed opening audio.'),
    ('world-node-focus',911093,focus,-38.5,-26.0,
     'Continuous quiet fibre movement and barely audible damped jade resonance; no hard strike or click train; 0.22 seconds.'),
    ('world-node-select',911094,select,-31.0,-18.0,
     'Warm damped jade body and a restrained paper seating contact; stronger than focus but without a bright chime; 0.32 seconds.'),
]


def build(ffmpeg=None):
    ffmpeg = ffmpeg or MATERIAL['find_ffmpeg']()
    for path in [OUT,MASTERS,RECORD]:
        path.mkdir(parents=True,exist_ok=True)
    records = []
    preview = []
    for name,seed,generate,rms_db,peak_db,description in CUES:
        raw = generate(np.random.default_rng(seed))
        x = soften(band(raw,55,4200),.012,.07)
        x -= x.mean(axis=0)
        x = soften(x,.012,.07)
        rms,peak = np.sqrt(np.mean(x*x)),np.max(np.abs(x))
        x *= min(10**(rms_db/20)/max(rms,1e-9),10**(peak_db/20)/max(peak,1e-9))
        master,dest = MASTERS/(name+'.wav'),OUT/(name+'.ogg')
        pcm = np.int16(np.clip(x,-1,1)*32767)
        write(master,SR,pcm)
        subprocess.run([str(ffmpeg),'-v','error','-y','-i',str(master),'-map_metadata','-1',
                        '-c:a','libopus','-b:a','112k','-application','audio','-vbr','on',str(dest)],check=True)
        y = MATERIAL['decode'](ffmpeg,dest)
        db = MATERIAL['db']
        record = {'name':name,'file':dest.name,'source':['Original procedural synthesis / scripts/build-world-map-audio.py'],
                  'design':description,'loop':False,'duration':round(len(y)/SR,5),'bytes':dest.stat().st_size,
                  'peakDbfs':round(db(np.max(np.abs(y))),2),
                  'truePeakDbfs':round(db(np.max(np.abs(resample_poly(y,4,1,axis=0)))),2),
                  'rmsDbfs':round(db(np.sqrt(np.mean(y*y))),2),
                  'boundaryStep':round(float(np.max(np.abs(y[0]-y[-1]))),6),
                  'seed':seed,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),
                  'masterSha256':hashlib.sha256(master.read_bytes()).hexdigest()}
        if record['truePeakDbfs']>-10 or record['boundaryStep']>.001:
            raise ValueError(f'Unexpected peak or edge discontinuity: {record}')
        records.append(record)
        preview.extend([pcm,np.zeros((round(.45*SR),2),dtype=np.int16)])
    assert len({record['masterSha256'] for record in records})==len(CUES)
    write(MASTERS/'world-map-preview.wav',SR,np.concatenate(preview))
    report = {'created':'2026-11-09','authoring':'Original procedural synthesis. No input recording, API, sampled UI sound, or musical phrase.',
              'sampleRate':SR,'channels':2,'preview':'output/audio-design/world-map/world-map-preview.wav',
              'truePeakMeasurement':'4x polyphase oversampling of decoded delivery Opus; dBFS.',
              'assets':records}
    (RECORD/'design.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    manifest_path = OUT/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'format':'Ogg Opus, 48 kHz stereo','assets':[]}
    updates = {item['name']:item for item in records}
    old_names = {item['name'] for item in manifest['assets']}
    manifest['assets'] = [updates.get(item['name'],item) for item in manifest['assets']] + [item for item in records if item['name'] not in old_names]
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    return records


if __name__=='__main__':
    records=build()
    print(json.dumps({'files':len(records),'bytes':sum(item['bytes'] for item in records),'assets':records},indent=2))
