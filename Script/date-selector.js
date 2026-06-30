// 日历弹出式日期选择器
(function () {
    const overlay = document.getElementById('calendarOverlay');
    const calTitle = document.getElementById('calTitle');
    const calGrid = document.getElementById('calGrid');
    const calPrev = document.getElementById('calPrev');
    const calNext = document.getElementById('calNext');
    const dateJumpBtn = document.getElementById('dateJumpBtn');
    const calClear = document.getElementById('calClear');
    const calClose = document.getElementById('calClose');

    const MONTH_LABELS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    let years = [];
    let currentYearIndex = 0;
    let selectedYear = null;
    let selectedMonth = null;
    let yearMonthMap = {};

    // 更新按钮文字
    function updateBtnText() {
        if (selectedYear && selectedMonth) {
            dateJumpBtn.textContent = (selectedYear % 100) + '年' + selectedMonth + '月';
        } else {
            dateJumpBtn.textContent = '跳转日期';
        }
    }

    // 获取文章中存在的年份和月份
    function getAvailableDates() {
        const articles = document.querySelectorAll('.zhengwen');
        const yearSet = new Set();
        yearMonthMap = {};

        articles.forEach(article => {
            const title = article.querySelector('h1');
            if (title) {
                const titleText = title.textContent;
                const yearMatch = titleText.match(/(\d{4})年/);
                const monthMatch = titleText.match(/(^|[^0-9])(\d{1,2})月/);
                if (yearMatch) {
                    const y = parseInt(yearMatch[1]);
                    yearSet.add(y);
                    if (monthMatch) {
                        if (!yearMonthMap[y]) yearMonthMap[y] = new Set();
                        yearMonthMap[y].add(parseInt(monthMatch[2]));
                    }
                }
            }
        });

        years = Array.from(yearSet).sort((a, b) => a - b);
    }

    // 渲染日历面板
    function renderCalendar() {
        const year = years[currentYearIndex];
        calTitle.textContent = year + '年';

        const availableMonths = yearMonthMap[year] || new Set();

        calGrid.innerHTML = '';
        MONTH_LABELS.forEach((label, i) => {
            const month = i + 1;
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            cell.textContent = label;
            cell.dataset.month = month;

            if (availableMonths.has(month)) {
                cell.classList.add('available');
            }

            if (selectedYear === year && selectedMonth === month) {
                cell.classList.add('selected');
            }

            cell.addEventListener('click', () => {
                if (!availableMonths.has(month)) return;

                if (selectedYear === year && selectedMonth === month) {
                    selectedYear = null;
                    selectedMonth = null;
                } else {
                    selectedYear = year;
                    selectedMonth = month;
                }

                updateBtnText();
                renderCalendar();
                searchArticles();
                closeCalendar();
            });

            calGrid.appendChild(cell);
        });
    }

    // 搜索文章
    function searchArticles() {
        const articles = document.querySelectorAll('.zhengwen');

        if (!selectedYear && !selectedMonth) {
            articles.forEach(article => article.style.display = 'block');
            return;
        }

        let found = false;
        articles.forEach(article => {
            const title = article.querySelector('h1');
            if (title) {
                const titleText = title.textContent;
                let match = true;

                if (selectedYear) {
                    if (!new RegExp(selectedYear + '年').test(titleText)) match = false;
                }
                if (selectedMonth && match) {
                    if (!new RegExp('(^|[^0-9])' + selectedMonth + '月').test(titleText)) match = false;
                }

                if (match) {
                    article.style.display = 'block';
                    if (!found) {
                        article.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        found = true;
                    }
                } else {
                    article.style.display = 'none';
                }
            }
        });

        if (!found) {
            articles.forEach(article => article.style.display = 'block');
        }
    }

    // 打开日历
    function openCalendar() {
        getAvailableDates();
        if (years.length === 0) return;
        if (currentYearIndex >= years.length) currentYearIndex = years.length - 1;
        renderCalendar();
        overlay.classList.add('active');
    }

    // 关闭日历
    function closeCalendar() {
        overlay.classList.remove('active');
    }

    // 点击遮罩关闭
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCalendar();
    });

    // 不选择按钮
    calClear.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedYear = null;
        selectedMonth = null;
        updateBtnText();
        renderCalendar();
        searchArticles();
        closeCalendar();
    });

    // 关闭按钮
    calClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCalendar();
    });

    // 跳转日期按钮
    dateJumpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (overlay.classList.contains('active')) {
            closeCalendar();
        } else {
            openCalendar();
        }
    });

    // 年份导航
    calPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentYearIndex > 0) {
            currentYearIndex--;
            renderCalendar();
        }
    });

    calNext.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentYearIndex < years.length - 1) {
            currentYearIndex++;
            renderCalendar();
        }
    });

    // ESC关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeCalendar();
        }
    });

    // 初始化
    function init() {
        getAvailableDates();
        if (years.length > 0) {
            currentYearIndex = years.length - 1;
        }
        updateBtnText();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
