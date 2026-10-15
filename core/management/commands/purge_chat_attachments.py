import time
import logging
from django.db import DatabaseError
from django.core.management.base import BaseCommand
from core.chat_attachments import purge_expired_attachments


class Command(BaseCommand):
    help = "Remove expiring encrypted relay files. Keep --watch running in production."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true")

    def handle(self, *args, **options):
        try:
            while True:
                try:
                    count = purge_expired_attachments()
                except (DatabaseError, OSError):
                    if not options["watch"]:
                        raise
                    logging.exception("Attachment cleanup failed; retrying in two seconds")
                    time.sleep(2)
                    continue
                if not options["watch"]:
                    self.stdout.write(f"Removed {count} expiring attachment(s).")
                    return
                time.sleep(2)
        except KeyboardInterrupt:
            pass
