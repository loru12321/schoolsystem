// ================= 教师配置与分析 =================
function updateSchoolSelect() {
    const sel = document.getElementById('sel-school');
    sel.innerHTML = '<option>--请选择学校--</option>';
    Object.keys(SCHOOLS).forEach(n => sel.innerHTML += `<option>${n}</option>`);
    sel.addEventListener('change', updateClassSelect);
}

function updateMySchoolSelect() {
    // 🟢 1. 【核心修复】无条件优先刷新管理员面板的学校列表
    // 无论界面上有没有 "mySchoolSelect" 下拉框，只要数据处理完了，就必须通知账号管理器
    if(typeof Auth !== 'undefined') {
        Auth.renderSchoolCheckboxes();
    }

    // 🟢 2. 然后再处理下拉框逻辑 (如果 ID 存在的话)
    const select = document.getElementById('mySchoolSelect');

    // 如果找不到下拉框，仅仅停止处理下拉框，不要影响上面的账号列表刷新
    if (!select) return; 
    
    // 下面是原有的下拉框填充逻辑
    select.innerHTML = '<option value="">--请选择本校--</option>';
    Object.keys(SCHOOLS).forEach(school => { 
        select.innerHTML += `<option value="${school}">${school}</option>`; 
    });

    const savedSchool = localStorage.getItem('MY_SCHOOL');
    if (savedSchool && Object.keys(SCHOOLS).includes(savedSchool)) {
        MY_SCHOOL = savedSchool;
        window.MY_SCHOOL = MY_SCHOOL;
        select.value = savedSchool;
    } else if (MY_SCHOOL) {
        select.value = MY_SCHOOL;
    }
    
    // 当学校数据更新时，顺便刷新管理员面板里的“学校复选框列表” (此处旧代码已在上面第一步执行了，这里不需要重复)
    
    select.addEventListener('change', function() { 
        MY_SCHOOL = this.value; 
        window.MY_SCHOOL = MY_SCHOOL;
        if (MY_SCHOOL) localStorage.setItem('MY_SCHOOL', MY_SCHOOL);
        if (MY_SCHOOL) generateTeacherInputs(); 
        renderTables(); 
        const mySchoolInput = document.getElementById('mySchool');
        if (mySchoolInput && MY_SCHOOL) mySchoolInput.value = MY_SCHOOL;
        updateStatusPanel();
    });
}

function updateClassSelect() {
    const schoolSelect = document.getElementById('sel-school'); const classSelect = document.getElementById('sel-class');
    classSelect.innerHTML = '<option>--请先选择学校--</option>';
    if (schoolSelect.value && SCHOOLS[schoolSelect.value]) { const classes = [...new Set(SCHOOLS[schoolSelect.value].students.map(s => s.class))].sort(); classes.forEach(cls => classSelect.innerHTML += `<option>${cls}</option>`); }
}

function autoDetectMySchool() {
    const schoolNames = Object.keys(SCHOOLS || {});
    if (!schoolNames.length) return alert('请先导入成绩数据');

    // 单校直接锁定
    if (schoolNames.length === 1) {
        MY_SCHOOL = schoolNames[0];
    } else if (window.TEACHER_MAP && Object.keys(window.TEACHER_MAP).length > 0) {
        const schoolCounts = {};
        Object.keys(TEACHER_MAP).forEach(key => {
            const cls = key.split('_')[0];
            for (const sName of schoolNames) {
                if (SCHOOLS[sName].students && SCHOOLS[sName].students.some(s => s.class == cls)) {
                    schoolCounts[sName] = (schoolCounts[sName] || 0) + 1;
                    break;
                }
            }
        });
        let max = 0; let winner = '';
        for (const [s, c] of Object.entries(schoolCounts)) {
            if (c > max) { max = c; winner = s; }
        }
        if (winner) MY_SCHOOL = winner;
    }

    if (!MY_SCHOOL) return alert('未能自动识别本校，请手动选择');

    window.MY_SCHOOL = MY_SCHOOL;
    localStorage.setItem('MY_SCHOOL', MY_SCHOOL);
    const sel = document.getElementById('mySchoolSelect');
    if (sel) sel.value = MY_SCHOOL;
    const mySchoolInput = document.getElementById('mySchool');
    if (mySchoolInput) mySchoolInput.value = MY_SCHOOL;
    updateStatusPanel();
    if (window.UI) UI.toast(`✅ 已识别本校：${MY_SCHOOL}`, 'success');
}

function updateStudentSchoolSelect() {
    const select = document.getElementById('studentSchoolSelect'); 
    const classSelect = document.getElementById('studentClassSelect');
    select.innerHTML = '<option value="">--请选择本校--</option>'; 
    classSelect.innerHTML = '<option value="">全部班级</option>';
    
    Object.keys(SCHOOLS).forEach(school => { select.innerHTML += `<option value="${school}">${school}</option>`; });

    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'class_teacher') {
        const school = user.school || MY_SCHOOL || '';
        if (school) {
            select.value = school;
            select.disabled = true;
        }
        classSelect.innerHTML = '';
        classSelect.innerHTML = `<option value="${user.class}">${user.class}</option>`;
        classSelect.value = user.class;
        classSelect.disabled = true;
    } else if (role === 'teacher') {
        const school = user.school || MY_SCHOOL || '';
        if (school) {
            select.value = school;
            select.disabled = true;
        }
        const scope = getTeacherScopeForUser(user);
        classSelect.innerHTML = '<option value="">全部班级</option>';
        const classes = Array.from(scope.classes).sort();
        classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`);
    }
    
    select.addEventListener('change', function() { 
        const selectedSchool = this.value; 
        classSelect.innerHTML = '<option value="">全部班级</option>'; 
        if(selectedSchool && SCHOOLS[selectedSchool]) { 
            const classes = [...new Set(SCHOOLS[selectedSchool].students.map(s => s.class))].sort(); 
            classes.forEach(c => classSelect.innerHTML += `<option value="${c}">${c}</option>`); 
        }
        // ✋ 性能优化关键：切换学校时，重置分页并立即渲染
        renderStudentDetails(true); 
    });

    // 🟢 新增：班级切换也触发重置
    classSelect.addEventListener('change', function() {
        renderStudentDetails(true);
    });
}

function updateMarginalSchoolSelect() {
    const select = document.getElementById('marginalSchoolSelect');
    select.innerHTML = '<option value="">--请选择本校--</option>';
    Object.keys(SCHOOLS).forEach(school => select.innerHTML += `<option value="${school}">${school}</option>`);
}
