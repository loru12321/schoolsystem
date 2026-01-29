// 👤 角色/权限 + 状态面板 + 启动诊断 + 数据医生
function updateRoleHint() {
    const el = document.getElementById('role-hint');
    if (!el) return;
    const user = Auth?.currentUser;
    const role = user?.role || 'guest';
    const roleMap = {
        admin: '管理员',
        director: '教务主任',
        grade_director: '级部主任',
        class_teacher: '班主任',
        teacher: '任课教师',
        guest: '访客'
    };
    el.textContent = `角色: ${roleMap[role] || role}`;
}

function getCurrentUser() {
    return (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser : null;
}

function normalizeTeacherName(name) {
    return String(name || '').trim().replace(/\s+/g, '');
}

function getTeacherScopeForUser(user) {
    const scope = { classes: new Set(), subjects: new Set() };
    if (!user || !window.TEACHER_MAP) return scope;
    const uname = normalizeTeacherName(user.name);
    Object.entries(TEACHER_MAP).forEach(([key, teacher]) => {
        if (normalizeTeacherName(teacher) === uname) {
            const parts = key.split('_');
            const cls = normalizeClass(parts[0]);
            const sub = normalizeSubject(parts[1] || '');
            if (cls) scope.classes.add(cls);
            if (sub) scope.subjects.add(sub);
        }
    });
    return scope;
}

function canAccessModule(id) {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'admin' || role === 'director' || role === 'grade_director') return true;
    if (role === 'teacher' || role === 'class_teacher') {
        const allow = ['starter-hub', 'student-details', 'teacher-analysis', 'class-diagnosis', 'progress-analysis'];
        return allow.includes(id);
    }
    if (role === 'parent') return id === 'report-generator';
    return true;
}

function buildClassTeacherStatsForClass(className) {
    const stats = {};
    const mySchoolData = SCHOOLS[MY_SCHOOL];
    if (!mySchoolData || !className) return stats;
    Object.entries(TEACHER_MAP || {}).forEach(([key, teacherName]) => {
        const [rawClass, rawSubject] = key.split('_');
        const cls = normalizeClass(rawClass);
        if (cls !== className) return;
        const subject = normalizeSubject(rawSubject);
        const useSubject = SUBJECTS.find(s => normalizeSubject(s) === subject) || subject;
        if (!useSubject) return;
        if (!stats[teacherName]) stats[teacherName] = {};
        const students = mySchoolData.students.filter(s => s.class === cls && s.scores[useSubject] !== undefined);
        const gs = { exc: THRESHOLDS[useSubject]?.exc || 0, pass: THRESHOLDS[useSubject]?.pass || 0, low: (THRESHOLDS[useSubject]?.pass || 60) * 0.6 };
        const totalScore = students.reduce((sum, s) => sum + s.scores[useSubject], 0);
        const avg = students.length ? (totalScore / students.length).toFixed(2) : '0.00';
        const excellentCount = students.filter(s => s.scores[useSubject] >= gs.exc).length;
        const passCount = students.filter(s => s.scores[useSubject] >= gs.pass).length;
        const lowCount = students.filter(s => s.scores[useSubject] < gs.low).length;
        stats[teacherName][useSubject] = {
            classes: className,
            students: [],
            totalScore,
            avg,
            studentCount: students.length,
            excellentCount,
            passCount,
            lowCount,
            excellentRate: students.length ? excellentCount / students.length : 0,
            passRate: students.length ? passCount / students.length : 0,
            lowRate: students.length ? lowCount / students.length : 0,
            contribution: 0,
            finalScore: 0
        };
    });
    return stats;
}

function getVisibleTeacherStats() {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher') {
        const name = user?.name;
        const filtered = {};
        if (name && TEACHER_STATS[name]) filtered[name] = TEACHER_STATS[name];
        return filtered;
    }
    if (role === 'class_teacher') {
        return buildClassTeacherStatsForClass(user?.class);
    }
    return TEACHER_STATS;
}

function logAction(type, message) {
    const key = 'ACTION_LOGS';
    const logs = JSON.parse(localStorage.getItem(key) || '[]');
    logs.unshift({ time: new Date().toISOString(), type, message });
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 200)));
    renderActionLogs();
}

function renderActionLogs() {
    const list = document.getElementById('starter-log-list');
    if (!list) return;
    const logs = JSON.parse(localStorage.getItem('ACTION_LOGS') || '[]');
    if (!logs.length) {
        list.innerHTML = '<li class="log-item"><small>暂无记录</small></li>';
        return;
    }
    list.innerHTML = logs.slice(0, 30).map(l => {
        const t = new Date(l.time).toLocaleString();
        return `<li class="log-item"><strong>${l.type}</strong><small>${t}</small><span>${l.message}</span></li>`;
    }).join('');
}

function clearActionLogs() {
    localStorage.removeItem('ACTION_LOGS');
    renderActionLogs();
}

function detectSchoolMode() {
    const count = Object.keys(SCHOOLS || {}).length;
    if (!count) return '未检测';
    const mode = updateSchoolMode();
    return mode === 'single' ? '单校模式' : `多校模式(${count})`;
}

function updateSchoolMode() {
    const count = Object.keys(SCHOOLS || {}).length;
    const mode = count <= 1 ? 'single' : 'multi';
    CONFIG.mode = mode;
    document.body.dataset.schoolMode = mode;
    return mode;
}

function isSingleSchoolMode() {
    return CONFIG?.mode === 'single' || Object.keys(SCHOOLS || {}).length <= 1;
}

function applySchoolModeToTables() {
    const single = isSingleSchoolMode();
    document.querySelectorAll('table').forEach(table => {
        const headerRows = table.querySelectorAll('thead tr');
        if (!headerRows.length) return;
        const headerCells = headerRows[headerRows.length - 1].querySelectorAll('th');
        const hideIdx = [];
        headerCells.forEach((th, idx) => {
            const text = (th.innerText || '').trim();
            if (/镇排|全镇|乡镇/.test(text)) hideIdx.push(idx);
        });
        if (!hideIdx.length) return;
        table.querySelectorAll('tr').forEach(tr => {
            const cells = tr.children;
            hideIdx.forEach(i => {
                if (cells[i]) cells[i].style.display = single ? 'none' : '';
            });
        });
    });
    document.querySelectorAll('[data-township]').forEach(el => {
        el.style.display = single ? 'none' : '';
    });
}

function scanDataIssues() {
    const list = document.getElementById('starter-issue-list');
    if (!list) return;
    const issues = [];
    if (!RAW_DATA || RAW_DATA.length === 0) issues.push('未导入成绩数据');
    if (!TEACHER_MAP || Object.keys(TEACHER_MAP).length === 0) issues.push('未导入任课表');
    if (!MY_SCHOOL) issues.push('未选择本校');

    // 班级一致性
    if (RAW_DATA && RAW_DATA.length && TEACHER_MAP && Object.keys(TEACHER_MAP).length) {
        const classSet = new Set(RAW_DATA.map(s => s.class));
        const missClasses = [];
        Object.keys(TEACHER_MAP).forEach(key => {
            const cls = key.split('_')[0];
            if (!classSet.has(cls)) missClasses.push(cls);
        });
        if (missClasses.length) {
            const sample = [...new Set(missClasses)].slice(0, 5).join('、');
            issues.push(`任课表班级与成绩不匹配：${sample}`);
        }
    }

    // 学科一致性
    if (SUBJECTS && SUBJECTS.length && TEACHER_MAP && Object.keys(TEACHER_MAP).length) {
        const subjSet = new Set(SUBJECTS.map(s => normalizeSubject(s)));
        const missSubs = [];
        Object.keys(TEACHER_MAP).forEach(key => {
            const sub = normalizeSubject(key.split('_')[1] || '');
            if (sub && !subjSet.has(sub)) missSubs.push(sub);
        });
        if (missSubs.length) {
            const sample = [...new Set(missSubs)].slice(0, 5).join('、');
            issues.push(`任课表学科未出现在成绩中：${sample}`);
        }
    }

    if (!issues.length) {
        list.innerHTML = '<li class="issue-item" style="color:#15803d; background:#ecfdf5; border-color:#bbf7d0;">未发现明显异常</li>';
    } else {
        list.innerHTML = issues.map(i => `<li class="issue-item">${i}</li>`).join('');
    }
}

function manualBackup() {
    const key = localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup';
    if (typeof getCurrentSnapshotPayload === 'function') {
        DB.save(key, getCurrentSnapshotPayload());
    } else {
        DB.save(key, { RAW_DATA, SCHOOLS, SUBJECTS, THRESHOLDS, TEACHER_MAP, CONFIG, MY_SCHOOL });
    }
    localStorage.setItem('MANUAL_BACKUP_AT', new Date().toISOString());
    logAction('备份', `已备份到 ${key}`);
    if (window.UI) UI.toast('✅ 备份完成', 'success');
}

async function manualRestore() {
    const key = localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup';
    const data = await DB.get(key);
    if (!data) return alert('未找到备份数据');
    if (typeof applySnapshotPayload === 'function') {
        applySnapshotPayload(data);
    } else {
        RAW_DATA = data.RAW_DATA || [];
        SCHOOLS = data.SCHOOLS || {};
        SUBJECTS = data.SUBJECTS || [];
        THRESHOLDS = data.THRESHOLDS || {};
        setTeacherMap(data.TEACHER_MAP || {});
        CONFIG = data.CONFIG || CONFIG;
        MY_SCHOOL = data.MY_SCHOOL || MY_SCHOOL;
    }
    updateStatusPanel();
    logAction('恢复', `已从 ${key} 恢复`);
    if (window.UI) UI.toast('✅ 恢复完成', 'success');
}

function updateStatusPanel() {
    const panel = document.getElementById('starter-status-panel');
    if (!panel) return;
    const termId = localStorage.getItem('CURRENT_TERM_ID') || (typeof getTermId === 'function' ? getTermId(getExamMetaFromUI()) : '');
    const examId = CURRENT_EXAM_ID || localStorage.getItem('CURRENT_EXAM_ID') || '未选择';
    const cohortId = CURRENT_COHORT_ID || localStorage.getItem('CURRENT_COHORT_ID') || '未选择';
    const savedSchool = localStorage.getItem('MY_SCHOOL');
    if (!MY_SCHOOL && savedSchool) {
        MY_SCHOOL = savedSchool;
        window.MY_SCHOOL = MY_SCHOOL;
    }
    const mySchool = MY_SCHOOL || savedSchool || '未选择';
    const hasScores = RAW_DATA && RAW_DATA.length > 0;
    const teacherCount = window.TEACHER_MAP ? Object.keys(window.TEACHER_MAP).length : 0;
    const syncCloud = localStorage.getItem('CLOUD_SYNC_AT');
    const syncTeacher = localStorage.getItem('TEACHER_SYNC_AT');
    const syncCloudText = syncCloud ? new Date(syncCloud).toLocaleString() : '未同步';
    const syncTeacherText = syncTeacher ? new Date(syncTeacher).toLocaleString() : '未同步';
    const schoolMode = detectSchoolMode();

    const badge = (ok) => ok ? '<span class="status-badge badge-ok">已完成</span>' : '<span class="status-badge badge-warn">未完成</span>';

    panel.innerHTML = `
        <div class="status-item"><strong>当前学期</strong>${termId || '未选择'} ${badge(!!termId)}</div>
        <div class="status-item"><strong>本校</strong>${mySchool} ${badge(!!mySchool && mySchool !== '未选择')}</div>
        <div class="status-item"><strong>学校模式</strong>${schoolMode}</div>
        <div class="status-item"><strong>成绩数据</strong>${hasScores ? RAW_DATA.length + ' 条' : '未导入'} ${badge(hasScores)}</div>
        <div class="status-item"><strong>任课表</strong>${teacherCount ? teacherCount + ' 条' : '未导入'} ${badge(teacherCount > 0)}</div>
        <div class="status-item"><strong>全量云端同步</strong>${syncCloudText} ${syncCloud ? '<span class="status-badge badge-ok">已完成</span>' : '<span class="status-badge badge-err">未完成</span>'}</div>
        <div class="status-item"><strong>任课同步</strong>${syncTeacherText} ${syncTeacher ? '<span class="status-badge badge-ok">已完成</span>' : '<span class="status-badge badge-err">未完成</span>'}</div>
        <div class="status-item"><strong>届别 / 考试</strong>${cohortId} / ${examId}</div>
    `;

    const tasks = document.querySelectorAll('#starter-task-list .task-item');
    tasks.forEach(item => {
        const key = item.getAttribute('data-task');
        let done = false;
        if (key === 'term') done = !!termId && !!cohortId;
        if (key === 'scores') done = hasScores;
        if (key === 'teacher') done = teacherCount > 0;
        if (key === 'school') done = !!mySchool && mySchool !== '未选择';
        if (key === 'analysis') done = TEACHER_STATS && Object.keys(TEACHER_STATS).length > 0;
        item.classList.toggle('done', done);
    });
    renderActionLogs();
    scanDataIssues();
    updateRoleHint();
}

function openStarterGuide() {
    if (typeof Swal === 'undefined') {
        alert('新教师上手引导：\n1. 选择【届别】与【学期】\n2. 导入成绩表\n3. 导入任课表并同步\n4. 选择本校\n5. 进入教师画像查看结果');
        localStorage.setItem('HAS_SEEN_STARTER', '1');
        return;
    }
    Swal.fire({
        title: '🧭 新教师上手引导',
        html: `
            <ol style="text-align:left; line-height:1.8; font-size:13px; color:#475569;">
                <li>选择【届别】与【学期】</li>
                <li>在“数据上传与设置”导入成绩表</li>
                <li>在“教师任课”导入任课表并同步</li>
                <li>选择本校</li>
                <li>进入“教师教学质量画像”查看结果</li>
            </ol>
        `,
        confirmButtonText: '我知道了',
        confirmButtonColor: '#0ea5e9'
    });
    localStorage.setItem('HAS_SEEN_STARTER', '1');
}

async function runAutoDiagnosis() {
    const termId = localStorage.getItem('CURRENT_TERM_ID') || (typeof getTermId === 'function' ? getTermId(getExamMetaFromUI()) : '');
    const hasScores = RAW_DATA && RAW_DATA.length > 0;
    const hasTeachers = window.TEACHER_MAP && Object.keys(window.TEACHER_MAP).length > 0;
    const hasSchool = !!MY_SCHOOL;

    let cloudStatus = { text: '未连接', badge: 'badge-err' };
    if (window.sbClient) {
        try {
            const { error } = await sbClient.from('system_data').select('key').limit(1);
            cloudStatus = error ? { text: '连接成功但可能无权限', badge: 'badge-warn' } : { text: '连接正常', badge: 'badge-ok' };
        } catch (e) {
            cloudStatus = { text: '连接异常', badge: 'badge-err' };
        }
    }

    const html = `
        <div style="text-align:left; font-size:13px; color:#475569; line-height:1.8;">
            <div>学期：${termId || '未选择'} ${termId ? '<span class="status-badge badge-ok">通过</span>' : '<span class="status-badge badge-err">缺失</span>'}</div>
            <div>本校：${hasSchool ? MY_SCHOOL : '未选择'} ${hasSchool ? '<span class="status-badge badge-ok">通过</span>' : '<span class="status-badge badge-err">缺失</span>'}</div>
            <div>成绩数据：${hasScores ? RAW_DATA.length + ' 条' : '未导入'} ${hasScores ? '<span class="status-badge badge-ok">通过</span>' : '<span class="status-badge badge-err">缺失</span>'}</div>
            <div>任课表：${hasTeachers ? Object.keys(TEACHER_MAP).length + ' 条' : '未导入'} ${hasTeachers ? '<span class="status-badge badge-ok">通过</span>' : '<span class="status-badge badge-err">缺失</span>'}</div>
            <div>云端权限：${cloudStatus.text} <span class="status-badge ${cloudStatus.badge}">诊断</span></div>
        </div>
    `;

    const resultEl = document.getElementById('starter-diagnose-result');
    if (resultEl) resultEl.innerHTML = html;

    Swal.fire({
        title: '🧪 系统诊断结果',
        html,
        width: 620,
        confirmButtonText: '知道了',
        confirmButtonColor: '#4f46e5'
    });
}

async function loadDemoData() {
    // 构造简易演示数据
    const demoSchool = '示例学校';
    const classes = ['9.1', '9.2'];
    SUBJECTS = ['语文', '数学', '英语'];
    RAW_DATA = [];
    SCHOOLS = {};

    let counter = 1;
    classes.forEach(cls => {
        for (let i = 0; i < 30; i++) {
            const stu = {
                name: `演示生${String(counter++).padStart(2, '0')}`,
                school: demoSchool,
                class: cls,
                scores: {
                    '语文': 60 + Math.random() * 40,
                    '数学': 55 + Math.random() * 45,
                    '英语': 58 + Math.random() * 42
                },
                total: 0
            };
            stu.total = stu.scores['语文'] + stu.scores['数学'] + stu.scores['英语'];
            RAW_DATA.push(stu);
            if (!SCHOOLS[demoSchool]) SCHOOLS[demoSchool] = { name: demoSchool, students: [], metrics: {}, rankings: {} };
            SCHOOLS[demoSchool].students.push(stu);
        }
    });

    setTeacherMap({
        '9.1_语文': '张老师',
        '9.1_数学': '李老师',
        '9.1_英语': '王老师',
        '9.2_语文': '赵老师',
        '9.2_数学': '陈老师',
        '9.2_英语': '孙老师'
    });

    MY_SCHOOL = demoSchool;
    localStorage.setItem('CURRENT_TERM_ID', localStorage.getItem('CURRENT_TERM_ID') || '2025-2026_上学期');
    CURRENT_COHORT_ID = CURRENT_COHORT_ID || 'DEMO';
    CURRENT_EXAM_ID = CURRENT_EXAM_ID || 'DEMO_EXAM';
    localStorage.setItem('CURRENT_COHORT_ID', CURRENT_COHORT_ID);
    localStorage.setItem('CURRENT_EXAM_ID', CURRENT_EXAM_ID);
    if (window.UI) UI.toast('✅ 已加载演示数据', 'success');

    await processData();
    calculateRankings();
    analyzeTeachers();
    renderTeacherComparisonTable();
    renderTeacherCards();
    updateStatusPanel();
}

function openTeacherSync() {
    if (window.DataManager && typeof DataManager.open === 'function') {
        DataManager.open();
        DataManager.switchTab('teacher');
    } else {
        switchTab('upload');
    }
}

function getTeacherTermOptions() {
    const tmpSelect = document.getElementById('dm-teacher-term-select');
    if (tmpSelect && tmpSelect.options && tmpSelect.options.length > 0) {
        return Array.from(tmpSelect.options)
            .filter(o => o.value)
            .map(o => ({ value: o.value, label: o.textContent }));
    }

    if (window.DataManager && typeof DataManager.renderTeacherTermSelect === 'function') {
        DataManager.renderTeacherTermSelect();
    }

    const options = [];
    const db = (window.CohortDB && typeof CohortDB.ensure === 'function') ? CohortDB.ensure() : null;
    const history = db?.teachingHistory || {};
    Object.keys(history).forEach(k => {
        if (k) options.push({ value: k, label: k });
    });

    const meta = (typeof getExamMetaFromUI === 'function') ? getExamMetaFromUI() : {};
    const termId = localStorage.getItem('CURRENT_TERM_ID') || (meta.year && meta.term ? `${meta.year}_${meta.term}` : '');
    if (termId && !options.find(o => o.value === termId)) {
        options.push({ value: termId, label: termId });
    }
    return options;
}

function promptTeacherSyncIfNeeded() {
    if (localStorage.getItem('SUPPRESS_TEACHER_SYNC_PROMPT') === '1') return;
    if (sessionStorage.getItem('TEACHER_SYNC_PROMPT_SHOWN') === '1') return;
    if (window.TEACHER_MAP && Object.keys(window.TEACHER_MAP).length > 0) return;

    const opts = getTeacherTermOptions();
    if (!opts.length) return false;

    const current = localStorage.getItem('CURRENT_TERM_ID');
    const defaultValue = current || opts[0].value;

    const doSync = (termId) => {
        if (!termId) return;
        localStorage.setItem('CURRENT_TERM_ID', termId);
        const termSel = document.getElementById('dm-teacher-term-select');
        if (termSel) termSel.value = termId;
        if (window.CloudManager && CloudManager.loadTeachers) CloudManager.loadTeachers();
    };

    if (typeof Swal === 'undefined') {
        const list = opts.map(o => o.value).join('\n');
        const picked = prompt(`检测到任课表可同步，请输入学期ID：\n${list}`, defaultValue);
        if (picked) doSync(picked);
        sessionStorage.setItem('TEACHER_SYNC_PROMPT_SHOWN', '1');
        return true;
    }

    Swal.fire({
        title: '☁️ 检测到任课表可同步',
        html: `请选择学期后同步任课表到本地：<br><small style="color:#94a3b8;">本次仅同步任课表，不影响成绩数据</small>`,
        input: 'select',
        inputOptions: opts.reduce((acc, o) => (acc[o.value] = o.label, acc), {}),
        inputValue: defaultValue,
        showCancelButton: true,
        confirmButtonText: '同步到本地',
        cancelButtonText: '暂不同步',
        showDenyButton: true,
        denyButtonText: '不再提示',
        confirmButtonColor: '#0ea5e9'
    }).then((res) => {
        if (res.isConfirmed) doSync(res.value);
        if (res.isDenied) localStorage.setItem('SUPPRESS_TEACHER_SYNC_PROMPT', '1');
    });
    sessionStorage.setItem('TEACHER_SYNC_PROMPT_SHOWN', '1');
    return true;
}

function scheduleTeacherSyncPrompt() {
    if (localStorage.getItem('SUPPRESS_TEACHER_SYNC_PROMPT') === '1') return;
    sessionStorage.removeItem('TEACHER_SYNC_PROMPT_SHOWN');
    let tries = 0;
    const timer = setInterval(() => {
        tries += 1;
        const shown = promptTeacherSyncIfNeeded();
        if (shown || tries >= 10) {
            clearInterval(timer);
        }
    }, 800);
}

function runDataDoctor() {
    if (!RAW_DATA.length) return alert("请先上传数据，医生才能进行诊断！");

    let issues = [];
    let warnings = [];
    let stats = { total: RAW_DATA.length, zeroCount: 0, highCount: 0, emptyFieldCount: 0 };

    // 1. 基础字段校验 + 收集重复信息
    const nameMap = {};
    RAW_DATA.forEach((s, idx) => {
        const rowNo = s.__row || (idx + 2); // 默认第2行开始是数据

        // 必填字段检查
        if (!s.school || !s.class || !s.name) {
            stats.emptyFieldCount++;
            issues.push(`🔴 <strong>关键字段缺失：</strong> 行 ${rowNo} 学校/班级/姓名为空`);
            return;
        }

        const key = `${s.school}_${s.class}_${s.name}`;
        if (!nameMap[key]) nameMap[key] = [];
        nameMap[key].push(rowNo);
    });

    // 1.1 同班同名检测 (致命错误)
    Object.entries(nameMap).forEach(([key, rows]) => {
        if (rows.length > 1) {
            const [school, cls, name] = key.split('_');
            issues.push(`🔴 <strong>重复录入/同名：</strong> ${school} ${cls}班 "${name}" 行号: ${rows.join('、')}`);
        }
    });

    // 2. 检查异常分值 (高分/负分)
    // 假设单科满分不超过 150，总分根据科目数估算
    RAW_DATA.forEach((s, idx) => {
        const rowNo = s.__row || (idx + 2);
        if (typeof s.total === 'number' && s.total <= 0) stats.zeroCount++;
        if (s.total !== undefined && s.total !== null && isNaN(Number(s.total))) {
            issues.push(`🔴 <strong>总分非数值：</strong> 行 ${rowNo} ${s.name || '未知姓名'} (total = ${s.total})`);
        }
        
        SUBJECTS.forEach(sub => {
            const val = s.scores ? s.scores[sub] : undefined;
            if (val === undefined || val === null || val === '') {
                warnings.push(`🟠 <strong>科目缺失：</strong> 行 ${rowNo} ${s.name || '未知姓名'} 未填写 ${sub}`);
                return;
            }
            if (isNaN(Number(val))) {
                issues.push(`🔴 <strong>分数非数值：</strong> 行 ${rowNo} ${s.name || '未知姓名'} (${sub} = ${val})`);
                return;
            }
            if (Number(val) < 0) issues.push(`🔴 <strong>负分异常：</strong> 行 ${rowNo} ${s.name || '未知姓名'} (${sub} = ${val})`);
            if (Number(val) > 150) warnings.push(`🟠 <strong>超高分预警：</strong> 行 ${rowNo} ${s.name || '未知姓名'} (${sub} = ${val}) - 请确认是否录入错误？`);
        });
    });

    // 3. 检查班级人数极值 (过大或过小)
    Object.values(SCHOOLS).forEach(sch => {
        // 简单统计该校班级人数
        const clsCounts = {};
        sch.students.forEach(s => clsCounts[s.class] = (clsCounts[s.class] || 0) + 1);
        Object.entries(clsCounts).forEach(([cls, count]) => {
            if (count < 10) warnings.push(`🟠 <strong>班级人数过少：</strong> ${sch.name} ${cls} 仅 ${count} 人。`);
            if (count > 70) warnings.push(`🟠 <strong>班级人数过多：</strong> ${sch.name} ${cls} 达 ${count} 人。`);
        });
    });

    // 4. 生成报告 HTML
    let reportHtml = `<div style="text-align:left; max-height:400px; overflow-y:auto;">`;
    
    if (issues.length === 0 && warnings.length === 0) {
        reportHtml += `<div style="text-align:center; padding:20px; color:#16a34a;">
            <i class="ti ti-heart-rate-monitor" style="font-size:48px;"></i><br>
            <h3>数据非常健康！</h3>
            <p>共检测 ${stats.total} 条数据，未发现明显异常。</p>
        </div>`;
    } else {
        reportHtml += `<p>共检测 <strong>${stats.total}</strong> 名学生。</p>`;
        if (stats.emptyFieldCount > 0) {
            reportHtml += `<p style="color:#b91c1c;">关键字段缺失：<strong>${stats.emptyFieldCount}</strong> 条</p>`;
        }
        
        if (issues.length > 0) {
            reportHtml += `<h4 style="color:#dc2626; margin-top:10px;">❌ 必须处理的错误 (${issues.length})</h4>`;
            reportHtml += `<ul style="color:#b91c1c; background:#fee2e2; padding:10px 20px; border-radius:6px;">`;
            issues.slice(0, 10).forEach(i => reportHtml += `<li>${i}</li>`);
            if(issues.length > 10) reportHtml += `<li>...等共 ${issues.length} 项</li>`;
            reportHtml += `</ul>`;
        }

        if (warnings.length > 0) {
            reportHtml += `<h4 style="color:#b45309; margin-top:10px;">⚠️ 值得注意的预警 (${warnings.length})</h4>`;
            reportHtml += `<ul style="color:#92400e; background:#fffbeb; padding:10px 20px; border-radius:6px;">`;
            warnings.slice(0, 10).forEach(w => reportHtml += `<li>${w}</li>`);
            if(warnings.length > 10) reportHtml += `<li>...等共 ${warnings.length} 项</li>`;
            reportHtml += `</ul>`;
        }
    }
    reportHtml += `</div>`;

    Swal.fire({
        title: '🏥 数据体检报告',
        html: reportHtml,
        icon: issues.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success'),
        confirmButtonText: '确定',
        width: 600
    });
}

window.addEventListener('load', () => {
    // 延迟执行，确保 DOM 已经完全渲染
    setTimeout(() => {
        const modalIds = [
            'issue-submit-modal',   // 成绩核查申诉弹窗
            'admin-issue-modal',    // 管理员申诉处理弹窗
            'user-password-modal',  // 修改密码弹窗
            'account-manager-modal' // 账号管理弹窗
        ];

        modalIds.forEach(id => {
            const el = document.getElementById(id);
            // 如果元素存在，且它不是 body 的直接子元素，就移动它
            if (el && el.parentNode !== document.body) {
                console.log(`🔧 [AutoFix] 正在修复弹窗 DOM 位置: ${id}`);
                document.body.appendChild(el); // 移动到 body 末尾
            }
        });
    }, 1000); // 延迟 1 秒执行
});
