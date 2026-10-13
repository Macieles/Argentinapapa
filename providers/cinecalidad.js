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
    var fulfilled = (value) => {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = (value) => {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/providers/cinecalidad.js
var cinecalidad_exports = {};
__export(cinecalidad_exports, {
  getStreams: () => getStreams
});
module.exports = __toCommonJS(cinecalidad_exports);

var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

var BASE_URL = "https://www.cinecalidad.my";
var API_BASE = BASE_URL + "/wp-json/wp/v2";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

var XML_HEADER = {
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
};

function fetchJson(url, headers = XML_HEADER) {
  return __async(this, null, function* () {
    const res = yield fetch(url, { headers });
    return yield res.json();
  });
}

function fetchText(url, headers = XML_HEADER) {
  return __async(this, null, function* () {
    const res = yield fetch(url, { headers });
    return yield res.text();
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
    const mediaInfo = yield fetchJson(url);
    return mediaInfo.title || mediaInfo.name;
  });
}

function searchPost(title) {
  return __async(this, null, function* () {
    const searchUrl = `${API_BASE}/posts?search=${encodeURIComponent(title)}&per_page=5`;
    const posts = yield fetchJson(searchUrl);
    if (!posts || posts.length === 0) return null;
    // Tomar el primer resultado (o filtrar por título exacto)
    return posts[0];
  });
}

function extractStreamsFromContent(contentHtml) {
  const $ = import_cheerio_without_node_native.default.load(contentHtml);
  const streams = [];

  // 1) Iframes (embeds directos)
  $("iframe").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && !src.includes("google") && !src.includes("youtube")) {
      streams.push({
        name: `Cinecalidad - Embed`,
        title: `Embed ${streams.length + 1}`,
        url: src,
        quality: "1080p"
      });
    }
  });

  // 2) Scripts con source (jwplayer, videojs, etc.)
  $("script").each((_, el) => {
    const text = $(el).html() || "";
    // Patrón: file: "URL" o source: "URL"
    const fileMatch = text.match(/["']?(?:file|source)["']?\s*[:=]\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (fileMatch) {
      streams.push({
        name: `Cinecalidad - HLS`,
        title: `HLS ${streams.length + 1}`,
        url: fileMatch[1],
        quality: "1080p"
      });
    }
    // Patrón: sources: [{file: "URL"}]
    const sourcesMatch = text.match(/sources\s*:\s*\[\s*{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)["']/);
    if (sourcesMatch) {
      streams.push({
        name: `Cinecalidad - Player`,
        title: `Player ${streams.length + 1}`,
        url: sourcesMatch[1],
        quality: "1080p"
      });
    }
  });

  // 3) Elementos con data-src / data-url
  $("[data-src], [data-url], [data-file]").each((_, el) => {
    const url = $(el).attr("data-src") || $(el).attr("data-url") || $(el).attr("data-file");
    if (url && url.startsWith("http")) {
      streams.push({
        name: `Cinecalidad - Data`,
        title: `Data ${streams.length + 1}`,
        url,
        quality: "1080p"
      });
    }
  });

  return streams;
}

function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[Cinecalidad] Fetching ${mediaType} ${tmdbId}`);
      tmdbId = yield resolveTmdbId(tmdbId, mediaType);
      const title = yield getTmdbTitle(tmdbId, mediaType);
      if (!title) {
        console.log("[Cinecalidad] No title found");
        return [];
      }
      console.log(`[Cinecalidad] Title: ${title}`);

      // ── Búsqueda en la API de WP ──
      const post = yield searchPost(title);
      if (!post) {
        console.log("[Cinecalidad] No post found");
        return [];
      }
      console.log(`[Cinecalidad] Post: ${post.title.rendered} (ID: ${post.id})`);

      // ── Extraer streams del contenido ──
      const contentHtml = post.content.rendered;
      const streams = extractStreamsFromContent(contentHtml);

      // ── Si no hay streams en el contenido, intentar con el link directo ──
      if (streams.length === 0 && post.link) {
        console.log("[Cinecalidad] No streams in content, fetching post page...");
        const pageHtml = yield fetchText(post.link);
        const pageStreams = extractStreamsFromContent(pageHtml);
        streams.push(...pageStreams);
      }

      console.log(`[Cinecalidad] Streams found: ${streams.length}`);
      return streams;
    } catch (e) {
      console.log(`[Cinecalidad] Error: ${e.message}`);
      return [];
    }
  });
}

0 && (module.exports = { getStreams });   
