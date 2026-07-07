# Bilibili Subtitle API

<p align="right">
  <a href="README.md">English</a>
</p>

这是一个非官方 API 服务，用于获取 Bilibili 视频中可用的字幕轨道，并以纯文本形式返回。它既可以作为本地 Node.js 服务运行，配合 iOS 快捷指令等局域网流程使用，也可以部署为 Cloudflare Worker。

## 功能

- 从 Bilibili 视频链接获取字幕文本。
- 支持标准 `bilibili.com/video/BV...` 链接和 `b23.tv` 短链接。
- 通过 `?p=N` 参数处理多 P 视频。
- 默认优先选择中文字幕，也可以指定偏好的字幕语言。
- 同时提供 GET 和 POST API。
- 可从环境变量、Cloudflare secret 或临时请求头读取 Bilibili Cookie。
- 包含 GitHub CodeQL 和 Dependabot 配置，便于持续安全维护。

## 环境要求

- Node.js 18 或更高版本。
- npm。
- 可选：如果要部署 `worker.js`，需要 Cloudflare Wrangler。

## 安装

```bash
git clone https://github.com/XXXXXQ-0206/bilibili-subtitle-api.git
cd bilibili-subtitle-api
npm install
npm start
```

本地服务默认监听 `0.0.0.0:3456`。

如需修改端口：

```bash
PORT=8080 npm start
```

PowerShell：

```powershell
$env:PORT = "8080"
npm start
```

## Bilibili Cookie

部分字幕轨道需要已登录的 Bilibili 会话。建议使用 `BILIBILI_COOKIE`，不要通过 URL 传递 Cookie。

Linux/macOS：

```bash
BILIBILI_COOKIE="your_cookie_value" npm start
```

PowerShell：

```powershell
$env:BILIBILI_COOKIE = "your_cookie_value"
npm start
```

Cloudflare Workers 请将 Cookie 存为 secret：

```bash
npx wrangler secret put BILIBILI_COOKIE
```

也可以使用 `X-Bilibili-Cookie` 请求头为单次请求提供 Cookie。不要把 Cookie 放在查询参数中，因为 URL 常常会被日志、浏览器历史、代理和分析工具保存。

## API

### GET `/api/subtitle`

查询参数：

| 名称 | 必填 | 说明 |
| --- | --- | --- |
| `url` | 是 | Bilibili 视频链接，例如 `https://www.bilibili.com/video/BVxxxxxx` |
| `lang` | 否 | 偏好的字幕语言，例如 `zh-CN` 或 `en` |

可选请求头：

| 名称 | 说明 |
| --- | --- |
| `X-Bilibili-Cookie` | 本次请求临时使用的 Bilibili Cookie |

示例：

```bash
curl "http://localhost:3456/api/subtitle?url=https%3A%2F%2Fwww.bilibili.com%2Fvideo%2FBVxxxxxx"
```

### POST `/api/subtitle`

```bash
curl -X POST "http://localhost:3456/api/subtitle" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.bilibili.com/video/BVxxxxxx","lang":"zh-CN"}'
```

返回示例：

```json
{
  "title": "视频标题",
  "subtitle_text": "整理为文章形式的字幕全文...",
  "subtitle_lang": "中文（自动生成）",
  "segments_count": 128
}
```

## iOS 快捷指令

1. 新建快捷指令。
2. 添加“获取剪贴板”。
3. 添加“获取 URL 的内容”。
4. 使用以下 URL：

```text
http://<你的电脑IP>:3456/api/subtitle?url=[剪贴板]
```

5. 解析 JSON 响应并显示 `subtitle_text`。

将 `<你的电脑IP>` 替换为局域网 IP 地址。Windows 可运行 `ipconfig` 查看。

## Cloudflare Worker

仓库包含 `worker.js` 和 `wrangler.toml`。

```bash
npx wrangler secret put BILIBILI_COOKIE
npx wrangler deploy
```

Worker 支持同样的 `/api/subtitle` 接口。

## 安全与隐私

- 项目不需要提交任何密钥。`cookie.txt`、`.env` 文件、本地 Wrangler 状态、`node_modules`、浏览器导出文件，以及下载/历史记录目录都会被 Git 忽略。
- `cookie.txt` 仅作为本地私有开发的兼容回退方式，绝不能提交。
- 不要在没有认证、限流和传输层安全保护的情况下，将带 Cookie 的实例暴露到公网。
- API 会拒绝非 Bilibili 视频链接，并在下载字幕内容前校验字幕来源主机。
- 请定期运行 `npm audit --omit=dev`。仓库已配置 Dependabot，会自动创建依赖更新 PR。

## GitHub 安全配置

本仓库包含：

- CodeQL 工作流：`.github/workflows/codeql.yml`
- Dependabot 配置：`.github/dependabot.yml`
- 安全策略：`SECURITY.md`

对于公开 GitHub 仓库，请在账号支持时启用 secret scanning 和 push protection。

## 免责声明

本项目为非官方项目，与 Bilibili 无隶属、认可、赞助或合作关系。项目依赖公开可访问的 Bilibili 网页端接口，这些接口可能随时变化或停止工作。

使用本软件的风险由使用者自行承担。你有责任遵守 Bilibili 的服务条款、版权规则、隐私义务、所在地法律，以及账号安全要求。不得使用本项目绕过访问控制、以滥用频率抓取内容，或在未获授权的情况下重新分发字幕或媒体内容。

维护者按“原样”提供本项目，不作任何形式的担保。因使用或误用本软件导致的账号问题、数据泄露、服务中断、法律主张或其他损失，维护者不承担责任。

## 许可证

MIT。详见 [LICENSE](LICENSE)。
