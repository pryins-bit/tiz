# Third-party notices

## SKY IPTV Tizen reference/core

The current Samsung AVPlay-first playback core is derived from and adapted around `sanwhere/sky-iptv-tizen`, especially its Tizen AVPlay lifecycle, 10-second `prepareAsync` guard, buffering settings, Tizen 6 user agent, and Samsung remote key handling patterns. The channel data is not copied from that project; Korea TV continues to load the owner's `korea.m3u`.

Project: https://github.com/sanwhere/sky-iptv-tizen
License: MIT

## OpenIPTV AVPlay surface reference

The AVPlay surface layout follows the same Samsung hardware-plane rule documented by `shayanline/OpenIPTV`: keep a single `application/avplayer` object and keep the page transparent over the video plane so an opaque HTML layer cannot hide a successfully playing stream.

Project: https://github.com/shayanline/OpenIPTV
License: MIT

## Samsung Tizen TV VOD reference app

SamsungDForum/tizen-tv-vod-ref-app was consulted for Samsung TVInputDevice registration and remote-event compatibility patterns, including ChannelUp/ChannelDown, PageUp/PageDown, XF86 color-key names, and the documented 403-406 color key family.

Project: https://github.com/SamsungDForum/tizen-tv-vod-ref-app
License: MPL-2.0
