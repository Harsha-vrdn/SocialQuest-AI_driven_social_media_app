import time
import logging
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from core.accounts import purge_due_accounts
from core.upload_cleanup import purge_deleted_uploads


class Command(BaseCommand):
    help = "Delete accounts whose 90-day recovery window has expired; supervise --watch in production."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true")

    def handle(self, *args, **options):
        try:
            while True:
                close_old_connections()
                try:
                    count = purge_due_accounts()
                    purge_deleted_uploads()
                except Exception:
                    if not options["watch"]:
                        raise
                    logging.exception("Account cleanup sweep failed; retrying in 30 seconds")
                    time.sleep(30)
                    continue
                if count or not options["watch"]:
                    self.stdout.write(f"Deleted {count} expired account(s).")
                if not options["watch"]:
                    return
                time.sleep(30)
        except KeyboardInterrupt:
            pass
