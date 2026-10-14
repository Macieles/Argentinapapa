var TMDB_KEY = 'a2d9bbed370d9f678e34006f8750a5a5';
var TMDB = 'https://api.themoviedb.org/3';
var BASE = 'https://pelispanda.org'; //
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function httpGet(url) {
  try {
    var res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es-MX,es;q=0.9' },
      redirect: 'follow'
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function httpGetJson(url) {
  try {
    var res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function slugify(title) {
  var s = String(title || '').trim().toLowerCase();
  var map = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n' };
  Object.keys(map).forEach(function (k) { s = s.split(k).join(map[k]); });
  return s.replace(/[^a-z0-9\s-]/g, '').replace(/[\s-]+/g, '-').replace(/^-+|-+$/g, '');
}

async function getTmdbInfo(tmdbId, isMovie) {
  var endpoint = isMovie ? 'movie' : 'tv';
  try {
    var res = await httpGetJson(TMDB + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_KEY + '&language=es-MX');
    if (!res) return null;
    return {
      title: res.title || res.name || '',
      year: (res.release_date || res.first_air_date || '').slice(0, 4)
    };
  } catch (e) {
    return null;
  }
}

async function scrapeTorrents(tmdbInfo, season, episode, isMovie) {
  var slug = slugify(tmdbInfo.title);
  if (!slug) return [];

  var candidates = [];
  if (isMovie) {
    candidates.push(BASE + '/pelicula/' + slug + '/');
    candidates.push(BASE + '/' + slug + '/');
  } else {
    candidates.push(BASE + '/serie/' + slug + '-temporada-' + season + '-episodio-' + episode + '/');
    candidates.push(BASE + '/' + slug + '-t' + season + 'e' + episode + '/');
  }

  var html = null;
  for (var i = 0; i < candidates.length; i++) {
    html = await httpGet(candidates[i]);
    if (html) break;
  }

  if (!html) return [];

  var torrents = [];
  var linkRegex = /<a[^>]+href=["'](magnet:\?[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;

  while ((match = linkRegex.exec(html)) !== null) {
    var magnetUrl = match[1];
    var anchorText = match[2].replace(/<[^>]*>?/g, '').trim();


    if (magnetUrl && magnetUrl.indexOf('magnet:?') === 0) {
      var quality = '1080p';
      var textLower = (anchorText + ' ' + html).toLowerCase();
      if (textLower.indexOf('2160p') >= 0 || textLower.indexOf('4k') >= 0) quality = '4K';
      else if (textLower.indexOf('720p') >= 0) quality = '720p';

      torrents.push({
        name: 'Torrent - ' + quality,
        title: tmdbInfo.title,
        url: magnetUrl,
        quality: quality,
        provider: 'TorrentProvider',
        headers: { 'User-Agent': UA }
      });
    }
  }

  return torrents;
}

async function getStreams(tmdbId, type, season, episode) {
  var id = parseInt(tmdbId, 10);
  if (!id) return [];

  var isMovie = String(type).toLowerCase().indexOf('tv') < 0 && String(type).toLowerCase().indexOf('series') < 0;
  
  // 1. Comprobar datos de TMDB
  var tmdbInfo = await getTmdbInfo(id, isMovie);
  if (!tmdbInfo || !tmdbInfo.title) {
    console.log('[Validator] Error: No se pudo obtener información de TMDB para el ID:', id);
    return [];
  }

  var rawStreams = await scrapeTorrents(tmdbInfo, season || 1, episode || 1, isMovie);

  var validStreams = [];
  var seenMagnets = {};

  if (Array.isArray(rawStreams)) {
    rawStreams.forEach(function (stream) {
      if (stream && stream.url && stream.url.indexOf('magnet:?') === 0 && !seenMagnets[stream.url]) {
        seenMagnets[stream.url] = true;
        validStreams.push(stream);
      }
    });
  }

  console.log('[Validator] Retorno verificado. Total de torrents válidos:', validStreams.length);
  
  // Retorno final garantizado (siempre un array, vacío o con elementos limpios)
  return validStreams;
}

module.exports = {
  getStreams: getStreams,
};
