function exportProgressAnalysis() {
    if(!PROGRESS_CACHE.length) return alert("暂无分析结果，请先进行分析");
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    const scope = (role === 'teacher') ? getTeacherScopeForUser(user) : null;
    const wb = XLSX.utils.book_new(); const data = [['班级', '姓名', '本次总分', '本次镇排', '上次总分', '上次镇排', '名次变化(正进负退)']];
    PROGRESS_CACHE
        .filter(r => {
            if (role === 'class_teacher' && user?.class) return r.class === user.class;
            if (role === 'teacher' && scope && scope.classes.size > 0) return scope.classes.has(r.class);
            return true;
        })
        .forEach(r => { data.push([r.class, r.name, r.currTotal, r.currRank, r.prevTotal, r.prevRank, r.change]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "进退步分析"); XLSX.writeFile(wb, "学生进退步追踪分析表.xlsx");
}

function analyzeMarginalStudents() {
    const selectedSchool = document.getElementById('marginalSchoolSelect').value; if (!selectedSchool) { alert('请选择本校'); return; }
    const mySchoolStudents = RAW_DATA.filter(student => student.school === selectedSchool); if (mySchoolStudents.length === 0) { alert('该学校没有学生数据'); return; }
    MARGINAL_STUDENTS = {}; const classes = {}; mySchoolStudents.forEach(student => { if (!classes[student.class]) classes[student.class] = []; classes[student.class].push(student); });
    Object.keys(classes).forEach(className => {
        const classStudents = classes[className];
        SUBJECTS.forEach(subject => {
            const excThreshold = THRESHOLDS[subject]?.exc || 0; const passThreshold = THRESHOLDS[subject]?.pass || 0;
            const excellentMarginal = classStudents.filter(student => { const score = student.scores[subject]; return score !== undefined && score < excThreshold && score >= excThreshold * 0.9; });
            const passMarginal = classStudents.filter(student => { const score = student.scores[subject]; return score !== undefined && score < passThreshold && score >= passThreshold * 0.8; });
            if (!MARGINAL_STUDENTS[className]) MARGINAL_STUDENTS[className] = {}; MARGINAL_STUDENTS[className][subject] = { excellentMarginal, passMarginal };
        });
    });
    renderMarginalStudents(selectedSchool);
}

function renderMarginalStudents(schoolName) {
    const container = document.getElementById('marginal-student-results'); container.innerHTML = '';
    Object.keys(MARGINAL_STUDENTS).sort().forEach(className => {
        let html = `<div class="sub-header">${className}班 - 边缘生分析</div><div class="table-wrap"><table><thead><tr><th>学科</th><th>优秀边缘生</th><th>及格边缘生</th></tr></thead><tbody>`;
        SUBJECTS.forEach(subject => {
            const subjectData = MARGINAL_STUDENTS[className][subject]; if (!subjectData) return;
            const formatList = (list, thresh) => list.length ? list.map(s => `<strong>${s.name}</strong> <span style="font-size:12px;color:#666">(${s.scores[subject]},差${(thresh-s.scores[subject]).toFixed(1)})</span>`).join('， ') : '无';
            html += `<tr><td>${subject}</td><td style="background:#f0fdf4;">${formatList(subjectData.excellentMarginal, THRESHOLDS[subject].exc)}</td><td style="background:#fffbeb;">${formatList(subjectData.passMarginal, THRESHOLDS[subject].pass)}</td></tr>`;
        });
        html += '</tbody></table></div>'; container.innerHTML += html;
    });
}

function exportMarginalStudents() {
    if (Object.keys(MARGINAL_STUDENTS).length === 0) { alert('请先进行边缘生分析'); return; }
    const wb = XLSX.utils.book_new(); const headers = ['班级', '学科', '类型', '学生姓名', '分数', '与标准线差距']; const data = [headers];
    Object.keys(MARGINAL_STUDENTS).sort().forEach(className => {
        Object.keys(MARGINAL_STUDENTS[className]).forEach(subject => {
            const subjectData = MARGINAL_STUDENTS[className][subject];
            subjectData.excellentMarginal.forEach(student => data.push([className, subject, '优秀边缘生', student.name, student.scores[subject].toFixed(1), (THRESHOLDS[subject].exc - student.scores[subject]).toFixed(1)]));
            subjectData.passMarginal.forEach(student => data.push([className, subject, '及格边缘生', student.name, student.scores[subject].toFixed(1), (THRESHOLDS[subject].pass - student.scores[subject]).toFixed(1)]));
        });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), '边缘生分析'); XLSX.writeFile(wb, '边缘生分析.xlsx');
}

function renderHorizontalTable() {
    const mySchoolName = document.getElementById('mySchool').value;
    let html = '<table class="comparison-table"><thead><tr><th>统计项目/科目</th>'; let mySchoolIndex = -1;
    const schoolNames = Object.keys(SCHOOLS);
    schoolNames.forEach((school, index) => { if(school === mySchoolName) mySchoolIndex = index; const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<th class="${highlightClass}">${school}</th>`; });
    html += '</tr></thead><tbody>';
    SUBJECTS.forEach(subject => {
        html += `<tr><td>${subject}平均分</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics[subject] ? formatRankDisplay(SCHOOLS[school].metrics[subject].avg, SCHOOLS[school].rankings[subject]?.avg || 0) : '-'}</td>`; });
        html += `</tr><tr><td>${subject}优秀率</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics[subject] ? formatRankDisplay(SCHOOLS[school].metrics[subject].excRate, SCHOOLS[school].rankings[subject]?.excRate || 0, 'school', true) : '-'}</td>`; });
        html += `</tr><tr><td>${subject}及格率</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics[subject] ? formatRankDisplay(SCHOOLS[school].metrics[subject].passRate, SCHOOLS[school].rankings[subject]?.passRate || 0, 'school', true) : '-'}</td>`; });
        html += '</tr>';
    });
    html += `<tr><td>${CONFIG.label}平均分</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics.total ? formatRankDisplay(SCHOOLS[school].metrics.total.avg, SCHOOLS[school].rankings.total?.avg || 0) : '-'}</td>`; });
    html += `<tr><td>${CONFIG.label}优秀率</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics.total ? formatRankDisplay(SCHOOLS[school].metrics.total.excRate, SCHOOLS[school].rankings.total?.excRate || 0, 'school', true) : '-'}</td>`; });
    html += `<tr><td>${CONFIG.label}及格率</td>`; schoolNames.forEach(school => { const highlightClass = (school === mySchoolName) ? 'bg-highlight' : ''; html += `<td class="${highlightClass}">${SCHOOLS[school].metrics.total ? formatRankDisplay(SCHOOLS[school].metrics.total.passRate, SCHOOLS[school].rankings.total?.passRate || 0, 'school', true) : '-'}</td>`; });
    html += '</tr></tbody></table>';
    document.getElementById('horizontal-table').innerHTML = html; document.getElementById('horizontal-box').classList.remove('hidden');
}

// ================= 增强版：横向对比Excel导出 =================
function exportHorizontalExcel() {
    const mySchoolName = document.getElementById('mySchool').value.trim();
    const schoolNames = Object.keys(SCHOOLS);
    if (schoolNames.length === 0) return alert("暂无数据可导出");

    const wb = XLSX.utils.book_new();
    const wsData = []; 
    const merges = []; 
    let rowIndex = 0;  

    const borderStyle = { top: { style: "thin", color: { rgb: "E2E8F0" } }, bottom: { style: "thin", color: { rgb: "E2E8F0" } }, left: { style: "thin", color: { rgb: "E2E8F0" } }, right: { style: "thin", color: { rgb: "E2E8F0" } } };
    const styleHeader = { font: { bold: true, color: { rgb: "333333" }, sz: 11 }, fill: { fgColor: { rgb: "F3F4F6" } }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
    const styleSubjectBar = { font: { bold: true, color: { rgb: "1E40AF" }, sz: 12 }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "left", vertical: "center" }, border: { top: { style: "medium", color: { rgb: "3B82F6" } }, bottom: { style: "thin" } } };
    const styleNormal = { alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
    const styleHighlight = { fill: { fgColor: { rgb: "FEF9C3" } }, font: { bold: true, color: { rgb: "B45309" } }, alignment: { horizontal: "center", vertical: "center" }, border: { ...borderStyle, left: { style: "medium", color: { rgb: "FACC15" } }, right: { style: "medium", color: { rgb: "FACC15" } } } };
    const styleRankRow = { font: { color: { rgb: "94A3B8" }, sz: 9 }, alignment: { horizontal: "center", vertical: "center" }, border: borderStyle };
    const styleHighlightRank = Object.assign({}, styleHighlight, { font: { color: { rgb: "B45309" }, sz: 9 } });

    const headerRow = [{ v: "统计项目 / 学校", t: 's', s: styleHeader }];
    let mySchoolIndex = -1;

    schoolNames.forEach((name, index) => {
        const isMySchool = (name === mySchoolName);
        if (isMySchool) mySchoolIndex = index;
        headerRow.push({ v: name, t: 's', s: isMySchool ? styleHighlight : styleHeader });
    });
    wsData.push(headerRow);
    rowIndex++; 

    const createCell = (val, type, format, isRankRow, colIndex) => {
        const isMyCol = (colIndex === mySchoolIndex);
        let style = isRankRow ? styleRankRow : styleNormal;
        if (isMyCol) style = isRankRow ? styleHighlightRank : styleHighlight;
        if (val === '-' || val === undefined || val === null) { return { v: '-', t: 's', s: style }; }
        return { v: val, t: type, z: format, s: style };
    };

    const allItems = [...SUBJECTS, 'total']; 
    const totalCols = schoolNames.length + 1;

    allItems.forEach(sub => {
        const label = sub === 'total' ? CONFIG.label : sub;
        const sepRowData = [];
        for(let c=0; c<totalCols; c++) { sepRowData.push({ v: c===0 ? `📘 ${label} 数据分析` : "", t: 's', s: styleSubjectBar }); }
        wsData.push(sepRowData);
        merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: totalCols - 1 } });
        rowIndex++; 

        const labelStyle = (color) => ({ font: { color: { rgb: color }, bold:true }, fill: { fgColor: { rgb: "F9FAFB" } }, border: borderStyle });
        const rowAvg = [{ v: "平均分", t: 's', s: labelStyle("2563EB") }]; const rowAvgR = [{ v: "   ↳ 排名", t: 's', s: styleRankRow }];
        const rowExc = [{ v: "优秀率", t: 's', s: labelStyle("16A34A") }]; const rowExcR = [{ v: "   ↳ 排名", t: 's', s: styleRankRow }];
        const rowPass = [{ v: "及格率", t: 's', s: labelStyle("D97706") }]; const rowPassR = [{ v: "   ↳ 排名", t: 's', s: styleRankRow }];

        schoolNames.forEach((school, idx) => {
            const metrics = SCHOOLS[school].metrics[sub]; const rankings = SCHOOLS[school].rankings[sub] || {};
            if (metrics) {
                rowAvg.push(createCell(parseFloat(metrics.avg.toFixed(2)), 'n', '0.00', false, idx));
                rowAvgR.push(createCell(rankings.avg, 'n', '0', true, idx));
                rowExc.push(createCell(metrics.excRate, 'n', '0.00%', false, idx));
                rowExcR.push(createCell(rankings.excRate, 'n', '0', true, idx));
                rowPass.push(createCell(metrics.passRate, 'n', '0.00%', false, idx));
                rowPassR.push(createCell(rankings.passRate, 'n', '0', true, idx));
            } else {
                [rowAvg, rowAvgR, rowExc, rowExcR, rowPass, rowPassR].forEach(r => r.push(createCell('-', 's', null, false, idx)));
            }
        });
        wsData.push(rowAvg, rowAvgR, rowExc, rowExcR, rowPass, rowPassR);
        rowIndex += 6; 
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!merges'] = merges;
    const cols = [{ wch: 20 }]; schoolNames.forEach(() => cols.push({ wch: 11 })); ws['!cols'] = cols;
    ws['!freeze'] = { xSplit: 1, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, "横向对比分析");
    XLSX.writeFile(wb, `乡镇学校横向对比表_${mySchoolName || '全镇'}.xlsx`);
}

function exportMacroTables() {
    if (!Object.keys(SCHOOLS).length) return alert("请先上传数据");
    
    const isGrade9 = CONFIG.name && CONFIG.name.includes('9');
    const wb = XLSX.utils.book_new();
    
    // 1. 构建动态表头
    let headerRow = ["学校名称", "实考人数", "平均分", "优秀率", "及格率"];
    if (isGrade9) {
        headerRow.push("高分人数(≥490)", "高分率", "高分赋分");
    }
    headerRow.push("赋分-均分", "赋分-优率", "赋分-及格", "两率一分总分", "排名");

    const summaryData = [headerRow];
    const list = Object.values(SCHOOLS).sort((a,b)=>a.rank2Rate - b.rank2Rate);
    
    // 2. 构建数据行
    list.forEach(s => {
        const m = s.metrics.total || {};
        let row = [
            s.name, 
            m.count || 0, 
            getExcelNum(m.avg), 
            getExcelPercent(m.excRate), 
            getExcelPercent(m.passRate)
        ];

        // 插入高分数据
        if (isGrade9) {
            const hs = s.highScoreStats || { count: 0, ratio: 0, score: 0 };
            row.push(hs.count, getExcelPercent(hs.ratio), getExcelNum(hs.score));
        }

        // 插入原有赋分数据
        row.push(
            getExcelNum(m.ratedAvg), 
            getExcelNum(m.ratedExc), 
            getExcelNum(m.ratedPass), 
            getExcelNum(s.score2Rate), 
            s.rank2Rate
        );
        
        summaryData.push(row);
    });

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    // 调用装饰函数，传入 Worksheet 和 表头数组
    decorateExcelSheet(wsSummary, headerRow); 
    XLSX.utils.book_append_sheet(wb, wsSummary, "综合总表");
    
   // 遍历所有学科导出详情
    SUBJECTS.forEach(sub => {
        // 1. 先显式定义表头数组 (之前报错是因为这行可能被漏掉或写在了数组里)
        const subHeaders = ["学校名称", "实考人数", "平均分", "优秀率", "及格率", "均分排名", "优率排名", "及格排名"];
        
        // 2. 使用定义的表头初始化数据数组
        const subData = [subHeaders]; 
        
        const subList = Object.values(SCHOOLS).filter(s=>s.metrics[sub]).sort((a,b)=>(a.rankings[sub].avg - b.rankings[sub].avg));
        
        subList.forEach(s => { 
            const m = s.metrics[sub]; 
            const r = s.rankings[sub]; 
            subData.push([
                s.name, 
                m.count, 
                getExcelNum(m.avg), 
                getExcelPercent(m.excRate), 
                getExcelPercent(m.passRate), 
                r.avg, 
                r.excRate, 
                r.passRate
            ]); 
        });
        
        const wsSub = XLSX.utils.aoa_to_sheet(subData);
        
        // 3. 应用样式 (现在 subHeaders 已经有定义了，不会报错)
        decorateExcelSheet(wsSub, subHeaders);
        
        XLSX.utils.book_append_sheet(wb, wsSub, sub);
    });
    
    XLSX.writeFile(wb, `乡镇宏观分析_${CONFIG.name}.xlsx`);
}

// --- 增值性评价逻辑 ---

let VA_VIEW_MODE = 'school'; // school | class

function switchValueAddedView(mode, btn) {
    VA_VIEW_MODE = mode;
    
    // 1. 切换按钮自身的激活状态 (视觉反馈)
    // 找到同一组的所有按钮 (它们都在同一个父容器里)
    const siblings = btn.parentNode.querySelectorAll('.btn');
    siblings.forEach(b => {
        b.classList.remove('active');
        // 恢复默认样式 (白底灰字)
        b.style.backgroundColor = 'white';
        b.style.color = '#64748b';
    });
    
    // 设置当前按钮为激活样式 (蓝底白字)
    btn.classList.add('active');
    btn.style.backgroundColor = '#e0f2fe';
    btn.style.color = '#0369a1';
    // 重新渲染表格
    renderValueAddedReport(true);
}

function renderValueAddedReport(isSwitching = false) {
    // 1. 检查数据源
    if (!PROGRESS_CACHE || PROGRESS_CACHE.length === 0) {
        // 尝试自动检查是否已有数据
        if (PREV_DATA.length > 0 && RAW_DATA.length > 0) {
             // 如果有数据但没生成缓存，提示用户去那个模块点一下，或者这里自动调用（为了安全起见，提示用户）
             document.getElementById('va-data-status').innerHTML = '⚠️ 已有数据，正在后台计算...';
             // 自动执行一次匹配逻辑 (借用 renderProgressAnalysis 的逻辑，但不画图)
             // 这里为了简化，我们直接基于 PREV_DATA 和 RAW_DATA 现场算一遍核心数据
             performSilentMatching();
        } else {
             if(!isSwitching) alert("❌ 无法生成：请先在【进退步追踪】模块上传“上次考试”数据！");
             document.getElementById('va-data-status').innerHTML = '❌ 缺上次考试数据';
             return;
        }
    }
    document.getElementById('va-data-status').innerHTML = '✅ 数据就绪';

    // 2. 聚合数据
    const stats = {};
    
    PROGRESS_CACHE.forEach(p => {
        // 确定分组键：是按学校还是按班级
        let key = "";
        let name = "";
        if (VA_VIEW_MODE === 'school') {
            // 根据当前学生找学校名
            // PROGRESS_CACHE 里可能没有存 school 字段，需要回溯 RAW_DATA 找，或者我们在 performSilentMatching 里补全
            const stuObj = RAW_DATA.find(r => r.name === p.name && r.class === p.class); 
            if (stuObj) key = stuObj.school;
            else key = "未知学校";
            name = key;
        } else {
            key = p.class; // 班级
            // 尝试附加学校名以防班级重名
            const stuObj = RAW_DATA.find(r => r.name === p.name && r.class === p.class);
            if (stuObj) name = `${stuObj.school} ${p.class}`;
            else name = p.class;
        }

        if (!stats[name]) {
            stats[name] = { name: name, count: 0, sumPrev: 0, sumCurr: 0 };
        }
        stats[name].count++;
        stats[name].sumPrev += p.prevRank;
        stats[name].sumCurr += p.currRank;
    });

    // 3. 计算增值指标
    const reportData = Object.values(stats).map(item => {
        const avgPrev = item.sumPrev / item.count;
        const avgCurr = item.sumCurr / item.count;
        const valueAdded = avgPrev - avgCurr; // 正数表示排名向前移动（变小）
        return {
            name: item.name,
            count: item.count,
            entryAvg: avgPrev,
            exitAvg: avgCurr,
            valueAdded: valueAdded
        };
    });

    // 4. 排序 (按增值从高到低)
    reportData.sort((a, b) => b.valueAdded - a.valueAdded);
    reportData.forEach((d, i) => d.rank = i + 1);

    // 5. 渲染表格
    const tbody = document.querySelector('#tb-value-added tbody');
    let html = '';
    reportData.forEach(d => {
        const vaFixed = d.valueAdded.toFixed(1);
        let colorClass = d.valueAdded > 0 ? 'text-green' : (d.valueAdded < 0 ? 'text-red' : '');
        let sign = d.valueAdded > 0 ? '+' : '';
        
        // 评价标签
        let evalTag = '';
        if (d.valueAdded >= 50) evalTag = '<span class="badge" style="background:#16a34a">🚀 卓越增值</span>';
        else if (d.valueAdded >= 10) evalTag = '<span class="badge" style="background:#2563eb">📈 有效提升</span>';
        else if (d.valueAdded <= -50) evalTag = '<span class="badge" style="background:#dc2626">📉 严重滑坡</span>';
        else evalTag = '<span class="badge" style="background:#94a3b8">➖ 保持稳定</span>';

        html += `
            <tr>
                <td style="font-weight:bold;">${d.name}</td>
                <td>${d.count}</td>
                <td style="color:#666;">${d.entryAvg.toFixed(1)}</td>
                <td style="color:#333;">${d.exitAvg.toFixed(1)}</td>
                <td style="font-size:16px; font-weight:bold;" class="${colorClass}">${sign}${vaFixed}</td>
                <td>${evalTag}</td>
                <td class="rank-cell ${d.rank<=3 ? 'r-'+d.rank : ''}">${d.rank}</td>
            </tr>
        `;
    });
    
    if (reportData.length === 0) html = '<tr><td colspan="7" style="text-align:center;">暂无匹配数据</td></tr>';
    tbody.innerHTML = html;
    
    // 缓存供导出用
    window.LAST_VA_DATA = reportData;
}

// 后台静默匹配 (如果用户没点进退步分析，这里补做一次匹配)
function performSilentMatching() {
    if (!PREV_DATA.length || !RAW_DATA.length) return;
    PROGRESS_CACHE = [];
    // 简单的姓名匹配逻辑
    RAW_DATA.forEach(curr => {
        // 尝试匹配：优先全名+学校，其次全名
        let prev = PREV_DATA.find(p => p.name === curr.name && p.school === curr.school);
        if (!prev) prev = PREV_DATA.find(p => p.name === curr.name); // 宽松匹配
        
        if (prev) {
            const currRank = safeGet(curr, 'ranks.total.township', 0);
            // 只有当两者都有有效排名时才算
            if (currRank > 0 && prev.rank > 0) {
                PROGRESS_CACHE.push({
                    school: curr.school, // 补全学校信息
                    class: curr.class,
                    name: curr.name,
                    currRank: currRank,
                    prevRank: prev.rank,
                    change: prev.rank - currRank
                });
            }
        }
    });
}

function exportValueAddedExcel() {
    if (!window.LAST_VA_DATA || window.LAST_VA_DATA.length === 0) return alert("请先生成报表");
    
    const wb = XLSX.utils.book_new();
    const data = [['单位名称', '匹配人数', '入口均位(上次排名)', '出口均位(本次排名)', '平均增值(名次)', '增值排名']];
    
    window.LAST_VA_DATA.forEach(d => {
        data.push([d.name, d.count, d.entryAvg.toFixed(2), d.exitAvg.toFixed(2), d.valueAdded.toFixed(2), d.rank]);
    });

    // 列宽设置
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:20}, {wch:10}, {wch:15}, {wch:15}, {wch:15}, {wch:10}];
    
    XLSX.utils.book_append_sheet(wb, ws, "增值性评价表");
    XLSX.writeFile(wb, `增值性评价报表_${VA_VIEW_MODE === 'school' ? '学校' : '班级'}.xlsx`);
}

function exportSummaryTable() {
    if(!Object.keys(SCHOOLS).length) return alert("无数据");
    
    const isGrade9 = CONFIG.name && CONFIG.name.includes('9');
    
    // 1. 准备数据
    const list = Object.values(SCHOOLS).map(s => {
        const s1 = s.score2Rate || 0;
        const s2 = s.scoreBottom || 0;
        const s3 = s.scoreInd || 0;
        // 获取高分赋分
        const s4 = (isGrade9 && s.highScoreStats) ? (s.highScoreStats.score || 0) : 0;
        // 计算包含高分赋分的总分
        const total = s1 + s2 + s3 + s4;
        
        return { name: s.name, s1, s2, s3, s4, total };
    });
    
    // 2. 排序
    list.sort((a,b) => b.total - a.total).forEach((d,i) => d.rank = i+1);
    
    const wb = XLSX.utils.book_new();
    
    // 3. 构建表头
    const headers = ["学校名称", "两率一分得分", "后1/3得分", "指标生得分"];
    if (isGrade9) headers.push("高分段赋分(70)");
    headers.push("综合总分", "总排名");
    
    const wsData = [headers];
    
    // 4. 填充数据
    list.forEach(d => { 
        const row = [
            d.name, 
            getExcelNum(d.s1), 
            getExcelNum(d.s2), 
            getExcelNum(d.s3)
        ];
        
        // 如果是9年级，插入高分赋分列数据
        if (isGrade9) row.push(getExcelNum(d.s4));
        
        row.push(getExcelNum(d.total), d.rank);
        
        wsData.push(row); 
    });
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "综合分析报告");
    XLSX.writeFile(wb, `综合分析报告_${CONFIG.name}.xlsx`);
}

function exportTeacherComparisonExcel() {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        logAction('导出拦截', '教师尝试导出教师对比');
        return alert('⛔ 权限不足：当前角色禁止导出教师对比');
    }
    if (Object.keys(TEACHER_STATS).length === 0) return alert("请先进行教师分析");
    const gradeAverages = {}; SUBJECTS.forEach(subject => { if (SCHOOLS[MY_SCHOOL] && SCHOOLS[MY_SCHOOL].metrics[subject]) { gradeAverages[subject] = SCHOOLS[MY_SCHOOL].metrics[subject]; } });
    const wb = XLSX.utils.book_new();
    const wsData = [["教师姓名", "学科", "任教班级", "人数", "平均分(实际)", "与级比", "校排", "优秀率(实际)", "与级比", "校排", "及格率(实际)", "与级比", "校排", "综合得分", "综合排名"]];
    const subjectTeachers = {};
    Object.keys(TEACHER_STATS).forEach(teacher => {
        Object.keys(TEACHER_STATS[teacher]).forEach(subject => {
            if (!subjectTeachers[subject]) subjectTeachers[subject] = [];
            const data = TEACHER_STATS[teacher][subject]; const gradeAvg = gradeAverages[subject] || { avg: 0, excRate: 0, passRate: 0 };
            const avgComparison = gradeAvg.avg ? ((parseFloat(data.avg) - gradeAvg.avg) / gradeAvg.avg) : 0; 
            const excComparison = gradeAvg.excRate ? ((data.excellentRate - gradeAvg.excRate) / gradeAvg.excRate) : 0;
            const passComparison = gradeAvg.passRate ? ((data.passRate - gradeAvg.passRate) / gradeAvg.passRate) : 0;
            subjectTeachers[subject].push({ teacher, data, avgComparison, excComparison, passComparison });
        });
    });
    Object.keys(subjectTeachers).sort(sortSubjects).forEach(subject => {
        const arr = subjectTeachers[subject];
        const setRank = (key, rankKey) => { arr.sort((a,b)=> parseFloat(b.data[key]) - parseFloat(a.data[key])).forEach((item,i)=>item[rankKey]=i+1); };
        setRank('avg','avgRank'); setRank('excellentRate','excRank'); setRank('passRate','passRank');
        arr.forEach(item => { item.compositeScore = ((1-(item.avgRank-1)/arr.length)*50 + (1-(item.excRank-1)/arr.length)*30 + (1-(item.passRank-1)/arr.length)*20); });
        arr.sort((a, b) => b.compositeScore - a.compositeScore).forEach((item, index) => { item.compositeRank = index + 1; });
        arr.forEach(item => {
            const data = item.data;
            wsData.push([item.teacher, subject, data.classes, data.studentCount, getExcelNum(parseFloat(data.avg)), getExcelPercent(item.avgComparison), item.avgRank, getExcelPercent(data.excellentRate), getExcelPercent(item.excComparison), item.excRank, getExcelPercent(data.passRate), getExcelPercent(item.passComparison), item.passRank, getExcelNum(item.compositeScore), item.compositeRank]);
        });
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "教师详细对比");
    XLSX.writeFile(wb, "教师详细数据对比表.xlsx");
}

function exportTeacherTownshipRankExcel() {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        logAction('导出拦截', '教师尝试导出乡镇排名');
        return alert('⛔ 权限不足：当前角色禁止导出乡镇排名');
    }
    if(!Object.keys(TOWNSHIP_RANKING_DATA).length) return alert("无排名数据");
    const wb = XLSX.utils.book_new();
    SUBJECTS.forEach(sub => {
        const data = TOWNSHIP_RANKING_DATA[sub];
        if(!data) return;
        const wsData = [["教师/学校", "类型", "平均分", "镇排", "优秀率", "镇排", "及格率", "镇排"]];
        data.forEach(item => { wsData.push([item.name, item.type === 'teacher' ? '教师' : '学校', getExcelNum(item.avg), item.rankAvg, getExcelPercent(item.excellentRate), item.rankExc, getExcelPercent(item.passRate), item.rankPass]); });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), sub);
    });
    XLSX.writeFile(wb, "教师乡镇排名.xlsx");
}

// 辅助：将 Blob/File 转为 Base64 并自动存入缓存
async function loadHistoricalArchives(input) {
    const files = input.files; 
    if (!files.length) return;
    
    let loadedCount = 0;
    
    // 遍历所有上传的文件
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const examName = file.name.replace('.xlsx', '').replace('.xls', ''); // 用文件名作为考试名
        
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet); // 读取为对象数组
                
                // 自动识别列名
                if (json.length > 0) {
                    const sample = json[0];
                    // 寻找关键列：姓名、学校、总分/排名
                    const keyName = Object.keys(sample).find(k => k.includes('姓名') || k.toLowerCase() === 'name');
                    const keySchool = Object.keys(sample).find(k => k.includes('学校') || k.toLowerCase() === 'school');
                    // 优先找排名列，如果没有则找总分列后续自动算排名(简化起见这里假设有总分)
                    const keyRank = Object.keys(sample).find(k => k.includes('排名') || k.includes('名次') || k.includes('Rank'));
                    const keyScore = Object.keys(sample).find(k => k.includes('总分') || k.includes('Total') || k === '得分');

                    if (keyName && (keyRank || keyScore)) {
                        // 如果只有分数没有排名，先进行一次简单的排序计算
                        if (!keyRank && keyScore) {
                            json.sort((a, b) => (b[keyScore]||0) - (a[keyScore]||0));
                            json.forEach((row, idx) => row._tempRank = idx + 1);
                        }

                        json.forEach(row => {
                            const name = row[keyName];
                            const school = keySchool ? row[keySchool] : '默认学校'; // 如果没有学校列，视为单校
                            const rank = keyRank ? parseInt(row[keyRank]) : row._tempRank;
                            
                            // 尝试在行数据中找“班级”
                            let className = "";
                            const keyClass = Object.keys(row).find(k => k.includes('班') || k.toLowerCase().includes('class'));
                            if (keyClass) className = normalizeClass(row[keyClass]);

                            if (name && rank) {
                                // 唯一标识加入班级：学校_班级_姓名 (例如: 实验中学_701_张三)
                                // 这样 701的张三 和 702的张三 就会拥有两份不同的档案
                                const uid = school + "_" + className + "_" + name; 
                                if (!HISTORY_ARCHIVE[uid]) HISTORY_ARCHIVE[uid] = [];
                                
                                // 避免重复添加同一场考试
                                if (!HISTORY_ARCHIVE[uid].find(x => x.exam === examName)) {
                                    HISTORY_ARCHIVE[uid].push({ exam: examName, rank: rank });
                                }
                            }
                        });
                        loadedCount++;
                    }
                }
                resolve();
            };
            reader.readAsArrayBuffer(file);
        });
    }
    
    // 计算稳定性并标记过山车学生
    analyzeStability();
    
    document.getElementById('history-status').innerText = `✅ 已建立 ${Object.keys(HISTORY_ARCHIVE).length} 份学生档案，包含 ${loadedCount} 次历史考试。`;
    input.value = ''; // 清空以允许重复上传
}

function analyzeStability() {
    ROLLER_COASTER_STUDENTS = [];
    Object.keys(HISTORY_ARCHIVE).forEach(uid => {
        const records = HISTORY_ARCHIVE[uid];
        if (records.length < 3) return; // 至少3次考试才算波动

        const ranks = records.map(r => r.rank);
        const n = ranks.length;
        const mean = ranks.reduce((a, b) => a + b, 0) / n;
        // 计算标准差 (Standard Deviation)
        const variance = ranks.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        const sd = Math.sqrt(variance);

        // 阈值设定：如果标准差超过 50 (意味着平均每次排名波动幅度很大)，标记为过山车
        // *也可以根据全镇人数动态调整，这里先设固定值或全校人数的10%
        if (sd > 50) {
            ROLLER_COASTER_STUDENTS.push(uid);
        }
    });
    console.log("检测到波动剧烈学生数:", ROLLER_COASTER_STUDENTS.length);
}

function getIndicatorContext() {
    let meta = null;
    try { meta = JSON.parse(localStorage.getItem('ARCHIVE_META') || 'null'); } catch(e) {}
    if (!meta) meta = getExamMetaFromUI();
    const grade = String(meta?.grade || computeCohortGrade(CURRENT_COHORT_META, meta) || '');
    const type = meta?.type || '';
    return { grade, type, meta };
}

function isIndicatorPromptAllowed() {
    const ctx = getIndicatorContext();
    return ctx.grade === '9';
}

function isIndicatorCalcAllowed() {
    const ctx = getIndicatorContext();
    return ctx.grade === '9' && (ctx.type === '期中' || ctx.type === '期末');
}

function updateIndicatorUIState() {
    const promptAllowed = isIndicatorPromptAllowed();
    const calcAllowed = isIndicatorCalcAllowed();
    const btn = document.getElementById('btn-indicator-calc');
    if (btn) btn.disabled = !promptAllowed;
    const paramsArea = document.getElementById('dm-params-area');
    if (paramsArea) paramsArea.style.display = promptAllowed ? 'block' : 'none';
    const i1 = document.getElementById('dm_ind1_input');
    const i2 = document.getElementById('dm_ind2_input');
    if (i1) i1.disabled = !promptAllowed;
    if (i2) i2.disabled = !promptAllowed;
    const tip = document.getElementById('dm-params-tip');
    if (tip) tip.style.display = calcAllowed ? 'none' : (promptAllowed ? 'block' : 'none');
}

function calcIndicators() {
    if (!isIndicatorPromptAllowed()) return;
    // 1. 优先读取全局变量 SYS_VARS (这是最可靠的数据源)
    // 如果全局变量是空的，尝试读取管理面板里的输入框 (dm_ind...)
    let val1 = window.SYS_VARS?.indicator?.ind1;
    let val2 = window.SYS_VARS?.indicator?.ind2;

    if (!val1) val1 = document.getElementById('dm_ind1_input')?.value;
    if (!val2) val2 = document.getElementById('dm_ind2_input')?.value;

    const r1 = parseInt(val1);
    const r2 = parseInt(val2);
    
    // 2. 检查：如果参数未设置，自动打开管理面板并跳转到【年级指标参数】页
    if(!r1 || !r2) {
        if(confirm("❌ 检测到【划线名次】尚未设置！\n\n是否立即打开「教务数据综合控制台」进行设置？")) {
            DataManager.open(); // 打开弹窗
            DataManager.switchTab('params'); // 自动切换到参数设置Tab
        }
        return;
    }

    if (!isIndicatorCalcAllowed()) return;

    // 3. 检查：如果目标人数未导入，自动打开管理面板并跳转到【目标人数管理】页
    // window.TARGETS 是在 loadCloudData 或 DataManager 中加载的
    if(!window.TARGETS || Object.keys(window.TARGETS).length === 0) {
        if(confirm("❌ 检测到【目标人数】尚未导入！\n\n是否立即打开「教务数据综合控制台」进行导入？")) {
            DataManager.open(); // 打开弹窗
            DataManager.switchTab('targets'); // 自动切换到目标管理Tab
        }
        return;
    }

    // 1. 确定全镇划线分数
    // 9年级模式下 s.total 即为五科总分
    const allScores = RAW_DATA.map(s => s.total).sort((a,b)=>b-a); 
    const line1 = allScores[r1-1] || 0; 
    const line2 = allScores[r2-1] || 0;

    // 2. 第一轮遍历：计算达标人数、基础分、超额数
    let calcData = [];
    let maxExcess1 = 0; // 指标一最大超额数
    let maxExcess2 = 0; // 指标二最大超额数

    Object.values(SCHOOLS).forEach(s => {
        const scores = s.students.map(stu => stu.total);
        const reach1 = scores.filter(v => v >= line1).length; // 实际达标1
        const reach2 = scores.filter(v => v >= line2).length; // 实际达标2
        
        const t = window.TARGETS[s.name] || {t1: 10000, t2: 10000}; // 防止除以0
        
        // --- 指标一计算 ---
        // 基础分 (满分30)
        let base1 = 0;
        if (reach1 >= t.t1) base1 = 30;
        else base1 = (t.t1 > 0) ? (reach1 / t.t1 * 30) : 0;
        
        // 超额数
        const excess1 = Math.max(0, reach1 - t.t1);
        if (excess1 > maxExcess1) maxExcess1 = excess1;

        // --- 指标二计算 ---
        // 基础分 (满分30)
        let base2 = 0;
        if (reach2 >= t.t2) base2 = 30;
        else base2 = (t.t2 > 0) ? (reach2 / t.t2 * 30) : 0;

        // 超额数
        const excess2 = Math.max(0, reach2 - t.t2);
        if (excess2 > maxExcess2) maxExcess2 = excess2;

        calcData.push({
            name: s.name,
            t1: t.t1, r1: reach1, base1: base1, excess1: excess1,
            t2: t.t2, r2: reach2, base2: base2, excess2: excess2
        });
    });

    // 3. 第二轮遍历：计算附加分、总分并排序
    calcData.forEach(d => {
        // 附加分公式：(某校超额 / 最大超额) * 5
        d.bonus1 = (maxExcess1 > 0) ? (d.excess1 / maxExcess1 * 5) : 0;
        d.score1 = d.base1 + d.bonus1;

        d.bonus2 = (maxExcess2 > 0) ? (d.excess2 / maxExcess2 * 5) : 0;
        d.score2 = d.base2 + d.bonus2;

        d.finalScore = d.score1 + d.score2;
        
        // 同步到全局对象供综合排名使用
        if(SCHOOLS[d.name]) SCHOOLS[d.name].scoreInd = d.finalScore;
    });

    // 排序
    calcData.sort((a,b) => b.finalScore - a.finalScore).forEach((d, i) => d.rank = i + 1);

    // 4. 渲染表格 (表头增加基础分/附加分列)
    const thead = document.querySelector('#tb-indicator thead');
    thead.innerHTML = `
        <tr>
            <th rowspan="2">学校</th>
            <th colspan="4" style="background:#e0f2fe; color:#0369a1;">指标一 (参考分:${line1})</th>
            <th colspan="4" style="background:#fff7ed; color:#b45309;">指标二 (参考分:${line2})</th>
            <th rowspan="2">指标总分</th>
            <th rowspan="2">排名</th>
        </tr>
        <tr>
            <th>目标/达标</th><th>基础分</th><th>附加分</th><th>小计</th>
            <th>目标/达标</th><th>基础分</th><th>附加分</th><th>小计</th>
        </tr>
    `;

    let html = ''; 
    calcData.forEach(d => { 
        const isMySchool = d.name === MY_SCHOOL; 
        html += `
        <tr class="${isMySchool?'bg-highlight':''}">
            <td style="font-weight:bold;">${d.name}</td>
            
            <!-- 指标一 -->
            <td>
                <!-- 👇 新增点击事件：点击目标人数，分析如何达标 -->
                <span class="clickable-num" style="color:#d97706; border-bottom:1px dashed #d97706;" 
                      onclick="analyzeTargetGap('${d.name}', 'ind1', ${line1})" 
                      title="点击分析：哪些学生差一点就达标？补哪科？">
                    ${d.t1}
                </span> / 
                <strong class="clickable-num" onclick="handleIndicatorClick('${d.name}', 'ind1')">${d.r1}</strong>
            </td>
            <td>${d.base1.toFixed(2)}</td>
            <td style="color:${d.bonus1>0?'green':'#ccc'}; font-weight:bold;">${d.bonus1>0?'+':''}${d.bonus1.toFixed(2)}</td>
            <td style="background:#f0f9ff; font-weight:bold;">${d.score1.toFixed(2)}</td>
            
            <!-- 指标二 -->
            <td>
                
                <span class="clickable-num" style="color:#d97706; border-bottom:1px dashed #d97706;" 
                      onclick="analyzeTargetGap('${d.name}', 'ind2', ${line2})" 
                      title="点击分析：哪些学生差一点就达标？补哪科？">
                    ${d.t2}
                </span> / 
                <strong class="clickable-num" onclick="handleIndicatorClick('${d.name}', 'ind2')">${d.r2}</strong>
            </td>
            <td>${d.base2.toFixed(2)}</td>
            <td style="color:${d.bonus2>0?'green':'#ccc'}; font-weight:bold;">${d.bonus2>0?'+':''}${d.bonus2.toFixed(2)}</td>
            <td style="background:#fffaf0; font-weight:bold;">${d.score2.toFixed(2)}</td>
            
            <!-- 总分 -->
            <td class="text-red" style="font-size:1.1em; font-weight:bold;">${d.finalScore.toFixed(2)}</td>
            ${getRankHTML(d.rank)}
        </tr>`; 
    });
    document.querySelector('#tb-indicator tbody').innerHTML = html;
    
    UI.toast("✅ 指标生核算完成 (含附加分)", "success");
}

function analyzeTargetGap(schoolName, type, lineScore) {
    if (!SCHOOLS[schoolName]) return;
    const schoolData = SCHOOLS[schoolName];
    
    // 1. 获取该校的目标人数设定
    // 注意：TARGETS 是全局变量，存储了导入的目标配置
    const targetConfig = TARGETS[schoolName] || { t1: 0, t2: 0 };
    const targetCount = type === 'ind1' ? parseInt(targetConfig.t1) : parseInt(targetConfig.t2);
    
    if (!targetCount) return alert(`未找到 ${schoolName} 的目标设定，请先导入目标人数Excel。`);

    // 2. 将学生分为“已达标”和“未达标”两组
    // 按总分降序排列，保证未达标组的第一个就是离线最近的
    const allStudents = [...schoolData.students].sort((a,b) => b.total - a.total);
    const reached = allStudents.filter(s => s.total >= lineScore);
    const below = allStudents.filter(s => s.total < lineScore);

    // 3. 计算需要抓取的人数 (策略：补齐缺口 + 适当富余以便培优)
    const currentCount = reached.length;
    const gap = targetCount - currentCount; // 缺口人数
    
    // 设置“缓冲量”：比如为了保险起见，多抓取目标数的 10% 或至少 5 人
    const buffer = Math.ceil(targetCount * 0.1) || 5; 
    
    let countToFetch = 0;
    let strategyText = "";

    if (gap > 0) {
        // 情况A: 尚未达标 -> 抓取 (缺口 + 缓冲) 人
        countToFetch = gap + buffer;
        strategyText = `当前差 <strong style="color:red">${gap}</strong> 人达标。已为您筛选最接近目标的 <strong>${countToFetch}</strong> 名潜力生（含 ${buffer} 名保险备份）。`;
    } else {
        // 情况B: 已经达标 -> 依然推荐 (缓冲) 人，用于巩固防守
        countToFetch = buffer;
        strategyText = `当前已达标 (超 ${Math.abs(gap)} 人)。建议继续关注线下前 <strong>${countToFetch}</strong> 名学生，防止上线生波动下滑。`;
    }

    // 4. 截取名单
    let candidates = below.slice(0, countToFetch);

    if (candidates.length === 0) {
        return alert("线下没有更多学生可供挖掘了。");
    }

    // 5. 计算全镇各科均分 (作为诊断弱科的基准)
    const gradeStats = {};
    SUBJECTS.forEach(sub => {
        const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        gradeStats[sub] = allScores.reduce((a,b)=>a+b,0) / (allScores.length||1);
    });

    // 6. 深度分析每一位候选人 (计算差距 + 找弱科)
    candidates = candidates.map(s => {
        // A. 计算差距
        const scoreGap = lineScore - s.total;
        
       // 1. 确定计分科目范围 (避免政治等不计入总分的科目被错误推荐)
        // 逻辑：如果是9年级模式，CONFIG.totalSubs 只有[语,数,英,物,化]
        let validSubjects = SUBJECTS;
        if (CONFIG && Array.isArray(CONFIG.totalSubs)) {
            validSubjects = CONFIG.totalSubs;
        }

        // 2. 辅助函数：获取带老师姓名的学科名 (例如: "物理(张师)")
        const getSubWithTeacher = (sub) => {
            // 键名格式参考 generateTeacherInputs 函数: "班级_学科"
            const teacherKey = `${s.class}_${sub}`;
            let teacher = TEACHER_MAP[teacherKey];
            if (teacher) {
                // 只取姓氏以节省空间，如 "张老师" -> "张"
                const surname = teacher.charAt(0); 
                return `${sub}<small style="color:#666; font-size:0.9em;">(${surname}师)</small>`;
            }
            return sub;
        };

        // 3. 遍历计算所有有效科目的分差
        let allDiffs = [];  // 存储所有科目差值 (用于挖掘潜力)
        let hardWeakness = []; // 存储明显弱项 (低于均分5分)

        validSubjects.forEach(sub => {
            if (s.scores[sub] !== undefined) {
                // 核心算法：学生分数 - 年级均分 (正数=优势，负数=劣势)
                const diff = s.scores[sub] - gradeStats[sub]; 
                const item = { name: sub, diff: diff };
                
                allDiffs.push(item);
                
                // 阈值判定：低于均分 5 分算“硬伤”，需要优先补救
                if (diff < -5) {
                    hardWeakness.push(item);
                }
            }
        });

        // 按差值升序排序 (数值越小/越负，排在越前面，代表越需要补)
        allDiffs.sort((a, b) => a.diff - b.diff);
        hardWeakness.sort((a, b) => a.diff - b.diff);

        let worstSubName = "";
        let worstSubDiff = "";

        // 4. 决策逻辑：是补短板，还是挖潜力？
        if (hardWeakness.length > 0) {
            // 🛑 情况A：有明显弱科 (有科目低于均分5分) -> 显示最差的 2 科
            const targets = hardWeakness.slice(0, 2);
            
            worstSubName = targets.map(t => getSubWithTeacher(t.name)).join("、");
            worstSubDiff = targets.map(t => t.diff.toFixed(1)).join(" / ");
        } else {
            // 💡 情况B：无明显弱科 (各科都还行，但总分未达标) -> 强制挖掘相对最弱的 2 科作为潜力点
            const targets = allDiffs.slice(0, 2);
            
            if (targets.length > 0) {
                // 加个 "潜力:" 前缀提示班主任这是相对弱项，不是绝对差
                worstSubName = "<span style='font-size:10px; color:#666; border:1px solid #ccc; padding:0 2px; border-radius:2px; margin-right:2px;'>潜力</span>" + 
                               targets.map(t => getSubWithTeacher(t.name)).join("、");
                
                // 显示分差 (正数加+号，提示老师其实这科可能已经高于均分了，只是在个人维度里算短板)
                worstSubDiff = targets.map(t => (t.diff > 0 ? '+' : '') + t.diff.toFixed(1)).join(" / ");
            } else {
                worstSubName = "数据不足";
                worstSubDiff = "-";
            }
        }

        return {
            name: s.name,
            class: s.class,
            total: s.total,
            scoreGap: scoreGap, // 距离目标的总分差距
            worstSub: worstSubName, // 建议学科 (已带老师名)
            worstDiff: worstSubDiff // 与年级均分差
        };
    });

    // 7. 构建弹窗内容
    const typeName = type === 'ind1' ? '指标一' : '指标二';
    const title = `${schoolName} - ${typeName} 冲刺名单 (目标:${targetCount}人)`;
    
    let html = `
        <div class="info-bar">
            <div>🎯 <strong>划线分数：${lineScore} 分</strong></div>
            <div style="margin-top:4px;">📊 现状：已达标 ${currentCount} 人 / 目标 ${targetCount} 人。</div>
            <div style="margin-top:4px; color:#0369a1;">💡 策略：${strategyText}</div>
        </div>
        <div class="table-wrap">
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>班级</th>
                        <th>姓名</th>
                        <th>当前总分</th>
                        <th>距划线差</th>
                        <th style="background:#fee2e2; color:#b91c1c;">🆘 建议补救学科</th>
                        <th>与年级均分差</th>
                    </tr>
                </thead>
                <tbody>
    `;

    candidates.forEach(c => {
        // 样式逻辑
        const isBalanced = c.worstSub.includes("潜力"); // 匹配"潜力"关键字
        const subStyle = isBalanced ? "color:#64748b; font-size:12px;" : "color:#b91c1c; font-weight:bold;";
        const diffStyle = isBalanced ? "color:#64748b;" : "color:#b91c1c; font-weight:bold;";
        
        // 🟢 计算进度百分比 (用于画进度条)
        // 比如 目标490，考了485 -> 进度 98.9%
        const percent = Math.min(100, (c.total / lineScore) * 100).toFixed(1);
        
        // 🟢 进度条颜色：越接近目标越红(警示/冲刺)，或者用绿色表示健康度？
        // 这里用黄色到绿色的渐变概念：>98% 用橙色(只差一口气)，<95% 用蓝色
        const barColor = percent >= 98 ? '#f59e0b' : '#3b82f6';

        html += `
            <tr>
                <td style="vertical-align:middle;">${c.class}</td>
                <td style="vertical-align:middle;">
                    <div style="font-weight:bold; font-size:14px;">${c.name}</div>
                </td>
                
                <!-- 🟢 改造：当前总分 + 可视化进度条 -->
                <td style="vertical-align:middle;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-end; font-size:12px; margin-bottom:2px;">
                        <span style="font-weight:800; font-size:15px; color:#333;">${c.total}</span>
                        <span style="color:#94a3b8; transform:scale(0.9);">目标:${lineScore}</span>
                    </div>
                    <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;" title="达成率: ${percent}%">
                        <div style="width:${percent}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                    </div>
                </td>

                <td style="vertical-align:middle;">
                    <span class="badge" style="background:#eff6ff; color:#1d4ed8; border:1px solid #dbeafe; font-size:12px;">
                        -${c.scoreGap.toFixed(1)}
                    </span>
                </td>
                
                <td style="vertical-align:middle; ${subStyle}">
                    ${c.worstSub}
                </td>
                
                <td style="vertical-align:middle; ${diffStyle}">
                    ${c.worstDiff}
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;

    // 8. 调用通用弹窗显示
    document.getElementById('drill-title').innerText = title;
    document.getElementById('drill-back-btn').classList.add('hidden');
    document.getElementById('drill-content').innerHTML = html;
    
    // 底部统计：按班级汇总潜力生人数，方便主任平衡各班指标
    // 简单的 reduce 统计
    const classCount = {};
    candidates.forEach(c => { classCount[c.class] = (classCount[c.class] || 0) + 1; });
    const classSummary = Object.entries(classCount)
        .map(([cls, cnt]) => `${cls}班:${cnt}人`)
        .join('， ');

    document.getElementById('drill-footer').innerText = `各班潜力生分布：${classSummary} (请平衡各班指标压力)`;
    
    // 🟢 关键：将计算好的 candidates 数组传给 DrillSystem，并标记类型为 'gap'
    DrillSystem.exportData = {
        type: 'gap',
        fileName: title, // 使用弹窗标题作为文件名
        data: candidates
    };
    
    // 🟢 确保导出按钮显示
    const exportBtn = document.getElementById('drill-export-btn');
    if(exportBtn) exportBtn.classList.remove('hidden');

    document.getElementById('drill-modal').style.display = 'flex';
}

function calcSummary(isSilent = false) {
    const isGrade9 = CONFIG.name && CONFIG.name.includes('9');
    
    // 1. 汇总各项得分 (Object.values(SCHOOLS) 包含所有学校)
    const list = Object.values(SCHOOLS).map(s => {
        const s1 = s.score2Rate || 0;  // 两率一分
        const s2 = s.scoreBottom || 0; // 后1/3
        const s3 = s.scoreInd || 0;    // 指标生
        
        let s4 = 0; // 高分段赋分
        if (isGrade9 && s.highScoreStats) {
            s4 = s.highScoreStats.score || 0;
        }

        const total = s1 + s2 + s3 + s4;
        return { name: s.name, s1, s2, s3, s4, total };
    });

    // 2. 排序 (按综合总分降序)
    list.sort((a,b) => b.total - a.total).forEach((d,i) => d.rank = i+1);

    // 3. 动态生成表头
    const thead = document.querySelector('#tb-summary thead');
    let theadHtml = `<tr><th>学校名称</th><th>两率一分得分</th><th>后1/3得分</th><th>指标生得分</th>`;
    if (isGrade9) theadHtml += `<th style="color:#b45309; background:#fff7ed;">高分段赋分(70)</th>`;
    theadHtml += `<th>综合总分</th><th>总排名</th></tr>`;
    thead.innerHTML = theadHtml;

    // 4. 生成表格内容 (遍历所有，无截断)
    let html = ''; 
    list.forEach(d => { 
        const isMySchool = d.name === MY_SCHOOL; 
        let highScoreCell = '';
        if (isGrade9) highScoreCell = `<td style="color:#b45309; background:#fff7ed; font-weight:bold;">${d.s4.toFixed(2)}</td>`;

        html += `<tr class="${isMySchool?'bg-highlight':''}">
            <td>${d.name}</td>
            <td>${d.s1.toFixed(2)}</td>
            <td>${d.s2.toFixed(2)}</td>
            <td>${d.s3.toFixed(2)}</td>
            ${highScoreCell}
            <td class="text-red" style="font-size:16px; font-weight:bold;">${d.total.toFixed(2)}</td>
            ${getRankHTML(d.rank)}
        </tr>`;
    });
    document.querySelector('#tb-summary tbody').innerHTML = html;
           
    console.log(`综合排名已生成，共 ${list.length} 所学校`);
}
