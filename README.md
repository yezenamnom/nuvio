# Nuvio

Personal, static, ad-free video front-end (HTML/CSS/JS, no build step).
Search, channels and playback come from public Invidious/Piped API instances; streams play in a native `<video>` element via Shaka Player.
Falls back to a youtube-nocookie embed when no instance can stream.

Optional browser extension **Nuvio Direct** (`../nuvio-ext`): when installed, all YouTube traffic (search, channels, related, comments, player, video bytes) goes from the viewer's device straight to YouTube (VISIONOS client for playback, DASH built in the browser) — only `/acc/*` still talks to our server. Without it nothing changes.
