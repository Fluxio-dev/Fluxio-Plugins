(function () {
    /**
     * AniVortex Provider Plugin for Fluxio
     * Implements client-side ECDSA P-256 handshake & request signing
     */

    const BASE_URL = (typeof manifest !== 'undefined' && manifest && manifest.baseUrl)
        ? manifest.baseUrl
        : 'https://api.anivortex.in';

    // Polyfills for host-injected constructors
    const StreamResult = (typeof globalThis.StreamResult === 'function') ? globalThis.StreamResult : function (t) { return t; };
    const MultimediaItem = (typeof globalThis.MultimediaItem === 'function') ? globalThis.MultimediaItem : function (t) { return t; };
    const Episode = (typeof globalThis.Episode === 'function') ? globalThis.Episode : function (t) { return t; };
    const Actor = (typeof globalThis.Actor === 'function') ? globalThis.Actor : function (t) { return t; };

    // Crypto reference
    const subtle = (globalThis.crypto && globalThis.crypto.subtle)
        || (typeof window !== 'undefined' && window.crypto && window.crypto.subtle);

    // OID Byte Constants for NIST P-256 ECDSA X.509
    const ECDSA_WITH_SHA256 = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]); // 1.2.840.10045.4.3.2
    const ID_EC_PUBLIC_KEY  = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01]);       // 1.2.840.10045.2.1
    const PRIME256V1        = new Uint8Array([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]); // 1.2.840.10045.3.1.7

    const PREF_INSTALL_ID = 'anivortex_install_id';
    const PREF_KEY_ID = 'anivortex_key_id';
    const PREF_JWK = 'anivortex_priv_jwk';

    let inMemoryAuth = null;
    let authPromise = null;

    // ── Safe Helpers ──────────────────────────────────────────────────────────
    function parseJsonSafe(text, fallback) {
        try { return JSON.parse(text); } catch (_) { return fallback; }
    }

    function log(tag, msg) {
        if (typeof logPlugin === 'function') {
            logPlugin(tag, msg);
        } else if (typeof console !== 'undefined' && console.log) {
            console.log('[AniVortex::' + tag + '] ' + msg);
        }
    }

    async function getPref(k) {
        if (typeof getPreference === 'function') {
            try { return await getPreference(k); } catch (_) {}
        }
        try { return localStorage.getItem('fluxio_pref_' + k); } catch (_) { return null; }
    }

    async function setPref(k, v) {
        if (typeof setPreference === 'function') {
            try { await setPreference(k, v); } catch (_) {}
        }
        try { localStorage.setItem('fluxio_pref_' + k, v); } catch (_) {}
    }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function uint8ArrayToBase64(bytes) {
        let binary = '';
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    function b64UrlNoPad(bytes) {
        return uint8ArrayToBase64(bytes)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    function decodeB64OrB64Url(str) {
        let std = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
        while (std.length % 4 !== 0) std += '=';
        const binary = atob(std);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    async function sha256Hex(bytes) {
        const hashBuffer = await subtle.digest('SHA-256', bytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    // ── ASN.1 DER Construction Helpers ───────────────────────────────────────
    function encodeDerLength(len) {
        if (len < 128) return new Uint8Array([len]);
        const bytes = [];
        let temp = len;
        while (temp > 0) {
            bytes.unshift(temp & 0xff);
            temp >>= 8;
        }
        return new Uint8Array([0x80 | bytes.length, ...bytes]);
    }

    function derSequence(items) {
        const totalLen = items.reduce(function (sum, it) { return sum + it.length; }, 0);
        const lenBytes = encodeDerLength(totalLen);
        const buf = new Uint8Array(1 + lenBytes.length + totalLen);
        buf[0] = 0x30;
        buf.set(lenBytes, 1);
        let offset = 1 + lenBytes.length;
        for (let i = 0; i < items.length; i++) {
            buf.set(items[i], offset);
            offset += items[i].length;
        }
        return buf;
    }

    function derSet(item) {
        const lenBytes = encodeDerLength(item.length);
        const buf = new Uint8Array(1 + lenBytes.length + item.length);
        buf[0] = 0x31;
        buf.set(lenBytes, 1);
        buf.set(item, 1 + lenBytes.length);
        return buf;
    }

    function derOid(oidBytes) {
        const lenBytes = encodeDerLength(oidBytes.length);
        const buf = new Uint8Array(1 + lenBytes.length + oidBytes.length);
        buf[0] = 0x06;
        buf.set(lenBytes, 1);
        buf.set(oidBytes, 1 + lenBytes.length);
        return buf;
    }

    function derBitString(bytes) {
        const lenBytes = encodeDerLength(bytes.length + 1);
        const buf = new Uint8Array(1 + lenBytes.length + 1 + bytes.length);
        buf[0] = 0x03;
        buf.set(lenBytes, 1);
        buf[1 + lenBytes.length] = 0x00; // 0 unused bits
        buf.set(bytes, 2 + lenBytes.length);
        return buf;
    }

    function derInteger(intBytes) {
        let i = 0;
        while (i < intBytes.length && intBytes[i] === 0) i++;
        let trimmed = intBytes.slice(i);
        if (trimmed.length === 0) trimmed = new Uint8Array([0]);
        let finalBytes = trimmed;
        if (trimmed[0] & 0x80) {
            finalBytes = new Uint8Array(trimmed.length + 1);
            finalBytes[0] = 0;
            finalBytes.set(trimmed, 1);
        }
        const lenBytes = encodeDerLength(finalBytes.length);
        const buf = new Uint8Array(1 + lenBytes.length + finalBytes.length);
        buf[0] = 0x02;
        buf.set(lenBytes, 1);
        buf.set(finalBytes, 1 + lenBytes.length);
        return buf;
    }

    function derExplicitContextZero(content) {
        const lenBytes = encodeDerLength(content.length);
        const buf = new Uint8Array(1 + lenBytes.length + content.length);
        buf[0] = 0xa0; // context tag [0]
        buf.set(lenBytes, 1);
        buf.set(content, 1 + lenBytes.length);
        return buf;
    }

    function derUtf8String(str) {
        const strBytes = new TextEncoder().encode(str);
        const lenBytes = encodeDerLength(strBytes.length);
        const buf = new Uint8Array(1 + lenBytes.length + strBytes.length);
        buf[0] = 0x0c; // UTF8String
        buf.set(lenBytes, 1);
        buf.set(strBytes, 1 + lenBytes.length);
        return buf;
    }

    function derUtcTime(timeStr) {
        const bytes = new TextEncoder().encode(timeStr);
        const lenBytes = encodeDerLength(bytes.length);
        const buf = new Uint8Array(1 + lenBytes.length + bytes.length);
        buf[0] = 0x17; // UTCTime
        buf.set(lenBytes, 1);
        buf.set(bytes, 1 + lenBytes.length);
        return buf;
    }

    function formatUtcTime(date) {
        const pad = function (n) { return String(n).padStart(2, '0'); };
        const yy = pad(date.getUTCFullYear() % 100);
        const MM = pad(date.getUTCMonth() + 1);
        const dd = pad(date.getUTCDate());
        const hh = pad(date.getUTCHours());
        const mm = pad(date.getUTCMinutes());
        const ss = pad(date.getUTCSeconds());
        return yy + MM + dd + hh + mm + ss + 'Z';
    }

    function derCnName() {
        const cnOid = new Uint8Array([0x55, 0x04, 0x03]); // 2.5.4.3
        const cnVal = derUtf8String('Android Keystore Key');
        const atv = derSequence([derOid(cnOid), cnVal]);
        return derSequence([derSet(atv)]);
    }

    // Convert Web Crypto IEEE P1363 (64 bytes: r || s) to ASN.1 DER signature
    function rawP1363ToDer(rawSig) {
        const r = rawSig.slice(0, 32);
        const s = rawSig.slice(32, 64);
        function encodeInt(bytes) {
            let i = 0;
            while (i < bytes.length && bytes[i] === 0) i++;
            let trimmed = bytes.slice(i);
            if (trimmed.length === 0) trimmed = new Uint8Array([0]);
            if (trimmed[0] & 0x80) {
                const res = new Uint8Array(trimmed.length + 1);
                res[0] = 0;
                res.set(trimmed, 1);
                return res;
            }
            return trimmed;
        }
        const rEnc = encodeInt(r);
        const sEnc = encodeInt(s);
        const len = 2 + rEnc.length + 2 + sEnc.length;
        const der = new Uint8Array(2 + len);
        der[0] = 0x30;
        der[1] = len;
        der[2] = 0x02;
        der[3] = rEnc.length;
        der.set(rEnc, 4);
        const sOffset = 4 + rEnc.length;
        der[sOffset] = 0x02;
        der[sOffset + 1] = sEnc.length;
        der.set(sEnc, sOffset + 2);
        return der;
    }

    // Build self-signed DER leaf X.509 certificate matching Android hardware keystore signature
    async function buildLeafCertificate(keyPair) {
        const rawPub = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey)); // 65 bytes uncompressed point
        const serialBytes = new Uint8Array(16);
        (globalThis.crypto || window.crypto).getRandomValues(serialBytes);

        const version = derExplicitContextZero(derInteger(new Uint8Array([0x02]))); // v3
        const serial = derInteger(serialBytes);
        const sigAlg = derSequence([derOid(ECDSA_WITH_SHA256)]);
        const issuer = derCnName();
        const notBefore = derUtcTime(formatUtcTime(new Date(Date.now() - 24 * 3600 * 1000)));
        const notAfter = derUtcTime(formatUtcTime(new Date(Date.now() + 10 * 365 * 24 * 3600 * 1000)));
        const validity = derSequence([notBefore, notAfter]);
        const subject = derCnName();
        const spkiAlg = derSequence([derOid(ID_EC_PUBLIC_KEY), derOid(PRIME256V1)]);
        const spki = derSequence([spkiAlg, derBitString(rawPub)]);

        const tbs = derSequence([version, serial, sigAlg, issuer, validity, subject, spki]);

        const rawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, tbs));
        const certSig = rawP1363ToDer(rawSig);

        return derSequence([tbs, sigAlg, derBitString(certSig)]);
    }

    // ── Authentication & Registration Flow ───────────────────────────────────
    async function ensureAuth(forceRefresh) {
        if (inMemoryAuth && !forceRefresh) return inMemoryAuth;
        if (authPromise) return authPromise;

        authPromise = (async function () {
            try {
                const savedInstallId = await getPref(PREF_INSTALL_ID);
                const savedKeyId = await getPref(PREF_KEY_ID);
                const savedJwkStr = await getPref(PREF_JWK);

                if (!forceRefresh && savedInstallId && savedKeyId && savedJwkStr) {
                    try {
                        const jwk = JSON.parse(savedJwkStr);
                        const privateKey = await subtle.importKey(
                            'jwk',
                            jwk,
                            { name: 'ECDSA', namedCurve: 'P-256' },
                            true,
                            ['sign']
                        );
                        inMemoryAuth = {
                            installation_id: savedInstallId,
                            key_id: savedKeyId,
                            privateKey: privateKey
                        };
                        log('AUTH', 'Reused persistent credentials: ' + savedInstallId);
                        return inMemoryAuth;
                    } catch (e) {
                        log('AUTH', 'Saved key import failed, re-registering: ' + e);
                    }
                }

                log('AUTH', 'Initiating fresh registration handshake...');

                // Step 1: Challenge
                const challengePayload = JSON.stringify({
                    platform: 'android',
                    package_name: 'app.anivortex.mobile',
                    version_name: '5.0.1',
                    version_code: 503
                });

                const chalHeaders = {
                    'user-agent': 'Dart/3.10 (dart:io)',
                    'content-type': 'application/json',
                    'accept': 'application/json',
                    'x-raw-content-type': 'true'
                };

                const chalRes = (typeof http_post === 'function')
                    ? await http_post(BASE_URL + '/api/v1/install/challenge', chalHeaders, challengePayload)
                    : await (await fetch(BASE_URL + '/api/v1/install/challenge', { method: 'POST', headers: chalHeaders, body: challengePayload })).json();

                const chalData = (typeof chalRes.body === 'string') ? parseJsonSafe(chalRes.body, null) : chalRes;
                if (!chalData || !chalData.challenge_id || !chalData.challenge) {
                    throw new Error('Challenge request failed: ' + JSON.stringify(chalRes));
                }

                // Step 2: Generate P-256 Keypair & Leaf Cert
                const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
                const certDer = await buildLeafCertificate(keyPair);
                const certB64 = uint8ArrayToBase64(certDer);

                const chalBytes = decodeB64OrB64Url(chalData.challenge);
                const chalHashBytes = new Uint8Array(await subtle.digest('SHA-256', chalBytes));
                const chalHashB64Url = b64UrlNoPad(chalHashBytes);

                const canonicalProof = 'ANIVORTEX-INSTALL-REGISTER-V1\n' + chalData.challenge_id + '\n' + chalHashB64Url;
                const proofRawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, new TextEncoder().encode(canonicalProof)));
                const proofDerSig = rawP1363ToDer(proofRawSig);
                const proofSigB64Url = b64UrlNoPad(proofDerSig);

                // Step 3: Register
                const regPayload = JSON.stringify({
                    challenge_id: chalData.challenge_id,
                    certificate_chain: [certB64, certB64],
                    proof_signature: proofSigB64Url
                });

                const regRes = (typeof http_post === 'function')
                    ? await http_post(BASE_URL + '/api/v1/install/register', chalHeaders, regPayload)
                    : await (await fetch(BASE_URL + '/api/v1/install/register', { method: 'POST', headers: chalHeaders, body: regPayload })).json();

                const regData = (typeof regRes.body === 'string') ? parseJsonSafe(regRes.body, null) : regRes;
                if (!regData || !regData.installation_id || !regData.key_id) {
                    throw new Error('Registration failed: ' + (regRes.body || JSON.stringify(regRes)));
                }

                // Export and save JWK
                const exportedJwk = await subtle.exportKey('jwk', keyPair.privateKey);
                await setPref(PREF_INSTALL_ID, regData.installation_id);
                await setPref(PREF_KEY_ID, regData.key_id);
                await setPref(PREF_JWK, JSON.stringify(exportedJwk));

                inMemoryAuth = {
                    installation_id: regData.installation_id,
                    key_id: regData.key_id,
                    privateKey: keyPair.privateKey
                };

                log('AUTH', 'Successfully registered new installation: ' + regData.installation_id);
                return inMemoryAuth;
            } finally {
                authPromise = null;
            }
        })();

        return authPromise;
    }

    // ── Canonical Request Signing & Execution ────────────────────────────────
    async function signedApiRequest(method, path, queryParams, bodyObj, retryOnAuthFail) {
        const auth = await ensureAuth(false);
        const upperMethod = String(method || 'GET').toUpperCase();

        // Sort query params alphabetically by key
        let sortedQuery = '';
        if (queryParams && typeof queryParams === 'object') {
            const keys = Object.keys(queryParams).sort();
            const pairs = [];
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                const v = queryParams[k];
                if (v !== undefined && v !== null) {
                    pairs.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
                }
            }
            sortedQuery = pairs.join('&');
        }

        const bodyStr = bodyObj ? (typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj)) : '';
        const bodySha256 = bodyStr.length > 0
            ? await sha256Hex(new TextEncoder().encode(bodyStr))
            : 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const requestId = generateUUID();

        // 9-line Canonical Message
        const canonical = [
            'ANIVORTEX-SIGNED-REQUEST-V1',
            auth.installation_id,
            auth.key_id,
            timestamp,
            requestId,
            upperMethod,
            path,
            sortedQuery,
            bodySha256
        ].join('\n');

        const rawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, auth.privateKey, new TextEncoder().encode(canonical)));
        const derSig = rawP1363ToDer(rawSig);
        const sigB64Url = b64UrlNoPad(derSig);

        const headers = {
            'user-agent': 'Dart/3.10 (dart:io)',
            'accept': 'application/json',
            'x-anivortex-installation-id': auth.installation_id,
            'x-anivortex-key-id': auth.key_id,
            'x-anivortex-timestamp': timestamp,
            'x-anivortex-request-id': requestId,
            'x-anivortex-signature': sigB64Url
        };

        if (upperMethod === 'POST') {
            headers['content-type'] = 'application/json';
            headers['x-raw-content-type'] = 'true';
        }

        const fullUrl = BASE_URL + path + (sortedQuery ? ('?' + sortedQuery) : '');

        let res;
        if (upperMethod === 'POST') {
            res = (typeof http_post === 'function')
                ? await http_post(fullUrl, headers, bodyStr)
                : await fetch(fullUrl, { method: 'POST', headers, body: bodyStr });
        } else {
            res = (typeof http_get === 'function')
                ? await http_get(fullUrl, headers)
                : await fetch(fullUrl, { method: 'GET', headers });
        }

        const status = res.status;
        const text = (typeof res.body === 'string') ? res.body : (await res.text());

        // Self-heal on expired/invalid installation signature
        if ((status === 401 || status === 403) && !retryOnAuthFail) {
            log('AUTH', 'API returned ' + status + ', invalidating credentials and retrying once...');
            await setPref(PREF_INSTALL_ID, '');
            await setPref(PREF_KEY_ID, '');
            await setPref(PREF_JWK, '');
            inMemoryAuth = null;
            await ensureAuth(true);
            return signedApiRequest(method, path, queryParams, bodyObj, true);
        }

        return parseJsonSafe(text, null);
    }

    // Exposed providers for Fluxio runtime (matched via /id:\s*['\"]([A-Z\s]{3,})['\"]/g)
    const PROVIDERS = [
        { id: 'ALL', name: 'All Content' },
        { id: 'MOVIES', name: 'Movies & Series' },
        { id: 'ANIME', name: 'Anime' }
    ];
    globalThis.PROVIDERS = PROVIDERS;

    function parseCatalogSections(catalogRes, renameMap) {
        const sections = {};
        if (!catalogRes || !Array.isArray(catalogRes.sections)) return sections;

        for (let i = 0; i < catalogRes.sections.length; i++) {
            const section = catalogRes.sections[i];
            if (!section) continue;
            let sectionTitle = String(section.title || section.name || section.key || ('Section ' + (i + 1))).trim();
            if (renameMap && renameMap[sectionTitle]) sectionTitle = renameMap[sectionTitle];

            const rawItems = Array.isArray(section.items) ? section.items : [];
            const items = [];

            for (let j = 0; j < rawItems.length; j++) {
                const item = rawItems[j];
                if (!item || !item.id) continue;

                items.push(new MultimediaItem({
                    title: item.title || 'Untitled',
                    url: JSON.stringify({ id: item.id }),
                    posterUrl: item.poster_url || '',
                    backgroundPosterUrl: item.backdrop_url || item.poster_url || '',
                    type: item.content_type === 'movie' ? 'movie' : 'series',
                    year: item.release_year || undefined,
                    score: item.rating ? Number(item.rating) : undefined
                }));
            }

            if (items.length > 0) {
                let finalTitle = sectionTitle;
                let counter = 1;
                while (sections[finalTitle]) {
                    finalTitle = sectionTitle + ' (' + (++counter) + ')';
                }
                sections[finalTitle] = items;
            }
        }
        return sections;
    }

    // ── Fluxio Plugin API Exports ────────────────────────────────────────────

    async function getHome(cb) {
        try {
            const rawProvider = (typeof manifest !== 'undefined' && manifest && manifest.providerId)
                ? String(manifest.providerId).toLowerCase().trim()
                : 'all';

            if (rawProvider === 'anime') {
                const animeRes = await signedApiRequest('GET', '/api/v1/catalog/home', { catalog: 'anime' });
                const sections = parseCatalogSections(animeRes, {});
                return cb({ success: true, data: sections });
            }

            if (rawProvider === 'movies' || rawProvider === 'movie_series') {
                const moviesRes = await signedApiRequest('GET', '/api/v1/catalog/home', { catalog: 'movie_series' });
                const sections = parseCatalogSections(moviesRes, { 'Featured Now': 'Featured Movies & Series' });
                return cb({ success: true, data: sections });
            }

            // Default: 'all' -> Parallel fetch of both Movies/Series & Anime for a rich diverse homeview
            const [moviesRes, animeRes] = await Promise.all([
                signedApiRequest('GET', '/api/v1/catalog/home', { catalog: 'movie_series' }),
                signedApiRequest('GET', '/api/v1/catalog/home', { catalog: 'anime' })
            ]);

            const movieSections = parseCatalogSections(moviesRes, { 'Featured Now': 'Featured Movies & Series' });
            const animeSections = parseCatalogSections(animeRes, {});

            const priority = [
                'Featured Movies & Series',
                'Featured Anime',
                'Recently Added Movies',
                'Recently Added Series',
                'Latest Anime',
                'Top 10 Rated Movies on IMDb',
                'Top 10 Rated Series on IMDb',
                'Top Rated Anime',
                'Most Watched on AniVortex',
                'Popular This Season',
                'Top Series This Week',
                'Top Movies This Week',
                'Action Movies',
                'Action Anime',
                'Popular TV Series',
                'Fantasy Anime',
                'Romantic Movies',
                'Romance Anime',
                'Mystery and Thriller Movies',
                'Adventure Anime',
                'Horror Movies',
                'Comedy Movies',
                'Classic Anime'
            ];

            const combined = {};
            const allAvailable = Object.assign({}, movieSections, animeSections);

            for (let p = 0; p < priority.length; p++) {
                const key = priority[p];
                if (allAvailable[key]) {
                    combined[key] = allAvailable[key];
                    delete allAvailable[key];
                }
            }

            for (const key in allAvailable) {
                combined[key] = allAvailable[key];
            }

            cb({ success: true, data: combined });
        } catch (e) {
            cb({ success: false, errorCode: 'HOME_ERROR', message: String(e && e.message || e) });
        }
    }

    async function search(query, cb) {
        try {
            const q = String(query || '').trim();
            if (!q) return cb({ success: true, data: [] });

            const res = await signedApiRequest('GET', '/api/v1/search', { q: q });
            const items = res ? (Array.isArray(res) ? res : (Array.isArray(res.items) ? res.items : [])) : [];

            const results = items.map(function (item) {
                return new MultimediaItem({
                    title: item.title || 'Untitled',
                    url: JSON.stringify({ id: item.id }),
                    posterUrl: item.poster_url || '',
                    backgroundPosterUrl: item.backdrop_url || item.poster_url || '',
                    type: item.content_type === 'movie' ? 'movie' : 'series',
                    year: item.release_year || undefined,
                    score: item.rating ? Number(item.rating) : undefined
                });
            });

            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: 'SEARCH_ERROR', message: String(e && e.message || e) });
        }
    }

    async function load(urlData, cb) {
        try {
            let id = null;
            if (typeof urlData === 'string') {
                const parsed = parseJsonSafe(urlData, null);
                if (parsed && parsed.id) id = parsed.id;
                else {
                    const match = urlData.match(/(\d+)/);
                    if (match) id = match[1];
                }
            } else if (urlData && urlData.id) {
                id = urlData.id;
            }

            if (!id) return cb({ success: false, errorCode: 'INVALID_ID', message: 'Missing title identifier' });

            const [detailRes, watchRes] = await Promise.all([
                signedApiRequest('GET', '/api/v1/titles/' + id, { include_adult: 'false' }),
                signedApiRequest('GET', '/api/v1/titles/' + id + '/watch', { include_adult: 'false' })
            ]);

            if (!detailRes) {
                return cb({ success: false, errorCode: 'LOAD_ERROR', message: 'Title metadata unavailable' });
            }

            const isMovie = detailRes.content_type === 'movie';
            const episodes = [];

            if (watchRes && Array.isArray(watchRes.seasons) && watchRes.seasons.length > 0) {
                const seasonFetches = watchRes.seasons.map(async function (season, sIdx) {
                    const sn = Number(season.season_number) || (sIdx + 1);
                    if (!season.id) return [];
                    const epRes = await signedApiRequest('GET', '/api/v1/seasons/' + season.id + '/episodes', { include_adult: 'false' });
                    const epList = (epRes && Array.isArray(epRes.episodes)) ? epRes.episodes : [];
                    return epList.map(function (ep, eIdx) {
                        const en = Number(ep.episode_number) || (eIdx + 1);
                        return new Episode({
                            name: ep.title || ('Episode ' + en),
                            season: Number(ep.season_number) || sn,
                            episode: en,
                            url: JSON.stringify({ titleId: id, episodeId: ep.id, isMovie: false }),
                            posterUrl: ep.thumbnail_url || ep.poster_url || detailRes.poster_url || ''
                        });
                    });
                });
                const allSeasonsEps = await Promise.all(seasonFetches);
                for (let i = 0; i < allSeasonsEps.length; i++) {
                    for (let j = 0; j < allSeasonsEps[i].length; j++) {
                        episodes.push(allSeasonsEps[i][j]);
                    }
                }
            }

            // Fallback for movies or titles without episodic breakdown
            if (!episodes.length) {
                episodes.push(new Episode({
                    name: detailRes.title || 'Play',
                    season: 1,
                    episode: 1,
                    url: JSON.stringify({ titleId: id, episodeId: null, isMovie: true }),
                    posterUrl: detailRes.poster_url || ''
                }));
            }

            const castList = (Array.isArray(detailRes.cast) ? detailRes.cast : []).map(function (c) {
                return new Actor({ name: c.name || 'Unknown', image: c.profile_url || undefined });
            });

            cb({
                success: true,
                data: new MultimediaItem({
                    title: detailRes.title || 'Untitled',
                    url: urlData,
                    posterUrl: detailRes.poster_url || '',
                    backgroundPosterUrl: detailRes.backdrop_url || detailRes.poster_url || '',
                    description: detailRes.overview || '',
                    type: isMovie ? 'movie' : 'series',
                    year: detailRes.release_year || undefined,
                    score: detailRes.rating ? Number(detailRes.rating) : undefined,
                    cast: castList.length ? castList : undefined,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: 'LOAD_ERROR', message: String(e && e.message || e) });
        }
    }

    function parseQuality(q) {
        if (!q) return 0;
        const str = String(q).toLowerCase();
        if (str.includes('4k') || str.includes('2160')) return 2160;
        const m = str.match(/(\d{3,4})/);
        return m ? parseInt(m[1], 10) : 0;
    }

    async function loadStreams(urlData, cb) {
        try {
            const payload = parseJsonSafe(urlData, {});
            let titleId = payload.titleId || payload.id;
            let episodeId = payload.episodeId;
            let isMovie = !!payload.isMovie;

            if (!titleId) {
                const match = String(urlData).match(/(\d+)/);
                if (match) titleId = match[1];
            }

            if (!titleId) return cb({ success: false, errorCode: 'INVALID_ID', message: 'Missing title ID for stream extraction' });

            const query = { include_adult: 'false' };
            if (!isMovie && episodeId) {
                query.episode_id = String(episodeId);
            }

            const initialRes = await signedApiRequest('GET', '/api/v1/titles/' + titleId + '/playback', query);
            if (!initialRes) return cb({ success: true, data: [] });

            const serverList = [];
            if (initialRes.server) serverList.push(initialRes.server);

            if (Array.isArray(initialRes.server_options) && initialRes.server_options.length > 1) {
                const defaultKey = initialRes.selected_server_key || (initialRes.server && initialRes.server.key);
                const otherKeys = initialRes.server_options
                    .map(function (s) { return s.key; })
                    .filter(function (k) { return k && k !== defaultKey; });

                if (otherKeys.length > 0) {
                    const extraFetches = otherKeys.map(function (key) {
                        const extraQuery = Object.assign({}, query, { server: key });
                        return signedApiRequest('GET', '/api/v1/titles/' + titleId + '/playback', extraQuery);
                    });
                    const settled = await Promise.allSettled(extraFetches);
                    for (let sIdx = 0; sIdx < settled.length; sIdx++) {
                        const item = settled[sIdx];
                        if (item.status === 'fulfilled' && item.value && item.value.server) {
                            serverList.push(item.value.server);
                        }
                    }
                }
            }

            // Extract subtitles from all servers
            const subtitles = [];
            const seenSubUrls = new Set();
            for (let sIdx = 0; sIdx < serverList.length; sIdx++) {
                const srv = serverList[sIdx];
                const subList = Array.isArray(srv.subtitles) ? srv.subtitles : [];
                for (let subIdx = 0; subIdx < subList.length; subIdx++) {
                    const sub = subList[subIdx];
                    if (!sub || !sub.url || seenSubUrls.has(sub.url)) continue;
                    seenSubUrls.add(sub.url);
                    const label = sub.language_name || sub.name || sub.label || sub.language_code || sub.lang || 'Subtitle';
                    const lang = sub.language_code || sub.lang || 'en';
                    subtitles.push({
                        url: sub.url,
                        file: sub.url,
                        label: label,
                        lang: lang
                    });
                }
            }

            const results = [];
            const seenUrls = new Set();

            for (let sIdx = 0; sIdx < serverList.length; sIdx++) {
                const srv = serverList[sIdx];
                const srvName = srv.name || srv.key || 'Server';
                const languages = Array.isArray(srv.languages) ? srv.languages : [];

                for (let lIdx = 0; lIdx < languages.length; lIdx++) {
                    const lang = languages[lIdx];
                    const langName = lang.name || lang.code || 'Original';
                    const candidates = [];

                    const sources = (lang.playback && (Array.isArray(lang.playback.sources) ? lang.playback.sources : (Array.isArray(lang.playback.qualities) ? lang.playback.qualities : []))) || [];
                    for (let soIdx = 0; soIdx < sources.length; soIdx++) {
                        const s = sources[soIdx];
                        if (s && s.url) candidates.push(s);
                    }

                    const downloads = (Array.isArray(lang.download_options) ? lang.download_options : (Array.isArray(lang.downloadOptions) ? lang.downloadOptions : [])) || [];
                    for (let dlIdx = 0; dlIdx < downloads.length; dlIdx++) {
                        const d = downloads[dlIdx];
                        if (d && d.url) candidates.push(d);
                    }

                    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
                        const c = candidates[cIdx];
                        if (!c.url || seenUrls.has(c.url)) continue;
                        seenUrls.add(c.url);

                        const fmt = String(c.format || '').toLowerCase();
                        const isDash = fmt === 'dash' || c.url.includes('.mpd');
                        const isHls = fmt === 'hls' || c.url.includes('.m3u8');
                        const streamType = isHls ? 'hls' : (isDash ? 'dash' : 'mp4');

                        const qNum = parseQuality(c.quality);
                        const qLabel = qNum ? (qNum + 'p') : (c.quality || 'Auto');
                        const fmtTag = isHls ? 'HLS' : (isDash ? 'DASH' : 'MP4');
                        const sourceLabel = 'AniVortex [' + srvName + '] [' + langName + '] ' + qLabel + ' (' + fmtTag + ')';

                        const headers = (c.headers && Object.keys(c.headers).length)
                            ? c.headers
                            : { 'User-Agent': 'Dart/3.10 (dart:io)' };

                        results.push(new StreamResult({
                            url: c.url,
                            source: sourceLabel,
                            name: sourceLabel,
                            type: streamType,
                            quality: qNum || undefined,
                            headers: headers,
                            subtitles: subtitles.length ? subtitles : undefined
                        }));

                        if (Array.isArray(c.fallback_urls) && c.fallback_urls.length > 0) {
                            for (let fbIdx = 0; fbIdx < c.fallback_urls.length; fbIdx++) {
                                const fbUrl = c.fallback_urls[fbIdx];
                                if (!fbUrl || seenUrls.has(fbUrl)) continue;
                                seenUrls.add(fbUrl);
                                const mirrorLabel = sourceLabel + ' [Mirror ' + (fbIdx + 1) + ']';
                                results.push(new StreamResult({
                                    url: fbUrl,
                                    source: mirrorLabel,
                                    name: mirrorLabel,
                                    type: streamType,
                                    quality: qNum || undefined,
                                    headers: headers,
                                    subtitles: subtitles.length ? subtitles : undefined
                                }));
                            }
                        }
                    }
                }
            }

            results.sort(function (a, b) {
                return (b.quality || 0) - (a.quality || 0);
            });

            log('LOAD_STREAMS', '[DONE] url=\'' + urlData + '\' | Streams: ' + results.length);
            cb({ success: true, data: results });
        } catch (e) {
            log('LOAD_STREAMS', '[ERROR] ' + String(e && e.message || e));
            cb({ success: false, errorCode: 'STREAM_ERROR', message: String(e && e.message || e) });
        }
    }

    // Expose plugin methods to host runtime
    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
