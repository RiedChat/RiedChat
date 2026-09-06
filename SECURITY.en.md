# Security Policy

If you believe you've found a vulnerability in RiedChat (a bug that lets
someone do something that shouldn't be possible), please report it
privately - via **<quardinimus@gmail.com>**.

Please do not report vulnerabilities through public GitHub issues,
discussions, or other open channels - this gives us time to ship a fix
before the risk becomes known to all users.

In your report, please include:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, including proof-of-concept code if available.
- The RiedChat version/commit the vulnerability was verified on.

## Scope

"A vulnerability in RiedChat" means a vulnerability in the code distributed
through this repository. This includes, for example, bugs in this project's
implementation of OMEMO message encryption, leaks in call signaling
(WebRTC), or XSS/injection issues in the UI.

Out of scope, and should be reported separately:

- Vulnerabilities in the `libsignal-protocol.js` library itself - report
  those upstream (Signal/OWS), not in this repository.
- Issues specific to a particular deployment (a misconfigured XMPP server,
  TURN endpoint, weak server-side TLS settings) - report those to the
  operator of that particular deployment, not to the project developers.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | Yes       |

The project doesn't currently maintain multiple stable release branches;
security fixes are only issued for the current code in `main`.

## Response

We try to acknowledge reports within a reasonable time and keep the reporter
updated as a fix is developed. Unless requested otherwise, the reporter will
be credited in the release notes.
