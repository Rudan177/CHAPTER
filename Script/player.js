/* ============================================================
 * Material Design 3 Expressive — 音乐播放器（含播放列表）
 * 依赖：无；目标：现代浏览器（ES2020+）
 * ============================================================ */
(() => {
    'use strict';

    /* ---------------- 配置 ---------------- */
    // 历史音频与曲目清单都放在站点根目录的 images/MusicLog/ 下：
    //   images/MusicLog/music.json  曲目清单
    //   images/MusicLog/mp3/<曲名> - <艺术家>.mp3  音频本体
    const SITE_BASE = 'https://rudan177.github.io/OOOInterface/';
    const LOG_BASE = `${SITE_BASE}images/MusicLog/`;
    const META_URL = `${LOG_BASE}music.json`;
    // 固定首曲：wow.mp3 排在整个列表最前。文件名不变、内容可整首替换，
    // 所以它没有清单元数据，曲名 / 歌手以文件内 ID3 为准
    const WOW_URL = `${SITE_BASE}images/wow.mp3`;
    // 每次打开页面自动加时间戳参数穿透缓存，确保拿到刚替换的新文件
    const CACHE_BUST = Date.now();

    const SEEK_STEP = 10;      // 锁屏 / 通知栏快进快退秒数
    const KEY_STEP = 5;        // 进度条键盘微调秒数
    const ID3_MAX_TAG = 4 * 1024 * 1024;  // ID3 标签大小上限（防异常数据）
    const FETCH_TIMEOUT = 10000;

    // 兜底元数据：仅在 ID3 也解析不出时展示（固定首曲的初始占位）
    const FALLBACK_META = { title: 'OOOInterface', artist: 'ByRUDAN' };

    // 固定首曲条目：wow.mp3 永远排在最前。
    // wow.mp3 就是清单里「最新一天」那一份文件（内容与元数据都相同），
    // 所以最新一条并入这里、不再单列，避免同一首出现两次；
    // 它没有自己的类型 / 日期，这些字段从并入的那条继承，标题最终以文件内 ID3 为准（pinned）
    const makeWowTrack = (newest) => ({
        name: newest ? newest.name : FALLBACK_META.title,
        artist: newest ? newest.artist : FALLBACK_META.artist,
        date: newest ? newest.date : '',
        official: newest ? newest.official : null,   // null = 清单没拿到，类型未知
        duration: NaN,
        url: WOW_URL,
        pinned: true,
    });

    const withCache = (url) => `${url}${url.includes('?') ? '&' : '?'}v=${CACHE_BUST}`;

    /* ---------------- DOM ---------------- */
    const $ = (id) => document.getElementById(id);
    const root = $('playerCard');
    const audio = $('audio');
    const btnPlay = $('btnPlay');
    const btnPrev = $('btnPrev');
    const btnNext = $('btnNext');
    const slider = $('slider');
    const sliderTrack = slider.querySelector('.slider-track');
    const sliderFill = $('sliderFill');
    const sliderBuffered = $('sliderBuffered');
    const sliderThumb = $('sliderThumb');
    const timeCurrent = $('timeCurrent');
    const timeDuration = $('timeDuration');
    const songTitle = $('songTitle');
    const songTitleText = $('songTitleText');
    const songArtist = $('songArtist');
    const coverEl = $('cover');
    const coverImg = $('coverImg');
    const coverImgAlt = $('coverImgAlt');
    const ambientImg = $('ambientImg');
    const errorLayer = $('errorLayer');
    const errorMsg = $('errorMsg');
    const btnRetry = $('btnRetry');
    const playlistList = $('playlistList');
    const playlistBody = $('playlistBody');
    const playlistCount = $('playlistCount');
    const btnPlaylist = $('btnPlaylist');
    const playerFull = document.querySelector('.player-full');
    const playerMini = $('playerMini');
    const btnMiniOpen = $('btnMiniOpen');
    const miniCover = $('miniCover');
    const miniCoverImg = $('miniCoverImg');
    const miniCoverImgAlt = $('miniCoverImgAlt');
    const miniTitle = $('miniTitle');
    const miniArtist = $('miniArtist');
    const btnMiniPlay = $('btnMiniPlay');
    const btnMiniPrev = $('btnMiniPrev');
    const btnMiniNext = $('btnMiniNext');

    /* ---------------- 状态 ---------------- */
    let duration = 0;
    let isDragging = false;
    let rafId = null;
    let coverObjectUrl = null;
    let coverMime = '';          // 当前封面的真实 MIME，供 Media Session 使用
    let palette = null;          // { light: {...}, dark: {...} }
    let playlist = [];           // 曲目清单（来自 images/MusicLog/music.json）
    let currentIndex = -1;
    let coverToken = 0;          // 切换曲目时作废旧请求的回填
    let wantPlaying = false;     // 用户意图播放态（换曲时用它决定是否续播）
    const darkMql = window.matchMedia('(prefers-color-scheme: dark)');
    const reduceMotionMql = window.matchMedia('(prefers-reduced-motion: reduce)');

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

    // "20260913" → "09-13"
    const fmtDate = (d) => (/^\d{8}$/.test(d) ? `${d.slice(4, 6)}-${d.slice(6, 8)}` : d);

    // 清单里的时长写法可能是秒数、"216s" 或 "3:36"，统一取秒；取不到返回 NaN，
    // 由音频元数据兜底（NaN 不会被当成"已知时长"，所以仍会回填）
    function parseDuration(v) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const s = String(v ?? '').trim();
        if (!s) return NaN;
        const clock = s.match(/^(\d+):([0-5]?\d)$/);           // 3:36
        if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
        const sec = s.match(/^(\d+(?:\.\d+)?)\s*s?$/i);        // 216s / 216
        return sec ? Number(sec[1]) : NaN;
    }

    function withTimeout(promise, ms, onTimeout) {
        let timer = 0;
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => {
                    if (onTimeout) onTimeout();
                    reject(new Error('timeout'));
                }, ms);
            }),
        ]).finally(() => clearTimeout(timer));
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
    [btnPlay, btnPrev, btnNext, btnRetry, btnPlaylist, btnMiniOpen,
        btnMiniPlay, btnMiniPrev, btnMiniNext].forEach(attachRipple);

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
        // aria 值与视觉进度一样要 clamp，否则 currentTime 短暂越界时会
        // 出现 valuenow > valuemax 的非法组合
        const max = Math.floor(isFiniteDuration() ? duration : 0);
        const now = clamp(Math.floor(current), 0, max > 0 ? max : 0);
        slider.setAttribute('aria-valuemax', String(max));
        slider.setAttribute('aria-valuenow', String(now));
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
        [btnPlay, btnMiniPlay].forEach((b) => {
            b.classList.toggle('is-playing', playing);
            b.setAttribute('aria-label', playing ? '暂停' : '播放');
        });
        root.classList.toggle('is-playing-root', playing);
        if (playing) startLoop(); else stopLoop();
        updateCurrentTrack(false);
    }

    function setBufferingUI(on) {
        root.classList.toggle('is-buffering', on);
    }

    function requestPlay() {
        if (!errorLayer.hidden) return;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            p.catch((err) => {
                // 自动播放策略拦截：保持暂停态即可；快速切歌的中止由 error 之外忽略
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

    // 切换：UI 按钮用；媒体会话的 play/pause 是语义动作，各自无条件执行
    function togglePlay() {
        if (audio.paused) requestPlay(); else requestPause();
    }

    // 通知栏 / 进度条微调共用的相对跳转
    function seekBy(delta) {
        if (!isFiniteDuration()) return;
        const target = clamp(audio.currentTime + delta, 0, duration);
        try { audio.currentTime = target; } catch (_) { /* 忽略 */ }
        renderProgress(target);
    }

    /* ---------------- 曲目切换 ---------------- */
    function loadTrack(index, autoplay) {
        const t = playlist[index];
        if (!t) return;
        currentIndex = index;
        wantPlaying = !!autoplay;
        coverToken++;                       // 作废在途的封面/元数据请求

        duration = 0;
        timeDuration.textContent = '--:--';
        sliderBuffered.style.transform = 'scaleX(0)';
        renderProgress(0);

        applyMeta({ title: t.name, artist: t.artist });
        resetCover();
        setupMediaSession(null);

        setBufferingUI(true);
        audio.src = withCache(t.url);
        audio.load();
        if (wantPlaying) requestPlay();
        updateCurrentTrack(false);
        // 清单曲目：文字以 music.json 为准；固定首曲没有清单元数据，以 ID3 为准
        loadMetadata(t, !!t.pinned);
    }

    function nextTrack() {
        if (playlist.length) loadTrack((currentIndex + 1) % playlist.length, true);
    }

    function prevTrack() {
        if (playlist.length) loadTrack((currentIndex - 1 + playlist.length) % playlist.length, true);
    }

    btnPlay.addEventListener('click', togglePlay);
    btnMiniPlay.addEventListener('click', togglePlay);
    btnPrev.addEventListener('click', prevTrack);
    btnNext.addEventListener('click', nextTrack);
    btnMiniPrev.addEventListener('click', prevTrack);
    btnMiniNext.addEventListener('click', nextTrack);

    // 全局快捷键（焦点在控件上时由控件自己处理）
    window.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t instanceof Element && t.closest('button, [role="slider"], input, textarea, select')) return;
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); togglePlay(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prevTrack(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); nextTrack(); }
        else if (e.key === 'Escape' && isPlaylistOpen()) { e.preventDefault(); setPlaylistOpen(false); }
    });

    /* ---------------- 音频事件 ---------------- */
    audio.addEventListener('loadedmetadata', () => {
        duration = audio.duration;
        timeDuration.textContent = fmtTime(duration);
        syncCurrentDuration();
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

    // 播完自动续播下一曲（单曲清单则原地停止）
    audio.addEventListener('ended', () => {
        if (playlist.length > 1) {
            nextTrack();
        } else {
            try { audio.currentTime = 0; } catch (_) { /* 忽略 */ }
            setPlayingUI(false);
            renderProgress(0);
        }
    });

    audio.addEventListener('error', () => {
        if (!audio.src) return;             // 尚未指定音源时的异常事件不提示
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
        showError(true);
    });

    // 错误层是全屏遮罩：显示时把背后内容（播放器卡片 + 播放列表都在
    // .player-stack 里）移出 Tab 序并把焦点交给重试按钮，
    // 否则键盘仍能 Tab 进去、激活被遮住的播放控件
    function showError(on) {
        errorLayer.hidden = !on;
        document.querySelector('.player-stack').inert = on;
        if (on) { btnRetry.focus(); return; }
        // 收起时若焦点还在浮层里的重试按钮上，交还给播放按钮
        if (document.activeElement === btnRetry) btnPlay.focus();
    }

    btnRetry.addEventListener('click', () => {
        showError(false);
        loadTrack(Math.max(currentIndex, 0), true);
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
            // 用封面真实的 MIME（PNG 封面写死 image/jpeg 会被部分平台忽略）
            const artwork = artworkUrl
                ? [{ src: artworkUrl, sizes: '700x700', type: coverMime || 'image/jpeg' }]
                : [];
            navigator.mediaSession.metadata = new window.MediaMetadata({
                title: meta.title,
                artist: meta.artist,
                artwork,
            });
            const set = (action, fn) => {
                try { navigator.mediaSession.setActionHandler(action, fn); } catch (_) { /* 不支持的动作 */ }
            };
            set('play', () => requestPlay());
            set('pause', () => requestPause());
            set('previoustrack', () => prevTrack());
            set('nexttrack', () => nextTrack());
            set('seekbackward', (d) => seekBy(-(d.seekOffset || SEEK_STEP)));
            set('seekforward', (d) => seekBy(d.seekOffset || SEEK_STEP));
            set('seekto', (d) => {
                if (isFiniteDuration() && Number.isFinite(d.seekTime)) {
                    try { audio.currentTime = clamp(d.seekTime, 0, duration); } catch (_) { /* 忽略 */ }
                }
            });
        } catch (_) { /* MediaSession 初始化失败不影响播放 */ }
    }

    /* ---------------- 标题跑马灯（单行放不下时单向循环滚动） ---------------- */
    const MARQUEE_SPEED = 40;   // 滚动速度（px/s，全程匀速）
    const MARQUEE_HOLD = 1200;  // 每圈回到起点后的停留（ms）
    const MARQUEE_MIN = 8;      // 溢出量不超过该值视为放得下（避免微抖）
    let marqueeAnim = null;
    let marqueeRafId = 0;

    function stopTitleMarquee() {
        if (marqueeAnim) {
            marqueeAnim.cancel();
            marqueeAnim = null;
        }
        songTitle.classList.remove('is-marquee');
    }

    function updateTitleMarquee() {
        stopTitleMarquee();
        // 静态兜底态下 span 限宽，scrollWidth 仍能量出完整文本宽度
        const overflow = songTitleText.scrollWidth - songTitle.clientWidth;
        // 减弱动效：保持静态省略号，不滚动
        if (overflow <= MARQUEE_MIN || reduceMotionMql.matches || !songTitleText.animate) return;

        songTitle.classList.add('is-marquee');
        // 单向循环（Android 媒体组件样式）：起点停留 → 匀速滚出左缘 → 瞬间回到右缘外
        // → 匀速滚回起点，无限循环。跳变发生在窗口内无文字的时刻，
        // 配合两端渐隐遮罩，视觉上是无缝的传送带。
        const textW = songTitleText.scrollWidth;   // 加类解除限宽后即完整文本宽度
        const boxW = songTitle.clientWidth;
        const total = MARQUEE_HOLD + (textW + boxW) / MARQUEE_SPEED * 1000;
        const o1 = MARQUEE_HOLD / total;
        const o2 = (MARQUEE_HOLD + textW / MARQUEE_SPEED * 1000) / total;
        marqueeAnim = songTitleText.animate([
            { transform: 'translateX(0)' },
            { transform: 'translateX(0)', offset: o1 },
            { transform: `translateX(${-textW}px)`, offset: o2 },
            { transform: `translateX(${boxW}px)`, offset: o2 },   // 同偏移两帧 = 瞬间跳变
            { transform: 'translateX(0)' },
        ], { duration: total, iterations: Infinity });
    }

    function scheduleTitleMarquee() {
        if (marqueeRafId) return;
        marqueeRafId = requestAnimationFrame(() => {
            marqueeRafId = 0;
            updateTitleMarquee();
        });
    }

    // 容器尺寸 / 文本宽度 / 字体加载变化时重新测量
    new ResizeObserver(scheduleTitleMarquee).observe(songTitle);
    new ResizeObserver(scheduleTitleMarquee).observe(songTitleText);
    reduceMotionMql.addEventListener('change', scheduleTitleMarquee);
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(scheduleTitleMarquee);
    }

    /* ---------------- 文本 / 封面更新 ---------------- */
    let currentMeta = { ...FALLBACK_META };

    function swapText(el, text, animEl = el) {
        if (el.textContent === text) return;
        el.textContent = text;
        // WAAPI 不受 CSS 的 reduced-motion 覆盖影响，这里要自己判断
        if (animEl.animate && !reduceMotionMql.matches) {
            animEl.animate(
                [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
                { duration: 420, easing: 'cubic-bezier(.05,.7,.1,1)' }
            );
        }
    }

    function applyMeta(meta) {
        currentMeta = meta;
        // 标题：文字写入内层 span（跑马灯载体），切换动画作用于外层 h1，避免 transform 冲突
        swapText(songTitleText, meta.title, songTitle);
        swapText(songArtist, meta.artist);
        miniTitle.textContent = meta.title;
        miniArtist.textContent = meta.artist;
        updateTitleMarquee();
        document.title = `${meta.title} · ${meta.artist} — 音乐播放器`;
    }

    // 双层封面交叉淡入：离屏解码成功后再切层，避免闪现半解码帧。
    // alt 策略：只有「正在显示」的那层带描述性 alt，背面层一律 alt=""。
    // 空 alt 自身就会被辅助技术当作装饰忽略，所以不需要 aria-hidden，
    // 也就不会出现「有意义的 alt 被写到隐藏层上、可见层反而没名字」的问题。
    // gen 为代次守卫：换曲后滞后的 onload 不得复活已 revoke 的 blob URL。
    function makeCrossfader(layerA, layerB) {
        let front = layerA;
        let gen = 0;
        const api = (url, altText, onReady) => {
            const my = ++gen;
            const probe = new Image();
            probe.decoding = 'async';
            probe.onload = () => {
                if (my !== gen) return;              // 已被更新的请求取代
                const incoming = front === layerA ? layerB : layerA;
                const outgoing = front;
                incoming.src = url;
                incoming.alt = altText || '';
                incoming.classList.add('is-front');
                outgoing.classList.remove('is-front');
                outgoing.alt = '';
                front = incoming;
                if (onReady) onReady();
            };
            // 解析不出封面时保留上一张，不做任何切换
            probe.src = url;
        };
        api.reset = () => {
            gen++;                                    // 作废在途探针
            [layerA, layerB].forEach((img) => {
                img.classList.remove('is-front');
                img.removeAttribute('src');
                img.alt = '';
            });
            front = layerA;
        };
        return api;
    }

    const fadeCover = makeCrossfader(coverImg, coverImgAlt);
    const fadeMiniCover = makeCrossfader(miniCoverImg, miniCoverImgAlt);

    function applyCover(url) {
        if (coverObjectUrl) { try { URL.revokeObjectURL(coverObjectUrl); } catch (_) { /* 忽略 */ } }
        coverObjectUrl = url;
        fadeMiniCover(url);
        fadeCover(url, `专辑封面：${currentMeta.title}`, () => {
            coverEl.classList.add('has-img');
            ambientImg.style.backgroundImage = `url("${url}")`;
            requestAnimationFrame(() => ambientImg.classList.add('is-visible'));
            extractPalette(url, coverToken);
        });
    }

    // 换曲时先清空上一首的封面与取色，避免残留。
    // 只列 CSS 里真正被子元素消费的角色，别写无人使用的令牌
    const THEME_KEYS = [
        '--primary', '--on-primary',
        '--surface', '--surface-container', '--surface-container-high', '--surface-container-highest',
        '--on-surface', '--on-surface-variant',
    ];
    const themeColorMetas = [...document.querySelectorAll('meta[name="theme-color"]')];
    const defaultThemeColors = themeColorMetas.map((m) => m.getAttribute('content'));

    function resetCover() {
        if (coverObjectUrl) { try { URL.revokeObjectURL(coverObjectUrl); } catch (_) { /* 忽略 */ } }
        coverObjectUrl = null;
        coverMime = '';
        coverEl.classList.remove('has-img');
        ambientImg.classList.remove('is-visible');
        ambientImg.style.backgroundImage = '';   // 别留着已撤销 blob URL 的引用
        fadeCover.reset();                       // 同时作废在途探针，避免旧图复活
        fadeMiniCover.reset();
        palette = null;
        THEME_KEYS.forEach((k) => document.documentElement.style.removeProperty(k));
        themeColorMetas.forEach((m, i) => m.setAttribute('content', defaultThemeColors[i]));
    }

    /* ---------------- ID3v2 解析（流式读取，取封面 / 兜底信息） ---------------- */
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
     */
    async function fetchId3(url) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (!res.body || !res.body.getReader) {
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

    /**
     * 读取曲目 ID3：清单曲目只取封面（文本以 music.json 为准），
     * 固定首曲不在清单里，连文本一起取。
     */
    async function loadMetadata(track, applyText) {
        const token = ++coverToken;
        try {
            const u8 = await fetchId3(withCache(track.url));
            if (token !== coverToken) return;   // 期间已切歌，丢弃
            const info = u8 && parseId3(u8);
            if (!info) return;

            if (applyText) {
                const title = info.title || track.name;
                const artist = info.artist || track.artist;
                track.name = title;
                track.artist = artist;
                // 只有真的解析出文本帧才算「已定稿」；标签存在但没有 TIT2/TPE1 时
                // 不能打这个标记，否则清单里的真实曲名会被兜底占位符顶掉
                track.id3Text = !!(info.title || info.artist);
                applyMeta({ title, artist });
                updateTrackRowText(currentIndex);
            }
            setupMediaSession(coverObjectUrl);

            if (info.picture && 'Blob' in window) {
                coverMime = info.picture.mime || '';
                const blob = new Blob([info.picture.data], { type: info.picture.mime });
                const url = URL.createObjectURL(blob);
                if (token !== coverToken) {
                    try { URL.revokeObjectURL(url); } catch (_) { /* 忽略 */ }
                    return;
                }
                applyCover(url);
                setupMediaSession(url);
            }
        } catch (err) {
            // 解析失败不影响播放，保留清单元数据
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

    // token 为代次守卫：解码要几帧，期间可能已切歌，
    // 迟到的取色会把上一首的色调盖到正在播放的新曲上
    async function extractPalette(url, token) {
        try {
            const img = new Image();
            img.src = url;
            await withTimeout(img.decode(), 5000);
            if (token !== coverToken) return;   // 期间已切歌，丢弃
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
                    '--surface': c(h, 32, 98),
                    '--surface-container': c(h, 27, 95),
                    '--surface-container-high': c(h, 25, 92),
                    '--surface-container-highest': c(h, 23, 89),
                    '--on-surface': c(h, 17, 12),
                    '--on-surface-variant': c(h, 11, 40),
                },
                dark: {
                    '--primary': c(h, Math.min(s * 110, 95), 82),
                    '--on-primary': c(h, Math.min(s * 115, 80), 18),
                    '--surface': c(h, 20, 8),
                    '--surface-container': c(h, 18, 13),
                    '--surface-container-high': c(h, 16, 18),
                    '--surface-container-highest': c(h, 14, 23),
                    '--on-surface': c(h, 14, 91),
                    '--on-surface-variant': c(h, 10, 78),
                },
            };
            if (token !== coverToken) return;   // 解码期间又切了歌，别再覆盖主题
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
        const surfaces = { light: palette.light['--surface'], dark: palette.dark['--surface'] };
        themeColorMetas.forEach((m) => {
            const isDark = /dark/.test(m.media || '');
            m.setAttribute('content', isDark ? surfaces.dark : surfaces.light);
        });
    }

    darkMql.addEventListener('change', applyPalette);

    /* ---------------- 播放列表 ---------------- */
    function isPlaylistOpen() {
        return document.body.classList.contains('list-open');
    }

    function renderPlaylist() {
        playlistList.textContent = '';
        const frag = document.createDocumentFragment();
        playlist.forEach((t, i) => frag.appendChild(rowFor(t, i)));
        playlistList.appendChild(frag);
        playlistCount.textContent = `${playlist.length} 首`;
        updateCurrentTrack(false);
        syncCurrentDuration();     // 时长可能早于列表就绪，渲染后补一次，避免行停在 --:--
        measureMorphHeights();     // 曲目行数变了，列表自然高度跟着变
    }

    function rowFor(t, i) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-row ripple';

        const eq = document.createElement('span');
        eq.className = 'track-eq';
        eq.setAttribute('aria-hidden', 'true');
        for (let k = 0; k < 3; k++) eq.appendChild(document.createElement('i'));

        const date = document.createElement('span');
        date.className = 'track-date';
        date.textContent = fmtDate(t.date);

        const main = document.createElement('span');
        main.className = 'track-main';
        const name = document.createElement('span');
        name.className = 'track-name';
        name.textContent = t.name;
        const artist = document.createElement('span');
        artist.className = 'track-artist';
        artist.textContent = t.artist;
        main.append(name, artist);

        const type = document.createElement('span');
        // 类型未知时留空（零尺寸占位，见 CSS），不要替它断言「投稿」
        const typed = typeof t.official === 'boolean';
        type.className = 'track-type' + (t.official === true ? ' is-official' : '');
        type.textContent = typed ? (t.official ? '官方' : '投稿') : '';

        const dur = document.createElement('span');
        dur.className = 'track-duration';
        dur.textContent = fmtTime(t.duration);

        btn.append(eq, date, main, type, dur);
        btn.addEventListener('click', () => loadTrack(i, true));
        attachRipple(btn);
        li.appendChild(btn);
        return li;
    }

    // ID3 解析出文本后回填列表行（仅固定首曲会用到：它的文本不在清单里）。
    // 按索引定位而不是对象引用：列表合并时换了对象的话，indexOf 会得到 -1，
    // 回填会静默失效
    function updateTrackRowText(index) {
        const t = playlist[index];
        const row = playlistList.querySelectorAll('.track-row')[index];
        if (!row || !t) return;
        row.querySelector('.track-name').textContent = t.name;
        row.querySelector('.track-artist').textContent = t.artist;
    }

    // 清单没给时长时（固定首曲就是这种）用音频真实时长补齐列表显示；
    // 清单已给时长的曲目保持原样，不用文件时长覆盖。
    // 时长可能早于列表渲染就绪，所以 renderPlaylist 里也会兜一次
    function syncCurrentDuration() {
        const t = playlist[currentIndex];
        if (!t || Number.isFinite(t.duration) || !Number.isFinite(duration) || duration <= 0) return;
        t.duration = duration;
        const row = playlistList.querySelectorAll('.track-row')[currentIndex];
        if (row) row.querySelector('.track-duration').textContent = fmtTime(duration);
    }

    // 同步当前曲目高亮与播放状态；scroll=true 时把当前行滚进视野
    function updateCurrentTrack(scroll) {
        const rows = playlistList.querySelectorAll('.track-row');
        rows.forEach((row, i) => {
            const current = i === currentIndex;
            row.classList.toggle('is-current', current);
            row.classList.toggle('is-playing', current && !audio.paused);
        });
        if (scroll) {
            const row = rows[currentIndex];
            // 收起状态下列表高度为 0，跳过滚动
            if (row && playlistBody.clientHeight > 0) row.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * 拉取并规范化曲目清单；失败返回空数组（调用方保留固定首曲）。
     */
    async function fetchMeta() {
        const ctrl = new AbortController();
        try {
            // 超时即中止，别让请求在后台继续跑
            const res = await withTimeout(fetch(withCache(META_URL), { signal: ctrl.signal }),
                FETCH_TIMEOUT, () => { try { ctrl.abort(); } catch (_) { /* 忽略 */ } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data && data.list) ? data.list : [];
            if (!list.length) throw new Error('清单为空');
            return list.map((it) => ({
                name: String(it.name || '未命名曲目'),
                artist: String(it.artist || '未知歌手'),
                date: String(it.date || ''),
                official: String(it.type || '').toLowerCase() === 'official',
                duration: parseDuration(it.duration),   // "216s" / "3:36" / 216
                url: `${LOG_BASE}mp3/${encodeURIComponent(`${it.name} - ${it.artist}`)}.mp3`,
            }));
        } catch (err) {
            console.info('播放清单获取失败，仅保留固定首曲：', err && err.message);
            return [];
        } finally {
            try { ctrl.abort(); } catch (_) { /* 已结束则忽略 */ }
        }
    }

    async function loadPlaylist() {
        // 固定首曲的地址是常量（WOW_URL），不必等清单回来才知道：
        // 直接起播，让音源请求与清单请求并行，
        // 省掉「等清单返回后才开始取音频」这一个串行往返。
        // 列表先不画（画了会短暂显示「1 首」），等清单到达一次成型；
        // 期间 loadTrack 会即时更新播放器界面，观感不受影响。
        playlist = [makeWowTrack(null)];
        loadTrack(0, false);

        const fromList = await fetchMeta();
        const byNewest = fromList.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const newest = byNewest[0];
        // 就地更新固定首曲对象、保持引用不变：在途的 ID3 文本回填与音频时长回填
        // 都持有这个对象（按索引写入 playlist[0]），换成新对象会让它们全部落空
        const first = playlist[0];
        if (newest) {
            // 文字若已由 ID3 定稿，保留 ID3 的结果
            // （wow.mp3 不在清单里，文件内的标签才是唯一事实来源）
            if (!first.id3Text) {
                first.name = newest.name;
                first.artist = newest.artist;
            }
            first.date = newest.date;
            first.official = newest.official;
        }
        playlist.length = 0;
        playlist.push(first, ...byNewest.slice(1));
        renderPlaylist();
        // 首行文字此时才定稿（此前是占位或 ID3 值），同步到正在播放的标题
        if (currentIndex === 0) applyMeta({ title: first.name, artist: first.artist });
    }

    /* ---------------- 形态高度量测 ----------------
       完整形态 / 播放列表两个可折叠区域的行高写成「长度」而不是 fr：
       长度插值的进度与同一缓动下的封面飞行严格同步，
       而 fr 的插值曲线不同步（实测中段能差到 25%，观感是封面慢半拍）。
       量测期间关掉过渡，尺寸更新本身不该被当成一次形态动画。 */
    const fullInner = document.querySelector('.full-inner');
    const playlistCard = $('playlistCard');

    function measureMorphHeights() {
        root.classList.add('no-ease');
        playlistCard.classList.add('no-ease');
        // 用 offsetHeight 而不是 getBoundingClientRect：入场动画会给卡片加 scale，
        // 缩放后的盒高测出来偏小，会把行高定低、把内容裁掉几像素
        const fullH = fullInner.offsetHeight;
        const listH = playlistList.offsetHeight;
        if (fullH > 0) root.style.setProperty('--full-h', `${fullH}px`);
        if (listH > 0) playlistCard.style.setProperty('--list-h', `${listH}px`);
        void root.offsetWidth;              // 提交新尺寸后再恢复过渡
        root.classList.remove('no-ease');
        playlistCard.classList.remove('no-ease');
    }

    new ResizeObserver(measureMorphHeights).observe(fullInner);
    new ResizeObserver(measureMorphHeights).observe(playlistList);

    /* ---------------- 封面飞行（共享元素缩放） ----------------
       卡片在「完整形态 ⇄ 长胶囊」之间收放时，封面作为共享元素一起缩放：
       位置、尺寸、圆角由 CSS 过渡插值，与卡片行高共用 --morph-duration
       和同一条缓动曲线，因此速率天然一致。
       飞行层绝对定位在 .player-card 内：坐标全部是卡片局部坐标，
       卡片自身的位移由 DOM 自动携带，不存在逐帧跟随误差。
       两个端点在两种形态下都是布局常量（大封面恒在 (pad, pad)，
       胶囊封面恒在 .player-mini 内的固定偏移），随时可量、无需切换状态，
       也就不会污染 CSS 过渡的起始样式。 */
    let flyEl = null;
    let flyTarget = null;      // 当前飞行的终态几何
    let flyWatcher = 0;        // 收尾轮询的 rAF id

    const rectInCard = (el) => {
        const r = el.getBoundingClientRect();
        const c = root.getBoundingClientRect();
        return { left: r.left - c.left, top: r.top - c.top, width: r.width, height: r.height };
    };

    // 胶囊封面在「列表已展开」终态的卡片局部位置：
    // miniCover 相对 .player-mini 的偏移恒定（绝对定位定高的 .mini-inner），
    // 展开终态 .player-mini 顶边与卡片顶边重合，故 top 即该偏移。
    // 收起态若直接量卡片坐标会得到卡片底部（第二行顶边在卡底），必须用偏移换算。
    function miniCoverLocal() {
        const m = miniCover.getBoundingClientRect();
        const p = playerMini.getBoundingClientRect();
        const c = root.getBoundingClientRect();
        return { left: m.left - c.left, top: m.top - p.top, width: m.width, height: m.height };
    }

    const radiusOf = (el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;

    function coverSrc() {
        const front = coverImgAlt.classList.contains('is-front') ? coverImgAlt : coverImg;
        return front.getAttribute('src') || '';
    }

    function cancelCoverFlight() {
        if (flyWatcher) { cancelAnimationFrame(flyWatcher); flyWatcher = 0; }
        if (flyEl) { flyEl.remove(); flyEl = null; }
        flyTarget = null;
        document.body.classList.remove('cover-flying');
    }

    // 飞行层到位就收尾（移除飞行层、恢复两处封面）。
    // 三条触发路径互为兜底：transitionend 是常规路径；
    // 逐帧轮询覆盖「反向终点恰好等于当前几何、过渡根本没发生」的情况
    // （此时没有 transitionend，飞行层会残留、两处封面一直被隐藏）；
    // 切换时再同步查一次，则连一帧都不必等。
    function settleCoverFlight() {
        if (!flyEl || !flyTarget) { cancelCoverFlight(); return true; }
        const cs = getComputedStyle(flyEl);
        const near = (v, target) => Math.abs(parseFloat(v) - target) < .5;
        if (near(cs.left, flyTarget.left) && near(cs.top, flyTarget.top) &&
            near(cs.width, flyTarget.width) && near(cs.height, flyTarget.height)) {
            cancelCoverFlight();
            return true;
        }
        return false;
    }

    function watchCoverFlight() {
        if (flyWatcher) return;
        const tick = () => {
            flyWatcher = 0;
            if (!settleCoverFlight()) flyWatcher = requestAnimationFrame(tick);
        };
        flyWatcher = requestAnimationFrame(tick);
    }

    // open=true：收起为胶囊（大封面 → 胶囊封面）；false：展开回完整形态
    function flyCover(open) {
        const src = coverSrc();
        if (!src || reduceMotionMql.matches) { cancelCoverFlight(); return; }

        const to = open ? miniCoverLocal() : rectInCard(coverEl);
        const r1 = open ? radiusOf(miniCover) : radiusOf(coverEl);

        if (flyEl) {
            // 中途反向：保持飞行层当前几何，只把终点改回去。
            // 浏览器会自动按已飞比例缩短反向时长，与卡片行高的反向过渡同步。
            flyEl.style.backgroundImage = `url("${src}")`;
            flyEl.style.left = `${to.left}px`;
            flyEl.style.top = `${to.top}px`;
            flyEl.style.width = `${to.width}px`;
            flyEl.style.height = `${to.height}px`;
            flyEl.style.borderRadius = `${r1}px`;
            flyTarget = { ...to };
            settleCoverFlight();
            watchCoverFlight();
            return;
        }

        // 起点几何：取当前形态下可见封面的真实位置
        const from = open ? rectInCard(coverEl) : miniCoverLocal();
        const r0 = open ? radiusOf(coverEl) : radiusOf(miniCover);
        if (from.width < 1) { cancelCoverFlight(); return; }

        flyEl = document.createElement('div');
        flyEl.className = 'cover-fly';
        flyEl.style.backgroundImage = `url("${src}")`;
        flyEl.style.left = `${from.left}px`;
        flyEl.style.top = `${from.top}px`;
        flyEl.style.width = `${from.width}px`;
        flyEl.style.height = `${from.height}px`;
        flyEl.style.borderRadius = `${r0}px`;
        root.appendChild(flyEl);
        document.body.classList.add('cover-flying');
        flyEl.addEventListener('transitionend', (e) => {
            if (e.target === flyEl && e.propertyName === 'width') settleCoverFlight();
        });

        // 先无过渡地落到起点并提交样式，再开启过渡飞向终点
        void flyEl.offsetWidth;
        flyEl.classList.add('is-flying');
        flyEl.style.left = `${to.left}px`;
        flyEl.style.top = `${to.top}px`;
        flyEl.style.width = `${to.width}px`;
        flyEl.style.height = `${to.height}px`;
        flyEl.style.borderRadius = `${r1}px`;
        flyTarget = { ...to };
        watchCoverFlight();
    }

    /* ---------------- 播放列表开关 ---------------- */
    function setPlaylistOpen(open) {
        document.body.classList.toggle('list-open', open);
        btnPlaylist.setAttribute('aria-expanded', open ? 'true' : 'false');
        btnPlaylist.setAttribute('aria-label', open ? '收起播放列表' : '打开播放列表');
        // 折叠的内容不可聚焦，防止 Tab / 点击落到看不见的控件上
        playerFull.inert = open;
        playerMini.inert = !open;
        playlistBody.inert = !open;
        // 与卡片形变同帧起飞；两端点都是常量，先切后飞不影响几何
        flyCover(open);
        // 等形变结束后再把当前曲目滚进视野，避免动画中被强制滚动
        if (open) setTimeout(() => updateCurrentTrack(true), 680);
    }

    btnPlaylist.addEventListener('click', () => setPlaylistOpen(!isPlaylistOpen()));
    btnMiniOpen.addEventListener('click', () => setPlaylistOpen(false));

    /* ---------------- 启动 ---------------- */
    measureTrack();
    renderProgress(0);
    applyMeta({ ...FALLBACK_META });
    playerMini.inert = true;
    playlistBody.inert = true;
    measureMorphHeights();
    // 字体变化会影响两处自然高度，加载完再量一次
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMorphHeights);
    loadPlaylist();
})();
