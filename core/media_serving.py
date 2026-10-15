"""Development-only public media delivery with single HTTP byte ranges.

AVFoundation probes MOV/MP4 files with Range: bytes=0-1 before loading tracks.
Django's development static view otherwise sends the entire file. Production
media should be served by a range-capable web server or object storage.
"""
import re
from pathlib import Path

from django.http import Http404, HttpResponse, HttpResponseNotAllowed, StreamingHttpResponse
from django.utils.http import parse_http_date_safe
from django.views.static import serve


def _byte_range(header, size):
    """Return (start, end), False for unsatisfiable, None to ignore the header.

    Multiple ranges and unknown/malformed range syntax are deliberately ignored
    (a full 200 response), as permitted by RFC 9110 section 14.2.
    """
    if not header or len(header) > 128:
        return None
    match = re.fullmatch(r"bytes=([0-9]*)-([0-9]*)", header.strip(), re.IGNORECASE)
    if not match or not any(match.groups()):
        return None
    first, last = match.groups()
    if first:
        start = int(first)
        end = int(last) if last else size - 1
        if last and start > end:
            return None
        if start >= size:
            return False
        return start, min(end, size - 1)
    suffix = int(last)
    if not suffix or not size:
        return False
    return max(0, size - suffix), size - 1


class _RangeStream:
    """Own the file handle, including cleanup on early disconnect."""
    def __init__(self, response, start, length):
        self.file = response.file_to_stream
        self.remaining = length
        self.file.seek(start)

    def __iter__(self):
        return self

    def __next__(self):
        if self.remaining <= 0:
            raise StopIteration
        chunk = self.file.read(min(self.remaining, 64 * 1024))
        if not chunk:
            raise StopIteration
        self.remaining -= len(chunk)
        return chunk

    def close(self):
        self.file.close()


def serve_media(request, path, document_root=None, **kwargs):
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET", "HEAD"])
    # Keep public media scoped to MEDIA_ROOT, including symlink resolution.
    # This endpoint must never become a route to the private attachment relay.
    root = Path(document_root).resolve()
    try:
        (root / path).resolve().relative_to(root)
    except (ValueError, OSError, RuntimeError):
        raise Http404("Media not found.")
    response = serve(request, path, document_root=document_root, show_indexes=False)
    response["Accept-Ranges"] = "bytes"
    if response.status_code != 200:
        return response  # Preserve Django's conditional 304 handling.
    if request.method == "HEAD":
        headers = dict(response.headers)
        response.file_to_stream.close()
        return HttpResponse(headers=headers)
    if_range = request.headers.get("If-Range")
    if if_range:
        # We expose Last-Modified, not an ETag. Unknown/weak ETags and stale
        # dates fall back to the full current representation, never mixed bytes.
        date = parse_http_date_safe(if_range)
        if date is None or date != parse_http_date_safe(response["Last-Modified"]):
            return response
    size = int(response["Content-Length"])
    selected = _byte_range(request.headers.get("Range"), size)
    if selected is None:
        return response
    if selected is False:
        response.file_to_stream.close()
        return HttpResponse(status=416, headers={"Content-Range": f"bytes */{size}", "Content-Length": "0", "Accept-Ranges": "bytes"})
    start, end = selected
    length = end - start + 1
    # Do NOT use FileResponse here: WSGI's file_wrapper can bypass the bounded
    # iterator and send the rest of the file despite a two-byte Content-Length.
    partial = StreamingHttpResponse(_RangeStream(response, start, length), status=206, headers=dict(response.headers))
    partial["Content-Length"] = str(length)
    partial["Content-Range"] = f"bytes {start}-{end}/{size}"
    return partial
