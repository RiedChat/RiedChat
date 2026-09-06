# Third-Party Notices

This project includes third-party components distributed under their own
licenses, in addition to the AGPL-3.0 license under which RiedChat's own
code is distributed (see [LICENSE](./LICENSE)).

## libsignal-protocol.js

- **Location:** `public/js/crypto/libsignal-protocol.js`
- **Source:** Open Whisper Systems / Signal
- **License:** GNU General Public License v3.0 (GPL-3.0)
- **Note:** vendored unmodified, an emscripten-generated build. Not
  processed by the Vite build - loaded as a classic `<script>` in
  `index.html`.

This bundle also embeds the following third-party code, each under its own
license:

- **Closure Library** - Copyright 2009 The Closure Library Authors.
  License: Apache License, Version 2.0.
- **jsbn** - Copyright (c) 2003-2005 Tom Wu. License: permissive
  (BSD-like); the original copyright and permission notice must be
  retained on redistribution.
- **long.js** - Copyright 2013 Daniel Wirtz. License: Apache License,
  Version 2.0.
- **protobuf.js** and **ByteBuffer.js** - Copyright 2013-2014 Daniel
  Wirtz. License: Apache License, Version 2.0.
- **lxiv-embeddable** and **utfx-embeddable** - Copyright 2014 Daniel
  Wirtz. License: Apache License, Version 2.0.

## Strophe.js

- **How it's loaded:** loaded at runtime from a CDN
  (`cdn.jsdelivr.net/npm/strophe.js`), not vendored in this repository.
- **License:** MIT License
- **Note:** not part of either the source code or the build produced from
  this repository's code.

## Google Fonts (Inter, IBM Plex Mono)

- **How they're loaded:** loaded at runtime from `fonts.googleapis.com`,
  not vendored in this repository.
- **License:** SIL Open Font License 1.1 (OFL)
- **Note:** not part of either the source code or the build.

## Vite

- **Role:** build tool only (`devDependencies` in `package.json`).
- **License:** MIT License
- **Note:** not distributed as part of the app, used only at build time to
  produce `dist/`.

---

When distributing this project, you must also comply with the license
terms of each of the components listed above, in addition to the AGPL-3.0
terms under which RiedChat's own source code is distributed.
