// 名单钻取系统 + 指标点击

const DrillSystem = {
    history: [], // 导航历史栈
    currentData: null, // 当前暂存数据
    exportData: null, // 🟢 新增：专门用于导出的数据缓存

    // 1. 打开入口
    open: function(title, studentList, scoreLabel = "总分") {
        this.history = []; // 清空历史
        this.currentData = { title, list: studentList, scoreLabel };
        
        // 🟢 缓存导出数据：如果是普通名单，直接缓存学生列表
        this.exportData = { type: 'list', data: studentList, fileName: title };
        
        // 🟢 显示导出按钮 (防止之前被隐藏)
        const btn = document.getElementById('drill-export-btn');
        if(btn) btn.classList.remove('hidden');

        document.getElementById('drill-modal').style.display = 'flex';
        this.renderClassView();
    },

    // 🟢 新增：通用导出功能
    exportExcel: function() {
        if (!this.exportData || !this.exportData.data) return alert("当前无数据可导出");
        
        const wb = XLSX.utils.book_new();
        let ws = null;
        const filename = (this.exportData.fileName || "导出数据") + ".xlsx";

        if (this.exportData.type === 'gap') {
            // 🅰️ 导出临界生/潜力生分析数据 (特殊表头)
            const headers = ['班级', '姓名', '当前总分', '距目标分差', '建议补救/潜力学科', '该科与年级均分差'];
            const data = [headers];
            this.exportData.data.forEach(item => {
                // 去除HTML标签 (提取纯文本)
                const cleanSub = item.worstSub.replace(/<[^>]+>/g, ""); 
                data.push([
                    item.class, 
                    item.name, 
                    item.total, 
                    item.scoreGap.toFixed(1), 
                    cleanSub, 
                    item.worstDiff
                ]);
            });
            ws = XLSX.utils.aoa_to_sheet(data);
            ws['!cols'] = [{wch:10}, {wch:10}, {wch:10}, {wch:12}, {wch:30}, {wch:15}];

        } else {
            // 🅱️ 导出普通学生名单 (如点击"达标人数"时)
            const headers = ['班级', '姓名', '考号', '总分', '全镇排名'];
            const data = [headers];
            this.exportData.data.forEach(s => {
                data.push([
                    s.class, 
                    s.name, 
                    s.id, 
                    s.total, 
                    safeGet(s, 'ranks.total.township', '-')
                ]);
            });
            ws = XLSX.utils.aoa_to_sheet(data);
        }

        XLSX.utils.book_append_sheet(wb, ws, "导出数据");
        XLSX.writeFile(wb, filename);
    },

    // 2. 渲染班级视图
    renderClassView: function() {
        const { title, list, scoreLabel } = this.currentData;
        document.getElementById('drill-title').innerText = title;
        document.getElementById('drill-back-btn').classList.add('hidden');

        // 按班级分组
        const classMap = {};
        list.forEach(s => {
            if (!classMap[s.class]) classMap[s.class] = [];
            classMap[s.class].push(s);
        });

        // 排序班级
        const classes = Object.keys(classMap).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

        let html = `<div class="drill-class-grid">`;
        classes.forEach(cls => {
            const count = classMap[cls].length;
            html += `
                <div class="drill-class-card" onclick="DrillSystem.renderStudentView('${cls}')">
                    <div class="drill-label">${cls}</div>
                    <div class="drill-val">${count} 人</div>
                    <div class="drill-label" style="font-size:10px;">点击查看名单 &gt;</div>
                </div>`;
        });
        html += `</div>`;

        if(list.length === 0) html = '<div style="text-align:center; padding:30px; color:#999;">暂无相关学生数据</div>';

        document.getElementById('drill-content').innerHTML = html;
        document.getElementById('drill-footer').innerText = `合计: ${list.length} 人`;
    },

    // 3. 渲染学生名单视图
    renderStudentView: function(className) {
        const { list, scoreLabel } = this.currentData;
        this.history.push('class_view');
        
        document.getElementById('drill-title').innerText = `${className} - 名单`;
        document.getElementById('drill-back-btn').classList.remove('hidden');

        const students = list.filter(s => s.class === className).sort((a,b) => b.total - a.total);

        let html = `<div class="drill-stu-list">`;
        students.forEach(s => {
            html += `
                <div class="drill-stu-tag">
                    <span style="cursor:pointer;" onclick="jumpToStudent('${s.name}', '${s.school}', '${s.class}'); document.getElementById('drill-modal').style.display='none';">${s.name}</span>
                    <span class="drill-stu-score">${s.total}</span>
                </div>`;
        });
        html += `</div>`;
        
        document.getElementById('drill-content').innerHTML = html;
    },

    // 4. 返回上一级
    goBack: function() {
        if (this.history.length > 0) {
            this.history.pop();
            this.renderClassView();
        }
    }
};

// 辅助：各模块的点击处理器
function handleIndicatorClick(schoolName, type) {
    if (!SCHOOLS[schoolName]) return;
    
    // 获取当前设定的划线
    const r1 = parseInt(document.getElementById('ind1').value);
    const r2 = parseInt(document.getElementById('ind2').value);
    if (!r1 || !r2) return alert("请先设置指标参数");

    const allScores = RAW_DATA.map(s => s.total).sort((a,b)=>b-a);
    const line = type === 'ind1' ? (allScores[r1-1] || 0) : (allScores[r2-1] || 0);
    const title = `${schoolName} - ${type==='ind1'?'指标一':'指标二'}达标名单 (线≥${line})`;

    // 筛选学生
    const students = SCHOOLS[schoolName].students.filter(s => s.total >= line);
    
    DrillSystem.open(title, students);
}

function handleHighClick(schoolName) {
    if (!SCHOOLS[schoolName]) return;
    // 9年级默认490，或者这里可以做成动态的
    const line = 490; 
    const students = SCHOOLS[schoolName].students.filter(s => s.total >= line);
    DrillSystem.open(`${schoolName} - 高分段(≥${line})名单`, students);
}

function handleExcludedClick(schoolName) {
    if (!SCHOOLS[schoolName]) return;
    const s = SCHOOLS[schoolName];
    // 重新计算剔除逻辑
    const sorted = [...s.students].sort((a,b) => a.total - b.total); // 升序
    const excN = s.bottom3 ? s.bottom3.excN : 0;
    
    // 取最低分的 N 个
    const students = sorted.slice(0, excN).sort((a,b) => b.total - a.total); // 展示时按分降序好看点
    
    DrillSystem.open(`${schoolName} - 后1/3核算剔除名单 (共${excN}人)`, students);
}
