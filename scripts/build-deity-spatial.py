"""Prepare registered technical parallax layers from the approved NAI scene.

This is not a new character render. Both exported layers keep the original
3840x2160 camera framing. A source-space trimap preserves the raised hand,
thread, hair and cloth, and only the rear occlusion region is reconstructed.
Requires Pillow, NumPy, OpenCV and SciPy (art preparation only).
"""
from pathlib import Path
import argparse
import hashlib
import json

import cv2
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "loading-page/assets/deity-space"
SOURCE = ROOT / "art-source/imagegen/deity-space/nai-scene"
WORK = ROOT / "output/deity-spatial"
SIZE = (2048, 1152)

# All coordinates describe the NAI photograph at 2048x1152. The polygons are
# only trimap guides, never a replacement silhouette painted into the image.
OUTLINE = [
    (808,1116),(821,1067),(838,1011),(864,950),(863,897),(868,844),
    (885,775),(907,687),(925,609),(931,566),(928,516),(932,474),
    (946,444),(946,416),(950,398),(964,392),(978,399),(972,412),
    (983,421),(990,407),(1001,407),(1009,411),(1018,401),
    (1027,389),(1039,386),(1045,397),(1043,415),(1056,410),
    (1067,406),(1066,415),(1052,431),(1043,458),(1035,485),
    (1013,513),(991,535),(985,554),(988,583),(998,603),
    (1007,639),(1020,672),(1034,675),(1055,649),(1086,612),
    (1114,574),(1148,520),(1176,467),(1189,443),(1210,432),
    (1202,404),(1195,365),(1174,344),(1160,322),(1155,284),
    (1156,247),(1158,201),(1166,154),(1183,113),(1205,78),
    (1236,48),(1266,28),(1303,18),(1333,17),(1370,25),
    (1415,43),(1452,66),(1480,63),(1494,73),(1534,73),
    (1548,68),(1537,82),(1516,91),(1498,101),(1493,134),
    (1502,159),(1507,199),(1499,241),(1508,287),(1519,318),
    (1537,355),(1555,382),(1572,419),(1584,449),(1600,472),
    (1620,488),(1632,519),(1638,568),(1640,624),(1645,687),
    (1651,751),(1666,793),(1676,835),(1681,886),(1687,941),
    (1699,973),(1711,1022),(1727,1060),(1746,1108),(1760,1152),
    (862,1152),(856,1136),
]
# Open space between the hand, loose thread and shoulder remains background.
HAND_GAP = [(1049,445),(1080,418),(1136,407),(1177,415),(1181,434),
            (1160,475),(1126,533),(1094,576),(1063,616),(1043,647)]
BODY_GAP = [(1449,799),(1442,822),(1434,848),(1426,876),
            (1404,885),(1373,884),(1380,861),(1400,839),(1424,812)]
NECK_WISPS = [(1182,308),(1235,303),(1292,355),(1285,396),
              (1258,435),(1210,436),(1192,388)]


def polygon(points, shape):
    mask = np.zeros(shape, np.uint8)
    cv2.fillPoly(mask, [np.asarray(points, np.int32)], 1)
    return mask


def morph(mask, radius, operation):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1,) * 2)
    return operation(mask, k)


def smoothstep(lo, hi, value):
    t = np.clip((value - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def build(input_path, layers_only=False):
    WORK.mkdir(parents=True, exist_ok=True)
    SOURCE.mkdir(parents=True, exist_ok=True)
    DEST.mkdir(parents=True, exist_ok=True)
    original = Image.open(input_path).convert("RGB")
    if original.size != (3840, 2160):
        raise ValueError("This trimap is registered to the 3840x2160 NAI sanctuary scene.")
    rgb = np.asarray(original.resize(SIZE, Image.Resampling.LANCZOS))
    h, w = rgb.shape[:2]
    guide = polygon(OUTLINE, (h, w))
    for hole in (HAND_GAP, BODY_GAP):
        guide[polygon(hole, (h, w)) > 0] = 0
    sure = morph(guide, 7, cv2.erode)
    maybe = morph(guide, 16, cv2.dilate)
    labels = np.where(maybe, cv2.GC_PR_BGD, cv2.GC_BGD).astype(np.uint8)
    labels[guide > 0] = cv2.GC_PR_FGD
    labels[sure > 0] = cv2.GC_FGD
    wisps = polygon(NECK_WISPS, (h, w))
    labels[wisps > 0] = cv2.GC_PR_BGD
    # The thin thread must not be lost to a segmentation model's area prior.
    cv2.polylines(labels, [np.array([(1040,416),(1036,500),(1031,588),
                       (1028,662)], np.int32)], False, cv2.GC_FGD, 2)
    bg = np.zeros((1, 65), np.float64)
    fg = np.zeros((1, 65), np.float64)
    cv2.grabCut(rgb, labels, None, bg, fg, 5, cv2.GC_INIT_WITH_MASK)
    binary = np.uint8((labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD))
    # Remove isolated model specks but retain thin connected hair/thread.
    count, connected, stats, _ = cv2.connectedComponentsWithStats(binary, 8)
    for index in range(1, count):
        if stats[index, cv2.CC_STAT_AREA] < 15:
            binary[connected == index] = 0
    Image.fromarray(binary * 255).save(WORK / "segmentation.png")

    # Inpaint a low-resolution rear plate. Only the area behind the portrait
    # changes; original visible wall, light gradients and floor remain exact.
    hole = morph(binary, 12, cv2.dilate)
    # Fine detached hair also needs a clean plate, even when its alpha is low.
    neck_region = morph(wisps, 15, cv2.dilate)
    hole[neck_region > 0] = 1
    mini_size = (768, 432)
    mini = cv2.resize(rgb, mini_size, interpolation=cv2.INTER_AREA)
    mini_hole = cv2.resize(hole, mini_size, interpolation=cv2.INTER_NEAREST)
    filled = cv2.inpaint(mini, mini_hole, 7, cv2.INPAINT_TELEA)
    reconstructed = cv2.resize(filled, SIZE, interpolation=cv2.INTER_CUBIC).astype(np.float32)
    transition = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 2)
    plate = rgb.astype(np.float32) * (1 - transition[..., None]) + reconstructed * transition[..., None]

    # Recover subpixel coverage in a narrow band from the source and the clean
    # plate. This decontaminates the transparent hair rather than carrying a
    # dark rectangular copy of the old background with it.
    inside = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    outside = cv2.distanceTransform(1 - binary, cv2.DIST_L2, 5)
    alpha = smoothstep(-1.25, 1.8, inside - outside).astype(np.float32)
    confident = np.uint8(inside > 3)
    _, nearest = distance_transform_edt(1 - confident, return_indices=True)
    expected = rgb[nearest[0], nearest[1]].astype(np.float32)
    diff = rgb.astype(np.float32) - plate
    direction = expected - plate
    denominator = np.sum(direction * direction, axis=2)
    solved = np.clip(np.sum(diff * direction, axis=2) / np.maximum(denominator, 1), 0, 1)
    edge = (inside < 4) & (outside < 3) & (denominator > 120)
    alpha[edge] = solved[edge]
    alpha[inside >= 4] = 1
    alpha[outside >= 3] = 0
    # The open space under the fringe contains several dark, subpixel curls.
    # GrabCut's color-class prior tends to remove them and leave an opaque
    # triangle under the cheek. Recover their fractional coverage directly
    # against the unobstructed wall immediately to the left on the same rows.
    row_wall = np.median(rgb[:, 1120:1160].astype(np.float32), axis=1)
    wall = np.broadcast_to(row_wall[:, None, :], rgb.shape).copy()
    darkness = np.mean(wall - rgb.astype(np.float32), axis=2)
    hair_alpha = smoothstep(4, 30, darkness)
    # Extend the corrective region below the last loose curl. A hard trimap
    # edge immediately above the shoulder would expose a flat grey strip
    # when the portrait and back wall move in opposite directions.
    neck = (neck_region > 0) & (rgb[:, :, 0] < 110)
    hair_alpha[hair_alpha < .03] = 0
    alpha[neck] = hair_alpha[neck]
    # Remove the entire strand from the rear image, not just an alpha-weighted
    # fraction of it; a retained fraction becomes a second stationary hair.
    # Use one smooth wall field across the tiny open area, including the
    # silhouette's old edge reflection. Feather its perimeter instead of
    # preserving a pink/grey rectangular remnant directly above the shoulder.
    clean_distance = cv2.distanceTransform(neck_region, cv2.DIST_L2, 5)
    clean_weight = smoothstep(0, 8, clean_distance)
    plate = wall * clean_weight[..., None] + plate * (1 - clean_weight[..., None])
    alpha = cv2.GaussianBlur(alpha, (3, 3), .4)
    # Exact source recomposition is prioritized in fractional coverage pixels.
    foreground = np.clip((rgb.astype(np.float32) - plate * (1 - alpha[..., None])) /
                         np.maximum(alpha[..., None], .01), 0, 255)
    foreground[alpha < .01] = expected[alpha < .01]

    # Upsample masks/plate; recover full native source detail, never upscale the
    # photograph itself or shift an extracted figure into a new position.
    full_rgb = np.asarray(original).astype(np.float32)
    full_alpha = cv2.resize(alpha, original.size, interpolation=cv2.INTER_LINEAR)
    full_plate = cv2.resize(plate, original.size, interpolation=cv2.INTER_LINEAR)
    full_hole = cv2.resize(transition, original.size, interpolation=cv2.INTER_LINEAR)
    full_plate = full_plate * full_hole[..., None] + full_rgb * (1 - full_hole[..., None])
    full_fg = np.clip((full_rgb - full_plate * (1 - full_alpha[..., None])) /
                      np.maximum(full_alpha[..., None], .01), 0, 255)
    full_fg[full_alpha < .01] = cv2.resize(foreground, original.size,
                                          interpolation=cv2.INTER_LINEAR)[full_alpha < .01]
    rgba = np.dstack([np.rint(full_fg).astype(np.uint8),
                     np.rint(full_alpha * 255).astype(np.uint8)])
    Image.fromarray(np.rint(full_plate).astype(np.uint8)).save(DEST / "nai-plate.webp", lossless=True, method=6)
    Image.fromarray(rgba).save(DEST / "nai-portrait.webp", lossless=True, method=6)
    Image.fromarray(rgba).save(WORK / "portrait.png")
    Image.fromarray(np.rint(full_plate).astype(np.uint8)).save(WORK / "plate.png")
    # Square head-and-shoulders crop from the exact same source artwork.
    avatar_box = [2080, 0, 3100, 1020]
    if not layers_only:
        original.crop(avatar_box).resize((640, 640), Image.Resampling.LANCZOS).save(
            DEST / "nai-avatar.webp", quality=96, method=6)
    quantized_alpha = rgba[:, :, 3:4].astype(np.float32) / 255
    recomposed = rgba[:, :, :3] * quantized_alpha + full_plate * (1 - quantized_alpha)
    difference = np.abs(recomposed - full_rgb)
    Image.fromarray(np.uint8(np.clip(recomposed, 0, 255))).save(WORK / "neutral-recomposition.png")
    Image.fromarray(np.uint8(np.clip(difference * 8, 0, 255))).save(WORK / "neutral-error-x8.png")
    record = {
        "source": str(input_path.relative_to(ROOT)).replace("\\", "/"),
        "sourceSha256": hashlib.sha256(input_path.read_bytes()).hexdigest(),
        "size": list(original.size), "workingSize": list(SIZE),
        "method": "Source-registered trimap/GrabCut, narrow-band coverage inversion, rear occlusion inpaint",
        "newArtGenerated": False, "foregroundRepositioned": False,
        "model": "No downloaded segmentation model; OpenCV GrabCut 5 iterations",
        "rearPlate": "768x432 Telea radius 7, 12px subject safety dilation at 2048x1152; original visible pixels retained",
        "export": "Lossless RGBA/RGB WebP, same camera framing as original",
        "avatarCrop": avatar_box,
        "localRefinement": "Loose curls below left fringe: expanded fractional-coverage region, complete rear-strand removal, no straight mask edge above shoulder",
        "neutralCompositeMeanAbsoluteError": round(float(difference.mean()), 5),
        "neutralComposite99thPercentileError": round(float(np.percentile(difference, 99)), 5),
        "script": "scripts/build-deity-spatial.py",
    }
    (SOURCE / "spatial-preparation.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", default="art-source/imagegen/deity-space/nai-scene/nai-deity-scene-v1.4k.png")
    parser.add_argument("--layers-only", action="store_true", help="Leave the existing avatar unchanged")
    args = parser.parse_args()
    build((ROOT / args.source).resolve(), layers_only=args.layers_only)
