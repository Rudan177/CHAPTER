// 图片预览功能
(function () {
    const modal = document.getElementById('imagePreviewModal');
    const previewImg = document.getElementById('previewImage');
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX, startY;

    function openImagePreview(src) {
        previewImg.src = src;
        modal.classList.add('active');
        resetTransform();
        document.body.style.overflow = 'hidden';
    }

    function closeImagePreview() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function resetTransform() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform();
    }

    function updateTransform() {
        previewImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }

    // 双击图片打开预览
    document.addEventListener('dblclick', function (e) {
        if (e.target.tagName === 'IMG' && !e.target.closest('.image-preview-modal')) {
            openImagePreview(e.target.src);
        }
    });

    // 点击模态框关闭
    modal.addEventListener('click', function (e) {
        if (e.target === modal || e.target === previewImg) {
            closeImagePreview();
        }
    });

    // 双击预览图片关闭
    previewImg.addEventListener('dblclick', closeImagePreview);

    // 关闭按钮
    window.closeImagePreview = closeImagePreview;

    // ESC键关闭
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeImagePreview();
        }
    });

    // 滚轮缩放
    modal.addEventListener('wheel', function (e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        scale = Math.min(Math.max(0.5, scale + delta), 5);
        updateTransform();
    });

    // 拖动功能
    previewImg.addEventListener('mousedown', function (e) {
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        previewImg.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
        if (isDragging) {
            translateX = e.clientX - startX;
            translateY = e.clientY - startY;
            updateTransform();
        }
    });

    document.addEventListener('mouseup', function () {
        isDragging = false;
        previewImg.style.cursor = 'grab';
    });

    // 触摸支持
    previewImg.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            isDragging = true;
            startX = e.touches[0].clientX - translateX;
            startY = e.touches[0].clientY - translateY;
        }
    });

    document.addEventListener('touchmove', function (e) {
        if (isDragging && e.touches.length === 1) {
            translateX = e.touches[0].clientX - startX;
            translateY = e.touches[0].clientY - startY;
            updateTransform();
        }
    });

    document.addEventListener('touchend', function () {
        isDragging = false;
    });
})();
