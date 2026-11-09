"""Register generated transparent parts; crop/clean alpha only, no painting."""
from pathlib import Path
import json
import hashlib
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/live2d/hongzhuang/generated'
OUT = ROOT / 'art-source/live2d/hongzhuang/rig-layout'
OUT.mkdir(parents=True, exist_ok=True)
CANVAS = (1024, 1536)
layers = []
records = []

def cleaned(image):
    a = np.array(image.convert('RGBA'))
    labels, count = ndimage.label(a[:, :, 3] > 8)
    counts = np.bincount(labels.ravel())
    valid = counts >= 12
    valid[0] = False
    keep = valid[labels]
    # Preserve the immediate anti-aliased perimeter of genuine source components.
    keep = ndimage.binary_dilation(keep, iterations=1)
    a[:, :, 3][~keep] = 0
    a[:, :, 3][a[:, :, 3] <= 8] = 0
    result = Image.fromarray(a)
    return result.crop(result.getchannel('A').getbbox())

def source_part(file, crop=None):
    image = Image.open(SOURCE / file).convert('RGBA')
    return cleaned(image.crop(crop) if crop else image)

def add(name, image, rect, tags, source, source_crop=None, binding=True):
    key = name.replace(' ', '-'); path = OUT / (key + '.png')
    image.save(path)
    layer = {'id': key, 'name': name, 'image': {'path': path.name, 'width': image.width, 'height': image.height},
             'rect': dict(zip(('left', 'top', 'width', 'height'), rect)), 'tags': tags}
    if binding:
        layers.append(layer)
    records.append({'id': key, 'source': source, 'source_crop': source_crop, 'rect': layer['rect'],
                    'bound': binding, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

def part(name, file, crop, rect, tags, binding=True):
    add(name, source_part(file, crop), rect, tags, file, crop, binding)

part('back hair','hair-atlas.png',(0,0,512,512),(82,110,860,1080),['hair','back'])
part('topwear','body.png',None,(150,650,720,880),['top'])
part('face','face-base.png',None,(265,215,490,440),['face'])

# Keep only the UPPER lid in EYELASH. Its alpha-weighted column centreline is
# what PSD2Live bends on blink. Including the lower contour in that layer makes
# the two contours orbit their shared centroid and pulls the lower one onto the
# cheek. The lower contour instead closes with EYEWHITE, along the same curve.
for side, crop, rect in [('right',(0,0,543,420),(321,453,137,122)),('left',(543,0,1086,420),(554,453,137,122))]:
    eye = source_part('features-atlas.png', crop)
    rgba = np.array(eye)
    bright = (rgba[:,:,:3].mean(axis=2) > 170) & (rgba[:,:,3] > 8)
    first_white = np.where(bright.any(axis=0), bright.argmax(axis=0), eye.height*.60)
    upper_limit = np.minimum(first_white+1, eye.height*.60)
    upper_lash = (~bright) & (np.arange(eye.height)[:,None] < upper_limit[None,:])
    white = rgba.copy(); white[:,:,3][upper_lash] = 0
    lash = rgba.copy(); lash[:,:,3][~upper_lash] = 0
    add('eyewhite '+side,Image.fromarray(white),rect,['eye','white',side],'features-atlas.png',crop)
    # Tight crop changes raster extent only; compensate the placement so no
    # pixel moves in the neutral assembly. Avoid a tall transparent lash mesh.
    lash_image = Image.fromarray(lash)
    box = lash_image.getchannel('A').getbbox()
    x,y,w,h = rect
    lash_rect = (x+box[0]*w/eye.width,y+box[1]*h/eye.height,
                 (box[2]-box[0])*w/eye.width,(box[3]-box[1])*h/eye.height)
    add('eyelash '+side,lash_image.crop(box),lash_rect,['eye','lash',side],'features-atlas.png',crop)

part('irides right','features-atlas.png',(0,420,543,820),(366,479,80,90),['eye','iris','right'])
part('irides left','features-atlas.png',(543,420,1086,820),(566,479,80,90),['eye','iris','left'])
part('eyebrow right','features-atlas.png',(0,820,543,1120),(337,394,94,14),['brow','right'])
part('eyebrow left','features-atlas.png',(543,820,1086,1120),(570,394,94,14),['brow','left'])
# Archive the original closed smile, but do not bind it over the mouth surface.
# Crossfading a 50px smile over a 35px opening doubles the lips at every syllable.
part('mouth close','features-atlas.png',(0,1120,543,1448),(480,596,50,10),['mouth','closed'],binding=False)
# One continuous surface, with its 20% seam at y=601.6. The upper lip remains
# close to the original resting position while the lower lip opens downward.
part('mouth open','features-atlas.png',(543,1120,1086,1448),(488,598,35,18),['mouth','open'])
part('front hair','hair-atlas.png',(512,0,1024,512),(147,120,704,453),['hair','front'])
part('front hair right','hair-atlas.png',(0,512,512,1024),(225,420,140,440),['hair','front','right'])
part('front hair left','hair-atlas.png',(512,512,1024,1024),(660,420,140,440),['hair','front','left'])
part('front hair ahoge','hair-atlas.png',(0,1024,512,1536),(300,9,300,145),['hair','front'])
part('headwear','hair-atlas.png',(512,1024,1024,1536),(690,210,165,315),['headwear'])

layout = {'format':'psd2live-layout','version':1,'name':'hongzhuang','canvas':{'width':CANVAS[0],'height':CANVAS[1]},'layers':layers}
(OUT / 'hongzhuang.layout.json').write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
(OUT / 'registration.json').write_text(json.dumps({'processing':'Crop, alpha island cleanup, original-pixel upper-lash separation (lower contour stays with eye white), and coordinate registration only. No repainting.','layers':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
preview = Image.new('RGBA', CANVAS)
for layer in layers:
    r=layer['rect']; image=Image.open(OUT / layer['image']['path']).convert('RGBA').resize((round(r['width']),round(r['height'])),Image.Resampling.LANCZOS)
    preview.alpha_composite(image,(round(r['left']),round(r['top'])))
preview.save(OUT / 'layout-preview.png')
print(json.dumps({'layers':len(layers),'layout':str(OUT / 'hongzhuang.layout.json'),'preview':str(OUT / 'layout-preview.png')}))
