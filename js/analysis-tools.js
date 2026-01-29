function updateSegmentSelects() {
    const schSel = document.getElementById('segSchoolSelect'); const subSel = document.getElementById('segSubjectSelect'); const oldSch = schSel.value;
    schSel.innerHTML = '<option value="ALL">全乡镇</option>'; Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`); if(oldSch && (oldSch === 'ALL' || SCHOOLS[oldSch])) schSel.value = oldSch;
    const oldSub = subSel.value; subSel.innerHTML = '<option value="total">总分</option>'; SUBJECTS.forEach(s => subSel.innerHTML += `<option value="${s}">${s}</option>`); if(oldSub) subSel.value = oldSub;
}

function renderSegmentAnalysis() {
    const school = document.getElementById('segSchoolSelect').value; 
    const subject = document.getElementById('segSubjectSelect').value; 
    const step = parseInt(document.getElementById('segStep').value) || 10;
    
    let students = school === 'ALL' ? RAW_DATA : (SCHOOLS[school] ? SCHOOLS[school].students : []);
   const validStudents = students.filter(s => {
        const v = subject === 'total' ? s.total : s.scores[subject];
        return typeof v === 'number';
    }).map(s => ({
        ...s, // 浅拷贝学生信息
        _filterScore: subject === 'total' ? s.total : s.scores[subject] 
    }));

    const scores = validStudents.map(s => s._filterScore); // 兼容旧逻辑的 scores 数组用于计算 max/total
    
    if(!scores.length) { alert('没有找到相关成绩数据'); return; }
    
    const maxScore = Math.ceil(Math.max(...scores)); 
    const topCeil = Math.ceil(maxScore / step) * step;
    
    let html = `<thead><tr><th>分数段</th><th>人数</th><th>累计人数</th><th>比例</th><th>累计比例</th></tr></thead><tbody>`; 
    let cumulative = 0, total = scores.length;
    
    // 🟢 准备图表数据容器
    const rowsData = []; // 临时存储数据以便后续给图表使用

    // 从高到低遍历生成表格
    for(let high = topCeil; high > 0; high -= step) {
        const low = high - step; 
        const isTopBucket = high === topCeil; 
        const bucketList = validStudents.filter(s => {
            const val = s._filterScore;
            return val >= low && (isTopBucket ? val <= high : val < high);
        });
        const count = bucketList.length;
        
        // 优化：去掉两头均为0的空行，但保留中间的0以体现断层
        if(count === 0 && cumulative === 0) continue; 
        
        cumulative += count; 
        
        const label = `${low}-${high}`;
        
        html += `<tr><td>${label} 分</td><td>${count}</td><td>${cumulative}</td><td>${(count/total*100).toFixed(2)}%</td><td>${(cumulative/total*100).toFixed(2)}%</td></tr>`;
        
        // 收集图表数据 (使用 unshift 存入头部，保证图表是从低分到高分排列，符合直方图习惯)
        rowsData.unshift({ 
            label: label, 
            count: count,
            studentList: bucketList // 👈 关键：保存该分数段的学生名单
        });
    }
    
    document.getElementById('tb-segment').innerHTML = html + `</tbody>`;

    // 🟢 绘制图表核心逻辑
    const ctx = document.getElementById('segmentChart');
    if (ctx) {
        // 如果已有图表实例，先销毁，防止重影
        if (segmentChartInstance) segmentChartInstance.destroy();
        
        segmentChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: rowsData.map(d => d.label),
                datasets: [{
                    label: '人数分布',
                    data: rowsData.map(d => d.count),
                    backgroundColor: 'rgba(59, 130, 246, 0.6)', // 蓝色柱体
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.9, // 让柱子宽一点，更有直方图的感觉
                    categoryPercentage: 0.9,
                    order: 2
                }, {
                    // 增加一条平滑曲线 (趋势线)
                    type: 'line',
                    label: '分布趋势',
                    data: rowsData.map(d => d.count),
                    borderColor: '#f59e0b', // 橙色线条
                    borderWidth: 2,
                    tension: 0.4, // 平滑曲线
                    pointRadius: 0,
                    order: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (!elements || elements.length === 0) return;
                    
                    // 获取被点击的数据点索引
                    const index = elements[0].index;
                    const dataItem = rowsData[index];
                    
                    if (dataItem && dataItem.count > 0) {
                        // 调用 DrillSystem (钻取系统) 显示该分数段的学生名单
                        // 标题如：全镇 语文 分数段详情 (110-120)
                        const title = `${school === 'ALL' ? '全镇' : school} ${subject} 分数段详情 (${dataItem.label})`;
                        DrillSystem.open(title, dataItem.studentList);
                    } else {
                        UI.toast('该分数段暂无学生', 'info');
                    }
                },
                onHover: (event, chartElement) => {
                    // 鼠标悬停时变成小手图标，提示可点击
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                },
                plugins: {
                    legend: { display: true },
                    title: { 
                        display: true, 
                        text: `${school === 'ALL' ? '全镇' : school} ${subject} 成绩分布直方图 (💡点击柱子可查看名单)`,
                        font: { size: 16 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        title: { display: true, text: '人数' } 
                    },
                    x: {
                        title: { display: true, text: '分数段 (低 → 高)' }
                    }
                }
            }
        });
    }
}

function exportSegmentExcel() {
    const table = document.getElementById('tb-segment');
    if(!table || !table.rows.length) return alert("请先生成统计表");
    const wb = XLSX.utils.table_to_book(table);
    XLSX.writeFile(wb, "分数段统计.xlsx");
}

function updateClassCompSchoolSelect() {
    const sel = document.getElementById('classCompSchoolSelect'); sel.innerHTML = '<option value="">--请选择学校--</option>'; Object.keys(SCHOOLS).forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
}

function renderClassComparison() {
    const schoolName = document.getElementById('classCompSchoolSelect').value; if(!schoolName || !SCHOOLS[schoolName]) { alert('请选择有效学校'); return; }
    const sch = SCHOOLS[schoolName]; const classes = {}; sch.students.forEach(s => { if(!classes[s.class]) classes[s.class] = []; classes[s.class].push(s); });
    const classList = Object.keys(classes).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
    const classSubjectRanks = {}; // 存储结构: { "701班": { "语文": 1, "数学": 5 } }
    SUBJECTS.forEach(sub => {
        const subStats = classList.map(c => {
            const scores = classes[c].map(s => s.scores[sub]).filter(v => typeof v === 'number');
            const avg = scores.length > 0 ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
            return { name: c, avg };
        });
        subStats.sort((a, b) => b.avg - a.avg);
        subStats.forEach((stat, index) => {
            if(!classSubjectRanks[stat.name]) classSubjectRanks[stat.name] = {};
            classSubjectRanks[stat.name][sub] = index + 1;
        });
    });
    const container = document.getElementById('class-comp-results'); const sideNavClassSubjects = document.getElementById('side-nav-class-subjects'); container.innerHTML = ''; sideNavClassSubjects.innerHTML = ''; 
    let html = '';
    // 1. 准备矩阵数据
    // classSubjectRanks 结构: { "701班": { "语文": 1, "数学": 5 } }
    // classList 是所有班级名的数组
    
    let matrixHtml = `
        <div class="anchor-target" id="anchor-matrix">
            <div class="sub-header" style="background:linear-gradient(to right, #fdf4ff, transparent); border-left-color:#d946ef; color:#86198f;">
                🧩 班级学科均衡性全景矩阵 (数字为校内排名)
            </div>
            <div class="table-wrap">
                <table class="comparison-table" style="text-align:center;">
                    <thead>
                        <tr>
                            <th style="width:80px; background:#faf5ff;">班级</th>
                            <!-- 动态生成学科表头 -->
                            ${SUBJECTS.map(s => `<th>${s}</th>`).join('')}
                            <th style="border-left:2px solid #eee;">综合</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    // 1. 判断当前是否为 9 年级模式
    const isGrade9Mode = CONFIG.name && CONFIG.name.includes('9');

    classList.forEach(cls => {
        const ranks = classSubjectRanks[cls] || {};
        // 计算该班所有学科排名的平均值 (衡量整体实力)
        let rankSum = 0;
        let validCount = 0;
        
        let rowCells = SUBJECTS.map(sub => {
            const r = ranks[sub] || '-';
            if (typeof r === 'number') {
                
                // 🟢 核心修改：如果是 9 年级模式且科目是政治，则不计入综合分
                let shouldCount = true;
                if (isGrade9Mode && (sub === '政治' || sub === '道法' || sub === '道德与法治')) {
                    shouldCount = false; 
                }

                if (shouldCount) {
                    rankSum += r;
                    validCount++;
                }
                
                // 样式逻辑：前3名绿，后3名红 (假设班级数>5)
                let style = "";
                if (classList.length >= 5) {
                    if (r <= 3) style = "color:#16a34a; font-weight:bold; background:#dcfce7;";
                    else if (r > classList.length - 3) style = "color:#dc2626; font-weight:bold; background:#fee2e2;";
                } else {
                    // 班级少时，第1名绿，最后1名红
                    if (r === 1) style = "color:#16a34a; font-weight:bold; background:#dcfce7;";
                    else if (r === classList.length) style = "color:#dc2626; font-weight:bold; background:#fee2e2;";
                }
                return `<td style="${style}">${r}</td>`;
            }
            return `<td style="color:#ccc;">-</td>`;
        }).join('');

        // 计算平均排名 (排除政治后的)
        const avgRank = validCount > 0 ? (rankSum / validCount).toFixed(1) : '-';

        matrixHtml += `
            <tr>
                <td style="font-weight:bold; background:#faf5ff;">${cls}</td>
                ${rowCells}
                <td style="border-left:2px solid #eee; font-weight:bold;">${avgRank}</td>
            </tr>
        `;
    });

    matrixHtml += `</tbody></table></div>
        <div style="font-size:12px; color:#666; margin-top:5px; margin-bottom:20px; padding:5px;">
            💡 <strong>读图指南：</strong> 
            <span style="background:#dcfce7; color:#16a34a; padding:0 4px;">绿色</span> 代表该科进入前3名 (优势)，
            <span style="background:#fee2e2; color:#dc2626; padding:0 4px;">红色</span> 代表该科处于后3名 (短板)。
            横向看班级偏科情况，纵向看学科整体水平。
        </div>
    </div>`;

    // 将矩阵添加到总 HTML 的最前面
    html += matrixHtml;
    const rankIt = (arr, key) => { const sorted = [...arr].sort((a,b) => b[key] - a[key]); arr.forEach(item => item[key+'Rank'] = sorted.indexOf(item) + 1); };
    const allStudents = sch.students;
    const gradeTotalScores = allStudents.map(s => s.total); const gradeTotalLen = gradeTotalScores.length || 1; const gradeTotalAvg = gradeTotalScores.reduce((a,b)=>a+b,0) / gradeTotalLen; const gradeTotalExc = gradeTotalScores.filter(v => v >= (THRESHOLDS.total?.exc||0)).length / gradeTotalLen; const gradeTotalPass = gradeTotalScores.filter(v => v >= (THRESHOLDS.total?.pass||0)).length / gradeTotalLen;
    const anchorTotal = 'anchor-class-total';
    html += `<div id="${anchorTotal}" class="anchor-target"><div class="sub-header">📊 ${CONFIG.label}</div><div class="table-wrap"><table class="comparison-table"><thead><tr><th>班级</th><th>人数</th><th>平均分</th><th>校排</th><th>优秀率</th><th>及格率</th><th style="background:#fff7ed; color:#c2410c; min-width:150px;">🏗️ 木桶效应诊断 (学科均衡性)</th></tr></thead><tbody>`;
    const totalStats = classList.map(c => {
        const scores = classes[c].map(s => s.total); const len = scores.length || 1; const avg = scores.reduce((a,b)=>a+b,0)/len; const exc = scores.filter(v => v >= (THRESHOLDS.total?.exc||0)).length / len; const pass = scores.filter(v => v >= (THRESHOLDS.total?.pass||0)).length / len;
        const avgDiff = gradeTotalAvg ? (avg - gradeTotalAvg)/gradeTotalAvg : 0; const excDiff = gradeTotalExc ? (exc - gradeTotalExc)/gradeTotalExc : 0; const passDiff = gradeTotalPass ? (pass - gradeTotalPass)/gradeTotalPass : 0;
        return { name: c, count: scores.length, avg, exc, pass, avgDiff, excDiff, passDiff };
    });
    rankIt(totalStats, 'avg'); rankIt(totalStats, 'exc'); rankIt(totalStats, 'pass');
    totalStats.forEach(stat => {let diagnosisHtml = '';
        const totalRank = stat.avgRank; // 班级总分排名
        
        SUBJECTS.forEach(sub => {
            const subRank = classSubjectRanks[stat.name][sub];
            // 逻辑：如果单科排名比总排名落后 2 名以上，视为“短板”；领先 2 名以上视为“优势”
            if (subRank >= totalRank + 2) {
                diagnosisHtml += `<span class="plank-badge plank-drag" title="${sub}排名(${subRank})显著低于总分排名(${totalRank})">🔻${sub}</span>`;
            } else if (subRank <= totalRank - 2) {
                diagnosisHtml += `<span class="plank-badge plank-lift" title="${sub}排名(${subRank})显著高于总分排名(${totalRank})">▲${sub}</span>`;
            }
        });
        if(!diagnosisHtml) diagnosisHtml = '<span style="color:#94a3b8; font-size:11px;">各科均衡</span>';html += `<tr>
            <td><strong>${stat.name}</strong></td>
            <td>${stat.count}</td>
            <td>${stat.avg.toFixed(2)}</td>
            <td>${getRankHTML(stat.avgRank)}</td>
            <td>${(stat.exc*100).toFixed(1)}%</td>
            <td>${(stat.pass*100).toFixed(1)}%</td>
            <td style="text-align:left; background:#fffaf5;">${diagnosisHtml}</td>
        </tr>`;  });
    html += `</tbody></table></div></div>`;
    SUBJECTS.forEach(sub => {
        const gradeSubScores = allStudents.map(s => s.scores[sub]).filter(v => typeof v === 'number'); const gradeSubLen = gradeSubScores.length || 1; const gradeSubAvg = gradeSubScores.reduce((a,b)=>a+b,0) / gradeSubLen; const gradeSubExc = gradeSubScores.filter(v => v >= THRESHOLDS[sub].exc).length / gradeSubLen; const gradeSubPass = gradeSubScores.filter(v => v >= THRESHOLDS[sub].pass).length / gradeSubLen;
        const anchorSub = `anchor-class-${sub}`;
        html += `<div id="${anchorSub}" class="anchor-target" style="padding-top:20px;"><div class="sub-header">📘 ${sub}</div><div class="table-wrap"><table class="comparison-table"><thead><tr><th>班级</th><th>人数</th><th>平均分</th><th>与级比</th><th>校排</th><th>优秀率</th><th>与级比</th><th>校排</th><th>及格率</th><th>与级比</th><th>校排</th></tr></thead><tbody>`;
        const subStats = classList.map(c => {
            const scores = classes[c].map(s => s.scores[sub]).filter(v => typeof v === 'number'); const len = scores.length || 1; const avg = len > 0 ? scores.reduce((a,b)=>a+b,0)/len : 0; const exc = len > 0 ? scores.filter(v => v >= THRESHOLDS[sub].exc).length / len : 0; const pass = len > 0 ? scores.filter(v => v >= THRESHOLDS[sub].pass).length / len : 0;
            const avgDiff = (gradeSubAvg && avg) ? (avg - gradeSubAvg)/gradeSubAvg : 0; const excDiff = (gradeSubExc && exc) ? (exc - gradeSubExc)/gradeSubExc : 0; const passDiff = (gradeSubPass && pass) ? (pass - gradeSubPass)/gradeSubPass : 0;
            return { name: c, count: scores.length, avg, exc, pass, avgDiff, excDiff, passDiff };
        });
        rankIt(subStats, 'avg'); rankIt(subStats, 'exc'); rankIt(subStats, 'pass');
        subStats.forEach(stat => { html += `<tr><td>${stat.name}</td><td>${stat.count}</td><td>${stat.avg.toFixed(2)}</td><td class="${stat.avgDiff>=0?'positive-percent':'negative-percent'}">${stat.avgDiff>=0?'+':''}${(stat.avgDiff*100).toFixed(2)}%</td><td>${stat.avgRank}</td><td>${(stat.exc*100).toFixed(2)}%</td><td class="${stat.excDiff>=0?'positive-percent':'negative-percent'}">${stat.excDiff>=0?'+':''}${(stat.excDiff*100).toFixed(2)}%</td><td>${stat.excRank}</td><td>${(stat.pass*100).toFixed(2)}%</td><td class="${stat.passDiff>=0?'positive-percent':'negative-percent'}">${stat.passDiff>=0?'+':''}${(stat.passDiff*100).toFixed(2)}%</td><td>${stat.passRank}</td></tr>`; });
        html += `</tbody></table></div></div>`;
        const navLink = document.createElement('a'); navLink.className = 'side-nav-sub-link'; navLink.innerText = sub; navLink.onclick = () => scrollToSubAnchor(anchorSub, navLink); sideNavClassSubjects.appendChild(navLink);
    });
    container.innerHTML = html;
}

function exportClassComparisonExcel() {
    const schoolName = document.getElementById('classCompSchoolSelect').value;
    if(!schoolName || !SCHOOLS[schoolName]) return alert("请先进行对比分析");
    const sch = SCHOOLS[schoolName];
    const classes = {}; sch.students.forEach(s => { if(!classes[s.class]) classes[s.class] = []; classes[s.class].push(s); });
    const classList = Object.keys(classes).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
    
    const wb = XLSX.utils.book_new();
    const rankIt = (arr, key) => { const sorted = [...arr].sort((a,b) => b[key] - a[key]); arr.forEach(item => item[key+'Rank'] = sorted.indexOf(item) + 1); };

    const allStudents = sch.students;
    const gAvg = allStudents.reduce((a,b)=>a+b.total,0) / allStudents.length;
    const gExc = allStudents.filter(v => v.total >= (THRESHOLDS.total?.exc||0)).length / allStudents.length;
    const gPass = allStudents.filter(v => v.total >= (THRESHOLDS.total?.pass||0)).length / allStudents.length;

    const totalStats = classList.map(c => {
        const scores = classes[c].map(s => s.total); const len = scores.length;
        const avg = scores.reduce((a,b)=>a+b,0)/len; 
        const exc = scores.filter(v => v >= (THRESHOLDS.total?.exc||0)).length / len; 
        const pass = scores.filter(v => v >= (THRESHOLDS.total?.pass||0)).length / len;
        return { name: c, count: len, avg, exc, pass, 
                 avgDiff: gAvg ? (avg-gAvg)/gAvg : 0, 
                 excDiff: gExc ? (exc-gExc)/gExc : 0, 
                 passDiff: gPass ? (pass-gPass)/gPass : 0 };
    });
    rankIt(totalStats, 'avg'); rankIt(totalStats, 'exc'); rankIt(totalStats, 'pass');

    const wsTotalData = [["班级", "人数", "平均分", "与级比", "校排", "优秀率", "与级比", "校排", "及格率", "与级比", "校排"]];
    totalStats.forEach(s => {
        wsData = [s.name, s.count, getExcelNum(s.avg), getExcelPercent(s.avgDiff), s.avgRank, getExcelPercent(s.exc), getExcelPercent(s.excDiff), s.excRank, getExcelPercent(s.pass), getExcelPercent(s.passDiff), s.passRank];
        wsTotalData.push(wsData);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsTotalData), CONFIG.label);

    SUBJECTS.forEach(sub => {
        const gScores = allStudents.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        const subAvg = gScores.length ? gScores.reduce((a,b)=>a+b,0)/gScores.length : 0;
        const subExc = gScores.length ? gScores.filter(v => v >= THRESHOLDS[sub].exc).length / gScores.length : 0;
        const subPass = gScores.length ? gScores.filter(v => v >= THRESHOLDS[sub].pass).length / gScores.length : 0;

        const subStats = classList.map(c => {
            const scores = classes[c].map(s => s.scores[sub]).filter(v => typeof v === 'number');
            const len = scores.length || 1; 
            const avg = scores.length ? scores.reduce((a,b)=>a+b,0)/len : 0;
            const exc = scores.length ? scores.filter(v => v >= THRESHOLDS[sub].exc).length / len : 0;
            const pass = scores.length ? scores.filter(v => v >= THRESHOLDS[sub].pass).length / len : 0;
            return { name: c, count: scores.length, avg, exc, pass,
                     avgDiff: subAvg ? (avg-subAvg)/subAvg : 0,
                     excDiff: subExc ? (exc-subExc)/subExc : 0,
                     passDiff: subPass ? (pass-subPass)/subPass : 0 };
        });
        rankIt(subStats, 'avg'); rankIt(subStats, 'exc'); rankIt(subStats, 'pass');

        const wsSubData = [["班级", "人数", "平均分", "与级比", "校排", "优秀率", "与级比", "校排", "及格率", "与级比", "校排"]];
        subStats.forEach(s => {
            wsData = [s.name, s.count, getExcelNum(s.avg), getExcelPercent(s.avgDiff), s.avgRank, getExcelPercent(s.exc), getExcelPercent(s.excDiff), s.excRank, getExcelPercent(s.pass), getExcelPercent(s.passDiff), s.passRank];
            wsSubData.push(wsData);
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsSubData), sub);
    });
    XLSX.writeFile(wb, "班级横向对比分析.xlsx");
}

// 1. 初始化下拉框
function updateSubjectBalanceSelects() {
    const schSel = document.getElementById('sbSchoolSelect');
    const clsSel = document.getElementById('sbClassSelect');
    
    schSel.innerHTML = '<option value="">--请选择学校--</option>';
    Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`);
    
    // 联动更新班级
    schSel.onchange = () => {
        clsSel.innerHTML = '<option value="">全部</option>';
        if(schSel.value && SCHOOLS[schSel.value]) {
            const classes = [...new Set(SCHOOLS[schSel.value].students.map(s => s.class))].sort();
            classes.forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`);
        }
    };
}

let SB_CACHE_DATA = []; // 缓存用于导出

// 2. 渲染主表格
function SB_renderTable() {
    const sch = document.getElementById('sbSchoolSelect').value;
    const cls = document.getElementById('sbClassSelect').value;
    const sortType = document.getElementById('sbSortBy').value;

    if(!sch) return alert("请先选择学校");

    // A. 筛选学生
    let students = SCHOOLS[sch].students;
    if(cls && cls !== '全部') students = students.filter(s => s.class === cls);

    // B. 计算全镇各科均分 (作为基准线)
    const gradeStats = SB_getGradeStats();

    // C. 处理每个学生的数据
    const renderList = students.map(s => {
        const items = [];
        let maxDiff = -999;
        let minDiff = 999;

        SUBJECTS.forEach(sub => {
            if(s.scores[sub] === undefined) return;
            const diff = s.scores[sub] - gradeStats[sub]; // 差值
            items.push({ sub, score: s.scores[sub], diff });
            
            if(diff > maxDiff) maxDiff = diff;
            if(diff < minDiff) minDiff = diff;
        });

        // 按差值排序：优势在前，劣势在后
        items.sort((a,b) => b.diff - a.diff);

        // 计算偏科指数 (极差)
        const balanceScore = maxDiff - minDiff;

        return {
            name: s.name,
            class: s.class,
            total: s.total,
            rank: safeGet(s, 'ranks.total.township', '-'),
            items,
            balanceScore
        };
    });

    // D. 排序
    if(sortType === 'total') {
        renderList.sort((a,b) => b.total - a.total);
    } else {
        renderList.sort((a,b) => b.balanceScore - a.balanceScore); // 越不均衡排越前
    }
    
    SB_CACHE_DATA = renderList; // 存入缓存

    // E. 生成 HTML
    const tbody = document.querySelector('#sb-table tbody');
    let html = '';

    renderList.forEach(row => {
        // 构建可视化条
        // 我们只展示最强的2科和最弱的2科，避免太长，或者展示全部但缩小
        // 为了“一看就懂”，我们展示全部，但用 Flex 布局一行显示
        
        let barsHtml = `<div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">`;
        
        row.items.forEach(item => {
            const isStrong = item.diff >= 0;
            const color = isStrong ? '#16a34a' : '#dc2626';
            const bg = isStrong ? '#dcfce7' : '#fee2e2';
            const icon = isStrong ? '📈' : '📉';
            
            // 仅当差值绝对值大于 5 分时才显著展示，否则作为“平”
            const absDiff = Math.abs(item.diff);
            const barWidth = Math.min(absDiff * 2, 50); // 限制最大宽度
            
            // 小孩易读的胶囊样式
            barsHtml += `
                <div style="display:flex; flex-direction:column; align-items:center; width:50px;">
                    <div style="font-size:10px; font-weight:bold; color:#333;">${item.sub}</div>
                    <div style="display:flex; align-items:flex-end; height:40px; justify-content:center; width:100%;">
                        <div style="
                            width: 12px; 
                            height: ${Math.max(barWidth, 2)}px; 
                            background-color: ${color}; 
                            border-radius: 2px;
                            opacity: ${absDiff < 2 ? 0.3 : 1};
                        " title="分数: ${item.score} (比平均${item.diff>0?'+':''}${item.diff.toFixed(1)})"></div>
                    </div>
                    <div style="font-size:10px; color:${color}; font-weight:bold;">
                        ${item.diff > 0 ? '+' : ''}${item.diff.toFixed(0)}
                    </div>
                </div>
            `;
        });
        barsHtml += `</div>`;

        // 生成简评
        const strongSub = row.items[0];
        const weakSub = row.items[row.items.length - 1];
        let comment = "";
        if (row.balanceScore < 15) comment = `<span class="badge" style="background:#3b82f6">⚖️ 非常均衡</span>`;
        else {
            comment = `<div style="font-size:12px; line-height:1.4;">
                <div>👍 强: <strong>${strongSub.sub}</strong> (+${strongSub.diff.toFixed(0)})</div>
                <div style="color:#dc2626;">🆘 弱: <strong>${weakSub.sub}</strong> (${weakSub.diff.toFixed(0)})</div>
            </div>`;
        }

        html += `
            <tr>
                <td>
                    <div style="font-weight:bold;">${row.name}</div>
                    <div style="font-size:10px; color:#999;">${row.class}</div>
                </td>
                <td style="font-weight:bold; font-size:14px;">${row.total}</td>
                <td>${row.rank}</td>
                <td style="padding:10px 5px;">${barsHtml}</td>
                <td>${comment}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if(renderList.length === 0) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">无数据</td></tr>';
}

function SB_getGradeStats() {
    const gradeStats = {};
    SUBJECTS.forEach(sub => {
        const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        const avg = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : 0;
        gradeStats[sub] = avg;
    });
    return gradeStats;
}

function SB_runCluster() {
    const sch = document.getElementById('sbSchoolSelect').value;
    const cls = document.getElementById('sbClassSelect').value;
    if (!sch) return alert("请先选择学校");

    let students = SCHOOLS[sch].students;
    if (cls && cls !== '全部') students = students.filter(s => s.class === cls);
    if (!students.length) return alert("无可用学生数据");

    const gradeStats = SB_getGradeStats();
    const humanities = ['语文','英语','政治','历史','地理'];
    const sciences = ['数学','物理','化学','生物','科学'];

    const vectors = [];
    const meta = [];

    students.forEach(s => {
        const diffs = [];
        SUBJECTS.forEach(sub => {
            const v = s.scores[sub];
            if (typeof v === 'number') diffs.push({ sub, diff: v - (gradeStats[sub] || 0) });
        });
        if (diffs.length === 0) return;

        const hList = diffs.filter(d => humanities.includes(d.sub));
        const sList = diffs.filter(d => sciences.includes(d.sub));
        const hAvg = hList.length ? hList.reduce((a,b)=>a+b.diff,0)/hList.length : 0;
        const sAvg = sList.length ? sList.reduce((a,b)=>a+b.diff,0)/sList.length : 0;
        const maxAbs = Math.max(...diffs.map(d => Math.abs(d.diff)));
        const balance = Math.max(...diffs.map(d => d.diff)) - Math.min(...diffs.map(d => d.diff));

        vectors.push([hAvg, sAvg, maxAbs, balance]);
        meta.push({ name: s.name, class: s.class, hAvg, sAvg, maxAbs, balance });
    });

    const { labels, centroids } = kmeans(vectors, 4, 12);
    const clusterMap = {};
    labels.forEach((c, i) => {
        if (!clusterMap[c]) clusterMap[c] = [];
        clusterMap[c].push(meta[i]);
    });

    // 给每个簇命名
    const clusterLabels = {};
    centroids.forEach((centroid, idx) => {
        const [hAvg, sAvg, maxAbs, balance] = centroid;
        let tag = '全科均衡型';
        if (balance < 8 && Math.abs(hAvg - sAvg) < 6) tag = '全科均衡型';
        else if (hAvg - sAvg > 6) tag = '文强理弱型';
        else if (sAvg - hAvg > 6) tag = '理强文弱型';
        else if (maxAbs > 12 || balance > 18) tag = '单科突围型';
        clusterLabels[idx] = tag;
    });

    SB_renderClusterResults(clusterMap, clusterLabels);
}

function SB_renderClusterResults(clusterMap, clusterLabels) {
    const container = document.getElementById('sb-cluster-results');
    if (!container) return;

    const strategy = {
        '全科均衡型': '策略：保持节奏，适度强化拔高题；每周1次综合训练，避免短板出现。',
        '文强理弱型': '策略：补数学/物理基础概念与题型套路，每天固定15-20分钟理科训练。',
        '理强文弱型': '策略：语文/英语以“阅读+词汇+写作”三板斧推进，重点提升语感与表达。',
        '单科突围型': '策略：保优势学科的同时补齐最弱科，制定“主攻+补弱”双轨计划。'
    };

    let html = '';
    Object.keys(clusterMap).forEach(k => {
        const label = clusterLabels[k] || '未命名';
        const list = clusterMap[k] || [];
        html += `<div style="margin-bottom:12px; padding:10px; border:1px dashed #fed7aa; border-radius:8px; background:#fff;">
            <div style="font-weight:bold; color:#9a3412;">${label}（${list.length}人）</div>
            <div style="margin:6px 0; color:#7c2d12;">${strategy[label] || ''}</div>
            <div style="font-size:11px; color:#64748b;">示例名单：${list.slice(0, 8).map(s => `${s.name}(${s.class})`).join('、')}${list.length>8?' …':''}</div>
        </div>`;
    });
    container.innerHTML = html || '暂无聚类结果';
}

// 简单 K-Means 实现
function kmeans(data, k = 4, maxIter = 10) {
    if (!data.length) return { labels: [], centroids: [] };
    const dim = data[0].length;
    const centroids = [];
    const used = new Set();
    while (centroids.length < k && used.size < data.length) {
        const idx = Math.floor(Math.random() * data.length);
        if (!used.has(idx)) { used.add(idx); centroids.push([...data[idx]]); }
    }
    const labels = new Array(data.length).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
        // assignment
        for (let i = 0; i < data.length; i++) {
            let best = 0, bestDist = Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const dist = euclid(data[i], centroids[c]);
                if (dist < bestDist) { bestDist = dist; best = c; }
            }
            labels[i] = best;
        }
        // update
        const sums = Array.from({ length: centroids.length }, () => new Array(dim).fill(0));
        const counts = new Array(centroids.length).fill(0);
        for (let i = 0; i < data.length; i++) {
            const c = labels[i];
            counts[c]++;
            for (let d = 0; d < dim; d++) sums[c][d] += data[i][d];
        }
        for (let c = 0; c < centroids.length; c++) {
            if (counts[c] === 0) continue;
            for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c];
        }
    }
    return { labels, centroids };
}

function euclid(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.pow(a[i] - b[i], 2);
    return Math.sqrt(s);
}

// 3. 导出 Excel
function SB_exportExcel() {
    if(!SB_CACHE_DATA.length) return alert("请先生成分析数据");
    
    const wb = XLSX.utils.book_new();
    const headers = ["班级", "姓名", "总分", "全镇排名", "最强学科", "最强分差", "最弱学科", "最弱分差"];
    
    // 动态添加所有学科列
    SUBJECTS.forEach(s => headers.push(`${s}分差`));
    
    const data = [headers];
    
    SB_CACHE_DATA.forEach(r => {
        const strong = r.items[0];
        const weak = r.items[r.items.length-1];
        
        const row = [
            r.class, r.name, r.total, r.rank,
            strong.sub, `+${strong.diff.toFixed(1)}`,
            weak.sub, weak.diff.toFixed(1)
        ];
        
        // 填充各科分差
        SUBJECTS.forEach(s => {
            const item = r.items.find(i => i.sub === s);
            row.push(item ? item.diff.toFixed(1) : '-');
        });
        
        data.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "学生优劣势分析");
    XLSX.writeFile(wb, `优劣势学科分析_${document.getElementById('sbSchoolSelect').value}.xlsx`);
}

function updatePotentialSchoolSelect() {
    const sel = document.getElementById('potSchoolSelect'); 
    const old = sel.value; 
    
    sel.innerHTML = '<option value="ALL">全乡镇</option>'; 
    
    // 修复：确保 value 属性被引号包裹，防止学校名中有空格导致截断
    Object.keys(SCHOOLS).forEach(s => {
        sel.innerHTML += `<option value="${s}">${s}</option>`;
    });
    
    // 恢复之前的选择
    if(old && (old==='ALL' || SCHOOLS[old])) sel.value = old;
}

function renderPotentialAnalysis() {
    if(!RAW_DATA.length) return alert('请先上传数据');
    const scope = document.getElementById('potSchoolSelect').value; 
    const topRatio = parseFloat(document.getElementById('potTopSelect').value); 
    
    let candidates = []; 
    let scopeStudents = (scope === 'ALL') ? RAW_DATA : (SCHOOLS[scope]?.students || []);
    
    // 1. 筛选总分优生
    const totalCount = RAW_DATA.length;
    const topRankThreshold = Math.floor(totalCount * topRatio);
    
    // 2. 遍历优生，计算偏科指数
    scopeStudents.forEach(stu => {
        const tRank = safeGet(stu, 'ranks.total.township', 99999); 
        if (tRank === '-' || tRank > topRankThreshold) return;

        // 获取该生的总分 T值 (如果没有计算过，用排名百分比估算)
        // 之前的 processData 已经计算了 stu.totalTScore 和 stu.tScores
        
        // 如果只有排名数据，回退到 Rank Gap 模式
        // 如果有 T 分数据，使用 T 分差 (更科学)
        const useAdvancedMetrics = (stu.tScores && stu.totalTScore);
        
        SUBJECTS.forEach(sub => {
            const subRank = safeGet(stu, `ranks.${sub}.township`, 0);
            if (!subRank) return;

            let isPotential = false;
            let gapVal = 0;
            let gapLabel = '';

            if (useAdvancedMetrics) {
                // 业务逻辑深化：使用 T 分差
                // 假设各科 T 分均值为 50。如果某科 T 分 < 40 (低于均值1个标准差)，且总 T 分较高
                // 或者：该科 T 分 比 自身平均 T 分 低 10 分以上
                const subT = stu.tScores[sub];
                // 估算学生自身的平均水平 (总T分 / 科目数)
                const validSubCount = Object.values(stu.tScores).filter(v=>v>0).length || 1;
                const selfAvgT = stu.totalTScore / validSubCount; 
                
                // 判定：该科比自己平均水平低 8 分以上，且该科绝对值 < 45 (稍微偏弱)
                if ((selfAvgT - subT) > 8) {
                    isPotential = true;
                    gapVal = (selfAvgT - subT).toFixed(1);
                    gapLabel = `T分偏离 -${gapVal}`;
                }
            } else {
                // 回退逻辑：排名落差法
                // 如果单科排名比总排名 落后 30% 的总人数
                const gap = subRank - tRank;
                if (gap > (totalCount * 0.3)) {
                    isPotential = true;
                    gapVal = gap;
                    gapLabel = `名次落差 ${gap}`;
                }
            }

            if (isPotential) {
                candidates.push({ 
                    school: stu.school, class: stu.class, name: stu.name, 
                    totalScore: stu.total, totalRank: tRank, 
                    subject: sub, subScore: stu.scores[sub], subRank: subRank, 
                    gap: gapLabel, // 显示文本
                    sortVal: parseFloat(gapVal) // 用于排序
                }); 
            }
        });
    });

    // 按偏科严重程度排序
    candidates.sort((a,b) => b.sortVal - a.sortVal); 
    POTENTIAL_STUDENTS_CACHE = candidates;

    let html = `<div class="info-bar">
        <strong>💡 分析模型升级：</strong> 
        系统已自动启用 <b>${candidates.length > 0 && candidates[0].gap.includes('T分') ? 'Z-Score标准分偏离模型' : '名次落差模型'}</b>。
        <br>筛选范围：总分前 ${(topRatio*100).toFixed(0)}% 的学生中，单科显著“拖后腿”的潜力股。
    </div>
    <div class="table-wrap"><table><thead><tr><th>学校</th><th>班级</th><th>姓名</th><th>总分排名</th><th>跛脚学科</th><th>学科分数</th><th>学科排名</th><th>偏科指数</th></tr></thead><tbody>`;
    
    if(candidates.length === 0) {
        html += `<tr><td colspan="8" style="padding:30px; text-align:center;">🎉 恭喜！在前 ${(topRatio*100)}% 学生中未发现严重偏科现象。</td></tr>`; 
    } else {
        candidates.forEach(c => {
            html += `<tr>
                <td>${c.school}</td>
                <td>${c.class}</td>
                <td><strong>${c.name}</strong></td>
                <td class="text-green">${c.totalRank}</td>
                <td style="color:var(--primary); font-weight:bold;">${c.subject}</td>
                <td>${formatVal(c.subScore)}</td>
                <td class="text-red">${c.subRank}</td>
                <td style="color:red; font-weight:bold;">📉 ${c.gap}</td>
            </tr>`;
        });
    }
    document.getElementById('potential-results').innerHTML = html + `</tbody></table></div>`;
}

function exportPotentialAnalysis() {
    if(!POTENTIAL_STUDENTS_CACHE.length) { alert('请先生成数据或结果为空'); return; }
    const wb = XLSX.utils.book_new(); const data = [['学校', '班级', '姓名', '总分', '总分全镇排名', '跛脚学科', '学科分数', '学科全镇排名', '名次落差']];
    POTENTIAL_STUDENTS_CACHE.forEach(c => data.push([c.school, c.class, c.name, c.totalScore, c.totalRank, c.subject, c.subScore, c.subRank, c.gap]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "偏科生名单"); XLSX.writeFile(wb, "偏科潜力生挖掘名单.xlsx");
}

function updateDiagnosisSelects() {
    const schSel = document.getElementById('diagSchoolSelect');
    const subSel = document.getElementById('diagSubjectSelect');
    const oldSch = schSel.value;
    schSel.innerHTML = '<option value="">--请选择学校--</option>';
    Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`);
    if(oldSch && SCHOOLS[oldSch]) schSel.value = oldSch;

    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        const school = user.school || MY_SCHOOL || '';
        if (school) {
            schSel.value = school;
            schSel.disabled = true;
        }
    }

    const oldSub = subSel.value;
    subSel.innerHTML = '<option value="total">总分</option>';
    if (role === 'teacher') {
        const scope = getTeacherScopeForUser(user);
        const subjects = SUBJECTS.filter(s => scope.subjects.has(normalizeSubject(s)));
        subjects.forEach(s => subSel.innerHTML += `<option value="${s}">${s}</option>`);
    } else {
        SUBJECTS.forEach(s => subSel.innerHTML += `<option value="${s}">${s}</option>`);
    }
    if(oldSub) subSel.value = oldSub;
}

function renderClassDiagnosis() {
    const schoolName = document.getElementById('diagSchoolSelect').value; const subject = document.getElementById('diagSubjectSelect').value; const step = parseInt(document.getElementById('diagStep').value) || 10;
    if(!schoolName || !SCHOOLS[schoolName]) return uiAlert('请选择学校', 'warning');
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    const scope = (role === 'teacher') ? getTeacherScopeForUser(user) : null;
    const sch = SCHOOLS[schoolName];
    const classData = {};
    sch.students.forEach(s => {
        if (role === 'class_teacher' && user?.class && s.class !== user.class) return;
        if (role === 'teacher' && scope && scope.classes.size > 0 && !scope.classes.has(s.class)) return;
        if(!classData[s.class]) classData[s.class] = [];
        const val = (subject === 'total') ? s.total : s.scores[subject];
        if(typeof val === 'number') classData[s.class].push(val);
    });
    const classes = Object.keys(classData).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    let maxScoreAll = 0;
    const stats = classes.map(cls => {
        const scores = classData[cls]; const count = scores.length; const avg = count ? scores.reduce((a,b)=>a+b,0)/count : 0; const variance = count > 1 ? scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / count : 0; if(count) maxScoreAll = Math.max(maxScoreAll, ...scores);
        return { cls, count, avg, sd: Math.sqrt(variance), scores };
    });
    const allScores = stats.flatMap(s => s.scores); const gradeAvg = allScores.length ? allScores.reduce((a,b)=>a+b,0)/allScores.length : 0; const gradeVariance = allScores.length ? allScores.reduce((sum, score) => sum + Math.pow(score - gradeAvg, 2), 0) / allScores.length : 0; const gradeSD = Math.sqrt(gradeVariance);
    const maxBinCount = Math.max(...stats.map(s => { const bins = {}; s.scores.forEach(v => { const bin = Math.floor(v/step); bins[bin] = (bins[bin]||0)+1; }); return Math.max(...Object.values(bins)) || 1; }));
    let html = `<div class="info-bar" style="margin-bottom:10px;"><span style="font-weight:bold;">参考基准：</span> 全校平均分 ${gradeAvg.toFixed(1)}，全校标准差 (SD) <span style="font-weight:bold;">${gradeSD.toFixed(2)}</span></div><div class="table-wrap" id="diagnosisTable"><table><thead><tr><th>班级</th><th>人数</th><th>平均分</th><th>标准差(SD)</th><th>诊断结论</th><th>成绩分布 (区间: ${step}分)</th></tr></thead><tbody>`;
    stats.forEach(st => {
        let diagHtml = ''; const ratio = gradeSD ? st.sd / gradeSD : 1; if (ratio > 1.1) diagHtml = `<span class="diagnosis-tag diagnosis-bad">两极分化 (需抓两头)</span>`; else if (ratio < 0.9) diagHtml = `<span class="diagnosis-tag diagnosis-flat">高度集中 (需整体拔高)</span>`; else diagHtml = `<span class="diagnosis-tag diagnosis-good">分布正常</span>`;
        const minVal = st.scores.length ? Math.min(...st.scores) : 0; const maxVal = st.scores.length ? Math.max(...st.scores) : 0; const minBin = Math.floor(minVal/step); const maxBin = Math.floor(maxVal/step); const bins = new Array(maxBin - minBin + 1).fill(0);
        st.scores.forEach(v => { const b = Math.floor(v/step) - minBin; if(b>=0 && b<bins.length) bins[b]++; });
        let barsHtml = `<div class="dist-bar-container">`; bins.forEach(count => { const h = Math.max((count / maxBinCount) * 100, 5); barsHtml += `<div class="dist-bar" style="height:${h}%;" title="人数: ${count}" data-count="${count}"></div>`; }); barsHtml += `</div><div style="font-size:10px; color:#999; text-align:center;">${minBin*step} - ${(maxBin+1)*step}分</div>`;
        html += `<tr><td>${st.cls}</td><td>${st.count}</td><td>${st.avg.toFixed(2)}</td><td style="font-family:monospace;font-weight:bold;">${st.sd.toFixed(2)}</td><td>${diagHtml}</td><td style="min-width:150px;">${barsHtml}</td></tr>`;
    });
    document.getElementById('diagnosis-results').innerHTML = html + `</tbody></table></div>`;
}

function exportDiagnosisExcel() {
    const table = document.querySelector('#diagnosisTable table'); if(!table) return alert("请先生成诊断表");
    const wb = XLSX.utils.book_new(); const wsData = [["班级", "人数", "平均分", "标准差(SD)", "诊断结论"]];
    const rows = table.querySelectorAll('tbody tr'); rows.forEach(r => { const cols = r.querySelectorAll('td'); wsData.push([cols[0].innerText, parseInt(cols[1].innerText), parseFloat(cols[3].innerText), cols[4].innerText]); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), "班情诊断"); XLSX.writeFile(wb, "班情诊断分析.xlsx");
}

function exportCorrelationExcel() {
    const matrixTable = document.getElementById('corrMatrixTable'); const liftDragTable = document.getElementById('liftDragTable');
    if(!matrixTable || matrixTable.rows.length === 0) return alert("请先生成分析结果");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(matrixTable), "相关性矩阵"); XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(liftDragTable), "提分与拖分分析"); XLSX.writeFile(wb, "学科关联深度分析.xlsx");
}

function exportExcel(type) {
    if (!RAW_DATA.length) { alert('请先上传数据'); return; }
    
    // 1. 导出后1/3 (逻辑不变)
    if (type === 'bottom3') {
        const table = document.getElementById('tb-bottom3'); 
        const wb = XLSX.utils.book_new(); 
        const ws = XLSX.utils.table_to_sheet(table);
        XLSX.utils.book_append_sheet(wb, ws, "核算结果"); 
        XLSX.writeFile(wb, '后1_3核算结果.xlsx');
        return;
    }

    // 2. 导出指标生 (逻辑更新：从界面表格获取太麻烦，直接重算一遍或者从DOM解析)
    // 为了准确性，我们这里解析刚才生成的表格 DOM，这样所见即所得
    if (type === 'indicator') {
        const table = document.getElementById('tb-indicator');
        if(table.rows.length < 3) return alert("请先点击【开始计算】");

        const wb = XLSX.utils.book_new();
        
        // 自定义表头数据，因为DOM表头是双层的，直接转换可能格式不好看
        const wsData = [];
        //这一行是合并后的逻辑表头
        wsData.push(["学校", 
                     "指标一目标", "指标一达标", "指标一基础分", "指标一附加分", "指标一小计",
                     "指标二目标", "指标二达标", "指标二基础分", "指标二附加分", "指标二小计",
                     "指标总分", "排名"]);

        // 遍历 tbody 获取数据
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            // 解析 "目标/达标" 这种格式
            const parseTargetReach = (str) => {
                const parts = str.split('/');
                return { t: parts[0].trim(), r: parts[1].trim() };
            };

            const ind1 = parseTargetReach(tds[1].innerText);
            const ind2 = parseTargetReach(tds[5].innerText);

            wsData.push([
                tds[0].innerText, // 学校
                ind1.t, ind1.r, tds[2].innerText, tds[3].innerText, tds[4].innerText, // 指标一
                ind2.t, ind2.r, tds[6].innerText, tds[7].innerText, tds[8].innerText, // 指标二
                tds[9].innerText, // 总分
                tds[10].innerText // 排名
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "指标生核算详细");
        XLSX.writeFile(wb, '指标生核算结果(含附加分).xlsx');
    }
}
