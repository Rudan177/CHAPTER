class ContextMenu {
    constructor() {
        this.menu = null;
        this.targetElement = null;
        this.isInputFocused = false;
        this.hasSelectedText = false;
        this.init();
    }

    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.loadMenu();
                this.attachEventListeners();
            });
        } else {
            this.loadMenu();
            this.attachEventListeners();
        }
    }

    attachEventListeners() {
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.float-btn')) return;
            e.preventDefault();
            this.handleContextMenu(e);
        });

        document.addEventListener('click', () => this.hideMenu());
        document.addEventListener('selectionchange', () => this.updateSelectedTextStatus());
    }

    loadMenu() {
        this.menu = document.getElementById('contextMenu');
        this.attachMenuItemListeners();
    }

    handleContextMenu(e) {
        if (!this.menu) return;

        this.targetElement = e.target;
        this.isInputFocused = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        this.hasSelectedText = window.getSelection().toString().trim() !== '';

        this.updateMenuItemStates();
        this.showMenu(e.clientX, e.clientY);
    }

    updateMenuItemStates() {
        const selectAllItem = this.menu.querySelector('[data-action="selectAll"]');
        const copyItem = this.menu.querySelector('[data-action="copy"]');
        const pasteItem = this.menu.querySelector('[data-action="paste"]');

        if (selectAllItem) selectAllItem.classList.toggle('disabled', !this.isInputFocused);
        if (copyItem) copyItem.classList.toggle('disabled', !this.hasSelectedText);
        if (pasteItem) pasteItem.classList.toggle('disabled', !this.isInputFocused);
    }

    updateSelectedTextStatus() {
        this.hasSelectedText = window.getSelection().toString().trim() !== '';
    }

    showMenu(x, y) {
        if (!this.menu) return;

        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;
        this.adjustMenuPosition();
        
        this.menu.classList.add('show');
    }

    adjustMenuPosition() {
        if (!this.menu) return;

        const menuRect = this.menu.getBoundingClientRect();

        if (menuRect.right > window.innerWidth) {
            this.menu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
        }

        if (menuRect.bottom > window.innerHeight) {
            this.menu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
        }
    }

    hideMenu() {
        if (this.menu) this.menu.classList.remove('show');
    }

    attachMenuItemListeners() {
        if (!this.menu) return;

        this.menu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                this.handleAction(action);
                this.hideMenu();
            });
        });
    }

    handleAction(action) {
        switch (action) {
            case 'selectAll':
                if (this.isInputFocused && this.targetElement) this.targetElement.select();
                break;
            case 'copy':
                if (this.hasSelectedText) {
                    navigator.clipboard.writeText(window.getSelection().toString());
                }
                break;
            case 'paste':
                if (this.isInputFocused && this.targetElement) {
                    navigator.clipboard.readText().then(text => {
                        this.targetElement.value += text;
                    }).catch(() => {});
                }
                break;
            case 'feedback':
                window.location.href = 'FB.html';
                break;
        }
    }
}

class TTTApp {
    constructor() {
        this.appName = 'Text To Two';
        this.appShortName = 'TTT';
        this.appVersion = '1.0';
        this.infoIframeContainer = null;
        this.infoIframe = null;
        const self = this;
        this.initContextMenu();
        this.initFloatBtn(self);
        this.initResizeHandles();
        this.initInfoIframe();
        this.bindEvents();
    }

    initInfoIframe() {
        this.infoIframeContainer = null;
        this.isInfoExpanded = false;
        this.loadInfoData();
    }

    async loadInfoData() {
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            const response = await fetch('https://caiyunzhou.github.io/SpecialCHAPTER/info/info_TTT.json?t=' + Date.now());
            if (!response.ok) return;
            const config = await response.json();
            
            const titleEmpty = !config.title || config.title.trim() === '';
            const linkEmpty = !config.link || config.link.trim() === '';
            const textEmpty = !config.text || config.text.trim() === '';
            
            if (titleEmpty && linkEmpty && textEmpty) return;

            const hasTitle = config.title && config.title.trim() !== '';
            const hasLinkText = config.link && config.link.trim() !== '' && config.text && config.text.trim() !== '';

            if (!hasTitle && !hasLinkText) return;

            this.createAndShowInfoIframe(config);
        } catch (e) {
            console.log('Failed to load info data');
        }
    }

    createAndShowInfoIframe(config) {
        this.infoIframeContainer = document.createElement('div');
        this.infoIframeContainer.className = 'info-iframe-container';
        this.infoIframeContainer.id = 'infoIframeContainer';

        this.infoContent = document.createElement('div');
        this.infoContent.className = 'info-content';

        let contentHTML = '<h1></h1><div class="scrollable-content"><p><span></span></p></div>';
        this.infoContent.innerHTML = contentHTML;

        const hasTitle = config.title && config.title.trim() !== '';
        const hasLinkText = config.link && config.link.trim() !== '' && config.text && config.text.trim() !== '';

        if (hasTitle) {
            const h1Element = this.infoContent.querySelector('h1');
            h1Element.textContent = config.title;
        }

        if (hasLinkText) {
            const spanElement = this.infoContent.querySelector('p span');
            spanElement.innerHTML = `<a href="${config.link}" target="_blank">${config.text}</a>`;
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 'info-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', () => this.hideInfoIframe());
        this.infoContent.appendChild(closeBtn);

        this.infoIframeContainer.appendChild(this.infoContent);

        this.infoIframeContainer.addEventListener('mouseenter', () => {
            if (!this.isInfoExpanded) {
                this.isInfoExpanded = true;
                this.infoIframeContainer.classList.add('expanded');
                const isMobile = window.innerWidth <= 600;
                this.infoIframeContainer.style.bottom = isMobile ? '80px' : '15px';
            }
        });

        this.infoIframeContainer.addEventListener('mouseleave', () => {
            this.isInfoExpanded = false;
            this.infoIframeContainer.classList.remove('expanded');
            this.infoIframeContainer.style.bottom = '-45px';
        });

        document.body.appendChild(this.infoIframeContainer);

        this.infoIframeContainer.classList.add('initial-state');

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.infoIframeContainer.style.transition = 'bottom 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease';
                this.infoIframeContainer.classList.remove('initial-state');
                this.infoIframeContainer.classList.add('visible-state');
                
                setTimeout(() => {
                    this.infoIframeContainer.style.transition = '';
                }, 500);
            });
        });

        const container = this.infoContent.querySelector('.scrollable-content');
        if (container) {
            container.addEventListener('wheel', function(e) { 
                e.preventDefault(); 
                container.scrollLeft += e.deltaY || e.deltaX; 
            });
        }
    }

    showInfoIframe() {}

    hideInfoIframe() {
        if (this.infoIframeContainer && this.infoIframeContainer.parentNode) {
            this.infoIframeContainer.parentNode.removeChild(this.infoIframeContainer);
            this.infoIframeContainer = null;
        }
    }

    sendThemeToIframe() {}

    initContextMenu() {
        new ContextMenu();
    }

    initFloatBtn(self) {
        const floatBtn = document.getElementById('floatBtn');
        const iconLock = floatBtn.querySelector('.icon-lock');

        let hoverTimer = null;
        let isScrolled = false;
        let isThemeMode = false;
        let isLocked = localStorage.getItem('themeLocked') === 'true';
        let currentTheme = localStorage.getItem('currentTheme');

        const applyTheme = (theme) => {
            if (theme === 'dark') {
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
            }
            self.sendThemeToIframe();
        };

        const updateLockIcon = () => {
            iconLock.style.display = isLocked ? 'block' : 'none';
        };

        const updateButtonState = () => {
            if (isScrolled) {
                floatBtn.classList.add('scrolled');
                floatBtn.classList.toggle('theme-mode', isThemeMode);
            } else {
                floatBtn.classList.remove('scrolled', 'theme-mode');
            }
        };

        if (isLocked && currentTheme) {
            applyTheme(currentTheme);
        } else if (!isLocked) {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark ? 'dark' : 'light');
        }
        updateLockIcon();

        floatBtn.addEventListener('mouseenter', function() {
            if (isScrolled) {
                hoverTimer = setTimeout(function() {
                    isThemeMode = true;
                    updateButtonState();
                }, 1000);
            }
        });

        floatBtn.addEventListener('mouseleave', function() {
            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }
            setTimeout(function() {
                if (!floatBtn.matches(':hover')) {
                    isThemeMode = false;
                    updateButtonState();
                }
            }, 100);
        });

        floatBtn.addEventListener('click', function(e) {
            if (isScrolled && isThemeMode) {
                e.preventDefault();
                const currentIsDark = document.body.classList.contains('dark-theme');

                if (currentIsDark) {
                    applyTheme('light');
                    if (isLocked) localStorage.setItem('currentTheme', 'light');
                } else {
                    applyTheme('dark');
                    if (isLocked) localStorage.setItem('currentTheme', 'dark');
                }
            } else if (isScrolled) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                const currentIsDark = document.body.classList.contains('dark-theme');

                if (currentIsDark) {
                    applyTheme('light');
                    if (isLocked) localStorage.setItem('currentTheme', 'light');
                } else {
                    applyTheme('dark');
                    if (isLocked) localStorage.setItem('currentTheme', 'dark');
                }
            }
        });

        floatBtn.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            isLocked = !isLocked;
            localStorage.setItem('themeLocked', isLocked);

            if (isLocked) {
                const theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
                localStorage.setItem('currentTheme', theme);
            } else {
                localStorage.removeItem('currentTheme');
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                applyTheme(prefersDark ? 'dark' : 'light');
            }
            updateLockIcon();
        });

        window.addEventListener('scroll', function() {
            if (window.scrollY > 100) {
                isScrolled = true;
            } else {
                isScrolled = false;
                isThemeMode = false;
            }
            updateButtonState();
        });
    }

    initResizeHandles() {
        const handles = document.querySelectorAll('.resize-handle');

        handles.forEach(handle => {
            let startY, startHeight, textarea;

            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const targetId = handle.getAttribute('data-target');
                textarea = document.getElementById(targetId);
                startY = e.clientY;
                startHeight = textarea.offsetHeight;

                document.addEventListener('mousemove', resize);
                document.addEventListener('mouseup', stopResize);
            });

            function resize(e) {
                const diff = e.clientY - startY;
                const newHeight = Math.max(80, Math.min(400, startHeight + diff));
                textarea.style.height = newHeight + 'px';
            }

            function stopResize() {
                document.removeEventListener('mousemove', resize);
                document.removeEventListener('mouseup', stopResize);
            }
        });
    }

    bindEvents() {
        document.querySelectorAll('input[name="convertMode"]').forEach(radio => {
            radio.addEventListener('change', () => this.updateInputLabel());
        });

        const textarea = document.getElementById('inputText');

        const autoResize = () => {
            textarea.style.height = 'auto';
            const newHeight = Math.min(400, Math.max(80, textarea.scrollHeight));
            textarea.style.height = newHeight + 'px';
        };

        textarea.addEventListener('input', autoResize);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.ctrlKey) {
                    const start = textarea.selectionStart;
                    const end = textarea.selectionEnd;
                    e.preventDefault();
                    textarea.value = textarea.value.substring(0, start) + '\n' + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 1;
                    setTimeout(autoResize, 0);
                } else {
                    e.preventDefault();
                    this.convert();
                }
            }
        });
    }

    updateInputLabel() {
        const mode = document.querySelector('input[name="convertMode"]:checked').value;
        const inputLabel = document.getElementById('inputLabel');
        const inputText = document.getElementById('inputText');

        if (mode === 'text2binary') {
            inputLabel.innerHTML = '<span class="material-icons">input</span> 输入';
            inputText.placeholder = '';
        } else {
            inputLabel.innerHTML = '<span class="material-icons">input</span> 输入';
            inputText.placeholder = '';
        }
        this.clearAll();
    }

    textToBinary(text) {
        return Array.from(text).map(char => char.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
    }

    binaryToText(binaryString) {
        const binaryList = binaryString.trim().split(/\s+/);
        return binaryList.map(b => String.fromCharCode(parseInt(b, 2))).join('');
    }

    convert() {
        const mode = document.querySelector('input[name="convertMode"]:checked').value;
        const input = document.getElementById('inputText').value.trim();
        const convertBtn = document.getElementById('convertBtn');

        if (!input) {
            this.showToast('Something Went Wrong', 'error');
            return;
        }

        convertBtn.classList.add('loading');

        setTimeout(() => {
            try {
                let result;
                if (mode === 'text2binary') {
                    result = this.textToBinary(input);
                } else {
                    if (!/^[01\s]+$/.test(input)) {
                        convertBtn.classList.remove('loading');
                        this.showToast('Something Went Wrong', 'error');
                        return;
                    }
                    result = this.binaryToText(input);
                }

                document.getElementById('outputText').textContent = result;
                document.getElementById('outputSection').style.display = 'block';
                this.showToast('Success', 'success');
            } catch (error) {
                this.showToast('Something Went Wrong', 'error');
            }

            convertBtn.classList.remove('loading');
        }, 300);
    }

    clearAll() {
        document.getElementById('inputText').value = '';
        document.getElementById('outputText').textContent = '';
        document.getElementById('outputSection').style.display = 'none';
    }

    copyResult() {
        const text = document.getElementById('outputText').textContent;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                this.showToast('Success', 'success');
            }).catch(() => {
                this.showToast('Something Went Wrong', 'error');
            });
        }
    }

    showToast(message, type = 'info') {
        const existingToast = document.querySelector('.toast');
        if (existingToast) existingToast.remove();

        const iconMap = { success: 'check_circle', error: 'error', info: 'info' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-icons">${iconMap[type] || 'info'}</span>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }
}

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new TTTApp();
    app.showInfoIframe('info/info.html');
});

function convert() { app.convert(); }
function clearAll() { app.clearAll(); }
function copyResult() { app.copyResult(); }
function showInfoIframe(url) { app.showInfoIframe(url); }
function hideInfoIframe() { app.hideInfoIframe(); }
