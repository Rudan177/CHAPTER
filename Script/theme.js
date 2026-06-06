// 主题切换与字体切换
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;

let themeLocked = localStorage.getItem('themeLocked') === 'true';

function getAutoTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    updateThemeToggleUI(theme);
}

function updateThemeToggleUI(theme) {
    const moonIcon = themeToggle.querySelector('.moon-icon');
    const sunIcon = themeToggle.querySelector('.sun-icon');

    if (!moonIcon || !sunIcon) return;

    if (theme === 'dark') {
        moonIcon.style.display = 'none';
        sunIcon.style.display = 'inline';
    } else {
        moonIcon.style.display = 'inline';
        sunIcon.style.display = 'none';
    }
}

function updateLockIndicator() {
    themeToggle.classList.toggle('locked', themeLocked);
}

function applyFont(font) {
    const fontToggle = document.getElementById('fontToggle');
    if (font === 'serif') {
        html.setAttribute('data-font', 'serif');
        if (fontToggle) fontToggle.style.fontFamily = "'HMSC', sans-serif";
    } else {
        html.removeAttribute('data-font');
        if (fontToggle) fontToggle.style.fontFamily = "serif";
    }
}

function toggleFont() {
    const currentFont = html.getAttribute('data-font');
    const newFont = currentFont === 'serif' ? 'hmsc' : 'serif';
    applyFont(newFont);
    localStorage.setItem('font', newFont);
}

const savedFont = localStorage.getItem('font');
if (savedFont) {
    applyFont(savedFont);
} else {
    applyFont('hmsc');
}

const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    applyTheme(savedTheme);
} else {
    applyTheme(getAutoTheme());
}
updateLockIndicator();

themeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
});

themeToggle.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    themeLocked = !themeLocked;
    localStorage.setItem('themeLocked', themeLocked);

    if (themeLocked) {
        localStorage.setItem('theme', html.getAttribute('data-theme'));
    }

    updateLockIndicator();

    const lockStatus = themeLocked ? '已锁定' : '已解锁';
    showLockToast(lockStatus);
});

function showLockToast(status) {
    const existingToast = document.querySelector('.theme-toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'theme-toast';
    toast.textContent = `主题模式${status}`;
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--menu-bg);
        backdrop-filter: blur(10px);
        color: var(--menu-text);
        padding: 15px 30px;
        border-radius: 12px;
        font-family: var(--font-family);
        font-size: 16px;
        z-index: 10000;
        animation: toastFadeIn 0.3s ease;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!themeLocked && !localStorage.getItem('theme')) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
    });
}
