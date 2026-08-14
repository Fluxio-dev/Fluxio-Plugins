(function () {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const BASE_URL = 'https://net52.cc';
    const PLAY_URL = 'https://net52.cc';

    const COMMON_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const MOBILE_COMMON_HEADERS = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8',
        'Cache-Control': 'max-age=0',
        'Connection': 'keep-alive',
        'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="144", "Android WebView";v="144"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0',
        'X-Requested-With': 'XMLHttpRequest'
    };

    const NEW_TV_BASE_HEADERS = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Requested-With': 'NetmirrorNewTV v1.0',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0',
        'Accept': 'application/json, text/plain, */*'
    };

    const NEW_TV_DOMAINS = [
        'aHR0cHM6Ly9tb2JpbGVkZXRlY3RzLmNvbQ==',
        'aHR0cHM6Ly9tb2JpbGVkZXRlY3QuYXBw',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmFydA==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmNj',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lmluaw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LmxpdmU=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnBybw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNob3A=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNpdGU=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnNwYWNl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnN0b3Jl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0LnZpcA==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lndpa2k=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0Lnh5eg==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5hcnQ=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5jYw==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbmZv',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5pbms=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5saXZl',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5wcm8=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy5zdG9yZQ==',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy50b3A=',
        'aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo='
    ];

    const PROVIDERS = {
        'NETFLIX': {
            id: 'NETFLIX',
            ott: 'nf',
            baseUrl: BASE_URL,
            playUrl: PLAY_URL,
            homePath: '/mobile/home?app=1',
            searchPath: '/mobile/search.php',
            postPath: '/mobile/post.php',
            episodesPath: '/mobile/episodes.php',
            playlistPath: '/mobile/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/poster/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/poster/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/epimg/150/' + id + '.jpg'; }
        },
        'PRIME VIDEO': {
            id: 'PRIME VIDEO',
            ott: 'pv',
            // Align PRIME VIDEO endpoint paths with the correct NetMirror /pv/ paths (one-line comment)
            baseUrl: BASE_URL,
            playUrl: PLAY_URL,
            homePath: '/pv/homepage.php',
            searchPath: '/pv/search.php',
            postPath: '/pv/post.php',
            episodesPath: '/pv/episodes.php',
            playlistPath: '/pv/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/pv/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/pv/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/pvepimg/150/' + id + '.jpg'; }
        },
        'HOTSTAR': {
            id: 'HOTSTAR',
            ott: 'hs',
            baseUrl: PLAY_URL,
            playUrl: PLAY_URL,
            homePath: '/mobile/home?app=1',
            searchPath: '/mobile/hs/search.php',
            postPath: '/mobile/hs/post.php',
            episodesPath: '/mobile/hs/episodes.php',
            playlistPath: '/mobile/hs/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/hs/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/hs/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/hsepimg/150/' + id + '.jpg'; }
        },
        'DISNEY PLUS': {
            id: 'DISNEY PLUS',
            ott: 'dp',
            studio: 'disney',
            baseUrl: PLAY_URL,
            playUrl: PLAY_URL,
            homePath: '/mobile/home?app=1',
            searchPath: '/mobile/hs/search.php',
            postPath: '/mobile/hs/post.php',
            episodesPath: '/mobile/hs/episodes.php',
            playlistPath: '/mobile/hs/playlist.php',
            usePlayHandshake: true,
            includeUserToken: true,
            poster: function (id) { return 'https://imgcdn.kim/hs/v/' + id + '.jpg'; },
            background: function (id) { return 'https://imgcdn.kim/hs/h/' + id + '.jpg'; },
            episodePoster: function (id) { return 'https://imgcdn.kim/hsepimg/150/' + id + '.jpg'; }
        }
    };

    let cachedCookie = '';
    let lastBypassTime = 0;
    let resolvedNewTvApiUrl = '';

    function clean(v) { return String(v || '').trim(); }
    function parseJsonSafe(text, fb) { try { return JSON.parse(text); } catch (_) { return fb; } }
    function unixTs() { return Math.floor(Date.now() / 1000); }

    function cfg() {
        const pid = clean((manifest && manifest.providerId) || '').toUpperCase();
        return PROVIDERS[pid] || PROVIDERS['NETFLIX'];
    }

    function providerHeaders(provider) {
        const pid = clean(provider && provider.id).toUpperCase();
        return (pid === 'HOTSTAR' || pid === 'DISNEY PLUS' || pid === 'NETFLIX') ? MOBILE_COMMON_HEADERS : COMMON_HEADERS;
    }

    function proxiedImage(url) {
        if (!url) return '';
        return 'https://wsrv.nl/?url=' + encodeURIComponent(url) + '&w=500';
    }

    function parseSetCookie(raw) {
        let txt = raw;
        if (Array.isArray(txt)) txt = txt.join('; ');
        txt = clean(txt);
        if (!txt) return '';
        const m = txt.match(/t_hash_t=([^;]+)/i);
        return m && m[1] ? decodeURIComponent(m[1]) : '';
    }

    function decodeBase64(value) {
        if (typeof atob === 'function') return atob(value);
        if (typeof Buffer !== 'undefined') return Buffer.from(value, 'base64').toString('utf-8');
        return '';
    }

    function buildNewTvHeaders(ott, extra) {
        const headers = Object.assign({}, NEW_TV_BASE_HEADERS, { Ott: ott });
        if (extra) {
            Object.keys(extra).forEach(function (key) {
                headers[key] = extra[key];
            });
        }
        return headers;
    }

    async function resolveNewTvApiUrl() {
        if (resolvedNewTvApiUrl) return resolvedNewTvApiUrl;
        for (let i = 0; i < NEW_TV_DOMAINS.length; i++) {
            const base = decodeBase64(NEW_TV_DOMAINS[i]).replace(/\/+$/, '');
            if (!base) continue;
            try {
                const res = await http_get(base + '/checknewtv.php', NEW_TV_BASE_HEADERS);
                const data = parseJsonSafe(res.body, {});
                const tokenHash = clean(data.token_hash);
                if (tokenHash) {
                    resolvedNewTvApiUrl = decodeBase64(tokenHash).replace(/\/+$/, '');
                    if (resolvedNewTvApiUrl) return resolvedNewTvApiUrl;
                }
            } catch (_) {
                // Try next domain.
            }
        }
        throw new Error('Failed to resolve NewTV API base URL');
    }

    function randomUuid() {
        if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    const BYPASS_UA = 'Mozilla/5.0 (Linux; Android 12; RMX2117 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/147.0.7727.55 Mobile Safari/537.36 /OS.Gatu v3.0';

    function collectCookies(headers) {
        var raw = headers && (headers['set-cookie'] || headers['Set-Cookie']);
        if (!raw) return '';
        var list = Array.isArray(raw) ? raw : [raw];
        var parts = [];
        for (var i = 0; i < list.length; i++) {
            var first = list[i].split(';')[0].trim();
            if (first.indexOf('=') !== -1) parts.push(first);
        }
        return parts.join('; ');
    }

    let isNewToken = false;
    // Track isNewToken state and use backgroundBypassPromise to await new verify token for streams (one-line comment)
    try {
        cachedCookie = localStorage.getItem('cnc_cached_cookie') || '';
        lastBypassTime = parseInt(localStorage.getItem('cnc_last_bypass_time') || '0', 10);
        isNewToken = localStorage.getItem('cnc_is_new_token') === 'true';
    } catch (_) {}

    let isRefreshing = false;
    let backgroundBypassPromise = null;

    // Add logPlugin instrumentation throughout the bypass and background verification functions (one-line comment)
    setTimeout(function() {
        if (cachedCookie && isNewToken && (Date.now() - lastBypassTime <= 72000000)) {
            logPlugin('BYPASS', 'Startup check: Cached premium token is fresh (' + Math.round((Date.now() - lastBypassTime) / 60000) + 'm old). Skipping background bypass.');
            return;
        }
        logPlugin('BYPASS', 'Startup check: Stale, missing, or legacy token. Initiating background bypass...');
        try { runBackgroundBypass(cfg()); } catch (_) {}
    }, 0);

    async function quickBypass(provider) {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        const body = 'g-recaptcha-response=' + encodeURIComponent(uuid);
        const headers = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Origin': BASE_URL,
            'Referer': BASE_URL + '/verify2',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
        };
        const res = await http_post(BASE_URL + '/verify.php', headers, body);
        const rawHeader = (res.headers && (res.headers['set-cookie'] || res.headers['Set-Cookie'])) || '';
        const hash = parseSetCookie(rawHeader);
        if (hash) {
            logPlugin('BYPASS', 'Got legacy token: ' + hash);
            cachedCookie = hash;
            isNewToken = false;
            lastBypassTime = Date.now();
            try {
                localStorage.setItem('cnc_cached_cookie', cachedCookie);
                localStorage.setItem('cnc_last_bypass_time', lastBypassTime.toString());
                localStorage.setItem('cnc_is_new_token', 'false');
            } catch (_) {}
            return cachedCookie;
        }
        throw new Error('Quick legacy verify failed');
    }

    function runBackgroundBypass(provider) {
        if (backgroundBypassPromise) return backgroundBypassPromise;
        backgroundBypassPromise = (async () => {
            if (isRefreshing) return;
            isRefreshing = true;
            try {
                logPlugin('BYPASS', 'Background bypass started. Fetching challenge home page...');
                const challengeUrl = BASE_URL + '/mobile/home?app=1';
                const challengeRes = await http_get(challengeUrl, {
                    'User-Agent': BYPASS_UA,
                    'X-Requested-With': 'app.netmirror.netmirrornew'
                });
                var cookieJar = collectCookies(challengeRes.headers);
                const html = String(challengeRes.body || '');
                const am = html.match(/<body[^>]*data-addhash="([^"]+)"/i);
                const addhash = am ? am[1] : '';
                if (!addhash) throw new Error('Failed to extract addhash');
                
                var userverHeaders = {};
                if (cookieJar) userverHeaders['Cookie'] = cookieJar;
                
                const parts = addhash.split('::');
                const ts = (parts.length > 2) ? parts[2] : Math.floor(Date.now() / 1000);
                logPlugin('BYPASS', 'Executing userver request for addhash activation...');
                await http_get('https://userver.net52.cc/?jjoii=' + encodeURIComponent(addhash) + '&a=y&t=' + ts, userverHeaders);

                const verifyHeaders = {
                    'User-Agent': BYPASS_UA,
                    'X-Requested-With': 'XMLHttpRequest',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'redirect': 'follow'
                };
                if (cookieJar) verifyHeaders['Cookie'] = cookieJar;
                const verifyBody = 'verify=' + encodeURIComponent(addhash);
                
                logPlugin('BYPASS', 'Polling mobile/verify2.php...');
                for (let attempt = 0; attempt < 6; attempt++) {
                    if (attempt > 0) {
                        logPlugin('BYPASS', 'Polling attempt ' + attempt + ' did not return token. Waiting 8s...');
                        await new Promise(function (r) { return setTimeout(r, 8000); });
                    }
                    try {
                        const verifyRes = await http_post(BASE_URL + '/mobile/verify2.php', verifyHeaders, verifyBody);
                        const rawHeader = (verifyRes.headers && (verifyRes.headers['set-cookie'] || verifyRes.headers['Set-Cookie'])) || '';
                        const hash = parseSetCookie(rawHeader);
                        if (hash) {
                            const oldToken = cachedCookie || 'NONE';
                            cachedCookie = hash;
                            isNewToken = true;
                            lastBypassTime = Date.now();
                            logPlugin('BYPASS', 'Replaced old token with new: ' + oldToken + ' -> ' + hash);
                            try {
                                localStorage.setItem('cnc_cached_cookie', cachedCookie);
                                localStorage.setItem('cnc_last_bypass_time', lastBypassTime.toString());
                                localStorage.setItem('cnc_is_new_token', 'true');
                            } catch (_) {}
                            break;
                        }
                    } catch (_) {}
                }
            } catch (e) {
                logPlugin('BYPASS', 'Background bypass error: ' + (e && e.message || e));
            } finally {
                isRefreshing = false;
                backgroundBypassPromise = null;
            }
        })();
        return backgroundBypassPromise;
    }

    async function bypass(provider, forceNew) {
        const now = Date.now();
        if (forceNew) {
            if (cachedCookie && isNewToken) {
                return cachedCookie;
            }
            if (backgroundBypassPromise) {
                logPlugin('BYPASS', 'Stream load requested but premium token not ready yet. Awaiting background bypass...');
                await backgroundBypassPromise;
                logPlugin('BYPASS', 'Background bypass completed. Returning premium token: ' + cachedCookie);
            }
            return cachedCookie || '';
        }
        if (cachedCookie) {
            if (now - lastBypassTime > 72000000) {
                logPlugin('BYPASS', 'Cached token expired (20 hours). Triggering background refresh...');
                runBackgroundBypass(provider);
            }
            return cachedCookie;
        }
        logPlugin('BYPASS', 'No cached token. Concurrently launching quickBypass (legacy) and backgroundBypass...');
        runBackgroundBypass(provider);
        try {
            return await quickBypass(provider);
        } catch (_) {
            if (backgroundBypassPromise) {
                logPlugin('BYPASS', 'Quick bypass failed. Awaiting background bypass...');
                await backgroundBypassPromise;
            }
            if (cachedCookie) return cachedCookie;
            throw new Error('Failed to verify cookie');
        }
    }

    async function cookieString(provider, forceNew) {
        const hash = await bypass(provider, forceNew);
        const parts = ['t_hash_t=' + hash, 'ott=' + provider.ott, 'hd=on'];
        if (provider.studio) parts.push('studio=' + provider.studio);
        if (provider.includeUserToken) parts.push('user_token=233123f803cf02184bf6c67e149cdd50');
        return parts.join('; ');
    }

    function parseNetflixRows(html, provider) {
        const sections = {};
        const rowRegex = /<div[^>]*class="[^"]*lolomoRow[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*lolomoRow[^"]*"[^>]*>|$)/g;
        let rowMatch;
        while ((rowMatch = rowRegex.exec(html)) !== null) {
            const rowHtml = rowMatch[1];
            let title = 'Trending';
            const titleMatch = rowHtml.match(/<div class="row-header-title">([\s\S]*?)<\/div>/) || rowHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
            if (titleMatch) title = clean(titleMatch[1].replace(/<[^>]*>/g, '')) || 'Trending';

            const items = [];
            const seen = {};
            const imgRegex = /<img[^>]*class="[^"]*lazy[^"]*"[^>]*data-src="([^"]+)"/g;
            let imgMatch;
            while ((imgMatch = imgRegex.exec(rowHtml)) !== null) {
                const imgSrc = imgMatch[1];
                const id = clean(imgSrc).split('/').pop().split('.')[0];
                if (!id || seen[id]) continue;
                seen[id] = true;
                items.push(new MultimediaItem({
                    title: ' ',
                    url: JSON.stringify({ provider: provider.id, id: id }),
                    posterUrl: proxiedImage(provider.poster(id)),
                    type: 'movie'
                }));
            }
            if (items.length > 0) sections[title] = items;
        }
        return sections;
    }

    function parseTrayRows(html, provider) {
        const sections = {};
        // Skip spotlight billboard buttons with data-post in parseTrayRows (one-line comment)
        const globalRegex = /<(h2|span|div|p)[^>]*class="[^"]*(tray-title|mobile-tray-title|title|tray-title-container)[^"]*"[^>]*>([\s\S]*?)<\/\1>|<[^>]*data-post="([^"]+)"/ig;

        let currentTitle = 'Trending';
        let gMatch;
        while ((gMatch = globalRegex.exec(html)) !== null) {
            if (gMatch[3]) {
                const titleText = clean(gMatch[3].replace(/<[^>]*>/g, ''));
                if (titleText && titleText.length > 2 && titleText.length < 50 && titleText.indexOf('{') === -1) {
                    currentTitle = titleText;
                }
            } else if (gMatch[4]) {
                const tagStr = gMatch[0];
                if (tagStr.indexOf('<button') === 0 || tagStr.indexOf('btn-play') !== -1 || tagStr.indexOf('btn-mylist') !== -1) {
                    continue;
                }
                const id = clean(gMatch[4]);
                if (!id || id.indexOf("'") >= 0 || id.indexOf('+') >= 0) continue;
                if (!sections[currentTitle]) sections[currentTitle] = [];
                if (!sections[currentTitle].some(function (it) {
                    const parsed = parseJsonSafe(it.url, {});
                    return parsed && parsed.id === id;
                })) {
                    sections[currentTitle].push(new MultimediaItem({
                        title: ' ',
                        url: JSON.stringify({ provider: provider.id, id: id }),
                        posterUrl: proxiedImage(provider.poster(id)),
                        type: 'movie'
                    }));
                }
            }
        }
        if (sections['Trending'] && sections['Trending'].length === 0) {
            delete sections['Trending'];
        }
        return sections;
    }

    async function fetchPagedEpisodes(provider, seriesId, seasonId, page, episodes, cookieStr) {
        let pg = page;
        while (true) {
            try {
                const epUrl = provider.baseUrl + provider.episodesPath + '?s=' + encodeURIComponent(seasonId) + '&series=' + encodeURIComponent(seriesId) + '&t=' + unixTs() + '&page=' + pg;
                const res = await http_get(epUrl, Object.assign({}, providerHeaders(provider), { Cookie: cookieStr }));
                const data = parseJsonSafe(res.body, {});
                (Array.isArray(data.episodes) ? data.episodes : []).forEach(function (ep) {
                    episodes.push(new Episode({
                        name: clean(ep.t) || 'Episode',
                        season: parseInt(String(ep.s || '').replace('S', ''), 10) || 1,
                        episode: parseInt(String(ep.ep || '').replace('E', ''), 10) || 1,
                        url: JSON.stringify({ provider: provider.id, kind: 'play', id: clean(ep.id), title: clean(ep.t) || 'Episode' }),
                        posterUrl: proxiedImage(provider.episodePoster(clean(ep.id)))
                    }));
                });
                if (Number(data.nextPageShow || 0) === 0) break;
                pg++;
            } catch (_) {
                break;
            }
        }
    }

    function isResponseValid(body, provider) {
        const txt = String(body || '');
        if (provider.id === 'PRIME VIDEO') {
            const json = parseJsonSafe(txt, {});
            return Array.isArray(json.post) && json.post.length > 0;
        }
        return txt.indexOf('lolomoRow') !== -1 || txt.indexOf('data-post') !== -1 || txt.indexOf('tray-title') !== -1 || txt.indexOf('mobile-tray-title') !== -1;
    }

    // Add helper isResponseValid and retry flow in getHome to handle token invalidation or IP changes (one-line comment)
    async function getHome(cb) {
        try {
            const provider = cfg();
            let cookieStr = await cookieString(provider);
            let headers = Object.assign({}, providerHeaders(provider), {
                Referer: (provider.baseUrl + '/mobile/home?app=1'),
                Cookie: cookieStr,
                'X-Requested-With': 'XMLHttpRequest'
            });

            if (provider.id === 'PRIME VIDEO') {
                const primeHeaders = Object.assign({}, headers, { Referer: BASE_URL + '/home' });
                let res = await http_get(provider.baseUrl + provider.homePath, primeHeaders);
                if (!isResponseValid(res.body, provider)) {
                    logPlugin('BYPASS', 'IP change or token invalidation detected on Prime Video home load. Clearing cache and triggering fresh bypass.');
                    cachedCookie = '';
                    isNewToken = false;
                    lastBypassTime = 0;
                    try {
                        localStorage.removeItem('cnc_cached_cookie');
                        localStorage.removeItem('cnc_is_new_token');
                        localStorage.removeItem('cnc_last_bypass_time');
                    } catch (_) {}
                    cookieStr = await cookieString(provider);
                    const freshHeaders = Object.assign({}, headers, { Cookie: cookieStr, Referer: BASE_URL + '/home' });
                    res = await http_get(provider.baseUrl + provider.homePath, freshHeaders);
                }
                const root = parseJsonSafe(res.body, {});
                const out = {};
                (Array.isArray(root.post) ? root.post : []).forEach(function (group) {
                    const name = clean(group.cate) || 'Trending';
                    const ids = clean(group.ids).split(',').map(clean).filter(Boolean);
                    if (!ids.length) return;
                    out[name] = ids.map(function (id) {
                        return new MultimediaItem({
                            title: ' ',
                            url: JSON.stringify({ provider: provider.id, id: id }),
                            // Wrap Prime Video homepage posters in proxiedImage helper (one-line comment)
                            posterUrl: proxiedImage(provider.poster(id)),
                            type: 'movie'
                        });
                    });
                });
                return cb({ success: true, data: out });
            }

            let res = await http_get(provider.baseUrl + provider.homePath, headers);
            if (!isResponseValid(res.body, provider)) {
                logPlugin('BYPASS', 'IP change or token invalidation detected on home load. Clearing cache and triggering fresh bypass.');
                cachedCookie = '';
                isNewToken = false;
                lastBypassTime = 0;
                try {
                    localStorage.removeItem('cnc_cached_cookie');
                    localStorage.removeItem('cnc_is_new_token');
                    localStorage.removeItem('cnc_last_bypass_time');
                } catch (_) {}
                cookieStr = await cookieString(provider);
                const freshHeaders = Object.assign({}, headers, { Cookie: cookieStr });
                res = await http_get(provider.baseUrl + provider.homePath, freshHeaders);
            }
            const html = String(res.body || '');
            const data = parseTrayRows(html, provider);
            cb({ success: true, data: data });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const provider = cfg();
            const cookieStr = await cookieString(provider);
            const url = provider.baseUrl + provider.searchPath + '?s=' + encodeURIComponent(query) + '&t=' + unixTs();
            const referer = provider.id === 'NETFLIX' ? provider.baseUrl + '/tv/home' : BASE_URL + '/home';
            const res = await http_get(url, Object.assign({}, providerHeaders(provider), { Referer: referer, Cookie: cookieStr }));
            const data = parseJsonSafe(res.body, {});
            const list = (data.searchResult || []).map(function (item) {
                return new MultimediaItem({
                    title: clean(item.t) || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: clean(item.id) }),
                    posterUrl: proxiedImage(provider.poster(clean(item.id))),
                    type: 'movie'
                });
            });
            cb({ success: true, data: list });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function load(urlData, cb) {
        try {
            const payload = parseJsonSafe(urlData, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid payload' });

            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();
            const cookieStr = await cookieString(provider);
            const postUrl = provider.baseUrl + provider.postPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + unixTs();
            const referer = BASE_URL + '/tv/home';
            const res = await http_get(postUrl, Object.assign({}, providerHeaders(provider), { Referer: referer, Cookie: cookieStr }));
            const data = parseJsonSafe(res.body, {});

            const targetSeasonId = globalThis._targetSeasonId;
            const episodes = [];

            const seasonsList = [];
            // Force Season 1 as default and sort seasonsList ascending on initial load (one-line comment)
            if (Array.isArray(data.season)) {
                data.season.forEach(function (s, idx) {
                    if (s && s.id) {
                        seasonsList.push({
                            name: clean(s.name) || ('Season ' + (idx + 1)),
                            number: parseInt(clean(s.name).replace(/[^0-9]/g, '')) || (idx + 1),
                            id: clean(s.id)
                        });
                    }
                });
                seasonsList.sort(function (a, b) { return a.number - b.number; });
            }

            if (Array.isArray(data.episodes) && data.episodes.length > 0 && data.episodes[0]) {
                if (targetSeasonId) {
                    await fetchPagedEpisodes(provider, payload.id, targetSeasonId, 1, episodes, cookieStr);
                } else {
                    const defaultSeasonNum = parseInt(String(data.episodes[0].s || '').replace('S', ''), 10) || 1;
                    const season1 = seasonsList.find(function (s) { return s.number === 1; });
                    if (defaultSeasonNum !== 1 && season1) {
                        await fetchPagedEpisodes(provider, payload.id, season1.id, 1, episodes, cookieStr);
                    } else {
                        data.episodes.forEach(function (ep) {
                            episodes.push(new Episode({
                                name: clean(ep.t) || 'Episode',
                                season: defaultSeasonNum,
                                episode: parseInt(String(ep.ep || '').replace('E', ''), 10) || 1,
                                url: JSON.stringify({ provider: provider.id, kind: 'play', id: clean(ep.id), title: clean(ep.t) || clean(data.title) || 'Title' }),
                                posterUrl: proxiedImage(provider.episodePoster(clean(ep.id)))
                            }));
                        });
                        if (Number(data.nextPageShow || 0) === 1 && data.nextPageSeason) {
                            await fetchPagedEpisodes(provider, payload.id, data.nextPageSeason, 2, episodes, cookieStr);
                        }
                    }
                }
            } else {
                episodes.push(new Episode({
                    name: clean(data.title) || 'Watch',
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ provider: provider.id, kind: 'play', id: payload.id, title: clean(data.title) || 'Watch' }),
                    posterUrl: proxiedImage(provider.poster(payload.id))
                }));
            }

            cb({
                success: true,
                data: new MultimediaItem({
                    title: clean(data.title) || 'Title',
                    url: JSON.stringify({ provider: provider.id, id: payload.id }),
                    posterUrl: proxiedImage(provider.poster(payload.id)),
                    backgroundPosterUrl: proxiedImage(provider.background(payload.id)),
                    description: clean(data.desc),
                    type: (episodes.length > 1 || seasonsList.length > 0) ? 'tvseries' : 'movie',
                    year: parseInt(data.year, 10) || undefined,
                    // Pass cast and genre hints so the metadata resolver can disambiguate same-title shows (one-line comment)
                    cast: String(data.cast || '').split(',').map(function (n) { return new Actor({ name: clean(n) }); }).filter(function (a) { return a.name; }),
                    tags: String(data.genre || '').split(',').map(function (g) { return clean(g); }).filter(Boolean),
                    seasons: seasonsList.length > 0 ? seasonsList : undefined,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    const REAL_AUDIO_TRACKS = [
        ['ara', 'Arabic'], ['ces', 'Czech'], ['deu', 'German'], ['eng', 'English'],
        ['spa', 'Spanish'], ['spa', 'Spanish'], ['fra', 'French'], ['fra', 'French'],
        ['hin', 'Hindi'], ['hun', 'Hungarian'], ['ita', 'Italian'], ['jpn', 'Japanese'],
        ['kan', 'Kannada'], ['mal', 'Malayalam'], ['pol', 'Polish'], ['por', 'Portuguese'],
        ['tam', 'Tamil'], ['tel', 'Telugu'], ['tha', 'Thai'], ['tur', 'Turkish']
    ];

    async function buildRealPlaylist(provider, epId) {
        // Real frames and audio are open on s12, so generate the playlist client-side with no premium token (one-line comment)
        const cdn = 'https://s12.freecdn32z.top';
        const base = cdn + '/files/' + encodeURIComponent(epId);
        const refHeaders = { Referer: 'https://net52.cc/pv/', 'User-Agent': COMMON_HEADERS['User-Agent'] };
        let audioM3u8 = null;
        for (let i = 3; i < REAL_AUDIO_TRACKS.length + 3; i++) {
            const idx = i % REAL_AUDIO_TRACKS.length;
            const r = await http_get(base + '/a/' + idx + '/' + idx + '.m3u8', refHeaders);
            if (r.status === 200 && String(r.body).indexOf('#EXTM3U') === 0) { audioM3u8 = r.body; break; }
        }
        if (!audioM3u8) return '';
        let prefix = '';
        let audioDur = 0;
        const audioLines = String(audioM3u8).split('\n');
        for (let i = 0; i < audioLines.length; i++) {
            const line = audioLines[i].trim();
            if (line.indexOf('#EXTINF:') === 0) {
                const sec = parseFloat(line.substring(8).split(',')[0]);
                if (!isNaN(sec)) audioDur += sec;
            } else if (line && line[0] !== '#' && !prefix) {
                const m = line.match(/(\d+)_\d+\.js/);
                if (m) prefix = m[1];
            }
        }
        if (!prefix || audioDur <= 0) return '';
        const frameUrl = function (q, n) { return base + '/' + q + '/' + prefix + '_' + String(n).padStart(3, '0') + '.woff2'; };
        const probe = async function (q, n) {
            try { return (await http_get(frameUrl(q, n), refHeaders)).status === 200; }
            catch (_) { return false; }
        };
        let count = Math.ceil(audioDur / 3.0);
        // Real variants are exactly 3s per frame, so video count = ceil(audioDur / 3), verified on the cheapest quality (one-line comment)
        const probeQ = (await probe('720p', 0)) ? '720p' : '1080p';
        if (!(await probe(probeQ, count - 1)) || await probe(probeQ, count)) {
            for (let d = 1; d <= 8; d++) {
                if (!(await probe(probeQ, count - d))) { count -= d; break; }
                if (await probe(probeQ, count + d)) { count += d; break; }
            }
        }
        if (count < 1) return '';
        const buildVariant = function (q, bw, res) {
            let out = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:3\n#EXT-X-MEDIA-SEQUENCE:0\n';
            for (let n = 0; n < count; n++) out += '#EXTINF:3.0,\n' + frameUrl(q, n) + '\n';
            return out + '#EXT-X-ENDLIST\n';
        };
        const b64 = function (s) {
            try { return btoa(unescape(encodeURIComponent(s))); }
            catch (_) { return btoa(s); }
        };
        const storePlaylist = async function (content) {
            if (typeof globalThis.storeGeneratedPlaylist === 'function') {
                const token = await globalThis.storeGeneratedPlaylist(content);
                if (token && token.indexOf('gp') === 0) return 'magic_m3u8:' + token;
            }
            return 'magic_m3u8:' + b64(content);
        };
        const v1080 = (await probe('1080p', 0)) ? buildVariant('1080p', 1000000, '1920x1080') : '';
        const v720 = (await probe('720p', 0)) ? buildVariant('720p', 600000, '1280x720') : '';
        if (!v1080 && !v720) return '';
        let master = '#EXTM3U\n#EXT-X-VERSION:3\n';
        for (let i = 0; i < REAL_AUDIO_TRACKS.length; i++) {
            master += '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="' + REAL_AUDIO_TRACKS[i][0] + '",NAME="' + REAL_AUDIO_TRACKS[i][1] + '",DEFAULT=' + (i === 3 ? 'YES' : 'NO') + ',URI="' + base + '/a/' + i + '/' + i + '.m3u8"\n';
        }
        if (v1080) {
            master += '#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="aac",RESOLUTION=1920x1080,CLOSED-CAPTIONS=NONE\n';
            master += await storePlaylist(v1080) + '\n';
        }
        if (v720) {
            master += '#EXT-X-STREAM-INF:BANDWIDTH=600000,AUDIO="aac",DEFAULT=YES,RESOLUTION=1280x720,CLOSED-CAPTIONS=NONE\n';
            master += await storePlaylist(v720) + '\n';
        }
        master += '#EXT-X-ENDLIST\n';
        return await storePlaylist(master);
    }

    async function loadPrimeStreams(provider, payload) {
        const out = [];
        try {
            // Build a real playlist from the open s12 CDN data (no premium token needed) (one-line comment)
            const realMaster = await buildRealPlaylist(provider, payload.id);
            if (realMaster) {
                out.push(new StreamResult({
                    url: realMaster,
                    source: 'PrimeVideo [Real]',
                    type: 'hls',
                    headers: {
                        Referer: provider.playUrl + '/',
                        'User-Agent': COMMON_HEADERS['User-Agent']
                    }
                }));
                return out;
            }
        } catch (_) { /* fall back to playlist.php below */ }

        // Enforce new verified token for prime stream extraction to avoid playback 403 errors (one-line comment)
        const cookieStr = await cookieString(provider, true);
        const playlistUrl = provider.baseUrl + provider.playlistPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + encodeURIComponent(payload.title || '') + '&tm=' + unixTs();
        const res = await http_get(playlistUrl, Object.assign({}, COMMON_HEADERS, { Referer: provider.baseUrl + '/home', Cookie: cookieStr, 'X-Requested-With': 'XMLHttpRequest' }));
        const playlist = parseJsonSafe(res.body, []);
        (Array.isArray(playlist) ? playlist : []).forEach(function (item) {
            (Array.isArray(item.sources) ? item.sources : []).forEach(function (src, i) {
                let fullUrl = String(src.file || '').replace('/tv/', '/');
                if (!/^https?:\/\//i.test(fullUrl)) {
                    if (!fullUrl.startsWith('/')) fullUrl = '/' + fullUrl;
                    fullUrl = provider.playUrl + fullUrl;
                }
                out.push(new StreamResult({
                    url: fullUrl,
                    source: 'PrimeVideo [' + (clean(src.label) || ('S' + (i + 1))) + ']',
                    type: 'hls',
                    headers: {
                        Referer: provider.playUrl + '/',
                        Cookie: cookieStr,
                        'User-Agent': COMMON_HEADERS['User-Agent']
                    }
                }));
            });
        });
        return out;
    }

    async function loadMobilePlaylistStreams(provider, payload, playlistPath, ottOverride) {
        // Enforce new verified token for mobile stream playlist extraction to avoid playback 403 errors (one-line comment)
        const hash = await bypass(provider, true);
        const ott = ottOverride || provider.ott;
        let cookieStr = 't_hash_t=' + hash + '; ott=' + ott + '; hd=on';
        if (provider.studio) cookieStr += '; studio=' + provider.studio;
        const baseUrl = provider.playUrl;
        const playlistUrl = baseUrl + playlistPath + '?id=' + encodeURIComponent(payload.id) + '&t=' + encodeURIComponent(payload.title || '') + '&tm=' + unixTs();
        const res = await http_get(playlistUrl, Object.assign({}, providerHeaders(provider), {
            Referer: baseUrl + '/home',
            Cookie: cookieStr
        }));
        const playlist = parseJsonSafe(res.body, []);
        const out = [];

        (Array.isArray(playlist) ? playlist : []).forEach(function (item) {
            (Array.isArray(item.sources) ? item.sources : []).forEach(function (src, i) {
                const rawFile = clean(src.file);
                if (!rawFile) return;
                const finalUrl = baseUrl + '/' + rawFile.replace(/^\/+/, '');
                out.push(new StreamResult({
                    url: finalUrl,
                    source: clean(src.label) || ('Server ' + (i + 1)),
                    type: 'hls',
                    headers: {
                        Referer: baseUrl + '/home',
                        Cookie: cookieStr,
                        'User-Agent': (providerHeaders(provider) || {})['User-Agent'] || COMMON_HEADERS['User-Agent']
                    }
                }));
            });
        });

        return out;
    }

    async function loadUnifiedTvStream(provider, payload) {
        const apiBase = await resolveNewTvApiUrl();
        const ott = (provider.id === 'HOTSTAR' || provider.id === 'DISNEY PLUS') ? 'hs' : provider.ott;
        const apiHeaders = buildNewTvHeaders(ott, { Usertoken: '' });
        const res = await http_get(apiBase + '/newtv/player.php?id=' + payload.id, apiHeaders);
        const data = parseJsonSafe(res.body, {});
        if (!data.video_link) return [];

        // Streaming headers must be minimal — the API headers above include
        // Accept: application/json and Cache-Control: no-cache, which break
        // HLS segment fetches. We also wrap the CDN URL in MAGIC_PROXY_v2 so
        // the local proxy injects these headers on every segment request and
        // can normalize the CDN's broken Range-with-gzip responses.
        const streamHeaders = {
            'User-Agent': NEW_TV_BASE_HEADERS['User-Agent'],
            'Ott': ott
        };
        const proxyConfig = JSON.stringify({ url: data.video_link, headers: streamHeaders });
        const proxyUrl = 'MAGIC_PROXY_v2' + btoa(proxyConfig);

        return [new StreamResult({
            url: proxyUrl,
            source: provider.id + ' [NetMirror]',
            type: 'hls',
            headers: streamHeaders
        })];
    }

    async function loadStreams(dataStr, cb) {
        try {
            const payload = parseJsonSafe(dataStr, null);
            if (!payload || !payload.id) return cb({ success: false, errorCode: 'PARSE_ERROR', message: 'Invalid stream payload' });
            const provider = PROVIDERS[clean(payload.provider).toUpperCase()] || cfg();

            let results = [];
            try {
                // Try CS3 direct HLS playlist extraction first (one-line comment)
                if (provider.id === 'HOTSTAR' || provider.id === 'DISNEY PLUS') {
                    results = await loadMobilePlaylistStreams(provider, payload, '/mobile/hs/playlist.php', 'hs');
                } else if (provider.id === 'NETFLIX') {
                    results = await loadMobilePlaylistStreams(provider, payload, '/mobile/playlist.php');
                } else {
                    results = await loadPrimeStreams(provider, payload);
                }
            } catch (_) {
                results = [];
            }

            // Failsafe: Try unified TV player stream if direct playlists failed
            if (!results.length) {
                try {
                    results = await loadUnifiedTvStream(provider, payload);
                } catch (_) {
                    results = [];
                }
            }
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
