/**
 * Fuente Pelispanda — Extracción de enlaces Torrent / Magnet
 */
var TMDB_KEY = 'a2d9bbed370d9f678e34006f8750a5a5';
var TMDB = 'https://api.themoviedb.org/3';
var BASE = 'https://pelispanda.org';
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
    return {
      title: res.title || res.name || '',
      year: (res.release_date || res.first_air_date || '').slice(0, 4)
    };
  } catch (e) {
    return { title: '', year: '' };
  }
}

/**
 * Scraping de Pelispanda para extraer los enlaces Magnet o archivos .torrent
 */
async function scrapePelispanda(tmdbInfo) {
  var slug = slugify(tmdbInfo.title);
  if (!slug) return [];

  // Posibles estructuras de URL amigables que utiliza el sitio
  var candidates = [
    BASE + '/pelicula/' + slug + '/',
    BASE + '/' + slug + '/',
  ];

  var html = null;
  for (var i = 0; i < candidates.length; i++) {
    html = await httpGet(candidates[i]);
    if (html) break;
  }

  if (!html) return [];

  var torrents = [];
  
  // Expresión regular para buscar enlaces magnet o archivos torrent dentro del HTML
  var linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;

  while ((match = linkRegex.exec(html)) !== null) {
    var href = match[1];
    var anchorText = match[2].replace(/<[^>]*>?/g, '').trim();

    // Filtramos para capturar exclusivamente enlaces magnet o archivos .torrent
    if (href.indexOf('magnet:?') === 0 || href.indexOf('.torrent') >= 0) {
      torrents.push({
        name: 'Torrent - ' + anchorText,
        title: tmdbInfo.title,
        url: href,
        quality: html.indexOf('1080p') >= 0 ? '1080p' : 'HD',
        provider: 'Pelispanda',
        headers: { 'User-Agent': UA }
      });
    }
  }

  return torrents;
}

async function getStreams(tmdbId, type, season, episode) {
  var id = parseInt(tmdbId, 10);
  if (!id) return [];
  var isMovie = String(type).toLowerCase().indexOf('tv') < 0;
  
  var tmdbInfo = await getTmdbInfo(id, isMovie);
  if (!tmdbInfo.title) return [];

  if (isMovie) {
    return await scrapePelispanda(tmdbInfo);
  } else {
    // Lógica para series y temporadas en Pelispanda
    return [];
  }
}

module.exports = {
  getStreams: getStreams,
};
