(function () {
    /**
     * Authentic NetMirror Provider Plugin for Fluxio
     * Supports Netflix, Prime Video, Hotstar, Disney Plus
     * Reconstructs real HLS master playlists bypassing decoy placeholder streams.
     */

    // Host-injected manifest
    // var manifest is injected at runtime

    const DEFAULT_BASE_URL = 'https://net52.cc';
    const DOMAIN_DETECTOR_URL = 'https://mobiledetects.com/check.php';

    // NetMirror mobile client headers
    const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0';
    const APP_IDENTIFIER = 'app.netmirror.netmirrornew';

    const BASE_HEADERS = {
        'User-Agent': MOBILE_UA,
        'X-Requested-With': APP_IDENTIFIER,
        'Accept': '*/*'
    };

    // Polyfill constructors if not injected by host runtime
    const StreamResult = (typeof globalThis.StreamResult === 'function') ? globalThis.StreamResult : function (t) { return t; };
    const MultimediaItem = (typeof globalThis.MultimediaItem === 'function') ? globalThis.MultimediaItem : function (t) { return t; };
    const Episode = (typeof globalThis.Episode === 'function') ? globalThis.Episode : function (t) { return t; };
    const Actor = (typeof globalThis.Actor === 'function') ? globalThis.Actor : function (t) { return t; };

    const PROVIDERS = {
        'NETFLIX': {
            id: 'NETFLIX',
            name: 'Netflix',
            ott: 'nf',
            homeEndpoint: '/mobile/home?app=1',
            searchEndpoint: '/mobile/search.php',
            postEndpoint: '/mobile/post.php',
            episodesEndpoint: '/mobile/episodes.php',
            playlistEndpoint: '/mobile/playlist.php',
            imgPrefix: 'https://imgcdn.kim/nf/v/200/'
        },
        'PRIME VIDEO': {
            id: 'PRIME VIDEO',
            name: 'Prime Video',
            ott: 'pv',
            homeEndpoint: '/pv/homepage.php',
            searchEndpoint: '/pv/search.php',
            postEndpoint: '/pv/post.php',
            episodesEndpoint: '/pv/episodes.php',
            playlistEndpoint: '/pv/playlist.php',
            imgPrefix: 'https://imgcdn.kim/pv/v/200/'
        },
        'HOTSTAR': {
            id: 'HOTSTAR',
            name: 'Hotstar',
            ott: 'hs',
            homeEndpoint: '/mobile/home?app=1',
            searchEndpoint: '/mobile/hs/search.php',
            postEndpoint: '/mobile/hs/post.php',
            episodesEndpoint: '/mobile/hs/episodes.php',
            playlistEndpoint: '/mobile/hs/playlist.php',
            imgPrefix: 'https://imgcdn.kim/poster/1920/'
        },
        'DISNEY PLUS': {
            id: 'DISNEY PLUS',
            name: 'Disney Plus',
            ott: 'dp',
            studio: 'disney',
            homeEndpoint: '/mobile/home?app=1',
            searchEndpoint: '/mobile/hs/search.php',
            postEndpoint: '/mobile/hs/post.php',
            episodesEndpoint: '/mobile/hs/episodes.php',
            playlistEndpoint: '/mobile/hs/playlist.php',
            imgPrefix: 'https://imgcdn.kim/poster/1920/'
        }
    };

    let cachedDomain = DEFAULT_BASE_URL;
    let lastDomainCheck = 0;
    let cachedSessionToken = '';
    let tokenTimestamp = 0;

    const titleCache = new Map();

    function log(tag, msg) {
        if (typeof logPlugin === 'function') {
            logPlugin(tag, msg);
        } else if (typeof console !== 'undefined' && console.log) {
            console.log('[NetMirror::' + tag + '] ' + msg);
        }
    }

    function clean(v) { return String(v || '').trim(); }
    function parseJsonSafe(text, fb) { try { return JSON.parse(text); } catch (_) { return fb; } }

    function getProviderConfig() {
        const rawId = clean((typeof manifest !== 'undefined' && manifest && manifest.providerId) || '').toUpperCase();
        if (rawId === 'PV' || rawId.indexOf('PRIME') >= 0) return PROVIDERS['PRIME VIDEO'];
        if (rawId === 'HS' || rawId.indexOf('HOTSTAR') >= 0) return PROVIDERS['HOTSTAR'];
        if (rawId === 'DP' || rawId.indexOf('DISNEY') >= 0) return PROVIDERS['DISNEY PLUS'];
        return PROVIDERS['NETFLIX'];
    }

    // Dynamic Domain Resolution
    async function getActiveBaseUrl() {
        const now = Date.now();
        if (cachedDomain && (now - lastDomainCheck < 1800000)) {
            return cachedDomain;
        }

        try {
            log('RESOLVER', 'Resolving authentic NetMirror domain from detector...');
            const res = await http_get(DOMAIN_DETECTOR_URL, BASE_HEADERS);
            if (res && res.status === 200 && res.body) {
                const j = parseJsonSafe(res.body, null);
                if (j && j.token_hash) {
                    const decoded = atob(j.token_hash);
                    const match = decoded.match(/https?:\/\/[^/]+/i);
                    if (match) {
                        cachedDomain = match[0].replace(/\/+$/, '');
                        lastDomainCheck = now;
                        log('RESOLVER', 'Resolved active NetMirror domain: ' + cachedDomain);
                        return cachedDomain;
                    }
                }
            }
        } catch (e) {
            log('RESOLVER', 'Domain detector failed: ' + (e && e.message || e));
        }

        cachedDomain = DEFAULT_BASE_URL;
        lastDomainCheck = now;
        return cachedDomain;
    }

    // Bypass Session Token Acquisition
    async function getSessionToken(forceRefresh) {
        const now = Date.now();
        if (!forceRefresh && cachedSessionToken && (now - tokenTimestamp < 86400000)) {
            return cachedSessionToken;
        }

        const domain = await getActiveBaseUrl();
        try {
            log('AUTH', 'Acquiring session bypass token from ' + domain + '/verify.php...');
            const res = await http_post(
                domain + '/verify.php',
                Object.assign({}, BASE_HEADERS, {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Referer': domain + '/verify2'
                }),
                'g-recaptcha-response=session-probe-' + now
            );

            const setCookies = (res && res.headers && (res.headers['set-cookie'] || res.headers['Set-Cookie'])) || [];
            const cookieList = Array.isArray(setCookies) ? setCookies.join('; ') : String(setCookies);
            const match = cookieList.match(/t_hash_t=([^;]+)/i);
            if (match) {
                cachedSessionToken = decodeURIComponent(match[1]);
                tokenTimestamp = now;
                log('AUTH', 'Successfully acquired t_hash_t session token');
                return cachedSessionToken;
            }
        } catch (e) {
            log('AUTH', 'Failed to acquire session token: ' + (e && e.message || e));
        }

        return cachedSessionToken;
    }

    function buildCookieString(token, provider) {
        let cookie = 't_hash_t=' + token + '; ott=' + provider.ott + '; hd=on; user_token=233123f803cf02184bf6c67e149cdd50';
        if (provider.studio) {
            cookie += '; studio=' + provider.studio;
        }
        return cookie;
    }

    async function netMirrorGet(path, provider, extraHeaders) {
        const domain = await getActiveBaseUrl();
        const token = await getSessionToken();
        const cookie = buildCookieString(token, provider);

        const headers = Object.assign({}, BASE_HEADERS, {
            'Cookie': cookie,
            'Referer': domain + '/home'
        }, extraHeaders || {});

        const res = await http_get(domain + path, headers);
        if (res && (res.status === 401 || res.status === 403 || res.status === 302)) {
            log('NET', 'Token expired or challenged. Refreshing session token...');
            const freshToken = await getSessionToken(true);
            headers['Cookie'] = buildCookieString(freshToken, provider);
            return await http_get(domain + path, headers);
        }
        return res;
    }

    // Title resolution helper with in-memory caching and batching
    async function resolveItemTitle(id, provider) {
        if (!id) return '';
        if (titleCache.has(id)) return titleCache.get(id);

        try {
            const res = await netMirrorGet(provider.postEndpoint + '?id=' + encodeURIComponent(id) + '&t=' + Math.floor(Date.now() / 1000), provider, {
                'X-Requested-With': 'XMLHttpRequest'
            });
            if (res && res.status === 200 && res.body) {
                const pj = parseJsonSafe(res.body, null);
                if (pj && pj.title) {
                    titleCache.set(id, pj.title);
                    return pj.title;
                }
            }
        } catch (_) {}
        return '';
    }

    // Home Catalog Implementation
    async function getHome(cb) {
        try {
            const provider = getProviderConfig();
            log('GET_HOME', 'Loading home catalog for: ' + provider.name);

            if (provider.id === 'PRIME VIDEO') {
                // Prime Video returns structured JSON homepage with trays containing comma-separated item IDs
                const res = await netMirrorGet(provider.homeEndpoint, provider);
                if (!res || res.status !== 200 || !res.body) {
                    return cb({ success: false, errorCode: 'FETCH_ERROR', message: 'Failed to load Prime Video catalog' });
                }

                const data = parseJsonSafe(res.body, null);
                const sections = {};
                const trays = (data && data.post) || [];

                // Collect IDs to prefetch titles for top items
                const prefetchIds = [];
                trays.slice(0, 8).forEach(function (tray) {
                    const idList = (tray.ids || '').split(',').map(s => s.trim()).filter(Boolean);
                    idList.slice(0, 5).forEach(function (id) {
                        if (!titleCache.has(id) && prefetchIds.indexOf(id) === -1) {
                            prefetchIds.push(id);
                        }
                    });
                });

                // Concurrent resolution in small chunks
                const chunkSize = 8;
                for (let i = 0; i < prefetchIds.length; i += chunkSize) {
                    const chunk = prefetchIds.slice(i, i + chunkSize);
                    await Promise.allSettled(chunk.map(id => resolveItemTitle(id, provider)));
                }

                trays.forEach(function (tray) {
                    const trayName = clean(tray.cate || tray.title);
                    const idList = (tray.ids || '').split(',').map(s => s.trim()).filter(Boolean);
                    if (!trayName || idList.length === 0) return;

                    const items = idList.map(function (id) {
                        const resolvedTitle = titleCache.get(id);
                        const title = resolvedTitle || (trayName + ' #' + id);
                        const poster = provider.imgPrefix + id + '.jpg';

                        return new MultimediaItem({
                            title: title,
                            url: JSON.stringify({
                                provider: provider.id,
                                id: id,
                                title: resolvedTitle || undefined,
                                type: 'movie'
                            }),
                            posterUrl: poster,
                            type: 'movie'
                        });
                    });

                    if (items.length > 0) {
                        sections[trayName] = items;
                    }
                });

                return cb({ success: true, data: sections });
            }

            // Netflix, Hotstar, Disney Plus return mobile HTML home
            const res = await netMirrorGet(provider.homeEndpoint, provider);
            if (!res || res.status !== 200 || !res.body) {
                return cb({ success: false, errorCode: 'FETCH_ERROR', message: 'Failed to load ' + provider.name + ' catalog' });
            }

            const html = res.body;
            const sections = {};
            const trayRegex = /<h2 class="tray-title"><a class="tray-link">([^<]+)<\/a><\/h2>([\s\S]*?)(?=<h2 class="tray-title"|$)/gi;

            const parsedTrays = [];
            let match;
            while ((match = trayRegex.exec(html)) !== null) {
                const trayName = clean(match[1]);
                const block = match[2];
                const postMatches = [...block.matchAll(/data-post="([^"]+)"/g)].map(m => m[1]);
                const imgMatches = [...block.matchAll(/data-src="([^"]+)"/g)].map(m => m[1]);

                if (postMatches.length > 0) {
                    parsedTrays.push({
                        name: trayName,
                        ids: postMatches,
                        imgs: imgMatches
                    });
                }
            }

            // Prefetch titles for top items in parallel across trays
            const prefetchIds = [];
            parsedTrays.slice(0, 8).forEach(function (tray) {
                tray.ids.slice(0, 5).forEach(function (id) {
                    if (!titleCache.has(id) && prefetchIds.indexOf(id) === -1) {
                        prefetchIds.push(id);
                    }
                });
            });

            // Concurrent resolution in small chunks
            const chunkSize = 8;
            for (let i = 0; i < prefetchIds.length; i += chunkSize) {
                const chunk = prefetchIds.slice(i, i + chunkSize);
                await Promise.allSettled(chunk.map(id => resolveItemTitle(id, provider)));
            }

            parsedTrays.forEach(function (tray) {
                const items = tray.ids.map(function (id, idx) {
                    const resolvedTitle = titleCache.get(id);
                    const title = resolvedTitle || (tray.name + ' #' + id);
                    const poster = tray.imgs[idx] || (provider.imgPrefix + id + '.jpg');

                    return new MultimediaItem({
                        title: title,
                        url: JSON.stringify({
                            provider: provider.id,
                            id: id,
                            title: resolvedTitle || undefined,
                            type: 'movie'
                        }),
                        posterUrl: poster,
                        type: 'movie'
                    });
                });

                if (items.length > 0) {
                    sections[tray.name] = items;
                }
            });

            cb({ success: true, data: sections });
        } catch (e) {
            log('GET_HOME', 'Home error: ' + (e && e.message || e));
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    // Search Implementation
    async function search(query, cb) {
        try {
            const provider = getProviderConfig();
            const q = clean(query);
            if (!q) return cb({ success: true, data: [] });

            log('SEARCH', 'Searching ' + provider.name + ' for: "' + q + '"');
            const searchUrl = provider.searchEndpoint + '?s=' + encodeURIComponent(q) + '&t=' + Math.floor(Date.now() / 1000);
            const res = await netMirrorGet(searchUrl, provider, { 'X-Requested-With': 'XMLHttpRequest' });

            if (!res || res.status !== 200 || !res.body) {
                return cb({ success: true, data: [] });
            }

            const data = parseJsonSafe(res.body, null);
            const rawList = (data && data.searchResult) || [];

            const list = rawList.map(function (item) {
                const id = clean(item.id);
                const title = clean(item.t);
                if (!id || !title) return null;

                titleCache.set(id, title);
                const isTv = item.r === 'Series' || String(item.r || '').toLowerCase().indexOf('season') >= 0;
                const poster = item.image || (provider.imgPrefix + id + '.jpg');

                return new MultimediaItem({
                    title: title,
                    url: JSON.stringify({
                        provider: provider.id,
                        id: id,
                        title: title,
                        type: isTv ? 'tv' : 'movie'
                    }),
                    posterUrl: poster,
                    type: isTv ? 'tvseries' : 'movie',
                    year: item.y ? parseInt(String(item.y).slice(0, 4), 10) : undefined
                });
            }).filter(Boolean);

            cb({ success: true, data: list });
        } catch (e) {
            log('SEARCH', 'Search error: ' + (e && e.message || e));
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    // Load Details & Seasons/Episodes
    async function load(urlData, cb) {
        try {
            const payload = parseJsonSafe(urlData, null);
            if (!payload || !payload.id) {
                return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });
            }

            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || getProviderConfig();
            const id = clean(payload.id);
            log('LOAD', 'Loading details for ' + provider.name + ' item: ' + id);

            const detailUrl = provider.postEndpoint + '?id=' + encodeURIComponent(id) + '&t=' + Math.floor(Date.now() / 1000);
            const res = await netMirrorGet(detailUrl, provider, { 'X-Requested-With': 'XMLHttpRequest' });

            if (!res || res.status !== 200 || !res.body) {
                return cb({ success: false, errorCode: 'FETCH_ERROR', message: 'Failed to load details' });
            }

            const detail = parseJsonSafe(res.body, null);
            if (!detail) {
                return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Corrupt details payload' });
            }

            const title = clean(detail.title) || clean(payload.title) || ('Title #' + id);
            titleCache.set(id, title);

            const isTv = detail.type === 't' || (Array.isArray(detail.season) && detail.season.length > 0);
            const poster = detail.image || (provider.imgPrefix + id + '.jpg');
            const backdrop = detail.banner || detail.header_img || poster;

            const actors = [];
            const rawCast = clean(detail.cast || detail.short_cast);
            if (rawCast) {
                rawCast.split(',').forEach(function (name) {
                    const actorName = clean(name);
                    if (actorName) {
                        actors.push(new Actor({ name: actorName }));
                    }
                });
            }

            const genres = [];
            const rawGenre = clean(detail.genre || detail.hs_genre);
            if (rawGenre) {
                rawGenre.split(',').forEach(function (g) {
                    const genre = clean(g);
                    if (genre) genres.push(genre);
                });
            }

            const seasonsList = [];
            const episodes = [];

            if (isTv && Array.isArray(detail.season) && detail.season.length > 0) {
                detail.season.forEach(function (s) {
                    if (s && s.s) {
                        const sNum = parseInt(s.s, 10) || 1;
                        seasonsList.push({
                            name: 'Season ' + sNum,
                            number: sNum,
                            id: clean(s.id) || String(sNum)
                        });
                    }
                });
                seasonsList.sort(function (a, b) { return a.number - b.number; });

                // Map default episodes provided directly in post.php
                const defaultEpisodes = Array.isArray(detail.episodes) ? detail.episodes.filter(Boolean) : [];
                defaultEpisodes.forEach(function (ep) {
                    if (!ep || !ep.id) return;
                    const epNum = parseInt(String(ep.ep || '').replace(/\D+/g, ''), 10) || 1;
                    const sNum = parseInt(String(ep.s || '').replace(/\D+/g, ''), 10) || 1;

                    episodes.push(new Episode({
                        name: clean(ep.t) || ('Episode ' + epNum),
                        season: sNum,
                        episode: epNum,
                        url: JSON.stringify({
                            provider: provider.id,
                            id: clean(ep.id),
                            title: clean(ep.t) || ('Episode ' + epNum),
                            type: 'tv',
                            season: sNum,
                            episode: epNum
                        }),
                        posterUrl: poster,
                        description: clean(ep.ep_desc || ep.desc)
                    }));
                });

                // Fetch other seasons asynchronously if they have distinct season IDs
                const otherSeasons = seasonsList.filter(function (s) {
                    return !episodes.some(function (ep) { return ep.season === s.number; });
                });

                if (otherSeasons.length > 0) {
                    await Promise.allSettled(otherSeasons.map(async function (s) {
                        try {
                            const epRes = await netMirrorGet(provider.episodesEndpoint + '?s=' + encodeURIComponent(s.id), provider);
                            if (epRes && epRes.status === 200 && epRes.body) {
                                const epData = parseJsonSafe(epRes.body, null);
                                const epList = (epData && epData.episodes) || [];
                                epList.forEach(function (ep) {
                                    if (!ep || !ep.id) return;
                                    const epNum = parseInt(String(ep.ep || '').replace(/\D+/g, ''), 10) || 1;
                                    episodes.push(new Episode({
                                        name: clean(ep.t) || ('Episode ' + epNum),
                                        season: s.number,
                                        episode: epNum,
                                        url: JSON.stringify({
                                            provider: provider.id,
                                            id: clean(ep.id),
                                            title: clean(ep.t) || ('Episode ' + epNum),
                                            type: 'tv',
                                            season: s.number,
                                            episode: epNum
                                        }),
                                        posterUrl: poster,
                                        description: clean(ep.ep_desc || ep.desc)
                                    }));
                                });
                            }
                        } catch (_) {}
                    }));
                }
            } else {
                // Single movie episode
                episodes.push(new Episode({
                    name: title,
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({
                        provider: provider.id,
                        id: id,
                        title: title,
                        type: 'movie'
                    }),
                    posterUrl: poster
                }));
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: title,
                    url: JSON.stringify({
                        provider: provider.id,
                        id: id,
                        title: title,
                        type: isTv ? 'tvseries' : 'movie'
                    }),
                    posterUrl: poster,
                    backgroundPosterUrl: backdrop,
                    description: clean(detail.desc || detail.m_desc || detail.overview),
                    type: isTv ? 'tvseries' : 'movie',
                    year: detail.year ? parseInt(String(detail.year).slice(0, 4), 10) : undefined,
                    cast: actors.length > 0 ? actors : undefined,
                    tags: genres.length > 0 ? genres : undefined,
                    seasons: seasonsList.length > 0 ? seasonsList : undefined,
                    episodes: episodes
                })
            });
        } catch (e) {
            log('LOAD', 'Load error: ' + (e && e.message || e));
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    // Load Streams: Authentic Master Playlist Reconstruction
    async function loadStreams(dataStr, cb) {
        try {
            const payload = parseJsonSafe(dataStr, null);
            if (!payload || !payload.id) {
                return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid stream payload' });
            }

            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || getProviderConfig();
            const id = clean(payload.id);
            const domain = await getActiveBaseUrl();

            log('LOAD_STREAMS', 'Reconstructing real streams for ' + provider.name + ' ID: ' + id);

            const playlistUrl = provider.playlistEndpoint + '?id=' + encodeURIComponent(id) + '&t=title&tm=' + Math.floor(Date.now() / 1000);
            const plRes = await netMirrorGet(playlistUrl, provider, { 'X-Requested-With': 'XMLHttpRequest' });

            if (!plRes || plRes.status !== 200 || !plRes.body) {
                return cb({ success: false, errorCode: 'PLAYLIST_ERROR', message: 'Failed to fetch playlist metadata' });
            }

            const plData = parseJsonSafe(plRes.body, null);
            if (!Array.isArray(plData) || !plData[0] || !plData[0].sources || !plData[0].sources[0]) {
                return cb({ success: false, errorCode: 'NO_SOURCES', message: 'No playlist sources found' });
            }

            const masterPath = plData[0].sources[0].file;
            const masterM3u8Res = await netMirrorGet(masterPath, provider);
            if (!masterM3u8Res || masterM3u8Res.status !== 200 || !masterM3u8Res.body) {
                return cb({ success: false, errorCode: 'M3U8_FETCH_ERROR', message: 'Failed to fetch server M3U8' });
            }

            const rawMasterBody = masterM3u8Res.body;
            const audioLines = rawMasterBody.split('\n').filter(l => l.indexOf('#EXT-X-MEDIA:TYPE=AUDIO') >= 0);

            // Extract genuine CDN base URL from audio descriptor
            let cdnBase = '';
            for (let i = 0; i < audioLines.length; i++) {
                const m = audioLines[i].match(/URI="([^"]+)"/i);
                if (m && m[1] && m[1].startsWith('http')) {
                    cdnBase = m[1].split('/a/')[0];
                    break;
                }
            }

            // Subtitles extraction
            const subtitles = (plData[0].tracks || []).filter(function (t) {
                return t.kind === 'captions' && t.file;
            }).map(function (t) {
                let subUrl = t.file;
                if (subUrl.startsWith('//')) subUrl = 'https:' + subUrl;
                return {
                    url: subUrl,
                    file: subUrl,
                    label: clean(t.label || 'Subtitle'),
                    lang: clean(t.srclang || 'en')
                };
            });

            const streamHeaders = {
                'User-Agent': MOBILE_UA,
                'Referer': domain + '/'
            };

            // Failsafe fallback: if no separate audio tracks found, extract stream URLs directly
            if (!cdnBase || audioLines.length === 0) {
                log('LOAD_STREAMS', 'No separate audio tracks found. Falling back to direct stream URLs...');
                const serverStreams = [];
                const lines = rawMasterBody.split('\n');
                let currentRes = 720;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('#EXT-X-STREAM-INF')) {
                        const rm = line.match(/RESOLUTION=\d+x(\d+)/i);
                        if (rm) currentRes = parseInt(rm[1], 10);
                    } else if (line.startsWith('http')) {
                        serverStreams.push(new StreamResult({
                            url: line,
                            source: 'NetMirror [' + currentRes + 'p Direct]',
                            name: 'NetMirror Direct [' + currentRes + 'p]',
                            type: 'hls',
                            quality: currentRes,
                            headers: streamHeaders,
                            subtitles: subtitles.length > 0 ? subtitles : undefined
                        }));
                    }
                }
                if (serverStreams.length > 0) {
                    return cb({ success: true, data: serverStreams });
                }
                return cb({ success: false, errorCode: 'CDN_BASE_MISSING', message: 'Could not extract genuine CDN audio base' });
            }

            log('LOAD_STREAMS', 'Authentic CDN base: ' + cdnBase);

            // Probe first audio track for duration and segment count
            const a0Res = await http_get(cdnBase + '/a/0/0.m3u8', {
                'User-Agent': MOBILE_UA,
                'Referer': domain + '/'
            });

            if (!a0Res || a0Res.status !== 200 || !a0Res.body) {
                return cb({ success: false, errorCode: 'AUDIO_PROBE_ERROR', message: 'Failed to read CDN audio track' });
            }

            let totalAudioDur = 0;
            let segPrefix = '';
            let padLen = 3;
            let segCount = 0;

            const aLines = a0Res.body.split('\n');
            for (let i = 0; i < aLines.length; i++) {
                const line = aLines[i].trim();
                if (line.startsWith('#EXTINF:')) {
                    totalAudioDur += parseFloat(line.substring(8).split(',')[0]) || 0;
                    segCount++;
                } else if (line && !line.startsWith('#') && !segPrefix) {
                    const sm = line.match(/^(.+)_(\d+)\.js$/);
                    if (sm) {
                        segPrefix = sm[1];
                        padLen = sm[2].length;
                    }
                }
            }

            if (!segPrefix || segCount === 0) {
                return cb({ success: false, errorCode: 'SEG_DISCOVERY_ERROR', message: 'Could not determine segment prefix' });
            }

            const formatSeg = function (n) {
                return segPrefix + '_' + String(n).padStart(padLen, '0');
            };

            // Probe authentic video segment extension
            let videoExt = '';
            const testExts = ['woff2', 'jpg', 'jpeg', 'js', 'ts'];
            for (let i = 0; i < testExts.length; i++) {
                const ext = testExts[i];
                const tr = await http_get(cdnBase + '/720p/' + formatSeg(0) + '.' + ext, {
                    'User-Agent': MOBILE_UA,
                    'Referer': domain + '/'
                });
                if (tr && tr.status === 200 && (tr.body || '').length > 500) {
                    videoExt = ext;
                    log('LOAD_STREAMS', 'Discovered authentic video segment extension: .' + ext);
                    break;
                }
            }

            if (!videoExt) {
                return cb({ success: false, errorCode: 'EXT_DISCOVERY_ERROR', message: 'No accessible video segment extension found' });
            }

            // Probe available qualities (1080p and 720p)
            const probeQuality = async function (q) {
                const qr = await http_get(cdnBase + '/' + q + '/' + formatSeg(0) + '.' + videoExt, {
                    'User-Agent': MOBILE_UA,
                    'Referer': domain + '/',
                    'Range': 'bytes=0-50'
                });
                return !!(qr && (qr.status === 200 || qr.status === 206));
            };

            const has1080 = await probeQuality('1080p');
            const has720 = await probeQuality('720p');

            const avgSegDur = (totalAudioDur / segCount).toFixed(3);
            const targetDur = Math.ceil(totalAudioDur / segCount) + 1;

            const buildVariantM3u8 = function (quality) {
                let out = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:' + targetDur + '\n#EXT-X-MEDIA-SEQUENCE:0\n';
                for (let n = 0; n < segCount; n++) {
                    out += '#EXTINF:' + avgSegDur + ',\n' + cdnBase + '/' + quality + '/' + formatSeg(n) + '.' + videoExt + '\n';
                }
                out += '#EXT-X-ENDLIST\n';
                return out;
            };

            // Store variant playlists using native Tauri command or magic_m3u8 base64
            const storePlaylist = async function (m3u8Content) {
                // 1. Try globalThis.storeGeneratedPlaylist (injected by Fluxio scraper sandbox)
                if (typeof globalThis !== 'undefined' && typeof globalThis.storeGeneratedPlaylist === 'function') {
                    try {
                        const token = await globalThis.storeGeneratedPlaylist(m3u8Content);
                        if (token) {
                            const tStr = String(token).trim();
                            return tStr.startsWith('magic_m3u8:') ? tStr : ('magic_m3u8:' + tStr);
                        }
                    } catch (e) {
                        log('STORE_PLAYLIST', 'globalThis.storeGeneratedPlaylist error: ' + (e && e.message || e));
                    }
                }
                // 2. Direct lexical scope check (sandbox exposes global variables into scope)
                if (typeof storeGeneratedPlaylist === 'function') {
                    try {
                        const token = await storeGeneratedPlaylist(m3u8Content);
                        if (token) {
                            const tStr = String(token).trim();
                            return tStr.startsWith('magic_m3u8:') ? tStr : ('magic_m3u8:' + tStr);
                        }
                    } catch (e) {
                        log('STORE_PLAYLIST', 'storeGeneratedPlaylist error: ' + (e && e.message || e));
                    }
                }
                // 3. Try window.storeGeneratedPlaylist
                if (typeof window !== 'undefined' && typeof window.storeGeneratedPlaylist === 'function') {
                    try {
                        const token = await window.storeGeneratedPlaylist(m3u8Content);
                        if (token) {
                            const tStr = String(token).trim();
                            return tStr.startsWith('magic_m3u8:') ? tStr : ('magic_m3u8:' + tStr);
                        }
                    } catch (e) {
                        log('STORE_PLAYLIST', 'window.storeGeneratedPlaylist error: ' + (e && e.message || e));
                    }
                }
                // 4. Try window.__TAURI__ if available
                if (typeof window !== 'undefined' && window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
                    try {
                        const token = await window.__TAURI__.core.invoke('store_generated_playlist', { content: m3u8Content });
                        if (token) {
                            const tStr = String(token).trim();
                            return tStr.startsWith('magic_m3u8:') ? tStr : ('magic_m3u8:' + tStr);
                        }
                    } catch (e) {
                        log('STORE_PLAYLIST', 'window.__TAURI__.core.invoke error: ' + (e && e.message || e));
                    }
                }
                log('STORE_PLAYLIST', 'Warning: native playlist caching unavailable, falling back to base64');
                return 'magic_m3u8:' + btoa(unescape(encodeURIComponent(m3u8Content)));
            };

            let variant1080Url = '';
            let variant720Url = '';

            if (has1080) {
                variant1080Url = await storePlaylist(buildVariantM3u8('1080p'));
            }
            if (has720 || !has1080) {
                variant720Url = await storePlaylist(buildVariantM3u8('720p'));
            }

            // Dynamically detect AUDIO group-id from the audio lines to ensure player track matching
            let audioGroupId = 'aac';
            for (let i = 0; i < audioLines.length; i++) {
                const gm = audioLines[i].match(/GROUP-ID="([^"]+)"/i);
                if (gm && gm[1]) {
                    audioGroupId = gm[1];
                    break;
                }
            }

            // Assemble Real Master Playlist with Multi-Audio
            let master = '#EXTM3U\n#EXT-X-VERSION:3\n';
            audioLines.forEach(function (al) {
                master += al.trim() + '\n';
            });

            if (has1080) {
                master += '#EXT-X-STREAM-INF:BANDWIDTH=1500000,AUDIO="' + audioGroupId + '",RESOLUTION=1920x1080,CLOSED-CAPTIONS=NONE\n';
                master += variant1080Url + '\n';
            }
            if (has720 || !has1080) {
                master += '#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO="' + audioGroupId + '",DEFAULT=YES,RESOLUTION=1280x720,CLOSED-CAPTIONS=NONE\n';
                master += variant720Url + '\n';
            }
            master += '#EXT-X-ENDLIST\n';

            const masterStreamUrl = await storePlaylist(master);

            // Assemble Direct 1080p Single-Variant Master with Multi-Audio
            let direct1080StreamUrl = variant1080Url;
            if (has1080) {
                let m1080 = '#EXTM3U\n#EXT-X-VERSION:3\n';
                audioLines.forEach(function (al) { m1080 += al.trim() + '\n'; });
                m1080 += '#EXT-X-STREAM-INF:BANDWIDTH=1500000,AUDIO="' + audioGroupId + '",DEFAULT=YES,RESOLUTION=1920x1080,CLOSED-CAPTIONS=NONE\n';
                m1080 += variant1080Url + '\n#EXT-X-ENDLIST\n';
                direct1080StreamUrl = await storePlaylist(m1080);
            }

            // Assemble Direct 720p Single-Variant Master with Multi-Audio
            let direct720StreamUrl = variant720Url;
            if (has720) {
                let m720 = '#EXTM3U\n#EXT-X-VERSION:3\n';
                audioLines.forEach(function (al) { m720 += al.trim() + '\n'; });
                m720 += '#EXT-X-STREAM-INF:BANDWIDTH=800000,AUDIO="' + audioGroupId + '",DEFAULT=YES,RESOLUTION=1280x720,CLOSED-CAPTIONS=NONE\n';
                m720 += variant720Url + '\n#EXT-X-ENDLIST\n';
                direct720StreamUrl = await storePlaylist(m720);
            }

            const outStreams = [];

            // Primary: Full Multi-Audio Master Stream
            outStreams.push(new StreamResult({
                url: masterStreamUrl,
                source: 'NetMirror [Master Multi-Audio]',
                name: 'NetMirror Multi-Audio [' + (has1080 ? '1080p' : '720p') + ' Auto]',
                type: 'hls',
                quality: has1080 ? 1080 : 720,
                headers: streamHeaders,
                subtitles: subtitles.length > 0 ? subtitles : undefined
            }));

            // Direct variant fallbacks with multi-audio preserved
            if (has1080) {
                outStreams.push(new StreamResult({
                    url: direct1080StreamUrl,
                    source: 'NetMirror [Direct 1080p]',
                    name: 'NetMirror Direct [1080p]',
                    type: 'hls',
                    quality: 1080,
                    headers: streamHeaders,
                    subtitles: subtitles.length > 0 ? subtitles : undefined
                }));
            }
            if (has720) {
                outStreams.push(new StreamResult({
                    url: direct720StreamUrl,
                    source: 'NetMirror [Direct 720p]',
                    name: 'NetMirror Direct [720p]',
                    type: 'hls',
                    quality: 720,
                    headers: streamHeaders,
                    subtitles: subtitles.length > 0 ? subtitles : undefined
                }));
            }

            log('LOAD_STREAMS', 'Successfully constructed ' + outStreams.length + ' authentic stream(s) with ' + audioLines.length + ' audio track(s)');
            cb({ success: true, data: outStreams });
        } catch (e) {
            log('LOAD_STREAMS', 'Stream resolution error: ' + (e && e.message || e));
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
