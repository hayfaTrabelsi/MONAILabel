# Copyright (c) MONAI Consortium
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import logging
from typing import Optional

import cv2
import numpy as np
from PIL import Image
from monai.config import KeysCollection
from monai.data import ImageReader, MetaTensor
from monai.transforms import LoadImaged, MapTransform
from monai.utils import PostFix

logger = logging.getLogger(__name__)


class LoadImageTensord(MapTransform):
    def __init__(self, keys: KeysCollection, allow_missing_keys: bool = False, load_image_d=None) -> None:
        super().__init__(keys, allow_missing_keys)
        self.load_image_d = load_image_d

    def __call__(self, data):
        d = dict(data)

        use_default = True
        for i, key in enumerate(self.keys):
            if not isinstance(d[key], str):
                meta_dict_key = f"{key}_{PostFix.meta()}"
                meta_dict = d.get(meta_dict_key)
                if meta_dict is None:
                    d[meta_dict_key] = dict()
                    meta_dict = d.get(meta_dict_key)

                image_np = d[key]
                meta_dict["spatial_shape"] = image_np.shape[:-1]  # type: ignore
                meta_dict["original_channel_dim"] = -1  # type: ignore
                meta_dict["original_affine"] = None  # type: ignore

                d[key] = MetaTensor(image_np, meta=meta_dict)
                use_default = False

        if use_default:
            d = self.load_image_d(d)

        return d


class LoadImageExd(LoadImaged):
    def __call__(self, data, reader: Optional[ImageReader] = None):
        d = dict(data)

        ignore = False
        for i, key in enumerate(self.keys):
            # Support direct image in np (pass only transform)
            if not isinstance(d[key], str):
                ignore = True
                meta_dict_key = f"{key}_{self.meta_key_postfix[i]}"
                meta_dict = d.get(meta_dict_key)
                if meta_dict is None:
                    d[meta_dict_key] = dict()
                    meta_dict = d.get(meta_dict_key)

                image_np = d[key]
                meta_dict["spatial_shape"] = image_np.shape[:-1]  # type: ignore
                meta_dict["original_channel_dim"] = -1  # type: ignore
                meta_dict["original_affine"] = None  # type: ignore

                d[key] = MetaTensor(image_np, meta=meta_dict)
                continue

        if not ignore:
            d = super().__call__(d, reader)

        return d


class NormalizeLabeld(MapTransform):
    def __init__(self, keys: KeysCollection, allow_missing_keys: bool = False, value=1) -> None:
        super().__init__(keys, allow_missing_keys)
        self.value = value

    def __call__(self, data):
        d = dict(data)
        for key in self.keys:
            label = d[key]
            label[label > 0] = self.value
            d[key] = label
        return d


def apply_clahe_green_channel(image: np.ndarray, clip_limit: float = 2.0,
                               tile_grid_size: tuple = (8, 8)) -> np.ndarray:
    """
    Applique CLAHE exclusivement sur le canal vert de l'image RGB.
    L'hémoglobine absorbe la lumière verte, maximisant le contraste vasculaire.

    Args:
        image: Image RGB en uint8 (H, W, 3)
        clip_limit: Limitation du contraste CLAHE
        tile_grid_size: Taille de la grille adaptative

    Returns:
        Image RGB améliorée en uint8
    """
    if image.dtype != np.uint8:
        image = (image * 255).astype(np.uint8) if image.max() <= 1.0 else image.astype(np.uint8)

    b, g, r = cv2.split(image)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    g_clahe = clahe.apply(g)
    enhanced = cv2.merge((b, g_clahe, r))
    return enhanced


def preprocess_fundus(image: np.ndarray, target_size: int = 512) -> np.ndarray:
    """
    Pipeline complet de pré-traitement pour rétinographie:
    1. Resize
    2. CLAHE canal vert
    3. Normalisation [0, 1]

    Args:
        image: Image RGB (H, W, 3)
        target_size: Taille cible (carré)

    Returns:
        Image normalisée float32 (H, W, 3)
    """
    # Resize
    image = cv2.resize(image, (target_size, target_size), interpolation=cv2.INTER_LANCZOS4)

    # CLAHE sur canal vert
    image = apply_clahe_green_channel(image)

    # Normalisation [0, 1]
    image = image.astype(np.float32) / 255.0
    return image


def preprocess_for_model(image: np.ndarray, target_size: int = 512) -> np.ndarray:
    """
    Pré-traitement complet + conversion en tenseur (C, H, W) pour PyTorch.
    """
    image = preprocess_fundus(image, target_size)
    # HWC -> CHW
    image = np.transpose(image, (2, 0, 1))
    return image


def crop_fundus_circle(image: np.ndarray) -> np.ndarray:
    """
    Détecte et isole la zone circulaire du fond d'oeil (supprime les bords noirs).
    """
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    _, thresh = cv2.threshold(gray, 15, 255, cv2.THRESH_BINARY)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return image

    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)

    # Add small padding
    pad = 10
    x = max(0, x - pad)
    y = max(0, y - pad)
    w = min(image.shape[1] - x, w + 2 * pad)
    h = min(image.shape[0] - y, h + 2 * pad)

    return image[y:y+h, x:x+w]


def load_and_preprocess(image_path: str, target_size: int = 512) -> tuple:
    """
    Charge et pré-traite une image depuis un chemin.

    Returns:
        (image_originale, image_clahe, tensor_pour_modele)
    """
    image = cv2.imread(image_path)
    if image is None:
        raise FileNotFoundError(f"Cannot load image: {image_path}")
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    # Crop circle
    image_cropped = crop_fundus_circle(image_rgb)

    # CLAHE version for display
    image_resized = cv2.resize(image_cropped, (target_size, target_size), interpolation=cv2.INTER_LANCZOS4)
    image_clahe = apply_clahe_green_channel(image_resized)

    # Tensor for model
    tensor = preprocess_for_model(image_cropped, target_size)

    return image_resized, image_clahe, tensor
