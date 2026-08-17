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
RUNTIME_FILES = {'brand-runtime.js', 'remote-input.js', 'numeric-remote.js', 'avplay-adapter.js', 'main.js', 'style.css'}


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
    assert config_root.attrib.get('version') == '0.5.0', 'R6 standalone manifest version must be 0.5.0'

    index = (ROOT / 'app' / 'index.html').read_text(encoding='utf-8')
    assert 'src="bootstrap.js"' in index, 'app/index.html must launch through bootstrap.js'
    for script in ('brand-runtime.js', 'main.js', 'numeric-remote.js', 'remote-input.js', 'avplay-adapter.js'):
        assert f'src="{script}"' not in index, (
            f'app/index.html must not bypass the updater by loading {script} directly'
        )
    assert '$WEBAPIS/webapis/webapis.js' in index, 'Samsung AVPlay WebAPI library must load in the shell'
    assert 'type="application/avplayer"' in index, 'Samsung AVPlay object missing from shell'
    assert 'data-action="watch-tv"' in index, 'installed shell must retain TV 보기 action for rollback compatibility'
    assert "SHELL_BUILD = '2026.08.17.6'" in index, 'R6 shell startup rescue must be present'
    assert '<script async src="https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js"></script>' in index, (
        'external hls.js must never block initial HTML parsing'
    )
    assert "nativeFetch('korea.m3u?t='" in index and 'LOCAL_DELAY_MS = 120' in index, (
        'installed shell must race a hanging remote playlist against the packaged playlist'
    )

    manifest = json.loads((ROOT / 'app' / 'runtime-version.json').read_text(encoding='utf-8'))
    assert manifest.get('version'), 'runtime-version.json missing version'
    assert set(manifest.get('files', [])) == RUNTIME_FILES, 'runtime manifest file set mismatch'

    bootstrap = (ROOT / 'app' / 'bootstrap.js').read_text(encoding='utf-8')
    assert 'CHECK_BUDGET_MS = 450' in bootstrap, 'launch update check must keep 450ms budget'
    assert 'runtime-version.json' in bootstrap
    assert 'raw.githubusercontent.com/pryins-bit/tiz/main/app/' in bootstrap
    assert 'cdn.jsdelivr.net/gh/pryins-bit/tiz@main/app/' in bootstrap, 'runtime updater needs a second trusted CDN source'
    assert 'PLAYLIST_FALLBACK_TIMEOUT_MS = 1800' in bootstrap, 'playlist fetch must have a finite Samsung-TV deadline'
    assert "PLAYLIST_LOCAL = 'korea.m3u'" in bootstrap, 'standalone must know its packaged playlist fallback'
    assert "CACHE_KEY = 'korea_tv_runtime_cache_v3'" in bootstrap, (
        'R5+ shell must ignore stale pre-rescue runtime caches after shell replacement'
    )
    assert "PACKAGED_VERSION = '2026.08.17.5'" in bootstrap, 'packaged runtime baseline must retain the R5 cache boundary'
    assert 'installPlaylistFetchFallback' in bootstrap and 'timedFetch' in bootstrap and 'firstOk' in bootstrap, (
        'bootstrap must prevent a hanging raw GitHub playlist request from blocking startup forever'
    )
    assert 'Promise.race' in bootstrap, 'bootstrap must race update check against launch budget'
    assert 'refreshForNextLaunch' in bootstrap, 'slow-network updates must be cached for next launch'
    assert 'runPackaged' in bootstrap, 'bootstrap needs packaged offline fallback'
    for name in RUNTIME_FILES:
        assert name in bootstrap, f'bootstrap missing runtime file {name}'
    assert bootstrap.index("injectScript('brand-runtime.js'") < bootstrap.index("injectScript('remote-input.js'"), (
        'bootstrap runtime order changed unexpectedly'
    )
    assert bootstrap.index("injectScript('avplay-adapter.js'") < bootstrap.index("injectScript('main.js'"), (
        'AVPlay adapter must still load before main.js for forward compatibility'
    )

    brand_runtime = (ROOT / 'app' / 'brand-runtime.js').read_text(encoding='utf-8')
    legacy_channel_only = 'legacy-channel-only' in brand_runtime

    remote = (ROOT / 'app' / 'remote-input.js').read_text(encoding='utf-8')
    assert 'registerKeyBatch' in remote and 'registerKey(' in remote, (
        'remote-input.js must keep batch + individual registration fallback'
    )
    assert 'getSupportedKeys' in remote and 'codeToName' in remote, (
        'remote input must derive firmware-specific key codes dynamically'
    )
    assert 'names = REQUESTED_KEYS.slice()' in remote
    assert 'names = names.filter' not in remote, (
        'getSupportedKeys enumeration must not filter semantic registration names'
    )
    for name in REQUIRED_KEYS:
        assert repr(name) in remote, f'remote-input.js missing requested key {name}'

    for alias in (
        'PageUp', 'PageDown', 'XF86RaiseChannel', 'XF86LowerChannel',
        'XF86Red', 'XF86Green', 'XF86Yellow', 'XF86Blue',
    ):
        assert alias in remote, f'remote-input.js missing Samsung alias {alias}'
    for fallback_code in ('33:', '34:', '403:', '406:', '427:', '428:'):
        assert fallback_code in remote, f'remote-input.js missing fallback code {fallback_code}'

    for bad_mapping in (
        "447: 'ColorF0Red'", "448: 'ColorF1Green'",
        "449: 'ColorF2Yellow'", "450: 'ColorF3Blue'",
    ):
        assert bad_mapping not in remote, f'bad color fallback restored: {bad_mapping}'

    for platform_key in ('VolumeUp', 'VolumeDown', 'VolumeMute', "'Home'", "'Power'"):
        assert platform_key not in remote, (
            f'remote-input.js must not register platform-default key {platform_key}'
        )

    assert 'CHANNEL_DUPLICATE_GUARD_MS' in remote
    assert 'stopImmediatePropagation' in remote, (
        'remote gateway must own a handled physical zap before main.js sees it'
    )
    assert "if (name === 'ChannelUp') return 1;" in remote, 'ChannelUp must increase channel number'
    assert "if (name === 'ChannelDown') return -1;" in remote, 'ChannelDown must decrease channel number'
    assert 'KoreaTVPlayer' in remote and 'tuneToNumber' in remote
    assert 'currentNumber' in remote and 'channelCount' in remote
    assert 'suppressedZaps' in remote and 'directZaps' in remote

    numeric = (ROOT / 'app' / 'numeric-remote.js').read_text(encoding='utf-8')
    assert 'KoreaTVPlayer.tuneToNumber' in numeric, 'numeric tuning must call the direct player API once'
    assert "fireKey('ChannelUp'" not in numeric and "fireKey('ChannelDown'" not in numeric, (
        'numeric tuning must not synthesize repeated channel-zap key events'
    )
    assert 'for (var i = 0; i < count;' not in numeric, (
        'numeric tuning must not loop through intermediate channels'
    )

    avplay = (ROOT / 'app' / 'avplay-adapter.js').read_text(encoding='utf-8')
    for token in ('webapis.avplay', 'av.open(', 'av.setListener(', 'av.setDisplayRect(', 'av.prepareAsync(', 'av.play()', 'av.stop()', 'av.close()'):
        assert token in avplay, f'AVPlay adapter missing lifecycle token {token}'
    assert 'KoreaTVAVPlayDiagnostics' in avplay and 'KoreaTVAVPlay' in avplay

    main_js = (ROOT / 'app' / 'main.js').read_text(encoding='utf-8')
    assert 'playbackGeneration' in main_js and 'samePlayback' in main_js, (
        'player callbacks must ignore stale source generations'
    )
    assert 'clearVideoHandlers' in main_js, 'player teardown must detach old video handlers before source removal'
    assert 'ZAP_DEBOUNCE_MS' in main_js and 'event.repeat' in main_js, (
        'main.js fallback zapping must suppress key-repeat storms'
    )
    assert 'window.KoreaTVPlayer' in main_js and 'tuneToNumber: tuneToNumber' in main_js
    assert 'playChannel(true)' in main_js, 'direct tuning must force the exact selected channel'

    if legacy_channel_only:
        assert "mode: 'legacy-channel-only'" in brand_runtime
        assert 'forceLive' in brand_runtime and 'KoreaTVPlayer' in brand_runtime
        assert 'momHome' in brand_runtime and 'tvHome' in brand_runtime
        print('Legacy channel-only rollback contract OK: old player core + current remote/updater/release shell')
    else:
        assert 'window.KoreaTVAVPlay' in main_js and 'avplay.start(channel.url' in main_js, (
            'main player must prefer Samsung AVPlay when available'
        )
        assert "key === 'ArrowUp' || key === 'ChannelUp'" in main_js
        assert 'requestChannelChange(1, event)' in main_js, 'up/channel-up fallback must increase channel number'
        assert "key === 'ArrowDown' || key === 'ChannelDown'" in main_js
        assert 'requestChannelChange(-1, event)' in main_js, 'down/channel-down fallback must decrease channel number'
        for color_name in ('ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'):
            assert f"key === '{color_name}'" in main_js, f'main.js missing semantic color handling for {color_name}'
        assert 'setTimeout(openMom, 40)' in main_js, 'runtime still opens Mom OS after playlist when available'
        assert 'setTimeout(openHome, 900)' not in main_js, 'old Korea TV home autostart must not return'
        assert "action === 'continue' || action === 'watch-tv'" in main_js, 'Mom OS TV 보기 must start live TV'
        assert 'homeOpen || browserOpen || searchOpen || momOpen' in main_js, 'Mom OS arrows must stay panel navigation'

    runtime_test = ROOT / 'scripts' / 'test_remote_input_runtime.js'
    assert runtime_test.exists(), 'deterministic Samsung remote runtime simulation missing'

    sync = (ROOT / 'scripts' / 'sync_tizen_standalone.py').read_text(encoding='utf-8')
    for name in ('bootstrap.js', 'runtime-version.json', 'brand-runtime.js', 'remote-input.js', 'avplay-adapter.js', 'korea.m3u'):
        assert repr(name) in sync, f'standalone sync must include {name}'


if __name__ == '__main__':
    main()
