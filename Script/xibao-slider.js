// 喜报滑块切换逻辑
(function () {
    var autoPlayTimer = null;
    const autoPlayInterval = 8000;

    function stopAutoPlay() {
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    }

    function initXibaoSlider() {
        // 防止重复绑定
        var container = document.querySelector('.xibao-slider-container');
        if (!container || container.dataset.xibaoInitialized) return;
        container.dataset.xibaoInitialized = 'true';

        const closeBtn = document.getElementById('closeBtn');
        const xibaoSlider = container;

        closeBtn.addEventListener('click', function () {
            xibaoSlider.style.display = 'none';
        });

        const track = document.querySelector('.xibao-slider-track');
        const prevBtn = document.querySelector('.xibao-slider-prev');
        const nextBtn = document.querySelector('.xibao-slider-next');
        const dotsContainer = document.querySelector('.xibao-slider-dots');
        const slides = track.querySelectorAll('.xibao');
        let currentIndex = 0;
        const totalSlides = slides.length;

        function createDots() {
            dotsContainer.innerHTML = '';
            for (let i = 0; i < totalSlides; i++) {
                const dot = document.createElement('span');
                dot.className = 'xibao-dot';
                if (i === 0) dot.classList.add('active');
                dotsContainer.appendChild(dot);
            }
        }

        function getDots() {
            return document.querySelectorAll('.xibao-dot');
        }

        function goToSlide(index) {
            if (index < 0) index = totalSlides - 1;
            if (index >= totalSlides) index = 0;
            currentIndex = index;
            track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
            updateDots();
            updateButtons();
        }

        function updateDots() {
            var dots = getDots();
            for (var d = 0; d < dots.length; d++) {
                dots[d].classList.toggle('active', d === currentIndex);
            }
        }

        function updateButtons() {
            prevBtn.disabled = false;
            nextBtn.disabled = false;
        }

        function resetAutoPlay() {
            stopAutoPlay();
            autoPlayTimer = setInterval(function () {
                goToSlide(currentIndex + 1);
            }, autoPlayInterval);
        }

        prevBtn.addEventListener('click', function () {
            goToSlide(currentIndex - 1);
            resetAutoPlay();
        });

        nextBtn.addEventListener('click', function () {
            goToSlide(currentIndex + 1);
            resetAutoPlay();
        });

        dotsContainer.addEventListener('click', function (e) {
            if (e.target.classList.contains('xibao-dot')) {
                var dots = getDots();
                var index = Array.prototype.indexOf.call(dots, e.target);
                goToSlide(index);
                resetAutoPlay();
            }
        });

        var touchStartX = 0;
        var touchEndX = 0;

        track.addEventListener('touchstart', function (e) {
            touchStartX = e.changedTouches[0].screenX;
            stopAutoPlay();
        }, { passive: true });

        track.addEventListener('touchend', function (e) {
            touchEndX = e.changedTouches[0].screenX;
            var swipeThreshold = 50;
            var diff = touchStartX - touchEndX;
            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    goToSlide(currentIndex + 1);
                } else {
                    goToSlide(currentIndex - 1);
                }
            }
            resetAutoPlay();
        }, { passive: true });

        var wrapper = document.querySelector('.xibao-slider-wrapper');
        wrapper.addEventListener('mouseenter', stopAutoPlay);
        wrapper.addEventListener('mouseleave', function () {
            stopAutoPlay();
            autoPlayTimer = setInterval(function () {
                goToSlide(currentIndex + 1);
            }, autoPlayInterval);
        });

        updateButtons();
        createDots();
        resetAutoPlay();
    }

    // 暴露初始化函数和停止自动播放函数，供极简模式切换时使用
    window.initXibaoSlider = initXibaoSlider;
    window.stopXibaoAutoplay = stopAutoPlay;

    // 极简模式下跳过滑块初始化（元素会被移除，无需设置定时器和事件）
    if (!window.minimalistEnabled) {
        initXibaoSlider();
    }
})();
