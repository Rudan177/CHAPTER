// 正文数据 - 从 JSON 动态加载
let zhengwenData = [];

function buildInline(parent, content) {
    if (typeof content === 'string') {
        parent.appendChild(document.createTextNode(content));
        return;
    }
    if (!Array.isArray(content)) return;
    for (const item of content) {
        if (typeof item === 'string') {
            parent.appendChild(document.createTextNode(item));
        } else if (item && typeof item === 'object') {
            const [tag, val] = Object.entries(item)[0];
            switch (tag) {
                case 'a': {
                    const a = document.createElement('a');
                    a.href = item.href || '#';
                    a.textContent = val;
                    parent.appendChild(a);
                    break;
                }
                case 'b':
                case 'strong': {
                    const el = document.createElement('strong');
                    el.textContent = val;
                    parent.appendChild(el);
                    break;
                }
                case 'em': {
                    const el = document.createElement('em');
                    el.textContent = val;
                    parent.appendChild(el);
                    break;
                }
                case 'sup': {
                    const el = document.createElement('sup');
                    el.textContent = val;
                    parent.appendChild(el);
                    break;
                }
                case 'fn': {
                    const el = document.createElement('sup');
                    el.textContent = '[' + (val && val.id != null ? val.id : '?') + ']';
                    parent.appendChild(el);
                    break;
                }
                case 'code': {
                    const el = document.createElement('code');
                    el.textContent = val;
                    parent.appendChild(el);
                    break;
                }
                case 'img': {
                    const img = document.createElement('img');
                    img.src = val || '';
                    if (item.alt) img.alt = item.alt;
                    if (item.style) img.style.cssText = item.style;
                    img.loading = 'lazy';
                    parent.appendChild(img);
                    break;
                }
                default:
                    parent.appendChild(document.createTextNode(String(val ?? '')));
            }
        }
    }
}

function createBlock(block) {
    const [tag, val] = Object.entries(block)[0];
    switch (tag) {
        case 'h2': {
            const el = document.createElement('h2');
            el.textContent = val;
            return el;
        }
        case 'h3': {
            const el = document.createElement('h3');
            el.textContent = val;
            return el;
        }
        case 'p': {
            const el = document.createElement('p');
            buildInline(el, val);
            const fns = [];
            if (Array.isArray(val)) val.forEach(it => { if (it && it.fn) fns.push(it.fn) });
            if (fns.length) {
                const se = document.createElement('p');
                se.className = 'se';
                se.textContent = '注释：' + fns.map(f => '[' + f.id + '] ' + f.text).join(' ');
                const frag = document.createDocumentFragment();
                frag.appendChild(el);
                frag.appendChild(se);
                return frag;
            }
            return el;
        }
        case 'ul':
        case 'ol': {
            const el = document.createElement(tag);
            if (Array.isArray(val)) {
                for (const item of val) {
                    const li = document.createElement('li');
                    buildInline(li, item);
                    el.appendChild(li);
                }
            }
            return el;
        }
        case 'img': {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'text-align:center;margin:20px 0';
            const img = document.createElement('img');
            img.src = val || '';
            if (block.alt) img.alt = block.alt;
            if (block.style) img.style.cssText = block.style;
            img.loading = 'lazy';
            wrap.appendChild(img);
            return wrap;
        }
        case 'se': {
            const el = document.createElement('p');
            el.className = 'se';
            buildInline(el, val);
            return el;
        }
        case '_footer': {
            const el = document.createElement('div');
            el.className = 'xiaozi';
            el.textContent = val;
            return el;
        }
        case 'audio':
            return null;
        default:
            return null;
    }
}

function createArticleElement(article) {
    const div = document.createElement('div');
    div.className = 'zhengwen';

    if (article.date) {
        const h1 = document.createElement('h1');
        h1.textContent = article.date;
        div.appendChild(h1);
    }

    if (article.audio) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.className = 'audio-player';
        audio.preload = 'metadata';
        const source = document.createElement('source');
        source.src = article.audio;
        source.type = 'audio/mpeg';
        audio.appendChild(source);
        audio.appendChild(document.createTextNode('您的浏览器不支持音频播放。'));
        div.appendChild(audio);
    }

    if (article.blocks) {
        for (const block of article.blocks) {
            const el = createBlock(block);
            if (el) div.appendChild(el);
        }
    }

    return div;
}

function renderZhengwen() {
    const container = document.querySelector('.zhengwen-container');
    if (!container || !zhengwenData.length) return;

    container.innerHTML = '';
    const total = zhengwenData.length;
    let index = 0;
    const BATCH = 3;

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + BATCH, total);
        for (let i = index; i < end; i++) {
            fragment.appendChild(createArticleElement(zhengwenData[i]));
        }
        container.appendChild(fragment);
        index = end;
        if (index < total) requestAnimationFrame(renderBatch);
    }

    requestAnimationFrame(renderBatch);
}

async function loadZhengwen() {
    try {
        const res = await fetch('wenben/ss.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        zhengwenData = await res.json();
        renderZhengwen();
    } catch (e) {
        console.error('加载正文数据失败:', e);
    }
}

loadZhengwen();
