#!/usr/bin/env python3
"""Generate the balanced optimal-transport map used by the homepage morph.

The browser only needs the resulting compact assignment. Keeping the expensive
linear-sum solve here makes the shipped interaction fast and deterministic.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment


ROOT = Path(__file__).resolve().parents[1]
SOURCE_IMAGE = ROOT / "assets" / "img" / "ben-ballyk.jpg"
TARGET_IMAGE = ROOT / "assets" / "img" / "megin-scan.jpg"
OUTPUT = ROOT / "assets" / "data" / "image-transport-map.json"
GRID_SIZE = 48


def sample_image(path: Path) -> np.ndarray:
    """Return a GRID_SIZE square of sRGB samples in row-major order."""

    with Image.open(path) as image:
        sampled = image.convert("RGB").resize(
            (GRID_SIZE, GRID_SIZE), Image.Resampling.LANCZOS
        )
    return np.asarray(sampled, dtype=np.float32).reshape(-1, 3) / 255.0


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert an array of sRGB triples to perceptual CIE Lab coordinates."""

    linear = np.where(
        rgb <= 0.04045,
        rgb / 12.92,
        ((rgb + 0.055) / 1.055) ** 2.4,
    )
    transform = np.array(
        [
            [0.4124564, 0.3575761, 0.1804375],
            [0.2126729, 0.7151522, 0.0721750],
            [0.0193339, 0.1191920, 0.9503041],
        ],
        dtype=np.float32,
    )
    xyz = linear @ transform.T
    xyz /= np.array([0.95047, 1.0, 1.08883], dtype=np.float32)

    delta = 6.0 / 29.0
    threshold = delta**3
    f_xyz = np.where(
        xyz > threshold,
        np.cbrt(xyz),
        xyz / (3.0 * delta**2) + 4.0 / 29.0,
    )
    lab = np.empty_like(f_xyz)
    lab[:, 0] = 116.0 * f_xyz[:, 1] - 16.0
    lab[:, 1] = 500.0 * (f_xyz[:, 0] - f_xyz[:, 1])
    lab[:, 2] = 200.0 * (f_xyz[:, 1] - f_xyz[:, 2])
    return lab


def transport_features(rgb: np.ndarray) -> np.ndarray:
    """Combine perceptual colour with a light spatial regularizer."""

    lab = srgb_to_lab(rgb)
    lab[:, 0] /= 100.0
    lab[:, 1:] /= 128.0

    axis = (np.arange(GRID_SIZE, dtype=np.float32) + 0.5) / GRID_SIZE
    x, y = np.meshgrid(axis, axis)
    spatial = np.column_stack((x.ravel(), y.ravel())) * 0.18
    return np.column_stack((lab, spatial)).astype(np.float32)


def squared_distance_matrix(source: np.ndarray, target: np.ndarray) -> np.ndarray:
    source_norm = np.sum(source * source, axis=1, keepdims=True)
    target_norm = np.sum(target * target, axis=1, keepdims=True).T
    distances = source_norm + target_norm - 2.0 * source @ target.T
    return np.maximum(distances, 0.0, out=distances)


def main() -> None:
    source = transport_features(sample_image(SOURCE_IMAGE))
    target = transport_features(sample_image(TARGET_IMAGE))
    source_indices, target_indices = linear_sum_assignment(
        squared_distance_matrix(source, target)
    )

    assignment = np.empty(GRID_SIZE * GRID_SIZE, dtype=np.uint16)
    assignment[source_indices] = target_indices

    payload = {
        "gridSize": GRID_SIZE,
        "particleCount": int(assignment.size),
        "method": "Balanced discrete optimal transport in CIE Lab and image space",
        "targetIndexForSource": assignment.tolist(),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {assignment.size} transport assignments to {OUTPUT}")


if __name__ == "__main__":
    main()
