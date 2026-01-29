function generateTeacherInputs() {
    if (!MY_SCHOOL) { alert('请先选择本校'); return; }
    const container = document.getElementById('teacherInputsContainer');
    if (!container) {
        console.warn('teacherInputsContainer 不存在，跳过生成教师输入区');
        return;
    }
    container.innerHTML = '';
    const mySchoolData = SCHOOLS[MY_SCHOOL]; if (!mySchoolData) return;
    const classes = [...new Set(mySchoolData.students.map(s => s.class))].sort((a, b) => { const [gradeA, classA] = a.split('.').map(Number); const [gradeB, classB] = b.split('.').map(Number); if (gradeA !== gradeB) return gradeA - gradeB; return classA - classB; });
    classes.forEach(cls => {
        SUBJECTS.forEach(sub => { const key = `${cls}_${sub}`; const currentTeacher = TEACHER_MAP[key] || ''; const inputDiv = document.createElement('div'); inputDiv.innerHTML = `<label style="font-size:12px;color:#666;">${cls}班 ${sub}</label><input type="text" class="teacher-input" data-key="${key}" value="${currentTeacher}" placeholder="姓名" style="width:100%;margin-top:2px;">`; container.appendChild(inputDiv); });
    });
    container.querySelectorAll('.teacher-input').forEach(input => { input.addEventListener('input', function() { const key = this.dataset.key; const value = this.value.trim(); if (value) TEACHER_MAP[key] = value; else delete TEACHER_MAP[key];             // 防抖保存：输入停止 1 秒后保存，避免频繁写入
        clearTimeout(window.saveTimer);
        window.saveTimer = setTimeout(() => {
            const currentKey = localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup';
            
            DB.save(currentKey, {
                timestamp: Date.now(),
                RAW_DATA: RAW_DATA,
                SCHOOLS: SCHOOLS,
                SUBJECTS: SUBJECTS,
                THRESHOLDS: THRESHOLDS,
                TEACHER_MAP: TEACHER_MAP, // 重点保存这个
                TEACHER_STATS: TEACHER_STATS,
                FB_CLASSES: FB_CLASSES,
                CONFIG: CONFIG,
                MY_SCHOOL: MY_SCHOOL
            });
        }, 1000);}); });
}

function importTeacherExcel() {
    // 🟢 [重写] 使用新的统一导入逻辑
    const fileInput = document.getElementById('teacherFileInput');
    if (!fileInput) {
        alert('❌ 系统错误：找不到文件输入框');
        return;
    }
    
    if (!fileInput.files || !fileInput.files.length) {
        alert('⚠️ 请选择教师信息Excel文件');
        return;
    }
    
    // 检查是否封存
    if (typeof isArchiveLocked === 'function' && isArchiveLocked()) {
        alert("⛔ 当前考试已封存，禁止导入任课表");
        return;
    }
    
    // 检查 XLSX 库
    if (typeof XLSX === 'undefined') {
        alert('❌ Excel解析库未加载，请刷新页面后重试');
        return;
    }
    
    const file = fileInput.files[0];
    console.log(`[旧版入口] 开始导入: ${file.name}`);
    
    if (window.UI) UI.loading(true, '✨ 正在导入教师信息...');
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);
            
            if (!jsonData || jsonData.length === 0) {
                if (window.UI) UI.loading(false);
                alert('❌ 表格为空或格式不正确');
                return;
            }
            
            // 导入数据
            let count = 0;
            jsonData.forEach(row => {
                const className = normalizeClass(row['班级'] || row['class'] || row['Class']);
                const subject = row['学科'] || row['subject'] || row['科目'];
                const teacher = row['教师'] || row['teacher'] || row['教师姓名'] || row['姓名'];
                
                if (className && subject && teacher) {
                    TEACHER_MAP[`${className}_${subject}`] = String(teacher).trim();
                    count++;
                }
            });
            
            if (count === 0) {
                if (window.UI) UI.loading(false);
                alert('❌ 未能导入任何数据，请检查Excel格式');
                return;
            }
            
            // 刷新显示
            if (typeof generateTeacherInputs === 'function') {
                generateTeacherInputs();
            }
            
            // 同步到云端
            if (typeof saveCloudData === 'function') {
                try {
                    await saveCloudData();
                    if (window.UI) {
                        UI.loading(false);
                        UI.toast(`✅ 成功导入 ${count} 条教师信息并同步到云端`, "success");
                    } else {
                        alert(`✅ 成功导入 ${count} 条教师信息并同步到云端`);
                    }
                } catch (err) {
                    if (window.UI) UI.loading(false);
                    console.error('云端同步失败:', err);
                    alert(`✅ 成功导入 ${count} 条教师信息\n\n⚠️ 但云端同步失败，请手动保存。`);
                }
            } else {
                if (window.UI) UI.loading(false);
                alert(`✅ 成功导入 ${count} 条教师信息`);
            }
            
        } catch (error) {
            if (window.UI) UI.loading(false);
            console.error('导入错误:', error);
            alert('❌ 导入失败：' + error.message);
        }
    };
    
    reader.onerror = function() {
        if (window.UI) UI.loading(false);
        alert('❌ 文件读取失败');
    };
    
    reader.readAsArrayBuffer(file);
}

// [核心修改] 教师四维评价计算逻辑 (含贡献值、增值、低分率)
function analyzeTeachers() {
    if (!MY_SCHOOL) { alert('请先选择本校'); return; }
    if (window.DataManager && typeof DataManager.ensureTeacherMap === 'function') {
        const ok = DataManager.ensureTeacherMap(true);
        if (!ok) {
            if (window.UI) UI.toast('请先同步教师任课表后再分析', 'warning');
            return;
        }
    }
    TEACHER_STATS = {}; 
    const mySchoolData = SCHOOLS[MY_SCHOOL]; 
    if (!mySchoolData) return;

    // 1. 预计算年级基准
    const gradeStats = {};
    SUBJECTS.forEach(sub => {
        const scores = mySchoolData.students.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        if (scores.length > 0) {
            const sum = scores.reduce((a,b)=>a+b, 0);
            const avg = sum / scores.length;
            const variance = scores.reduce((a,b) => a + Math.pow(b - avg, 2), 0) / scores.length;
            
            gradeStats[sub] = {
                avg: avg,
                sd: Math.sqrt(variance),
                exc: THRESHOLDS[sub]?.exc || 0,
                pass: THRESHOLDS[sub]?.pass || 0,
                low: (THRESHOLDS[sub]?.pass || 60) * 0.6 
            };
        }
    });

    // 2. 归集教师数据
    Object.entries(TEACHER_MAP).forEach(([key, teacherName]) => {
        const [rawClass, rawSubject] = key.split('_'); 
        const className = normalizeClass(rawClass);
        const subject = normalizeSubject(rawSubject);
        if(!SUBJECTS.includes(subject)) {
            const matched = SUBJECTS.find(s => normalizeSubject(s) === subject);
            if (!matched) return;
        }
        
        if (!TEACHER_STATS[teacherName]) TEACHER_STATS[teacherName] = {}; 
        const useSubject = SUBJECTS.find(s => normalizeSubject(s) === subject) || subject;
        if (!TEACHER_STATS[teacherName][useSubject]) { 
            TEACHER_STATS[teacherName][useSubject] = { 
                classes: [], students: []
            }; 
        }
        
        const teacherStudents = mySchoolData.students.filter(s => s.class === className && s.scores[useSubject] !== undefined);
        TEACHER_STATS[teacherName][useSubject].classes.push(className); 
        TEACHER_STATS[teacherName][useSubject].students.push(...teacherStudents);
    });

    // 3. 计算多维指标 (已移除增值项)
    Object.keys(TEACHER_STATS).forEach(teacher => {
        Object.keys(TEACHER_STATS[teacher]).forEach(subject => {
            const data = TEACHER_STATS[teacher][subject]; 
            const students = data.students;
            const gs = gradeStats[subject] || { avg:0, low:0 };

            if (students.length > 0) {
                // 基础指标
                data.totalScore = students.reduce((sum, s) => sum + s.scores[subject], 0); 
                data.avg = (data.totalScore / students.length).toFixed(2);
                data.studentCount = students.length;
                data.classes = [...new Set(data.classes)].sort().join(',');

                // 三率
                data.excellentCount = students.filter(s => s.scores[subject] >= gs.exc).length; 
                data.passCount = students.filter(s => s.scores[subject] >= gs.pass).length;
                data.lowCount = students.filter(s => s.scores[subject] < gs.low).length;

                data.excellentRate = (data.excellentCount / students.length); 
                data.passRate = (data.passCount / students.length); 
                data.lowRate = (data.lowCount / students.length);

                // 贡献值
                data.contribution = (parseFloat(data.avg) - gs.avg).toFixed(2);

                // ★ 综合绩效分 (移除增值分，提高优良率权重)
                // 新算法：基准30 + 贡献值 + 优率(30) + 及格(30) - 低分惩罚
                let score = 30; 
                score += parseFloat(data.contribution); 
                score += (data.excellentRate * 30); // 权重由25提至30
                score += (data.passRate * 30);      // 权重由25提至30
                score -= (data.lowRate * 20); 

                data.finalScore = score.toFixed(1);

            } else { 
                Object.assign(data, { 
                    avg: "0.00", excellentRate: 0, passRate: 0, lowRate: 0, 
                    contribution: 0, finalScore: 0, classes: "无成绩" 
                });
            }
        });
    });
    
    calculateTeacherTownshipRanking(); 
    renderTeacherCards(); 
    renderTeacherComparisonTable(); 
    generateTeacherPairing(); 
}

function generateTeacherPairing() {
    const container = document.getElementById('teacher-pairing-suggestions'); container.innerHTML = '';
    if(!MY_SCHOOL || !SCHOOLS[MY_SCHOOL]) return;
    const schoolMetrics = SCHOOLS[MY_SCHOOL].metrics; let pairs = [];
    SUBJECTS.forEach(sub => {
        const baseline = schoolMetrics[sub]; if(!baseline) return;
        const teachers = []; Object.keys(TEACHER_STATS).forEach(tName => { if(TEACHER_STATS[tName][sub]) { teachers.push({name: tName, data: TEACHER_STATS[tName][sub]}); } });
        if(teachers.length < 2) return;
        const typeA = teachers.filter(t => t.data.passRate > baseline.passRate && t.data.excellentRate < baseline.excRate);
        const typeB = teachers.filter(t => t.data.excellentRate > baseline.excRate && t.data.passRate < baseline.passRate);
        typeA.forEach(a => { typeB.forEach(b => { const id = [a.name, b.name].sort().join('-'); if(!pairs.find(p => p.id === id + sub)) { pairs.push({ id: id + sub, subject: sub, teacher1: a, teacher2: b }); } }); });
    });
    if(pairs.length === 0) { container.innerHTML = '<div style="text-align:center; color:#999; grid-column:1/-1;">暂无明显的互补型结对建议，说明各位老师发展较为均衡或差异不大。</div>'; return; }
    pairs.forEach(p => {
        const card = document.createElement('div'); card.className = 'pairing-card';
        card.innerHTML = `<div class="pairing-side"><div class="pairing-role">基础扎实型</div><div class="pairing-name">${p.teacher1.name}</div><div class="pairing-skill">✅ 及格率高 (${(p.teacher1.data.passRate*100).toFixed(1)}%)</div><div class="pairing-need">🔻 需提升优秀率</div></div><div class="pairing-arrow"><div style="text-align:center;"><i class="ti ti-arrows-left-right"></i><div class="pairing-tag">${p.subject}</div></div></div><div class="pairing-side" style="text-align:right;"><div class="pairing-role">培优拔尖型</div><div class="pairing-name">${p.teacher2.name}</div><div class="pairing-skill">✅ 优秀率高 (${(p.teacher2.data.excellentRate*100).toFixed(1)}%)</div><div class="pairing-need">🔻 需提升及格率</div></div>`; container.appendChild(card);
    });
}

function calculateTeacherTownshipRanking() {
    TEACHER_TOWNSHIP_RANKINGS = {}; TOWNSHIP_RANKING_DATA = {}; 
    SUBJECTS.forEach(subject => {
        let rankingData = [];
        Object.keys(TEACHER_STATS).forEach(teacher => {
            if (TEACHER_STATS[teacher][subject]) { const data = TEACHER_STATS[teacher][subject]; rankingData.push({ name: teacher, type: 'teacher', subject: subject, avg: parseFloat(data.avg) || 0, excellentRate: data.excellentRate || 0, passRate: data.passRate || 0, studentCount: data.studentCount }); }
        });
        Object.keys(SCHOOLS).forEach(school => {
            if (school !== MY_SCHOOL && SCHOOLS[school].metrics[subject]) { const metrics = SCHOOLS[school].metrics[subject]; rankingData.push({ name: school, type: 'school', subject: subject, avg: parseFloat(metrics.avg) || 0, excellentRate: metrics.excRate || 0, passRate: metrics.passRate || 0, studentCount: metrics.count }); }
        });
        rankingData.sort((a, b) => b.avg - a.avg); rankingData.forEach((item, index) => item.rankAvg = index + 1);
        rankingData.sort((a, b) => b.excellentRate - a.excellentRate); rankingData.forEach((item, index) => item.rankExc = index + 1);
        rankingData.sort((a, b) => b.passRate - a.passRate); rankingData.forEach((item, index) => item.rankPass = index + 1);
        rankingData.sort((a, b) => b.avg - a.avg);
        rankingData.forEach(item => { if (item.type === 'teacher') { if (!TEACHER_TOWNSHIP_RANKINGS[item.name]) TEACHER_TOWNSHIP_RANKINGS[item.name] = {}; TEACHER_TOWNSHIP_RANKINGS[item.name][subject] = { avg: item.avg, rankAvg: item.rankAvg, excellentRate: item.excellentRate, rankExc: item.rankExc, passRate: item.passRate, rankPass: item.rankPass, rank: item.rankAvg }; } });
        TOWNSHIP_RANKING_DATA[subject] = rankingData;
    });
}

function renderTeacherCards() {
    // Alpine 可能未加载，需保护
    if (!window.Alpine || !Alpine.store) {
        console.warn('Alpine 未加载，跳过教师卡片渲染');
        return;
    }
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    const stats = getVisibleTeacherStats();
    const rankings = (role === 'teacher' || role === 'class_teacher') ? {} : TEACHER_TOWNSHIP_RANKINGS;
    Alpine.store('teacherData').update(stats, rankings);
}

function calculatePerformanceLevel(teacherData) {
    const avg = parseFloat(teacherData.avg), excellentRate = teacherData.excellentRate * 100, passRate = teacherData.passRate * 100;
    if (avg >= 85 && excellentRate >= 30 && passRate >= 90) return { class: 'performance-excellent', text: '优秀' };
    else if (avg >= 80 && excellentRate >= 25 && passRate >= 85) return { class: 'performance-good', text: '良好' };
    else if (avg >= 75 && excellentRate >= 20 && passRate >= 80) return { class: 'performance-average', text: '中等' };
    else return { class: 'performance-poor', text: '需改进' };
}

// [修改] 渲染教师详细对比表 (增加贡献值、增值、低分率等列)
function renderTeacherComparisonTable() {
        const user = getCurrentUser();
        const role = user?.role || 'guest';
        if (role === 'teacher' || role === 'class_teacher') {
            const container = document.getElementById('teacherComparisonTable');
            if (container) container.innerHTML = '<p style="text-align:center; color:#999;">当前角色无权限查看教师对比数据</p>';
            return;
        }
    const container = document.getElementById('teacherComparisonTable');
    if (Object.keys(TEACHER_STATS).length === 0) { 
        container.innerHTML = '<p style="text-align: center; color: #666;">暂无教师统计数据</p>'; return; 
    }

    // 1. 准备数据
    const subjectTeachers = {};
    Object.keys(TEACHER_STATS).forEach(teacher => {
        Object.keys(TEACHER_STATS[teacher]).forEach(subject => {
            if (!subjectTeachers[subject]) subjectTeachers[subject] = [];
            subjectTeachers[subject].push({ 
                teacher, 
                data: TEACHER_STATS[teacher][subject] 
            });
        });
    });

    // 2. 构建 HTML (已移除增值列)
    let tableHtml = `
    <thead>
        <tr>
            <th rowspan="2">教师</th>
            <th rowspan="2">班级</th>
            <th rowspan="2">人数</th>
            <th colspan="2" style="background:#e0f2fe; color:#0369a1;">教学实绩</th>
            <th colspan="3" style="background:#dcfce7; color:#166534;">三率指标</th>
            <th style="background:#fef9c3; color:#b45309;">考核</th>
        </tr>
        <tr>
            <th>均分</th>
            <th>贡献值</th>
            <th>优秀率</th>
            <th>及格率</th>
            <th>低分率</th>
            <th title="综合绩效分">绩效分</th>
        </tr>
    </thead>
    <tbody>`;

    const existingSubjects = Object.keys(subjectTeachers).sort(sortSubjects);
    
    existingSubjects.forEach(subject => {
        tableHtml += `<tr style="background:#f1f5f9; font-weight:bold; color:#64748b;"><td colspan="9" style="text-align:left; padding-left:15px;">📘 ${subject}</td></tr>`;
        const arr = subjectTeachers[subject].sort((a,b) => b.data.finalScore - a.data.finalScore);

        arr.forEach((item, idx) => {
            const d = item.data;
            const contribClass = d.contribution >= 0 ? 'text-green' : 'text-red';
            const contribSign = d.contribution >= 0 ? '+' : '';
            const lowStyle = d.lowRate > 0.1 ? 'color:red; font-weight:bold;' : 'color:#333;';

            tableHtml += `
            <tr>
                <td><strong>${item.teacher}</strong></td>
                <td>${d.classes}</td>
                <td>${d.studentCount}</td>
                
                <td style="font-weight:bold;">${d.avg}</td>
                <td class="${contribClass}" style="font-weight:bold;">${contribSign}${d.contribution}</td>
                
                <td>${(d.excellentRate * 100).toFixed(1)}%</td>
                <td>${(d.passRate * 100).toFixed(1)}%</td>
                <td style="${lowStyle}">${(d.lowRate * 100).toFixed(1)}%</td>
                
                <td style="background:#fffbeb; font-weight:bold; color:#b45309; font-size:1.1em;">${d.finalScore}</td>
            </tr>`;
        });
    });

    tableHtml += `</tbody>`;
    container.innerHTML = `<table class="comparison-table">${tableHtml}</table>`;
}


function renderTeacherTownshipRanking() {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        const container = document.getElementById('teacher-township-ranking-container');
        const sideNavTeacherRanks = document.getElementById('side-nav-teacher-ranks-container');
        if (container) container.innerHTML = '<p style="text-align:center; color:#999;">当前角色无权限查看乡镇排名</p>';
        if (sideNavTeacherRanks) sideNavTeacherRanks.innerHTML = '';
        return;
    }
    const container = document.getElementById('teacher-township-ranking-container');
    const sideNavTeacherRanks = document.getElementById('side-nav-teacher-ranks-container'); sideNavTeacherRanks.innerHTML = '';
    if (!TOWNSHIP_RANKING_DATA || Object.keys(TOWNSHIP_RANKING_DATA).length === 0) { container.innerHTML = '<p style="text-align: center; color: #666;">暂无教师乡镇排名数据</p>'; return; }
    const townshipAverages = {};
    SUBJECTS.forEach(subject => {
        let totalAvg = 0, totalExc = 0, totalPass = 0, count = 0;
        Object.keys(SCHOOLS).forEach(school => { if (school !== MY_SCHOOL && SCHOOLS[school].metrics[subject]) { const metrics = SCHOOLS[school].metrics[subject]; totalAvg += metrics.avg; totalExc += metrics.excRate; totalPass += metrics.passRate; count++; } });
        if (count > 0) townshipAverages[subject] = { avg: totalAvg / count, excRate: totalExc / count, passRate: totalPass / count };
    });
    let htmlAll = '';
    SUBJECTS.forEach(subject => {
        const rankingData = TOWNSHIP_RANKING_DATA[subject]; if (!rankingData || rankingData.length === 0) return;
        const townshipAvg = townshipAverages[subject] || { avg: 0, excRate: 0, passRate: 0 }; let tbodyHtml = '';
        rankingData.forEach((item) => {
            const avgComparison = townshipAvg.avg ? ((item.avg - townshipAvg.avg) / townshipAvg.avg * 100).toFixed(2) : 0; const excComparison = townshipAvg.excRate ? ((item.excellentRate - townshipAvg.excRate) / townshipAvg.excRate * 100).toFixed(2) : 0; const passComparison = townshipAvg.passRate ? ((item.passRate - townshipAvg.passRate) / townshipAvg.passRate * 100).toFixed(2) : 0; const typeClass = item.type === 'teacher' ? 'text-blue' : ''; const typeText = item.type === 'teacher' ? '教师' : '学校';
            tbodyHtml += `<tr><td class="${typeClass}">${item.name}</td><td>${typeText}</td><td>${formatRankDisplay(item.avg, item.rankAvg, 'teacher')}</td><td class="${avgComparison >= 0 ? 'positive-percent' : 'negative-percent'}">${avgComparison >= 0 ? '+' : ''}${avgComparison}%</td><td>${item.rankAvg}</td><td>${formatRankDisplay(item.excellentRate, item.rankExc, 'teacher', true)}</td><td class="${excComparison >= 0 ? 'positive-percent' : 'negative-percent'}">${excComparison >= 0 ? '+' : ''}${excComparison}%</td><td>${item.rankExc}</td><td>${formatRankDisplay(item.passRate, item.rankPass, 'teacher', true)}</td><td class="${passComparison >= 0 ? 'positive-percent' : 'negative-percent'}">${passComparison >= 0 ? '+' : ''}${passComparison}%</td><td>${item.rankPass}</td></tr>`;
        });
        const anchorId = `rank-anchor-${subject}`; htmlAll += `<div id="${anchorId}" class="anchor-target" style="padding-top:20px;"><div class="sub-header">🏅 ${subject} 教师乡镇排名 <span style="font-size:12px; font-weight:normal; margin-left:10px;">(含外校整体数据)</span></div><div class="table-wrap"><table class="comparison-table"><thead><tr><th>教师/学校</th><th>类型</th><th>平均分</th><th>与镇均比</th><th>镇排</th><th>优秀率</th><th>与镇均比</th><th>镇排</th><th>及格率</th><th>与镇均比</th><th>镇排</th></tr></thead><tbody>${tbodyHtml}</tbody></table></div></div>`;
        const navLink = document.createElement('a'); navLink.className = 'side-nav-sub-link'; navLink.innerText = subject; navLink.onclick = () => scrollToSubAnchor(anchorId, navLink); sideNavTeacherRanks.appendChild(navLink);
    });
    container.innerHTML = htmlAll;
}

function showTeacherDetails(teacher, subject) {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' && normalizeTeacherName(teacher) !== normalizeTeacherName(user?.name)) {
        return alert('⛔ 权限不足：仅可查看本人数据');
    }
    if (role === 'class_teacher' && user?.class) {
        const key = `${user.class}_${subject}`;
        if (TEACHER_MAP && TEACHER_MAP[key] && normalizeTeacherName(TEACHER_MAP[key]) !== normalizeTeacherName(teacher)) {
            return alert('⛔ 权限不足：仅可查看本班任课教师');
        }
    }
    const stats = getVisibleTeacherStats();
    const data = stats[teacher] ? stats[teacher][subject] : null; if (!data) return;
    document.getElementById('modalTeacherName').textContent = `${teacher} - ${subject} 教学详情`;
    document.getElementById('modalAvgScore').textContent = data.avg; document.getElementById('modalExcellentRate').textContent = (data.excellentRate * 100).toFixed(2) + '%'; document.getElementById('modalPassRate').textContent = (data.passRate * 100).toFixed(2) + '%';
    const subjectAvg = THRESHOLDS[subject] ? (THRESHOLDS[subject].exc + THRESHOLDS[subject].pass) / 2 : 0; const avgComparison = subjectAvg ? ((parseFloat(data.avg) - subjectAvg) / subjectAvg * 100).toFixed(1) : 0;
    document.getElementById('modalAvgComparison').textContent = (avgComparison >= 0 ? '+' : '') + avgComparison + '%';
    const avgProgress = Math.min(Math.max(50 + (avgComparison / 2), 0), 100);
    document.getElementById('modalAvgProgress').style.width = avgProgress + '%'; document.getElementById('modalAvgProgress').className = avgComparison >= 0 ? 'progress-good' : 'progress-poor'; document.getElementById('modalAvgProgress').style.backgroundColor = avgComparison >= 0 ? '#22c55e' : '#ef4444';
    const tableBody = document.querySelector('#modalSubjectTable tbody');
    tableBody.innerHTML = `<tr><td>${subject}</td><td>${data.avg}</td><td class="${avgComparison >= 0 ? 'positive-percent' : 'negative-percent'}">${avgComparison >= 0 ? '+' : ''}${avgComparison}%</td><td>${(data.excellentRate * 100).toFixed(2)}%</td><td>-</td><td>${(data.passRate * 100).toFixed(2)}%</td><td>-</td></tr>`;
    document.getElementById('teacherModal').style.display = 'flex';
}

document.getElementById('closeModal').addEventListener('click', () => document.getElementById('teacherModal').style.display = 'none');
window.addEventListener('click', (e) => { if (e.target === document.getElementById('teacherModal')) document.getElementById('teacherModal').style.display = 'none'; });
