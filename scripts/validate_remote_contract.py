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
RUNTIME_FILES = {'remote-input.js', 'numeric-remote.js', 'main.js', 'style.css'}


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
    assert 'src="bootstrap.js"' in index, 'app/index.html must launch through bootstrap.js'
    for script in ('main.js', 'numeric-remote.js', 'remote-input.js'):
        assert f'src="{script}"' not in index, (
            f'app/index.html must not bypass the updater by loading {script} directly'
        )

    manifest = json.loads((ROOT / 'app' / 'runtime-version.json').read_text(encoding='utf-8'))
    assert manifest.get('version'), 'runtime-version.json missing version'
    assert set(manifest.get('files', [])) == RUNTIME_FILES, 'runtime manifest file set mismatch'

    bootstrap = (ROOT / 'app' / 'bootstrap.js').read_text(encoding='utf-8')
    assert 'CHECK_BUDGET_MS = 450' in bootstrap, 'launch update check must keep 450ms budget'
    assert 'runtime-version.json' in bootstrap
    assert 'raw.githubusercontent.com/pryins-bit/tiz/main/app/' in bootstrap
    assert 'Promise.race' in bootstrap, 'bootstrap must race update check against launch budget'
    assert 'refreshForNextLaunch' in bootstrap, 'slow-network updates must be cached for next launch'
    assert 'runPackaged' in bootstrap, 'bootstrap needs packaged offline fallback'
    for name in RUNTIME_FILES:
        assert name in bootstrap, f'bootstrap missing runtime file {name}'

    remote = (ROOT / 'app' / 'remote-input.js').read_text(encoding='utf-8')
    assert 'registerKeyBatch' in remote and 'registerKey(' in remote, (
        'remote-input.js must keep batch + individual registration fallback'
    )
    assert 'getSupportedKeys' in remote and 'codeToName' in remote, (
        'remote input must derive firmware-specific key codes dynamically'
    )
    for name in REQUIRED_KEYS:
        assert repr(name) in remote, f'remote-input.js missing requested key {name}'
    for fallback_code in ('403:', '406:', '447:', '450:', '427:', '428:'):
        assert fallback_code in remote, f'remote-input.js missing fallback code {fallback_code}'
    for platform_key in ('VolumeUp', 'VolumeDown', 'VolumeMute', "'Home'", "'Power'"):
        assert platform_key not in remote, (
            f'remote-input.js must not register platform-default key {platform_key}'
        )

    numeric = (ROOT / 'app' / 'numeric-remote.js').read_text(encoding='utf-8')
    assert 'KoreaTVPlayer.tuneToNumber' in numeric, 'numeric tuning must call the direct player API once'
    assert "fireKey('ChannelUp'" not in numeric and "fireKey('ChannelDown'" not in numeric, (
        'numeric tuning must not synthesize repeated channel-zap key events'
    )
    assert 'for (var i = 0; i < count;' not in numeric, (
        'numeric tuning must not loop through intermediate channels'
    )

    main_js = (ROOT / 'app' / 'main.js').read_text(encoding='utf-8')
    assert 'playbackGeneration' in main_js and 'samePlayback' in main_js, (
        'player callbacks must ignore stale source generations'
    )
    assert 'clearVideoHandlers' in main_js, 'player teardown must detach old video handlers before source removal'
    assert 'ZAP_DEBOUNCE_MS' in main_js and 'event.repeat' in main_js, (
        'physical channel zapping must suppress key-repeat storms'
    )
    assert "key === 'ArrowUp' || key === 'ChannelUp'" in main_js
    assert 'requestChannelChange(-1, event)' in main_js, 'up/channel-up must move to previous playlist item'
    assert "key === 'ArrowDown' || key === 'ChannelDown'" in main_js
    assert 'requestChannelChange(1, event)' in main_js, 'down/channel-down must move to next playlist item'
    for color_name in ('ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'):
        assert f"key === '{color_name}'" in main_js, f'main.js missing semantic color handling for {color_name}'
    assert '447:' in main_js and '450:' in main_js, 'main.js needs old Samsung color-code fallback'
    assert 'window.KoreaTVPlayer' in main_js and 'tuneToNumber: tuneToNumber' in main_js

    sync = (ROOT / 'scripts' / 'sync_tizen_standalone.py').read_text(encoding='utf-8')
    for name in ('bootstrap.js', 'runtime-version.json', 'remote-input.js'):
        assert repr(name) in sync, f'standalone sync must include {name}'

    print('Samsung remote + race-safe player + launch updater contract OK')


if __name__ == '__main__':
    main()
