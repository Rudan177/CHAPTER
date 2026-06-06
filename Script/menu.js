// 菜单逻辑
const menuBtn = document.querySelector('.menu-btn');
const menuList = document.querySelector('.menu-list');
const menuContainer = document.querySelector('.menu-container');

// 模糊控制：用 requestAnimationFrame 逐帧驱动 filter，不依赖 CSS transition
let blurAnimId = null;

function animateBlur(from, to, duration, onDone) {
    if (blurAnimId) cancelAnimationFrame(blurAnimId);
    const start = performance.now();
    function step(now) {
        const t = Math.min((now - start) / duration, 1);
        const value = from + (to - from) * t;
        menuList.style.filter = `blur(${value}px)`;
        if (t < 1) {
            blurAnimId = requestAnimationFrame(step);
        } else {
            menuList.style.filter = '';
            blurAnimId = null;
            if (onDone) onDone();
        }
    }
    blurAnimId = requestAnimationFrame(step);
}

function blurIn() {
    // 展开：从模糊到清晰
    animateBlur(6, 0, 300);
}

function blurOut() {
    // 关闭：从清晰到模糊，再回到清晰
    animateBlur(0, 6, 200, () => {
        setTimeout(() => {
            animateBlur(6, 0, 200);
        }, 100);
    });
}

function closeMenu() {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        menuContainer.classList.remove('content-ready');
        menuContainer.classList.remove('expanding');
        menuContainer.classList.remove('expanded');
        menuContainer.classList.add('collapsing');
        menuList.classList.remove('active');
        menuList.classList.remove('content-visible');
        blurOut();

        setTimeout(() => {
            menuContainer.classList.remove('collapsing');
        }, 700);
    } else {
        if (menuList.classList.contains('active')) {
            menuList.classList.add('closing');
            menuList.classList.remove('active');
            document.body.classList.remove('menu-active');
            blurOut();

            setTimeout(() => {
                menuBtn.classList.remove('hidden');
                menuBtn.classList.add('appearing');
            }, 280);

            setTimeout(() => {
                menuList.classList.remove('closing');
                menuBtn.classList.remove('appearing');
            }, 350);
        }
    }
}

// 移动端下滑关闭菜单
(function () {
    const closeBtn = document.querySelector('.menu-close-btn');
    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    function handleTouchStart(e) {
        if (window.innerWidth > 768) return;
        startY = e.touches[0].clientY;
        isDragging = true;
        menuContainer.style.transition = 'none';
    }

    function handleTouchMove(e) {
        if (!isDragging || window.innerWidth > 768) return;
        currentY = e.touches[0].clientY;
        const diff = currentY - startY;
        if (diff > 0) {
            menuContainer.style.transform = `translateY(${diff}px)`;
        }
    }

    function handleTouchEnd() {
        if (!isDragging || window.innerWidth > 768) return;
        isDragging = false;
        const diff = currentY - startY;

        if (diff > 100) {
            menuContainer.classList.remove('content-ready');
            menuContainer.classList.remove('expanding');
            menuContainer.classList.remove('expanded');
            menuContainer.classList.add('collapsing');
            menuList.classList.remove('active');
            menuList.classList.remove('content-visible');
            menuContainer.style.transition = '';
            menuContainer.style.transform = '';
            blurOut();

            setTimeout(() => {
                menuContainer.classList.remove('collapsing');
            }, 700);
        } else {
            menuContainer.style.transition = 'transform 0.2s ease';
            menuContainer.style.transform = '';
        }
    }

    if (closeBtn) {
        closeBtn.addEventListener('touchstart', handleTouchStart, { passive: true });
        closeBtn.addEventListener('touchmove', handleTouchMove, { passive: true });
        closeBtn.addEventListener('touchend', handleTouchEnd);
    }
})();

menuBtn.addEventListener('click', () => {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        if (menuContainer.classList.contains('expanded')) {
            closeMenu();
        } else {
            menuList.classList.add('active');
            menuContainer.classList.add('expanding');
            menuContainer.classList.add('expanded');
            menuContainer.classList.add('content-ready');
            menuList.classList.add('content-visible');
            blurIn();

            setTimeout(() => {
                menuContainer.classList.remove('expanding');
            }, 600);
        }
    } else {
        if (menuList.classList.contains('active')) {
            closeMenu();
        } else {
            menuBtn.classList.add('hidden');
            const menuHeight = window.innerHeight - 40;
            menuList.style.setProperty('--menu-height', menuHeight + 'px');
            menuList.classList.add('active');
            menuList.classList.remove('closing');
            document.body.classList.add('menu-active');
            blurIn();
        }
    }
});

document.addEventListener('click', (e) => {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        if (!e.target.closest('.menu-container') && menuContainer.classList.contains('expanded')) {
            closeMenu();
        }
    } else {
        if (!e.target.closest('.menu-container') && menuList.classList.contains('active')) {
            closeMenu();
        }
    }
});

// 滚动检测高亮菜单项
function updateMenuHighlight() {
    const sections = [
        { element: document.querySelector('.dakuang'), menuItem: document.querySelector('.menu-list li:nth-child(2)') },
        { element: document.querySelector('.xibao-slider-container'), menuItem: document.querySelector('.menu-list li:nth-child(3)') },
        { element: document.querySelector('.zhufu-container'), menuItem: document.querySelector('.menu-list li:nth-child(4)') },
        { element: document.querySelector('.zhengwen-container'), menuItem: document.querySelector('.menu-list li:nth-child(5)') },
        { element: document.querySelector('.bangdan-container'), menuItem: document.querySelector('.menu-list li:nth-child(6)') }
    ];

    let currentSection = null;
    const scrollPosition = window.scrollY + 150;

    sections.forEach(section => {
        if (section.element && section.menuItem) {
            section.menuItem.classList.remove('current-section');
            const rect = section.element.getBoundingClientRect();
            const elementTop = rect.top + window.scrollY;

            if (elementTop <= scrollPosition) {
                currentSection = section;
            }
        }
    });

    if (currentSection) {
        currentSection.menuItem.classList.add('current-section');
    }

    // 显示/隐藏日期选择器
    const dateSelector = document.getElementById('dateSelector');
    const zhengwenItem = document.querySelector('.zhengwen-item');
    if (zhengwenItem && zhengwenItem.classList.contains('current-section')) {
        dateSelector.classList.add('show');
    } else {
        dateSelector.classList.remove('show');
    }
}

window.addEventListener('scroll', updateMenuHighlight);
updateMenuHighlight();
