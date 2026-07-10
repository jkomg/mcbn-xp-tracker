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
