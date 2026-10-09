import time
from django.core.management.base import BaseCommand
from core.notification_delivery import deliver_pending


class Command(BaseCommand):
    help = 'Deliver queued device notifications; run --watch alongside Django.'

    def add_arguments(self, parser):
        parser.add_argument('--watch', action='store_true')

    def handle(self, *args, **options):
        try:
            while True:
                count = deliver_pending()
                if not options['watch']:
                    self.stdout.write(f'Processed {count} queued deliveries.')
                    return
                time.sleep(2)
        except KeyboardInterrupt:
            pass
