from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


class Command(BaseCommand):
    help = 'Create a persistent local Web Push signing key, without printing the private key.'

    def handle(self, *args, **options):
        path = Path(settings.WEBPUSH_PRIVATE_KEY)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            self.stdout.write('Existing Web Push signing key preserved.')
            return
        key = ec.generate_private_key(ec.SECP256R1())
        data = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        with path.open('xb') as output:
            path.chmod(0o600)
            output.write(data)
        self.stdout.write('Web Push signing key configured.')
