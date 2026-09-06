from io import BytesIO
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_DIMENSION = 1920
JPEG_QUALITY = 82


def compress_image_upload(upload):
    """Resize and recompress a user-uploaded still image.

    Videos and invalid/non-image uploads are returned untouched so the existing
    validation and reel upload flows keep their current behavior. If no resize
    is needed, a larger recompression is discarded in favor of the original.
    """
    if not upload or not getattr(upload, "content_type", "").startswith("image/"):
        return upload

    try:
        upload.seek(0)
        with Image.open(upload) as source:
            if getattr(source, "is_animated", False):
                upload.seek(0)
                return upload
            image = ImageOps.exif_transpose(source).copy()
        original_dimensions = image.size
        image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

        has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
        output = BytesIO()
        stem = Path(upload.name or "upload").stem or "upload"
        if has_alpha:
            image.convert("RGBA").save(output, format="PNG", optimize=True, compress_level=9)
            name, content_type = f"{stem}.png", "image/png"
        else:
            image.convert("RGB").save(output, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            name, content_type = f"{stem}.jpg", "image/jpeg"

        compressed = output.getvalue()
        upload.seek(0)
        if image.size == original_dimensions and getattr(upload, "size", 0) and len(compressed) >= upload.size:
            return upload
        return SimpleUploadedFile(name, compressed, content_type=content_type)
    except (OSError, UnidentifiedImageError, ValueError):
        upload.seek(0)
        return upload
