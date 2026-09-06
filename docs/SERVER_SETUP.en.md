# XMPP server setup

RiedChat is a regular XMPP client and works with any server that supports
the required XEPs. Below is what needs to be enabled on the server side
separately, because without it some of the client's features won't work or
will degrade.

## Supported XEPs

XEP-0012, 0059, 0060, 0066, 0115, 0153, 0163, 0172, 0198, 0199, 0203, 0215,
0308, 0313, 0333, 0363, 0384 (OMEMO), 0420, 0447, 0454.

## TURN for calls (XEP-0215)

The client requests TURN/STUN from its own XMPP server via XEP-0215
(`net/turn/extdisco.js`). The easiest way to get this on **Prosody** is the
`mod_turn_external` module:

```lua
modules_enabled = {
    -- ...
    "turn_external"; -- Provide external STUN/TURN service for e.g. audio/video calls
}

-- TURN service address (can be the same domain as XMPP)
turn_external_host = "example.com"

-- The same secret must be set in coturn (static-auth-secret)
turn_external_secret = "generate_a_random_string"

-- Ports must match your coturn settings (turnserver.conf)
turn_external_port = 3478
turn_external_tls_port = 5349
```

`mod_turn_external` doesn't run a TURN server itself - you still need
[coturn](https://github.com/coturn/coturn) alongside it with the same
`static-auth-secret` and ports 3478/5349 (temporary credentials via REST
API, HMAC-based, described in the
[Prosody documentation](https://prosody.im/doc/turn)). Once this is set up,
extdisco will return a working TURN with temporary credentials to the
client - no further configuration is needed in RiedChat.

If XEP-0215 isn't set up on the server (the module isn't enabled, or the
server isn't Prosody), the client falls back as a last resort to the
account's own domain (the part of the JID after `@`) on ports 3478/5349
without credentials - this only works if TURN on that host is configured
for anonymous access; otherwise the call is left with bare STUN and may fail
to traverse symmetric NAT.

## File uploads (XEP-0363)

Requires `http_file_share` to be enabled (or a separate component of the
same kind) - without it, uploading and sending files in chat doesn't work.

## Message history (XEP-0313, MAM)

Requires `mod_mam` to be enabled. Without it, the client can't load message
history when logging in from a new device or after a reinstall.

## OMEMO device-list push notifications (XEP-0115 + PEP)

For the client to learn about a contact's new/removed device without manual
polling, the server and contacts need support for Entity Capabilities
(`mod_pep`, enabled by default in current Prosody versions).
