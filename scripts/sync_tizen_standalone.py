#!/usr/bin/env python3
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'app'
DST = ROOT / 'tizen-standalone' / 'build'
CONFIG = ROOT / 'tizen-standalone' / 'config.xml'


def validate_update1():
    subprocess.run(['node', '--check', str(SRC / 'channel-policy.js')], cwd=ROOT, check=True)
    subprocess.run(['node', '--check', str(SRC / 'kbs-provider.js')], cwd=ROOT, check=True)
    subprocess.run(['node', str(ROOT / 'scripts' / 'test_update1_runtime.js')], cwd=ROOT, check=True)


def main():
    validate_update1()
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
