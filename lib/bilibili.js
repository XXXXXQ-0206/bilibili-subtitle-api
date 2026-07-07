/**
 * Bilibili 字幕获取核心逻辑
 * 参考 Chrome 扩展中的 IFrameCS / MainCS 适配器实现
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// ----------------------------- 工具函数 -----------------------------

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

/**
 * 从B站视频URL中提取 bvid 和 page 编号
 */
function parseVideoUrl(rawUrl) {
  const urlObj = parseInputUrl(rawUrl);
  if (!isBilibiliHost(urlObj.hostname)) {
    throw new Error('短链接解析失败，请提供有效的 Bilibili 视频链接');
  }

  let pathname = urlObj.pathname.replace(/\/+$/, '');

  // /video/BVxxxxxx
  const m = pathname.match(/\/video\/(BV[\w]+)/i);
  let bvid = m ? m[1] : null;

  if (!bvid) {
    // 查询参数 ?bvid=
    bvid = urlObj.searchParams.get('bvid');
  }

  if (!bvid) {
    throw new Error('无法从URL中提取BV号: ' + rawUrl);
  }

  const page = parseInt(urlObj.searchParams.get('p') || '1', 10);
  return { bvid, page };
}

/**
 * 封装 fetch，带默认 headers
 */
async function bfetch(url, cookie = '') {
  const headers = {
    'User-Agent': USER_AGENT,
    Referer: 'https://www.bilibili.com',
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res;
}

/**
 * 标准化字幕URL (处理 // 开头的情况)
 */
function normalizeUrl(url) {
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('http://')) return url.replace('http://', 'https://');
  return url;
}

// ----------------------------- 核心流程 -----------------------------

/**
 * 解析短链接 (b23.tv) → 获取真实URL
 */
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

  return resolved.toString(); // 跟随重定向后的真实URL
}

/**
 * 获取视频基础信息 (title, aid, cid, pages)
 */
async function getVideoInfo(bvid, cookie) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
  const res = await bfetch(url, cookie);
  const json = await res.json();

  if (json.code !== 0) {
    throw new Error(`获取视频信息失败 (code=${json.code}): ${json.message}`);
  }

  const d = json.data;
  return {
    title: d.title,
    aid: d.aid,
    cid: d.cid,
    pages: d.pages || [],
  };
}

/**
 * 获取字幕列表
 */
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

/**
 * 下载并解析字幕内容
 */
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

/**
 * 将字幕片段拼接为文章形式的全文
 * B站AI字幕不含标点，在片段之间添加空格分隔
 */
function formatAsArticle(segments) {
  if (!segments.length) return '';
  return segments.map(s => s.content.trim()).filter(Boolean).join(' ');
}

// ----------------------------- 对外接口 -----------------------------

/**
 * 主函数：给定B站视频URL，返回全文字幕
 *
 * @param {string} rawUrl - B站视频链接
 * @param {object} opts
 * @param {string} opts.lang - 首选字幕语言 (如 zh-CN)，为空则自动选择第一个
 * @param {string} opts.cookie - 可选的B站Cookie
 * @returns {{ title, subtitle_text, subtitle_lang, segments_count }}
 */
async function getSubtitle(rawUrl, opts = {}) {
  // 1. 解析短链接
  const realUrl = await resolveShortUrl(rawUrl);

  // 2. 提取 bvid + page
  const { bvid, page } = parseVideoUrl(realUrl);

  // 3. 获取视频信息
  const info = await getVideoInfo(bvid, opts.cookie);

  // 4. 确定 cid（多P视频处理）
  let cid = info.cid;
  if (info.pages.length > 1 && page >= 1 && page <= info.pages.length) {
    const p = info.pages.find((pg) => pg.page === page);
    if (p) cid = p.cid;
  }

  // 5. 获取字幕列表
  const { subtitles, needLogin } = await getSubtitleList(info.aid, cid, opts.cookie);

  if (!subtitles.length) {
    if (needLogin) {
      throw new Error('该视频的字幕需要登录B站才能获取，请通过 BILIBILI_COOKIE 环境变量或 X-Bilibili-Cookie 请求头提供 Cookie');
    }
    throw new Error('该视频没有可用字幕');
  }

  // 6. 选择字幕
  let chosen = subtitles[0]; // 默认第一个
  if (opts.lang) {
    const preferred = subtitles.find(
      (s) => s.lang === opts.lang || s.lang_doc.includes(opts.lang)
    );
    if (preferred) chosen = preferred;
  } else {
    // 优先中文
    const zh = subtitles.find((s) => s.lang.startsWith('zh'));
    if (zh) chosen = zh;
  }

  // 7. 下载字幕内容
  const segments = await fetchSubtitleContent(chosen.subtitle_url);

  // 8. 拼接为文章
  const subtitleText = formatAsArticle(segments);

  return {
    title: info.title,
    subtitle_text: subtitleText,
    subtitle_lang: chosen.lang_doc,
    segments_count: segments.length,
  };
}

module.exports = { getSubtitle };
