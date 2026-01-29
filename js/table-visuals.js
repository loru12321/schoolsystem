// 表格热力图 + 学科列筛选

// --- 1. 表格热力图功能 (智能识别横向/纵向 + 强制覆盖本校高亮) ---
function toggleTableHeatmap(containerId) {
    const container = document.getElementById(containerId);
    if(!container) return;
    const tables = container.querySelectorAll('table');
    if(!tables.length) return alert("请先生成表格");

    // 切换状态标记
    const isHeatmapOn = container.classList.toggle('heatmap-mode');
    // 判断是否为“乡镇横向对比表” (该表结构特殊：行是指标，列是学校，需行内对比)
    const isHorizontalMode = (containerId === 'horizontal-table');
    
    tables.forEach(table => {
        if (!isHeatmapOn) {
            // 关闭：清除背景色 (使用 removeProperty 以确保清除 important 样式)
            table.querySelectorAll('td').forEach(td => td.style.removeProperty('background-color'));
            return;
        }

        const rows = Array.from(table.querySelectorAll('tbody tr'));
        if(rows.length === 0) return;

        // 提取数值的辅助函数
        const getVal = (cell) => {
            // 移除 %, +, (排名) 等符号，只取主数值
            const txt = cell.innerText.split('(')[0].replace(/[%+]/g, '').trim(); 
            return parseFloat(txt);
        };

        // 颜色计算辅助函数
        const applyColorToGroup = (cells, isRankType) => {
            const values = cells.map(c => c.val);
            const max = Math.max(...values);
            const min = Math.min(...values);
            const range = max - min;
            if (range === 0) return;

            cells.forEach(item => {
                let ratio = (item.val - min) / range;
                // 排名(Rank)类数据，数值越小越好(绿) -> ratio应大
                if (isRankType) ratio = 1 - ratio; 

                // 仿Excel色阶：低=红, 中=黄, 高=绿
                let r, g, b;
                if (ratio < 0.5) { // 红 -> 黄
                    r = 255; 
                    g = Math.round(200 + (ratio * 2) * 55); 
                    b = 200;
                } else { // 黄 -> 绿
                    r = Math.round(255 - ((ratio - 0.5) * 2) * 55); 
                    g = 255; 
                    b = 200;
                }
                
                // [修改点] 使用 setProperty(..., 'important') 强制覆盖 .bg-highlight 的 !important 样式
                // 这样热力图颜色会优先显示，但本校的文字颜色和边框依然保留
                item.el.style.setProperty('background-color', `rgb(${r}, ${g}, ${b})`, 'important');
            });
        };

        if (isHorizontalMode) {
            // === 模式 A：行内对比 (适用于乡镇横向对比表) ===
            rows.forEach(tr => {
                let cells = [];
                const label = tr.children[0].innerText;
                const isRank = label.includes('排名') || label.includes('名次');

                for (let c = 1; c < tr.children.length; c++) {
                    const cell = tr.children[c];
                    const val = getVal(cell);
                    if (!isNaN(val)) cells.push({ el: cell, val: val });
                }
                applyColorToGroup(cells, isRank);
            });

        } else {
            // === 模式 B：列内对比 (适用于班级对比等) ===
            const colCount = rows[0].children.length;
            for (let c = 1; c < colCount; c++) { 
                let cells = [];
                const headerText = table.querySelector(`thead th:nth-child(${c+1})`)?.innerText || "";
                const isRank = headerText.includes('排') || headerText.includes('名'); 

                rows.forEach(r => {
                    const cell = r.children[c];
                    const val = getVal(cell);
                    if (!isNaN(val)) cells.push({ el: cell, val: val });
                });
                applyColorToGroup(cells, isRank);
            }
        }
    });
}

// --- 2. 学科列筛选功能 ---
let COL_FILTER_STATE = {}; // 存储选中状态

function toggleColFilterMenu() {
    const popover = document.getElementById('col-filter-popover');
    if (popover.style.display === 'grid') {
        popover.style.display = 'none';
    } else {
        initColFilterUI();
        popover.style.display = 'grid';
    }
}

function initColFilterUI() {
    const popover = document.getElementById('col-filter-popover');
    if(popover.children.length > 0 && SUBJECTS.length === popover.children.length) return; // 已初始化

    popover.innerHTML = '';
    // 默认全选
    SUBJECTS.forEach(sub => {
        if(COL_FILTER_STATE[sub] === undefined) COL_FILTER_STATE[sub] = true;
        
        const label = document.createElement('label');
        label.className = 'filter-check-label';
        label.innerHTML = `<input type="checkbox" value="${sub}" ${COL_FILTER_STATE[sub] ? 'checked' : ''} onchange="applyColFilter(this)"> ${sub}`;
        popover.appendChild(label);
    });
    
    // 点击外部关闭
    document.addEventListener('click', function closeMenu(e) {
        if (!e.target.closest('#col-filter-popover') && !e.target.closest('#btn-col-filter')) {
            document.getElementById('col-filter-popover').style.display = 'none';
            document.removeEventListener('click', closeMenu);
        }
    });
}

function applyColFilter(checkbox) {
    const sub = checkbox.value;
    const isChecked = checkbox.checked;
    COL_FILTER_STATE[sub] = isChecked;

    // 查找班级对比区域的所有表格
    const container = document.getElementById('class-comp-results');
    const tables = container.querySelectorAll('table');
    
    // 逻辑：
    // 1. 总分表格 ("两率一分"等) 不受影响，通常保留
    // 2. 单科表格：如果该表格的标题（或上方的小标题）包含未选中的学科名，则隐藏整个表格块
    
    // 针对当前系统的 DOM 结构：
    // 每个学科是一个 <div id="anchor-class-数学">...<table>...</table></div>
    
    SUBJECTS.forEach(s => {
        const anchorDiv = document.getElementById(`anchor-class-${s}`);
        if (anchorDiv) {
            if (COL_FILTER_STATE[s]) {
                anchorDiv.classList.remove('hidden');
            } else {
                anchorDiv.classList.add('hidden');
            }
        }
    });

    // 另外，如果是针对长表格（如学生明细表）的列筛选，逻辑如下（通用化）：
    // 遍历所有 th，如果 th 文本包含未选中的学科，则隐藏该列
    // 这里主要针对班级对比的单科卡片显隐，已满足“只看语数英”的需求。
}
