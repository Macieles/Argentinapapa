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
var BASE_URL = "https://www.cinecalidad.my";
var TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8"
};

var EMBED_MAP = {
  "OnlineMega":      (data) => `https://mega.nz/embed/${data}`,
  "OnlineDoodstream":(data) => `https://doodstream.com/e/${data}`,
  "OnlineFilemoon":  (data) => `https://bysedikamoum.com/e/${data}`,
  "OnlineNetu":      (data) => `https://www.zarato.top/watch_video.php?v=${data}`,
  "OnlineVoe":       (data) => `https://voe.sx/e/${data}`,
  "Mega":            (data) => `${BASE_URL}/protect/ver.php?i=${data}`,
  "Trailer":         (data) => `https://www.youtube.com/embed/${data}`
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
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
    console.log(`[Cinecalidad] Search: ${searchUrl}`);
    const html = yield fetchText(searchUrl);
    const $ = import_cheerio.default.load(html);

    let movieUrl = null;

    // Selectores para resultados de búsqueda en cinecalidad
    $("h2 a, h3 a, .post-title a, article a, .home_post_cont a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !movieUrl) {
        movieUrl = href.startsWith("http") ? href : BASE_URL + href;
      }
    });

    // Fallback: cualquier link con el título
    if (!movieUrl) {
      const firstWord = title.toLowerCase().split(" ")[0];
      $("a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().toLowerCase();
        if (href.startsWith("http") && text.includes(firstWord) && href.includes("/pelicula") || href.includes("/serie")) {
          if (!movieUrl) movieUrl = href;
        }
      });
    }

    if (!movieUrl) {
      console.log("[Cinecalidad] No movie found");
      return null;
    }

    console.log(`[Cinecalidad] Movie URL: ${movieUrl}`);
    return movieUrl;
  });
}

function extractServers(html) {
  const $ = import_cheerio.default.load(html);
  const streams = [];

  // Los links están en div.pane a.link
  // Atributos: service, data, href
  // El nombre del server está en <li> dentro del <a>
  $("div.pane a.link, a.link").each((_, el) => {
    const service = $(el).attr("service");
    const data = $(el).attr("data");
    const name = $(el).find("li").text().trim() || $(el).text().trim() || service;

    if (!service || !data) return;
    let url;
    if (EMBED_MAP[service]) {
      url = EMBED_MAP[service](data);
    } else {
      // Fallback: usar el href directamente
      url = $(el).attr("href");
      if (!url) return;
    }
    let quality = "Unknown";
    if (/4k|2160/i.test(name)) quality = "2160p";
    else if (/1080/i.test(name)) quality = "1080p";
    else if (/720/i.test(name)) quality = "720p";

    streams.push({
      name: `Cinecalidad - ${name}`,
      title: name,
      url: url,
      quality: quality
    });
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

      // Búsqueda
      const movieUrl = yield searchSite(title);
      if (!movieUrl) return [];

      // Fetch de la página
      const pageHtml = yield fetchText(movieUrl);

      // Extraer servers
      const streams = extractServers(pageHtml);

      console.log(`[Cinecalidad] Streams found: ${streams.length}`);
      return streams;
    } catch (e) {
      console.log(`[Cinecalidad] Error: ${e.message}`);
      return [];
    }
  });
}

0 && (module.exports = { getStreams });   
