const zhengwenData = [
    // first test
    `<div class="zhengwen">
        <h1>2026年7月25日 星期六</h1>
        <p> 这是一个测试文章。</p>
        <ol>
            <li> 这是第一个列表项。</li>
        </ol>
        <ul>
            <li> 这是第四个列表项。</li>
        </ul>
        <img src="../images/CL.png" alt="测试图片" style="width: 50%;">
        <a href="../video/ZLCjjlr20260225.mp4" target="_blank" class="video-thumbnail-link">
            <img src="../video/ZLCjjlr20260225.png" alt="ZLCjjlr祝福视频" class="video-thumbnail" loading="lazy">
        </a>
    </div>`,

    `<div class="zhengwen">
        <h1>2026年7月12日 知更鸟哥哥</h1>
    </div>`,

    `<div class="zhengwen">
        <h1>2026年7月10日 星期五</h1>
    </div>`,

    `<div class="zhengwen">
        <h1>2026年7月6日 星期四</h1>
    </div>`,
]
// 渐进式渲染：分批插入文章，避免一次性卡死主线程
function renderZhengwen() {
    const container = document.querySelector('.zhengwen-container');
    if (!container || !zhengwenData.length) return;

    // 清除容器占位，防止重复渲染
    container.innerHTML = '';

    const total = zhengwenData.length;
    let index = 0;
    // 每批渲染的文章数
    const BATCH = 3;

    function renderBatch() {
        const fragment = document.createDocumentFragment();
        const end = Math.min(index + BATCH, total);
        for (let i = index; i < end; i++) {
            const temp = document.createElement('div');
            temp.innerHTML = zhengwenData[i];
            // 将整个 .zhengwen 节点加入 fragment
            fragment.appendChild(temp.firstElementChild);
        }
        container.appendChild(fragment);
        index = end;

        if (index < total) {
            // 还没渲染完，下一帧继续
            requestAnimationFrame(renderBatch);
        }
    }

    // 用 requestAnimationFrame 启动渲染队列
    requestAnimationFrame(renderBatch);
}

// 页面加载完成后自动渲染
// 脚本有 defer 属性，执行时 DOM 已解析完毕，直接调用
renderZhengwen();

