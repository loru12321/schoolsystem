// ================== 临界生精准推送逻辑 ==================
function updateMpSchoolSelect() {
    const sel = document.getElementById('mpSchoolSelect'); const old = sel.value;
    sel.innerHTML = '<option value="">--请选择学校--</option>'; Object.keys(SCHOOLS).forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
    if(old && SCHOOLS[old]) sel.value = old;
    updateMpClassSelect();
    const subSel = document.getElementById('mpSubjectSelect'); const oldSub = subSel.value;
    subSel.innerHTML = '<option value="ALL">全部学科</option>'; SUBJECTS.forEach(s => subSel.innerHTML += `<option value="${s}">${s}</option>`);
    if(oldSub) subSel.value = oldSub;
}

function updateMpClassSelect() {
    const sch = document.getElementById('mpSchoolSelect').value; const clsSel = document.getElementById('mpClassSelect');
    clsSel.innerHTML = '<option value="">全部班级</option>';
    if(sch && SCHOOLS[sch]) { const classes = [...new Set(SCHOOLS[sch].students.map(s => s.class))].sort(); classes.forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`); }
}

function generateMarginalTickets() {
    const sch = document.getElementById('mpSchoolSelect').value; const clsLimit = document.getElementById('mpClassSelect').value; const subLimit = document.getElementById('mpSubjectSelect').value; const gap = parseFloat(document.getElementById('mpGap').value) || 5; const type = document.getElementById('mpType').value;
    if(!sch || !SCHOOLS[sch]) return alert("请先选择学校");
    MP_DATA_CACHE = []; const container = document.getElementById('mp-tickets-container'); container.innerHTML = '';
    let students = SCHOOLS[sch].students; if(clsLimit) students = students.filter(s => s.class === clsLimit);
    let subjectsToAnalyze = (subLimit === 'ALL') ? SUBJECTS : [subLimit]; let taskMap = {};
    students.forEach(stu => {
        subjectsToAnalyze.forEach(sub => {
            if(stu.scores[sub] === undefined) return;
            const excLine = THRESHOLDS[sub].exc; const passLine = THRESHOLDS[sub].pass; const score = stu.scores[sub];
            let category = null; let targetScore = 0; let diff = 0;
            if (type !== 'pass') { if (score >= (excLine - gap) && score < excLine) { category = '拟优'; targetScore = excLine; diff = excLine - score; } }
            if (!category && type !== 'exc') { if (score >= (passLine - gap) && score < passLine) { category = '拟合格'; targetScore = passLine; diff = passLine - score; } }
            if (category) {
                if (!taskMap[stu.class]) taskMap[stu.class] = {}; if (!taskMap[stu.class][sub]) taskMap[stu.class][sub] = [];
                taskMap[stu.class][sub].push({ name: stu.name, score: score, category: category, target: targetScore, diff: parseFloat(diff.toFixed(1)), rank: safeGet(stu, `ranks.${sub}.class`, '-') });
            }
        });
    });
    let hasData = false;
    Object.keys(taskMap).sort().forEach(className => {
        Object.keys(taskMap[className]).forEach(subject => {
            const list = taskMap[className][subject]; if(list.length === 0) return; hasData = true;
            list.sort((a,b) => a.diff - b.diff);
            list.forEach(item => { MP_DATA_CACHE.push({ school: sch, class: className, subject: subject, name: item.name, score: item.score, category: item.category, target: item.target.toFixed(1), diff: item.diff }); });
            const teacherKey = `${className}_${subject}`; const teacherName = TEACHER_MAP[teacherKey] || "科任老师";
            let rows = ''; list.forEach(item => {
                let gapClass = 'gap-green'; if(item.diff > gap/2) gapClass = 'gap-orange'; if(item.diff > gap*0.8) gapClass = 'gap-red';
                let catStyle = item.category === '拟优' ? 'color:var(--primary);font-weight:bold;' : 'color:#b45309;';
                let warningTag = '';
                const uid = sch + "_" + item.name;
                if (ROLLER_COASTER_STUDENTS.includes(uid)) {
                    warningTag = '<br><span style="background:#fee2e2; color:#b91c1c; font-size:10px; padding:1px 3px; border-radius:3px;">⚠️ 需心理干预</span>';
                }
                rows += `<tr><td style="text-align:left; font-weight:bold;">${item.name}${warningTag}</td><td>${item.score}</td><td style="${catStyle}">${item.category}</td><td><span class="tag-gap ${gapClass}">差 ${item.diff}分</span></td><td style="color:#999;">${item.rank}</td><td><div class="chk-box"></div></td></tr>`;
            });
            container.innerHTML += `<div class="task-ticket"><div class="ticket-header"><div><div class="ticket-title">${subject} · ${className}</div><div class="ticket-sub">教师: ${teacherName} | 目标人数: ${list.length}人</div></div><div style="text-align:right;"><i class="ti ti-clipboard-check" style="font-size:24px; color:#cbd5e1;"></i></div></div><div class="ticket-body"><table class="ticket-table"><thead><tr><th style="text-align:left;">学生姓名</th><th>当前分</th><th>目标</th><th>差距</th><th>班排</th><th>辅导</th></tr></thead><tbody>${rows}</tbody></table><div style="padding:8px; font-size:11px; color:#999; border-top:1px dashed #eee; text-align:center;">🎯 目标线参考: 优秀≥${THRESHOLDS[subject].exc.toFixed(1)} / 及格≥${THRESHOLDS[subject].pass.toFixed(1)}</div></div></div>`;
        });
    });
    if(!hasData) container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:50px;"><p>🔍 在当前设定范围内（${gap}分）未找到符合条件的临界生。</p><p style="color:#999;">请尝试增大“临界分值”或切换目标类型。</p></div>`;
}

function printMarginalTickets() { if(document.getElementById('mp-tickets-container').children.length === 0) return alert("请先生成任务单"); window.print(); }
function exportMarginalTasks() {
    if(MP_DATA_CACHE.length === 0) return alert("请先生成数据");
    const wb = XLSX.utils.book_new(); const data = [['学校', '班级', '学科', '姓名', '当前分数', '临界类型', '目标分数', '分差']];
    MP_DATA_CACHE.forEach(d => { data.push([d.school, d.class, d.subject, d.name, d.score, d.category, d.target, d.diff]); });
    const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{wch:15}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}, {wch:10}];
    XLSX.utils.book_append_sheet(wb, ws, "临界生辅导名单"); XLSX.writeFile(wb, "临界生精准辅导任务单.xlsx");
}

// --- 临界生闭环管理逻辑 ---

// 1. 初始化下拉框 (页面加载或数据变动时调用)
function MP_initSnapshotSelect() {
    const sel = document.getElementById('mp_snapshot_select');
    if(!sel) return;
    sel.innerHTML = '<option value="">-- 选择历史任务 --</option>';
    Object.keys(MP_SNAPSHOTS).forEach(key => {
        const snap = MP_SNAPSHOTS[key];
        const date = new Date(snap.timestamp).toLocaleDateString();
        sel.innerHTML += `<option value="${key}">${key} (${snap.count}人, ${date})</option>`;
    });
}
// Hook: 在 switchTab 切换到 marginal-push 时初始化
// (由于无法直接修改 switchTab，我们在保存/删除后手动调用一次即可，首次加载需要用户点击一下或被动触发)
// 为了方便，我们在保存后直接刷新UI

// 2. 存档当前生成的临界生名单
function MP_saveSnapshot() {
    if (!MP_DATA_CACHE || MP_DATA_CACHE.length === 0) return alert("当前没有生成的临界生名单，请先设置参数并点击'生成辅导单'");
    
    const name = document.getElementById('mp_save_name').value.trim();
    if (!name) return alert("请输入任务名称（例如：初一上期中临界生）");
    
    if (MP_SNAPSHOTS[name] && !confirm(`任务名 [${name}] 已存在，是否覆盖？`)) return;

    MP_SNAPSHOTS[name] = {
        timestamp: new Date().getTime(),
        count: MP_DATA_CACHE.length,
        data: MP_DATA_CACHE // 结构: {school, class, subject, name, category...}
    };
    
    localStorage.setItem('MP_SNAPSHOTS', JSON.stringify(MP_SNAPSHOTS));
    alert("✅ 存档成功！下次考试导入数据后，可选择此任务进行转化率分析。");
    MP_initSnapshotSelect();
    document.getElementById('mp_save_name').value = '';
}

// 3. 删除存档
function MP_deleteSnapshot() {
    const key = document.getElementById('mp_snapshot_select').value;
    if (!key) return;
    if (!confirm(`确定删除历史任务 [${key}] 吗？`)) return;
    
    delete MP_SNAPSHOTS[key];
    localStorage.setItem('MP_SNAPSHOTS', JSON.stringify(MP_SNAPSHOTS));
    MP_initSnapshotSelect();
}

// 4. 计算转化率 (核心)
function MP_analyzeConversion() {
    const key = document.getElementById('mp_snapshot_select').value;
    if (!key) return alert("请选择一个历史任务进行对比");
    if (RAW_DATA.length === 0) return alert("请先上传【本次考试】的成绩数据");

    const snapshot = MP_SNAPSHOTS[key];
    const oldList = snapshot.data;
    
    // 统计容器: key = "School_Class_Subject_Category"
    const stats = {}; 

    oldList.forEach(task => {
        // 唯一标识：班级+学科+类型 (如: 701_数学_拟及格)
        // 尝试获取教师名
        const teacherKey = `${task.class}_${task.subject}`;
        const teacherName = TEACHER_MAP[teacherKey] || "未配置";
        
        const groupKey = `${task.school}::${task.class}::${teacherName}::${task.subject}::${task.category}`;
        
        if (!stats[groupKey]) {
            stats[groupKey] = { 
                school: task.school, className: task.class, teacher: teacherName, 
                subject: task.subject, category: task.category, 
                total: 0, success: 0 
            };
        }
        
        stats[groupKey].total++;

        // 在本次数据中寻找该学生
        // 匹配逻辑：姓名 + 学校 (防止同名)
        const currStudent = SCHOOLS[task.school]?.students.find(s => s.name === task.name);
        
        if (currStudent && currStudent.scores[task.subject] !== undefined) {
            const currScore = currStudent.scores[task.subject];
            const thresholds = THRESHOLDS[task.subject]; // 本次考试的划线
            
            let isSuccess = false;
            // 判断逻辑：
            // 如果当初是“拟优”，现在是否达到“优秀线”？
            // 如果当初是“拟合格”，现在是否达到“及格线”？
            if (task.category === '拟优' && currScore >= thresholds.exc) isSuccess = true;
            if (task.category === '拟合格' && currScore >= thresholds.pass) isSuccess = true;
            
            if (isSuccess) stats[groupKey].success++;
        }
    });

    // 渲染结果
    const tbody = document.querySelector('#mp_conversion_table tbody');
    let html = '';
    const sortedKeys = Object.keys(stats).sort();
    
    sortedKeys.forEach(k => {
        const d = stats[k];
        const rate = d.total > 0 ? (d.success / d.total) : 0;
        const ratePct = (rate * 100).toFixed(1) + '%';
        
        // 评价徽章
        let badge = '';
        if (rate >= 0.8) badge = '<span class="badge" style="background:#16a34a">⭐⭐⭐ 卓越</span>';
        else if (rate >= 0.5) badge = '<span class="badge" style="background:#2563eb">⭐⭐ 良好</span>';
        else if (rate >= 0.2) badge = '<span class="badge" style="background:#f59e0b">⭐ 一般</span>';
        else badge = '<span class="badge" style="background:#dc2626">⚠️ 需反思</span>';

        html += `<tr>
            <td><div style="font-weight:bold;">${d.teacher}</div><div style="font-size:10px;color:#666">${d.className}</div></td>
            <td>${d.subject}</td>
            <td><span style="padding:2px 5px; background:${d.category==='拟优'?'#dbeafe':'#fef9c3'}; border-radius:4px; font-size:11px;">${d.category}</span></td>
            <td>${d.total}</td>
            <td style="font-weight:bold; color:#166534;">${d.success}</td>
            <td style="font-weight:bold; font-size:14px;">${ratePct}</td>
            <td>${badge}</td>
        </tr>`;
    });

    if (!html) html = '<tr><td colspan="7" style="text-align:center; padding:20px;">未匹配到任何学生，请检查姓名是否一致。</td></tr>';
    
    tbody.innerHTML = html;
    document.getElementById('mp-conversion-result').classList.remove('hidden');
}

// 初始化一次
window.addEventListener('load', MP_initSnapshotSelect);
