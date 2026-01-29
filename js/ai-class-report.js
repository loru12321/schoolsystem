// AI 班级诊断报告

// 5. [新功能] 班级弱项深度诊断报告
async function generateClassDiagnosisReport() {
    if (AI_DISABLED) return aiDisabledAlert();
    const sch = document.getElementById('classCompSchoolSelect').value;
    if (!sch || !SCHOOLS[sch]) return alert("请先在左侧选择学校，并点击【开始对比】生成数据基础。");
    
    // A. 准备数据上下文
    const schoolData = SCHOOLS[sch];
    const classNames = [...new Set(schoolData.students.map(s => s.class))].sort();
    
    // 构建提示词 (Prompt Engineering)
    let prompt = `你是一位拥有20年经验的资深教务主任。请根据以下 ${sch} 的班级成绩数据，撰写一份深度的“班级弱项诊断与提升方案”。
    
【全校基准数据】：
- 全校均分: ${schoolData.metrics.total.avg.toFixed(1)}
- 全校优秀率: ${(schoolData.metrics.total.excRate*100).toFixed(1)}%

【各班级详细表现】：
`;
    classNames.forEach(cls => {
        const stus = schoolData.students.filter(s => s.class === cls);
        const n = stus.length;
        const avg = stus.reduce((a,b)=>a+b.total,0)/n;
        const exc = stus.filter(s=>s.total>=THRESHOLDS.total.exc).length/n;
        
        // 寻找该班的最差学科 (与年级均分差距最大)
        let worstSub = {name:'', diff: 999};
        SUBJECTS.forEach(sub => {
            const subScores = stus.map(s=>s.scores[sub]).filter(v=>v!==undefined);
            if(subScores.length === 0) return;
            const subAvg = subScores.reduce((a,b)=>a+b,0)/subScores.length;
            const gradeSubAvg = schoolData.metrics[sub].avg;
            const diff = subAvg - gradeSubAvg; // 负数表示落后
            if(diff < worstSub.diff) { worstSub = {name:sub, diff:diff}; }
        });

        prompt += `- ${cls}班(${n}人): 总分均分${avg.toFixed(1)} (与年级差 ${(avg - schoolData.metrics.total.avg).toFixed(1)}), 优秀率${(exc*100).toFixed(1)}%。最明显的短板学科是【${worstSub.name}】(低于年级均分 ${Math.abs(worstSub.diff).toFixed(1)} 分)。\n`;
    });

    prompt += `
\n请输出一份诊断报告，包含以下部分（请使用Markdown格式）：
1. **年级整体学情综述**：简要评价校内两极分化情况。
2. **重点关注班级**：指出1-2个均分落后或学科短板最严重的班级，语气要客观严厉。
3. **学科攻坚建议**：针对出现的共性弱势学科（或某班的特别弱项），给出具体的教学干预措施（如集体备课、分层作业、培优辅差等）。
4. **给班主任的管理建议**：如何调动班级学风。

要求：条理清晰，语气专业，字数 400-500 字。不要罗列数字，直接给出定性分析和可执行的建议。`;

    // B. 创建/显示弹窗
    const modalId = 'ai-class-report-modal';
    let modal = document.getElementById(modalId);
    if(!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:800px; display:flex; flex-direction:column; max-height:85vh;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #eee; padding-bottom:10px;">
                    <h3 style="color:var(--primary)"><i class="ti ti-brain"></i> AI 班级诊断报告</h3>
                    <button onclick="document.getElementById('${modalId}').style.display='none'" style="border:none;background:none;font-size:20px;cursor:pointer;">&times;</button>
                </div>
                <div id="ai-class-report-content" style="background:#f8fafc; padding:20px; border-radius:8px; line-height:1.6; flex:1; overflow-y:auto; white-space:pre-wrap; font-family: sans-serif;">🤔 正在通过 ${LLM_CONFIG.source==='local'?'本地显卡':'云端 API'} 进行深度分析，请稍候...</div>
                <div style="margin-top:15px; text-align:right; padding-top:10px; border-top:1px solid #eee;">
                    <button class="btn btn-gray" onclick="document.getElementById('${modalId}').style.display='none'">关闭</button>
                    <button class="btn btn-blue" onclick="navigator.clipboard.writeText(document.getElementById('ai-class-report-content').innerText); alert('已复制')">📋 复制报告</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    
    const contentBox = document.getElementById('ai-class-report-content');
    contentBox.innerHTML = '<div style="text-align:center; padding:30px;"><span class="loader-spinner" style="width:30px;height:30px;display:inline-block;vertical-align:middle;"></span><br><br>正在思考中...<br><span style="font-size:12px;color:#666">引擎: ' + (LLM_CONFIG.source==='local'?'WebLLM (本地)':'Cloud API') + '</span></div>';

    // C. 执行调用
    try {
        let fullText = "";
        await callUnifiedAI(prompt, (chunk) => {
            if (fullText === "") contentBox.innerHTML = ""; // 收到第一个字时清除loading
            fullText += chunk;
            contentBox.innerHTML = fullText; // 实时打字机效果
            contentBox.scrollTop = contentBox.scrollHeight; // 自动滚动到底部
        });
    } catch (e) {
        contentBox.innerHTML = `<div style="color:red; text-align:center; padding:20px;">
            <h3>🚫 分析失败</h3>
            <p>${e.message}</p>
            <p style="font-size:12px; color:#666;">如果是本地模式，请确保模型已加载且显存充足。</p>
        </div>`;
    }
}
