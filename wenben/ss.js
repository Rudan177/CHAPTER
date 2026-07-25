const zhengwenData = [

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

