# Korea TV Standalone Tizen App

This directory contains a standalone Samsung Tizen Web Application build of the same Korea TV UI used by the TizenBrew module.

The standalone app is intended for installation from Tizen Studio / SDB so it can be launched directly from the Samsung TV home screen without opening TizenBrew first.

Source of truth remains `../app/`. Run `python scripts/sync_tizen_standalone.py` before packaging to refresh the duplicated app assets.

The standalone app keeps the same stable playlist URL: `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`.
