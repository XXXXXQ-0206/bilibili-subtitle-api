# Bilibili Subtitle API

<p align="right">
  <a href="README.zh-CN.md">中文</a>
</p>

An unofficial API service that fetches available subtitle tracks for Bilibili videos and returns them as plain text. It can run as a local Node.js server for LAN workflows such as iOS Shortcuts, or as a Cloudflare Worker for hosted usage.

## Features

- Fetch subtitle text from Bilibili video URLs.
- Supports standard `bilibili.com/video/BV...` links and `b23.tv` short links.
- Handles multi-part videos through the `?p=N` page parameter.
- Selects Chinese subtitles by default when available, or accepts a preferred language.
- Provides both GET and POST API endpoints.
- Can use a Bilibili cookie from an environment variable, Cloudflare secret, or a temporary request header.
- Includes GitHub CodeQL and Dependabot configuration for security maintenance.

## Requirements

- Node.js 18 or newer.
- npm.
- Optional: Cloudflare Wrangler if you want to deploy `worker.js`.

## Installation

```bash
git clone https://github.com/XXXXXQ-0206/bilibili-subtitle-api.git
cd bilibili-subtitle-api
npm install
npm start
```

The local server listens on `0.0.0.0:3456` by default.

To change the port:

```bash
PORT=8080 npm start
```

PowerShell:

```powershell
$env:PORT = "8080"
npm start
```

## Bilibili Cookie

Some subtitle tracks require a logged-in Bilibili session. Prefer `BILIBILI_COOKIE` instead of passing cookies through URLs.

Linux/macOS:

```bash
BILIBILI_COOKIE="your_cookie_value" npm start
```

PowerShell:

```powershell
$env:BILIBILI_COOKIE = "your_cookie_value"
npm start
```

For Cloudflare Workers, store the cookie as a secret:

```bash
npx wrangler secret put BILIBILI_COOKIE
```

You may also provide a cookie for one request with the `X-Bilibili-Cookie` header. Do not put cookies in query strings because URLs are commonly stored in logs, browser history, proxies, and analytics tools.

## API

### GET `/api/subtitle`

Query parameters:

| Name | Required | Description |
| --- | --- | --- |
| `url` | Yes | Bilibili video URL, for example `https://www.bilibili.com/video/BVxxxxxx` |
| `lang` | No | Preferred subtitle language, for example `zh-CN` or `en` |

Optional header:

| Name | Description |
| --- | --- |
| `X-Bilibili-Cookie` | Temporary Bilibili cookie for the request |

Example:

```bash
curl "http://localhost:3456/api/subtitle?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBVxxxxxx"
```

### POST `/api/subtitle`

```bash
curl -X POST "http://localhost:3456/api/subtitle" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bilibili.com/video/BVxxxxxx","lang":"zh-CN"}'
```

Response:

```json
{
  "title": "Video title",
  "subtitle_text": "Subtitle text as one article...",
  "subtitle_lang": "Chinese (auto-generated)",
  "segments_count": 128
}
```

## iOS Shortcuts

1. Create a new shortcut.
2. Add "Get Clipboard".
3. Add "Get Contents of URL".
4. Use this URL:

```text
http://<your-computer-ip>:3456/api/subtitle?url=[Clipboard]
```

5. Parse the JSON response and display `subtitle_text`.

Replace `<your-computer-ip>` with your LAN IP address. On Windows, run `ipconfig` to find it.

## Cloudflare Worker

The repository includes `worker.js` and `wrangler.toml`.

```bash
npx wrangler secret put BILIBILI_COOKIE
npx wrangler deploy
```

The Worker supports the same `/api/subtitle` endpoint.

## Security And Privacy

- This project does not require committed secrets. `cookie.txt`, `.env` files, local Wrangler state, `node_modules`, browser exports, and download/history folders are ignored by Git.
- `cookie.txt` is supported only as a local fallback for private development and must never be committed.
- Do not expose a cookie-backed instance to the public internet without authentication, rate limiting, and transport security.
- The API rejects non-Bilibili video links and validates subtitle download hosts before fetching subtitle content.
- Run `npm audit --omit=dev` regularly. Dependabot is configured to open update pull requests.

## GitHub Security

This repository contains:

- CodeQL workflow: `.github/workflows/codeql.yml`
- Dependabot configuration: `.github/dependabot.yml`
- Security policy: `SECURITY.md`

For public GitHub repositories, enable secret scanning and push protection in the repository security settings when available for the account.

## Disclaimer

This project is unofficial and is not affiliated with, endorsed by, or sponsored by Bilibili. It relies on publicly reachable Bilibili web endpoints that may change or stop working at any time.

Use this software at your own risk. You are responsible for complying with Bilibili's terms, copyright rules, privacy obligations, local laws, and any account security requirements. Do not use the project to bypass access controls, scrape content at abusive rates, or redistribute subtitles or media without permission.

The maintainers provide the project "as is" without warranty of any kind. The maintainers are not liable for account issues, data exposure, service interruption, legal claims, or other losses arising from use or misuse of this software.

## License

MIT. See [LICENSE](LICENSE).
