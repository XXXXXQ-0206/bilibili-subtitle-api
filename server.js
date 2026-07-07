const express = require('express');
const fs = require('fs');
const path = require('path');
const { getSubtitle } = require('./lib/bilibili');

const app = express();
const PORT = process.env.PORT || 3456;
const COOKIE_FILE = path.join(__dirname, 'cookie.txt');

function loadCookie() {
  const envCookie = process.env.BILIBILI_COOKIE;
  if (envCookie && envCookie.trim()) {
    return envCookie.trim();
  }

  try {
    if (fs.existsSync(COOKIE_FILE)) {
      return fs.readFileSync(COOKIE_FILE, 'utf-8').trim();
    }
  } catch {}
  return '';
}

function resolveCookie(req) {
  return req.get('x-bilibili-cookie') || loadCookie();
}

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));

// ============================================================
// GET /api/subtitle?url=<bilibili_video_url>&lang=zh-CN
//
// 参数:
//   url   - B站视频链接 (必填)
//   lang  - 字幕语言，默认 zh-CN (可选)
//   X-Bilibili-Cookie - 可选请求头。推荐优先使用 BILIBILI_COOKIE 环境变量。
//
// 返回:
//   { title, subtitle_text, subtitle_lang, segments_count }
// ============================================================

app.get('/api/subtitle', async (req, res) => {
  const { url, lang } = req.query;

  if (!url) {
    return res.status(400).json({ error: '缺少参数 url' });
  }

  const effectiveCookie = resolveCookie(req);

  try {
    const result = await getSubtitle(url, { lang: lang || '', cookie: effectiveCookie });
    res.json(result);
  } catch (err) {
    console.error('[错误]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/subtitle  — 同功能，body 传参，适配快捷指令
app.post('/api/subtitle', async (req, res) => {
  const { url, lang } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: '缺少参数 url' });
  }

  const effectiveCookie = resolveCookie(req);

  try {
    const result = await getSubtitle(url, { lang: lang || '', cookie: effectiveCookie });
    res.json(result);
  } catch (err) {
    console.error('[错误]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 简易健康检查
app.get('/', (_req, res) => {
  res.json({ status: 'ok', usage: 'GET /api/subtitle?url=<bilibili_video_url>' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`B站字幕API已启动: http://0.0.0.0:${PORT}`);
  console.log(`局域网访问: http://<你的IP>:${PORT}/api/subtitle?url=<B站链接>`);
});
