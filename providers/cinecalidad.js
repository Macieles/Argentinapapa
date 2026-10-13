"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/providers/cinecalidad.js
var cinecalidad_exports = {};
__export(cinecalidad_exports, { getStreams: () => getStreams });
module.exports = __toCommonJS(cinecalidad_exports);

var import_cheerio = __toESM(require("cheerio-without-node-native"));

var BASE_URLS = [
  "https://www.cinecalidad.rs",
  "https://www.cinecalidad.my",
  "https://cinecalidad.fm",
  "https://cinecalidad.re",
  "https://cinecalidad.fun"
];
var BASE_URL = BASE_URLS[0];
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var _baseIndex = 0;

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8"
};

var EMBED_MAP = {
  "OnlineMega":       (data) => `https://mega.nz/embed/${data}`,
  "OnlineDoodstream": (data) => `https://doodstream.com/e/${data}`,
  "OnlineFilemoon":   (data) => `https://bysedikamoum.com/e/${data}`,
  "OnlineNetu":       (data) => `https://www.zarato.top/watch_video.php?v=${data}`,
  "OnlineVoe":        (data) => `https://voe.sx/e/${data}`,
  "Mega":             (data) => `${BASE_URL}/protect/ver.php?i=${data}`,
  "Trailer":          (data) => `https://www.youtube.com/embed/${data}`
};

function fetchText(url, headers = HEADERS) {
  return __async(this, null, function* () {
    const res = yield fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return yield res.text();
  });
}

function fetchJson(url, headers = HEADERS) {
  return __async(this, null, function* () {
    const res = yield fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return yield res.json();
  });
}

function fetchWithFallback(path, headers = HEADERS) {
  return __async(this, null, function* () {
    let lastErr = null;
    for (let i = 0; i < BASE_URLS.length; i++) {
      const idx = (_baseIndex + i) % BASE_URLS.length;
      const base = BASE_URLS[idx];
      const fullUrl = base + path;
      try {
        console.log(`[Cinecalidad] Trying: ${fullUrl}`);
        const res = yield fetch(fullUrl, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = yield res.text();
        if (text.length < 100) throw new Error("Response too short (likely blocked)");
        _baseIndex = idx;
        BASE_URL = base;
        console.log(`[Cinecalidad] Using domain: ${base}`);
        return text;
      } catch (e) {
        lastErr = e;
        console.log(`[Cinecalidad] Failed ${base}: ${e.message}`);
      }
    }
    throw lastErr || new Error("All domains failed");
  });
}

function resolveTmdbId(id, mediaType) {
  return __async(this, null, function* () {
    if (!String(id).startsWith("tt")) return id;
    const url = `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const data = yield fetchJson(url);
    const tmdbId = mediaType === "movie"
      ? data?.movie_results?.[0]?.id
      : data?.tv_results?.[0]?.id;
    if (!tmdbId) throw new Error("Failed to resolve TMDB ID");
    return tmdbId;
  });
}

function getTmdbTitle(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    const info = yield fetchJson(url);
    return info.title || info.name;
  });
}

function searchSite(title) {
  return __async(this, null, function* () {
    const path = `/?s=${encodeURIComponent(title)}`;
    console.log(`[Cinecalidad] Search: "${title}"`);
    const html = yield fetchWithFallback(path);
    const $ = import_cheerio.default.load(html);

    let movieUrl = null;

    // Selectores específicos de cinecalidad
    const selectors = [
      "div.pane a.link",
      "h2 a[href*='/pelicula']",
      "h3 a[href*='/pelicula']",
      "h2 a[href*='/serie']",
      "h3 a[href*='/serie']",
      ".post-title a",
      "article a[href*='/pelicula']",
      "article a[href*='/serie']",
      ".home_post_cont a",
      "a[href*='/pelicula/']",
      "a[href*='/serie/']",
      "a[href*='/pelis/']"
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const href = $(el).attr("href");
        if (href && !movieUrl) {
          movieUrl = href.startsWith("http") ? href : BASE_URL + href;
        }
      });
      if (movieUrl) break;
    }

    // Fallback: link con texto que contenga palabras del título
    if (!movieUrl) {
      const words = title.toLowerCase().split(" ").filter(w => w.length > 3);
      $("a").each((_, el) => {
        if (movieUrl) return;
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().toLowerCase();
        if (!href.startsWith("http")) return;
        if (href.includes("/tag/") || href.includes("#") || href.includes("facebook") || href.includes("twitter")) return;
        const matchCount = words.filter(w => text.includes(w)).length;
        if (matchCount >= Math.ceil(words.length * 0.5)) {
          movieUrl = href;
        }
      });
    }

    if (!movieUrl) {
      console.log("[Cinecalidad] No movie found. HTML length:", html.length);
      console.log("[Cinecalidad] DEBUG (first 1000):", html.substring(0, 1000));
      return null;
    }

    console.log(`[Cinecalidad] Movie URL: ${movieUrl}`);
    return movieUrl;
  });
}

function extractServers(html) {
  const $ = import_cheerio.default.load(html);
  const servers = [];

  // Método 1: a.link con service + data (estructura original)
  $("a[service][data]").each((_, el) => {
    const service = $(el).attr("service");
    const data = $(el).attr("data");
    const name = $(el).find("li").text().trim() || $(el).text().trim() || service;
    if (!service || !data) return;

    let url;
    if (EMBED_MAP[service]) {
      url = EMBED_MAP[service](data);
    } else {
      url = $(el).attr("href");
      if (!url) return;
    }

    let quality = "Unknown";
    if (/4k|2160/i.test(name)) quality = "2160p";
    else if (/1080/i.test(name)) quality = "1080p";
    else if (/720/i.test(name)) quality = "720p";

    servers.push({ service, name, data, embedUrl: url, quality });
  });

  // Método 2: si no encontró nada, buscar iframes directamente
  if (servers.length === 0) {
    $("iframe[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src && !src.includes("youtube") && !src.includes("google")) {
        servers.push({
          service: "iframe",
          name: `Iframe ${servers.length + 1}`,
          data: src,
          embedUrl: src,
          quality: "Unknown"
        });
      }
    });
  }

  // Método 3: buscar en scripts (a veces los links están en JS)
  if (servers.length === 0) {
    const scriptText = $("script").map((_, el) => $(el).html() || "").get().join("\n");
    const serviceRegex = /service\s*:\s*["'](\w+)["']\s*,\s*data\s*:\s*["']([^"']+)["']/g;
    let m;
    while ((m = serviceRegex.exec(scriptText)) !== null) {
      const service = m[1];
      const data = m[2];
      if (EMBED_MAP[service]) {
        servers.push({
          service,
          name: service,
          data,
          embedUrl: EMBED_MAP[service](data),
          quality: "Unknown"
        });
      }
    }
  }

  return servers;
}

function resolveEmbedToStream(embedUrl, service) {
  return __async(this, null, function* () {
    try {
      let headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": new URL(embedUrl).origin + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      };

      if (service === "OnlineVoe") headers["Referer"] = "https://voe.sx/";
      if (service === "OnlineDoodstream") headers["Referer"] = "https://doodstream.com/";

      const html = yield fetchText(embedUrl, headers);

      // 1) .m3u8
      const m3u8Regex = /["']?(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)["']?/g;
      let m;
      const m3u8Urls = new Set();
      while ((m = m3u8Regex.exec(html)) !== null) {
        m3u8Urls.add(m[1].replace(/["']+$/, ""));
      }
      if (m3u8Urls.size > 0) {
        const url = [...m3u8Urls][0];
        console.log(`[Resolve] M3U8 found (${service})`);
        return { url, type: "m3u8", headers: { Referer: new URL(embedUrl).origin + "/" } };
      }

      // 2) .mp4
      const mp4Regex = /["']?(https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*)["']?/g;
      const mp4Urls = new Set();
      while ((m = mp4Regex.exec(html)) !== null) {
        mp4Urls.add(m[1].replace(/["']+$/, ""));
      }
      if (mp4Urls.size > 0) {
        const url = [...mp4Urls][0];
        console.log(`[Resolve] MP4 found (${service})`);
        return { url, type: "mp4", headers: { Referer: new URL(embedUrl).origin + "/" } };
      }

      // 3) JSON "file"
      const jsonFileRegex = /"file"\s*:\s*["'](https?:\/\/[^"']+)["']/g;
      while ((m = jsonFileRegex.exec(html)) !== null) {
        const url = m[1];
        if (/\.(m3u8|mp4|webm|mkv)/i.test(url)) {
          return { url, type: url.endsWith(".m3u8") ? "m3u8" : "mp4", headers: { Referer: new URL(embedUrl).origin + "/" } };
        }
      }

      // 4) source en <video> tag
      const videoSrcRegex = /<video[^>]*src\s*=\s*["'](https?:\/\/[^"']+)["']/;
      const vMatch = html.match(videoSrcRegex);
      if (vMatch) {
        return { url: vMatch[1], type: "mp4", headers: { Referer: new URL(embedUrl).origin + "/" } };
      }

      console.log(`[Resolve] No stream found for ${service} (${embedUrl})`);
      return null;
    } catch (e) {
      console.log(`[Resolve] Error (${service}): ${e.message}`);
      return null;
    }
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Cinecalidad] === Fetching ${mediaType} ${tmdbId} ===`);
      tmdbId = yield resolveTmdbId(tmdbId, mediaType);
      const title = yield getTmdbTitle(tmdbId, mediaType);
      if (!title) {
        console.log("[Cinecalidad] No title found from TMDB");
        return [];
      }
      console.log(`[Cinecalidad] Title: "${title}"`);

      // Búsqueda
      const movieUrl = yield searchSite(title);
      if (!movieUrl) return [];

      // Fetch de la página de la película
      let moviePath;
      try {
        const u = new URL(movieUrl);
        moviePath = u.pathname + u.search;
      } catch {
        moviePath = movieUrl;
      }

      const pageHtml = yield fetchWithFallback(moviePath);
      console.log(`[Cinecalidad] Page fetched (${pageHtml.length} chars)`);

      // Extraer servers
      const servers = extractServers(pageHtml);
      console.log(`[Cinecalidad] Servers found: ${servers.length}`);

      if (servers.length === 0) {
        console.log("[Cinecalidad] DEBUG: No servers. HTML snippet:");
        console.log(pageHtml.substring(0, 2000));
        return [];
      }

      // Resolver cada embed
      const streams = [];
      for (const server of servers.slice(0, 5)) {
        console.log(`[Cinecalidad] Resolving: ${server.name} → ${server.embedUrl}`);
        const resolved = yield resolveEmbedToStream(server.embedUrl, server.service);

        if (resolved) {
          streams.push({
            name: `Cinecalidad - ${server.name}`,
            title: server.name,
            url: resolved.url,
            quality: server.quality,
            headers: resolved.headers
          });
        } else {
          streams.push({
            name: `Cinecalidad - ${server.name} (embed)`,
            title: server.name,
            url: server.embedUrl,
            quality: server.quality,
            type: "embed"
          });
        }
      }

      console.log(`[Cinecalidad] === Done: ${streams.length} streams ===`);
      return streams;
    } catch (e) {
      console.log(`[Cinecalidad] ERROR: ${e.message}`);
      console.log(`[Cinecalidad] Stack: ${e.stack}`);
      return [];
    }
  });
}

0 && (module.exports = { getStreams });   
