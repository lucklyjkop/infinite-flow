"""Package the exported original Hongzhuang rig without tool caches or binaries."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

ROOT=Path(__file__).resolve().parents[2]
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--input',type=Path,default=ROOT/'output/hongzhuang-live2d/bound')
args=ap.parse_args();source=args.input.resolve(strict=True)
runtime=ROOT/'loading-page/assets/live2d/hongzhuang'
editable=ROOT/'art-source/live2d/hongzhuang/model'
runtime.mkdir(parents=True,exist_ok=True);editable.mkdir(parents=True,exist_ok=True)
entry=source/'hongzhuang.layout.model3.json'
model=json.loads(entry.read_text(encoding='utf-8'))
refs=model['FileReferences']
paths=[refs['Moc'],refs['Physics'],refs['DisplayInfo'],*refs['Textures']]
paths.extend(e['File'] for e in refs.get('Expressions',[]))
paths.extend(m['File'] for items in refs.get('Motions',{}).values() for m in items)
for rel in paths:
    target=runtime/rel;target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copy2(source/rel,target)
(runtime/'hongzhuang.model3.json').write_bytes((json.dumps(model,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
for name in ['hongzhuang.psd2live','hongzhuang.psd','hongzhuang.layout.cmo3','hongzhuang.layout.can3','hongzhuang.layout.psd2live.json']:
    shutil.copy2(source/name,editable/name)
operation=json.loads((source/'.binding-run/operations.json').read_text(encoding='utf-8'))
record={'generator':'PSD2Live 3.6.7 portable','runtime':'Cubism 5.0 MOC v5',
        'tool_executable_sha256':operation['executable_sha256'],'layout_sha256':operation['layout_sha256'],
        'settings':operation['settings'],'source':'18 registered layers from built-in image generation; no borrowed character model',
        'runtime_files':[{ 'file':str(p.relative_to(runtime)).replace('\\','/'),'bytes':p.stat().st_size,
                          'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(runtime.rglob('*')) if p.is_file() and p.name!='manifest.json']}
(editable/'binding-record.json').write_bytes((json.dumps(record,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
print(json.dumps({'entry':str(runtime/'hongzhuang.model3.json'),'runtime_files':len(record['runtime_files']),'editable':str(editable)}))
