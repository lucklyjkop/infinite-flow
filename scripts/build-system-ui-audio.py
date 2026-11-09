"""Author four short jade/light-metal gestures for the system-space interface.

Original modal synthesis only: no recordings, paper, rubbing or noise layers.
NumPy, SciPy and FFmpeg/libopus are the same tools used by the other audio scripts.
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
MASTERS = ROOT / 'output/audio-design/system-ui'
RECORD = ROOT / 'audio-source/system-ui'
SR = 48000
WORLD = runpy.run_path(str(ROOT / 'scripts/build-world-map-audio.py'))
MATERIAL = WORLD['MATERIAL']
modal, soften, pan, lay, space, canvas = (
    WORLD[name] for name in ['modal_strike','soften','pan','lay','space','canvas'])


def focus(rng):
    x = canvas(.16)
    lay(x,pan(modal(rng,.16,1040,33),-.025),gain=.05)
    return soften(space(x,.025),.004,.065)


def select(rng):
    x = canvas(.27)
    lay(x,pan(modal(rng,.13,370,37),-.035),gain=.019)
    lay(x,pan(modal(rng,.26,745,20),.035),.005,.06)
    return soften(space(x,.055),.004,.075)


def back(rng):
    x = canvas(.23)
    lay(x,pan(modal(rng,.23,475,24),-.025),gain=.06)
    return soften(space(x,.035),.005,.075)


def send(rng):
    x = canvas(.32)
    lay(x,pan(modal(rng,.19,770,25),-.075),gain=.04)
    lay(x,pan(modal(rng,.22,1085,23),.075),.083,.043)
    return soften(space(x,.045),.004,.075)


CUES = [
    ('system-ui-focus',911095,focus,-38.5,-26.0,
     'Quiet high jade overtone for moving between system controls; short inharmonic decay with no paper or noise; 0.16 seconds.'),
    ('system-ui-select',911096,select,-29.0,-16.5,
     'Small jade/light-metal contact with a warm grounded body for system activation; distinct from hover and paper folio sounds; 0.27 seconds.'),
    ('system-ui-back',911097,back,-33.0,-20.0,
     'Lower, softly damped jade resonance for closing a system panel or returning; no sliding or rubbing texture; 0.23 seconds.'),
    ('system-ui-send',911098,send,-30.0,-17.5,
     'A restrained upward pair of jade resonances for sending a message; no musical phrase or sampled notification sound; 0.32 seconds.'),
]


def build(ffmpeg=None, names=None):
    all_names = {cue[0] for cue in CUES}
    selected = all_names if names is None else set(names)
    if not selected or selected-all_names:
        raise ValueError(f'Unknown or empty cue selection: {names}')
    ffmpeg = ffmpeg or MATERIAL['find_ffmpeg']()
    for path in [OUT,MASTERS,RECORD]:
        path.mkdir(parents=True,exist_ok=True)
    records,preview = [],[]
    for name,seed,generate,rms_db,peak_db,description in CUES:
        if name not in selected:
            continue
        x = soften(MATERIAL['band'](generate(np.random.default_rng(seed)),90,5200),.004,.06)
        x -= x.mean(axis=0)
        x = soften(x,.004,.06)
        rms,peak = np.sqrt(np.mean(x*x)),np.max(np.abs(x))
        x *= min(10**(rms_db/20)/max(rms,1e-9),10**(peak_db/20)/max(peak,1e-9))
        master,dest = MASTERS/(name+'.wav'),OUT/(name+'.ogg')
        pcm = np.int16(np.clip(x,-1,1)*32767)
        write(master,SR,pcm)
        subprocess.run([str(ffmpeg),'-v','error','-y','-i',str(master),'-map_metadata','-1',
                        '-c:a','libopus','-b:a','112k','-application','audio','-vbr','on',str(dest)],check=True)
        y = MATERIAL['decode'](ffmpeg,dest)
        db = MATERIAL['db']
        record = {'name':name,'file':dest.name,'source':['Original procedural synthesis / scripts/build-system-ui-audio.py'],
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
        preview.extend([pcm,np.zeros((round(.4*SR),2),dtype=np.int16)])
    assert len({record['masterSha256'] for record in records})==len(selected)
    preview_name = 'system-ui-preview.wav' if names is None else 'system-ui-partial-preview.wav'
    write(MASTERS/preview_name,SR,np.concatenate(preview))
    if names is not None and all((MASTERS/(cue[0]+'.wav')).exists() for cue in CUES):
        full_preview = []
        for cue in CUES:
            rate,pcm = read_wav(MASTERS/(cue[0]+'.wav'))
            if rate != SR or pcm.dtype != np.int16:
                raise ValueError(f'Unexpected master WAV format: {cue[0]}')
            full_preview.extend([pcm,np.zeros((round(.4*SR),2),dtype=np.int16)])
        write(MASTERS/'system-ui-preview.wav',SR,np.concatenate(full_preview))
    report_path = RECORD/'design.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {
        'created':'2026-11-09','authoring':'Original damped modal synthesis; no recordings, API, noise layers or musical phrase.',
        'sampleRate':SR,'channels':2,'preview':'output/audio-design/system-ui/system-ui-preview.wav',
        'truePeakMeasurement':'4x polyphase oversampling of decoded delivery Opus; dBFS.','assets':[]}
    updates = {record['name']:record for record in records}
    by_name = {record['name']:record for record in report['assets']}
    by_name.update(updates)
    report['assets'] = [by_name[cue[0]] for cue in CUES if cue[0] in by_name]
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    manifest_path = OUT/'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {'format':'Ogg Opus, 48 kHz stereo','assets':[]}
    old_names = {item['name'] for item in manifest['assets']}
    manifest['assets'] = [updates.get(item['name'],item) for item in manifest['assets']] + [item for item in records if item['name'] not in old_names]
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
    return records


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',nargs='+',choices=[cue[0] for cue in CUES],help='Rebuild only these cues; preserve all other audio.')
    records = build(names=parser.parse_args().only)
    print(json.dumps({'files':len(records),'bytes':sum(record['bytes'] for record in records),
                      'assets':[{key:record[key] for key in ['name','duration','truePeakDbfs','rmsDbfs','boundaryStep']} for record in records]},indent=2))
