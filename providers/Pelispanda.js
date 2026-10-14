/**
 * PelisPanda - Nuvio local scraper (torrents en español latino)
 * Firma estándar de Nuvio: getStreams(tmdbId, mediaType, seasonNum, episodeNum) -> Promise<Stream[]>
 * Escrito con promesas (sin async/await) y sin String.normalize para compatibilidad con Hermes.
 */

var TMDB_API_KEY = 'a2d9bbed370d9f678e34006f8750a5a5'; 
var TMDB_BASE = 'https://api.themoviedb.org/3';
var SITE = 'https://pelispanda.org';
var API = SITE + '/wp-json/wpreact/v1';
var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
var REQUEST_TIMEOUT = 10000;
var PROVIDER_NAME = 'PelisPanda';
var DEBUG = true;

// El listado "movies" está confirmado. Series, parámetro de búsqueda y detalle son SUPUESTOS:
// se prueban en orden y se recuerda el que funcione.
var KINDS = { movie: ['movies'], tv: ['series', 'tvshows', 'shows', 'serie'] };
var SEARCH_PARAMS = ['search', 's', 'q'];
var DETAIL_BUILDERS = [
  function (k, it) { return API + '/' + k + '/' + it.slug; },
  function (k, it) { return API + '/' + k + '/' + it.id; },
  function (k, it) { return API + '/' + k.replace(/s$/, '') + '/' + it.slug; },
  function (k, it) { return API + '/' + k.replace(/s$/, '') + '/' + it.id; },
  function (k, it) { return API + '/' + k + '?slug=' + encodeURIComponent(it.slug); },
  function (k, it) { return API + '/' + k + '?id=' + it.id; },
  function (k, it) { return API + '/' + k + '?tmdb_id=' + it.tmdb_id; }
];
var QUALITY_RANK = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
var learned = { kind: {}, search: {}, detail: {} };

function log() {
  if (!DEBUG) return;
  try { console.log.apply(console, ['[' + PROVIDER_NAME + ']'].concat([].slice.call(arguments))); } catch (e) {}
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}


function firstResult(tasks) {
  return tasks.reduce(function (p, task) {
    return p.then(function (r) { return r ? r : task(); });
  }, Promise.resolve(null));
}

function httpGetJson(url) {
  return withTimeout(fetch(url, {
    headers: { Accept: 'application/json, */*', 'User-Agent': USER_AGENT, 'Accept-Language': 'es-ES,es;q=0.8', Referer: SITE + '/' }
  }), REQUEST_TIMEOUT).then(function (res) {
    if (!res.ok) { log('HTTP', res.status, url); return null; }
    return res.text().then(function (text) {
      try { return JSON.parse(text); } catch (e) { log('Respuesta no JSON:', url); return null; }
    });
  }).catch(function (e) {
    log('Error de red:', url, e && e.message);
    return null;
  });
}

var ACCENTS = { 'á': 'a', 'à': 'a', 'ä': 'a', 'â': 'a', 'ã': 'a', 'é': 'e', 'è': 'e', 'ë': 'e', 'ê': 'e',
  'í': 'i', 'ì': 'i', 'ï': 'i', 'î': 'i', 'ó': 'o', 'ò': 'o', 'ö': 'o', 'ô': 'o', 'õ': 'o',
  'ú': 'u', 'ù': 'u', 'ü': 'u', 'û': 'u', 'ñ': 'n', 'ç': 'c' };

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[áàäâãéèëêíìïîóòöôõúùüûñç]/g, function (c) { return ACCENTS[c] || c; })
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/gi, '&').replace(/&#0?38;/g, '&')
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'");
}

function detectQuality(text) {
  var t = String(text || '').toLowerCase();
  if (/2160p|\b4k\b|uhd/.test(t)) return '4K';
  if (/1080p|full\s?hd/.test(t)) return '1080p';
  if (/720p|\bhd\b/.test(t)) return '720p';
  if (/480p|dvdrip|dvd/.test(t)) return '480p';
  return 'Unknown';
}


function parseMagnet(magnet) {
  var hash = (magnet.match(/btih:([a-zA-Z0-9]+)/i) || [])[1] || null;
  var dn = (magnet.match(/[?&]dn=([^&]+)/i) || [])[1] || '';
  try { dn = decodeURIComponent(dn.replace(/\+/g, ' ')); } catch (e) {}
  var trackers = [];
  var re = /[?&]tr=([^&]+)/gi;
  var m;
  while ((m = re.exec(magnet)) !== null) {
    try { trackers.push(decodeURIComponent(m[1])); } catch (e) { trackers.push(m[1]); }
  }
  return { infoHash: hash ? hash.toLowerCase() : null, displayName: dn, trackers: trackers };
}

function getTmdbInfo(tmdbId, isMovie) {
  var url = TMDB_BASE + '/' + (isMovie ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=es-MX';
  return httpGetJson(url).then(function (res) {
    if (!res) return null;
    return {
      title: res.title || res.name || '',
      originalTitle: res.original_title || res.original_name || '',
      year: (res.release_date || res.first_air_date || '').slice(0, 4)
    };
  });
}


function looksLikeItems(arr) {
  return Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === 'object' &&
    (arr[0].tmdb_id !== undefined || arr[0].slug !== undefined);
}

// Devuelve el listado de ítems del catálogo si la respuesta es un listado; si es un detalle devuelve []
function extractList(json) {
  if (looksLikeItems(json)) return json;
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    var keys = Object.keys(json);
    for (var i = 0; i < keys.length; i++) {
      if (looksLikeItems(json[keys[i]])) return json[keys[i]];
    }
  }
  return [];
}

function sameItem(a, b) {
  if (!a || !b) return false;
  if (a.tmdb_id && b.tmdb_id) return String(a.tmdb_id) === String(b.tmdb_id);
  return !!(a.id && b.id && String(a.id) === String(b.id));
}

var CTX_KEYS = ['quality', 'calidad', 'resolution', 'resolucion', 'label', 'name', 'title', 'size', 'tamano', 'peso'];

// Recorre cualquier JSON y junta magnets / .torrent con contexto (calidad, etiqueta)
function collectLinks(node, ctx, out) {
  if (typeof node === 'string') {
    (node.match(/magnet:\?[^"'\s<>]+/gi) || []).forEach(function (m) { out.push({ url: decodeHtml(m), ctx: ctx }); });
    (node.match(/https?:\/\/[^"'\s<>]+\.torrent(?:\?[^"'\s<>]*)?/gi) || []).forEach(function (t) { out.push({ url: decodeHtml(t), ctx: ctx }); });
  } else if (Array.isArray(node)) {
    node.forEach(function (n) { collectLinks(n, ctx, out); });
  } else if (node && typeof node === 'object') {
    var local = CTX_KEYS.map(function (k) {
      var v = node[k];
      return (typeof v === 'string' || typeof v === 'number') ? String(v) : '';
    }).join(' ').trim();
    var next = local ? local : ctx;
    Object.keys(node).forEach(function (k) { collectLinks(node[k], next, out); });
  }
  return out;
}

// ---------------------------------------------------------------- búsqueda y detalle
function findItem(tmdbId, info, isMovie) {
  var type = isMovie ? 'movie' : 'tv';
  var titles = [info.title, info.originalTitle].filter(function (t, i, a) { return t && a.indexOf(t) === i; });
  var kinds = learned.kind[type] ? [learned.kind[type]] : KINDS[type];
  var params = learned.search[type] ? [learned.search[type]] : SEARCH_PARAMS;
  var tasks = [];

  kinds.forEach(function (kind) {
    titles.forEach(function (title) {
      params.forEach(function (param) {
        tasks.push(function () {
          var url = API + '/' + kind + '?' + param + '=' + encodeURIComponent(title) + '&posts_per_page=20&page=1';
          return httpGetJson(url).then(function (json) {
            if (!json) return null;
            var list = extractList(json);
            for (var i = 0; i < list.length; i++) {
              var it = list[i];
              var byId = String(it.tmdb_id) === String(tmdbId);
              var byName = info.year && String(it.year) === String(info.year) &&
                (norm(it.original_title) === norm(info.originalTitle) || norm(it.title) === norm(info.title));
              if (byId || byName) {
                learned.kind[type] = kind;
                learned.search[type] = param;
                log('Encontrado:', it.title, '(' + kind + ', ?' + param + '=)');
                return { item: it, kind: kind };
              }
            }
            return null;
          });
        });
      });
    });
  });

  return firstResult(tasks).then(function (found) {
    if (!found) log('No se encontró en el sitio tmdb_id', tmdbId, '| títulos:', titles.join(' / '));
    return found;
  });
}

function getDetail(kind, item) {
  var type = kind === 'movies' ? 'movie' : 'tv';
  if (collectLinks(item, '', []).length) { log('Enlaces en el propio listado'); return Promise.resolve(item); }

  var tasks = DETAIL_BUILDERS.map(function (build, idx) {
    return function () {
      return httpGetJson(build(kind, item)).then(function (json) {
        if (!json) return null;
        var list = extractList(json);
        var node = json;
        if (list.length) {
          node = null;
          for (var j = 0; j < list.length; j++) if (sameItem(list[j], item)) { node = list[j]; break; }
        }
        if (node && collectLinks(node, '', []).length) {
          learned.detail[type] = idx;
          log('Detalle OK con builder #' + idx);
          return node;
        }
        return null;
      });
    };
  });
  if (learned.detail[type] != null) tasks = [tasks[learned.detail[type]]];
  return firstResult(tasks);
}

// ---------------------------------------------------------------- armado de streams
function buildStreams(detail, info, isMovie, season, episode) {
  var seen = {};
  var streams = [];

  collectLinks(detail, '', []).forEach(function (l) {
    var isMagnet = l.url.indexOf('magnet:?') === 0;
    var meta = isMagnet ? parseMagnet(l.url) : { infoHash: null, displayName: '', trackers: [] };
    var key = meta.infoHash || l.url;
    if (seen[key]) return;
    seen[key] = true;

    var tag = meta.displayName + ' ' + l.ctx;
    var quality = detectQuality(tag);
    var stream = {
      name: PROVIDER_NAME + ' - ' + quality,
      title: (meta.displayName || l.ctx || info.title) + (quality !== 'Unknown' && tag.toLowerCase().indexOf(quality.toLowerCase()) < 0 ? ' ' + quality : ''),
      url: l.url,
      quality: quality,
      provider: 'pelispanda',
      headers: { 'User-Agent': USER_AGENT },
      _tag: tag
    };
    if (meta.infoHash) {
      // Campos estilo Stremio: permiten que el reproductor consiga semillas (trackers + DHT) y haga buffer
      stream.infoHash = meta.infoHash;
      stream.sources = meta.trackers.map(function (t) { return 'tracker:' + t; }).concat(['dht:' + meta.infoHash]);
      stream.behaviorHints = { notWebReady: true, bingeGroup: 'pelispanda-' + quality };
    }
    streams.push(stream);
  });

  if (!isMovie) {
    var re = new RegExp('(s0?' + season + '[\\s._-]*e0?' + episode + '\\b)|(\\b0?' + season + 'x0?' + episode + '\\b)', 'i');
    var anyTagged = streams.some(function (s) { return /s\d+\s*[._-]*e\d+|\b\d+x\d+\b/i.test(s._tag); });
    if (anyTagged) streams = streams.filter(function (s) { return re.test(s._tag); });
  }

  streams.forEach(function (s) { delete s._tag; });
  streams.sort(function (a, b) { return (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0); });
  return streams;
}

// ---------------------------------------------------------------- punto de entrada
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var id = parseInt(tmdbId, 10);
  if (!id) return Promise.resolve([]);
  var isMovie = String(mediaType).toLowerCase() === 'movie';
  var season = seasonNum || 1;
  var episode = episodeNum || 1;

  return getTmdbInfo(id, isMovie).then(function (info) {
    if (!info || (!info.title && !info.originalTitle)) { log('Sin datos de TMDB para', id); return []; }
    return findItem(id, info, isMovie).then(function (found) {
      if (!found) return [];
      return getDetail(found.kind, found.item).then(function (detail) {
        if (!detail) { log('Sin enlaces en el detalle de', found.item.slug); return []; }
        var streams = buildStreams(detail, info, isMovie, season, episode);
        log('Streams devueltos:', streams.length);
        return streams;
      });
    });
  }).catch(function (e) {
    log('Error:', e && e.message);
    return [];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
