"""Import our PNG layout into an installed PSD2Live portable and export Cubism.

No service credentials are needed. A short-lived loopback-only MCP process is
owned by this command. The portable application and proxy are external tools,
not redistributed with this project.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--portable', type=Path, required=True, help='Path to PSD2Live.exe')
    parser.add_argument('--proxy-source', type=Path, required=True, help='Directory containing upstream mcp_proxy.py')
    parser.add_argument('--layout', type=Path, default=ROOT/'art-source/live2d/hongzhuang/rig-layout/hongzhuang.layout.json')
    parser.add_argument('--output', type=Path, default=ROOT/'output/hongzhuang-live2d/bound')
    parser.add_argument('--head-strength', type=float, default=.32)
    parser.add_argument('--body-strength', type=float, default=.24)
    parser.add_argument('--mesh-spacing', type=int, default=24)
    parser.add_argument('--heap-mib', type=int, default=1536)
    args = parser.parse_args()
    args.portable = args.portable.resolve(strict=True)
    args.proxy_source = args.proxy_source.resolve(strict=True)
    args.layout = args.layout.resolve(strict=True)
    args.output = args.output.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0,str(args.proxy_source))
    import mcp_proxy
    from mcp_proxy import Client
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',0)); port=probe.getsockname()[1]
    token=secrets.token_urlsafe(32)
    endpoint=f'http://127.0.0.1:{port}/mcp';mcp_proxy.ENDPOINT=endpoint
    work=args.output/'.binding-run';work.mkdir(exist_ok=True)
    env=os.environ.copy();env['JAVA_TOOL_OPTIONS']=f'-Xmx{args.heap_mib}m -XX:ActiveProcessorCount=2'
    settings={'atlasSize':2048,'meshSpacing':args.mesh_spacing,'headStrength':args.head_strength,
              'bodyStrength':args.body_strength,'generateDeformers':True,'generatePhysics':True,
              'seeThroughEyes':False,'seeThroughBrows':False,'exportCmo3':True,'exportMoc3':True,
              'exportJson':True,'exportMotions':True,
              # The wide chibi eye has a thin upper lash, not a whole outline.
              # Close within the aperture and keep the iris rebound subtle.
              'rigTuning':{'blinkCorner':28,'blinkDepth':30,'eyelashSquash':65,
                           'irisJellyStretch':3,'irisJellySquash':1.5}}
    records={'tool':'PSD2Live portable','executable_sha256':hashlib.sha256(args.portable.read_bytes()).hexdigest(),
             'layout_sha256':hashlib.sha256(args.layout.read_bytes()).hexdigest(),'settings':settings,'operations':{}}
    record_path=work/'operations.json'
    def record(step,result):
        records['operations'][step]=result
        record_path.write_bytes((json.dumps(records,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
        print(step,flush=True)
    with (work/'server.log').open('w',encoding='utf-8') as log:
        process=subprocess.Popen([str(args.portable),'mcp','--port',str(port),'--token',token,'--store',str(work/'workspace'),'--profile','core'],
                                 cwd=args.portable.parent,env=env,stdout=log,stderr=log,
                                 creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        try:
            deadline=time.monotonic()+90
            while True:
                if process.poll() is not None: raise RuntimeError('PSD2Live exited; see '+str(work/'server.log'))
                try:
                    with socket.create_connection(('127.0.0.1',port),timeout=.5):break
                except OSError:
                    if time.monotonic()>deadline:raise TimeoutError('PSD2Live did not become ready')
                    time.sleep(.25)
            with Client(endpoint=endpoint,token=token,timeout=240) as client:
                record('import',client.edit('project_import_layout',path=str(args.layout)))
                record('settings',client.edit('settings_update',changes=settings))
                record('generate',client.edit('rig_generate'))
                record('save',client.edit('project_save_as',path=str(args.output/'hongzhuang.psd2live')))
                record('export_psd',client.edit('project_export_psd',path=str(args.output/'hongzhuang.psd'),scale=1,include_generated_layers=False))
                record('export',client.edit('project_export_model',output_directory=str(args.output)))
                record('overview',client.call('workspace_overview',{'limit':100})[0])
            for suffix in ['moc3','cmo3','model3.json']:
                paths=list(args.output.glob('*.'+suffix))
                if not paths:raise RuntimeError('Missing exported '+suffix)
                for path in paths:print(f'{path.name}: {path.stat().st_size} bytes',flush=True)
        finally:
            if process.poll() is None:
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
