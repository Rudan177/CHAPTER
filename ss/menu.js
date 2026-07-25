document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    var menuBtn = document.getElementById('ssMenuBtn');
    var menuPanel = document.getElementById('ssMenuPanel');
    var themeItem = document.getElementById('ssThemeItem');
    var fontItem = document.getElementById('ssFontItem');
    var html = document.documentElement;
    var isOpen = false;
    var LOCK_KEY = 'ss_theme_lock';

    if (!menuBtn || !menuPanel || !themeItem || !fontItem) return;

    // 更新主题图标（检测实际视觉主题）
    function updateThemeIcon() {
        var theme = html.getAttribute('data-theme');
        if (!theme) {
            // 系统跟随模式 → 读取系统偏好
            theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        var isDark = theme === 'dark';
        themeItem.innerHTML = (isDark
            ? '<span class="material-icons">light_mode</span>'
            : '<span class="material-icons">dark_mode</span>')
            + '<svg class="lock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="20" height="20" fill="currentColor"><path d="M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z" /></svg>';
    }

    // 更新锁定状态
    function updateLockState() {
        var locked = localStorage.getItem(LOCK_KEY);
        themeItem.classList.toggle('locked', !!locked);
    }

    // 应用主题（不保存到 localStorage）
    function setTheme(theme) {
        html.setAttribute('data-theme', theme);
    }

    // 切换到系统跟随（清除 data-theme，让 @media 接管）
    function followSystem() {
        html.removeAttribute('data-theme');
    }

    // 初始化
    function initTheme() {
        var locked = localStorage.getItem(LOCK_KEY);
        if (locked) {
            // 锁定状态：恢复锁定的主题
            setTheme(locked);
        } else {
            // 未锁定：跟随系统
            followSystem();
        }
        updateThemeIcon();
        updateLockState();
    }

    // 切换菜单
    function toggleMenu(open) {
        isOpen = open !== undefined ? open : !isOpen;
        menuBtn.classList.toggle('open', isOpen);
        menuPanel.classList.toggle('open', isOpen);
    }

    // 关闭菜单（点击外部）
    function closeMenu(e) {
        if (!isOpen) return;
        if (menuBtn.contains(e.target) || menuPanel.contains(e.target)) return;
        toggleMenu(false);
    }

    // ---- 事件绑定 ----

    menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMenu();
    });

    // 主题切换（左键：临时切换，不保存）
    themeItem.addEventListener('click', function (e) {
        e.stopPropagation();
        var current = html.getAttribute('data-theme');
        if (!current) {
            // 系统跟随状态 → 检测当前系统主题
            var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            setTheme(systemDark ? 'light' : 'dark');
        } else {
            var next = current === 'dark' ? 'light' : 'dark';
            setTheme(next);
        }
        // 解锁（切换即解除锁定）
        localStorage.removeItem(LOCK_KEY);
        updateThemeIcon();
        updateLockState();
        setTimeout(function () { toggleMenu(false); }, 200);
    });

    // 主题锁定（右键：锁定当前主题到 localStorage）
    themeItem.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var locked = localStorage.getItem(LOCK_KEY);
        if (locked) {
            // 已锁定 → 解锁
            localStorage.removeItem(LOCK_KEY);
            followSystem();
        } else {
            // 未锁定 → 锁定当前主题
            var current = html.getAttribute('data-theme');
            if (!current) {
                // 系统跟随中 → 检测系统主题并锁定
                current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                setTheme(current);
            }
            localStorage.setItem(LOCK_KEY, current);
        }
        updateThemeIcon();
        updateLockState();
        // 不关闭菜单，让用户看到锁定反馈
    });

    // 字体切换
    fontItem.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof toggleFont !== 'function') return;
        toggleFont();
        setTimeout(function () { toggleMenu(false); }, 200);
    });

    // 点击页面其它区域关闭
    document.addEventListener('click', closeMenu);

    // 监听系统深色模式变化（未锁定时自动跟随）
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', function () {
        if (!localStorage.getItem(LOCK_KEY)) {
            followSystem();
            updateThemeIcon();
        }
    });

    // 监听主题变化同步图标
    var themeObserver = new MutationObserver(function () {
        updateThemeIcon();
    });
    themeObserver.observe(html, { attributes: true, attributeFilter: ['data-theme'] });

    // 启动
    initTheme();
});
