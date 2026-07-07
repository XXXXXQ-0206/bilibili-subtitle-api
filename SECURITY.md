# Security Policy

## Supported Versions

Security fixes are provided for the latest released version.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories when available, or by opening a minimal issue that does not include secrets, tokens, cookies, or exploitable proof-of-concept details.

## Secret Handling

- Do not commit Bilibili cookies, Cloudflare tokens, GitHub tokens, local `.env` files, browser export files, or downloaded history files.
- Prefer `BILIBILI_COOKIE` as an environment variable or Cloudflare secret.
- Never pass cookies in URLs.
- Rotate any cookie or token that may have been exposed.
