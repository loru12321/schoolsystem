// 学校画像弹窗 + 页面初始化 + 管理按钮/水印
let schoolRadarInstance = null;
let schoolDistInstance = null;
let currentModalSchool = '';

function showSchoolProfile(schoolName) {
    if(!SCHOOLS[schoolName]) return;
    currentModalSchool = schoolName;
    const s = SCHOOLS[schoolName];
    const m = s.metrics.total || {};
    
    // 1. 填充基础数据
    document.getElementById('sp-title').innerHTML = `🏫 ${schoolName} <small style="font-size:14px; color:#666;">(参考人数: ${m.count})</small>`;
    document.getElementById('sp-rank').innerText = s.rank2Rate || '-';
    document.getElementById('sp-score').innerText = (s.score2Rate || 0).toFixed(2);
    
    const avgScore = m.ratedAvg || 0;
    const rateScore = (m.ratedExc || 0) + (m.ratedPass || 0);
    document.getElementById('sp-s1').innerText = avgScore.toFixed(1);
    document.getElementById('sp-s2').innerText = rateScore.toFixed(1);

    // --- 第一部分：雷达图 (使用 subjectLabels) ---
    const subjectLabels = []; 
    const ratios = []; 
    
    SUBJECTS.forEach(sub => {
        if(s.metrics[sub] && s.metrics[sub].avg) {
            // 计算全镇该科均分
            const allAvgs = Object.values(SCHOOLS).map(sch => sch.metrics[sub]?.avg || 0).filter(v=>v>0);
            const townAvg = allAvgs.reduce((a,b)=>a+b,0) / allAvgs.length;
            
            const ratio = townAvg ? (s.metrics[sub].avg / townAvg) : 0;
            subjectLabels.push(sub);
            ratios.push(parseFloat(ratio.toFixed(2)));
        }
    });

    const ctxRadar = document.getElementById('schoolRadarChart');
    if(schoolRadarInstance) schoolRadarInstance.destroy();
    
    schoolRadarInstance = new Chart(ctxRadar, {
        type: 'radar',
        data: {
            labels: subjectLabels, 
            datasets: [{
                label: '学科效能 (本校 ÷ 全镇)',
                data: ratios,
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: '#4f46e5',
                pointBackgroundColor: '#4f46e5',
                pointBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            onClick: (e, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                const subject = subjectLabels[idx]; // 获取点击的科目
                
                // 关闭当前模态框
                document.getElementById('school-profile-modal').style.display = 'none';
                
                // 跳转到“班级横向对比”模块，并筛选该科目
                jumpToModule('class-comparison'); // 利用已有的跳转函数
                
                // 延时滚动到该科目的对比表
                setTimeout(() => {
                    // 模拟点击该科目的侧边栏导航 (如果有)
                    // 或者直接滚动到对应锚点
                    const anchor = document.getElementById(`anchor-class-${subject}`);
                    if(anchor) {
                        anchor.scrollIntoView({behavior: "smooth", block: "center"});
                        // 展开对应的侧边栏子菜单
                        const navLink = document.querySelector(`.side-nav-sub-link`); 
                        // 简单提示用户
                        UI.toast(`已定位到 ${subject} 对比分析`, 'success');
                    }
                }, 600); // 等待页面切换和渲染
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            },
            scales: {
                r: { beginAtZero: false, min: 0.5, max: Math.max(...ratios, 1.1) + 0.1, ticks: { display: false }, pointLabels: { font: { size: 11, weight: 'bold' } } }
            },
            plugins: { legend: { display: false } }
        }
    });

    // 生成诊断语 (修复 undefined 问题)
    if (ratios.length > 0) {
        const maxIdx = ratios.indexOf(Math.max(...ratios));
        const minIdx = ratios.indexOf(Math.min(...ratios));
        const maxSub = subjectLabels[maxIdx]; 
        const minSub = subjectLabels[minIdx];
        document.getElementById('sp-diagnosis').innerHTML = `该校优势学科为 <strong style="color:#16a34a">${maxSub}</strong> (效能${ratios[maxIdx]})，相对薄弱学科为 <strong style="color:#dc2626">${minSub}</strong>。建议点击“班级对比”查看具体差异。`;
    } else {
        document.getElementById('sp-diagnosis').innerHTML = "数据不足，无法诊断。";
    }

    // --- 第二部分：分数段分布图 (使用 distLabels 避免冲突) ---
    const step = 50; 
    const allScores = RAW_DATA.map(s => s.total);
    const myScores = s.students.map(s => s.total);
    
    if (allScores.length > 0) {
        const maxScore = Math.ceil(Math.max(...allScores));
        const minScore = Math.floor(Math.min(...allScores));
        const startBin = Math.floor(minScore / step) * step;
        const endBin = Math.ceil(maxScore / step) * step;
        
        const distLabels = []; 
        const townData = [];
        const schoolData = [];
        const totalTown = allScores.length || 1;
        const totalSchool = myScores.length || 1;

        for (let i = startBin; i < endBin; i += step) {
            const low = i; const high = i + step;
            distLabels.push(`${low}-${high}`);
            const tCount = allScores.filter(v => v >= low && v < high).length;
            townData.push((tCount / totalTown * 100).toFixed(1)); 
            const sCount = myScores.filter(v => v >= low && v < high).length;
            schoolData.push((sCount / totalSchool * 100).toFixed(1));
        }

        const ctxDist = document.getElementById('schoolDistChart');
        if (schoolDistInstance) schoolDistInstance.destroy();

        schoolDistInstance = new Chart(ctxDist, {
            type: 'bar',
            data: {
                labels: distLabels, // 使用独立变量
                datasets: [
                    { type: 'line', label: '全镇平均 (%)', data: townData, borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, tension: 0.4, order: 1 },
                    { type: 'bar', label: '本校分布 (%)', data: schoolData, backgroundColor: '#3b82f6', barPercentage: 0.6, order: 2 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 10 } } }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw}%` } } },
                scales: { y: { display: false, beginAtZero: true }, x: { grid: { display: false }, ticks: { font: { size: 9 } } } }
            }
        });
    }

    document.getElementById('school-profile-modal').style.display = 'flex';
}

function jumpToModule(moduleId) {
    document.getElementById('school-profile-modal').style.display = 'none';
    switchTab(moduleId);
    setTimeout(() => {
        let selectId = '';
        if(moduleId === 'class-comparison') selectId = 'classCompSchoolSelect';
        else if(moduleId === 'teacher-analysis') selectId = 'mySchoolSelect';
        else if(moduleId === 'student-details') selectId = 'studentSchoolSelect';
        const select = document.getElementById(selectId);
        if(select) { select.value = currentModalSchool; select.dispatchEvent(new Event('change')); if(moduleId === 'teacher-analysis') analyzeTeachers(); }
        if(window.UI) UI.toast(`已跳转至 ${currentModalSchool}`, 'success');
    }, 100);
}

// 页面加载完成后，强制移除所有 max-height 限制
window.addEventListener('load', () => {
    const style = document.createElement('style');
    style.innerHTML = `
        .table-wrap { 
            max-height: none !important; 
            height: auto !important; 
            overflow-y: visible !important; 
            display: block !important;
        }
        /* 防止 rank2Rate 计算错误导致行隐藏 */
        tr { display: table-row !important; }
    `;
    document.head.appendChild(style);
    console.log("✅ 已强制解除表格高度限制");
    applyExamMetaUI();
    applyArchiveLockUI();
    if (typeof CohortDB !== 'undefined') CohortDB.renderExamList();
    updateIndicatorUIState();
    ['exam-year','exam-term','exam-type','exam-name','exam-date','exam-reset-point'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', refreshExamGradePreview);
    });
    renderAutoSnapshotsUI();
    updateAdminOnlyButtons();
    initModuleDescToggles();
    updateWatermark();
    if (Auth?.currentUser && !localStorage.getItem('CURRENT_COHORT_ID')) {
        showCohortPicker();
    }
});

function initModuleDescToggles() {
    const collapsed = localStorage.getItem('desc_collapsed') !== 'false';
    document.querySelectorAll('.module-desc-bar').forEach(bar => {
        if (!bar.querySelector('.desc-toggle')) {
            const btn = document.createElement('button');
            btn.className = 'desc-toggle';
            btn.type = 'button';
            btn.textContent = collapsed ? '展开说明' : '收起说明';
            btn.onclick = () => {
                bar.classList.toggle('desc-collapsed');
                const isCollapsed = bar.classList.contains('desc-collapsed');
                btn.textContent = isCollapsed ? '展开说明' : '收起说明';
                localStorage.setItem('desc_collapsed', String(isCollapsed));
            };
            bar.appendChild(btn);
        }
        if (collapsed) bar.classList.add('desc-collapsed');
    });
}

function openCloudRollback() {
    const user = Auth?.currentUser;
    if (!user) return alert('请先登录');
    if (user.role !== 'admin') return alert('⛔ 权限不足');
    const modal = document.getElementById('data-manager-modal');
    if (modal) modal.style.display = 'flex';
    if (typeof DataManager !== 'undefined') {
        DataManager.switchTab('cloud');
        setTimeout(() => {
            const chkSnap = document.getElementById('cloud-filter-snapshots');
            const chkCur = document.getElementById('cloud-filter-current');
            if (chkSnap) chkSnap.checked = true;
            if (chkCur) chkCur.checked = true;
            DataManager.renderCloudBackups();
        }, 100);
    }
}

function updateAdminOnlyButtons() {
    const user = Auth?.currentUser;
    const btn = document.getElementById('btn-cloud-rollback');
    if (!btn) return;
    btn.style.display = (user && user.role === 'admin') ? 'inline-flex' : 'none';
}

function updateWatermark() {
    const layer = document.getElementById('watermark-layer');
    if (!layer) return;
    const user = Auth?.currentUser;
    const name = user?.name || '未登录';
    const ts = new Date().toLocaleString();
    const text = `${name} | ${ts} | 内部资料`;

    // SVG 背景水印
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">
            <style>
                text { font: 14px 'Microsoft YaHei', Arial, sans-serif; fill: rgba(0,0,0,0.6); }
            </style>
            <g transform="rotate(-20 160 110)">
                <text x="10" y="80">${text}</text>
                <text x="10" y="160">${text}</text>
            </g>
        </svg>
    `;
    const encoded = encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22');
    layer.style.backgroundImage = `url("data:image/svg+xml,${encoded}")`;
}

// 每分钟刷新一次时间戳水印
setInterval(updateWatermark, 60000);
