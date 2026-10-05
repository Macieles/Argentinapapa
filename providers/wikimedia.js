"use strict";

var PROVIDER_NAME = "Wikimedia Commons — Dominio público";

var WIKIDATA_ENDPOINT =
  "https://query.wikidata.org/sparql";

var COMMONS_API_ENDPOINT =
  "https://commons.wikimedia.org/w/api.php";

var DOMAINS_CONFIG_URL =
  "https://raw.githubusercontent.com/Macieles/Argentinapapa/refs/heads/main/domains.json";

var REQUEST_TIMEOUT_MS = 15000;
var MAX_RESULTS = 5;


/**
 * Carga domains.json desde GitHub.
 */
function loadDomainsConfig() {
  return fetch(DOMAINS_CONFIG_URL)
    .then(function(response) {

      if (!response || !response.ok) {
        throw new Error(
          "No se pudo cargar domains.json. HTTP " +
          (response ? response.status : "unknown")
        );
      }

      return response.json();
    })
    .then(function(data) {

      if (!data || !Array.isArray(data.providers)) {
        throw new Error(
          "domains.json debe contener un objeto 'providers'."
        );
      }

      return data.providers.filter(function(provider) {

        return (
          provider &&
          provider.enabled === true &&
          typeof provider.name === "string" &&
          typeof provider.domain === "string" &&
          /^https?:\/\//i.test(provider.domain)
        );

      });
    });
}


/**
 * Ejemplo de lectura de la configuración.
 *
 * No realiza scraping ni extracción de streams
 * de los dominios configurados.
 */
function getConfiguredProviders() {

  return loadDomainsConfig()
    .then(function(providers) {

      console.log(
        "[nuvio] Proveedores configurados:",
        providers.map(function(provider) {
          return provider.name + " -> " + provider.domain;
        })
      );

      return providers;
    });
}


/**
 * Entrada que utiliza Nuvio.
 */
function getStreams(
  tmdbId,
  mediaType,
  season,
  episode
) {

  var id = String(
    tmdbId == null ? "" : tmdbId
  ).trim();

  if (!/^\d{1,12}$/.test(id)) {
    return Promise.resolve([]);
  }

  if (
    String(mediaType || "").toLowerCase() !== "movie"
  ) {
    return Promise.resolve([]);
  }

  /*
   * Primero carga y valida domains.json.
   *
   * Los dominios se consideran configuración,
   * no se realiza scraping de ellos aquí.
   */
  return getConfiguredProviders()
    .then(function(providers) {

      /*
       * Aquí puede utilizarse una API autorizada
       * asociada a alguno de los proveedores.
       *
       * Por ahora devolvemos [] porque no se
       * implementa extracción de contenido de
       * sitios de terceros.
       */

      console.log(
        "[nuvio] TMDB:",
        id,
        "Proveedores:",
        providers.length
      );

      return [];
    })
    .catch(function(error) {

      console.log(
        "[nuvio] Error:",
        error && error.message
          ? error.message
          : String(error)
      );

      return [];
    });
}


module.exports = {
  getStreams: getStreams
};
