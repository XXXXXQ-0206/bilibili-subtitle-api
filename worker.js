/**
 * Cloudflare Worker — B站视频字幕API
 *
 * 部署后手机快捷指令可直接调用，无需电脑。
 *
 * 使用方法：
 *   GET  https://your-worker.workers.dev/api/subtitle?url=<B站链接>
 *   POST https://your-worker.workers.dev/api/subtitle  body: { url, lang }
 *   Cookie 请通过 Cloudflare secret BILIBILI_COOKIE 或 X-Bilibili-Cookie 请求头提供。
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ---- 工具函数 ----

function isBilibiliHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'bilibili.com' || host.endsWith('.bilibili.com');
}

function isB23Host(hostname) {
  const host = hostname.toLowerCase();
  return host === 'b23.tv' || host.endsWith('.b23.tv');
}

function parseInputUrl(rawUrl) {
  const normalized = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
  let urlObj;
  try {
    urlObj = new URL(normalized);
  } catch {
    throw new Error('无效的URL: ' + rawUrl);
  }

  if (!['http:', 'https:'].includes(urlObj.protocol)) {
    throw new Error('仅支持 HTTP/HTTPS URL');
  }

  if (!isBilibiliHost(urlObj.hostname) && !isB23Host(urlObj.hostname)) {
    throw new Error('仅支持 bilibili.com 或 b23.tv 链接');
  }

  return urlObj;
}

function parseVideoUrl(rawUrl) {
  const urlObj = parseInputUrl(rawUrl);
  if (!isBilibiliHost(urlObj.hostname)) {
    throw new Error('短链接解析失败，请提供有效的 Bilibili 视频链接');
  }

  const pathname = urlObj.pathname.replace(/\/+$/, '');
  const m = pathname.match(/\/video\/(BV[\w]+)/i);
  let bvid = m ? m[1] : urlObj.searchParams.get('bvid');

  if (!bvid) {
    throw new Error('无法从URL中提取BV号: ' + rawUrl);
  }

  const page = parseInt(urlObj.searchParams.get('p') || '1', 10);
  return { bvid, page };
}

async function bfetch(url, cookie = '') {
  const headers = {
    'User-Agent': USER_AGENT,
    'Referer': 'https://www.bilibili.com',
  };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res;
}

function normalizeUrl(url) {
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  return url;
}

// ---- 解析短链接 ----

async function resolveShortUrl(rawUrl) {
  const urlObj = parseInputUrl(rawUrl);
  if (!isB23Host(urlObj.hostname)) return urlObj.toString();

  const res = await fetch(urlObj.toString(), {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  });
  const resolved = new URL(res.url);
  if (!isBilibiliHost(resolved.hostname)) {
    throw new Error('短链接未解析到 Bilibili 视频页面');
  }
  return resolved.toString();
}

// ---- 核心逻辑 ----

async function getVideoInfo(bvid, cookie) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const res = await bfetch(url, cookie);
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`获取视频信息失败 (code=${json.code}): ${json.message}`);
  }
  const d = json.data;
  return { title: d.title, aid: d.aid, cid: d.cid, pages: d.pages || [] };
}

async function getSubtitleList(aid, cid, cookie) {
  const url = `https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`;
  const res = await bfetch(url, cookie);
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`获取字幕列表失败 (code=${json.code}): ${json.message}`);
  }
  const needLogin = !!json.data?.need_login_subtitle;
  const subtitles = (json.data?.subtitle?.subtitles || [])
    .filter((s) => s.subtitle_url)
    .map((s) => ({
      lang: s.lan.replace(/^ai-/, ''),
      lang_doc: s.lan_doc,
      subtitle_url: normalizeUrl(s.subtitle_url),
    }));
  return { subtitles, needLogin };
}

async function fetchSubtitleContent(subtitleUrl) {
  const urlObj = new URL(subtitleUrl);
  const host = urlObj.hostname.toLowerCase();
  if (urlObj.protocol !== 'https:' || !(host === 'hdslb.com' || host.endsWith('.hdslb.com') || isBilibiliHost(host))) {
    throw new Error('字幕地址来源不受信任');
  }

  const res = await bfetch(subtitleUrl);
  const json = await res.json();
  return (json.body || []).map((item) => ({
    from: item.from,
    to: item.to,
    content: item.content,
  }));
}

function formatAsArticle(segments) {
  if (!segments.length) return '';
  return segments.map((s) => s.content.trim()).filter(Boolean).join(' ');
}

async function getSubtitle(rawUrl, opts = {}) {
  const realUrl = await resolveShortUrl(rawUrl);
  const { bvid, page } = parseVideoUrl(realUrl);
  const info = await getVideoInfo(bvid, opts.cookie);

  let cid = info.cid;
  if (info.pages.length > 1 && page >= 1 && page <= info.pages.length) {
    const p = info.pages.find((pg) => pg.page === page);
    if (p) cid = p.cid;
  }

  const { subtitles, needLogin } = await getSubtitleList(info.aid, cid, opts.cookie);

  if (!subtitles.length) {
    if (needLogin) {
      throw new Error('该视频的字幕需要登录B站才能获取，请通过 BILIBILI_COOKIE secret 或 X-Bilibili-Cookie 请求头提供 Cookie');
    }
    throw new Error('该视频没有可用字幕');
  }

  let chosen = subtitles[0];
  if (opts.lang) {
    const preferred = subtitles.find(
      (s) => s.lang === opts.lang || s.lang_doc.includes(opts.lang)
    );
    if (preferred) chosen = preferred;
  } else {
    const zh = subtitles.find((s) => s.lang.startsWith('zh'));
    if (zh) chosen = zh;
  }

  const segments = await fetchSubtitleContent(chosen.subtitle_url);
  const subtitleText = formatAsArticle(segments);

  return {
    title: info.title,
    subtitle_text: subtitleText,
    subtitle_lang: chosen.lang_doc,
    segments_count: segments.length,
  };
}

// ---- Worker 入口 ----

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 健康检查
    if (url.pathname === '/' || url.pathname === '') {
      return jsonResponse({ status: 'ok', usage: 'GET /api/subtitle?url=<B站视频链接>' });
    }

    // API 路由
    if (url.pathname === '/api/subtitle') {
      let videoUrl, lang;
      const cookie = request.headers.get('X-Bilibili-Cookie') || env.BILIBILI_COOKIE || '';

      if (request.method === 'GET') {
        videoUrl = url.searchParams.get('url');
        lang = url.searchParams.get('lang') || '';
      } else if (request.method === 'POST') {
        try {
          const body = await request.json();
          videoUrl = body.url;
          lang = body.lang || '';
        } catch {
          return jsonResponse({ error: '无效的JSON请求体' }, 400);
        }
      } else {
        return jsonResponse({ error: '仅支持 GET/POST' }, 405);
      }

      if (!videoUrl) {
        return jsonResponse({ error: '缺少参数 url' }, 400);
      }

      try {
        const result = await getSubtitle(videoUrl, { lang, cookie });
        return jsonResponse(result);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },
};
