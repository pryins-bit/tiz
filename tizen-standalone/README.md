# Korea TV Standalone Tizen App

This directory contains a standalone Samsung Tizen Web Application build of the same Korea TV UI used by the TizenBrew module.

Source of truth remains `../app/`. Run `python scripts/sync_tizen_standalone.py` before packaging to refresh the standalone build assets.

The standalone app keeps the same stable playlist URL: `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`.

## TizenBrew Installer

Every relevant push to `main` runs `.github/workflows/build-standalone.yml`. The workflow creates `KoreaTV.wgt` and publishes/replaces it in the rolling GitHub Release tagged `standalone-latest`.

On the TV, open TizenBrew Installer, choose **Install from GitHub**, and enter:

```text
pryins-bit/tiz
```

TizenBrew Installer resolves the repository's latest GitHub Release and installs the first `.wgt`/`.tpk` release asset, so the Release intentionally contains a single installable asset named `KoreaTV.wgt`.

The workflow stamps a monotonically increasing build version into the packaged `config.xml` so reinstalling a newer Release is treated as an app update rather than a byte-for-byte same-version package.

TizenBrew Installer re-signs downloaded packages on Tizen 7+ using the certificate configured in the Installer. Older Tizen versions do not use that re-sign path, so real-device installation there still depends on package/signing compatibility and must be tested on the target TV.
