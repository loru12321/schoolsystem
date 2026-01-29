// ================== 考后座位微调 (联动版) ==================
function updateSeatAdjSelects() {
    const schSel = document.getElementById('seatAdjSchoolSelect'); 
    const clsSel = document.getElementById('seatAdjClassSelect');
    
    // 初始化学校下拉框
    schSel.innerHTML = '<option value="">--请选择学校--</option>';
    clsSel.innerHTML = '<option value="">--请选择班级--</option>';
    
    Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`);
    
    // 学校变更 -> 更新班级
    schSel.onchange = () => {
        clsSel.innerHTML = '<option value="">--班级--</option>';
        if(schSel.value && SCHOOLS[schSel.value]) {
            const classes = [...new Set(SCHOOLS[schSel.value].students.map(s => s.class))].sort();
            classes.forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`);
        }
        // 清空学生列表
        CURRENT_CONTEXT_STUDENTS = []; 
        updateConstraintWidgetsContext('adj'); // 立即更新一次，清空下拉框
    };
    
    // 班级变更 -> 更新学生名单 (核心修复点)
    clsSel.onchange = () => { 
        updateConstraintWidgetsContext('adj'); 
    };
}
