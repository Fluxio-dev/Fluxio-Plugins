(function () {
  "use strict";

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const JSON_HEADERS = {
    "User-Agent": UA,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.5",
  };



  const ADDON_TIMEOUT = 60000;
  const MANIFEST_TIMEOUT = 15000;
  const META_FETCH_TIMEOUT = 10000;

  const STREAM_RESPONSE_TTL = 1800000;
  const MANIFEST_CACHE_TTL = 600000;
  const SEARCH_CACHE_TTL = 120000;

  const MAX_SEARCH_RESULTS = 50;
  const MAX_SEARCH_QUERY_LENGTH = 200;
  const CATALOG_PAGE_SIZE = 20;

  const RATE_BACKOFF_MS = 180000;
  const RATE_MAX_FAILS = 3;
  let _rateLimits = {};

  let _cache = new Map();
  const CACHE_MAX = 300;

  function safeStr(s) {
    return String(s == null ? "" : s);
  }

  function safeJson(text, fallback) {
    try {
      return JSON.parse(safeStr(text));
    } catch (e) {
      return fallback !== undefined ? fallback : null;
    }
  }

  function isHttp(s) {
    return s && (s.indexOf("http://") === 0 || s.indexOf("https://") === 0);
  }

  function safeBase64(str) {
    if (typeof btoa !== "undefined") return btoa(str);
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
    return str;
  }

  function skyType(t) {
    return t === "movie" || t === "short" ? "movie" : "series";
  }

  function baseUrl(manifestUrl) {
    return (manifestUrl || "").replace(/\/manifest\.json$/, "").replace(/\/$/, "");
  }

  function addonName(url) {
    try {
      let parts = url.replace(/https?:\/\//, "").split("/")[0].replace(/^www\./, "").split(".");
      let name = parts[0] || "";
      if (/^[a-f0-9]{8,}$/i.test(name) && parts.length >= 2) {
        name = parts[parts.length - 2];
      }
      name = name.replace(/^[a-f0-9]{6,}-/i, "");
      let tlds = ["com", "org", "net", "io", "app", "dev", "tv", "co", "uk", "de", "xyz", "fun", "cloud", "me", "in"];
      if (tlds.indexOf(name) !== -1 || name.length <= 2) {
        for (let ni = 1; ni < parts.length - 1; ni++) {
          if (tlds.indexOf(parts[ni]) === -1 && parts[ni].length > 2) {
            name = parts[ni];
            break;
          }
        }
      }
      return name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()).trim() || "Addon";
    } catch (e) {
      return "Addon";
    }
  }

  function isValidStreamUrl(url) {
    if (!url || typeof url !== "string") return false;
    let trimmed = url.trim();
    if (!trimmed) return false;
    if (trimmed.indexOf("data:") === 0) return false;
    if (/\/(login|logout|signin|signup)\.?\w*$/i.test(trimmed)) return false;
    if (!/^https?:\/\//i.test(trimmed) && trimmed.indexOf("magnet:") !== 0 && trimmed.indexOf("MAGIC_PROXY") !== 0) return false;
    try {
      if (/^https?:\/\//i.test(trimmed)) {
        let hn = new URL(trimmed).hostname;
        if (hn === "localhost" || hn === "127.0.0.1" || hn === "0.0.0.0" || /^10\./.test(hn) || /^172\.(1[6-9]|2\d|3[01])\./.test(hn) || /^192\.168\./.test(hn) || /^169\.254\./.test(hn)) return false;
      }
    } catch (e) {}
    return true;
  }

  function cacheGet(key) {
    if (_cache.has(key)) {
      let entry = _cache.get(key);
      if (Date.now() < entry.expires) {
        _cache.delete(key);
        _cache.set(key, entry);
        return entry.data;
      }
      _cache.delete(key);
    }
    return null;
  }

  function cacheSet(key, data, ttlMs) {
    if (_cache.size >= CACHE_MAX) {
      let oldest = _cache.keys().next().value;
      if (oldest) _cache.delete(oldest);
    }
    _cache.set(key, { data: data, expires: Date.now() + (ttlMs || 60000) });
  }

  function rateLimitKey(url) {
    try {
      let u = new URL(url);
      return u.origin + u.pathname;
    } catch (e) {
      return url;
    }
  }

  function isRateLimited(url) {
    let key = rateLimitKey(url);
    let rl = _rateLimits[key];
    return rl && rl.fails >= RATE_MAX_FAILS && Date.now() < rl.until;
  }

  function recordResponseStatus(url, status) {
    let key = rateLimitKey(url);
    if (status === 429 || status === 503 || status === 502 || status === 504) {
      let rl = _rateLimits[key] || { fails: 0, until: 0 };
      rl.fails++;
      rl.until = Date.now() + RATE_BACKOFF_MS + Math.floor(Math.random() * 15000);
      _rateLimits[key] = rl;
    } else if (status >= 200 && status < 300) {
      if (_rateLimits[key]) _rateLimits[key].fails = 0;
    }
  }

  function httpBatch(urls) {
    if (!urls || !urls.length) return Promise.resolve([]);
    let results = [];
    let active = [];
    let activeIdx = [];

    for (let i = 0; i < urls.length; i++) {
      if (isRateLimited(urls[i])) {
        results.push({ url: urls[i], ok: false, data: null, status: 429 });
      } else {
        results.push({ url: urls[i], ok: false, data: null, status: 0 });
        active.push(urls[i]);
        activeIdx.push(i);
      }
    }
    if (active.length === 0) return Promise.resolve(results);

    return http_parallel(active.map(u => ({ method: "GET", url: u, headers: JSON_HEADERS })))
      .then(responses => {
        for (let ri = 0; ri < responses.length; ri++) {
          let resp = responses[ri];
          let idx = activeIdx[ri];
          let status = resp ? resp.status || resp.code || 0 : 0;
          recordResponseStatus(active[ri], status);
          let entry = { url: active[ri], ok: false, data: null, status: status };
          if (resp && resp.body && (status === 200 || status === 206)) {
            try {
              let body = typeof resp.body === "string" ? resp.body.trim() : resp.body;
              if (typeof body === "string" && body.charAt(0) !== "<") {
                entry.data = JSON.parse(body);
                entry.ok = true;
              } else if (typeof body === "object") {
                entry.data = body;
                entry.ok = true;
              }
            } catch (e) {}
          }
          results[idx] = entry;
        }
        return results;
      }).catch(() => results);
  }

  function fetchJson(url, timeoutMs, maxRetries) {
    timeoutMs = timeoutMs || MANIFEST_TIMEOUT;
    maxRetries = maxRetries || 1;

    function attempt(remainingRetries) {
      return new Promise((resolve, reject) => {
        let timedOut = false;
        let timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("Timeout: " + url));
        }, timeoutMs);

        http_get(url, JSON_HEADERS)
          .then(response => {
            if (timedOut) return;
            clearTimeout(timer);
            if (!response || !response.body) return reject(new Error("Empty response"));
            recordResponseStatus(url, response.status || 0);
            if (response.status !== 200 && response.status !== 206 && response.status !== 304) {
              return reject(new Error("HTTP " + response.status));
            }
            try {
              let body = typeof response.body === "string" ? response.body.trim() : response.body;
              if (typeof body === "string" && body.charAt(0) === "<") return reject(new Error("HTML response"));
              resolve(typeof body === "string" ? JSON.parse(body) : body);
            } catch (e) {
              reject(new Error("Parse error"));
            }
          })
          .catch(err => {
            if (timedOut) return;
            clearTimeout(timer);
            reject(err);
          });
      }).catch(err => {
        if (remainingRetries > 0) {
          let delay = Math.pow(2, maxRetries - remainingRetries + 1) * 300;
          return new Promise(r => setTimeout(r, delay)).then(() => attempt(remainingRetries - 1));
        }
        throw err;
      });
    }
    return attempt(maxRetries);
  }

  function getCatalogueAddons() {
    try {
      if (manifest && Array.isArray(manifest.catalogueAddons)) return manifest.catalogueAddons;
    } catch (e) {}
    return [];
  }

  function getStreamingAddons() {
    try {
      if (manifest && Array.isArray(manifest.streamingAddons)) return manifest.streamingAddons;
    } catch (e) {}
    return [];
  }

  function getMetaAddons() {
    try {
      if (manifest && Array.isArray(manifest.metaAddons) && manifest.metaAddons.length > 0) return manifest.metaAddons;
    } catch (e) {}
    return getCatalogueAddons();
  }

  function fetchManifests(urls) {
    let results = [];
    let uncached = [];
    let uncachedIdx = [];

    for (let i = 0; i < urls.length; i++) {
      let cached = cacheGet("mf:" + urls[i]);
      if (cached) {
        results[i] = { url: urls[i], manifest: cached, index: i };
      } else {
        results[i] = null;
        uncached.push(urls[i]);
        uncachedIdx.push(i);
      }
    }
    if (uncached.length === 0) return Promise.resolve(results.filter(Boolean));

    return httpBatch(uncached).then(batchResults => {
      for (let j = 0; j < batchResults.length; j++) {
        let idx = uncachedIdx[j];
        if (batchResults[j].ok && batchResults[j].data) {
          cacheSet("mf:" + uncached[j], batchResults[j].data, MANIFEST_CACHE_TTL);
          results[idx] = { url: uncached[j], manifest: batchResults[j].data, index: idx };
        }
      }
      return results.filter(Boolean);
    });
  }

  function parseStreamSubtitles(stream) {
    if (stream.subtitles && Array.isArray(stream.subtitles) && stream.subtitles.length > 0) {
      let subs = [];
      for (let si = 0; si < stream.subtitles.length; si++) {
        let sub = stream.subtitles[si];
        if (sub && sub.url && sub.lang) subs.push({ url: sub.url, label: sub.lang, lang: sub.lang });
      }
      return subs.length > 0 ? subs : null;
    }
    return null;
  }

  function formatStream(stream, addonDisplayName, addonBaseUrl) {
    if (!stream) return null;

    let url = "";

    if (stream.url && isHttp(stream.url)) {
      if (!isValidStreamUrl(stream.url)) return null;
      url = stream.url;
    } else if (stream.ytId) {
      url = "https://www.youtube.com/watch?v=" + stream.ytId;
    } else if (stream.externalUrl) {
      url = stream.externalUrl;
    } else if (stream.nzbUrl) {
      url = stream.nzbUrl;
    } else {
      let archTypes = ["rarUrls", "zipUrls", "7zipUrls", "tgzUrls", "tarUrls"];
      for (let ai = 0; ai < archTypes.length; ai++) {
        let key = archTypes[ai];
        if (Array.isArray(stream[key]) && stream[key].length) {
          let src = stream[key][0];
          let srcUrl = typeof src === "string" ? src : src.url || "";
          if (srcUrl) {
            url = srcUrl;
            break;
          }
        }
      }
    }

    if (!url) return null;

    const nameText = stream.name || "";
    const descText = stream.description || stream.title || "";
    const filename = (stream.behaviorHints && stream.behaviorHints.filename) || "";
    const combinedText = nameText + " " + descText + " " + filename;

    const sizeMatch = combinedText.match(/([\d\.]+\s*(?:GB|MB|GiB|MiB))\b/i);
    let size = sizeMatch ? sizeMatch[1].trim().replace(/[\s\.]+(GB|MB|GiB|MiB)/i, " $1") : "";

    if (!size) {
      const bytes = stream.size || (stream.behaviorHints && (stream.behaviorHints.videoSize || stream.behaviorHints.size)) || stream.videoSize;
      if (bytes && !isNaN(bytes)) {
        const num = Number(bytes);
        if (num >= 1073741824) {
          size = (num / 1073741824).toFixed(2) + " GB";
        } else if (num >= 1048576) {
          size = (num / 1048576).toFixed(2) + " MB";
        }
      }
    }

    let quality = "Auto";
    let qVal = stream.quality ? parseInt(stream.quality) : 0;
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
    }

    // Parse provider and server dynamically
    let provider = addonDisplayName;
    let server = "";

    const binge = (stream.behaviorHints && stream.behaviorHints.bingeGroup) || "";
    if (binge) {
      const bingeParts = binge.split("-");
      if (bingeParts.length > 1) {
        const cleanParts = bingeParts.slice(1).filter(p => {
          return !/^\d+$/.test(p) && !/^(1080p|720p|480p|360p|4k|auto|fhd|hd|sd)$/i.test(p);
        });
        if (cleanParts.length >= 2) {
          server = cleanParts[0];
          provider = cleanParts.slice(1).join("-");
        } else if (cleanParts.length === 1) {
          server = cleanParts[0];
          provider = "Direct";
        }
      }
    }

    // Fallback to URL domain name if server not set
    if (!server && url && url.indexOf("http") === 0) {
      try {
        const u = new URL(url);
        const hostParts = u.hostname.split(".");
        if (hostParts.length >= 2) {
          if (hostParts[hostParts.length - 2] === "workers" && hostParts.length >= 3) {
            server = hostParts[hostParts.length - 3];
          } else {
            server = hostParts[hostParts.length - 2];
          }
        }
      } catch (e) {}
    }

    if (!server) {
      server = "Direct";
    }

    if (server) server = server.replace(/^[a-z]/, c => c.toUpperCase());
    if (provider) provider = provider.replace(/^[a-z]/, c => c.toUpperCase());

    const displayParts = [];
    if (size) displayParts.push(size);
    if (quality) displayParts.push(quality);
    if (server) displayParts.push(server);
    if (provider) displayParts.push(provider);
    if (stream.peers > 0) displayParts.push("Peers " + stream.peers);
    if (stream.seeders > 0) displayParts.push("Seeders " + stream.seeders);
    if (addonDisplayName && addonDisplayName !== provider) displayParts.push(addonDisplayName);
    const displayName = displayParts.join(" | ");

    const headers = {};
    if (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) {
      Object.assign(headers, stream.behaviorHints.proxyHeaders.request);
    }
    if (!headers["User-Agent"]) headers["User-Agent"] = UA;
    if (!headers["Referer"]) headers["Referer"] = addonBaseUrl + "/";
    if (!headers["Origin"]) headers["Origin"] = addonBaseUrl;

    let finalUrl = url;
    const bh = {};
    if (stream.behaviorHints) {
      Object.assign(bh, stream.behaviorHints);
      delete bh.proxyHeaders;
    }
    if (finalUrl.indexOf("http") === 0) {
      const isPlaylist = /\.(m3u8|mpd)(\?|$)/i.test(finalUrl);
      const isDirect = /\.(mp4|mkv|webm|avi|mov)(\?|$)/i.test(finalUrl);
      const hasHeaders = Object.keys(headers).length > 1;
      if ((isPlaylist || hasHeaders) && !isDirect) {
        finalUrl = "MAGIC_PROXY_v1" + safeBase64(finalUrl);
        bh.notWebReady = true;
      } else if (!isDirect) {
        bh.notWebReady = true;
      }
    }

    const streamRes = {
      url: finalUrl,
      name: displayName,
      source: displayName,
      title: descText,
      quality: qVal || "Auto",
      size: size || undefined,
      provider: provider || undefined,
      server: server || undefined,
      peers: stream.peers || undefined,
      seeders: stream.seeders || undefined,
      addonName: addonDisplayName,
      _sortKey: qVal || 0,
      headers: headers,
      behaviorHints: bh
    };

    if (stream.subtitles && Array.isArray(stream.subtitles)) {
      streamRes.subtitles = parseStreamSubtitles(stream);
    }

    // Omit null/undefined keys (Dart compatibility)
    for (let k in streamRes) {
      if (streamRes[k] === null || streamRes[k] === undefined) delete streamRes[k];
    }

    return typeof StreamResult !== "undefined" ? new StreamResult(streamRes) : streamRes;
  }



  async function getHome(cb, page) {
    try {
      let pageNum = parseInt(page) || 1;
      let addonUrls = getCatalogueAddons();
      if (!addonUrls.length) return cb({ success: false, errorCode: "NO_ADDONS", message: "No catalogueAddons configured" });

      let manifests = await fetchManifests(addonUrls);
      if (!manifests.length) return cb({ success: false, errorCode: "NO_DATA", message: "Could not fetch any addon manifests" });

      let catalogJobs = [];
      for (let mi = 0; mi < manifests.length; mi++) {
        let mf = manifests[mi].manifest;
        let addonBase = baseUrl(manifests[mi].url);
        if (!mf || !Array.isArray(mf.catalogs) || !mf.catalogs.length) continue;

        for (let ci = 0; ci < mf.catalogs.length; ci++) {
          let cat = mf.catalogs[ci];
          if (!cat || !cat.id || !cat.type) continue;
          if ((cat.extra || []).some(e => e && e.name === "search" && e.isRequired === true)) continue;

          let catUrl = addonBase + "/catalog/" + cat.type + "/" + cat.id + ".json";
          if (pageNum > 1) {
            let skip = (pageNum - 1) * CATALOG_PAGE_SIZE;
            catUrl += (catUrl.indexOf("?") === -1 ? "?" : "&") + "skip=" + skip;
          }
          catalogJobs.push({ url: catUrl, categoryName: cat.name || cat.id, categoryType: cat.type });
        }
      }

      if (!catalogJobs.length) return cb({ success: false, errorCode: "NO_DATA", message: "No browsable catalogs found" });

      let catCacheKey = "catalog:p" + pageNum;
      let catalogResponses = cacheGet(catCacheKey);
      if (!catalogResponses) {
        catalogResponses = await httpBatch(catalogJobs.map(j => j.url));
        cacheSet(catCacheKey, catalogResponses, 60000);
      }

      let organized = {};
      let order = [];

      for (let ri = 0; ri < catalogResponses.length; ri++) {
        let resp = catalogResponses[ri];
        let job = catalogJobs[ri];
        if (!resp.ok || !resp.data || !Array.isArray(resp.data.metas) || !resp.data.metas.length) continue;

        let items = resp.data.metas.map(m => toItem(m, job.categoryType)).filter(Boolean);
        if (!items.length) continue;

        if (!organized[job.categoryName]) {
          organized[job.categoryName] = items;
          order.push(job.categoryName);
        }
      }

      if (!order.length) return cb({ success: false, errorCode: "NO_DATA", message: "No catalog data returned" });

      let finalData = {};
      for (let oi = 0; oi < order.length; oi++) {
        if (organized[order[oi]]) finalData[order[oi]] = organized[order[oi]];
      }
      cb({ success: true, data: finalData, page: pageNum });
    } catch (e) {
      cb({ success: false, errorCode: "HOME_ERROR", message: safeStr(e.message || e) });
    }
  }

  async function search(query, cb) {
    try {
      let q = safeStr(query).trim().toLowerCase();
      if (!q) return cb({ success: true, data: [] });
      if (q.length > MAX_SEARCH_QUERY_LENGTH) q = q.substring(0, MAX_SEARCH_QUERY_LENGTH);

      let addonUrls = getMetaAddons();
      let allItems = [];
      let seenUrls = {};

      if (addonUrls.length > 0) {
        let manifests = await fetchManifests(addonUrls);
        let searchJobs = [];

        for (let mi = 0; mi < manifests.length; mi++) {
          let mf = manifests[mi].manifest;
          let addonBase = baseUrl(manifests[mi].url);
          if (!mf || !Array.isArray(mf.catalogs)) continue;

          for (let ci = 0; ci < mf.catalogs.length; ci++) {
            let cat = mf.catalogs[ci];
            if (!cat || !cat.id || !cat.type) continue;
            if ((cat.extra || []).some(e => e && e.name === "search")) {
              searchJobs.push({
                url: addonBase + "/catalog/" + cat.type + "/" + cat.id + "/search=" + encodeURIComponent(q) + ".json",
                catType: cat.type,
              });
            }
          }
        }

        if (searchJobs.length > 0) {
          let cacheKey = "search:" + q;
          let responses = cacheGet(cacheKey);
          if (!responses) {
            responses = await httpBatch(searchJobs.map(j => j.url));
            cacheSet(cacheKey, responses, SEARCH_CACHE_TTL);
          }

          for (let ri = 0; ri < responses.length && allItems.length < MAX_SEARCH_RESULTS; ri++) {
            let resp = responses[ri];
            let job = searchJobs[ri];
            if (resp.ok && resp.data && Array.isArray(resp.data.metas)) {
              for (let si = 0; si < resp.data.metas.length && allItems.length < MAX_SEARCH_RESULTS; si++) {
                let item = toItem(resp.data.metas[si], job.catType);
                if (item && item.url && !seenUrls[item.url]) {
                  seenUrls[item.url] = true;
                  allItems.push(item);
                }
              }
            }
          }
        }
      }
      cb({ success: true, data: allItems.slice(0, MAX_SEARCH_RESULTS) });
    } catch (e) {
      cb({ success: true, data: [] });
    }
  }

  function fetchMeta(addonBase, id, typeHint) {
    return new Promise(resolve => {
      if (typeHint === "movie" || typeHint === "series") {
        let qUrl = addonBase + "/meta/" + typeHint + "/" + encodeURIComponent(id) + ".json";
        let timer = setTimeout(() => resolve(null), META_FETCH_TIMEOUT);
        http_get(qUrl, JSON_HEADERS)
          .then(resp => {
            clearTimeout(timer);
            if (resp && (resp.status === 200 || resp.status === 206) && resp.body) {
              try {
                let parsed = typeof resp.body === "string" ? JSON.parse(resp.body.trim()) : resp.body;
                resolve(parsed.meta || (Array.isArray(parsed.metas) ? parsed.metas[0] : null));
              } catch (e) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          })
          .catch(() => {
            clearTimeout(timer);
            resolve(null);
          });
      } else {
        let results = {};
        let pending = 2;
        let done = false;
        let timers = {};
        function tryType(typeName) {
          let qUrl = addonBase + "/meta/" + typeName + "/" + encodeURIComponent(id) + ".json";
          timers[typeName] = setTimeout(() => {
            if (!done) {
              pending--;
              if (pending <= 0) finalize();
            }
          }, META_FETCH_TIMEOUT);
          http_get(qUrl, JSON_HEADERS)
            .then(resp => {
              if (done) return;
              clearTimeout(timers[typeName]);
              if (resp && (resp.status === 200 || resp.status === 206) && resp.body) {
                try {
                  let parsed = typeof resp.body === "string" ? JSON.parse(resp.body.trim()) : resp.body;
                  let meta = parsed.meta || (Array.isArray(parsed.metas) ? parsed.metas[0] : null);
                  if (meta && meta.id) results[typeName] = meta;
                } catch (e) {}
              }
              pending--;
              if (pending <= 0 && !done) finalize();
            })
            .catch(() => {
              if (done) return;
              clearTimeout(timers[typeName]);
              pending--;
              if (pending <= 0 && !done) finalize();
            });
        }
        function finalize() {
          if (done) return;
          done = true;
          if (results.series) return resolve(results.series);
          if (results.movie) return resolve(results.movie);
          resolve(null);
        }
        tryType("series");
        tryType("movie");
      }
    });
  }

  function toItem(m, fallbackType) {
    try {
      if (!m || !m.id) return null;
      let year = undefined;
      if (m.year != null) {
        let y = parseInt(m.year, 10);
        if (y > 1900 && y < 2100) year = y;
      }
      let rating = undefined;
      if (m.imdbRating != null) {
        let r = parseFloat(m.imdbRating);
        if (!isNaN(r) && r >= 0 && r <= 10) rating = r;
      } else if (m.score != null) {
        let r2 = parseFloat(m.score);
        if (!isNaN(r2) && r2 >= 0 && r2 <= 10) rating = r2;
      }
      let genres = undefined;
      let g = m.genres || m.genre || m.tags;
      if (Array.isArray(g) && g.length > 0) {
        if (typeof g[0] === "object" && g[0].name) genres = g.map(x => x.name);
        else genres = g;
      }

      return new MultimediaItem({
        title: m.name || m.title || m.originalName || m.original_title || "Unknown",
        url: m.id || "",
        posterUrl: m.poster || m.posterUrl || m.poster_path || m.thumbnail || "",
        bannerUrl: m.background || m.backdrop || m.banner || m.bannerUrl || m.backdrop_path || "",
        logoUrl: m.logo || m.logoUrl || "",
        type: skyType(m.type || fallbackType || "movie"),
        description: safeStr(m.description || m.overview || m.synopsis || "").replace(/<[^>]*>/g, "").trim().substring(0, 500),
        year: year,
        score: rating,
        genres: genres,
      });
    } catch (e) {
      return null;
    }
  }

  async function load(url, cb) {
    let rawInput = safeStr(url).trim();
    if (!rawInput) return cb({ success: false, errorCode: "PARSE_ERROR", message: "No video ID" });

    let knownType = null;
    let season = 0;
    let episode = 0;
    let metaId = rawInput;

    if (rawInput.indexOf(":") !== -1) {
      let parts = rawInput.split(":");
      let first = parts[0];
      if (/^tt\d+$/.test(first) && parts.length >= 3) {
        metaId = first;
        knownType = "series";
        season = parseInt(parts[1]) || 0;
        episode = parseInt(parts[2]) || 0;
      }
    }

    let addonUrls = getMetaAddons();
    let bestMeta = null;
    if (addonUrls.length > 0) {
      let metaCalls = [];
      for (let i = 0; i < addonUrls.length; i++) {
        if (!isRateLimited(addonUrls[i])) {
          metaCalls.push(fetchMeta(baseUrl(addonUrls[i]), metaId, knownType));
        }
      }
      if (metaCalls.length > 0) {
        let metaResults = await Promise.allSettled(metaCalls);
        for (let mi = 0; mi < metaResults.length; mi++) {
          if (metaResults[mi].status === "fulfilled" && metaResults[mi].value) {
            bestMeta = metaResults[mi].value;
            break;
          }
        }
      }
    }

    if (bestMeta) {
      try {
        let skyTypeVal = skyType(bestMeta.type || knownType || "movie");
        let isSeries = skyTypeVal === "series";
        let description = safeStr(bestMeta.description || bestMeta.overview || bestMeta.synopsis || "").replace(/<[^>]*>/g, "").trim().substring(0, 1000);
        let year = undefined;
        if (bestMeta.year != null) {
          let y = parseInt(bestMeta.year, 10);
          if (y > 1900 && y < 2100) year = y;
        }
        let score = undefined;
        if (bestMeta.imdbRating != null) {
          let r = parseFloat(bestMeta.imdbRating);
          if (!isNaN(r) && r >= 0 && r <= 10) score = r;
        }

        let episodes = [];
        if (isSeries && Array.isArray(bestMeta.videos)) {
          episodes = bestMeta.videos.map(v => {
            try {
              return new Episode({
                name: v.name || v.title || "S" + (v.season || 1) + "E" + (v.episode || 1),
                url: bestMeta.id ? bestMeta.id + ":" + (v.season || 1) + ":" + (v.episode || 1) : v.id || v.imdb_id || "",
                season: v.season || 1,
                episode: v.episode || 1,
                rating: v.rating ? parseFloat(v.rating) : undefined,
                runtime: v.runtime ? parseInt(v.runtime, 10) : undefined,
                airDate: v.released || v.airDate || v.firstAired || undefined,
                posterUrl: v.thumbnail || v.poster || bestMeta.poster || "",
              });
            } catch (e) {
              return null;
            }
          }).filter(Boolean);
        }
        if (!episodes.length) {
          episodes.push(new Episode({
            name: isSeries ? "Watch" : "Full Movie",
            url: isSeries ? (bestMeta.id || metaId) + ":1:1" : bestMeta.id || metaId,
            season: 1,
            episode: 1,
            posterUrl: bestMeta.poster || "",
          }));
        }

        let cast = undefined;
        let castList = bestMeta.cast || bestMeta.credits_cast || [];
        if (Array.isArray(castList) && castList.length > 0) {
          let castItems = [];
          for (let ci = 0; ci < Math.min(castList.length, 20); ci++) {
            let c = castList[ci];
            if (c && (c.name || c.actor)) {
              let img = c.image || c.photo || c.profile_path || c.imageUrl || "";
              if (img && img.indexOf("http") !== 0) img = "";
              castItems.push(new Actor({
                name: c.name || c.actor || "Unknown",
                role: c.role || c.character || "",
                image: img || undefined,
              }));
            }
          }
          if (castItems.length > 0) cast = castItems;
        }

        let trailers = undefined;
        if (Array.isArray(bestMeta.trailers) && bestMeta.trailers.length > 0) {
          let trItems = [];
          for (let ti = 0; ti < bestMeta.trailers.length; ti++) {
            let tr = bestMeta.trailers[ti];
            let src = tr.source || tr.url || "";
            if (src) {
              trItems.push(new Trailer({
                url: src.indexOf("http") === 0 ? src : "https://www.youtube.com/watch?v=" + src,
                name: tr.name || tr.type || "Trailer",
              }));
            }
          }
          if (trItems.length > 0) trailers = trItems;
        }

        let genres = undefined;
        let g = bestMeta.genres || bestMeta.genre || bestMeta.tags;
        if (Array.isArray(g) && g.length > 0) {
          genres = typeof g[0] === "object" && g[0].name ? g.map(x => x.name) : g;
        }

        return cb({
          success: true,
          data: new MultimediaItem({
            title: bestMeta.name || bestMeta.title || "Unknown",
            url: metaId,
            posterUrl: bestMeta.poster || bestMeta.posterUrl || "",
            bannerUrl: bestMeta.background || bestMeta.backdrop || bestMeta.banner || "",
            logoUrl: bestMeta.logo || bestMeta.logoUrl || "",
            type: skyTypeVal,
            description: description,
            year: year,
            score: score,
            genres: genres,
            cast: cast,
            trailers: trailers,
            runtime: bestMeta.runtime ? safeStr(bestMeta.runtime) : undefined,
            status: bestMeta.status && (bestMeta.status.toLowerCase() === "ended" || bestMeta.status.toLowerCase() === "canceled") ? "completed" : "ongoing",
            episodes: episodes,
          }),
        });
      } catch (e) {}
    }

    let ft = skyType(knownType || "movie");
    let fs = season > 0 ? season : 1;
    let fe = episode > 0 ? episode : 1;
    cb({
      success: true,
      data: new MultimediaItem({
        title: rawInput,
        url: rawInput,
        type: ft,
        episodes: [
          new Episode({
            name: ft === "movie" ? "Full Movie" : "Watch",
            url: ft === "movie" ? rawInput : rawInput + ":" + fs + ":" + fe,
            season: fs,
            episode: fe,
          }),
        ],
      }),
    });
  }

  async function loadStreams(url, cb) {
    let served = false;
    try {
      let rawInput = safeStr(url).trim();
      if (!rawInput) return cb({ success: true, data: [] });

      let pipeIdx = rawInput.indexOf("||");
      if (pipeIdx !== -1) rawInput = rawInput.substring(0, pipeIdx);

      let cacheKey = "streams:" + rawInput;
      let cached = cacheGet(cacheKey);
      if (cached) {
        served = true;
        try {
          cb({ success: true, data: cached });
        } catch (_) {}
      }

      let isSeries = /:\d+:\d+$/.test(rawInput);
      let streamTypes = isSeries ? ["series"] : ["movie", "series"];
      let addonUrls = getStreamingAddons();
      if (!addonUrls.length) {
        if (!served) cb({ success: true, data: [] });
        return;
      }

      let manifests = await fetchManifests(addonUrls);
      const requestJobs = [];

      for (let mi = 0; mi < manifests.length; mi++) {
        let mf = manifests[mi];
        if (!mf || !mf.manifest) continue;
        let addonManifest = mf.manifest;
        let addonBase = baseUrl(mf.url);
        let addonDisplayName = addonName(mf.url);

        if (!addonManifest.resources || !Array.isArray(addonManifest.resources)) continue;
        let supportsStream = false;
        for (let ri = 0; ri < addonManifest.resources.length; ri++) {
          let res = addonManifest.resources[ri];
          if (typeof res === "string" ? res === "stream" : res.name === "stream" || res.id === "stream") {
            supportsStream = true;
            break;
          }
        }
        if (!supportsStream) continue;

        for (let ti = 0; ti < streamTypes.length; ti++) {
          let type = streamTypes[ti];
          let reqUrl = addonBase + "/stream/" + type + "/" + encodeURIComponent(rawInput) + ".json?clean=1";
          requestJobs.push({
            url: reqUrl,
            addonDisplayName: addonDisplayName,
            addonBaseUrl: addonBase
          });
        }
      }

      if (!requestJobs.length) {
        if (!served) cb({ success: true, data: [] });
        return;
      }

      const fetchPromises = requestJobs.map(job => {
        return new Promise(resolve => {
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            resolve(null);
          }, 10000); // 10s individual timeout

          http_get(job.url, JSON_HEADERS)
            .then(resp => {
              clearTimeout(timer);
              if (timedOut) return;
              resolve({ job, resp });
            })
            .catch(() => {
              clearTimeout(timer);
              resolve(null);
            });
        });
      });

      const results = await Promise.all(fetchPromises);
      let merged = [];
      let seenDedup = {};

      for (let ri = 0; ri < results.length; ri++) {
        const item = results[ri];
        if (!item) continue;

        const { job, resp } = item;
        const status = resp ? resp.status || resp.code || 0 : 0;
        if (resp && resp.body && (status === 200 || status === 206)) {
          try {
            let body = typeof resp.body === "string" ? resp.body.trim() : resp.body;
            let parsed = typeof body === "string" ? JSON.parse(body) : body;
            let streams = parsed.streams || [];
            for (let i = 0; i < streams.length; i++) {
              let formatted = formatStream(streams[i], job.addonDisplayName, job.addonBaseUrl);
              if (formatted) {
                let dk = (formatted.url || "").replace(/^https?:\/\//, "").replace(/\/+$/, "").split("#")[0].toLowerCase();
                if (dk && !seenDedup[dk]) {
                  seenDedup[dk] = true;
                  formatted.drop_403 = true;
                  merged.push(formatted);
                }
              }
            }
          } catch (e) {}
        }
      }

      merged.sort((a, b) => {
        let diff = (b._sortKey || 0) - (a._sortKey || 0);
        if (diff !== 0) return diff;
        return (b.seeders || 0) - (a.seeders || 0);
      });

      cacheSet(cacheKey, merged, STREAM_RESPONSE_TTL);
      if (!served) cb({ success: true, data: merged });
    } catch (e) {
      if (!served) cb({ success: true, data: [] });
    }
  }

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