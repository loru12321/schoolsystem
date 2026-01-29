// 校内绩效公平考核模块 (SSE)

// 1. 初始化下拉框 (切换Tab时调用)
function updateSSESchoolSelect() {
    const sel = document.getElementById('sse_school_select');
    if(!sel) return;
    const old = sel.value;
    sel.innerHTML = '<option value="">-- 请选择考核学校 --</option>';
    Object.keys(SCHOOLS).forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
    if(old && SCHOOLS[old]) sel.value = old;
}

// Hook: 劫持 switchTab 函数，在切换到该页面时自动刷新下拉框
const originalSwitchTabSSE = switchTab;
switchTab = function(id) {
    originalSwitchTabSSE(id);
    if(id === 'single-school-eval') {
        updateSSESchoolSelect();
    }
};

// 辅助：动态更新表头显示权重
function SSE_updateHeaderLabels(wExc, wPass, wAvg, wProg) {
    const thead = document.querySelector('#sse_table thead');
    if(!thead) return;
    const ths = thead.querySelectorAll('th');
    // 对应列索引：5=优秀, 6=及格, 7=均分, 8=增值
    if(ths[5]) ths[5].innerHTML = `优秀率(25%)<br><small style="color:#999">权重${wExc}</small>`;
    if(ths[6]) ths[6].innerHTML = `及格率(80%)<br><small style="color:#999">权重${wPass}</small>`;
    if(ths[7]) ths[7].innerHTML = `均分对比<br><small style="color:#999">权重${wAvg}</small>`;
    
    // 动态显示/隐藏“生源增值”列
    if(ths[8]) {
        if(wProg === 0) {
            ths[8].style.display = 'none'; 
        } else {
            ths[8].style.display = 'table-cell';
            ths[8].innerHTML = `生源增值<br><small style="color:#999">权重${wProg}</small>`;
        }
    }
}

// 2. 核心计算逻辑
let SSE_CACHE = []; // 缓存计算结果供导出

function SSE_calculate() {
    const schName = document.getElementById('sse_school_select').value;
    if(!schName) return alert("请先选择要考核的学校");
    
    const schoolData = SCHOOLS[schName];
    if(!schoolData.metrics || !schoolData.metrics.total) return alert("该学校数据不完整");

    // 🔥 1. 获取用户开关状态 (决定是否启用单次模式)
    const useProgress = document.getElementById('sse_check_prog').checked;
    const useExc = document.getElementById('sse_check_exc').checked;
    const usePass = document.getElementById('sse_check_pass').checked;
    const useAvg = document.getElementById('sse_check_avg').checked;

    // 🔥 2. 动态分配权重
    // 默认模型：优秀35 + 及格35 + 均分20 + 增值10 = 100
    let wExc = 35, wPass = 35, wAvg = 20, wProg = 10;

    // 如果用户【取消勾选】生源增值（单次模式）：
    // 将增值的 10 分权重转移给“均分”
    if (!useProgress) {
        wProg = 0;
        wAvg = 30; // 20 + 10
    }
    
    // 极端情况处理：如果有其他项也被关闭，则归零
    if (!useExc) wExc = 0;
    if (!usePass) wPass = 0;
    if (!useAvg) wAvg = 0;

    // 更新表头文字
    SSE_updateHeaderLabels(wExc, wPass, wAvg, wProg);

    // 3. 准备数据 (仅在勾选了增值时才请求历史数据)
    if (useProgress) {
        if (PREV_DATA.length > 0 && (!PROGRESS_CACHE || PROGRESS_CACHE.length === 0)) {
            performSilentMatching();
        }
        if (PROGRESS_CACHE.length === 0) {
            // 仅做轻提示，不阻断计算
            UI.toast("⚠️ 未检测到历史数据，增值项将记为0分。如只需本次成绩，请取消勾选“生源增值”。", "warning");
        }
    }
    
    // 4. 分班并区分【在籍】与【实考】
    const classes = {};
    let totalEnrollment = 0; // 全校在籍总数 (用于算平均班额)
    
    schoolData.students.forEach(s => {
        if(!classes[s.class]) classes[s.class] = { name: s.class, allStudents: [], validStudents: [] };
        
        // A. 只要Excel里有这一行，就算【在籍】(用于算辛苦分)
        classes[s.class].allStudents.push(s);
        
        // B. 只有真的有分数，才算【实考】(用于算平均分/优秀率)
        if(s.hasValidScore || s.total > 0) {
            classes[s.class].validStudents.push(s);
        }
    });

    const classNames = Object.keys(classes);
    classNames.forEach(c => {
        totalEnrollment += classes[c].allStudents.length;
    });

    // 计算年级平均班额 (含缺考)
    const avgClassSize = totalEnrollment / classNames.length;
    
    // 计算年级基准线 (用实考分数的分布算，避免0分拉低优秀线)
    const allValidScores = [];
    classNames.forEach(c => classes[c].validStudents.forEach(s => allValidScores.push(s.total)));
    allValidScores.sort((a,b) => b-a);
    
    const excLine = allValidScores[Math.floor(allValidScores.length * 0.25)] || 0;
    const passLine = allValidScores[Math.floor(allValidScores.length * 0.80)] || 0; 
    const gradeAvgScore = allValidScores.reduce((a,b)=>a+b,0) / (allValidScores.length || 1);

    // 5. 计算各项指标
    let metrics = [];
    
    Object.values(classes).forEach(cls => {
        const enrollment = cls.allStudents.length; // 在籍
        const n = cls.validStudents.length;        // 实考
        
        const realN = n > 0 ? n : 1; 
        const scores = cls.validStudents.map(s => s.total);
        
        // 教学指标 (基于实考)
        const avg = scores.reduce((a,b)=>a+b,0) / realN;
        const excRate = scores.filter(v => v >= excLine).length / realN;
        const passRate = scores.filter(v => v >= passLine).length / realN;

        // 大班补偿 (双向浮动：多退少补)
        const sizeDiff = enrollment - avgClassSize;
        const sizeBonus = sizeDiff * 0.1; 

        // 生源增值 (仅在开启时计算)
        let avgProgress = 0;
        let matchedCount = 0;
        if (useProgress) {
            let progressSum = 0;
            cls.validStudents.forEach(stu => {
                const rec = PROGRESS_CACHE.find(p => p.name === stu.name && p.class === stu.class);
                if(rec) { progressSum += rec.change; matchedCount++; }
            });
            avgProgress = matchedCount > 0 ? (progressSum / matchedCount) : 0;
        }

        metrics.push({
            className: cls.name,
            count: n,          // 实考
            enrollment: enrollment, // 在籍
            avg: avg,
            excRate: excRate,
            passRate: passRate,
            avgProgress: avgProgress,
            sizeBonus: sizeBonus,
            matchedCount: matchedCount
        });
    });

    // 6. 归一化赋分
    const maxExcRate = Math.max(...metrics.map(m => m.excRate)) || 1;
    const maxPassRate = Math.max(...metrics.map(m => m.passRate)) || 1;
    
    // 增值分归一化范围
    let minProg = 0, progRange = 1;
    if (useProgress) {
        const progressVals = metrics.map(m => m.avgProgress);
        const maxProg = Math.max(...progressVals);
        minProg = Math.min(...progressVals);
        progRange = maxProg - minProg;
    }

    metrics.forEach(m => {
        // 使用动态权重计算
        m.scoreExc = (m.excRate / maxExcRate) * wExc;
        m.scorePass = (m.passRate / maxPassRate) * wPass;
        m.scoreAvg = (m.avg / gradeAvgScore) * wAvg;
        
        m.scoreProg = 0;
        if (useProgress) {
            if (progRange === 0) m.scoreProg = wProg;
            else m.scoreProg = ((m.avgProgress - minProg) / progRange) * wProg;
        }
        
        // 最终汇总
        m.finalScore = m.scoreExc + m.scorePass + m.scoreAvg + m.scoreProg + m.sizeBonus;
    });

    // 7. 渲染表格
    metrics.sort((a,b) => b.finalScore - a.finalScore);
    SSE_CACHE = metrics;

    const tbody = document.querySelector('#sse_table tbody');
    let html = '';
    
    metrics.forEach((m, i) => {
        const teacherName = TEACHER_MAP[`${m.className}_班主任`] || '-';
        
        // 补偿分样式
        let bonusBg = '#f3f4f6', bonusColor = '#666', bonusSign = '';
        if (m.sizeBonus > 0.001) { bonusBg = '#dcfce7'; bonusColor = '#166534'; bonusSign = '+'; }
        else if (m.sizeBonus < -0.001) { bonusBg = '#fee2e2'; bonusColor = '#991b1b'; }

        // 增值列显示逻辑 (根据开关隐藏/显示内容)
        let progHtml = '';
        if (useProgress) {
            progHtml = `<td><div style="font-weight:bold; color:${m.avgProgress>=0?'green':'red'}">${m.scoreProg.toFixed(1)}</div><div style="font-size:10px; color:#666">${m.matchedCount>0 ? (m.avgProgress>0?'+':'')+m.avgProgress.toFixed(1)+'名' : '-'}</div></td>`;
        } else {
            progHtml = `<td style="display:none"></td>`;
        }

        html += `
            <tr>
                <td class="rank-cell ${i<3 ? 'r-'+(i+1) : ''}">${i+1}</td>
                <td style="font-weight:bold; font-size:15px;">${m.className}</td>
                <td>${teacherName}</td>
                
                <td>
                    <div style="font-size:13px; font-weight:bold; color:#333;">${m.count} <span style="font-size:10px; font-weight:normal; color:#999;">(实考)</span></div>
                    <div style="font-size:12px; color:#0369a1; background:#f0f9ff; display:inline-block; padding:0 4px; border-radius:3px;">${m.enrollment} <span style="font-size:10px; color:#64748b;">(在籍)</span></div>
                </td>
                
                <td>
                    <span class="badge" style="background:${bonusBg}; color:${bonusColor};">
                        ${bonusSign}${m.sizeBonus.toFixed(2)}
                    </span>
                    <div style="font-size:10px; color:#999; margin-top:2px;">(差均 ${(m.enrollment - avgClassSize).toFixed(1)}人)</div>
                </td>
                
                <td><div style="font-weight:bold;">${m.scoreExc.toFixed(1)}</div><div style="font-size:10px; color:#666">率:${(m.excRate*100).toFixed(1)}%</div></td>
                <td><div style="font-weight:bold;">${m.scorePass.toFixed(1)}</div><div style="font-size:10px; color:#666">率:${(m.passRate*100).toFixed(1)}%</div></td>
                <td><div style="font-weight:bold;">${m.scoreAvg.toFixed(1)}</div><div style="font-size:10px; color:#666">${m.avg.toFixed(1)}</div></td>
                
                ${progHtml}
                
                <td style="background:#eff6ff; font-weight:800; font-size:18px; color:#1e3a8a;">${m.finalScore.toFixed(2)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    const hintDiv = document.getElementById('sse_result_container').querySelector('.sub-header');
    if(hintDiv) hintDiv.innerHTML = `<span>📊 绩效赋分排行榜</span> <span style="font-size:11px; margin-left:10px; color:#0369a1; background:#e0f2fe; padding:2px 5px; border-radius:4px;">💡 模式：${useProgress?'全维度(含增值)':'单次(权重重组)'} | 在籍人数算补贴，实考人数算成绩。</span>`;
    document.getElementById('sse_result_container').classList.remove('hidden');
}

// 3. 导出功能 (适配动态列)
function SSE_export() {
    if(!SSE_CACHE.length) return alert("请先进行计算");
    
    const useProgress = document.getElementById('sse_check_prog').checked;
    const wb = XLSX.utils.book_new();
    
    // 动态构建表头
    const headers = ['排名', '班级', '实考人数', '在籍人数(名单总数)', '大班补偿分', '优秀率%', '优秀得分', '及格率%', '及格得分', '平均分', '均分得分'];
    if(useProgress) {
        headers.push('进步名次', '增值得分');
    }
    headers.push('最终考核总分');

    const data = [headers];
    
    SSE_CACHE.forEach((m, i) => {
        const row = [
            i+1, m.className, 
            m.count,      // 实考
            m.enrollment, // 在籍
            m.sizeBonus.toFixed(2),
            (m.excRate*100).toFixed(2), m.scoreExc.toFixed(2),
            (m.passRate*100).toFixed(2), m.scorePass.toFixed(2),
            m.avg.toFixed(2), m.scoreAvg.toFixed(2)
        ];
        
        if(useProgress) {
            row.push(m.avgProgress.toFixed(1), m.scoreProg.toFixed(2));
        }
        
        row.push(m.finalScore.toFixed(2));
        data.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{wch:6}, {wch:10}, {wch:8}, {wch:12}, {wch:12}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:15}];
    
    XLSX.utils.book_append_sheet(wb, ws, "绩效考核表");
    XLSX.writeFile(wb, `${document.getElementById('sse_school_select').value}_绩效考核表.xlsx`);
}
