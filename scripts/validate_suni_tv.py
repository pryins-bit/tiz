#!/usr/bin/env python3
import json
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def png_size(path: Path):
    data = path.read_bytes()
    assert data.startswith(b'\x89PNG\r\n\x1a\n'), 'icon.png is not a PNG'
    assert data[12:16] == b'IHDR', 'icon.png missing IHDR'
    return struct.unpack('>II', data[16:24])


def main():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    assert package.get('appName') == '수니TV', 'TizenBrew appName must be 수니TV'
    assert 'icon.png' in package.get('files', []), 'TizenBrew package must ship icon.png'

    icon = ROOT / 'icon.png'
    assert icon.exists(), 'icon.png missing'
    width, height = png_size(icon)
    assert width == height and width >= 256, f'launcher icon too small: {width}x{height}'

    config = ROOT / 'tizen-standalone' / 'config.xml'
    root = ET.parse(config).getroot()
    ns = {'w': 'http://www.w3.org/ns/widgets'}
    icon_node = root.find('w:icon', ns)
    name_node = root.find('w:name', ns)
    assert icon_node is not None and icon_node.attrib.get('src') == 'icon.png', 'standalone config must use icon.png'
    assert name_node is not None and (name_node.text or '').strip() == '수니TV', 'standalone app name must be 수니TV'

    index = (ROOT / 'app' / 'index.html').read_text(encoding='utf-8')
    assert '<title>수니TV</title>' in index
    assert '수니</span><span class="suni-tv">TV' in index
    assert 'KOREA TV' not in index, 'old in-app KOREA TV brand restored'
    assert '.mom-home.pip-active' in index, 'Mom OS side-panel CSS missing'
    assert '#video.mom-html5-pip' in index, 'HTML5 PIP fallback CSS missing'

    adapter = (ROOT / 'app' / 'avplay-adapter.js').read_text(encoding='utf-8')
    assert 'MOM_PIP_RECT = { x: 0, y: 0, width: 1240, height: 1080 }' in adapter
    assert 'setMomPip' in adapter and 'setFullscreen' in adapter
    assert 'api.open-meteo.com' in adapter
    assert '서울 강남' in adapter and '대구 대명동' in adapter
    assert '37.5172,35.8482' in adapter
    assert '127.0473,128.5771' in adapter
    assert 'raw.githubusercontent.com/pryins-bit/tiz/main/market.json' in adapter
    assert '삼성전자' not in adapter, 'stock names should come from GitHub market.json rather than hard-coded runtime rows'

    market = json.loads((ROOT / 'market.json').read_text(encoding='utf-8'))
    pairs = {(row.get('name'), row.get('symbol')) for row in market.get('stocks', [])}
    assert ('삼성전자', '005930.KS') in pairs
    assert ('SK하이닉스', '000660.KS') in pairs

    market_updater = (ROOT / 'scripts' / 'update_market.py').read_text(encoding='utf-8')
    assert 'query1.finance.yahoo.com/v8/finance/chart/' in market_updater
    assert "('삼성전자', '005930.KS')" in market_updater
    assert "('SK하이닉스', '000660.KS')" in market_updater

    workflow_path = ROOT / '.github' / 'workflows' / 'refresh-market.yml'
    assert workflow_path.exists(), 'market refresh workflow missing'
    workflow = workflow_path.read_text(encoding='utf-8')
    assert 'concurrency:' in workflow and 'mom-os-market-refresh' in workflow, 'market jobs must not overlap each other'
    assert 'git fetch origin main' in workflow, 'market publish must refresh remote main before push'
    assert 'git rebase origin/main' in workflow, 'market publish must rebase over concurrent main writes'
    assert 'for attempt in 1 2 3' in workflow, 'market publish must retry transient push races'
    assert 'git push origin HEAD:main' in workflow, 'market publish must explicitly target main after rebase'

    sync = (ROOT / 'scripts' / 'sync_tizen_standalone.py').read_text(encoding='utf-8')
    assert "ICON = ROOT / 'icon.png'" in sync
    assert "shutil.copy2(ICON, DST / 'icon.png')" in sync

    print('Suni TV branding + launcher icon + Mom PIP + dual weather + race-safe GitHub stock cache contract OK')


if __name__ == '__main__':
    main()
