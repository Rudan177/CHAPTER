// 喜报滑块切换逻辑
(function () {
    const closeBtn = document.getElementById('closeBtn');
    const xibaoSlider = document.querySelector('.xibao-slider-container');

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
    let autoPlayTimer = null;
    const autoPlayInterval = 8000;

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
        track.style.transform = `translateX(-${currentIndex * 100}%)`;
        updateDots();
        updateButtons();
    }

    function updateDots() {
        const dots = getDots();
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
        });
    }

    function updateButtons() {
        prevBtn.disabled = false;
        nextBtn.disabled = false;
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayTimer = setInterval(() => {
            goToSlide(currentIndex + 1);
        }, autoPlayInterval);
    }

    function stopAutoPlay() {
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    }

    function resetAutoPlay() {
        stopAutoPlay();
        startAutoPlay();
    }

    prevBtn.addEventListener('click', () => {
        goToSlide(currentIndex - 1);
        resetAutoPlay();
    });

    nextBtn.addEventListener('click', () => {
        goToSlide(currentIndex + 1);
        resetAutoPlay();
    });

    dotsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('xibao-dot')) {
            const dots = getDots();
            const index = Array.from(dots).indexOf(e.target);
            goToSlide(index);
            resetAutoPlay();
        }
    });

    let touchStartX = 0;
    let touchEndX = 0;

    track.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        stopAutoPlay();
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
        startAutoPlay();
    }, { passive: true });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                goToSlide(currentIndex + 1);
            } else {
                goToSlide(currentIndex - 1);
            }
        }
    }

    const wrapper = document.querySelector('.xibao-slider-wrapper');
    wrapper.addEventListener('mouseenter', stopAutoPlay);
    wrapper.addEventListener('mouseleave', startAutoPlay);

    updateButtons();
    createDots();
    startAutoPlay();
})();
