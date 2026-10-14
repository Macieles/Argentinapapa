var TMDB_KEY = 'a2d9bbed370d9f678e34006f8750a5a5'; // recomendado: regenerarla en TMDB
var TMDB = 'https://api.themoviedb.org/3';
var BASE = 'https://pelispanda.org';
var API = BASE + '/wp-json/wpreact/v1';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
var TIMEOUT = 10000;
var DEBUG = true;

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


var learned = { kind: {}, search: {}, detail: {} };

function log() {
  if (!DEBUG) return;
  try { console.log.apply(console, ['[PelisPanda]'].concat([].slice.call(arguments))); } catch (e) {}
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

async function httpGetJson(url) {
  try {
    var res = await withTimeout(fetch(url, {
      headers: { Accept: 'application/json, */*', 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.8', Referer: BASE + '/' }
    }), TIMEOUT);
    if (!res.ok) { log('HTTP', res.status, url); return null; }
    var text = await res.text();
    try { return JSON.parse(text); } catch (e) { log('No es JSON:', url); return null; }
  } catch (e) {
    log('Error de red:', url, e && e.message);
    return null;
  }
}

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
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
  return { infoHash: hash ? hash.toLowerCase() : null, displayName: dn };
}

// ---------- TMDB ----------
async function getTmdbInfo(tmdbId, isMovie) {
  var res = await httpGetJson(TMDB + '/' + (isMovie ? 'movie' : 'tv') + '/' + tmdbId +
    '?api_key=' + TMDB_KEY + '&language=es-MX');
  if (!res) return null;
  return {
    title: res.title || res.name || '',
    originalTitle: res.original_title || res.original_name || '',
    year: (res.release_date || res.first_air_date || '').slice(0, 4)
  };
}


function looksLikeItems(arr) {
  return Array.isArray(arr) && arr.length && arr[0] && typeof arr[0] === 'object' &&
    (arr[0].tmdb_id !== undefined || arr[0].slug !== undefined);
}


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
  return a.id && b.id && String(a.id) === String(b.id);
}

var CTX_KEYS = ['quality', 'calidad', 'resolution', 'resolucion', 'label', 'name', 'title', 'size', 'tamano', 'peso'];


function collectLinks(node, ctx, out) {
  if (typeof node === 'string') {
    var mags = node.match(/magnet:\?[^"'\s<>]+/gi) || [];
    mags.forEach(function (m) { out.push({ url: decodeHtml(m), ctx: ctx }); });
    var tors = node.match(/https?:\/\/[^"'\s<>]+\.torrent(?:\?[^"'\s<>]*)?/gi) || [];
    tors.forEach(function (t) { out.push({ url: decodeHtml(t), ctx: ctx }); });
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


async function findItem(tmdbId, info, isMovie) {
  var type = isMovie ? 'movie' : 'tv';
  var titles = [info.title, info.originalTitle].filter(function (t, i, a) { return t && a.indexOf(t) === i; });
  var kinds = learned.kind[type] ? [learned.kind[type]] : KINDS[type];
  var params = learned.search[type] ? [learned.search[type]] : SEARCH_PARAMS;

  for (var ki = 0; ki < kinds.length; ki++) {
    for (var ti = 0; ti < titles.length; ti++) {
      for (var pi = 0; pi < params.length; pi++) {
        var url = API + '/' + kinds[ki] + '?' + params[pi] + '=' + encodeURIComponent(titles[ti]) + '&posts_per_page=20&page=1';
        var json = await httpGetJson(url);
        if (!json) continue;
        var list = extractList(json);
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          var byId = it && String(it.tmdb_id) === String(tmdbId);
          var byName = it && info.year && String(it.year) === String(info.year) &&
            (norm(it.original_title) === norm(info.originalTitle) || norm(it.title) === norm(info.title));
          if (byId || byName) {
            learned.kind[type] = kinds[ki];
            learned.search[type] = params[pi];
            log('Encontrado:', it.title, '(' + kinds[ki] + ', ?' + params[pi] + '=)');
            return { item: it, kind: kinds[ki] };
          }
        }
      }
    }
  }
  log('No se encontró en el sitio tmdb_id', tmdbId, '| títulos probados:', titles.join(' / '));
  return null;
}


async function getDetail(kind, item) {
  var type = kind === 'movies' ? 'movie' : 'tv';
  var builders = learned.detail[type] != null ? [DETAIL_BUILDERS[learned.detail[type]]] : DETAIL_BUILDERS;
  var idxs = learned.detail[type] != null ? [learned.detail[type]] : builders.map(function (_, i) { return i; });

  // 1) Puede que el propio ítem del listado ya traiga enlaces
  var own = collectLinks(item, '', []);
  if (own.length) { log('Enlaces en el propio listado:', own.length); return item; }

  for (var i = 0; i < builders.length; i++) {
    var json = await httpGetJson(builders[i](kind, item));
    if (!json) continue;
    var list = extractList(json);
    var node = json;
    if (list.length) {
      node = null;
      for (var j = 0; j < list.length; j++) if (sameItem(list[j], item)) { node = list[j]; break; }
      if (!node) continue;
    }
    if (collectLinks(node, '', []).length) {
      learned.detail[type] = idxs[i];
      log('Detalle OK con builder #' + idxs[i]);
      return node;
    }
  }
  return null;
}

async function scrapeTorrents(tmdbId, info, season, episode, isMovie) {
  var found = await findItem(tmdbId, info, isMovie);
  if (!found) return [];

  var detail = await getDetail(found.kind, found.item);
  if (!detail) { log('No se pudo obtener un detalle con enlaces para', found.item.slug); return []; }

  var links = collectLinks(detail, '', []);
  var seen = {};
  var streams = [];

  links.forEach(function (l) {
    var isMagnet = l.url.indexOf('magnet:?') === 0;
    var meta = isMagnet ? parseMagnet(l.url) : { infoHash: null, displayName: '' };
    var key = meta.infoHash || l.url;
    if (seen[key]) return;
    seen[key] = true;

    var quality = detectQuality(meta.displayName + ' ' + l.ctx);
    streams.push({
      name: 'Torrent - ' + quality,
      title: meta.displayName || l.ctx || info.title,
      url: l.url,
      infoHash: meta.infoHash,
      quality: quality,
      provider: 'PelisPanda',
      headers: { 'User-Agent': UA },
      _tag: (meta.displayName + ' ' + l.ctx)
    });
  });

  if (!isMovie) {
    var re = new RegExp('(s0?' + season + '[\\s._-]*e0?' + episode + '\\b)|(\\b0?' + season + 'x0?' + episode + '\\b)', 'i');
    var anyTagged = streams.some(function (s) { return /s\d+\s*[._-]*e\d+|\b\d+x\d+\b/i.test(s._tag); });
    if (anyTagged) streams = streams.filter(function (s) { return re.test(s._tag); });
  }

  streams.forEach(function (s) { delete s._tag; });
  return streams;
}

async function getStreams(tmdbId, type, season, episode) {
  try {
    var id = parseInt(tmdbId, 10);
    if (!id) return [];
    var isMovie = String(type).toLowerCase() === 'movie';

    var info = await getTmdbInfo(id, isMovie);
    if (!info || (!info.title && !info.originalTitle)) {
      log('Sin datos de TMDB para', id);
      return [];
    }

    var streams = await scrapeTorrents(id, info, season || 1, episode || 1, isMovie);
    log('Streams devueltos:', streams.length);
    return streams;
  } catch (e) {
    log('Error:', e && e.message);
    return [];
  }
}

module.exports = { getStreams: getStreams };
