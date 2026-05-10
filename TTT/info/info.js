function closeInfo() {
    if (window.parent !== window) { 
        window.parent.postMessage('closeInfoIframe', '*'); 
    } else { 
        document.querySelector('.info-container').style.display = 'none'; 
    } 
}

function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.style.setProperty('--bg-color', '#303134');
        root.style.setProperty('--text-color', '#e8eaed');
        root.style.setProperty('--border-color', 'rgba(255, 255, 255, 0.1)');
        root.style.setProperty('--close-color', '#9aa0a6');
        root.style.setProperty('--close-hover', '#e8eaed');
    } else {
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--text-color', '#1a1a1a');
        root.style.setProperty('--border-color', 'rgba(0, 0, 0, 0.1)');
        root.style.setProperty('--close-color', '#666');
        root.style.setProperty('--close-hover', '#1a1a1a');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.querySelector('.info-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeInfo);
    }

    window.addEventListener('message', function(e) {
        if (e.data === 'theme-dark') {
            applyTheme('dark');
        } else if (e.data === 'theme-light') {
            applyTheme('light');
        }
    });

    if (window.parent !== window) {
        window.parent.postMessage('requestTheme', '*');
    }
});

async function loadConfig() {
    const remoteUrl = 'https://caiyunzhou.github.io/SpecialCHAPTER/info/info_TTT.json';
    
    try {
        const response = await fetch(remoteUrl + '?t=' + Date.now());
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        return null;
    }
}

window.onload = async function() {
    const config = await loadConfig();
    var h1Element = document.querySelector('.info-container h1');
    var spanElement = document.querySelector('.info-container p span');
    
    if (config) {
        const titleEmpty = !config.title || config.title.trim() === '';
        const linkEmpty = !config.link || config.link.trim() === '';
        const textEmpty = !config.text || config.text.trim() === '';
        
        if (titleEmpty && linkEmpty && textEmpty) {
            if (window.parent !== window) { 
                window.parent.postMessage('noContent', '*'); 
            } else { 
                document.querySelector('.info-container').style.display = 'none'; 
            }
            return;
        }
        
        if (h1Element && config.title) h1Element.textContent = config.title;
        if (spanElement && config.link && config.text) {
            spanElement.innerHTML = `<a href="${config.link}" target="_blank">${config.text}</a>`;
        }
    }
    
    var h1Text = h1Element ? h1Element.textContent.trim() : '';
    var pText = spanElement ? spanElement.textContent.trim() : '';
    
    if (h1Text === '' && pText === '') { 
        if (window.parent !== window) { 
            window.parent.postMessage('noContent', '*'); 
        } else { 
            document.querySelector('.info-container').style.display = 'none'; 
        } 
        return;
    }

    if (window.parent !== window) { 
        window.parent.postMessage('contentReady', '*');
    }

    var container = document.querySelector('.scrollable-content'); 
    if (container) {
        container.addEventListener('wheel', function(e) { 
            e.preventDefault(); 
            container.scrollLeft += e.deltaY || e.deltaX; 
        }); 
    }
};

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('blur') === '1') {
    document.body.classList.add('dynamic-blur');
}
