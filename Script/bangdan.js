// 榜单渲染
let zanZhuShuJu = [
    { mingCheng: 'lsa', jinE: 50.00, paiMing: 1 },
    { mingCheng: 'Valid_Void', jinE: 25.00, paiMing: 2 },
    { mingCheng: '筑梦前行', jinE: 25.00, paiMing: 3 },
    { mingCheng: 'ZLCjjlr', jinE: 21.00, paiMing: 4 },
    { mingCheng: 'Apple', jinE: 2.00, paiMing: 5 },
];

// 渲染赞助榜单柱状图
function xuanRanZanZhuBangDanZhuZhuangTu() {
    const rongQi = document.getElementById('zanZhuBangDanZhuZhuangTu');
    rongQi.innerHTML = '';

    // 找出最大值用于比例计算
    const zuiDaJinE = Math.max(...zanZhuShuJu.map(xiangMu => xiangMu.jinE));

    zanZhuShuJu.forEach((xiangMu, xiangBiao) => {
        const zhuGaoDu = (xiangMu.jinE / zuiDaJinE) * 280; // 最大高度280px

        const zhuDiv = document.createElement('div');
        zhuDiv.className = 'zhu zanZhuZhu';
        zhuDiv.style.height = zhuGaoDu + 'px';
        zhuDiv.dataset.xiangBiao = xiangBiao;

        const biaoQianDiv = document.createElement('div');
        biaoQianDiv.className = 'zhuBiaoQian';
        biaoQianDiv.textContent = xiangMu.mingCheng; // 显示完整名称

        const jinEDiv = document.createElement('div');
        jinEDiv.className = 'zhuShuZi';
        jinEDiv.textContent = '¥' + geShiHuaShuZi(xiangMu.jinE);

        zhuDiv.appendChild(biaoQianDiv);
        zhuDiv.appendChild(jinEDiv);
        rongQi.appendChild(zhuDiv);
    });

    // 触发动画
    setTimeout(() => {
        document.querySelectorAll('#zanZhuBangDanZhuZhuangTu .zhu').forEach((zhu, xiangBiao) => {
            setTimeout(() => {
                zhu.classList.add('huoDong');
            }, xiangBiao * 150);
        });
    }, 100);
}

// 渲染赞助榜单列表
function xuanRanZanZhuBangDanLieBiao() {
    const rongQi = document.getElementById('zanZhuBangDanLieBiao');
    rongQi.innerHTML = '';

    zanZhuShuJu.forEach(xiangMu => {
        const zanZhuXiangMu = document.createElement('div');
        zanZhuXiangMu.className = 'zanZhuXiangMu';

        const paiMingSpan = document.createElement('span');
        paiMingSpan.className = 'zanZhuPaiMing';
        paiMingSpan.textContent = xiangMu.paiMing;

        const mingChengSpan = document.createElement('span');
        mingChengSpan.className = 'zanZhuMingCheng';
        mingChengSpan.textContent = xiangMu.mingCheng;

        const jinESpan = document.createElement('span');
        jinESpan.className = 'zanZhuJinE';
        jinESpan.textContent = '¥' + geShiHuaShuZi(xiangMu.jinE);

        zanZhuXiangMu.appendChild(paiMingSpan);
        zanZhuXiangMu.appendChild(mingChengSpan);
        zanZhuXiangMu.appendChild(jinESpan);

        rongQi.appendChild(zanZhuXiangMu);
    });
}

// 格式化数字显示
function geShiHuaShuZi(num) {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
    xuanRanZanZhuBangDanZhuZhuangTu();
    xuanRanZanZhuBangDanLieBiao();
});
