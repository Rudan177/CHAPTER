// 右键菜单功能
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
            e.preventDefault();
            this.handleContextMenu(e);
        });

        document.addEventListener('click', () => {
            this.hideMenu();
        });

        document.addEventListener('selectionchange', () => {
            this.updateSelectedTextStatus();
        });
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

        if (this.isInputFocused) {
            selectAllItem.classList.remove('disabled');
        } else {
            selectAllItem.classList.add('disabled');
        }

        if (this.hasSelectedText) {
            copyItem.classList.remove('disabled');
        } else {
            copyItem.classList.add('disabled');
        }

        if (this.isInputFocused) {
            pasteItem.classList.remove('disabled');
        } else {
            pasteItem.classList.add('disabled');
        }
    }

    updateSelectedTextStatus() {
        this.hasSelectedText = window.getSelection().toString().trim() !== '';
    }

    showMenu(x, y) {
        if (!this.menu) return;

        this.menu.style.display = 'block';
        this.menu.style.left = `${x}px`;
        this.menu.style.top = `${y}px`;

        this.adjustMenuPosition();
    }

    adjustMenuPosition() {
        if (!this.menu) return;

        const menuRect = this.menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (menuRect.right > viewportWidth) {
            this.menu.style.left = `${viewportWidth - menuRect.width - 10}px`;
        }

        if (menuRect.bottom > viewportHeight) {
            this.menu.style.top = `${viewportHeight - menuRect.height - 10}px`;
        }
    }

    hideMenu() {
        if (this.menu) {
            this.menu.style.display = 'none';
        }
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
            case 'back':
                this.handleBack();
                break;
            case 'refresh':
                this.handleRefresh();
                break;
            case 'selectAll':
                this.handleSelectAll();
                break;
            case 'copy':
                this.handleCopy();
                break;
            case 'paste':
                this.handlePaste();
                break;
        }
    }

    handleBack() {
        window.location.href = '/main/index.html';
    }

    handleRefresh() {
        window.location.reload();
    }

    handleSelectAll() {
        if (!this.isInputFocused || !this.targetElement) return;
        this.targetElement.select();
    }

    handleCopy() {
        if (!this.hasSelectedText) return;

        const selectedText = window.getSelection().toString();
        navigator.clipboard.writeText(selectedText)
            .then(() => {
                console.log('文本已复制到剪贴板');
            })
            .catch(err => {
                console.error('复制失败:', err);
            });
    }

    handlePaste() {
        if (!this.isInputFocused || !this.targetElement) return;

        navigator.clipboard.readText()
            .then(text => {
                this.targetElement.value += text;
            })
            .catch(err => {
                console.error('粘贴失败:', err);
            });
    }
}

class FeedbackApp {
    constructor() {
        this.init();
        this.initContextMenu();
        this.initFloatBtn();
    }

    initContextMenu() {
        new ContextMenu();
    }

    init() {
        this.updateSeverityOptions();
    }

    initFloatBtn() {
        const floatBtn = document.querySelector('.float-btn');
        const iconLock = document.querySelector('.icon-lock');

        let hoverTimer = null;
        let isScrolled = false;
        let isThemeMode = false;
        let isLocked = localStorage.getItem('themeLocked') === 'true';
        let currentTheme = localStorage.getItem('currentTheme');

        function applyTheme(theme) {
            if (theme === 'dark') {
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme');
            } else {
                document.body.classList.remove('dark-theme');
                document.body.classList.add('light-theme');
            }
        }

        function updateLockIcon() {
            iconLock.style.display = isLocked ? 'block' : 'none';
        }

        function updateButtonState() {
            if (isScrolled) {
                floatBtn.classList.add('scrolled');
                if (isThemeMode) {
                    floatBtn.classList.add('theme-mode');
                } else {
                    floatBtn.classList.remove('theme-mode');
                }
            } else {
                floatBtn.classList.remove('scrolled');
                floatBtn.classList.remove('theme-mode');
            }
        }

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

    updateSeverityOptions() {
        const feedbackType = document.querySelector('input[name="feedbackType"]:checked').value;
        const severitySection = document.getElementById('severitySection');
        const severityLabel = document.getElementById('severityLabel');
        const severityOptions = document.getElementById('severityOptions');
        const environmentSection = document.getElementById('environmentSection');

        if (feedbackType === 'bug') {
            severityLabel.innerHTML = `
                <span class="material-icons">signal_cellular_alt</span>
                严重程度
            `;
            severityOptions.innerHTML = `
                <div class="radio-option">
                    <input type="radio" id="severity-critical" name="severity" value="非常严重">
                    <label for="severity-critical">非常严重</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="severity-high" name="severity" value="比较严重">
                    <label for="severity-high">比较严重</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="severity-medium" name="severity" value="一般" checked>
                    <label for="severity-medium">一般</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="severity-low" name="severity" value="不太严重">
                    <label for="severity-low">不太严重</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="severity-none" name="severity" value="没啥影响">
                    <label for="severity-none">没啥影响</label>
                </div>
            `;
            environmentSection.classList.remove('hidden');
        } else {
            severityLabel.innerHTML = `
                <span class="material-icons">star</span>
                实用程度
            `;
            severityOptions.innerHTML = `
                <div class="radio-option">
                    <input type="radio" id="usefulness-high" name="severity" value="非常实用" checked>
                    <label for="usefulness-high">非常实用</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="usefulness-medium" name="severity" value="一般">
                    <label for="usefulness-medium">一般</label>
                </div>
                <div class="radio-option">
                    <input type="radio" id="usefulness-low" name="severity" value="纯抽象">
                    <label for="usefulness-low">纯抽象</label>
                </div>
            `;
            environmentSection.classList.add('hidden');
        }
    }

    saveFeedback() {
        const feedbackType = document.querySelector('input[name="feedbackType"]:checked').value;
        const severity = document.querySelector('input[name="severity"]:checked').value;
        const description = document.getElementById('description').value.trim();
        const environment = document.getElementById('environment').value.trim();
        const author = document.getElementById('author').value.trim() || '匿名';

        if (!description) {
            this.showToast('请输入详细描述', 'error');
            return;
        }

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.classList.add('loading');

        setTimeout(() => {
            const now = new Date();
            const timeStr = now.toLocaleString('zh-CN');
            const os = this.getOS();

            const rudContent = this.buildRUDContent(
                feedbackType,
                severity,
                description,
                environment,
                author,
                timeStr,
                os
            );

            const blob = new Blob([rudContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
            a.href = url;
            const randomHex = Array.from({length: 32}, () => Math.floor(Math.random() * 16).toString(16)).join('');
            a.download = `${timestamp}_${feedbackType === 'bug' ? 'Bug' : 'Feature'}_${randomHex}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            saveBtn.classList.remove('loading');
            this.showToast('反馈已保存', 'success');
        }, 500);
    }

    buildRUDContent(feedbackType, severity, description, environment, author, timeStr, os) {
        const startContent = feedbackType === 'bug' ? '反馈Bug' : '功能建议';
        
        let content = `# ${startContent}\n\n`;
        content += `**${feedbackType === 'bug' ? '严重程度' : '实用程度'}：** ${severity}\n\n`;
        content += `**详细描述：** ${description}\n`;
        
        if (feedbackType === 'bug' && environment) {
            content += `\n**环境信息：** ${environment}\n`;
        }
        
        content += `\n---\n`;
        content += `**反馈时间：** ${timeStr}\n`;
        content += `**操作系统：** ${os}\n`;
        content += `**反馈人：** ${author}\n`;

        return content;
    }

    getOS() {
        const platform = navigator.platform;
        if (platform.includes('Win')) return 'Windows';
        if (platform.includes('Mac')) return 'macOS';
        if (platform.includes('Linux')) return 'Linux';
        if (platform.includes('iPhone') || platform.includes('iPad')) return 'iOS';
        if (platform.includes('Android')) return 'Android';
        return platform;
    }

    showToast(message, type = 'info') {
        const toastId = `toast-${Date.now()}`;

        const iconMap = {
            'success': 'check_circle',
            'error': 'error',
            'info': 'info'
        };

        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="material-icons">${iconMap[type] || 'info'}</span>
            <span>${message}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }

    clearForm() {
        document.getElementById('description').value = '';
        document.getElementById('environment').value = '';
        document.getElementById('author').value = '';
        document.querySelector('input[name="feedbackType"][value="bug"]').checked = true;
        this.updateSeverityOptions();
        this.showToast('表单已清空', 'success');
    }
}

let feedbackApp;

document.addEventListener('DOMContentLoaded', () => {
    feedbackApp = new FeedbackApp();
    initResizeHandles();
    bindEvents();
});

function bindEvents() {
    const feedbackTypeRadios = document.querySelectorAll('input[name="feedbackType"]');
    feedbackTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => updateSeverityOptions());
    });

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveFeedback());
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => clearForm());
    }
}

function initResizeHandles() {
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
            const newHeight = Math.max(80, Math.min(300, startHeight + diff));
            textarea.style.height = newHeight + 'px';
        }
        
        function stopResize() {
            document.removeEventListener('mousemove', resize);
            document.removeEventListener('mouseup', stopResize);
        }
    });
}

function updateSeverityOptions() {
    feedbackApp.updateSeverityOptions();
}

function saveFeedback() {
    feedbackApp.saveFeedback();
}

function clearForm() {
    feedbackApp.clearForm();
}
