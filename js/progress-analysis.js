// ================= 进退步分析逻辑 =================
function updateProgressSchoolSelect() {
    const sel = document.getElementById('progressSchoolSelect');
    sel.innerHTML = '<option value="">--请选择本校--</option>';
    Object.keys(SCHOOLS).forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);

    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        const school = user.school || MY_SCHOOL || '';
        if (school) {
            sel.value = school;
            sel.disabled = true;
        }
    }
}

function updateProgressBaselineSelect() {
    const sel = document.getElementById('progressBaselineSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">--请选择历史考试--</option>';
    const db = (window.CohortDB && typeof CohortDB.ensure === 'function') ? CohortDB.ensure() : null;
    const exams = Object.values(db?.exams || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    exams.forEach(ex => {
        if (ex.examId && ex.examId !== CURRENT_EXAM_ID) {
            sel.innerHTML += `<option value="${ex.examId}">${ex.examId}</option>`;
        }
    });
    sel.onchange = () => { window.PROGRESS_CACHE = []; };
}

function getBaselineDataFromExam(examId) {
    if (!examId) return [];
    const db = (window.CohortDB && typeof CohortDB.ensure === 'function') ? CohortDB.ensure() : null;
    const exam = db?.exams?.[examId];
    if (!exam || !exam.data) return [];
    return exam.data.map(s => ({
        name: s.name,
        school: s.school,
        class: normalizeClass(s.class),
        total: s.total
    })).filter(s => typeof s.total === 'number');
}

// ============================================================
//  智能版上次成绩加载函数 (自动适配 9年级五科模式 vs 其他年级全科模式)
// ============================================================
function loadPreviousData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type: 'array'});
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, {header:1});
            
            if(json.length < 2) throw new Error("表格数据太少");

            const headers = json[0].map(h => String(h).trim());
            let idxName = -1, idxSchool = -1, idxTotal = -1, idxClass = -1;
            
            // 1. 识别基础列
            headers.forEach((h, i) => { 
                if(h.includes('姓名')) idxName = i; 
                if(h.includes('学校')) idxSchool = i; 
                if(h.includes('班级') || h.toLowerCase() === 'class') idxClass = i; 
                if(h.includes('总分') || h.includes('Total') || h === '得分') idxTotal = i; 
            });

            // 🔥🔥 [核心修改点开始]：智能判断要累加哪些科目 🔥🔥
            let subjectIndices = [];
            let calcModeInfo = "全科累加";

            // 如果表格里没有“总分”列，我们需要自己算
            if (idxTotal === -1) {
                let targetSubjects = [];
                
                // 读取全局配置 CONFIG，判断当前是 9年级模式 还是 6-8年级模式
                if (CONFIG && Array.isArray(CONFIG.totalSubs)) {
                    // 👉 9年级模式：只寻找 ['语文','数学','英语','物理','化学']
                    targetSubjects = CONFIG.totalSubs; 
                    calcModeInfo = "9年级五科";
                } else {
                    // 👉 其他模式：寻找所有常见科目
                    targetSubjects = ['语文','数学','英语','物理','化学','政治','历史','地理','生物','科学','道法'];
                }

                // 遍历表头，记录符合要求的列索引
                headers.forEach((h, i) => {
                    if (targetSubjects.some(sub => h.includes(sub))) {
                        subjectIndices.push(i);
                    }
                });
            }
            // 🔥🔥 [核心修改点结束] 🔥🔥

            if(idxName === -1) { alert('上传失败：无法识别“姓名”列。'); return; }
            
            // 3. 开始解析数据
            PREV_DATA = [];
            for(let i=1; i<json.length; i++) {
                const r = json[i]; 
                if(!r[idxName]) continue;
                
                const school = idxSchool !== -1 ? r[idxSchool] : '默认学校'; 
                const className = idxClass !== -1 ? normalizeClass(r[idxClass]) : ''; 
                
                let score = 0;
                
                // 策略A: 优先信赖Excel自带的总分
                if (idxTotal !== -1) {
                    score = parseFloat(r[idxTotal]);
                } 
                // 策略B: 自动求和 (受控于上面的 9年级 逻辑)
                else if (subjectIndices.length > 0) {
                    let tempSum = 0;
                    let hasVal = false;
                    subjectIndices.forEach(idx => {
                        const val = parseFloat(r[idx]);
                        if (!isNaN(val)) {
                            tempSum += val;
                            hasVal = true;
                        }
                    });
                    if (hasVal) score = tempSum;
                    else score = NaN; 
                } else {
                    alert('上传失败：未找到总分列，也未匹配到当前模式所需的学科列。');
                    return;
                }

                if(!isNaN(score)) { 
                    PREV_DATA.push({ name: r[idxName], school: school, class: className, total: score }); 
                }
            }
            
            if(PREV_DATA.length === 0) { alert('未读取到有效数据'); return; }

            // 4. 重新计算排名
            PREV_DATA.sort((a,b) => b.total - a.total);
            PREV_DATA.forEach((s, i) => { 
                if(i > 0 && Math.abs(s.total - PREV_DATA[i-1].total) < 0.001) { 
                    s.rank = PREV_DATA[i-1].rank; 
                } else { 
                    s.rank = i + 1; 
                } 
            });
            
            let msg = `✅ 上次考试数据加载成功！共 ${PREV_DATA.length} 条。`;
            if(idxTotal === -1) msg += `\n(注：未提供总分，已按【${calcModeInfo}】模式自动累加 ${subjectIndices.length} 科成绩)`;
            
            alert(msg);
            
            // 刷新可能存在的状态提示
            const statusDiv = document.getElementById('va-data-status');
            if (statusDiv) statusDiv.innerHTML = '✅ 数据就绪 (已更新)';

        } catch(err) {
            console.error(err);
            alert("解析出错：" + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- 进退步分析 (含同名/转班智能拦截) ---

// 1. 入口函数：先检查歧义
function renderProgressAnalysis() {
    if(!RAW_DATA.length) return uiAlert("请先上传【本次考试】数据", 'warning');
    if(!PREV_DATA.length) return uiAlert("请先上传【上次考试】数据", 'warning');
    
    const schoolName = document.getElementById('progressSchoolSelect').value;
    if(!schoolName) return uiAlert("请选择要分析的学校", 'warning');
    
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    const scope = (role === 'teacher') ? getTeacherScopeForUser(user) : null;
    let currentStudents = SCHOOLS[schoolName].students;
    if (role === 'class_teacher' && user?.class) {
        currentStudents = currentStudents.filter(s => s.class === user.class);
    }
    if (role === 'teacher' && scope && scope.classes.size > 0) {
        currentStudents = currentStudents.filter(s => scope.classes.has(s.class));
    }
    const ambiguousCases = []; // 存储需要用户确认的情况

    // 预扫描
    currentStudents.forEach(curr => {
        // 1. 尝试严格匹配 (姓名+班级+学校)
        const strictMatch = PREV_DATA.find(p => p.name === curr.name && p.school === curr.school && p.class === curr.class);
        
        // 2. 如果严格匹配失败，但在上次数据里能找到“同名同校”的人 (说明可能转班了，或者只是同名)
        if (!strictMatch) {
            // 找出所有同名同校的候选人
            const candidates = PREV_DATA.filter(p => p.name === curr.name && p.school === curr.school);
            
            if (candidates.length > 0) {
                // 检查是否已经手动映射过
                const mapKey = `${curr.school}_${curr.class}_${curr.name}`;
                if (!MANUAL_ID_MAPPINGS[mapKey]) {
                    ambiguousCases.push({
                        curr: curr,
                        candidates: candidates
                    });
                }
            }
        }
    });

    // 决策：如果有歧义，弹窗；否则直接计算
    if (ambiguousCases.length > 0) {
        showMappingModal(ambiguousCases);
    } else {
        performProgressCalculation(); // 直接计算
    }
}

// 2. 显示映射弹窗
function showMappingModal(cases) {
    const modal = document.getElementById('mappingModal');
    const tbody = document.querySelector('#mappingModal tbody');
    tbody.innerHTML = '';

    cases.forEach((item, idx) => {
        const curr = item.curr;
        let optionsHtml = `<option value="">-- 请选择对应的上次记录 --</option>`;
        // 默认选项：如果只有一个候选人，为了方便，默认选中它？还是强制让用户选？
        // 建议：强制选，或者提供一个"不匹配(视为新生)"选项
        item.candidates.forEach(cand => {
            optionsHtml += `<option value="${cand.class}">上次在：${cand.class} (排名:${cand.rank})</option>`;
        });
        optionsHtml += `<option value="__IGNORE__">❌ 不是同一个人 (视为新生)</option>`;

        const row = `
            <tr data-school="${curr.school}" data-class="${curr.class}" data-name="${curr.name}">
                <td style="padding:10px;">
                    <div style="font-weight:bold;">${curr.name}</div>
                    <div style="font-size:12px; color:#666;">本次：${curr.class}</div>
                </td>
                <td style="padding:10px;">
                    <select class="mapping-select" style="width:100%; padding:5px; border:1px solid #d97706; border-radius:4px;">
                        ${optionsHtml}
                    </select>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });

    modal.style.display = 'flex';
}

// 3. 用户点击确认后
function confirmMappingsAndRun() {
    const rows = document.querySelectorAll('#mappingModal tbody tr');
    let allSelected = true;

    rows.forEach(row => {
        const select = row.querySelector('select');
        const val = select.value;
        if (!val) {
            allSelected = false;
            select.style.border = "2px solid red";
        } else {
            // 保存映射关系
            const s = row.dataset.school;
            const c = row.dataset.class;
            const n = row.dataset.name;
            const key = `${s}_${c}_${n}`; // 唯一键
            MANUAL_ID_MAPPINGS[key] = val; // value 是上次的班级名，或者 __IGNORE__
        }
    });

    if (!allSelected) return alert("请为所有疑似学生选择对应关系（如果是新生，请选“不是同一个人”）");

    document.getElementById('mappingModal').style.display = 'none';
    performProgressCalculation(); // 继续计算
}

// 4. 真正的计算逻辑 (拆分出来的)
// 🟢 [修改]：完全重写此函数，支持“校内排名”重算对比，解决单校月考 vs 全镇联考的对比难题
function performProgressCalculation() {
    const schoolName = document.getElementById('progressSchoolSelect').value;
    
    if (!schoolName || !SCHOOLS[schoolName]) return alert("请选择学校");

    const currentStudents = SCHOOLS[schoolName].students; 
    PROGRESS_CACHE = [];
    const cleanName = (n) => String(n).replace(/\s+/g, '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');

    // ==========================================
    // 🚀 核心改进：构建“上次考试”的【校内排名】索引
    // 解决痛点：本次是单校(分母小)，上次是全镇(分母大)，直接比排名不科学。
    // 方案：把上次全镇数据里的本校学生拎出来，重新排个座次，用“上次校排”vs“本次校排”。
    // ==========================================
    
    // 1. 从上次全镇数据中，筛选出属于该校的学生
    let prevSchoolSubset = PREV_DATA.filter(p => p.school === schoolName);

    // 备用方案：如果上次数据没填学校，或者学校名写的不一样，尝试用本次名单反查
    if (prevSchoolSubset.length < currentStudents.length * 0.5) { 
        console.log("智能修正：上次数据中学校名称可能不匹配，启用【名单反查模式】...");
        const currentNames = new Set(currentStudents.map(s => cleanName(s.name)));
        prevSchoolSubset = PREV_DATA.filter(p => currentNames.has(cleanName(p.name)));
    }

    // 2. 对上次的本校子集进行重新排序 (按分数降序)
    prevSchoolSubset.sort((a,b) => b.total - a.total);

    // 3. 建立映射表: 姓名 -> 上次校内排名
    const prevLocalRankMap = {};
    prevSchoolSubset.forEach((p, index) => {
        // 处理同分同名次逻辑
        let rank = index + 1;
        if (index > 0 && Math.abs(p.total - prevSchoolSubset[index-1].total) < 0.01) {
            // 继承上一名
            rank = prevLocalRankMap[cleanName(prevSchoolSubset[index-1].name) + "_rank"]; 
        }
        
        prevLocalRankMap[cleanName(p.name)] = {
            localRank: rank,      // 💡 影子排名：上次在校内的名次
            townRank: p.rank,     // 原始排名：上次在全镇的名次
            total: p.total
        };
        // 辅助键防止覆盖
        prevLocalRankMap[cleanName(p.name) + "_rank"] = rank; 
    });

    console.log(`[进退步分析] 已重构上次校内排名，基数: ${prevSchoolSubset.length} 人`);

    // ==========================================
    // 开始对比
    // ==========================================

    currentStudents.forEach(curr => {
        const currNameClean = cleanName(curr.name);
        
        // 尝试获取用户手动映射 (处理同名/转班)
        const mapKey = `${curr.school}_${curr.class}_${curr.name}`;
        const mappedPrevClass = MANUAL_ID_MAPPINGS[mapKey];

        // 获取该生在上次考试中的信息
        let prevInfo = prevLocalRankMap[currNameClean];

        // 简单过滤：如果指定了映射但不是忽略，或者没指定但找到了
        if (mappedPrevClass === '__IGNORE__') prevInfo = null;

        if(prevInfo) {
            // 💡 核心对比：本次校排 vs 上次校排
            // curr.ranks.total.school 是系统在 processData 里算好的本次校内排名
            const currLocalRank = safeGet(curr, 'ranks.total.school', 0);
            const prevLocalRank = prevInfo.localRank;

            // 只有当两者都有效时才计算
            if (currLocalRank > 0 && prevLocalRank > 0) {
                const change = prevLocalRank - currLocalRank; // 正数为进步 (名次变小)
                
                let status = ""; 
                if(change > 0) status = `<span class="trend-up"><i class="ti ti-arrow-up trend-icon"></i>校排进 ${change} 名</span>`; 
                else if(change < 0) status = `<span class="trend-down"><i class="ti ti-arrow-down trend-icon"></i>校排退 ${Math.abs(change)} 名</span>`; 
                else status = `<span style="color:#666;">🔵 排名持平</span>`;
                
                // 增加提示：如果是单校模式，特别标注这是校内对比
                const note = `<div style="font-size:10px; color:#999;">(上次校排: ${prevLocalRank})</div>`;

                PROGRESS_CACHE.push({ 
                    class: curr.class, 
                    name: curr.name, 
                    currTotal: curr.total, 
                    currRank: currLocalRank, // 显示校内排名
                    prevTotal: prevInfo.total, 
                    prevRank: prevLocalRank, // 显示重算后的上次校内排名
                    change: change, 
                    statusHTML: status + note
                });
            }
        }
    });

    // 保存全量缓存并应用筛选
    window.PROGRESS_CACHE_FULL = PROGRESS_CACHE.slice();
    applyProgressFilter();
}

// 进退步筛选与表格渲染
function applyProgressFilter() {
    const typeEl = document.getElementById('progressFilterType');
    const thresholdEl = document.getElementById('progressFilterThreshold');
    const type = typeEl ? typeEl.value : 'all';
    const threshold = thresholdEl ? parseInt(thresholdEl.value || '0') : 0;

    let list = (window.PROGRESS_CACHE_FULL || []).slice();
    list = list.filter(r => Math.abs(r.change) >= threshold);
    if (type === 'up') list = list.filter(r => r.change > 0);
    if (type === 'down') list = list.filter(r => r.change < 0);

    // 更新全局用于图表
    PROGRESS_CACHE = list;
    renderProgressTable(list);

    if (list.length > 0) {
        renderTrendChart();
        renderSankeyDiagram();
    }
}

function resetProgressFilter() {
    const typeEl = document.getElementById('progressFilterType');
    const thresholdEl = document.getElementById('progressFilterThreshold');
    if (typeEl) typeEl.value = 'all';
    if (thresholdEl) thresholdEl.value = 20;
    applyProgressFilter();
}

function renderProgressTable(list) {
    const tbody = document.querySelector('#progressTable tbody'); 
    const thead = document.querySelector('#progressTable thead tr');
    if (!tbody || !thead) return;

    thead.innerHTML = `<th>班级</th><th>姓名</th><th>本次总分</th><th>本次校排</th><th>上次总分</th><th>上次校排(重算)</th><th>进退步</th><th>状态评价</th>`;

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#999;">暂无符合筛选条件的学生</td></tr>';
        return;
    }

    list.sort((a,b) => b.change - a.change);
    let html = '';
    list.forEach(row => {
        const rewardBtn = row.change > 30 
            ? `<button class="btn btn-orange" style="padding:2px 8px; font-size:11px;" onclick="showCertificate('${row.name}', '进步之星')">🏅 颁奖</button>` 
            : (row.currRank <= 10 ? `<button class="btn btn-purple" style="padding:2px 8px; font-size:11px;" onclick="showCertificate('${row.name}', '学习标兵')">🏆 颁奖</button>` : '');

        html += `<tr>
            <td data-label="班级">${row.class}</td>
            <td data-label="姓名"><strong>${row.name}</strong></td>
            <td data-label="本次总分">${row.currTotal}</td>
            <td data-label="本次校排" style="font-weight:bold;">${row.currRank}</td>
            <td data-label="上次总分" style="color:#999">${row.prevTotal}</td>
            <td data-label="上次校排" style="color:#999">${row.prevRank}</td>
            <td data-label="进退步" style="font-weight:bold; ${row.change>0?'color:var(--success)':'color:var(--danger)'}">${row.change>0?'+':''}${row.change}</td>
            <td data-label="状态评价">${row.statusHTML} ${rewardBtn}</td>
        </tr>`;  
    });
    tbody.innerHTML = html;
}

// 辅助：重绘图表 (把原来的图表逻辑封装在这里)
function renderTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (trendChartInstance) trendChartInstance.destroy();

    const improved = [], regressed = [], stable = [];
    PROGRESS_CACHE.forEach(p => {
        const point = { x: p.prevRank, y: p.currRank, name: p.name, cls: p.class, change: p.change };
        if (p.change > 0) improved.push(point);
        else if (p.change < 0) regressed.push(point);
        else stable.push(point);
    });
    const maxRank = Math.max(...PROGRESS_CACHE.map(p => Math.max(p.prevRank, p.currRank))) + 10;

    trendChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                { label: '进步', data: improved, backgroundColor: 'rgba(22, 163, 74, 0.6)', borderColor: 'rgba(22, 163, 74, 1)' },
                { label: '退步', data: regressed, backgroundColor: 'rgba(220, 38, 38, 0.6)', borderColor: 'rgba(220, 38, 38, 1)' },
                { label: '持平', data: stable, backgroundColor: 'rgba(71, 85, 105, 0.4)' },
                { label: '基准线', data: [{x: 0, y: 0}, {x: maxRank, y: maxRank}], showLine: true, borderColor: '#94a3b8', borderDash: [5, 5], pointRadius: 0, fill: false }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { callbacks: { label: (ctx) => { const p = ctx.raw; return p.name ? `${p.cls} ${p.name}: ${p.x} -> ${p.y} (${p.change>0?'+':''}${p.change})` : ''; } } } },
            scales: { x: { title:{display:true, text:'上次排名'}, min:0, max:maxRank }, y: { title:{display:true, text:'本次排名'}, min:0, max:maxRank, reverse:true } }
        }
    });
}

let sankeyChartInstance = null;

function renderSankeyDiagram() {
    const ctx = document.getElementById('sankeyChart');
    if (!ctx) return;
    if (sankeyChartInstance) sankeyChartInstance.destroy();

    if (PROGRESS_CACHE.length === 0) return;

    // 1. 准备基数
    const totalStudents = RAW_DATA.length; // 本次全镇总人数
    const prevTotalStudents = PREV_DATA.length; // 上次全镇总人数

    // 2. 聚合流动数据
    const flows = {};
    
    PROGRESS_CACHE.forEach(p => {
        // 计算上次层级 (按全镇百分比)
        const prevPct = p.prevRank / prevTotalStudents;
        let fromTier = '上次 ';
        if (prevPct <= 0.25) fromTier += 'A (优)';
        else if (prevPct <= 0.50) fromTier += 'B (良)';
        else if (prevPct <= 0.75) fromTier += 'C (中)';
        else fromTier += 'D (潜)';

        // 计算本次层级
        const currPct = p.currRank / totalStudents;
        let toTier = '本次 ';
        if (currPct <= 0.25) toTier += 'A (优)';
        else if (currPct <= 0.50) toTier += 'B (良)';
        else if (currPct <= 0.75) toTier += 'C (中)';
        else toTier += 'D (潜)';

        const key = `${fromTier}||${toTier}`;
        if (!flows[key]) flows[key] = 0;
        flows[key]++;
    });

    // 3. 转换为 Chart.js Sankey 数据格式
    const dataPoints = Object.keys(flows).map(key => {
        const [from, to] = key.split('||');
        return { from, to, flow: flows[key] };
    });

    // 4. 颜色映射逻辑
    const getColor = (from, to) => {
        const f = from.charAt(3); // 取字符 A, B, C, D
        const t = to.charAt(3);
        const map = {'A':0, 'B':1, 'C':2, 'D':3};
        const fi = map[f];
        const ti = map[t];

        if (fi === ti) return '#94a3b8'; // 灰色：保持
        if (ti < fi) return '#16a34a';  // 绿色：进步 (A是0，变小了就是进步)
        return '#dc2626';             // 红色：退步
    };

    sankeyChartInstance = new Chart(ctx, {
        type: 'sankey',
        data: {
            datasets: [{
                label: '生源流动',
                data: dataPoints,
                colorFrom: (c) => getColor(c.dataset.data[c.dataIndex].from, c.dataset.data[c.dataIndex].to),
                colorTo: (c) => getColor(c.dataset.data[c.dataIndex].from, c.dataset.data[c.dataIndex].to),
                colorMode: 'gradient', // 渐变色
                labels: { font: { size: 12, weight: 'bold' }, color: 'black' },
                nodeWidth: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = context.raw;
                            return `${item.from} -> ${item.to}: ${item.flow}人`;
                        }
                    }
                }
            }
        }
    });
}

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
