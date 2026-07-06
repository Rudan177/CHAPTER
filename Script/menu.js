// 菜单逻辑
const menuBtn = document.querySelector('.menu-btn');
const menuList = document.querySelector('.menu-list');
const menuContainer = document.querySelector('.menu-container');

function closeMenu() {
    const isMobile = window.innerWidth <= 768;
    menuList.classList.remove('fx-active');

    if (isMobile) {
        menuList.classList.remove('active');
        menuContainer.classList.remove('expanded');
    } else {
        if (!menuList.classList.contains('active')) return;
        var els = document.querySelectorAll('.dakuang,.decoration,.zhengwen-container,.zhufu-container,.xibao-slider-container,.bangdan-container,footer');
        // 设 inline 起始状态（和 CSS 一致），带上 transition
        for (var i = 0; i < els.length; i++) {
            els[i].style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
            els[i].style.transform = 'translateX(84px)';
        }
        // 强制回流确认当前状态
        void document.body.offsetHeight;
        // 改为目标值——transition 开始生效
        for (var j = 0; j < els.length; j++) {
            els[j].style.transform = 'translateX(0)';
        }
        // 移除 menu-shifted（will-change 已去掉，没有 GPU 负担了）
        document.body.classList.remove('menu-shifted');
        // 元素归位和菜单收起同时开始
        menuList.classList.add('closing');
        menuList.classList.remove('active');
        // 过渡完成后清理 inline 样式
        setTimeout(function () {
            for (var k = 0; k < els.length; k++) {
                els[k].style.transform = '';
                els[k].style.transition = '';
            }
        }, 320);
        setTimeout(function () {
            menuBtn.classList.remove('hidden');
        }, 250);
        setTimeout(function () {
            menuList.classList.remove('closing');
        }, 400);
    }
}

// 移动端下滑关闭
(function () {
    const closeBtn = document.querySelector('.menu-close-btn');
    let startY = 0, currentY = 0, isDragging = false;

    function handleTouchStart(e) {
        if (window.innerWidth > 768) return;
        startY = e.touches[0].clientY;
        isDragging = true;
        menuList.style.transition = 'none';
    }
    function handleTouchMove(e) {
        if (!isDragging || window.innerWidth > 768) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) menuList.style.transform = 'translateY(' + diff + 'px)';
    }
    function handleTouchEnd() {
        if (!isDragging || window.innerWidth > 768) return;
        isDragging = false;
        const diff = currentY - startY;
        menuList.style.transition = '';
        menuList.style.transform = '';
        if (diff > 100) {
            closeMenu();
        }
    }
    if (closeBtn) {
        closeBtn.addEventListener('touchstart', handleTouchStart, { passive: true });
        closeBtn.addEventListener('touchmove', handleTouchMove, { passive: true });
        closeBtn.addEventListener('touchend', handleTouchEnd);
    }
})();

// 菜单按钮点击
let animHandler = null;

menuBtn.addEventListener('click', function () {
    var isMobile = window.innerWidth <= 768;

    if (isMobile) {
        if (menuContainer.classList.contains('expanded')) {
            closeMenu();
        } else {
            menuList.classList.add('active', 'fx-active');
            menuContainer.classList.add('expanded');
        }
    } else {
        if (menuList.classList.contains('active') || menuList.classList.contains('closing')) {
            closeMenu();
        } else {
            menuBtn.classList.add('hidden');
            menuList.classList.add('active');
            menuList.classList.remove('closing');
            document.body.classList.add('menu-shifted');
            if (animHandler) menuList.removeEventListener('animationend', animHandler);
            animHandler = function (e) {
                if (e.animationName === 'menuIn') {
                    menuList.removeEventListener('animationend', animHandler);
                    animHandler = null;
                    menuList.classList.add('fx-active');
                }
            };
            menuList.addEventListener('animationend', animHandler);
        }
    }
});


// 点击菜单外关闭
document.addEventListener('click', function (e) {
    if (e.target.closest('.menu-container')) return;
    if (window.innerWidth <= 768) {
        if (menuContainer.classList.contains('expanded')) closeMenu();
    } else {
        if (menuList.classList.contains('active')) closeMenu();
    }
});

// 滚动高亮
function findMenuItem(text) {
    var items = document.querySelectorAll('.menu-list li');
    for (var i = 0; i < items.length; i++) {
        if (items[i].textContent.trim().indexOf(text) === 0) return items[i];
    }
    return null;
}

var scrollSections = [
    { element: document.querySelector('.dakuang'), menuItem: findMenuItem('回顶') },
    { element: document.querySelector('.xibao-slider-container'), menuItem: findMenuItem('重要通知') },
    { element: document.querySelector('.zhufu-container'), menuItem: findMenuItem('祝福视频') },
    { element: document.querySelector('.zhengwen-container'), menuItem: findMenuItem('正文') },
    { element: document.querySelector('.bangdan-container'), menuItem: findMenuItem('榜单') }
];
var dateSelectorEl = document.getElementById('dateSelector');
var zhengwenItemEl = document.querySelector('.zhengwen-item');
var scrollTicking = false;

function updateMenuHighlight() {
    var mid = window.innerHeight * 0.4;
    var found = -1;
    for (var i = 0; i < scrollSections.length; i++) {
        var s = scrollSections[i];
        if (s.element && s.menuItem && document.body.contains(s.menuItem)) {
            s.menuItem.classList.remove('current-section');
            if (s.element.getBoundingClientRect().top < mid) found = i;
        }
    }
    if (found >= 0) {
        var s = scrollSections[found];
        s.menuItem.classList.add('current-section');
        if (zhengwenItemEl && dateSelectorEl) {
            dateSelectorEl.classList.toggle('show', zhengwenItemEl.classList.contains('current-section'));
        }
    }
    scrollTicking = false;
}

function onScroll() {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(updateMenuHighlight); }
}
window.addEventListener('scroll', onScroll, { passive: true });
updateMenuHighlight();
