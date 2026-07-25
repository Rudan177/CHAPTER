// 版本信息统一管理
const SITE_VERSION = {
    style: '0.1:01',
    lastUpdate: '2026年7月25日'
};

// 页面加载后填充版本信息
document.addEventListener('DOMContentLoaded', function () {
    // footer中的版本号和更新时间
    const footUpdate = document.getElementById('footLastUpdate');
    if (footUpdate) footUpdate.textContent = '最后一次更新：' + SITE_VERSION.lastUpdate;

    const footVer = document.getElementById('footVersion');
    if (footVer) footVer.textContent = 'Style Version: ' + SITE_VERSION.style;
});
