#!/usr/bin/env python3
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def png_size(path: Path):
    data = path.read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), 'icon.png is not a PNG'
    assert data[12:16] == b'IHDR', 'icon.png missing IHDR'
    return struct.unpack('>II', data[16:24])


def main():
    brand = json.loads((ROOT / 'brand.json').read_text(encoding='utf-8'))
    assert brand.get('name') == '수니TV', 'brand name must be 수니TV'
    assert brand.get('version'), 'brand version missing'
    assert brand.get('icon_url') == 'https://raw.githubusercontent.com/pryins-bit/tiz/main/icon.png'

    icon = ROOT / 'icon.png'
    width, height = png_size(icon)
    assert width == height and width >= 256, f'launcher icon invalid: {width}x{height}'

    runtime = (ROOT / 'app' / 'brand-runtime.js').read_text(encoding='utf-8')
    assert 'brand.json' in runtime
    assert 'cache: \'no-store\'' in runtime
    assert "'t=' + Date.now()" in runtime
    assert 'runtime-brand-icon' in runtime
    assert 'SuniTVBrandDiagnostics' in runtime

    bootstrap = (ROOT / 'app' / 'bootstrap.js').read_text(encoding='utf-8')
    assert "'brand-runtime.js'" in bootstrap
    assert "injectScript('brand-runtime.js'" in bootstrap
    assert "var CACHE_KEY = 'korea_tv_runtime_cache_v3'" in bootstrap
    assert "PACKAGED_VERSION = '2026.08.17.5'" in bootstrap
    assert 'hasRequiredFiles' in bootstrap

    manifest = json.loads((ROOT / 'app' / 'runtime-version.json').read_text(encoding='utf-8'))
    assert manifest.get('files', [None])[0] == 'brand-runtime.js'

    sync = (ROOT / 'scripts' / 'sync_tizen_standalone.py').read_text(encoding='utf-8')
    assert "'brand-runtime.js'" in sync
    assert "shutil.copy2(ICON, DST / 'icon.png')" in sync

    stamp = (ROOT / '.github' / 'workflows' / 'stamp-runtime-version.yml').read_text(encoding='utf-8')
    assert "- 'app/brand-runtime.js'" in stamp
    assert "['brand-runtime.js', 'remote-input.js'" in stamp

    print(f'Branding contract OK: {brand["name"]}, icon {width}x{height}, runtime + launcher pipelines wired')


if __name__ == '__main__':
    main()
