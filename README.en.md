<div align="center">
  <img src="public/icons/icon-192.png" alt="RiedChat" width="120" height="120">

  # RiedChat

  A web-based XMPP client for 1-on-1 chat with OMEMO encryption and calls

  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

  [![Русский](https://img.shields.io/badge/lang-Русский-lightgrey)](README.md)
  [![English](https://img.shields.io/badge/lang-English-blue)](README.en.md)
</div>

## Table of contents

- [About](#about)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Installation](#installation)
- [Security](#security)
- [Contributing](#contributing)
- [Third-party components](#third-party-components)
- [License](#license)

## About

RiedChat strikes a balance between lightness and functionality that most
XMPP clients don't: some are stripped down from the start and don't cover
the range of features people now expect from modern messengers, others drag
in heavyweight dependencies and still somehow fail to cover the functionality
they claim to support. The client has no analytics, no telemetry.

## Features

- **Calls** - audio and video calls with mandatory OMEMO encryption.
- **Stickers** - build your own sticker packs and send them to a contact;
  received stickers are cached on both sides.
- **Video notes** - round video messages, up to 1 minute long.
- **History search** - filterable by message type: text, image, video,
  sticker, video note, file.
- **Chat font settings** - a custom uploaded font and adjustable text size.
- **Other** - voice messages, chat wallpapers, message editing/deletion/
  quoting, typing/read indicators, presence status, custom avatars/vCards.

## Tech stack

Vite, ES modules, [Strophe.js](https://strophe.im/) (XMPP, loaded from a
CDN), [libsignal-protocol](https://github.com/signalapp/libsignal-protocol-javascript)
(OMEMO, vendored as a classic script), Vitest.

## Installation

**Client.** A ready-made build is at
[riedchat.github.io](https://riedchat.github.io/); build it yourself only
for modifications or your own hosting, see
[docs/INSTALL.en.md](./docs/INSTALL.en.md).

**XMPP server.** Required either way: server requirements and a sample
config are in [docs/SERVER_SETUP.en.md](./docs/SERVER_SETUP.en.md).

## Security

Report vulnerabilities as described in [SECURITY.en.md](./SECURITY.en.md), not via
public issues.

## Contributing

Pull requests are welcome. Before your first contribution, please read the
[CODE_OF_CONDUCT.en.md](./CODE_OF_CONDUCT.en.md); opening a pull request means you
agree to the terms of [CLA.en.md](./CLA.en.md).

## Third-party components

The project uses Strophe.js (MIT) and libsignal-protocol (GPL-3.0, vendored
unmodified) - the full list of third-party components and their licenses is
in [THIRD-PARTY-NOTICES.en.md](./THIRD-PARTY-NOTICES.en.md).

## License

Copyright (C) 2026 RiedChat Contributors

This program is free software: you can redistribute it and/or modify it
under the terms of the GNU Affero General Public License as published by the
Free Software Foundation, either version 3 of the License, or (at your
option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
