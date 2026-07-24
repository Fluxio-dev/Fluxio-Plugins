(function () {
  "use strict";

  // Get home view base URL from manifest catalogueAddons (one-line comment)
  function getHomeBase() {
    const url = (typeof manifest !== "undefined" && manifest && manifest.catalogueAddons && manifest.catalogueAddons[0]) || "https://top-streaming.stream/18452bde-db14-4659-9c57-d2480e668150/manifest.json";
    return url.replace(/\/manifest\.json$/, "").replace(/\/$/, "");
  }

  // Get streaming base URL from manifest streamingAddons (one-line comment)
  function getStreamBase() {
    const url = (typeof manifest !== "undefined" && manifest && manifest.streamingAddons && manifest.streamingAddons[0]) || "https://pengu.uk/zbc-xTgMxDAbgd8kMUnM6etANISEGVJC6sEXOxUfSpEmJc6Ep4t2ZCtTq-H-_ZdlfgtKcR1S9t8bOWqxEiuLqpKOLOGUEz3yXqkOdDpx91UB4aZhMdhWJVRX2ARpmzs4gUGN6PIxUMsKOOWCxl1YEF_nd1ZkJqDC15t1CLpVxt8fRB_6NlLIfhhNmJNXJ5eJ_lovbszx0Z7H_a40j0AGVcRnH36tgLlaV5DGKlYgP95vXR2qTnLdvkprCzxt7TO3FXj8H_XFnt1k-bdSaKonvHw/manifest.json";
    return url.replace(/\/manifest\.json$/, "").replace(/\/$/, "");
  }

  // Get TMDB base URL from manifest (one-line comment)
  function getTmdbBase() {
    return (typeof manifest !== "undefined" && manifest && manifest.tmdbBaseUrl) || "https://api.tmdb.org";
  }

  // Get TMDB API key from manifest (one-line comment)
  function getTmdbKey() {
    return (typeof manifest !== "undefined" && manifest && manifest.apiKey) || "";
  }

  // Standard catalogs configuration for home view (one-line comment)
  const CATALOGS = [
    { type: "movie", id: "popular-movie-global", name: "Popular Movies - Top 10 Global" },
    { type: "series", id: "popular-series-global", name: "Popular TV - Top 10 Global" },
    { type: "movie", id: "netflix-movies-india", name: "Netflix Movies - Top 10 India" },
    { type: "series", id: "netflix-series-india", name: "Netflix TV - Top 10 India" },
    { type: "movie", id: "amazon-prime-movies-india", name: "Amazon Prime Movies - Top 10 India" },
    { type: "series", id: "amazon-prime-series-india", name: "Amazon Prime TV - Top 10 India" },
    { type: "series", id: "hotstar-overall-in-english-india", name: "JioHotstar - Overall India" },
    { type: "series", id: "zee5-overall-india", name: "ZEE5 - Top 10 India - Movies" },
    { type: "movie", id: "letterboxd-lb-top-500-movies-generic", name: "Letterboxd - Top 500 Movies" },
    { type: "movie", id: "ranker-rk-best-scifi-movies-generic", name: "Ranker - Best Sci-Fi Movies" }
  ];

  // Helper to fetch and parse JSON from URL (one-line comment)
  async function fetchJson(url) {
    const res = await http_get(url, {});
    if (res && res.body) {
      return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
    }
    throw new Error("HTTP request failed for: " + url);
  }

  // Helper to query TMDB API (one-line comment)
  async function fetchTmdb(path, params) {
    const api = getTmdbBase() + "/3";
    const key = getTmdbKey();
    let url = api + path;
    const queryParts = [];
    if (key) queryParts.push("api_key=" + key);
    if (params) queryParts.push(params);
    if (queryParts.length > 0) {
      url += "?" + queryParts.join("&");
    }
    return fetchJson(url);
  }

  // Helper for parallel JSON fetching using httpBatch or Promise.all (one-line comment)
  async function fetchJsonBatch(urls) {
    if (typeof httpBatch === "function") {
      const results = await httpBatch(urls);
      return results.map(r => {
        if (r && r.ok && r.data) return r.data;
        if (r && r.body) {
          return typeof r.body === "string" ? JSON.parse(r.body) : r.body;
        }
        return null;
      });
    }
    return Promise.all(urls.map(async url => {
      try { return await fetchJson(url); } catch (_) { return null; }
    }));
  }

  // Maps Stremio meta object to SkyStream MultimediaItem (one-line comment)
  function toMultimediaItem(m, fallbackType) {
    if (!m || !m.id) return null;
    const type = m.type || fallbackType || "movie";
    return new MultimediaItem({
      title: m.name || m.title || "Unknown",
      url: type + ":" + m.id,
      posterUrl: m.poster || "",
      backgroundPosterUrl: m.background || "",
      description: m.description || "",
      type: type === "series" ? "series" : "movie",
      year: parseInt(m.releaseInfo || m.year) || undefined
    });
  }

  // Grabs home page data by batch-fetching paged catalog URLs (one-line comment)
  async function getHome(cb, page) {
    try {
      const pageNum = parseInt(page) || 1;
      const skip = (pageNum - 1) * 20;
      const urls = CATALOGS.map(cat => {
        let url = getHomeBase() + "/catalog/" + cat.type + "/" + cat.id + ".json";
        if (pageNum > 1) url += "?skip=" + skip;
        return url;
      });

      const results = await fetchJsonBatch(urls);
      const organized = {};

      CATALOGS.forEach((cat, index) => {
        const data = results[index];
        if (data && Array.isArray(data.metas)) {
          const items = data.metas.map(m => toMultimediaItem(m, cat.type)).filter(Boolean);
          if (items.length > 0) organized[cat.name] = items;
        }
      });

      cb({ success: true, data: organized, page: pageNum });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: e.message });
    }
  }

  // Searches movies and series catalogs via TMDB API (one-line comment)
  async function search(query, cb) {
    try {
      const q = encodeURIComponent(query);
      const [mRes, sRes] = await Promise.all([
        fetchTmdb("/search/movie", "query=" + q),
        fetchTmdb("/search/tv", "query=" + q)
      ]);
      const movies = ((mRes && mRes.results) || []).slice(0, 10).map(item => {
        return new MultimediaItem({
          title: item.title || item.name || "Unknown",
          url: "movie:tmdb:" + item.id,
          posterUrl: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : "",
          backgroundPosterUrl: item.backdrop_path ? "https://image.tmdb.org/t/p/original" + item.backdrop_path : "",
          description: item.overview || "",
          type: "movie",
          year: parseInt(item.release_date || item.first_air_date) || undefined
        });
      });
      const series = ((sRes && sRes.results) || []).slice(0, 10).map(item => {
        return new MultimediaItem({
          title: item.title || item.name || "Unknown",
          url: "series:tmdb:" + item.id,
          posterUrl: item.poster_path ? "https://image.tmdb.org/t/p/w500" + item.poster_path : "",
          backgroundPosterUrl: item.backdrop_path ? "https://image.tmdb.org/t/p/original" + item.backdrop_path : "",
          description: item.overview || "",
          type: "series",
          year: parseInt(item.release_date || item.first_air_date) || undefined
        });
      });
      cb({ success: true, data: movies.concat(series) });
    } catch (e) {
      cb({ success: true, data: [] });
    }
  }

  // Loads metadata and parses episode structure for selected item (one-line comment)
  async function load(url, cb) {
    try {
      const parts = url.split(":");
      const type = parts[0];
      let id = parts[1];
      let tmdbId = "";

      if (id === "tmdb") {
        tmdbId = parts[2];
      } else {
        // Resolve TMDB ID from IMDb ID (one-line comment)
        const findData = await fetchTmdb("/find/" + id, "external_source=imdb_id");
        const results = type === "series" ? (findData.tv_results || []) : (findData.movie_results || []);
        if (results.length > 0) {
          tmdbId = results[0].id;
        } else {
          throw new Error("Could not find TMDB ID for IMDb ID: " + id);
        }
      }

      const ep = type === "series" ? "tv" : "movie";
      // Fetch details from TMDB with external IDs, credits and videos (one-line comment)
      const details = await fetchTmdb("/" + ep + "/" + tmdbId, "append_to_response=external_ids,credits,videos");
      if (!details) throw new Error("Metadata details not found");

      const imdbId = (details.external_ids && details.external_ids.imdb_id) || id;
      const logoUrl = imdbId ? "https://live.metahub.space/logo/medium/" + imdbId + "/img" : "";
      const genres = Array.isArray(details.genres) ? details.genres.map(g => g.name) : [];
      
      // Parse credits to map cast actors (one-line comment)
      const tmdbCast = (details.credits && details.credits.cast) || [];
      const cast = tmdbCast.slice(0, 15).map(c => {
        const member = {
          name: c.name || "Unknown",
          role: c.character || "",
          image: c.profile_path ? "https://image.tmdb.org/t/p/w185" + c.profile_path : ""
        };
        return typeof Actor !== "undefined" ? new Actor(member) : member;
      });

      // Parse videos to map trailers (one-line comment)
      const tmdbVideos = (details.videos && details.videos.results) || [];
      const trailers = [];
      tmdbVideos.forEach(v => {
        if (v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser")) {
          const trailer = {
            name: v.name || "Trailer",
            url: "https://www.youtube.com/watch?v=" + v.key
          };
          trailers.push(typeof Trailer !== "undefined" ? new Trailer(trailer) : trailer);
        }
      });

      const episodes = [];
      let seasonsList = [];
      if (type === "series") {
        const seasons = Array.isArray(details.seasons) ? details.seasons : [];
        seasonsList = seasons
          .filter(s => s.season_number > 0)
          .map(s => ({
            name: s.name || ("Season " + s.season_number),
            number: s.season_number,
            id: String(s.season_number)
          }));
        
        // Determine active season to load (one-line comment)
        const targetSeasonId = (typeof globalThis !== "undefined" && globalThis._targetSeasonId) || "";
        let targetSeasonNumber = parseInt(targetSeasonId, 10);
        if (isNaN(targetSeasonNumber) || targetSeasonNumber <= 0) {
          targetSeasonNumber = seasonsList.length > 0 ? seasonsList[0].number : 1;
        }

        // Fetch episodes of active season only (one-line comment)
        const sd = await fetchTmdb("/tv/" + tmdbId + "/season/" + targetSeasonNumber);
        if (sd && Array.isArray(sd.episodes)) {
          sd.episodes.forEach(ep => {
            episodes.push(new Episode({
              name: ep.name || ("S" + ep.season_number + "E" + ep.episode_number),
              season: ep.season_number || 1,
              episode: ep.episode_number || 1,
              url: "series:" + imdbId + ":" + ep.season_number + ":" + ep.episode_number,
              posterUrl: ep.still_path ? "https://image.tmdb.org/t/p/w300" + ep.still_path : ""
            }));
          });
        }
      } else {
        episodes.push(new Episode({
          name: details.title || details.name || "Play Movie",
          season: 1,
          episode: 1,
          url: "movie:" + imdbId,
          posterUrl: details.poster_path ? "https://image.tmdb.org/t/p/w500" + details.poster_path : ""
        }));
      }

      cb({
        success: true,
        data: new MultimediaItem({
          title: details.title || details.name || "Unknown",
          url: url,
          posterUrl: details.poster_path ? "https://image.tmdb.org/t/p/w500" + details.poster_path : "",
          backgroundPosterUrl: details.backdrop_path ? "https://image.tmdb.org/t/p/original" + details.backdrop_path : "",
          description: details.overview || "",
          type: type,
          year: parseInt(details.release_date || details.first_air_date) || undefined,
          score: details.vote_average || undefined,
          genres: genres,
          tags: genres,
          cast: cast.length > 0 ? cast : undefined,
          trailers: trailers.length > 0 ? trailers : undefined,
          logoUrl: logoUrl,
          seasons: seasonsList.length > 0 ? seasonsList : undefined,
          episodes: episodes
        })
      });
    } catch (e) {
      cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
    }
  }

  // Fetches and formats stream results from PenguPlay addon (one-line comment)
  async function loadStreams(url, cb) {
    try {
      const parts = url.split(":");
      const type = parts[0];
      const id = parts[1];
      let reqUrl = "";

      if (type === "movie") {
        reqUrl = getStreamBase() + "/stream/movie/" + id + ".json?clean=1";
      } else if (type === "series") {
        const season = parts[2] || "1";
        const episode = parts[3] || "1";
        reqUrl = getStreamBase() + "/stream/series/" + encodeURIComponent(id + ":" + season + ":" + episode) + ".json?clean=1";
      } else {
        return cb({ success: true, data: [] });
      }

      const data = await fetchJson(reqUrl);
      const streams = data.streams || [];

      const mapped = streams.map(st => {
        if (!st.url) return null;
        const headers = (st.behaviorHints && st.behaviorHints.proxyHeaders && st.behaviorHints.proxyHeaders.request) || {};
        const finalUrl = st.url;

        // Parse size from description, title, filename or videoSize (one-line comment)
        const desc = st.description || st.title || "";
        const filename = (st.behaviorHints && st.behaviorHints.filename) || "";
        const sizeSearchText = desc + " " + filename;
        const sizeMatch = sizeSearchText.match(/([\d\.]+\s*(?:GB|MB|GiB|MiB))\b/i);
        let size = sizeMatch ? sizeMatch[1].trim().replace(/[\s\.]+(GB|MB|GiB|MiB)/i, " $1") : "";

        if (!size) {
          const bytes = st.size || (st.behaviorHints && (st.behaviorHints.videoSize || st.behaviorHints.size)) || st.videoSize;
          if (bytes && !isNaN(bytes)) {
            const num = Number(bytes);
            if (num >= 1073741824) {
              size = (num / 1073741824).toFixed(2) + " GB";
            } else if (num >= 1048576) {
              size = (num / 1048576).toFixed(2) + " MB";
            }
          }
        }

        // Parse quality name and value from quality property or name/desc/filename (one-line comment)
        const nameText = st.name || "";
        const combinedText = nameText + " " + desc + " " + filename;
        let quality = "";
        let qVal = st.quality ? parseInt(st.quality) : 0;

        if (qVal) {
          quality = qVal === 2160 ? "4K" : qVal + "p";
        } else if (/\b(2160p|4k|uhd)\b/i.test(combinedText)) {
          quality = "4K";
          qVal = 2160;
        } else if (/\b(1080p|fhd)\b/i.test(combinedText)) {
          quality = "1080p";
          qVal = 1080;
        } else if (/\b(720p|hd)\b/i.test(combinedText)) {
          quality = "720p";
          qVal = 720;
        } else if (/\b(480p|sd)\b/i.test(combinedText)) {
          quality = "480p";
          qVal = 480;
        } else if (/\b(360p)\b/i.test(combinedText)) {
          quality = "360p";
          qVal = 360;
        } else {
          quality = "Auto";
        }

        // Clean name utility (one-line comment)
        const cleanName = (str) => {
          if (!str) return "";
          const lower = str.toLowerCase();
          if (lower === "fsl") return "FSL";
          if (lower === "direct") return "Direct";
          if (lower === "worker") return "Worker";
          if (lower === "hubcloud") return "HubCloud";
          return str;
        };

        // Parse server and provider from bingeGroup or fallback to name/desc (one-line comment)
        let server = "";
        let provider = "";
        const binge = (st.behaviorHints && st.behaviorHints.bingeGroup) || "";
        if (binge.startsWith("penguplay-")) {
          const bingeParts = binge.split("-");
          const cleanParts = bingeParts.filter(p => {
            return p !== "penguplay" && !/^\d+$/.test(p) && !/^(1080p|720p|480p|360p|4k|auto)$/i.test(p);
          });
          if (cleanParts.length >= 2) {
            server = cleanParts[0];
            provider = cleanParts.slice(1).join("-");
          } else if (cleanParts.length === 1) {
            server = cleanParts[0];
            provider = "Direct";
          }
        }

        if (!server || !provider) {
          const sourceMatch = desc.match(/Source:\s*([^\n\r]+)/i);
          let sourceText = sourceMatch ? sourceMatch[1].trim() : "";
          if (!sourceText) {
            const parts = nameText.split("•");
            sourceText = parts.length > 1 ? parts[parts.length - 1].trim() : nameText;
          }
          sourceText = sourceText.replace(/^[🧊❄️🐧🍿🛰️📡🎞️🎧📝💾🔊👤🌱🎨👥\s]+/, "").trim();

          if (sourceText.indexOf("·") !== -1) {
            const parts = sourceText.split("·");
            server = parts[0].trim();
            provider = parts[1].trim();
          } else if (sourceText.indexOf("•") !== -1) {
            const parts = sourceText.split("•");
            server = parts[0].trim();
            provider = parts[1].trim();
          } else {
            const parts = sourceText.split(/\s+/);
            if (parts.length > 1) {
              server = parts[0].trim();
              provider = parts.slice(1).join(" ").trim();
            } else {
              server = sourceText || "PenguPlay";
              provider = "Direct";
            }
          }
        }

        server = cleanName(server);
        provider = cleanName(provider);

        // Format name as SIZE | QUALITY | Provider | Server (one-line comment)
        const displayParts = [];
        if (size) displayParts.push(size);
        if (quality) displayParts.push(quality);
        if (provider) displayParts.push(provider);
        if (server) displayParts.push(server);
        const displayName = displayParts.join(" | ");

        let streamType = "url";
        if (finalUrl.includes(".m3u8") || finalUrl.includes("/hls/")) streamType = "hls";
        else if (finalUrl.includes(".mpd") || finalUrl.includes("/dash/")) streamType = "dash";

        const streamRes = {
          url: finalUrl,
          name: displayName,
          source: displayName,
          title: desc,
          type: streamType,
          quality: qVal || "Auto",
          size: size || undefined,
          headers: headers,
          behaviorHints: st.behaviorHints || {}
        };

        if (st.subtitles && Array.isArray(st.subtitles)) streamRes.subtitles = st.subtitles;
        return typeof StreamResult !== "undefined" ? new StreamResult(streamRes) : streamRes;
      }).filter(Boolean);

      cb({ success: true, data: mapped });
    } catch (e) {
      cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
    }
  }

  // Register endpoints in global scope (one-line comment)
  let g = typeof globalThis !== "undefined" ? globalThis : null;
  if (!g && typeof self !== "undefined") g = self;
  if (!g && typeof window !== "undefined") g = window;
  if (!g && typeof global !== "undefined") g = global;
  if (g) {
    g.getHome = getHome;
    g.search = search;
    g.load = load;
    g.loadStreams = loadStreams;
  }
})();
