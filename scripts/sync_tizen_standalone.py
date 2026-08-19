#!/usr/bin/env python3
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'app'
DST = ROOT / 'tizen-standalone' / 'build'
CONFIG = ROOT / 'tizen-standalone' / 'config.xml'


def main():
    if DST.exists():
        shutil.rmtree(DST)
    DST.mkdir(parents=True, exist_ok=True)
    for name in (
        'index.html',
        'bootstrap.js',
        'runtime-version.json',
        'main.js',
        'numeric-remote.js',
        'remote-input.js',
        'avplay-adapter.js',
        'channel-policy.js',
        'kbs-provider.js',
        'style.css',
    ):
        shutil.copy2(SRC / name, DST / name)
    shutil.copy2(CONFIG, DST / 'config.xml')
    print(f'prepared standalone Tizen project at {DST}')


if __name__ == '__main__':
    main()
