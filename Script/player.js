/* ============================================================
 * Material Design 3 Expressive — 音乐播放器
 * 依赖：无；目标：现代浏览器（ES2020+）
 * ============================================================ */
(() => {
    'use strict';

    /* ---------------- 配置 ---------------- */
    // 歌曲地址。文件名不变、内容可整首替换：
    // 每次打开页面自动加时间戳参数穿透缓存，确保拿到刚替换的新文件。
    const TRACK_URL = 'https://rudan177.github.io/OOOInterface/images/wow.mp3';
    const AUDIO_URL = `${TRACK_URL}?v=${Date.now()}`;
    const SEEK_STEP = 10;      // 快进/快退秒数
    const KEY_STEP = 5;        // 键盘微调秒数
    const ID3_MAX_TAG = 4 * 1024 * 1024;  // ID3 标签大小上限（防异常数据）
    const FETCH_TIMEOUT = 10000;

    // 兜底元数据：仅当 ID3 解析完全失败（如断网、CORS 受限）时才会展示。
    // 提示：换歌后若新文件本身带有完整标签，这里不用改；
    // 只有新文件“没有任何标签”时，才需要把这里改成新歌的信息。
    const FALLBACK_META = { title: '蝴蝶', artist: '洛天依' };

    /* ---------------- DOM ---------------- */
    const $ = (id) => document.getElementById(id);
    const root = $('playerCard');
    const audio = $('audio');
    const btnPlay = $('btnPlay');
    const btnRewind = $('btnRewind');
    const btnForward = $('btnForward');
    const slider = $('slider');
    const sliderTrack = slider.querySelector('.slider-track');
    const sliderFill = $('sliderFill');
    const sliderBuffered = $('sliderBuffered');
    const sliderThumb = $('sliderThumb');
    const timeCurrent = $('timeCurrent');
    const timeDuration = $('timeDuration');
    const songTitle = $('songTitle');
    const songArtist = $('songArtist');
    const coverEl = $('cover');
    const coverImg = $('coverImg');
    const ambientImg = $('ambientImg');
    const errorLayer = $('errorLayer');
    const errorMsg = $('errorMsg');
    const btnRetry = $('btnRetry');

    /* ---------------- 状态 ---------------- */
    let duration = 0;
    let isDragging = false;
    let rafId = null;
    let coverObjectUrl = null;
    let palette = null;          // { light: {...}, dark: {...} }
    let autoResumeAfterLoad = false;
    const darkMql = window.matchMedia('(prefers-color-scheme: dark)');

    /* ---------------- 工具 ---------------- */
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

    const isFiniteDuration = () => Number.isFinite(audio.duration);

    function fmtTime(sec) {
        if (!Number.isFinite(sec) || sec < 0) return '--:--';
        const s = Math.floor(sec);
        const m = Math.floor(s / 60);
        const r = s % 60;
        const h = Math.floor(m / 60);
        const mm = h > 0 ? String(m % 60).padStart(2, '0') : String(m);
        return (h > 0 ? h + ':' : '') + mm + ':' + String(r).padStart(2, '0');
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
        ]);
    }

    /* ---------------- 涟漪 ---------------- */
    function attachRipple(el) {
        if (!el) return;
        el.addEventListener('pointerdown', (e) => {
            const clip = el.querySelector('.ripple-clip') || el;
            const rect = el.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height) * 2.1;
            const ink = document.createElement('span');
            ink.className = 'ripple-ink';
            ink.style.width = ink.style.height = size + 'px';
            ink.style.left = (e.clientX - rect.left - size / 2) + 'px';
            ink.style.top = (e.clientY - rect.top - size / 2) + 'px';
            clip.appendChild(ink);
            ink.addEventListener('animationend', () => ink.remove(), { once: true });
        });
    }
    [btnPlay, btnRewind, btnForward, btnRetry].forEach(attachRipple);

    /* ---------------- 进度渲染（仅写 transform，走合成器） ---------------- */
    let trackWidth = 0;

    function measureTrack() {
        trackWidth = sliderTrack.clientWidth;
    }

    function renderProgress(current) {
        const p = isFiniteDuration() && duration > 0 ? clamp(current / duration, 0, 1) : 0;
        sliderFill.style.transform = `scaleX(${p})`;
        sliderThumb.style.transform = `translate(calc(${(p * trackWidth).toFixed(1)}px - 50%), -50%)`;
        timeCurrent.textContent = fmtTime(current);
        slider.setAttribute('aria-valuemax', String(Math.floor(isFiniteDuration() ? duration : 0)));
        slider.setAttribute('aria-valuenow', String(Math.floor(current)));
        slider.setAttribute('aria-valuetext', `${fmtTime(current)}，共 ${isFiniteDuration() ? fmtTime(duration) : '--:--'}`);
    }

    function renderBuffered() {
        if (!isFiniteDuration() || duration <= 0) return;
        let end = 0;
        const b = audio.buffered;
        for (let i = 0; i < b.length; i++) {
            if (b.end(i) > end) end = b.end(i);
        }
        sliderBuffered.style.transform = `scaleX(${clamp(end / duration, 0, 1)})`;
    }

    function startLoop() {
        if (rafId !== null) return;
        const tick = () => {
            if (!isDragging) renderProgress(audio.currentTime);
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
    }

    function stopLoop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        if (!isDragging) renderProgress(audio.currentTime);
    }

    /* ---------------- 滑条交互 ---------------- */
    function posFromEvent(e) {
        const rect = sliderTrack.getBoundingClientRect();
        return clamp((e.clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    }

    let seekPreview = 0;

    slider.addEventListener('pointerdown', (e) => {
        if (!isFiniteDuration()) return;
        e.preventDefault();
        measureTrack();
        isDragging = true;
        seekPreview = posFromEvent(e) * duration;
        slider.classList.add('is-dragging');
        slider.setPointerCapture(e.pointerId);
        renderProgress(seekPreview);
    });

    slider.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        seekPreview = posFromEvent(e) * duration;
        renderProgress(seekPreview);
    });

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        slider.classList.remove('is-dragging');
        try { slider.releasePointerCapture(e.pointerId); } catch (_) { /* 已释放则忽略 */ }
        if (isFiniteDuration()) {
            try { audio.currentTime = seekPreview; } catch (_) { /* 非法时刻忽略 */ }
        }
        renderProgress(audio.currentTime);
    }
    slider.addEventListener('pointerup', endDrag);
    slider.addEventListener('pointercancel', endDrag);

    slider.addEventListener('keydown', (e) => {
        if (!isFiniteDuration()) return;
        let t = null;
        switch (e.key) {
            case 'ArrowRight': t = audio.currentTime + KEY_STEP; break;
            case 'ArrowLeft': t = audio.currentTime - KEY_STEP; break;
            case 'ArrowUp': t = audio.currentTime + SEEK_STEP; break;
            case 'ArrowDown': t = audio.currentTime - SEEK_STEP; break;
            case 'PageUp': t = audio.currentTime + 30; break;
            case 'PageDown': t = audio.currentTime - 30; break;
            case 'Home': t = 0; break;
            case 'End': t = duration; break;
            default: return;
        }
        e.preventDefault();
        try { audio.currentTime = clamp(t, 0, duration); } catch (_) { /* 忽略 */ }
    });

    new ResizeObserver(measureTrack).observe(sliderTrack);

    /* ---------------- 播放控制 ---------------- */
    function setPlayingUI(playing) {
        btnPlay.classList.toggle('is-playing', playing);
        btnPlay.setAttribute('aria-label', playing ? '暂停' : '播放');
        root.classList.toggle('is-playing-root', playing);
        if (playing) startLoop(); else stopLoop();
    }

    function setBufferingUI(on) {
        root.classList.toggle('is-buffering', on);
    }

    function requestPlay() {
        if (!errorLayer.hidden) return;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            p.catch((err) => {
                // 自动播放策略拦截：保持暂停态即可；网络错误由 error 事件处理
                if (err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                    console.warn('播放失败：', err);
                }
                setPlayingUI(false);
            });
        }
    }

    function requestPause() {
        audio.pause();
    }

    // 切换：UI 按钮用；媒体会话的 play/pause 是语义动作，各自无条件执行，
    // 不用 toggle（否则会话状态与实际播放状态不同步时会反向操作）
    function togglePlay() {
        if (audio.paused) requestPlay(); else requestPause();
    }

    function skip(delta) {
        if (!isFiniteDuration()) return;
        const target = clamp(audio.currentTime + delta, 0, duration);
        try { audio.currentTime = target; } catch (_) { /* 忽略 */ }
        renderProgress(target);
        // 图标弹簧旋转反馈
        const icon = (delta < 0 ? btnRewind : btnForward).querySelector('.skip-icon');
        if (icon && icon.animate) {
            icon.animate(
                [{ transform: 'rotate(0deg)' }, { transform: `rotate(${delta < 0 ? -180 : 180}deg)` }],
                { duration: 550, easing: 'cubic-bezier(.34, 1.3, .5, 1)' }
            );
        }
    }

    btnPlay.addEventListener('click', togglePlay);
    btnRewind.addEventListener('click', () => skip(-SEEK_STEP));
    btnForward.addEventListener('click', () => skip(SEEK_STEP));

    // 全局快捷键（焦点在控件上时由控件自己处理）
    window.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t instanceof Element && t.closest('button, [role="slider"], input, textarea, select')) return;
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); togglePlay(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-SEEK_STEP); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); skip(SEEK_STEP); }
    });

    /* ---------------- 音频事件 ---------------- */
    audio.addEventListener('loadedmetadata', () => {
        duration = audio.duration;
        timeDuration.textContent = fmtTime(duration);
        renderProgress(audio.currentTime);
    });

    audio.addEventListener('durationchange', () => {
        if (Number.isFinite(audio.duration)) {
            duration = audio.duration;
            timeDuration.textContent = fmtTime(duration);
        }
    });

    audio.addEventListener('timeupdate', () => {
        if (!isDragging && rafId === null) renderProgress(audio.currentTime);
        updatePositionState();
    });

    audio.addEventListener('progress', renderBuffered);
    audio.addEventListener('canplay', () => { setBufferingUI(false); renderBuffered(); });
    audio.addEventListener('playing', () => setBufferingUI(false));
    audio.addEventListener('seeked', () => { setBufferingUI(false); renderProgress(audio.currentTime); });

    audio.addEventListener('waiting', () => setBufferingUI(true));
    audio.addEventListener('stalled', () => setBufferingUI(true));
    audio.addEventListener('seeking', () => { if (!isDragging) setBufferingUI(true); });

    audio.addEventListener('play', () => setPlayingUI(true));
    audio.addEventListener('pause', () => setPlayingUI(false));

    audio.addEventListener('ended', () => {
        try { audio.currentTime = 0; } catch (_) { /* 忽略 */ }
        setPlayingUI(false);
        renderProgress(0);
    });

    audio.addEventListener('error', () => {
        setBufferingUI(false);
        setPlayingUI(false);
        const code = audio.error ? audio.error.code : 0;
        const reason = {
            1: '加载已被中止。',
            2: '网络出现故障，请检查网络连接。',
            3: '音频解码失败，文件可能已损坏。',
            4: '音频源不可用或格式不受支持。',
        }[code] || '网络似乎不太顺畅，请检查网络后重试。';
        errorMsg.textContent = reason;
        errorLayer.hidden = false;
    });

    btnRetry.addEventListener('click', () => {
        errorLayer.hidden = true;
        setBufferingUI(true);
        autoResumeAfterLoad = true;
        audio.load();
    });

    audio.addEventListener('canplaythrough', () => {
        if (autoResumeAfterLoad) {
            autoResumeAfterLoad = false;
            setBufferingUI(false);
            togglePlay();
        }
    });

    /* ---------------- Media Session（锁屏 / 通知栏控制） ---------------- */
    let lastPosUpdate = 0;

    function updatePositionState() {
        if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
        const now = Date.now();
        if (now - lastPosUpdate < 1000) return;
        lastPosUpdate = now;
        if (!isFiniteDuration()) return;
        try {
            navigator.mediaSession.setPositionState({
                duration,
                playbackRate: audio.playbackRate,
                position: Math.min(audio.currentTime, duration),
            });
        } catch (_) { /* 部分浏览器对非法值会抛异常，忽略 */ }
    }

    function setupMediaSession(artworkUrl) {
        if (!('mediaSession' in navigator)) return;
        try {
            const meta = currentMeta;
            const artwork = artworkUrl
                ? [{ src: artworkUrl, sizes: '700x700', type: 'image/jpeg' }]
                : [];
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: meta.title,
                artist: meta.artist,
                album: meta.album || '',
                artwork,
            });
            const set = (action, fn) => {
                try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) { /* 不支持的动作 */ }
            };
            set('play', () => requestPlay());
            set('pause', () => requestPause());
            set('seekbackward', (d) => skip(-(d.seekOffset || SEEK_STEP)));
            set('seekforward', (d) => skip(d.seekOffset || SEEK_STEP));
            set('seekto', (d) => {
                if (isFiniteDuration() && Number.isFinite(d.seekTime)) {
                    try { audio.currentTime = clamp(d.seekTime, 0, duration); } catch (_) { /* 忽略 */ }
                }
            });
        } catch (_) { /* MediaSession 初始化失败不影响播放 */ }
    }

    /* ---------------- 文本/封面更新 ---------------- */
    let currentMeta = { ...FALLBACK_META };

    function swapText(el, text) {
        if (el.textContent === text) return;
        el.textContent = text;
        if (el.animate) {
            el.animate(
                [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
                { duration: 420, easing: 'cubic-bezier(.05,.7,.1,1)' }
            );
        }
    }

    function applyMeta(meta) {
        currentMeta = meta;
        swapText(songTitle, meta.title);
        swapText(songArtist, meta.artist);
        document.title = `${meta.title} · ${meta.artist} — 音乐播放器`;
        coverImg.alt = `专辑封面：${meta.title}`;
    }

    function applyCover(url) {
        if (coverObjectUrl) { try { URL.revokeObjectURL(coverObjectUrl); } catch (_) { /* 忽略 */ } }
        coverObjectUrl = url;
        ambientImg.style.backgroundImage = `url("${url}")`;
        coverImg.onload = () => {
            coverEl.classList.add('has-img');
            requestAnimationFrame(() => ambientImg.classList.add('is-visible'));
            extractPalette(url);
        };
        coverImg.src = url;
    }

    /* ---------------- ID3v2 解析（Range 请求，避免整曲下载） ---------------- */
    function syncsafe(b) { return ((b[0] & 0x7f) << 21) | ((b[1] & 0x7f) << 14) | ((b[2] & 0x7f) << 7) | (b[3] & 0x7f); }

    function decodeTextFrame(bytes) {
        if (!bytes.length) return '';
        const enc = bytes[0];
        const body = bytes.subarray(1);
        try {
            if (enc === 1 || enc === 2) {
                // enc 1: UTF-16 带 BOM；enc 2: UTF-16BE 无 BOM
                let label = 'utf-16le';
                let text = body;
                if (enc === 1 && body.length >= 2) {
                    if (body[0] === 0xff && body[1] === 0xfe) { label = 'utf-16le'; text = body.subarray(2); }
                    else if (body[0] === 0xfe && body[1] === 0xff) { label = 'utf-16be'; text = body.subarray(2); }
                } else if (enc === 2) {
                    label = 'utf-16be';
                }
                return new TextDecoder(label).decode(text).replace(/\0+$/g, '').replace(/\0/g, ' ').trim();
            }
            // enc 0: ISO-8859-1；enc 3: UTF-8
            const text = new TextDecoder(enc === 3 ? 'utf-8' : 'latin1').decode(body);
            return text.replace(/\0+$/g, '').replace(/\0/g, ' ').trim();
        } catch (_) { return ''; }
    }

    function parseId3(u8) {
        if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return null;
        const major = u8[3];
        const tagEnd = 10 + syncsafe(u8.subarray(6, 10));
        const end = Math.min(tagEnd, u8.length);
        const out = {};
        let pos = 10;
        while (pos + 10 <= end) {
            const id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
            if (!/^[A-Z0-9]{4}$/.test(id)) break;
            let size;
            if (major >= 4) {
                size = syncsafe(u8.subarray(pos + 4, pos + 8));
            } else {
                size = (u8[pos + 4] << 24) | (u8[pos + 5] << 16) | (u8[pos + 6] << 8) | u8[pos + 7];
            }
            if (size <= 0 || pos + 10 + size > end) break;
            const body = u8.subarray(pos + 10, pos + 10 + size);
            if (id === 'TIT2') out.title = decodeTextFrame(body);
            else if (id === 'TPE1') out.artist = decodeTextFrame(body);
            else if (id === 'TALB') out.album = decodeTextFrame(body);
            else if (id === 'APIC' && !out.picture) {
                // v2.3/2.4 布局：<enc> <mime\0> <图片类型> <描述\0> <数据>
                const enc = body[0];
                const z = body.indexOf(0, 1); // mime 结束位置
                if (z > 0) {
                    const mime = new TextDecoder('latin1').decode(body.subarray(1, z)) || 'image/jpeg';
                    let i = z + 2; // 跳过描述编码前的图片类型字节
                    if (enc === 1 || enc === 2) { // UTF-16 描述以双 \0 结束
                        while (i + 1 < body.length && (body[i] !== 0 || body[i + 1] !== 0)) i += 2;
                        i += 2;
                    } else {
                        const d = body.indexOf(0, i);
                        i = d === -1 ? body.length : d + 1;
                    }
                    if (i < body.length) out.picture = { mime, data: body.subarray(i) };
                }
            }
            pos += 10 + size;
        }
        return out;
    }

    function concatChunks(chunks, total) {
        const out = new Uint8Array(total);
        let o = 0;
        for (const c of chunks) {
            out.set(c.length > total - o ? c.subarray(0, total - o) : c, o);
            o += c.length;
            if (o >= total) break;
        }
        return out;
    }

    /**
     * 单次普通 fetch 流式读取 ID3 标签：
     * 不带自定义请求头（避免触发 CORS 预检），读够标签长度后立即中止下载。
     * 返回包含完整 ID3 标签的 Uint8Array；无标签返回 null。
     */
    async function fetchId3(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (!res.body || !res.body.getReader) {
                // 极老浏览器无流式 API：整体读入后截取
                return new Uint8Array(await res.arrayBuffer());
            }
            const reader = res.body.getReader();
            const chunks = [];
            let received = 0;
            let need = Infinity;
            while (received < need) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                received += value.length;
                if (need === Infinity && received >= 10) {
                    const head = concatChunks(chunks, received);
                    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
                    const tagSize = 10 + syncsafe(head.subarray(6, 10));
                    if (tagSize > ID3_MAX_TAG) return null;
                    need = tagSize;
                }
            }
            if (need === Infinity) return null;
            return concatChunks(chunks, Math.min(received, need));
        } finally {
            clearTimeout(timer);
            try { controller.abort(); } catch (_) { /* 已结束则忽略 */ }
        }
    }

    async function loadMetadata() {
        try {
            const u8 = await fetchId3(AUDIO_URL);
            if (!u8) return;
            const info = parseId3(u8);
            if (!info) return;

            // 解析成功即以文件标签为准：缺什么显示什么，
            // 绝不沿用兜底值（否则换歌后会残留上一首的信息）
            applyMeta({
                title: info.title || '未命名曲目',
                artist: info.artist || '未知歌手',
            });
            setupMediaSession(coverObjectUrl);

            if (info.picture && 'Blob' in window) {
                const blob = new Blob([info.picture.data], { type: info.picture.mime });
                const url = URL.createObjectURL(blob);
                applyCover(url);
                setupMediaSession(url);
            }
        } catch (err) {
            // 解析失败不影响播放，保留兜底元数据
            console.info('歌曲信息解析跳过：', err && err.message);
        }
    }

    /* ---------------- 从封面提取主题色（M3 动态色） ---------------- */
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return [0, 0, l];
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        return [h * 60, s, l];
    }

    async function extractPalette(url) {
        try {
            const img = new Image();
            img.src = url;
            await withTimeout(img.decode(), 5000);
            const N = 28;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = N;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, N, N);
            const data = ctx.getImageData(0, 0, N, N).data;

            // 按色相分桶加权统计，挑出最突出的“有色”色调
            const buckets = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0, l: 0, n: 0 }));
            for (let i = 0; i < data.length; i += 4) {
                if (data[i + 3] < 128) continue;
                const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
                if (s < 0.12 || l < 0.08 || l > 0.94) continue; // 跳过灰白黑
                const bi = Math.floor(h / 30) % 12;
                const w = s * (1 - Math.abs(l - 0.55));
                const bkt = buckets[bi];
                bkt.w += w; bkt.h += h; bkt.s += s; bkt.l += l; bkt.n++;
            }
            let best = null;
            for (const bkt of buckets) if (bkt.n && (!best || bkt.w > best.w)) best = bkt;
            if (!best || best.w < 0.35) return; // 近乎黑白，不覆盖默认主题

            const h = Math.round(best.h / best.n);
            const s = clamp(best.s / best.n, 0.25, 0.9);
            const c = (hh, ss, ll) => `hsl(${hh}, ${Math.round(clamp(ss, 0, 100))}%, ${Math.round(clamp(ll, 0, 100))}%)`;

            palette = {
                light: {
                    '--primary': c(h, s * 100 * 1.05, 40),
                    '--on-primary': c(h, 100, 98),
                    '--primary-container': c(h, Math.min(s * 110, 82), 90),
                    '--on-primary-container': c(h, Math.min(s * 115, 72), 13),
                    '--surface': c(h, 32, 98),
                    '--surface-container': c(h, 27, 95),
                    '--surface-container-high': c(h, 25, 92),
                    '--surface-container-highest': c(h, 23, 89),
                    '--on-surface': c(h, 17, 12),
                    '--on-surface-variant': c(h, 11, 40),
                    '--outline-variant': c(h, 13, 82),
                },
                dark: {
                    '--primary': c(h, Math.min(s * 110, 95), 82),
                    '--on-primary': c(h, Math.min(s * 115, 80), 18),
                    '--primary-container': c(h, Math.min(s * 105, 75), 34),
                    '--on-primary-container': c(h, Math.min(s * 110, 88), 90),
                    '--surface': c(h, 20, 8),
                    '--surface-container': c(h, 18, 13),
                    '--surface-container-high': c(h, 16, 18),
                    '--surface-container-highest': c(h, 14, 23),
                    '--on-surface': c(h, 14, 91),
                    '--on-surface-variant': c(h, 10, 78),
                    '--outline-variant': c(h, 12, 32),
                },
            };
            applyPalette();
        } catch (_) { /* 取色失败保留默认主题 */ }
    }

    function applyPalette() {
        if (!palette) return;
        const vars = darkMql.matches ? palette.dark : palette.light;
        for (const [k, v] of Object.entries(vars)) {
            document.documentElement.style.setProperty(k, v);
        }
        // 同步浏览器地址栏主题色
        const metas = document.querySelectorAll('meta[name="theme-color"]');
        const surfaces = { light: palette.light['--surface'], dark: palette.dark['--surface'] };
        metas.forEach((m) => {
            const isDark = /dark/.test(m.media || '');
            m.setAttribute('content', isDark ? surfaces.dark : surfaces.light);
        });
    }

    darkMql.addEventListener('change', applyPalette);

    /* ---------------- 启动 ---------------- */
    measureTrack();
    renderProgress(0);
    applyMeta({ ...FALLBACK_META });
    audio.src = AUDIO_URL;  // 时间戳参数：与元数据请求共用同一地址，保证音源与封面信息一致
    loadMetadata();
})();
