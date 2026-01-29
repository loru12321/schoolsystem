// 批量 AI 评语生成

// 1. 打开面板并初始化
function openBatchAIModal() {
    if (AI_DISABLED) return aiDisabledAlert();
    const sch = document.getElementById('sel-school').value; 
    const cls = document.getElementById('sel-class').value;
    if (!sch || sch.includes('请选择') || !cls || cls.includes('请选择')) {
        return alert("请先在上方【成绩单生成器】区域选择具体的【学校】和【班级】！");
    }
    document.getElementById('batch-ai-workspace').classList.remove('hidden');
    document.getElementById('batch-ai-workspace').scrollIntoView({behavior: "smooth"});
    
    // 初始化列表预览
    const students = SCHOOLS[sch].students.filter(s => s.class === cls).sort((a,b)=>b.total - a.total);
    const tbody = document.querySelector('#batch-ai-table tbody');
    tbody.innerHTML = '';
    
    students.forEach(s => {
        const key = `${s.school}_${s.class}_${s.name}`;
        const hasComment = BATCH_AI_CACHE[key];
        const statusIcon = hasComment ? '✅' : '⚪';
        const commentPreview = hasComment ? hasComment : '<span style="color:#ccc">等待生成...</span>';
        
        tbody.innerHTML += `
            <tr id="row-${key.replace(/\s+/g, '')}">
                <td class="status-cell">${statusIcon}</td>
                <td>${s.name}</td>
                <td>${safeGet(s, 'ranks.total.township', '-')}</td>
                <td class="comment-cell" style="text-align:left; white-space:normal;">${commentPreview}</td>
                <td><button class="btn btn-gray btn-sm" style="padding:2px 5px; font-size:10px;" onclick="regenerateOneAI('${key}')">重试</button></td>
            </tr>
        `;
    });
    updateBatchProgress(0, students.length);
}

// 2. 更新进度条
function updateBatchProgress(current, total) {
    const pct = total === 0 ? 0 : (current / total) * 100;
    document.getElementById('batch-ai-progress').style.width = `${pct}%`;
    document.getElementById('batch-ai-progress-text').innerText = `${current} / ${total}`;
}

function buildStudentPrompt(stu) {
    // 1. 获取基础上下文
    const totalStudents = RAW_DATA.length;
    const rank = safeGet(stu, 'ranks.total.township', 0);
    
    // 防止除以0
    const pct = totalStudents > 0 ? (rank / totalStudents * 100).toFixed(1) : 0;
    
    // 2. 进退步数据 (RAG: 检索历史)
    // 使用之前定义的新辅助函数 findPreviousRecord
    const prevStu = findPreviousRecord(stu); 
    let trendInfo = "（本次无历史对比数据）";
    
    if (prevStu) {
        const rankDiff = prevStu.townRank - rank; // 正数=进步 (名次变小)
        const scoreDiff = stu.total - prevStu.total; // 正数=涨分
        
        // 构造一段自然语言描述，喂给 AI
        let evalStr = "";
        if (Math.abs(rankDiff) < 10) evalStr = "发挥十分稳定";
        else if (rankDiff >= 10) evalStr = "进步非常显著！";
        else evalStr = "名次出现滑坡，需查找原因";

        trendInfo = `
        【历史对比情况】：
        - 相比上次考试，总分变化：${scoreDiff > 0 ? '+' : ''}${scoreDiff.toFixed(1)}分。
        - 排名变化：${rankDiff > 0 ? '进步了' : '退步了'} ${Math.abs(rankDiff)} 名。
        - 稳定性评价：${evalStr}。
        `;
    }

    // 3. 构建学科强弱项 (基于 Z-Score 或 均分差)
    let strengths = [];
    let weaknesses = [];
    
    SUBJECTS.forEach(sub => {
        const score = stu.scores[sub];
        if (score === undefined) return;
        
        // 简单计算全镇均分
        const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        const avg = allScores.length ? (allScores.reduce((a,b)=>a+b,0)/allScores.length) : 0;
        
        const diff = score - avg;
        // 阈值：高于均分15分算强，低于10分算弱
        if (diff >= 15) strengths.push(sub);
        else if (diff <= -10) weaknesses.push(sub);
    });

    const strengthStr = strengths.length > 0 ? strengths.join("、") : "各科较均衡";
    const weakStr = weaknesses.length > 0 ? weaknesses.join("、") : "无明显短板";

    // 4. 组合最终 Prompt
    return `
    # Role
    你是一位经验丰富、数据驱动且充满人文关怀的初中班主任。请根据学生的成绩单和进退步情况，写一段简短的学情诊断。

    # Data Context
    姓名：${stu.name}
    当前排名：${rank}/${totalStudents} (前${pct}%)
    优势学科：${strengthStr}
    待提升学科：${weakStr}
    ${trendInfo}
    
    # Requirements
    1. **直面进退步**：如果存在历史数据，评语的第一句必须点评进退步情况（如“恭喜你，排名大幅上升”或“本次考试稍有遗憾，名次有所下滑”）。
    2. **归因分析**：
       - 如果退步，请温和地建议关注[待提升学科]。
       - 如果进步，请肯定[优势学科]的贡献。
    3. **语气风格**：类似 Windows Fluent Design 的理念——清晰、现代、不啰嗦，但充满温度。
    4. **字数限制**：150字左右，分段显示，不要长篇大论。
    `;
}

// 4. 停止生成
function stopBatchAI() {
    if (AI_DISABLED) return aiDisabledAlert();
    IS_BATCH_AI_RUNNING = false;
    document.getElementById('btn-start-batch-ai').classList.remove('hidden');
    document.getElementById('btn-stop-batch-ai').classList.add('hidden');
}

// 5. 开始批量生成 (核心循环)
async function startBatchAIComments() {
    if (AI_DISABLED) return aiDisabledAlert();
    if (!LLM_CONFIG.apiKey) return alert("请先在【数据中心 -> AI 配置】中设置 API Key");
    const sch = document.getElementById('sel-school').value; 
    const cls = document.getElementById('sel-class').value;
    const students = SCHOOLS[sch].students.filter(s => s.class === cls).sort((a,b)=>b.total - a.total);
    const interval = (parseFloat(document.getElementById('batch-ai-interval').value) || 3) * 1000;

    IS_BATCH_AI_RUNNING = true;
    document.getElementById('btn-start-batch-ai').classList.add('hidden');
    document.getElementById('btn-stop-batch-ai').classList.remove('hidden');

    let processedCount = 0;
    for (let i = 0; i < students.length; i++) {
        if (!IS_BATCH_AI_RUNNING) break;
        const s = students[i];
        const key = `${s.school}_${s.class}_${s.name}`;
        const rowId = `row-${key.replace(/\s+/g, '')}`;
        const row = document.getElementById(rowId);
        
        if (BATCH_AI_CACHE[key]) { processedCount++; updateBatchProgress(processedCount, students.length); continue; }

        if(row) { row.querySelector('.status-cell').innerHTML = '⏳'; row.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

        const prompt = buildStudentPrompt(s);
        try {
            let aiResponse = "";
            await new Promise((resolve) => {
                callLLM(prompt, null, (fullText) => { aiResponse = fullText; resolve(); });
            });
            if (aiResponse && !aiResponse.includes("失败")) {
                BATCH_AI_CACHE[key] = aiResponse;
                if(row) { row.querySelector('.status-cell').innerHTML = '✅'; row.querySelector('.comment-cell').innerText = aiResponse; }
            } else { if(row) row.querySelector('.status-cell').innerHTML = '❌'; }
        } catch (e) { if(row) row.querySelector('.status-cell').innerHTML = '❌'; }

        processedCount++; updateBatchProgress(processedCount, students.length);
        if (i < students.length - 1 && IS_BATCH_AI_RUNNING) await new Promise(r => setTimeout(r, interval));
    }
    stopBatchAI(); alert("批量生成任务结束！");
}

// 6. 单个重试
function regenerateOneAI(key) {
    if (AI_DISABLED) return aiDisabledAlert();
    const [sch, cls, name] = key.split('_');
    const stu = SCHOOLS[sch].students.find(s => s.name === name && s.class === cls);
    if(!stu) return;
    delete BATCH_AI_CACHE[key];
    const rowId = `row-${key.replace(/\s+/g, '')}`;
    const row = document.getElementById(rowId);
    if(row) { row.querySelector('.status-cell').innerHTML = '⏳'; row.querySelector('.comment-cell').innerText = "重试中..."; }
    callLLM(buildStudentPrompt(stu), null, (fullText) => {
        if(fullText && !fullText.includes("失败")) {
            BATCH_AI_CACHE[key] = fullText;
            if(row) { row.querySelector('.status-cell').innerHTML = '✅'; row.querySelector('.comment-cell').innerText = fullText; }
        } else { if(row) row.querySelector('.comment-cell').innerText = "生成失败"; }
    });
}

// 7. 导出评语 Excel
function exportAICommentsExcel() {
    if (AI_DISABLED) return aiDisabledAlert();
    const sch = document.getElementById('sel-school').value; 
    const cls = document.getElementById('sel-class').value;
    if (!sch || !cls) return alert("无选中班级");
    const wb = XLSX.utils.book_new();
    const data = [['学校', '班级', '姓名', '总分', '评语']];
    const students = SCHOOLS[sch].students.filter(s => s.class === cls).sort((a,b)=>b.total - a.total);
    students.forEach(s => {
        const key = `${s.school}_${s.class}_${s.name}`;
        data.push([s.school, s.class, s.name, s.total, BATCH_AI_CACHE[key] || ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(data); ws['!cols'] = [{wch:15}, {wch:10}, {wch:10}, {wch:8}, {wch:80}];
    XLSX.utils.book_append_sheet(wb, ws, "AI评语导出");
    XLSX.writeFile(wb, `${sch}_${cls}_AI评语.xlsx`);
}
