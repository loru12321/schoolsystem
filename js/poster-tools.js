// 初始化下拉框 (当切换到此 Tab 时调用)
function updatePosterSelects() {
    const schSel = document.getElementById('posterSchoolSelect');
    const subSel = document.getElementById('posterSubjectSelect');
    
    schSel.innerHTML = '<option value="">--请选择学校--</option>';
    Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`);
    
    // 填充科目 (保留总分选项)
    subSel.innerHTML = '<option value="total">🏆 总分光荣榜</option>';
    SUBJECTS.forEach(s => subSel.innerHTML += `<option value="${s}">📘 ${s}单科状元</option>`);
    
    // 默认触发一次班级更新
    updatePosterClassSelect();
}

function updatePosterClassSelect() {
    const sch = document.getElementById('posterSchoolSelect').value;
    const clsSel = document.getElementById('posterClassSelect');
    clsSel.innerHTML = '<option value="">全校排名</option>';
    
    if(sch && SCHOOLS[sch]) {
        const classes = [...new Set(SCHOOLS[sch].students.map(s => s.class))].sort();
        classes.forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`);
    }
}

function setPosterTheme(themeName, btn) {
    const canvas = document.getElementById('poster-canvas');
    // 移除旧主题
    canvas.classList.remove('theme-red', 'theme-blue', 'theme-tech');
    // 添加新主题
    canvas.classList.add(`theme-${themeName}`);
    
    // 更新按钮状态
    const btns = btn.parentNode.querySelectorAll('.thumb-btn');
    btns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function renderPoster() {
    const sch = document.getElementById('posterSchoolSelect').value;
    const cls = document.getElementById('posterClassSelect').value;
    const sub = document.getElementById('posterSubjectSelect').value;
    const limit = parseInt(document.getElementById('posterCount').value) || 10;
    const customTitle = document.getElementById('posterTitleInput').value;
    const customSub = document.getElementById('posterSubInput').value;

    if(!sch) return alert("请先选择学校");

    // 1. 筛选数据
    let students = SCHOOLS[sch].students;
    if(cls) students = students.filter(s => s.class === cls);
    
    // 2. 排序数据
    const getScore = (s) => (sub === 'total') ? s.total : (s.scores[sub] || -1);
    
    // 过滤掉没成绩的
    let list = students.filter(s => getScore(s) >= 0);
    list.sort((a,b) => getScore(b) - getScore(a));
    
    // 截取前N名
    list = list.slice(0, limit);

    // 3. 更新标题
    const canvas = document.getElementById('poster-canvas');
    canvas.querySelector('.p-title').innerText = customTitle;
    canvas.querySelector('.p-sub').innerText = customSub || `${sch} ${cls||'全年级'} ${sub==='total'?'总分':sub}前${limit}名`;

    // 4. 渲染列表
    const container = document.getElementById('poster-list-container');
    let html = '';
    
    if(list.length === 0) {
        html = '<div style="text-align:center; padding:50px;">暂无数据</div>';
    } else {
        list.forEach((s, i) => {
            const scoreVal = getScore(s);
            // 仅在前3名显示特殊图标，其他显示数字
            let rankDisplay = i + 1;
            // 为了通用性，这里用纯数字+CSS样式控制
            
            html += `
            <div class="p-item">
                <div class="p-rank">${rankDisplay}</div>
                <div class="p-name">
                    ${s.name} <span style="font-size:0.8em; opacity:0.8; font-weight:normal;">(${s.class})</span>
                </div>
                <div class="p-score">${scoreVal}</div>
            </div>`;
        });
    }
    container.innerHTML = html;
}

function downloadPoster() {
    const canvasDiv = document.getElementById('poster-canvas');
    if(!canvasDiv) return;
    
    // 防止截图时文字被截断或错位，先临时锁定宽高
    const originalTransform = canvasDiv.style.transform;
    canvasDiv.style.transform = "none"; // 确保无缩放
    
    alert("🖼️ 正在生成高清图片，请稍候...");
    
    setTimeout(() => {
        html2canvas(canvasDiv, {
            scale: 2, // 2倍高清
            useCORS: true,
            backgroundColor: null, // 透明背景
            logging: false
        }).then(canvas => {
            // 恢复样式
            if(originalTransform) canvasDiv.style.transform = originalTransform;
            
            // 下载
            const link = document.createElement('a');
            link.download = `光荣榜_${new Date().getTime()}.png`;
            link.href = canvas.toDataURL("image/png");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }).catch(err => {
            alert("生成失败: " + err.message);
        });
    }, 200);
}
