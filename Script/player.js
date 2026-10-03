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

    // 右键菜单「投稿」跳转的外部表单
    const SUBMIT_FORM_URL = 'https://shimo.im/forms/5bqndOGJndsxV4Ay/fill';

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
    const sliderBubble = $('sliderBubble');
    const sliderBubbleTime = $('sliderBubbleTime');
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
    const menuLayer = $('menuLayer');
    const playerMenu = $('playerMenu');
    const menuDownloadCover = $('menuDownloadCover');
    const menuDownloadLyrics = $('menuDownloadLyrics');

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

    /* 右键菜单的三个显示开关；默认歌词关、播放列表与上下曲开 */
    const prefs = { lyrics: false, playlist: true, trackNav: true };
    let lyrics = [];     // 当前曲目的歌词行 [{ t: 秒, text }]，按时间升序
    let lyricRaw = '';   // 当前曲目 USLT 的 LRC 原文，供「下载歌词」去时间戳导出
    let lyricIdx = -1;   // 已显示的歌词行下标；-1 = 还没到第一句（回落歌手名）
    let lyricLine = null;   // 当前该显示的歌词；null 表示回落歌手名

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
    let hoverRatio = null;        // 悬停时指针所在的轨道比例；指针离开后置空
    const THUMB_HOT_PX = 14;      // 「碰到手柄」的判定半径（px）
    let thumbHotLatched = false;  // 松手后先回到细态，指针离开手柄再靠近才重新变宽

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
        // 播放推进会让手柄从指针底下滑走，悬停期间同步复检一次「是否还碰着手柄」
        if (hoverRatio !== null) updateThumbHot(hoverRatio);
        // 歌词跟着进度走：这里同时覆盖播放逐帧、暂停时的 timeupdate、拖动预览与跳转
        updateLyric(current);
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

    /* 时间气泡：ratio 是 0~1 的轨道比例，两端贴边避免气泡滑出卡片；
       拖动中直接由 CSS 取消位置过渡，所以这里逐帧写入即可跟手 */
    function renderBubble(time, ratio) {
        if (trackWidth <= 0) return;
        const x = clamp(ratio, 0, 1) * trackWidth;
        const bw = sliderBubble.offsetWidth;
        const cx = bw > 0 && trackWidth > bw ? clamp(x, bw / 2, trackWidth - bw / 2) : x;
        sliderBubble.style.setProperty('--bx', `${cx.toFixed(1)}px`);
        sliderBubbleTime.textContent = fmtTime(time);
    }

    function hideBubble() {
        slider.classList.remove('is-hovering');
    }

    /* 手柄变宽只由「真的碰到手柄」触发：按指针与手柄中心的横向距离判定，
       而不是整条 48px 高的滑条区域都算命中 */
    function setThumbHot(on) {
        slider.classList.toggle('is-thumb-hot', on);
    }

    function updateThumbHot(ratio) {
        if (isDragging) return;
        if (!trackWidth || !isFiniteDuration() || duration <= 0) { setThumbHot(false); return; }
        const cur = clamp(audio.currentTime / duration, 0, 1);
        const near = Math.abs(ratio - cur) * trackWidth <= THUMB_HOT_PX;
        if (thumbHotLatched) {
            // 刚松手时指针恰好压在手柄上，先保持细态，等指针离开后再靠近才点亮
            if (!near) thumbHotLatched = false;
            setThumbHot(false);
            return;
        }
        setThumbHot(near);
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

    slider.addEventListener('pointerenter', (e) => {
        if (!isFiniteDuration()) return;
        const r = posFromEvent(e);
        hoverRatio = r;
        slider.classList.add('is-hovering');
        renderBubble(r * duration, r);
        updateThumbHot(r);
    });

    slider.addEventListener('pointerdown', (e) => {
        if (!isFiniteDuration()) return;
        e.preventDefault();
        measureTrack();
        isDragging = true;
        thumbHotLatched = false;
        setThumbHot(false);          // 抬起后由 is-dragging 接管变宽
        hoverRatio = posFromEvent(e);
        seekPreview = hoverRatio * duration;
        slider.classList.add('is-dragging');
        slider.setPointerCapture(e.pointerId);
        renderProgress(seekPreview);
        renderBubble(seekPreview, duration > 0 ? seekPreview / duration : 0);
    });

    slider.addEventListener('pointermove', (e) => {
        if (isDragging) {
            hoverRatio = posFromEvent(e);
            seekPreview = hoverRatio * duration;
            renderProgress(seekPreview);
            renderBubble(seekPreview, duration > 0 ? seekPreview / duration : 0);
            return;
        }
        // 悬停预览：气泡跟随指针，显示该位置对应的时间
        if (!isFiniteDuration()) return;
        const r = posFromEvent(e);
        hoverRatio = r;
        slider.classList.add('is-hovering');
        renderBubble(r * duration, r);
        updateThumbHot(r);
    });

    slider.addEventListener('pointerleave', () => {
        hoverRatio = null;
        thumbHotLatched = false;
        setThumbHot(false);
        hideBubble();
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
        // 松手后手柄正好停在指针下：先保持细态，指针离开手柄再靠近才重新变宽
        setThumbHot(false);
        thumbHotLatched = true;
        // 鼠标松手后指针往往还在轨道上（此时不会有 leave 事件），
        // 把气泡交还给悬停预览；触屏的 leave 会紧随其后把它收起
        if (slider.classList.contains('is-hovering') && duration > 0) {
            renderBubble(audio.currentTime, audio.currentTime / duration);
        }
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
        applyArtistText();          // 暂停回落歌手名、继续播放回到当前歌词句
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
        hideBubble();
        resetLyric();                       // 先清掉上一首的歌词，避免串行
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
    // 左侧 / 右侧按钮的语义由「显示上下曲」决定：开 = 上下曲，关 = 进退 10 秒
    const onSkipBack = () => { if (prefs.trackNav) prevTrack(); else seekBy(-SEEK_STEP); };
    const onSkipFwd = () => { if (prefs.trackNav) nextTrack(); else seekBy(SEEK_STEP); };
    btnPrev.addEventListener('click', onSkipBack);
    btnMiniPrev.addEventListener('click', onSkipBack);
    btnNext.addEventListener('click', onSkipFwd);
    btnMiniNext.addEventListener('click', onSkipFwd);

    // 全局快捷键（焦点在控件上时由控件自己处理）
    window.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t instanceof Element && t.closest('button, [role="slider"], input, textarea, select')) return;
        if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); togglePlay(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); onSkipBack(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); onSkipFwd(); }
        else if (e.key === 'Escape') {
            if (!menuLayer.hidden) { e.preventDefault(); closeMenu(); }
            else if (isPlaylistOpen()) { e.preventDefault(); setPlaylistOpen(false); }
        }
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
        if (on) { closeMenu(); btnRetry.focus(); return; }
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
        miniTitle.textContent = meta.title;
        updateTitleMarquee();
        document.title = `${meta.title} · ${meta.artist} — 音乐播放器`;
        applyArtistText();
    }

    // 歌手位置：正在播放且开着歌词、且已有当前句时显示歌词，否则回落歌手名。
    // 暂停时也回落歌手名（歌词只在唱的时候跟着走）。
    // 迷你胶囊的歌手位置同步（两处都是「artist 的位置」）
    function applyArtistText() {
        const showLyric = prefs.lyrics && !audio.paused && lyricLine !== null;
        const text = showLyric ? lyricLine : currentMeta.artist;
        swapText(songArtist, text);
        swapText(miniArtist, text);
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

    // ID3 文本帧 / USLT 共用的解码：enc 是编码字节，body 是其余正文
    function decodeString(enc, body) {
        if (!body.length) return '';
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

    function decodeTextFrame(bytes) {
        return bytes.length ? decodeString(bytes[0], bytes.subarray(1)) : '';
    }

    /* USLT 帧布局：<编码> <3 字节语言码> <描述\0> <歌词正文>。
       正文是 LRC 文本；描述按同一编码以 \0 结束（UTF-16 是 00 00），先跳过去再解码 */
    function parseUslt(body) {
        if (body.length < 5) return '';
        const enc = body[0];
        let p = 4;                                  // 跳过编码字节 + 3 字节语言码
        if (enc === 1 || enc === 2) {
            while (p + 1 < body.length && !(body[p] === 0 && body[p + 1] === 0)) p += 2;
            p += 2;
        } else {
            const z = body.indexOf(0, p);
            p = z === -1 ? body.length : z + 1;
        }
        return p < body.length ? decodeString(enc, body.subarray(p)) : '';
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
            else if (id === 'USLT' && !out.lyrics) out.lyrics = parseUslt(body);
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
            // 歌词来自 mp3 内嵌的 USLT 帧（LRC 文本），不额外发请求
            lyricRaw = info.lyrics || '';
            lyrics = parseLrc(lyricRaw);
            lyricIdx = -1;
            lyricLine = null;
            updateLyric(audio.currentTime);   // 标签可能晚于起播才到达，立刻对齐到当前句
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

    /* ---------------- 歌词（LRC） ---------------- */
    // 时间标签：[mm:ss]、[mm:ss.xx]、[mm:ss.xxx]，小数分隔符也接受 ":"
    const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

    // LRC 文本 → [{ t: 秒, text }]，按时间升序；[ti:] 这类元数据行没有时间标签，自然被滤掉
    function parseLrc(raw) {
        if (!raw) return [];
        const rows = [];
        const off = raw.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
        const offset = off ? Number(off[1]) / 1000 : 0;
        for (const line of raw.split(/\r?\n/)) {
            LRC_TIME.lastIndex = 0;
            const times = [];
            let end = 0;             // 最后一个时间标签结束的位置（exec 失败会把 lastIndex 归零）
            let m;
            while ((m = LRC_TIME.exec(line))) {
                end = LRC_TIME.lastIndex;
                // 两位小数 = 百分秒，三位 = 毫秒，统一按小数位读
                times.push(Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0) - offset);
            }
            if (!times.length) continue;
            const text = line.slice(end).trim();
            if (!text) continue;                            // 间奏的空行不占位
            for (const t of times) rows.push({ t, text });  // 一句可以挂多个时间标签
        }
        return rows.sort((a, b) => a.t - b.t);
    }

    function resetLyric() {
        lyrics = [];
        lyricRaw = '';
        lyricIdx = -1;
        lyricLine = null;
    }

    // 二分找当前该显示的行；-1 = 还没到第一句
    function lyricIndexAt(t) {
        let lo = 0;
        let hi = lyrics.length - 1;
        let idx = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (lyrics[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return idx;
    }

    // 由 renderProgress 逐帧调用：只有行号真的变了才写 DOM
    function updateLyric(t) {
        if (!prefs.lyrics || !lyrics.length) return;
        const idx = lyricIndexAt(t);
        if (idx === lyricIdx) return;
        lyricIdx = idx;
        lyricLine = idx >= 0 ? lyrics[idx].text : null;
        applyArtistText();
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
        syncCalDates();            // 清单换了，日历的着色集合跟着重算
        updateCurrentTrack(false);
        syncCurrentDuration();     // 时长可能早于列表就绪，渲染后补一次，避免行停在 --:--
        measureMorphHeights();     // 曲目行数变了，列表自然高度跟着变
    }

    function rowFor(t, i) {
        const li = document.createElement('li');
        li.className = 'track-item';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-row ripple';

        const eq = document.createElement('span');
        eq.className = 'track-eq';
        eq.setAttribute('aria-hidden', 'true');
        for (let k = 0; k < 3; k++) eq.appendChild(document.createElement('i'));

        // 日期单独成一个按钮、绝对定位压在行的日期列上：点日期开日历、点别处照旧播放。
        // 不放进行按钮里是因为按钮不能嵌套（那会同时触发播放），
        // 也不做成行内 span 是因为那样键盘永远到不了日历
        const date = document.createElement('button');
        date.type = 'button';
        date.className = 'track-date';
        date.textContent = fmtDate(t.date);
        date.dataset.date = normDate(t.date);
        date.setAttribute('aria-label', `${date.textContent}，打开曲目日历`);
        // 不挂涟漪：日期这颗按钮只靠数字变色表示悬停 / 聚焦，不给它任何形状
        date.addEventListener('click', () => openCalendar(date.dataset.date, date));

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

        btn.append(eq, main, type, dur);
        btn.addEventListener('click', () => loadTrack(i, true));
        attachRipple(btn);
        li.append(btn, date);
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

    /* ---------------- 显示开关（右键菜单三项 + 持久化） ---------------- */
    const PREFS_KEY = 'player.prefs.v1';

    function loadPrefs() {
        try {
            const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            for (const k of Object.keys(prefs)) {
                if (typeof raw[k] === 'boolean') prefs[k] = raw[k];
            }
        } catch (_) { /* 隐私模式 / 数据损坏：沿用默认值 */ }
    }

    function savePrefs() {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* 忽略 */ }
    }

    function setLyrics(on) {
        prefs.lyrics = !!on;
        savePrefs();
        lyricIdx = -1;
        lyricLine = null;
        updateLyric(audio.currentTime);   // 打开时立刻对齐到当前句
        applyArtistText();                // 关闭时（或还没唱到第一句）回落歌手名
        syncMenu();
    }

    function applyPlaylistVisible() {
        document.body.classList.toggle('no-playlist', !prefs.playlist);
        // 列表不可见时不能停在「已展开」形态：那会把播放器收成胶囊却没有列表
        if (!prefs.playlist) setPlaylistOpen(false);
    }

    function setPlaylistVisible(on) {
        prefs.playlist = !!on;
        savePrefs();
        applyPlaylistVisible();
        syncMenu();
    }

    // 开 = 上一曲 / 下一曲，关 = 快退 / 快进 10 秒；图标与无障碍名称一起换
    function applyTrackNav() {
        const on = prefs.trackNav;
        document.body.classList.toggle('seek-mode', !on);
        [btnPrev, btnMiniPrev].forEach((b) => b.setAttribute('aria-label', on ? '上一曲' : '快退 10 秒'));
        [btnNext, btnMiniNext].forEach((b) => b.setAttribute('aria-label', on ? '下一曲' : '快进 10 秒'));
    }

    function setTrackNav(on) {
        prefs.trackNav = !!on;
        savePrefs();
        applyTrackNav();
        syncMenu();
    }

    /* ---------------- 下载（封面 / 歌词） ---------------- */
    const MIME_EXT = {
        'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/jpg': 'jpg',
        'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
    };

    // 文件名里的路径分隔符等在部分平台会被拒绝，统一换成下划线
    function safeFileName(name) {
        return (name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || 'untitled';
    }

    function downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 等下载真正启动再撤销，否则部分浏览器会中途取消
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function downloadCover() {
        if (!coverObjectUrl) return;
        fetch(coverObjectUrl)
            .then((res) => res.blob())
            .then((blob) => {
                const ext = MIME_EXT[(coverMime || blob.type || '').toLowerCase()] || 'jpg';
                downloadBlob(blob, `${safeFileName(currentMeta.title)} - ${safeFileName(currentMeta.artist)}.${ext}`);
            })
            .catch((err) => console.info('封面下载跳过：', err && err.message));
    }

    /* 导出纯文本歌词：剥掉所有时间标签，顺带滤掉 [ti:] / [ar:] / [offset:] 这类元数据行与空行 */
    function lyricPlainText() {
        if (!lyricRaw) return '';
        const rows = [];
        for (const line of lyricRaw.split(/\r?\n/)) {
            LRC_TIME.lastIndex = 0;      // 与 parseLrc 共用同一个正则，先归零再 replace
            const text = line.replace(LRC_TIME, '').trim();
            if (!text || /^\[[a-zA-Z#]+:/.test(text)) continue;
            rows.push(text);
        }
        return rows.join('\n');
    }

    function downloadLyrics() {
        const text = lyricPlainText();
        if (!text) return;
        downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }),
            `${safeFileName(currentMeta.title)} - ${safeFileName(currentMeta.artist)}.txt`);
    }

    /* ---------------- 投稿 ---------------- */
    // 新标签打开外部表单：调用点在 click / pointerup 的用户激活窗口内，
    // 不会被弹窗拦截
    function openSubmitForm() {
        window.open(SUBMIT_FORM_URL, '_blank', 'noopener');
    }

    /* ---------------- 右键菜单 ---------------- */
    const menuItems = [...playerMenu.querySelectorAll('.menu-item')];
    const PREF_APPLY = { lyrics: setLyrics, playlist: setPlaylistVisible, trackNav: setTrackNav };
    const MENU_ACTION = { cover: downloadCover, lyrics: downloadLyrics, submit: openSubmitForm };
    const MENU_HIDE_MS = 260;     // 与 .menu 收起过渡同长，收起动画走完再真正隐藏
    let menuHideTimer = 0;
    let menuReturnFocus = null;
    let menuDrag = null;      // 长按唤出后仍按着的那根手指 { id, touch }，用来支持「不松手拖到某一项」
    let dragItem = null;      // 手指当前划过、正在高亮的菜单项（禁用项不会落到这里）
    let dragHit = null;       // 手指压着的那个菜单项（可能被禁用），松手时据此决定做什么

    // 可聚焦项：跳掉不可用的下载项，方向键循环才不会卡在一个点不动的按钮上
    const enabledItems = () => menuItems.filter((el) => !el.disabled);

    // 指针落在哪一项上（命中项内部 svg / 文案时回到外层按钮）
    function itemAtPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        return el && el.closest ? el.closest('.menu-item') : null;
    }

    // 触屏没有 hover，划过的高亮只能自己给类；禁用项不给高亮
    function setDragItem(item) {
        // 先摘掉键盘焦点环：它和 .is-pressed 是两套高亮，同时出现就是「两个选项都亮着」。
        // 放在提前 return 之前 —— 拖到空白 / 禁用项（next 为 null）时同样要清干净
        const act = document.activeElement;
        if (act && act.classList.contains('menu-item')) act.blur();
        const next = item && !item.disabled ? item : null;
        if (next === dragItem) return;
        if (dragItem) dragItem.classList.remove('is-pressed');
        dragItem = next;
        if (!dragItem) return;
        dragItem.classList.add('is-pressed');
    }

    // 拖动期间在 body 上挂标记，用来压掉触屏「粘」着的 hover 态（见 player.css）
    const setMenuDragging = (on) => document.body.classList.toggle('menu-dragging', on);

    function updateDragHit(x, y) {
        dragHit = itemAtPoint(x, y);
        setDragItem(dragHit);
    }

    function syncMenu() {
        for (const item of menuItems) {
            const key = item.dataset.pref;
            if (key) item.setAttribute('aria-checked', prefs[key] ? 'true' : 'false');
        }
        // 当前曲目没有内嵌封面 / 歌词时，对应下载项不可用
        menuDownloadCover.disabled = !coverObjectUrl;
        menuDownloadLyrics.disabled = !lyricRaw;
    }

    /* 菜单贴指针展开：先按 8px 安全边距夹进视口，
       再把 --menu-origin 设到指针所在的那一角，缩放就从指针长出来 */
    function placeMenu(x, y) {
        const gap = 8;
        const w = playerMenu.offsetWidth;
        const h = playerMenu.offsetHeight;
        const left = clamp(x, gap, Math.max(gap, window.innerWidth - w - gap));
        const top = clamp(y, gap, Math.max(gap, window.innerHeight - h - gap));
        playerMenu.style.left = `${left}px`;
        playerMenu.style.top = `${top}px`;
        playerMenu.style.setProperty('--menu-origin',
            `${clamp(x - left, 0, w)}px ${clamp(y - top, 0, h)}px`);
    }

    function openMenu(x, y) {
        // 已经开着：只挪位置，不重播入场动画
        if (!menuLayer.hidden && playerMenu.classList.contains('is-open')) { placeMenu(x, y); return; }
        closeCalendar();                 // 两个浮层不同时开
        clearTimeout(menuHideTimer);
        menuHideTimer = 0;
        if (menuLayer.hidden) {
            menuReturnFocus = document.activeElement;
            menuLayer.hidden = false;
        }
        syncMenu();
        placeMenu(x, y);
        void playerMenu.offsetWidth;     // 先落位、提交样式，再开启过渡
        playerMenu.classList.add('is-open');
        // 焦点落在菜单容器上，而不是第一项：第一项一进菜单就亮着，
        // 会让人以为「已经选中了它」，长按拖动时还会跟拖到的那一项同时高亮。
        // 键盘照旧可用 —— 方向键从容器往下走（list.indexOf 取到 -1 → 落到第一项），
        // Esc / Tab 也仍由菜单接住
        playerMenu.focus({ preventScroll: true });
    }

    function closeMenu() {
        if (menuLayer.hidden) return;
        // 菜单若在拖选途中被别的缘由收起（滚动、失焦、Esc），手势作废，免得松手时补一次误触
        if (menuDrag && menuDrag.touch) detachDragTouch();
        menuDrag = null;
        setMenuDragging(false);
        dragHit = null;
        setDragItem(null);
        playerMenu.classList.remove('is-open');
        clearTimeout(menuHideTimer);
        menuHideTimer = setTimeout(() => {
            menuHideTimer = 0;
            menuLayer.hidden = true;
        }, MENU_HIDE_MS);
        const back = menuReturnFocus;
        menuReturnFocus = null;
        if (back instanceof HTMLElement && back !== document.body && document.contains(back)) {
            back.focus({ preventScroll: true });
        }
    }

    menuItems.forEach((item) => {
        item.addEventListener('click', () => {
            const apply = PREF_APPLY[item.dataset.pref];
            // 勾选项点了不关菜单，方便连着调（MD3 勾选菜单行为）
            if (apply) { apply(!prefs[item.dataset.pref]); return; }
            // 下载是一次性动作，做完自动收起菜单
            const act = MENU_ACTION[item.dataset.act];
            if (act) { act(); closeMenu(); }
        });
    });

    // 点菜单外的空白关闭；这一层是透明的，只负责接住那一下
    menuLayer.addEventListener('pointerdown', (e) => {
        if (e.target === menuLayer) { e.preventDefault(); closeMenu(); }
    });

    // 菜单内键盘：方向键循环聚焦（跳过不可用项），Home/End 到首尾，Esc 关闭，Tab 走出即收起
    playerMenu.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
        if (e.key === 'Tab') { closeMenu(); return; }
        const list = enabledItems();
        if (!list.length) return;
        if (e.key === 'Home') { e.preventDefault(); list[0].focus(); return; }
        if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        const i = list.indexOf(document.activeElement);
        const d = e.key === 'ArrowDown' ? 1 : -1;
        const base = i < 0 ? (d > 0 ? -1 : list.length) : i;
        list[(base + d + list.length) % list.length].focus();
    });

    window.addEventListener('resize', () => closeMenu());
    window.addEventListener('blur', () => closeMenu());
    // 页面或列表一滚动菜单就脱离锚点，直接收起（capture 才能听到列表内部滚动）。
    // 菜单自己内部滚动（内容比视口高时）不算脱离锚点，不收起
    window.addEventListener('scroll', (e) => {
        // 注意 e.target 未必是节点（合成事件 / 非元素目标），contains 传非节点会抛错
        const t = e.target;
        if (t === playerMenu || (t instanceof Node && playerMenu.contains(t))) return;
        closeMenu();
    }, true);

    /* 封死原生右键菜单：里面藏着「音频另存为 / 复制音频地址」，是抓取 mp3 最省事的入口。
       只压默认行为，不拦事件 —— 卡片自己的 contextmenu 监听在冒泡更早的一层，
       仍会正常唤出上面的自定义菜单（与本项目其他页面 FB/TTT 的做法一致） */
    document.addEventListener('contextmenu', (e) => e.preventDefault());

    /* 拖出去即另存为：封面、音频、链接一律禁止起拖 */
    document.addEventListener('dragstart', (e) => e.preventDefault());

    // 桌面右键
    root.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const r = root.getBoundingClientRect();
        // 键盘（Shift+F10 / 菜单键）触发时坐标是 0,0，那就锚到卡片中间
        openMenu(e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2);
    });

    /* 触屏长按唤出：iOS 不会派发 contextmenu，只能自己判定。
       按下后移动超过阈值（即开始滚动）就取消 */
    const LONG_PRESS_MS = 500;
    const LONG_PRESS_MOVE = 10;
    let pressTimer = 0;
    let pressFrom = null;
    let suppressClick = false;   // 长按唤出后，抑制松手时落到按钮上的那一次 click

    root.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' || e.button !== 0) return;
        suppressClick = false;
        pressFrom = { x: e.clientX, y: e.clientY };
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
            pressTimer = 0;
            suppressClick = true;
            openMenu(e.clientX, e.clientY);
            // 菜单开了但手指还按着：接着移到哪一项就高亮哪一项，松手即执行
            menuDrag = { id: e.pointerId, touch: e.pointerType === 'touch' };
            if (menuDrag.touch) attachDragTouch();
            setMenuDragging(true);
            updateDragHit(e.clientX, e.clientY);
        }, LONG_PRESS_MS);
    });

    root.addEventListener('pointermove', (e) => {
        if (!pressTimer || !pressFrom) return;
        if (Math.hypot(e.clientX - pressFrom.x, e.clientY - pressFrom.y) > LONG_PRESS_MOVE) {
            clearTimeout(pressTimer);
            pressTimer = 0;
        }
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        root.addEventListener(type, () => { clearTimeout(pressTimer); pressTimer = 0; });
    });

    /* 唤出后不松手继续拖到目标项。
       坑：手机上一动超过 ~10px，浏览器就判定成滚动并派发 pointercancel，
       此后 pointer 事件流彻底断掉（只剩 touch 事件，且目标仍钉在起始元素上）。
       所以拖动这段以 touch 事件为准，顺带 preventDefault 把并行的滚动按掉；
       pointer 那条路只在手势没被接管时兜一下。
       这几个监听按需挂/摘 —— 常驻的非 passive touchmove 会拖慢整页滚动 */
    function onDragTouchMove(e) {
        if (!menuDrag) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        if (e.cancelable) e.preventDefault();
        updateDragHit(t.clientX, t.clientY);
    }

    function onDragTouchEnd(e) {
        if (!menuDrag) return;
        const t = e.changedTouches && e.changedTouches[0];
        if (t) updateDragHit(t.clientX, t.clientY);
        finishMenuDrag(true);
    }

    const onDragTouchCancel = () => finishMenuDrag(false);

    function attachDragTouch() {
        window.addEventListener('touchmove', onDragTouchMove, { passive: false, capture: true });
        window.addEventListener('touchend', onDragTouchEnd, true);
        window.addEventListener('touchcancel', onDragTouchCancel, true);
    }

    function detachDragTouch() {
        window.removeEventListener('touchmove', onDragTouchMove, { capture: true });
        window.removeEventListener('touchend', onDragTouchEnd, true);
        window.removeEventListener('touchcancel', onDragTouchCancel, true);
    }

    window.addEventListener('pointermove', (e) => {
        if (!menuDrag || e.pointerId !== menuDrag.id) return;
        updateDragHit(e.clientX, e.clientY);
    }, true);

    // 松手：落在某项上就执行它，落在空白处就按「点空白」处理，收起菜单
    function finishMenuDrag(commit) {
        if (!menuDrag) return;
        const wasTouch = menuDrag.touch;
        menuDrag = null;
        setMenuDragging(false);
        if (wasTouch) detachDragTouch();
        const hit = dragHit;
        dragHit = null;
        setDragItem(null);
        if (!commit) return;      // 手势被系统接管，菜单留着，只是不高亮了
        if (hit && !hit.disabled) hit.click();
        else if (!hit) closeMenu();   // 落在空白处：跟点空白一个意思
        // 落在禁用项上：什么都不做，菜单也留着
        // 这一次 click 仍要由 suppressClick 吞掉（手指可能又拖回卡片上了），
        // 但得等它派发完再复位，否则拖回按钮上松手会真的把按钮按下去
        setTimeout(() => { suppressClick = false; }, 0);
    }

    window.addEventListener('pointerup', () => finishMenuDrag(true), true);
    // 触屏的 pointercancel 是「浏览器接管了手势」而非「用户松手」：
    // 这时交给 touch 那条路继续跟，不能在这里把拖动判定掉
    window.addEventListener('pointercancel', () => {
        if (menuDrag && !menuDrag.touch) finishMenuDrag(false);
    }, true);

    root.addEventListener('click', (e) => {
        if (!suppressClick) return;
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    /* ---------------- 曲目日历 ----------------
       行内日期唤出。范围每次打开时按「清单里的日期 + 当前时间」实时算：
       下界 = 最早一首曲目的月份，上界 = max(最新曲目月份, 当月)。
       于是曲目只到 2026-10 时就只有 9、10 月，到 11 月自然多出 11 月。
       有曲目的日子着色；选中某天就把列表滚到当天第一首并短暂高亮 */
    const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];
    const CAL_HIDE_MS = 260;     // 与 .calendar 收起过渡同长

    const calLayer = $('calLayer');
    const calendarEl = $('calendar');
    const calGrid = $('calGrid');
    const calWeekdays = $('calWeekdays');
    const calTitle = $('calTitle');
    const calPicker = $('calPicker');
    const calMonths = $('calMonths');
    const calYearLabel = $('calYearLabel');
    const calPrevMonth = $('calPrevMonth');
    const calNextMonth = $('calNextMonth');
    const calPrevYear = $('calPrevYear');
    const calNextYear = $('calNextYear');
    // playlistCard 复用形态量测段已取好的引用（见 measureMorphHeights 一带）

    let calDates = new Set();      // 有曲目的日期 'YYYYMMDD'
    let calMonthSet = new Set();   // 有曲目的月份 'YYYYMM'
    let calMinIdx = 0;             // 可浏览范围（月序号，见 monthIndex），由 computeCalRange 写入
    let calMaxIdx = 0;
    let calY = new Date().getFullYear();      // 当前展示的年月
    let calM = new Date().getMonth() + 1;
    let calPickY = calY;           // 年 / 月选择层正在浏览的年份
    let calSelected = '';          // 选中的日期
    let calAnchor = null;          // 唤出日历的那颗日期按钮（贴靠与动画原点用）
    let calReturnFocus = null;
    let calHideTimer = 0;
    let calLocateTimer = 0;

    // 'YYYYMMDD'；也容忍 'YYYY-MM-DD' / 'YYYY.MM.DD'，取不到给空串
    function normDate(v) {
        const s = String(v || '').trim();
        if (/^\d{8}$/.test(s)) return s;
        const m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        return m ? `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}` : '';
    }

    const ymd = (y, m, d) => `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
    const monthKey = (y, m) => `${y}${String(m).padStart(2, '0')}`;
    const monthIndex = (y, m) => y * 12 + (m - 1);

    /* 可浏览范围：清单里的最早 / 最晚月份，上界再和「当月」取大。
       每次打开日历都重算一次，所以页面开着跨月、或清单新增了曲目，
       范围都会自己跟上，不需要手改常量 */
    function computeCalRange() {
        const now = new Date();
        const nowIdx = monthIndex(now.getFullYear(), now.getMonth() + 1);
        let lo = Infinity, hi = -Infinity;
        for (const t of playlist) {
            const d = normDate(t.date);
            if (!d) continue;
            const idx = monthIndex(Number(d.slice(0, 4)), Number(d.slice(4, 6)));
            if (idx < lo) lo = idx;
            if (idx > hi) hi = idx;
        }
        if (!Number.isFinite(lo)) { lo = nowIdx; hi = nowIdx; }   // 清单还没到：只给当月
        else if (nowIdx > hi) hi = nowIdx;
        calMinIdx = lo;
        calMaxIdx = hi;
    }

    // 清单日期 → 着色用的两个集合（日级 + 月级）
    function syncCalDates() {
        calDates = new Set();
        calMonthSet = new Set();
        for (const t of playlist) {
            const d = normDate(t.date);
            if (!d) continue;
            calDates.add(d);
            calMonthSet.add(d.slice(0, 6));
        }
        computeCalRange();
    }

    function renderCalendar() {
        // 翻月 / 跳月后选中的日子可能已经不在展示的月份里，
        // 那样方向键会从别月那一格出发、一按就跳回去。统一把选中收进当月
        if (calSelected.slice(0, 6) !== monthKey(calY, calM)) calSelected = ymd(calY, calM, 1);
        calTitle.textContent = `${calY}年${calM}月`;
        const firstDow = new Date(calY, calM - 1, 1).getDay();   // 周日 = 0
        const frag = document.createDocumentFragment();
        // 固定 6 行 42 格：翻月时日历高度不跳
        for (let i = 0; i < 42; i++) {
            const dt = new Date(calY, calM - 1, 1 - firstDow + i);
            const y = dt.getFullYear(), m = dt.getMonth() + 1, d = dt.getDate();
            const key = ymd(y, m, d);
            const outside = m !== calM;         // 补齐格：相邻月，不可点
            const has = !outside && calDates.has(key);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cal-day';
            btn.textContent = String(d);
            btn.dataset.date = key;
            btn.disabled = outside;
            if (outside) btn.classList.add('is-out');
            if (has) btn.classList.add('has-tracks');
            if (key === calSelected && !outside) {
                btn.classList.add('is-selected');
                btn.setAttribute('aria-pressed', 'true');
            }
            btn.setAttribute('aria-label', `${y}年${m}月${d}日${has ? '，有曲目' : ''}`);
            frag.appendChild(btn);
        }
        calGrid.replaceChildren(frag);
        const idx = monthIndex(calY, calM);
        calPrevMonth.disabled = idx <= calMinIdx;
        calNextMonth.disabled = idx >= calMaxIdx;
    }

    /* 年 / 月层只列范围内的月份：曲目只到 10 月、当下也是 10 月，
       这里就只有 9 月与 10 月两格，不摆一排点不动的灰药丸 */
    function renderMonthPicker() {
        const minY = Math.floor(calMinIdx / 12);
        const maxY = Math.floor(calMaxIdx / 12);
        calYearLabel.textContent = `${calPickY}年`;
        calPrevYear.disabled = calPickY <= minY;
        calNextYear.disabled = calPickY >= maxY;
        const frag = document.createDocumentFragment();
        for (let m = 1; m <= 12; m++) {
            const idx = monthIndex(calPickY, m);
            if (idx < calMinIdx || idx > calMaxIdx) continue;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cal-month';
            btn.textContent = `${m}月`;
            btn.dataset.month = String(m);
            if (calMonthSet.has(monthKey(calPickY, m))) btn.classList.add('has-tracks');
            if (calPickY === calY && m === calM) {
                btn.classList.add('is-current');
                btn.setAttribute('aria-current', 'true');
            }
            btn.setAttribute('aria-label', `${calPickY}年${m}月`);
            frag.appendChild(btn);
        }
        calMonths.replaceChildren(frag);
    }

    // pick=true 切到年 / 月选择层，false 回日期网格
    function setCalMode(pick) {
        // 切换会把原来那颗带焦点的按钮藏起来，浏览器随即把焦点丢回 body，
        // 而 focusout 会把日历当成「焦点移出」收掉。统一把焦点落到标题上
        // （两种视图都在，且它本来就是模式开关）
        const act = document.activeElement;
        const losing = act && act !== calTitle && calendarEl.contains(act)
            && (act.closest('.cal-picker') || act.closest('.cal-grid'));
        calPicker.hidden = !pick;
        calGrid.hidden = pick;
        calWeekdays.hidden = pick;
        // 年 / 月层自带年份步进，月份箭头在这里只会让人以为「改的是选择层的月份」
        calPrevMonth.hidden = pick;
        calNextMonth.hidden = pick;
        calendarEl.classList.toggle('is-picking', pick);
        calTitle.setAttribute('aria-expanded', pick ? 'true' : 'false');
        if (pick) {
            calPickY = calY;
            renderMonthPicker();
        } else {
            renderCalendar();
        }
        if (losing) calTitle.focus({ preventScroll: true });
        placeCalendar(calAnchor);      // 两种形态高度不同，重新贴一次
    }

    // 翻月 / 翻年撞到边界时，刚点的那颗箭头会被置 disabled，浏览器随即把焦点
    // 从禁用按钮上摘掉丢回 body，于是「焦点移出即收起」的监听把日历收掉了
    // （用户现象：点一下切月，日历直接消失）。
    // 坑：置 disabled 的那一下**不会**同步摘焦点，浏览器要等本次 click 处理完
    // 才 blur，所以此刻 activeElement 仍是那颗按钮、看不出「要出事」——判据只能
    // 看按钮还不可用，不能看焦点在哪
    function keepCalFocus(fallbackEl) {
        const target = (fallbackEl && !fallbackEl.disabled) ? fallbackEl : calTitle;
        target.focus({ preventScroll: true });
    }

    function stepMonth(delta) {
        const idx = clamp(monthIndex(calY, calM) + delta, calMinIdx, calMaxIdx);
        calY = Math.floor(idx / 12);
        calM = (idx % 12) + 1;
        renderCalendar();
        keepCalFocus(delta > 0 ? calNextMonth : calPrevMonth);
        placeCalendar(calAnchor);
    }

    function stepYear(delta) {
        calPickY = clamp(calPickY + delta, Math.floor(calMinIdx / 12), Math.floor(calMaxIdx / 12));
        renderMonthPicker();
        keepCalFocus(delta > 0 ? calNextYear : calPrevYear);
        placeCalendar(calAnchor);
    }

    // 按天数挪一格（方向键用），越界返回空串
    function shiftCalDate(key, days) {
        const dt = new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)) + days);
        const idx = monthIndex(dt.getFullYear(), dt.getMonth() + 1);
        if (idx < calMinIdx || idx > calMaxIdx) return '';
        return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
    }

    function selectCalDate(key, opts) {
        const o = opts || {};
        // 渲染会整格替换，原按钮连同焦点一起消失。焦点若本来就在格子里
        // （鼠标点 / 方向键挪），必须先记下来，稍后落到同一格的新按钮上，
        // 否则键盘就没法接着挪了
        const hadFocus = o.focus || calGrid.contains(document.activeElement);
        calSelected = key;
        const ky = Number(key.slice(0, 4)), km = Number(key.slice(4, 6));
        if (ky !== calY || km !== calM) { calY = ky; calM = km; }
        renderCalendar();
        if (hadFocus) {
            const cell = calGrid.querySelector(`[data-date="${key}"]`);
            if (cell) cell.focus({ preventScroll: true });
        }
        if (o.keepOpen) return;                       // 键盘挪格子：只改选中，不收起
        const i = playlist.findIndex((t) => normDate(t.date) === key);
        if (i < 0) return;                            // 当天没有曲目：只选中，日历留着接着挑
        closeCalendar();
        locateTrack(i);
    }

    // 把某一行滚到视野中央并短暂高亮；列表收着就先展开，等形变结束再滚
    function locateTrack(i) {
        const run = () => {
            const row = playlistList.querySelectorAll('.track-row')[i];
            if (!row) return;
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row.classList.remove('is-located');
            void row.offsetWidth;                     // 重启动画
            row.classList.add('is-located');
            clearTimeout(calLocateTimer);
            calLocateTimer = setTimeout(() => row.classList.remove('is-located'), 1800);
        };
        if (isPlaylistOpen()) run();
        else { setPlaylistOpen(true); setTimeout(run, 680); }
    }

    /* 贴靠：优先像菜单一样贴在播放列表卡片上方，上方放不下就落到下方，
       再按 8px 安全边距夹进视口；原点朝着被点的那个日期。
       贴靠位置只在「打开时」定一次 —— 那一刻显示的是较高的日期网格（最坏情况），
       之后切年 / 月层只让面板高度变化、锚定的那条边不动。
       否则从 6 行网格换成矮月份层时高度差三百多像素，面板会整块「飞」到另一个位置 */
    let calAnchorEdge = 'top';     // 锚定哪条边：'bottom' 固定底边（向上展开）/ 'top' 固定顶边
    let calAnchorY = 0;            // 那条边的视口 y
    let calPlaced = false;         // 本次打开是否已经定过位

    function placeCalendar(anchorEl) {
        const gap = 8;
        const w = calendarEl.offsetWidth;
        const h = calendarEl.offsetHeight;
        const cardRect = playlistCard.getBoundingClientRect();
        const left = clamp(cardRect.left + (cardRect.width - w) / 2, gap,
            Math.max(gap, window.innerWidth - w - gap));
        if (!calPlaced) {
            if (cardRect.top - gap - h >= gap) {
                calAnchorEdge = 'bottom';                    // 上方放得下：底边贴卡片顶
                calAnchorY = cardRect.top - gap;
            } else {
                calAnchorEdge = 'top';                       // 落到下方并夹进视口
                calAnchorY = clamp(cardRect.bottom + gap, gap,
                    Math.max(gap, window.innerHeight - h - gap));
            }
            calPlaced = true;
        }
        const top = calAnchorEdge === 'bottom' ? calAnchorY - h : calAnchorY;
        calendarEl.style.left = `${left}px`;
        calendarEl.style.top = `${top}px`;
        const a = (anchorEl && anchorEl.isConnected ? anchorEl : playlistCard).getBoundingClientRect();
        calendarEl.style.setProperty('--cal-origin',
            `${clamp(a.left + a.width / 2 - left, 0, w)}px ${clamp(a.top + a.height / 2 - top, 0, h)}px`);
    }

    function openCalendar(dateKey, anchorEl) {
        closeMenu();                       // 两个浮层不同时开
        clearTimeout(calHideTimer);
        calHideTimer = 0;
        if (calLayer.hidden) {
            calReturnFocus = anchorEl || document.activeElement;
            calLayer.hidden = false;
        }
        calAnchor = anchorEl || null;
        // 每次打开都按最新清单与当前时间重算范围（页面开着跨月也会跟上）
        syncCalDates();
        const d = normDate(dateKey);
        if (/^\d{8}$/.test(d)) {
            calSelected = d;
            calY = Number(d.slice(0, 4));
            calM = Number(d.slice(4, 6));
        }
        const idx = clamp(monthIndex(calY, calM), calMinIdx, calMaxIdx);
        calY = Math.floor(idx / 12);
        calM = (idx % 12) + 1;
        calPlaced = false;                 // 每次打开重新定贴靠（卡片位置 / 视口都可能变过）
        setCalMode(false);                 // 已开着则只重渲染，不重播入场动画
        placeCalendar(calAnchor);
        void calendarEl.offsetWidth;
        calendarEl.classList.add('is-open');
        calendarEl.focus({ preventScroll: true });
    }

    function closeCalendar() {
        if (calLayer.hidden) return;
        calendarEl.classList.remove('is-open');
        clearTimeout(calHideTimer);
        calHideTimer = setTimeout(() => {
            calHideTimer = 0;
            calLayer.hidden = true;
        }, CAL_HIDE_MS);
        const back = calReturnFocus;
        calReturnFocus = null;
        if (back instanceof HTMLElement && back !== document.body && document.contains(back)) {
            back.focus({ preventScroll: true });
        }
    }

    calWeekdays.replaceChildren(...WEEK_NAMES.map((w) => {
        const el = document.createElement('span');
        el.className = 'cal-weekday';
        el.textContent = w;
        return el;
    }));

    calGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-day');
        if (!cell || cell.disabled) return;
        selectCalDate(cell.dataset.date);
    });

    calMonths.addEventListener('click', (e) => {
        const cell = e.target.closest('.cal-month');
        if (!cell || cell.disabled) return;
        calY = calPickY;
        calM = Number(cell.dataset.month);
        setCalMode(false);
    });

    calTitle.addEventListener('click', () => setCalMode(calPicker.hidden));
    calPrevMonth.addEventListener('click', () => stepMonth(-1));
    calNextMonth.addEventListener('click', () => stepMonth(1));
    calPrevYear.addEventListener('click', () => stepYear(-1));
    calNextYear.addEventListener('click', () => stepYear(1));
    [calPrevMonth, calNextMonth, calPrevYear, calNextYear].forEach(attachRipple);

    // 日期网格里的方向键挪格子（Esc 收起，Tab 移出即收起由 focusout 负责）
    calendarEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); closeCalendar(); return; }
        if (!calPicker.hidden || !calSelected) return;      // 选择层不接管方向键
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (step === undefined) return;
        e.preventDefault();
        const next = shiftCalDate(calSelected, step);
        if (next) selectCalDate(next, { keepOpen: true, focus: true });
    });

    // 点日历外的空白收起；焦点移出（Tab 走出去）也收起
    calLayer.addEventListener('pointerdown', (e) => {
        if (e.target === calLayer) { e.preventDefault(); closeCalendar(); }
    });
    // 焦点移出即收起。必须等下一帧再判：切年 / 月层、重渲染日期格都会让
    // 焦点先掉回 body（此刻的 relatedTarget 是 null），同一帧里我们已经把
    // 焦点挪回日历内，隔一帧看就还是「没出去」，不该误收
    calendarEl.addEventListener('focusout', () => {
        requestAnimationFrame(() => {
            if (calLayer.hidden) return;
            const a = document.activeElement;
            if (a && calendarEl.contains(a)) return;
            closeCalendar();
        });
    });

    syncCalDates();      // 先算出范围（此时清单还没到，范围暂时只看当月）
    renderCalendar();

    /* ---------------- 启动 ---------------- */
    loadPrefs();
    measureTrack();
    renderProgress(0);
    applyMeta({ ...FALLBACK_META });
    syncMenu();
    applyTrackNav();
    applyPlaylistVisible();
    playerMini.inert = true;
    playlistBody.inert = true;
    measureMorphHeights();
    // 字体变化会影响两处自然高度，加载完再量一次
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureMorphHeights);
    loadPlaylist();
})();
