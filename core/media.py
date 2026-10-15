from io import BytesIO
from pathlib import Path
import warnings

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image, ImageOps, UnidentifiedImageError


MAX_IMAGE_DIMENSION = 1920
JPEG_QUALITY = 82
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 60 * 1024 * 1024
MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES  # Largest supported media upload.
MAX_IMAGE_PIXELS = 40_000_000
IMAGE_TYPES = {
    "image/jpeg": ("JPEG", {".jpg", ".jpeg"}),
    "image/png": ("PNG", {".png"}),
    "image/gif": ("GIF", {".gif"}),
    "image/webp": ("WEBP", {".webp"}),
}
VIDEO_TYPES = {
    "video/mp4": {".mp4", ".m4v"},
    "video/quicktime": {".mov"},
    "video/3gpp": {".3gp"},
    "video/webm": {".webm"},
}


def validate_media_upload(upload, expected=None):
    """Validate declared MIME, extension, size and image/container signature.

    Image contents are verified with Pillow. Video signatures check the
    container rather than trusting a caller-supplied video/* MIME label.
    """
    if not upload:
        raise ValueError("Choose a file to upload.")
    content_type = (getattr(upload, "content_type", "") or "").split(";", 1)[0].strip().lower()
    suffix = Path(upload.name or "").suffix.lower()
    if content_type in IMAGE_TYPES:
        media_type, limit, extensions = "IMAGE", MAX_IMAGE_BYTES, IMAGE_TYPES[content_type][1]
    elif content_type in VIDEO_TYPES:
        media_type, limit, extensions = "REEL", MAX_VIDEO_BYTES, VIDEO_TYPES[content_type]
    else:
        raise ValueError("Choose a supported image or video MIME type.")
    size = getattr(upload, "size", 0) or 0
    if size <= 0:
        raise ValueError("The selected file is empty.")
    if size > limit:
        raise ValueError("Images must be 10 MB or smaller." if media_type == "IMAGE" else "Videos must be 60 MB or smaller.")
    if suffix not in extensions:
        raise ValueError("The filename extension does not match the media type.")
    if expected and media_type != expected:
        raise ValueError("Choose a valid photo for this upload." if expected == "IMAGE" else "Choose a valid video clip for this upload.")
    try:
        upload.seek(0)
        if media_type == "IMAGE":
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(upload) as source:
                    if source.format != IMAGE_TYPES[content_type][0]:
                        raise ValueError("The file contents do not match its image type.")
                    if source.width * source.height > MAX_IMAGE_PIXELS:
                        raise ValueError("The image dimensions are too large.")
                    source.verify()
        else:
            head = upload.read(4096)
            brand = head[8:12]
            bmff = len(head) >= 12 and head[4:8] == b"ftyp" and int.from_bytes(head[:4], "big") >= 12
            if content_type == "video/mp4":
                valid = bmff and brand in {b"isom", b"iso2", b"iso3", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"MSNV", b"dash"}
            elif content_type == "video/quicktime":
                valid = bmff and brand == b"qt  "
            elif content_type == "video/3gpp":
                valid = bmff and brand.startswith(b"3gp")
            else:
                valid = head.startswith(b"\x1aE\xdf\xa3") and b"\x42\x82\x84webm" in head
            if not valid:
                raise ValueError("The file contents do not match its video type.")
    except (OSError, AttributeError, Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError):
        raise ValueError("Choose a valid image or supported video file.")
    finally:
        try:
            upload.seek(0)
        except (AttributeError, OSError, ValueError):
            pass
    upload.content_type = content_type
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
        if len(compressed) > MAX_IMAGE_BYTES or (image.size == original_dimensions and getattr(upload, "size", 0) and len(compressed) >= upload.size):
            return upload
        return SimpleUploadedFile(name, compressed, content_type=content_type)
    except (OSError, UnidentifiedImageError, ValueError):
        upload.seek(0)
        return upload
