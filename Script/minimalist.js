// 极简模式 - 移除非核心内容以提升加载速度
(function () {
    const STORAGE_KEY = 'minimalist';

    // 保存被移除的元素，以便恢复
    var savedNodes = [];

    // 获取要移除的元素列表
    function getTargets() {
        return [
            { el: document.querySelector('.xibao-slider-container'), parent: document.querySelector('.xibao-slider-container') ? document.querySelector('.xibao-slider-container').parentNode : null, nextSib: document.querySelector('.xibao-slider-container') ? document.querySelector('.xibao-slider-container').nextSibling : null },
            { el: document.querySelector('.zhufu-container'), parent: document.querySelector('.zhufu-container') ? document.querySelector('.zhufu-container').parentNode : null, nextSib: document.querySelector('.zhufu-container') ? document.querySelector('.zhufu-container').nextSibling : null },
            { el: document.querySelector('.bangdan-container'), parent: document.querySelector('.bangdan-container') ? document.querySelector('.bangdan-container').parentNode : null, nextSib: document.querySelector('.bangdan-container') ? document.querySelector('.bangdan-container').nextSibling : null },
            { el: document.querySelector('.menu-list li:nth-child(3)'), parent: document.querySelector('.menu-list') },
            { el: document.querySelector('.menu-list li:nth-child(4)'), parent: document.querySelector('.menu-list') },
            { el: document.querySelector('.menu-list li:nth-child(6)'), parent: document.querySelector('.menu-list') }
        ];
    }

    function applyMinimalist(on) {
        var sw = document.getElementById('minimalistSwitch');
        if (on) {
            // 开启极简：从DOM移除元素，停止图片/视频加载
            savedNodes = [];
            var targets = getTargets();
            for (var i = 0; i < targets.length; i++) {
                var t = targets[i];
                if (t.el && t.el.parentNode) {
                    // 保存引用以便恢复
                    savedNodes.push({
                        el: t.el,
                        parent: t.parent || t.el.parentNode,
                        nextSib: t.nextSib || t.el.nextSibling
                    });
                    // 停止内部的图片/视频加载
                    var media = t.el.querySelectorAll('img, video, source');
                    for (var m = 0; m < media.length; m++) {
                        if (media[m].tagName === 'IMG' || media[m].tagName === 'SOURCE') {
                            media[m].src = '';
                        }
                        if (media[m].tagName === 'VIDEO') {
                            media[m].pause();
                            media[m].src = '';
                            media[m].load();
                        }
                    }
                    // 从DOM移除
                    t.el.remove();
                }
            }
            if (sw) sw.classList.add('active');
        } else {
            // 关闭极简：恢复所有被移除的元素
            for (var j = 0; j < savedNodes.length; j++) {
                var n = savedNodes[j];
                if (n.el && n.parent) {
                    if (n.nextSib && n.nextSib.parentNode) {
                        n.parent.insertBefore(n.el, n.nextSib);
                    } else {
                        n.parent.appendChild(n.el);
                    }
                }
            }
            savedNodes = [];
            if (sw) sw.classList.remove('active');
        }
        localStorage.setItem(STORAGE_KEY, on ? 'true' : 'false');
        // 刷新滚动高亮
        if (typeof updateMenuHighlight === 'function') {
            setTimeout(updateMenuHighlight, 50);
        }
    }

    // 初始化：从localStorage读取并执行
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'true') {
        applyMinimalist(true);
    }

    // 点击切换
    var toggle = document.getElementById('minimalistToggle');
    if (toggle) {
        toggle.addEventListener('click', function () {
            var sw = document.getElementById('minimalistSwitch');
            var isActive = sw && sw.classList.contains('active');
            applyMinimalist(!isActive);
        });
    }
})();
