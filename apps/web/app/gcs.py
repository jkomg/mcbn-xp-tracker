"""Google Cloud Storage helpers for wiki image mirroring."""

from __future__ import annotations

import logging
import os
import re
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Discord CDN hostnames whose URLs expire
_DISCORD_CDN_HOSTS = {'cdn.discordapp.com', 'media.discordapp.net'}

_GCS_PUBLIC_BASE = 'https://storage.googleapis.com'


def is_discord_cdn_url(url: str) -> bool:
    if not url:
        return False
    try:
        return urlparse(url).hostname in _DISCORD_CDN_HOSTS
    except Exception:
        return False


def is_gcs_url(url: str, bucket: str) -> bool:
    if not url:
        return False
    return url.startswith(f'{_GCS_PUBLIC_BASE}/{bucket}/')


def _ext_from_url(url: str) -> str:
    path = urlparse(url).path
    _, ext = os.path.splitext(path)
    ext = ext.split('?')[0].lower()
    return ext if ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp') else '.jpg'


def mirror_to_gcs(
    url: str,
    slug: str,
    bucket_name: str,
    credentials_json: str = '',
    credentials_file: str = '',
) -> str:
    """Download *url* from Discord CDN and upload to GCS. Returns the public GCS URL.

    Falls back to the original *url* on any error so the caller can still save.
    """
    if not url or not is_discord_cdn_url(url):
        return url

    try:
        import requests as _requests
        from google.cloud import storage as _gcs
        from google.oauth2 import service_account as _sa
        import json as _json

        # Build credentials
        scopes = ['https://www.googleapis.com/auth/devstorage.read_write']
        if credentials_json:
            info = _json.loads(credentials_json)
            creds = _sa.Credentials.from_service_account_info(info, scopes=scopes)
        elif credentials_file and os.path.exists(credentials_file):
            creds = _sa.Credentials.from_service_account_file(credentials_file, scopes=scopes)
        else:
            # Fall back to application default credentials (works on Cloud Run)
            creds = None

        client = _gcs.Client(credentials=creds)
        bucket = client.bucket(bucket_name)

        # Download image
        resp = _requests.get(url, timeout=30)
        resp.raise_for_status()
        content_type = resp.headers.get('Content-Type', 'image/jpeg').split(';')[0].strip()

        ext = _ext_from_url(url)
        # Sanitize slug for use as an object name
        safe_slug = re.sub(r'[^a-z0-9\-_]', '-', slug.lower())
        object_name = f'wiki-covers/{safe_slug}{ext}'

        blob = bucket.blob(object_name)
        blob.upload_from_string(resp.content, content_type=content_type)

        gcs_url = f'{_GCS_PUBLIC_BASE}/{bucket_name}/{object_name}'
        logger.info('Mirrored %s → %s', url, gcs_url)
        return gcs_url

    except Exception as exc:
        logger.warning('GCS mirror failed for slug=%s: %s', slug, exc)
        return url


def resolve_cover_url(url: str, slug: str, config) -> str:
    """Resolve a wiki page's cover image URL for permanent storage.

    Discord CDN URLs are signed and expire (~24-48h), so any cover image
    left pointing at cdn.discordapp.com/media.discordapp.net will go dead.
    This mirrors those to GCS; non-Discord URLs pass through unchanged.

    *config* is a Flask app config (or any object with .get()) providing
    GCS_BUCKET_NAME, GOOGLE_CREDENTIALS_JSON, GOOGLE_CREDENTIALS_FILE.
    """
    if not url or not is_discord_cdn_url(url):
        return url
    return mirror_to_gcs(
        url=url,
        slug=slug,
        bucket_name=config.get('GCS_BUCKET_NAME', 'mcbn-wiki-images'),
        credentials_json=config.get('GOOGLE_CREDENTIALS_JSON', ''),
        credentials_file=config.get('GOOGLE_CREDENTIALS_FILE', ''),
    )
