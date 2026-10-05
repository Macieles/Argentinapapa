```js
"use strict";

var PROVIDER_NAME = "Cuevana3k";

function log(message) {
  if (
    typeof console !== "undefined" &&
    console &&
    typeof console.log === "function"
  ) {
    console.log(
      "[argentinapapa-cuevana3k] " + message
    );
  }
}

function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {
  var id = String(
    tmdbId == null ? "" : tmdbId
  ).trim();

  var type = String(
    mediaType || ""
  ).toLowerCase();

  log(
    "Ejecutando " +
    PROVIDER_NAME +
    " | TMDB: " +
    id +
    " | Tipo: " +
    type
  );

  if (!id) {
    log("No se recibió TMDB ID.");
    return Promise.resolve([]);
  }

  if (type !== "movie") {
    log("Solo se admiten películas.");
    return Promise.resolve([]);
  }

  log("Provider cargado correctamente.");

  return Promise.resolve([]);
}

module.exports = {
  getStreams: getStreams
};
```

