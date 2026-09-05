(function() {
    /**
     * @type {import('@skystream/sdk').Manifest}
     */
    // var manifest is injected at runtime

    const BASE_URL = manifest.baseUrl;
    const WEB_URL = "https://filmboom.top";

    function parseJsonSafe(text, fallback) {
        try { return JSON.parse(text); } catch (_) { return fallback; }
    }

    function cleanTitle(title) {
        return String(title || "").replace(/\[.*?\]/g, "").trim();
    }

    function typeFromSubject(subjectType) {
        return Number(subjectType) === 2 || Number(subjectType) === 7 ? "series" : "movie";
    }

    function qualityLabel(res) {
        const t = String(res || "");
        if (t.indexOf("2160") >= 0) return "4K";
        if (t.indexOf("1440") >= 0) return "1440p";
        if (t.indexOf("1080") >= 0) return "1080p";
        if (t.indexOf("720") >= 0) return "720p";
        if (t.indexOf("480") >= 0) return "480p";
        if (t.indexOf("360") >= 0) return "360p";
        return t ? (t + "p") : "HD";
    }

    let cachedToken = "";

    function buildHeaders(referer) {
        const headers = {
            "accept": "application/json, text/plain, */*",
            "origin": WEB_URL,
            "referer": referer || (WEB_URL + "/"),
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "x-client-info": JSON.stringify({ timezone: "Asia/Calcutta" }),
            "x-request-lang": "en",
            "x-vip-restrict": "0"
        };
        if (cachedToken) {
            headers["authorization"] = "Bearer " + cachedToken;
        }
        return headers;
    }

    async function requestJson(url, options) {
        const opts = options || {};
        const method = (opts.method || "GET").toUpperCase();
        const headers = opts.headers || {};
        try {
            const res = method === "POST"
                ? await http_post(url, headers, opts.body || "{}")
                : await http_get(url, headers);
            if (res && res.headers) {
                const xUser = res.headers["x-user"] || res.headers["X-User"];
                if (xUser) {
                    try {
                        const parsed = typeof xUser === "string" ? JSON.parse(xUser) : xUser;
                        if (parsed && parsed.token) cachedToken = parsed.token;
                    } catch (_) {}
                }
            }
            return parseJsonSafe(res && res.body ? res.body : "{}", {});
        } catch (_) {
            return {};
        }
    }

    function mapActorFromStaff(staff) {
        if (!staff || String(staff.staffType) !== "1") return null;
        const name = String(staff.name || "").trim();
        if (!name) return null;
        return new Actor({
            name: name,
            image: staff.avatarUrl || undefined,
            role: staff.character || undefined
        });
    }

    function extractRecommendations(data, fallbackType) {
        const candidates = [];
        const pools = [
            data && data.recommendations,
            data && data.recommendList,
            data && data.relatedSubjects,
            data && data.similarSubjects,
            data && data.titbits,
            data && data.subjects
        ];
        pools.forEach(function(pool) {
            if (Array.isArray(pool)) candidates.push.apply(candidates, pool);
        });
        const seen = {};
        const out = [];
        for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            if (!item) continue;
            const subjectId = item.subjectId || item.id || item.redirectId;
            const title = cleanTitle(item.title || item.name);
            if (!subjectId || !title) continue;
            const sid = String(subjectId);
            if (seen[sid]) continue;
            seen[sid] = true;
            const cover = item.cover && item.cover.url
                ? item.cover.url
                : (item.coverImage || item.poster || item.posterUrl || undefined);
            out.push(new MultimediaItem({
                title: title,
                url: JSON.stringify({ subjectId: sid, detailPath: item.detailPath || "", subjectType: item.subjectType || fallbackType || 1 }),
                posterUrl: cover,
                type: typeFromSubject(item.subjectType || fallbackType || 1),
                score: Number(item.imdbRatingValue || item.score) || undefined
            }));
        }
        return out;
    }

    function extractSubjectId(inputUrl) {
        const payload = parseJsonSafe(inputUrl, null);
        if (payload && payload.subjectId) return String(payload.subjectId);
        const text = String(inputUrl || "");
        const looseMatch = text.match(/subjectId\s*[:=]\s*"?([^",}\s]+)"?/i);
        if (looseMatch && looseMatch[1]) return looseMatch[1];
        const queryMatch = text.match(/[?&]subjectId=([^&]+)/i);
        if (queryMatch && queryMatch[1]) return decodeURIComponent(queryMatch[1]);
        return text.split("/").pop() || "";
    }

    async function getHome(cb) {
        try {
            const sections = {};

            const homePromise = (async function() {
                const endpoint = BASE_URL + "/wefeed-h5api-bff/home";
                const root = await requestJson(endpoint, { headers: buildHeaders(WEB_URL + "/") });
                const operatingList = (root && root.data && Array.isArray(root.data.operatingList)) ? root.data.operatingList : [];
                operatingList.forEach(function(item) {
                    if (!item || !Array.isArray(item.subjects) || !item.subjects.length) return;
                    let rawTitle = String(item.title || item.name || "").trim();
                    let sectionName = rawTitle.replace(/^[🔥🆓✨\s]+/, "").trim();
                    if (sectionName.toLowerCase().includes("trending")) sectionName = "Trending";
                    if (sectionName === "Cinema") sectionName = "Trending in Cinema";
                    if (sectionName === "Top Anime") sectionName = "Anime";
                    if (sectionName === "Best Asian Series") sectionName = "Asian Drama";
                    if (!sectionName) return;

                    const items = item.subjects.map(function(s) {
                        const title = cleanTitle(s.title);
                        const subjectId = s.subjectId ? String(s.subjectId) : "";
                        if (!title || !subjectId) return null;
                        return new MultimediaItem({
                            title: title,
                            url: JSON.stringify({ subjectId: subjectId, detailPath: s.detailPath || "", subjectType: s.subjectType || 1 }),
                            posterUrl: s.cover && s.cover.url ? s.cover.url : "",
                            type: typeFromSubject(s.subjectType),
                            score: Number(s.imdbRatingValue) || undefined
                        });
                    }).filter(Boolean);

                    if (items.length > 0) sections[sectionName] = items;
                });
            })();

            const FILTER_SECTIONS = [
                ["Movies", { channelId: "1" }],
                ["Series", { channelId: "2" }],
                ["Indian (Movies)", { channelId: "1", country: "India" }],
                ["Indian (Series)", { channelId: "2", country: "India" }],
                ["USA (Movies)", { channelId: "1", country: "United States" }],
                ["USA (Series)", { channelId: "2", country: "United States" }],
                ["Korean Drama", { channelId: "2", country: "Korea" }],
                ["Action (Movies)", { channelId: "1", genre: "Action" }],
                ["Crime (Movies)", { channelId: "1", genre: "Crime" }],
                ["Comedy (Movies)", { channelId: "1", genre: "Comedy" }],
                ["Romance (Movies)", { channelId: "1", genre: "Romance" }],
                ["Crime (Series)", { channelId: "2", genre: "Crime" }],
                ["Comedy (Series)", { channelId: "2", genre: "Comedy" }],
                ["Romance (Series)", { channelId: "2", genre: "Romance" }]
            ];

            const filterPromises = FILTER_SECTIONS.map(function(pair) {
                const name = pair[0];
                const params = pair[1];
                const payload = JSON.stringify(Object.assign({
                    page: 1,
                    perPage: 15,
                    classify: "All",
                    country: "All",
                    genre: "All",
                    sort: "ForYou",
                    year: "All"
                }, params));

                return requestJson(BASE_URL + "/wefeed-h5api-bff/subject/filter", {
                    method: "POST",
                    headers: Object.assign(buildHeaders(WEB_URL + "/"), { "content-type": "application/json" }),
                    body: payload
                }).then(function(root) {
                    const rawItems = (root && root.data && (root.data.items || root.data.subjects || root.data.list)) || [];
                    const items = rawItems.map(function(s) {
                        const title = cleanTitle(s.title);
                        const subjectId = s.subjectId ? String(s.subjectId) : "";
                        if (!title || !subjectId) return null;
                        return new MultimediaItem({
                            title: title,
                            url: JSON.stringify({ subjectId: subjectId, detailPath: s.detailPath || "", subjectType: s.subjectType || 1 }),
                            posterUrl: s.cover && s.cover.url ? s.cover.url : "",
                            type: typeFromSubject(s.subjectType),
                            score: Number(s.imdbRatingValue) || undefined
                        });
                    }).filter(Boolean);
                    if (items.length > 0) sections[name] = items;
                }).catch(function() {});
            });

            await Promise.all([homePromise, ...filterPromises]);

            const SECTION_ORDER = [
                "Trending", "Trending in Cinema", "Bollywood", "South Indian", "Hollywood",
                "Movies", "Series", "Anime", "Asian Drama", "Korean Drama", "Western TV",
                "Indian Drama", "Indian (Movies)", "Indian (Series)", "USA (Movies)", "USA (Series)",
                "Action (Movies)", "Comedy (Movies)", "Crime (Movies)", "Romance (Movies)",
                "Crime (Series)", "Comedy (Series)", "Romance (Series)", "Free Now!", "Hot Short TV", "Coming Soon"
            ];

            const orderedSections = {};
            SECTION_ORDER.forEach(function(k) {
                if (sections[k] && sections[k].length) orderedSections[k] = sections[k];
            });
            Object.keys(sections).forEach(function(k) {
                if (!orderedSections[k] && sections[k] && sections[k].length) orderedSections[k] = sections[k];
            });

            cb({ success: true, data: orderedSections });
        } catch (e) {
            cb({ success: false, errorCode: "HOME_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function search(query, cb) {
        try {
            if (!cachedToken) {
                await requestJson(BASE_URL + "/wefeed-h5api-bff/home", { headers: buildHeaders(WEB_URL + "/") });
            }
            const endpoint = BASE_URL + "/wefeed-h5api-bff/subject/search";
            const payload = JSON.stringify({ keyword: String(query || ""), page: 1, perPage: 20, subjectType: 0 });
            const root = await requestJson(endpoint, {
                method: "POST",
                headers: Object.assign(buildHeaders(WEB_URL + "/"), {
                    "content-type": "application/json"
                }),
                body: payload
            });
            const items = (((root || {}).data || {}).items) || (((root || {}).data || {}).subjects) || (((root || {}).data || {}).list) || [];
            const searchList = [];
            const seen = {};
            items.forEach(function(s) {
                if (!s || !s.subjectId) return;
                const sid = String(s.subjectId);
                if (seen[sid]) return;
                seen[sid] = true;
                searchList.push(new MultimediaItem({
                    title: cleanTitle(s.title || "Unknown"),
                    url: JSON.stringify({ subjectId: sid, detailPath: s.detailPath || "", subjectType: s.subjectType || 1 }),
                    posterUrl: s.cover && s.cover.url ? s.cover.url : "",
                    type: typeFromSubject(s.subjectType),
                    score: Number(s.imdbRatingValue) || undefined
                }));
            });
            cb({ success: true, data: searchList });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function load(url, cb) {
        try {
            const payload = parseJsonSafe(url, {});
            const subjectId = payload.subjectId ? String(payload.subjectId) : extractSubjectId(url);
            const detailPath = payload.detailPath ? String(payload.detailPath) : "";
            if (!subjectId && !detailPath) return cb({ success: false, errorCode: "INVALID_ID", message: "Missing subject id" });

            const param = detailPath ? ("detailPath=" + encodeURIComponent(detailPath)) : ("subjectId=" + encodeURIComponent(subjectId));
            const endpoint = BASE_URL + "/wefeed-h5api-bff/detail?" + param;
            const root = await requestJson(endpoint, { headers: buildHeaders(WEB_URL + "/") });
            const data = (root && root.data) || null;
            if (!data || !data.subject) {
                return cb({ success: false, errorCode: "NOT_FOUND", message: "Detail not found" });
            }
            const s = data.subject;
            const sid = String(s.subjectId || subjectId);
            const dp = String(s.detailPath || detailPath);
            const title = cleanTitle(s.title || "Unknown");
            const poster = s.cover && s.cover.url ? s.cover.url : "";
            const description = s.description || "";
            const year = /^\d{4}/.test(String(s.releaseDate || "")) ? Number(String(s.releaseDate).slice(0, 4)) : undefined;
            const type = typeFromSubject(s.subjectType || payload.subjectType || 1);
            const cast = (Array.isArray(s.staffList) ? s.staffList : []).map(mapActorFromStaff).filter(Boolean);
            const recommendations = extractRecommendations(data, s.subjectType || 1);

            if (type === "movie") {
                const streamPayload = JSON.stringify({ subjectId: sid, detailPath: dp, se: 0, ep: 0 });
                return cb({ success: true, data: new MultimediaItem({
                    title: title,
                    url: streamPayload,
                    posterUrl: poster,
                    description: description,
                    type: "movie",
                    year: year,
                    cast: cast,
                    recommendations: recommendations,
                    episodes: [new Episode({ name: "Full Movie", season: 1, episode: 1, url: streamPayload, posterUrl: poster })]
                }) });
            }

            const episodes = [];
            const seasons = (data.resource && Array.isArray(data.resource.seasons)) ? data.resource.seasons : [];
            seasons.forEach(function(seObj) {
                const sn = Number(seObj && seObj.se ? seObj.se : 1) || 1;
                const maxEp = Number(seObj && seObj.maxEp ? seObj.maxEp : 1) || 1;
                for (let ep = 1; ep <= maxEp; ep++) {
                    episodes.push(new Episode({
                        name: "S" + sn + "E" + ep,
                        season: sn,
                        episode: ep,
                        url: JSON.stringify({ subjectId: sid, detailPath: dp, se: sn, ep: ep }),
                        posterUrl: poster
                    }));
                }
            });

            if (!episodes.length) {
                episodes.push(new Episode({
                    name: "Episode 1",
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ subjectId: sid, detailPath: dp, se: 1, ep: 1 }),
                    posterUrl: poster
                }));
            }

            cb({ success: true, data: new MultimediaItem({
                title: title,
                url: url,
                posterUrl: poster,
                description: description,
                type: "series",
                year: year,
                cast: cast,
                recommendations: recommendations,
                episodes: episodes
            }) });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    async function loadStreams(url, cb) {
        try {
            const payload = parseJsonSafe(url, {});
            let subjectId = payload.subjectId ? String(payload.subjectId) : extractSubjectId(url);
            let detailPath = payload.detailPath ? String(payload.detailPath) : "";
            const se = Number(payload.se || 0) || 0;
            const ep = Number(payload.ep || 0) || 0;
            if (!subjectId && !detailPath) return cb({ success: false, errorCode: "INVALID_ID", message: "Missing subject id" });

            let dubs = [];
            const detailParam = detailPath ? ("detailPath=" + encodeURIComponent(detailPath)) : ("subjectId=" + encodeURIComponent(subjectId));
            const detailRoot = await requestJson(BASE_URL + "/wefeed-h5api-bff/detail?" + detailParam, { headers: buildHeaders(WEB_URL + "/") });
            const s = (detailRoot && detailRoot.data && detailRoot.data.subject) || {};
            if (!detailPath && s.detailPath) detailPath = s.detailPath;
            if (!subjectId && s.subjectId) subjectId = String(s.subjectId);
            if (Array.isArray(s.dubs)) dubs = s.dubs;

            const sources = [{ subjectId: subjectId, detailPath: detailPath, name: "Original Audio" }];
            dubs.forEach(function(d) {
                if (d && d.subjectId && String(d.subjectId) !== subjectId && d.detailPath) {
                    sources.push({ subjectId: String(d.subjectId), detailPath: String(d.detailPath), name: String(d.lanName || "Dub") });
                }
            });

            const results = [];
            const seenUrls = {};
            const querySources = sources.slice(0, 4);

            await Promise.all(querySources.map(async function(src) {
                const playUrl = BASE_URL + "/wefeed-h5api-bff/subject/play?subjectId=" + encodeURIComponent(src.subjectId)
                    + "&se=" + se + "&ep=" + ep
                    + "&detailPath=" + encodeURIComponent(src.detailPath)
                    + "&streamSignType=0&supportCodecs%5Bh264%5D=1&supportCodecs%5Bhevc%5D=1";

                const playHeaders = Object.assign(buildHeaders(WEB_URL + "/spa/videoPlayPage/movies/" + src.detailPath + "?id=" + src.subjectId + "&lang=en"));
                const playRoot = await requestJson(playUrl, { headers: playHeaders });
                const streams = (((playRoot || {}).data || {}).streams) || [];

                await Promise.all(streams.map(async function(st) {
                    if (!st || !st.url || seenUrls[st.url]) return;
                    seenUrls[st.url] = true;

                    let subs = [];
                    if (st.id) {
                        const capUrl = BASE_URL + "/wefeed-h5api-bff/subject/caption?format=" + (st.format || "MP4")
                            + "&id=" + encodeURIComponent(st.id)
                            + "&subjectId=" + encodeURIComponent(src.subjectId)
                            + "&detailPath=" + encodeURIComponent(src.detailPath);
                        const capRoot = await requestJson(capUrl, { headers: buildHeaders(WEB_URL + "/") });
                        const captions = (((capRoot || {}).data || {}).captions) || [];
                        subs = captions.map(function(c) {
                            return {
                                url: c.url,
                                file: c.url,
                                label: c.lanName || c.lan || "Unknown",
                                lang: c.lan || "en"
                            };
                        });
                    }

                    results.push(new StreamResult({
                        url: String(st.url),
                        source: "MovieBox " + src.name + " " + qualityLabel(st.resolutions),
                        headers: { "Referer": WEB_URL + "/" },
                        subtitles: subs.length ? subs : undefined
                    }));
                }));
            }));

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: String(e && e.message ? e.message : e) });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
