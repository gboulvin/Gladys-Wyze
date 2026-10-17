# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords, API keys, MAC and IP
  addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## What the integration handles

- **Wyze credentials** — the email, password, API key id and API key are
  stored by Gladys in the integration configuration (the password and the API
  key as `secret` fields, never sent back to the browser). The password is
  only sent to the Wyze login endpoint, hashed the way the Wyze app does.
- **Wyze session** — the access and refresh tokens are kept in
  `/data/wyze-session.json`, in the integration's private volume, readable by
  its user only. Delete the file (or revoke the API key in the Wyze developer
  console) to end the session.
- **Network** — the integration talks to the Wyze cloud over HTTPS, and to
  the color bulbs and light strips on the local network (HTTP, TCP port 88,
  payload encrypted with the per-device key Wyze provides) when local control
  is preferred.
- **Logs** — passwords, API keys and tokens are never logged.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the Wyze cloud, apps and devices (report those to Wyze).
