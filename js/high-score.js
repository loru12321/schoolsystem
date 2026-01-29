// 高分段核算

// === 渲染高分段表格 ===
function renderHighScoreTable() {
    const tbody = document.querySelector('#tb-high-score tbody');
    tbody.innerHTML = '';
    
    if (!CONFIG.name || !CONFIG.name.includes('9')) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#999;">🚫 当前非 9 年级模式，无高分段核算数据。</td></tr>';
        return;
    }
    if (Object.keys(SCHOOLS).length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px;">请先上传数据</td></tr>';
        return;
    }

    // 1. 提取所有学校数据
    const list = Object.values(SCHOOLS).map(s => {
        const hs = s.highScoreStats || { count: 0, ratio: 0, score: 0 };
        return {
            name: s.name,
            count: s.metrics.total ? s.metrics.total.count : 0,
            hsCount: hs.count,
            hsRatio: hs.ratio,
            score: hs.score
        };
    });

    // 2. 排序：按高分赋分降序
    list.sort((a,b) => b.score - a.score);

    // 3. 渲染所有行 (没有 slice)
    let html = '';
    list.forEach((d, i) => {
        const isMySchool = d.name === MY_SCHOOL;
        html += `<tr class="${isMySchool?'bg-highlight':''}">
            <td>${d.name}</td>
            <td>${d.count}</td>
            <td style="font-weight:bold;">
                <!-- 添加点击事件 -->
                <span class="clickable-num" onclick="handleHighClick('${d.name}')" title="点击查看高分学生名单">
                    ${d.hsCount}
                </span>
            </td>
            <td>${(d.hsRatio * 100).toFixed(2)}%</td>
            <td class="text-red" style="font-size:1.1em; font-weight:bold;">${d.score.toFixed(2)}</td>
            ${getRankHTML(i + 1)}
        </tr>`;
    });
    tbody.innerHTML = html;
    
    // 更新 UI 提示
    console.log(`已渲染 ${list.length} 所学校的高分数据`);
}

// === 导出高分段 Excel ===
function exportHighScoreExcel() {
    if (!Object.keys(SCHOOLS).length) return alert("无数据");
    if (!CONFIG.name.includes('9')) return alert("非9年级模式无此数据");

    const wb = XLSX.utils.book_new();
    const headers = ["学校名称", "实考人数", "高分人数(≥490)", "高分率", "高分赋分(70)", "排名"];
    const wsData = [headers];

    const list = Object.values(SCHOOLS).map(s => {
        const hs = s.highScoreStats || { count: 0, ratio: 0, score: 0 };
        return {
            name: s.name,
            count: s.metrics.total ? s.metrics.total.count : 0,
            hsCount: hs.count,
            hsRatio: hs.ratio,
            score: hs.score
        };
    }).sort((a,b) => b.score - a.score);

    list.forEach((d, i) => {
        wsData.push([
            d.name,
            d.count,
            d.hsCount,
            getExcelPercent(d.hsRatio),
            getExcelNum(d.score),
            i + 1
        ]);
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "高分段核算");
    XLSX.writeFile(wb, `高分段核算_${CONFIG.name}.xlsx`);
}
