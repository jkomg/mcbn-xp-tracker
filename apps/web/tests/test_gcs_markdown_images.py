from unittest.mock import patch

from app.gcs import mirror_markdown_images


def test_leaves_non_discord_urls_unchanged():
    markdown = 'Text\n\n![](https://example.com/pic.png)\n\nMore text'
    assert mirror_markdown_images(markdown, 'loc-test', {}) == markdown


def test_leaves_markdown_with_no_images_unchanged():
    markdown = 'Just some **text** with no images at all.'
    assert mirror_markdown_images(markdown, 'loc-test', {}) == markdown


def test_mirrors_discord_cdn_images_and_rewrites_links():
    markdown = (
        '### Alice · 2026-07-01\n\n'
        'check this out\n\n'
        '![](https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc)\n\n'
        '---\n\n'
        '### Bob · 2026-07-02\n\n'
        '![](https://media.discordapp.net/attachments/3/4/other.jpg?ex=def)'
    )
    config = {'GCS_BUCKET_NAME': 'mcbn-wiki-images'}
    with patch('app.gcs.mirror_to_gcs') as mocked:
        mocked.side_effect = [
            'https://storage.googleapis.com/mcbn-wiki-images/wiki-body/loc-test/aaa.png',
            'https://storage.googleapis.com/mcbn-wiki-images/wiki-body/loc-test/bbb.jpg',
        ]
        result = mirror_markdown_images(markdown, 'loc-test', config)

    assert mocked.call_count == 2
    assert 'https://storage.googleapis.com/mcbn-wiki-images/wiki-body/loc-test/aaa.png' in result
    assert 'https://storage.googleapis.com/mcbn-wiki-images/wiki-body/loc-test/bbb.jpg' in result
    assert 'cdn.discordapp.com' not in result
    assert 'media.discordapp.net' not in result
    # Non-image text is untouched
    assert '### Alice · 2026-07-01' in result
    assert 'check this out' in result


def test_falls_back_to_original_url_when_mirroring_fails():
    markdown = '![](https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc)'
    config = {'GCS_BUCKET_NAME': 'mcbn-wiki-images'}
    with patch('app.gcs.mirror_to_gcs') as mocked:
        mocked.return_value = 'https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc'
        result = mirror_markdown_images(markdown, 'loc-test', config)
    assert result == markdown


# --- mirror_to_gcs: skip-if-exists and the per-process client ---------------

from unittest.mock import MagicMock  # noqa: E402

import pytest  # noqa: E402

import app.gcs as gcs  # noqa: E402

DISCORD_URL = 'https://cdn.discordapp.com/attachments/1/2/photo.png?ex=abc'


@pytest.fixture
def fake_storage(monkeypatch):
    """A storage client whose blob reports *exists* as the test sets it."""
    monkeypatch.setattr(gcs, '_clients', {})
    blob = MagicMock()
    client = MagicMock()
    client.bucket.return_value.blob.return_value = blob
    built = []

    def _new_client(credentials_json, credentials_file):
        built.append((credentials_json, credentials_file))
        return client

    # CI's web job doesn't install google-cloud-storage; nothing here needs it.
    monkeypatch.setattr(gcs, '_new_client', _new_client)
    return blob, built


def _fake_get(monkeypatch):
    resp = MagicMock()
    resp.__enter__.return_value = resp
    resp.headers = {'Content-Type': 'image/png'}
    resp.content = b'png-bytes'
    get = MagicMock(return_value=resp)
    monkeypatch.setattr('requests.get', get)
    return get


def test_skip_if_exists_does_not_download_an_existing_object(fake_storage, monkeypatch):
    blob, _ = fake_storage
    blob.exists.return_value = True
    get = _fake_get(monkeypatch)

    url = gcs.mirror_to_gcs(DISCORD_URL, 'abc123', 'bkt', object_prefix='wiki-body/p',
                            skip_if_exists=True)

    assert url == 'https://storage.googleapis.com/bkt/wiki-body/p/abc123.png'
    get.assert_not_called()
    blob.upload_from_string.assert_not_called()


def test_skip_if_exists_uploads_a_missing_object(fake_storage, monkeypatch):
    blob, _ = fake_storage
    blob.exists.return_value = False
    get = _fake_get(monkeypatch)

    url = gcs.mirror_to_gcs(DISCORD_URL, 'abc123', 'bkt', object_prefix='wiki-body/p',
                            skip_if_exists=True)

    assert url == 'https://storage.googleapis.com/bkt/wiki-body/p/abc123.png'
    get.assert_called_once()
    blob.upload_from_string.assert_called_once_with(b'png-bytes', content_type='image/png')


def test_failed_exists_check_still_uploads(fake_storage, monkeypatch):
    blob, _ = fake_storage
    blob.exists.side_effect = RuntimeError('403')
    _fake_get(monkeypatch)

    url = gcs.mirror_to_gcs(DISCORD_URL, 'abc123', 'bkt', skip_if_exists=True)

    assert url.startswith('https://storage.googleapis.com/bkt/')
    blob.upload_from_string.assert_called_once()


def test_storage_client_is_built_once_per_process(fake_storage, monkeypatch):
    blob, built = fake_storage
    blob.exists.return_value = True
    _fake_get(monkeypatch)

    for _ in range(5):
        gcs.mirror_to_gcs(DISCORD_URL, 'abc123', 'bkt', skip_if_exists=True)

    assert len(built) == 1


def test_cover_object_name_follows_the_image_not_just_the_page(fake_storage, monkeypatch):
    blob, _ = fake_storage
    blob.exists.return_value = True
    _fake_get(monkeypatch)
    config = {'GCS_BUCKET_NAME': 'bkt'}

    first = gcs.resolve_cover_url(DISCORD_URL, 'char-alice', config)
    # Same attachment, rotated signature: same object.
    resigned = gcs.resolve_cover_url(DISCORD_URL.replace('ex=abc', 'ex=zzz'), 'char-alice', config)
    # A different attachment: a different object.
    other = gcs.resolve_cover_url(
        'https://cdn.discordapp.com/attachments/9/9/new.png?ex=abc', 'char-alice', config)

    assert first == resigned
    assert first != other
    assert first.startswith('https://storage.googleapis.com/bkt/wiki-covers/char-alice-')
