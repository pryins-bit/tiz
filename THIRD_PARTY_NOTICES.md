# Third-party notices

## hls.js

This module loads `hls.js` from jsDelivr at runtime for browsers that need Media Source Extensions fallback playback.

Project: https://github.com/video-dev/hls.js
License: Apache-2.0

## TVapp reference

The remote-control/HLS-player design was compared against KaashDev/TVapp while implementing this module. TVapp is MIT-licensed. This repository does not copy its placeholder channel list; the player implementation here loads the owner's generated `korea.m3u` automatically.

Project: https://github.com/KaashDev/TVapp
License: MIT

## Samsung Tizen TV VOD reference app

SamsungDForum/tizen-tv-vod-ref-app was consulted for Samsung TVInputDevice registration and remote-event compatibility patterns, including ChannelUp/ChannelDown, PageUp/PageDown, XF86 color-key names, and the documented 403-406 color key family. No source file from the reference application is copied into Korea TV; the local ES5 implementation remains independently structured for this project's runtime/update architecture.

Project: https://github.com/SamsungDForum/tizen-tv-vod-ref-app
License: MPL-2.0
