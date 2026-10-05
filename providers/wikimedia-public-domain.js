"use strict";

/*
 * Nuvio provider: Wikimedia Commons (Public Domain / CC0)
 *
 * Contract:
 *   getStreams(tmdbId, mediaType, season, episode) -> Promise<Stream[]>
 *
 * This provider deliberately returns only direct video files whose Commons
 * metadata marks them Public domain or CC0. It does not search unofficial
 * streaming hosts. Commons metadata and TMDB-to-Wikidata coverage are
 * incomplete, so an empty array means "no verified match found", not proof
 * that a title is unavailable everywhere.
 */

var PROVIDER_NAME = "Wikimedia Commons — Dominio público";
var WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
var COMMONS_API_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
var REQUEST_TIMEOUT_MS = 15000;
var MAX_RESULTS = 5;

function log(message) {
  if (typeof console !== "undefined" && console && typeof console.log === "function") {
    console.log("[nuvio-public-domain] " + message);
  }
}

function encodeParams(params) {
  var parts = [];
  var keys = Object.keys(params);
  var i;

  for (i = 0; i < keys.length; i += 1) {
    parts.push(encodeURIComponent(keys[i]) + "=" + encodeURIComponent(String(params[keys[i]])));
  }
  return parts.join("&");
}

function fetchJson(url, acceptHeader) {
  return new Promise(function(resolve, reject) {
    var finished = false;
    var timer = setTimeout(function() {
      if (finished) return;
      finished = true;
      reject(new Error("Request timed out"));
    }, REQUEST_TIMEOUT_MS);

    var headers = {};
    if (acceptHeader) headers.Accept = acceptHeader;

    fetch(url, { headers: headers })
      .then(function(response) {
        if (!response || !response.ok) {
          var status = response && response.status ? response.status : "unknown";
          throw new Error("HTTP " + status);
        }
        return response.json();
      })
      .then(function(data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (!data || typeof data !== "object") {
          reject(new Error("Invalid JSON response"));
          return;
        }
        resolve(data);
      })
      .catch(function(error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      });
  });
}

function normalizeMediaType(mediaType) {
  var type = String(mediaType || "").toLowerCase();
  if (type === "movie" || type === "film") return "movie";
  if (type === "tv" || type === "series" || type === "show") return "tv";
  return "";
}

function getMovieFromWikidata(tmdbId) {
  /*
   * Wikidata property P4947 is the TMDB movie ID. No API key is required.
   * We reject ambiguous mappings rather than risk returning a different film.
   */
  var query =
    'SELECT DISTINCT ?item ?itemLabel ?releaseDate WHERE { ' +
    '?item wdt:P4947 "' + tmdbId + '". ' +
    'OPTIONAL { ?item wdt:P577 ?releaseDate. } ' +
    'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } ' +
    '} LIMIT 5';
  var url = WIKIDATA_ENDPOINT + "?" + encodeParams({
    query: query,
    format: "json"
  });

  return fetchJson(url, "application/sparql-results+json").then(function(data) {
    var rows = data.results && data.results.bindings ? data.results.bindings : [];
    var byEntity = {};
    var i;

    for (i = 0; i < rows.length; i += 1) {
      var row = rows[i] || {};
      var entity = row.item && row.item.value ? row.item.value : "";
      if (!entity) continue;

      if (!byEntity[entity]) {
        var releaseDate = row.releaseDate && row.releaseDate.value
          ? String(row.releaseDate.value)
          : "";
        byEntity[entity] = {
          title: row.itemLabel && row.itemLabel.value ? String(row.itemLabel.value) : "",
          year: releaseDate.length >= 4 ? releaseDate.slice(0, 4) : ""
        };
      }
    }

    var entities = Object.keys(byEntity);
    if (entities.length !== 1) {
      if (entities.length > 1) log("TMDB ID has multiple Wikidata matches; skipping.");
      return null;
    }

    var movie = byEntity[entities[0]];
    if (!movie.title) return null;
    return movie;
  });
}

function cleanHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTitle(value) {
  var title = cleanHtml(value);
  title = title.replace(/^File:\s*/i, "");
  title = title.replace(/\.(mp4|m4v|webm|ogv|ogg|mov|mkv)$/i, "");
  title = title.replace(/[_]+/g, " ");
  title = title.replace(/\((?:19|20)\d{2}[^)]*\)/g, " ");
  title = title.replace(/\b(?:19|20)\d{2}\b/g, " ");
  title = title.replace(/\b(?:2160|1440|1080|720|576|480|360)p\b/gi, " ");
  title = title.replace(/\b4k\b/gi, " ");

  if (typeof title.normalize === "function") {
    title = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(value) {
  var match = String(value || "").match(/\b((?:19|20)\d{2})\b/);
  return match ? parseInt(match[1], 10) : 0;
}

function isPublicDomainOrCc0(licenseValue) {
  var license = cleanHtml(licenseValue).toLowerCase().replace(/\s+/g, " ").trim();
  return license === "public domain" ||
    license === "public domain mark" ||
    license === "cc0" ||
    license === "cc0 1.0" ||
    license === "cc0 1.0 universal" ||
    license === "creative commons zero";
}

function getMetadataValue(extmetadata, fieldName) {
  var field = extmetadata && extmetadata[fieldName];
  return field && field.value ? cleanHtml(field.value) : "";
}

function isAllowedVideoUrl(url) {
  return typeof url === "string" &&
    /^https:\/\/upload\.wikimedia\.org\//i.test(url) &&
    /\.(mp4|m4v|webm|ogv|ogg)(?:$|\?)/i.test(url);
}

function getPageList(data) {
  var pages = data && data.query ? data.query.pages : null;
  if (!pages) return [];
  if (Array.isArray(pages)) return pages;

  var keys = Object.keys(pages);
  var result = [];
  var i;
  for (i = 0; i < keys.length; i += 1) {
    result.push(pages[keys[i]]);
  }
  return result;
}

function searchCommons(movie) {
  var safeTitle = String(movie.title || "").replace(/"/g, " ").trim();
  if (!safeTitle) return Promise.resolve([]);

  var search = 'intitle:"' + safeTitle + '" filemime:video';
  var url = COMMONS_API_ENDPOINT + "?" + encodeParams({
    action: "query",
    generator: "search",
    gsrsearch: search,
    gsrnamespace: "6",
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    format: "json",
    formatversion: "2",
    origin: "*"
  });

  return fetchJson(url, "application/json").then(function(data) {
    var pages = getPageList(data);
    var targetTitle = normalizedTitle(movie.title);
    var targetYear = parseInt(movie.year, 10) || 0;
    var streams = [];
    var seen = {};
    var i;

    for (i = 0; i < pages.length && streams.length < MAX_RESULTS; i += 1) {
      var page = pages[i] || {};
      var info = page.imageinfo && page.imageinfo.length ? page.imageinfo[0] : null;
      if (!info) continue;

      var extmetadata = info.extmetadata || {};
      var license = getMetadataValue(extmetadata, "LicenseShortName");
      if (!isPublicDomainOrCc0(license)) continue;

      var objectName = getMetadataValue(extmetadata, "ObjectName");
      var displayName = objectName || String(page.title || "").replace(/^File:\s*/i, "");
      var candidateTitle = normalizedTitle(displayName);
      if (!candidateTitle || candidateTitle !== targetTitle) continue;

      var candidateYear = extractYear(displayName) || extractYear(page.title);
      if (targetYear && candidateYear && Math.abs(targetYear - candidateYear) > 1) continue;

      var mediaUrl = info.url || "";
      if (!isAllowedVideoUrl(mediaUrl) || seen[mediaUrl]) continue;
      seen[mediaUrl] = true;

      var qualityMatch = String(page.title || "").match(/\b(2160|1440|1080|720|576|480|360)p\b/i);
      var streamYear = candidateYear || targetYear;
      var stream = {
        name: PROVIDER_NAME,
        title: movie.title + (streamYear ? " (" + streamYear + ")" : "") +
          " · " + license + " · Wikimedia Commons",
        url: mediaUrl
      };
      if (qualityMatch) stream.quality = qualityMatch[1] + "p";
      streams.push(stream);
    }

    return streams;
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var id = String(tmdbId == null ? "" : tmdbId).trim();
  var type = normalizeMediaType(mediaType);

  if (!/^\d{1,12}$/.test(id)) {
    log("Invalid TMDB ID; returning no streams.");
    return Promise.resolve([]);
  }

  if (type !== "movie") {
    if (type === "tv") log("TV episodes are not supported by this movie-only provider.");
    return Promise.resolve([]);
  }

  return getMovieFromWikidata(id)
    .then(function(movie) {
      if (!movie) {
        log("No unambiguous English Wikidata title found for TMDB ID " + id + ".");
        return [];
      }
      return searchCommons(movie);
    })
    .then(function(streams) {
      return streams || [];
    })
    .catch(function(error) {
      var message = error && error.message ? error.message : String(error);
      log("Lookup failed safely: " + message);
      return [];
    });
}

module.exports = {
  getStreams: getStreams
};
