#!/usr/bin/env python3
import json
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

REQUIRED_KEYS = {
    *[str(i) for i in range(10)],
    'ChannelUp', 'ChannelDown',
    'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    'MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop',
}


def main():
    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    package_keys = set(package.get('keys', []))
    missing_package_keys = sorted(REQUIRED_KEYS - package_keys)
    assert not missing_package_keys, f'package.json missing remote keys: {missing_package_keys}'

    config_path = ROOT / 'tizen-standalone' / 'config.xml'
    config_root = ET.parse(config_path).getroot()
    tizen_ns = '{http://tizen.org/ns/widgets}'
    privileges = {
        node.attrib.get('name')
        for node in config_root.findall(f'{tizen_ns}privilege')
    }
    assert 'http://tizen.org/privilege/tv.inputdevice' in privileges, (
        'standalone config.xml must grant tv.inputdevice privilege'
    )

    index = (ROOT / 'app' / 'index.html').read_text(encoding='utf-8')
    for script in ('main.js', 'numeric-remote.js', 'remote-input.js'):
        assert f'src="{script}"' in index, f'app/index.html missing {script}'

    remote = (ROOT / 'app' / 'remote-input.js').read_text(encoding='utf-8')
    assert 'registerKeyBatch' in remote and 'registerKey(' in remote, (
        'remote-input.js must keep batch + individual registration fallback'
    )
    for name in REQUIRED_KEYS:
        assert repr(name) in remote, f'remote-input.js missing requested key {name}'
    for platform_key in ('VolumeUp', 'VolumeDown', 'VolumeMute', 'Home', 'Power'):
        assert repr(platform_key) not in remote, (
            f'remote-input.js must not register platform-default key {platform_key}'
        )

    numeric = (ROOT / 'app' / 'numeric-remote.js').read_text(encoding='utf-8')
    assert 'closePanelsForTuning' in numeric, 'numeric tuning must work when TV panels are open'
    assert "fireKey('ChannelUp', 427)" in numeric
    assert "fireKey('ChannelDown', 428)" in numeric
    assert 'if (panelsOpen()) return;' not in numeric, (
        'numeric input must not be discarded merely because the startup TV home is open'
    )

    sync = (ROOT / 'scripts' / 'sync_tizen_standalone.py').read_text(encoding='utf-8')
    assert "'remote-input.js'" in sync, 'standalone sync must include remote-input.js'

    print('Samsung remote input contract OK')


if __name__ == '__main__':
    main()
