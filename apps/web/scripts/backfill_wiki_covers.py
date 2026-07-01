#!/usr/bin/env python3
"""One-off backfill: mirror any wiki page cover images still pointing at
Discord's CDN to permanent GCS storage.

Discord CDN attachment URLs (cdn.discordapp.com / media.discordapp.net) are
signed and expire after roughly 24-48 hours. Two bugs let raw Discord links
get saved as WikiPage.cover_image_url instead of being mirrored:
  - the staff "new page" / "edit page" routes never called the mirror step
  - mirror_to_gcs() silently fell back to the raw URL on any upload error

Both are now fixed (app/blueprints/wiki.py, app/gcs.py). This script
re-attempts the mirror for every page still on a Discord URL. Pages whose
Discord link has already expired (404) cannot be recovered here — those
need a fresh Discord attachment URL from a new bot wiki-sync run.

Run from apps/web/ directory:
    python scripts/backfill_wiki_covers.py            # dry run (default)
    python scripts/backfill_wiki_covers.py --apply     # actually write changes
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.db import db, WikiPage
from app.gcs import is_discord_cdn_url, resolve_cover_url


def main():
    apply_changes = '--apply' in sys.argv
    app = create_app()
    with app.app_context():
        pages = WikiPage.query.filter(WikiPage.cover_image_url != '').all()
        stale = [p for p in pages if is_discord_cdn_url(p.cover_image_url)]
        print(f'{len(pages)} pages have a cover image; {len(stale)} still point at Discord CDN.')
        if not stale:
            return

        if not apply_changes:
            print('\nDry run — not uploading to GCS. Pages that would be attempted:')
            for p in stale:
                print(f'  {p.slug}')
            print('\nRe-run with --apply to actually mirror these and write changes.')
            return

        mirrored, failed = [], []
        for p in stale:
            new_url = resolve_cover_url(p.cover_image_url, p.slug, app.config)
            if is_discord_cdn_url(new_url):
                failed.append(p.slug)
                continue
            mirrored.append(p.slug)
            p.cover_image_url = new_url

        if mirrored:
            db.session.commit()

        print(f'\nMirrored: {len(mirrored)}')
        for slug in mirrored:
            print(f'  ok    {slug}')
        print(f'\nStill failing (Discord link likely already expired — needs a fresh bot sync): {len(failed)}')
        for slug in failed:
            print(f'  fail  {slug}')


if __name__ == '__main__':
    main()
