# Korea TV Standalone Tizen App

This directory contains a standalone Samsung Tizen Web Application build of the same Korea TV UI used by the TizenBrew module.

Source of truth remains `../app/`. Run `python scripts/sync_tizen_standalone.py` before packaging to refresh the standalone build assets.

The standalone app keeps the same stable playlist URL: `https://raw.githubusercontent.com/pryins-bit/tiz/main/korea.m3u`.

## Target TV and signing requirement

The primary target is Samsung `KU50UA7050FXKR` running Tizen 6.0. TizenBrew Installer's built-in local re-sign step is only used on Tizen 7 or newer, so the Tizen 6 target requires a WGT that already contains valid author and distributor signatures.

A plain ZIP renamed to `.wgt` is not a valid old-Tizen release package. CI must reject any release package missing either `author-signature.xml` or `signature1.xml`.

## Remote-control requirement

The standalone WGT does not pass through TizenBrew's module loader, so `package.json.keys` alone cannot activate remote buttons for this installation path. `config.xml` must grant:

`http://tizen.org/privilege/tv.inputdevice`

and `app/remote-input.js` must register the device-dependent buttons through `tizen.tvinputdevice`.

The app registers digits 0-9, ChannelUp/ChannelDown, the four color keys, and media playback keys. It deliberately does **not** register volume, Home, or Power, leaving those to Samsung's platform behavior. Arrow/Enter/Back are mandatory TV keys and need no explicit registration; the runtime normalizes old-Tizen arrow events when only keyCode is populated.

Numeric tuning must also remain usable while the startup TV Home is visible. `scripts/validate_remote_contract.py` guards these requirements in CI.

## Experimental RF tuner model

The branch `feature/rf-tuner-experiment-tizen6-20260819` additionally grants:

`http://tizen.org/privilege/tv.window`

and packages `app/rf-tuner.js`. The Korea TV Home contains an **안테나 UHD/RF** card. The experiment queries `VIDEOSOURCE`, selects a source whose type is `TV`, then uses `tizen.tvwindow.setSource()` and `tizen.tvwindow.show()` to place the physical tuner video in front of the Web application. Back hides the TV window and restores the previously selected IPTV channel.

This branch intentionally does not use `webapis.broadcast.tuneDirect()`. The experiment tests the public TVWindow path only; direct RF channel selection is not assumed on the consumer Tizen 6 target.

The RF branch is **not deployed**. Its actual `TV` source exposure, RF display, remote Channel +/- behavior, and IPTV return path require physical-TV verification before any merge or release.

## TizenBrew Installer

Every relevant push to `main` runs `.github/workflows/build-standalone.yml`. The workflow syncs the app assets, validates the manifest, installs the Tizen Studio CLI, creates an author certificate for the build, signs the package with the old-Tizen public distributor profile, verifies the signature files, and publishes/replaces `KoreaTV.wgt` in the rolling GitHub Release tagged `standalone-latest`.

On the TV, open TizenBrew Installer, choose **Install from GitHub**, and enter:

```text
pryins-bit/tiz
```

The rolling release intentionally contains one installable WGT asset named `KoreaTV.wgt`.

The workflow stamps a monotonically increasing build version into the packaged `config.xml` so a newly signed package has a newer application version.

## Author-key limitation

The CI fallback author certificate is currently ephemeral. That is sufficient for a first install test, but Tizen identifies application updates by author signing key. A later standalone binary signed with a different ephemeral author key can therefore require uninstall/reinstall.

If seamless binary updates become necessary, configure one persistent author key only through encrypted GitHub Actions secrets and reuse it for every build. Never commit the private key, certificate bundle containing the private key, or its password.

Playlist-only changes do not require a standalone rebuild because the app fetches the stable `main/korea.m3u` URL at runtime.

## Verification boundary

CI confirmation means the WGT has valid package structure, signature files, and declared privileges. It does **not** prove that Samsung's Tizen 6 package manager accepted the package, that TVWindow exposes the tuner on the target TV, or that the physical remote behaves as expected. Those remain real-device checks.
