"""Author four original, restrained material cues for the tectonic world map.

Uses the project's procedural material primitives, never existing sound files.
Run independently; no installed game sound outside this set is re-encoded.
"""
from pathlib import Path
import argparse
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


def modal_strike(rng, duration, fundamental, decay=20, attack=.004):
    """A small solid body ringing in inharmonic modes, without a friction layer."""
    t = np.arange(round(duration*SR))/SR
    x = np.zeros(len(t))
    # Non-harmonic modes distinguish jade/light metal from a synthesized beep.
    for i, (ratio, level) in enumerate([(1,1), (2.31,.29), (3.77,.11), (5.43,.035)]):
        frequency = fundamental*ratio*rng.uniform(.995,1.005)
        phase = 2*np.pi*frequency*(t+.003*(1-np.exp(-34*t))/34)
        x += level*np.sin(phase+rng.uniform(-.025,.025))*np.exp(-t*(decay+i*21))
    return soften(x,attack,min(.075,duration*.4))


def focus(rng):
    x = canvas(.18)
    lay(x,pan(modal_strike(rng,.18,830,29),-.03),gain=.05)
    return soften(space(x,.025),.005,.065)


def select(rng):
    x = canvas(.34)
    # A grounded stone contact under a clear, quickly damped jade resonance.
    lay(x,pan(modal_strike(rng,.16,295,34),-.04),gain=.025)
    lay(x,pan(modal_strike(rng,.32,635,17),.04),.008,.065)
    return soften(space(x,.06),.004,.09)


CUES = [
    ('world-tectonic-rise',911091,uplift,-25.0,-12.0,
     'Single left-to-right low mineral pressure ridge, sparse rounded seams, and a gentle fine-sediment release; 2.35 seconds.'),
    ('world-tectonic-fold',911092,fold,-27.0,-13.0,
     'Independent inward settling gesture with lower-energy folded stone and a soft close; 1.35 seconds, not reversed opening audio.'),
    ('world-node-focus',911093,focus,-38.0,-26.0,
     'Quiet, short jade overtone for node focus; only damped solid-body modes, no paper, fibre or noise layer; 0.18 seconds.'),
    ('world-node-select',911094,select,-30.5,-17.5,
     'Grounded stone contact and clear, briefly ringing jade modes for world selection; no paper or friction layer; 0.34 seconds.'),
]


def build(ffmpeg=None, names=None):
    all_names = {cue[0] for cue in CUES}
    selected = all_names if names is None else set(names)
    if not selected or selected-all_names:
        raise ValueError(f'Unknown or empty cue selection: {names}')
    ffmpeg = ffmpeg or MATERIAL['find_ffmpeg']()
    for path in [OUT,MASTERS,RECORD]:
        path.mkdir(parents=True,exist_ok=True)
    records = []
    preview = []
    for name,seed,generate,rms_db,peak_db,description in CUES:
        if name not in selected:
            continue
        raw = generate(np.random.default_rng(seed))
        attack = .004 if name.startswith('world-node-') else .012
        x = soften(band(raw,55,4200),attack,.07)
        x -= x.mean(axis=0)
        x = soften(x,attack,.07)
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
    assert len({record['masterSha256'] for record in records})==len(selected)
    preview_name = 'world-map-preview.wav' if names is None else 'world-node-preview.wav'
    write(MASTERS/preview_name,SR,np.concatenate(preview))
    report_path = RECORD/'design.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {
        'created':'2026-11-09','authoring':'Original procedural synthesis. No input recording, API, sampled UI sound, or musical phrase.',
        'sampleRate':SR,'channels':2,'preview':'output/audio-design/world-map/world-map-preview.wav',
        'truePeakMeasurement':'4x polyphase oversampling of decoded delivery Opus; dBFS.','assets':[]}
    by_name = {record['name']:record for record in report['assets']}
    by_name.update({record['name']:record for record in records})
    report['assets'] = [by_name[cue[0]] for cue in CUES if cue[0] in by_name]
    report['interactionRevision'] = 'jade-stone-2026-11-09'
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    manifest_path = OUT/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'format':'Ogg Opus, 48 kHz stereo','assets':[]}
    updates = {item['name']:item for item in records}
    old_names = {item['name'] for item in manifest['assets']}
    manifest['assets'] = [updates.get(item['name'],item) for item in manifest['assets']] + [item for item in records if item['name'] not in old_names]
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    return records


if __name__=='__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', nargs='+', choices=[cue[0] for cue in CUES], help='Rebuild only these cues; preserve all other asset bytes and records.')
    records=build(names=parser.parse_args().only)
    print(json.dumps({'files':len(records),'bytes':sum(item['bytes'] for item in records),'assets':records},indent=2))
