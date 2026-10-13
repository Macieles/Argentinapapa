var BASE_URL = 'https://cuevana3k.pro';
var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = '1865f43a0549ca50d341dd9ab8b29f49'; // Obtener en https://www.themoviedb.org/settings/api

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/'
};

function fetchJson(url) {
  return fetch(url, { headers: HEADERS })
    .then(function(res) { return res.json(); })
    .catch(function(err) {
      console.error('[Cuevana3K] fetchJson error:', err.message);
      return null;
    });
}

function fetchText(url) {
  return fetch(url, { headers: HEADERS })
    .then(function(res) { return res.text(); })
    .catch(function(err) {
      console.error('[Cuevana3K] fetchText error:', err.message);
      return null;
    });
}

// Extraer m3u8 o URL de video del HTML
function extractStreamUrl(html) {
  // Patrón 1: m3u8 directo
  var m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
  if (m3u8Match) return { url: m3u8Match[0], quality: '1080p' };

  // Patrón 2: video src en data-src o src
  var videoMatch = html.match(/(?:data-src|src|file)\s*[:=]\s*["'](https?:\/\/[^"']+)\.mp4[^"']*/);
  if (videoMatch) return { url: videoMatch[1], quality: '1080p' };

  // Patrón 3: JSON con "source" o "file"
  var jsonMatch = html.match(/["'](?:source|file|src)["']\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (jsonMatch) return { url: jsonMatch[1], quality: '1080p' };

  // Patrón 4: dplayer / jwplayer config
  var playerMatch = html.match(/(?:file|source)\s*:\s*["'](https?:\/\/[^"']+)["']/);
  if (playerMatch) return { url: playerMatch[1], quality: '1080p' };

  return null;
}

function searchOnCuevana(title, mediaType) {
  var searchUrl;
  if (mediaType === 'tv') {
    searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);
  } else {
    searchUrl = BASE_URL + '/?s=' + encodeURIComponent(title);
  }

  return fetchText(searchUrl).then(function(html) {
    if (!html) return null;

    var results = [];
    var linkRegex;

    if (mediaType === 'tv') {
      linkRegex = /href="([^"]*\/series\/[^"]+)"/g;
    } else {
      linkRegex = /href="([^"]*\/peliculas?\/[^"]+)"/g;
    }

    var match;
    var seen = {};
    while ((match = linkRegex.exec(html)) !== null) {
      var url = match[1];
      if (!seen[url]) {
        seen[url] = true;
        results.push(url);
      }
    }

    // Devolver la primera URL relevante (la más probable)
    return results.length > 0 ? results[0] : null;
  });
}

// Obtener título desde TMDB
function getTmdbTitle(tmdbId, mediaType) {
  var endpoint = mediaType === 'tv'
    ? TMDB_API + '/tv/' + tmdbId + '?api_key=' + TMDB_KEY
    : TMDB_API + '/movie/' + tmdbId + '?api_key=' + TMDB_KEY;

  return fetchJson(endpoint).then(function(data) {
    if (!data) return null;
    return mediaType === 'tv' ? data.name : data.title;
  });
}


function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  console.log('[Cuevana3K] Buscando ' + mediaType + ' ID: ' + tmdbId);

  return getTmdbTitle(tmdbId, mediaType)
    .then(function(title) {
      if (!title) {
        console.error('[Cuevana3K] No se pudo obtener título');
        return [];
      }
      console.log('[Cuevana3K] Título: ' + title);

      return searchOnCuevana(title, mediaType);
    })
    .then(function(pageUrl) {
      if (!pageUrl) {
        console.log('[Cuevana3K] No se encontró en el sitio');
        return [];
      }

      // Si es URL relativa, hacerla absoluta
      if (pageUrl.startsWith('/')) {
        pageUrl = BASE_URL + pageUrl;
      }

      console.log('[Cuevana3K] Página: ' + pageUrl);

      return fetchText(pageUrl);
    })
    .then(function(html) {
      if (!html) return [];

      var stream = extractStreamUrl(html);
      if (!stream) {
        console.log('[Cuevana3K] No se encontró stream');
        return [];
      }

      console.log('[Cuevana3K] Stream: ' + stream.url);

      return [{
        name: 'CVN-Cuevana3K',
        title: 'Cuevana3K ' + stream.quality,
        url: stream.url,
        quality: stream.quality,
        headers: HEADERS
      }];
    })
    .catch(function(err) {
      console.error('[Cuevana3K] Error:', err.message);
      return [];
    });
}

// Export para React Native / Hermes
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}   
