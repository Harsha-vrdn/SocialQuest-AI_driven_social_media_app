from io import BytesIO
from pathlib import Path

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_DIMENSION = 1920
JPEG_QUALITY = 82
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def validate_media_upload(upload, expected=None):
    """Return IMAGE or REEL after validating size and actual file contents."""
    if not upload:
        raise ValueError("Choose a file to upload.")
    size = getattr(upload, "size", 0) or 0
    if size <= 0:
        raise ValueError("The selected file is empty.")
    if size > MAX_UPLOAD_BYTES:
        raise ValueError("Files must be 50 MB or smaller.")

    content_type = (getattr(upload, "content_type", "") or "").lower()
    try:
        upload.seek(0)
        head = upload.read(32)
        upload.seek(0)
    except (AttributeError, OSError):
        raise ValueError("The selected file could not be read.")

    media_type = None
    try:
        with Image.open(upload) as source:
            source.verify()
        media_type = "IMAGE"
    except (OSError, Image.DecompressionBombError, UnidentifiedImageError, ValueError):
        # Common MP4/MOV/3GP containers use an ftyp box; WebM and Matroska
        # start with the EBML header. Do not accept a MIME label on its own.
        if (len(head) >= 12 and head[4:8] == b"ftyp") or head.startswith(b"\x1aE\xdf\xa3"):
            media_type = "REEL"
    finally:
        upload.seek(0)

    if media_type == "IMAGE" and content_type and not content_type.startswith("image/"):
        raise ValueError("The file contents do not match its image type.")
    if media_type == "REEL" and content_type and not content_type.startswith("video/"):
        raise ValueError("The file contents do not match its video type.")
    if not media_type:
        raise ValueError("Choose a valid image or supported video file.")
    if expected and media_type != expected:
        label = "photo" if expected == "IMAGE" else "video clip"
        raise ValueError(f"Choose a valid {label} for this upload.")
    return media_type


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
