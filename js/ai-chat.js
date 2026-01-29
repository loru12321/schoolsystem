function toggleAIChat() {
    if (AI_DISABLED) return aiDisabledAlert();
    const box = document.getElementById('ai-chat-box');
    box.classList.toggle('hidden');
    if(!box.classList.contains('hidden')) document.getElementById('ai-chat-input').focus();
}

function addChatBubble(html, type) {
    const container = document.getElementById('ai-chat-messages');
    const div = document.createElement('div');
    div.className = `ai-msg-bubble ${type}`;
    div.innerHTML = html;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// 1. 准备数据上下文 (合并 成绩 + 进退步 + 排名)
function prepareDataForAI() {
    if (!RAW_DATA.length) return [];
    // 建立进退步索引
    const progressMap = {};
    if (PROGRESS_CACHE && PROGRESS_CACHE.length) {
        PROGRESS_CACHE.forEach(p => {
            progressMap[p.name + '_' + p.class] = p.change; // 正数=进步
        });
    }

    return RAW_DATA.map(s => {
        return {
            name: s.name,
            school: s.school,
            class: s.class,
            total: s.total,
            scores: s.scores, // {语文:90, 数学:80...}
            townRank: safeGet(s, 'ranks.total.township', 9999),
            classRank: safeGet(s, 'ranks.total.class', 999),
            progress: progressMap[s.name + '_' + s.class] || 0 // 进退步
        };
    });
}

async function sendAIChat() {
    if (AI_DISABLED) return aiDisabledAlert();
    const input = document.getElementById('ai-chat-input');
    const query = input.value.trim();
    if (!query) return;
    
    if (!LLM_CONFIG.apiKey) {
        addChatBubble("⚠️ 请先在【数据中心】配置 AI API Key 才能使用智能查询。", "system");
        return;
    }

    addChatBubble(query, "user");
    input.value = '';
    addChatBubble("🤖 正在分析数据...", "system");

    // 2. 构建 Prompt：告诉 AI 数据结构，让它写代码
    const dataContext = prepareDataForAI();
    if (dataContext.length === 0) {
        addChatBubble("❌ 当前暂无数据，请先上传成绩。", "system");
        return;
    }

    const subjectsStr = SUBJECTS.join(',');
    const prompt = `
    你是一个数据查询生成器。
    【数据结构】
    变量名: data
    类型: Array<Student>
    Student结构: {
        name: String,
        school: String,
        class: String, // 例如 "701", "802"
        total: Number, // 总分
        scores: { "${subjectsStr}": Number }, // 各科成绩
        townRank: Number, // 全镇排名 (越小越好)
        progress: Number // 进退步 (正数=进步, 负数=退步, 0=无数据)
    }
    
    【任务】
    根据用户问题:"${query}"
    编写一段 JavaScript 代码，从 \`data\` 数组中筛选并排序，返回结果数组。
    
    【要求】
    1. 仅返回代码，不要Markdown标记，不要解释。
    2. 代码必须以 \`return data.filter(...).sort(...).slice(0, N)\` 的形式结束。
    3. 如果用户问“不及格”，默认指分数 < 60%满分（假设满分100则<60，满分120则<72）。你可自行设定阈值或简单按 < 60 处理。
    4. 结果最多返回 20 条。
    5. 只能使用 JS 标准数组方法 (filter, sort, slice, map)。
    `;

    try {
        // 3. 调用 LLM
        let jsCode = "";
        await new Promise((resolve) => {
            callLLM(prompt, null, (fullText) => { jsCode = fullText; resolve(); });
        });

        // 清洗代码 (去掉 ```javascript 等)
        jsCode = jsCode.replace(/```javascript/g, '').replace(/```/g, '').trim();
        console.log("AI Generated Code:", jsCode);

        // 4. 沙箱执行代码
        const result = executeAICode(jsCode, dataContext);
        
        // 5. 渲染结果
        renderAIChatResult(result, query);

    } catch (err) {
        console.error(err);
        addChatBubble(`❌ 查询失败: ${err.message}`, "system");
    }
}

function executeAICode(code, data) {
    if (AI_DISABLED) return aiDisabledAlert();
    try {
        // 使用 new Function 创建一个安全的执行环境
        // 传入 data 变量
        const func = new Function('data', code);
        const res = func(data);
        if (!Array.isArray(res)) throw new Error("AI 生成的代码未返回数组");
        return res;
    } catch (e) {
        throw new Error("代码执行错误: " + e.message);
    }
}

function renderAIChatResult(list, query) {
    if (AI_DISABLED) return aiDisabledAlert();
    const lastMsg = document.querySelector('#ai-chat-messages .ai-msg-bubble.system:last-child');
    
    if (!list || list.length === 0) {
        lastMsg.innerHTML = `🔍 查询 "${query}"<br>结果：未找到符合条件的学生。`;
        return;
    }

    let tableHtml = `<div style="margin-bottom:5px; font-weight:bold;">✅ 找到 ${list.length} 条结果:</div>
    <div class="table-wrap" style="max-height:200px; overflow-y:auto; box-shadow:none; margin:0;">
    <table class="ai-chat-table">
        <thead><tr><th>班级</th><th>姓名</th><th>总分</th><th>详情</th></tr></thead>
        <tbody>`;
    
    list.forEach(s => {
        // 智能展示详情：如果查询提到了某科，就显示某科成绩；提到了进步，显示进步
        let detail = `排:${s.townRank}`;
        if (query.includes("进步") || query.includes("退步")) {
            const p = s.progress > 0 ? `+${s.progress}` : s.progress;
            detail = `<span style="color:${s.progress>0?'green':'red'}">变${p}</span>`;
        } else {
            // 简单的尝试找一下偏科或者单科
            SUBJECTS.forEach(sub => {
                if (query.includes(sub)) detail = `${sub}:${s.scores[sub]}`;
            });
        }

        tableHtml += `<tr>
            <td>${s.class}</td>
            <td>${s.name}</td>
            <td>${s.total}</td>
            <td>${detail}</td>
        </tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    
    lastMsg.innerHTML = tableHtml;
}
