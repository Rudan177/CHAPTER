(function () {
    'use strict';

    var searchInput = document.getElementById('searchInput');
    var searchTimeBtn = document.getElementById('searchTimeBtn');
    var searchClearBtn = document.getElementById('searchClearBtn');
    var noResult = document.getElementById('noResult');
    var timeOnlyMode = false;
    var originalHTMLMap = new WeakMap();

    // 转义正则特殊字符
    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 保存文章原始 HTML（仅一次）
    function saveOriginal(article) {
        if (!originalHTMLMap.has(article)) {
            originalHTMLMap.set(article, article.innerHTML);
        }
    }

    // 恢复单篇文章
    function restoreArticle(article) {
        var original = originalHTMLMap.get(article);
        if (original !== undefined) {
            article.innerHTML = original;
        }
    }

    // 恢复全部文章
    function restoreAll() {
        document.querySelectorAll('.zhengwen-container .zhengwen').forEach(restoreArticle);
    }

    // 获取元素文本（可选排除特定选择器内的内容）
    function getTextExcluding(element, excludeSelector) {
        if (!excludeSelector) return element.textContent;
        var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                return node.parentElement && node.parentElement.closest(excludeSelector)
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            }
        });
        var text = '';
        while (walker.nextNode()) {
            text += walker.currentNode.textContent;
        }
        return text;
    }

    // 在元素内高亮所有匹配文本（可选排除特定选择器内的文本节点）
    function highlightTextInElement(element, query, excludeSelector) {
        if (!query) return;
        var escaped = escapeRegExp(query);
        var regex = new RegExp(escaped, 'gi');

        var acceptFilter = excludeSelector
            ? function (node) {
                return node.parentElement && node.parentElement.closest(excludeSelector)
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
              }
            : null;

        var treeWalker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            acceptFilter ? { acceptNode: acceptFilter } : null,
            false
        );
        var textNodes = [];
        while (treeWalker.nextNode()) {
            textNodes.push(treeWalker.currentNode);
        }

        textNodes.forEach(function (node) {
            if (node.parentNode === null) return;
            var text = node.textContent;
            regex.lastIndex = 0;
            if (!regex.test(text)) return;

            var fragment = document.createDocumentFragment();
            var lastIndex = 0;
            regex.lastIndex = 0;
            var match;
            while ((match = regex.exec(text)) !== null) {
                var before = text.substring(lastIndex, match.index);
                if (before) fragment.appendChild(document.createTextNode(before));
                var mark = document.createElement('mark');
                mark.textContent = match[0];
                fragment.appendChild(mark);
                lastIndex = regex.lastIndex;
            }
            var remaining = text.substring(lastIndex);
            if (remaining) fragment.appendChild(document.createTextNode(remaining));
            node.parentNode.replaceChild(fragment, node);
        });
    }

    // 主搜索函数
    function performSearch() {
        var query = searchInput.value.trim().toLowerCase();
        var articles = document.querySelectorAll('.zhengwen-container .zhengwen');
        var hasVisible = false;

        // 先恢复所有文章原始内容（清除之前的高亮）
        restoreAll();

        // 控制清除按钮显隐
        if (searchInput.value.trim()) {
            searchClearBtn.classList.add('visible');
        } else {
            searchClearBtn.classList.remove('visible');
        }

        if (!query) {
            articles.forEach(function (a) { a.style.display = ''; });
            noResult.classList.remove('show');
            return;
        }

        articles.forEach(function (article) {
            var shouldShow = false;

            if (timeOnlyMode) {
                // 仅搜索日期模式：匹配则整行 h1 高亮
                var h1 = article.querySelector('h1');
                if (h1) {
                    var h1Text = h1.textContent.toLowerCase();
                    if (h1Text.indexOf(query) !== -1) {
                        shouldShow = true;
                        h1.classList.add('highlight');
                    }
                }
            } else {
                // 全文搜索模式：匹配文字高亮（排除 h1）
                var allText = getTextExcluding(article, 'h1').toLowerCase();
                if (allText.indexOf(query) !== -1) {
                    shouldShow = true;
                    highlightTextInElement(article, query, 'h1');
                }
            }

            article.style.display = shouldShow ? '' : 'none';
            if (shouldShow) hasVisible = true;
        });

        noResult.classList.toggle('show', !hasVisible);
    }

    // ---- 事件绑定 ----

    searchTimeBtn.addEventListener('click', function () {
        timeOnlyMode = !timeOnlyMode;
        this.classList.toggle('active');
        performSearch();
    });

    searchClearBtn.addEventListener('click', function () {
        searchInput.value = '';
        searchInput.focus();
        performSearch();
    });

    searchInput.addEventListener('input', performSearch);

    // ---- 监听文章动态渲染，保存原始 HTML ----

    var observer = new MutationObserver(function (mutations) {
        var hasNewArticle = false;
        mutations.forEach(function (mutation) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType !== 1) return;
                var articles = node.classList && node.classList.contains('zhengwen')
                    ? [node]
                    : node.querySelectorAll ? node.querySelectorAll('.zhengwen') : [];
                articles.forEach(function (article) {
                    saveOriginal(article);
                    hasNewArticle = true;
                });
            });
        });
        if (hasNewArticle && searchInput.value.trim()) {
            performSearch();
        }
    });

    var container = document.querySelector('.zhengwen-container');
    if (container) {
        observer.observe(container, { childList: true, subtree: true });
    }

    // 捕获页面上可能已存在的文章（脚本重跑等情况）
    document.querySelectorAll('.zhengwen-container .zhengwen').forEach(saveOriginal);
})();
