import tempfile
from pathlib import Path
from unittest.mock import patch

from django.http import FileResponse, Http404
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.urls import resolve

from .media_serving import serve_media


class MediaRangeTests(SimpleTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name) / 'media'
        self.root.mkdir()
        self.bytes = bytes(range(256)) * 1024
        (self.root / 'clip.mov').write_bytes(self.bytes)
        (self.root / 'empty.mp4').write_bytes(b'')
        self.factory = RequestFactory()

    def request(self, range_header=None, path='clip.mov', method='get', **headers):
        if range_header is not None:
            headers['HTTP_RANGE'] = range_header
        request = getattr(self.factory, method)('/media/' + path, **headers)
        response = serve_media(request, path, document_root=self.root)
        self.addCleanup(response.close)
        return response

    def content(self, response):
        return b''.join(response.streaming_content) if response.streaming else response.content

    def assertRange(self, header, start, end):
        response = self.request(header)
        self.assertEqual(response.status_code, 206)
        self.assertEqual(response['Content-Type'], 'video/quicktime')
        self.assertEqual(response['Accept-Ranges'], 'bytes')
        self.assertEqual(response['Content-Length'], str(end - start + 1))
        self.assertEqual(response['Content-Range'], f'bytes {start}-{end}/{len(self.bytes)}')
        self.assertEqual(self.content(response), self.bytes[start:end + 1])
        # WSGI must not bypass the range iterator with its whole-file wrapper.
        self.assertIsNone(getattr(response, 'file_to_stream', None))

    def test_iphone_two_byte_probe(self):
        self.assertRange('bytes=0-1', 0, 1)
        self.assertRange('Bytes=0-1', 0, 1)

    def test_seeking_and_open_ended_ranges(self):
        self.assertRange('bytes=100-199', 100, 199)
        self.assertRange('bytes=70000-150000', 70000, 150000)
        self.assertRange('bytes=1024-', 1024, len(self.bytes) - 1)

    def test_suffix_ranges_and_end_clamping(self):
        self.assertRange('bytes=-20', len(self.bytes) - 20, len(self.bytes) - 1)
        self.assertRange('bytes=-999999', 0, len(self.bytes) - 1)
        self.assertRange('bytes=10-999999', 10, len(self.bytes) - 1)

    def test_unsatisfiable_ranges(self):
        for header in ['bytes=262144-', 'bytes=999999-1000000', 'bytes=-0']:
            with self.subTest(header=header):
                response = self.request(header)
                self.assertEqual(response.status_code, 416)
                self.assertEqual(response['Content-Range'], f'bytes */{len(self.bytes)}')
                self.assertEqual(response['Content-Length'], '0')
                self.assertEqual(self.content(response), b'')

    def test_empty_file_full_and_ranged_requests(self):
        self.assertEqual(self.content(self.request(path='empty.mp4')), b'')
        response = self.request('bytes=0-1', path='empty.mp4')
        self.assertEqual(response.status_code, 416)
        self.assertEqual(response['Content-Range'], 'bytes */0')

    def test_full_download_and_ignored_range_syntax(self):
        for header in [None, 'items=0-1', 'bytes=0-1,3-4', 'bytes=-', 'bytes=9-3', 'bytes=abc-4', 'bytes=' + '9' * 500 + '-']:
            with self.subTest(header=header):
                response = self.request(header)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Content-Length'], str(len(self.bytes)))
                self.assertEqual(self.content(response), self.bytes)

    def test_head_has_full_length_and_no_body_even_with_range(self):
        response = self.request('bytes=0-1', method='head')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Length'], str(len(self.bytes)))
        self.assertEqual(self.content(response), b'')
        self.assertNotIn('Content-Range', response)

    def test_conditional_and_if_range_requests(self):
        last_modified = self.request()['Last-Modified']
        cached = self.request('bytes=0-1', HTTP_IF_MODIFIED_SINCE=last_modified)
        self.assertEqual(cached.status_code, 304)
        self.assertEqual(self.content(cached), b'')
        matched = self.request('bytes=0-1', HTTP_IF_RANGE=last_modified)
        self.assertEqual(matched.status_code, 206)
        self.assertEqual(self.content(matched), self.bytes[:2])
        for validator in ['Wed, 01 Jan 2020 00:00:00 GMT', 'invalid', '"unknown-tag"', 'W/"weak-tag"']:
            response = self.request('bytes=0-1', HTTP_IF_RANGE=validator)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.content(response), self.bytes)

    def test_missing_files_directory_and_path_escape_are_not_served(self):
        (Path(self.directory.name) / 'private.bin').write_bytes(b'private ciphertext')
        (self.root / 'escape.bin').symlink_to(Path(self.directory.name) / 'private.bin')
        for path in ['missing.mov', '.', '../private.bin', 'escape.bin']:
            with self.subTest(path=path), self.assertRaises(Http404):
                self.request(path=path)

    def test_file_closes_even_if_stream_is_never_started_or_stopped_early(self):
        for start_stream in [False, True]:
            file = (self.root / 'clip.mov').open('rb')
            full = FileResponse(file)
            with patch('core.media_serving.serve', return_value=full):
                response = self.request('bytes=0-199999')
            if start_stream:
                next(iter(response.streaming_content))
            response.close()
            self.assertTrue(file.closed)

    def test_media_endpoint_is_read_only(self):
        self.assertEqual(self.request(method='post').status_code, 405)

    @override_settings(DEBUG=True)
    def test_development_media_urls_use_range_aware_view(self):
        import importlib
        import socialquest.urls
        # static() registers media routes only when DEBUG=True at import time.
        from django.urls import clear_url_caches
        original_patterns = socialquest.urls.urlpatterns
        try:
            importlib.reload(socialquest.urls)
            clear_url_caches()
            self.assertEqual(resolve('/media/clip.mov').func, serve_media)
        finally:
            socialquest.urls.urlpatterns = original_patterns
            clear_url_caches()
