// AI 配置 / AI 报告 / 历史趋势 / 图表工具

// 1. 保存配置
function saveLLMConfig() {
    const key = document.getElementById('llm_apikey').value;
    const url = document.getElementById('llm_baseurl').value;
    const model = document.getElementById('llm_model').value;
    
    if (!key) return alert("API Key 不能为空");
    
    localStorage.setItem('LLM_API_KEY', key);
    localStorage.setItem('LLM_BASE_URL', url);
    localStorage.setItem('LLM_MODEL', model);
    
    LLM_CONFIG.apiKey = key;
    LLM_CONFIG.baseURL = url;
    LLM_CONFIG.model = model;
    
    alert("✅ AI 配置已保存！");
}

// 页面加载时填充配置框（若已移除 UI，则跳过）
window.addEventListener('load', () => {
    const apiEl = document.getElementById('llm_apikey');
    const urlEl = document.getElementById('llm_baseurl');
    const modelEl = document.getElementById('llm_model');
    if (!apiEl || !urlEl || !modelEl) return;
    if(LLM_CONFIG.apiKey) apiEl.value = LLM_CONFIG.apiKey;
    urlEl.value = LLM_CONFIG.baseURL;
    modelEl.value = LLM_CONFIG.model;
});

// 2. 通用 LLM 请求函数
async function callLLM(prompt, onChunk, onFinish) {
    if (AI_DISABLED) {
        if (onFinish) onFinish("(请求失败)");
        throw new Error('AI 功能已移除');
    }
    if (!LLM_CONFIG.apiKey) return alert("请先在【数据中心】设置 AI API Key");
    
    try {
        const response = await fetch(`${LLM_CONFIG.baseURL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${LLM_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: LLM_CONFIG.model,
                messages: [
                    { role: "system", content: LLM_CONFIG.systemPrompt },
                    { role: "user", content: prompt }
                ],
                stream: true // 开启流式输出
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            // 处理 SSE 数据流 (data: {...})
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const json = JSON.parse(line.substring(6));
                        const content = json.choices[0].delta.content || "";
                        fullText += content;
                        if (onChunk) onChunk(content);
                    } catch (e) { }
                }
            }
        }
        if (onFinish) onFinish(fullText);

    } catch (error) {
        console.error(error);
        alert("AI 请求失败: " + error.message);
        if (onFinish) onFinish(" (请求失败)");
    }
}

// 3. 生成单个学生评语
function callAIForComment() {
    if (AI_DISABLED) return aiDisabledAlert();
    const stu = CURRENT_REPORT_STUDENT;
    if (!stu) return alert("请先查询一名学生");
    
    const box = document.getElementById('ai-comment-box');
    // 增加一个 Loading 动画效果
    box.innerHTML = `
        <div style="text-align:center; padding:20px;">
            <span class="loader-spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;"></span>
            <span style="color:#4f46e5; font-weight:bold; margin-left:10px;">AI 正在根据全镇数据深度分析 ${stu.name} 的学情...</span>
        </div>`;
    
    // 使用上面定义的增强版 Prompt 构建器
    const prompt = buildStudentPrompt(stu);

    let isFirstChunk = true;
    
    callLLM(prompt, (chunk) => {
        if (isFirstChunk) {
            box.innerHTML = ""; // 清除 Loading
            // 增加 Markdown 样式的简单处理容器
            box.style.fontFamily = '"Segoe UI", system-ui, sans-serif';
            box.style.whiteSpace = 'pre-wrap'; 
            isFirstChunk = false;
        }
        
        // 简单的流式追加
        box.innerText += chunk;
        
    }, (fullText) => {
        // (可选) 生成结束后，可以对文本进行简单的 Markdown 高亮处理
        // 这里为了简单，我们把 [小标题] 加粗
        const formatted = fullText
            .replace(/\[(.*?)\]/g, '<br><strong style="color:#b45309; background:#fff7ed; padding:2px 5px; border-radius:4px;">$1</strong>')
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); // 处理 Markdown 加粗
        
        box.innerHTML = formatted;
    });
}

// 4. 生成年级质量分析报告 (长文) - 智能增强版 (本校 VS 乡镇)
// 功能：专注于本校与全镇对比，提供分层级、分科目的深度诊断与实操建议
function generateAIMacroReport() {
    if (AI_DISABLED) return aiDisabledAlert();
    if (!Object.keys(SCHOOLS).length) return alert("无数据");
    
    // 1. 强制检查本校设置 (关键逻辑：没有本校就无法做对比)
    if (!MY_SCHOOL || !SCHOOLS[MY_SCHOOL]) {
        return alert("⚠️ 无法生成针对性报告！\n\n请先在页面顶部的【选择本校】下拉框中选中您的学校，系统才能进行“本校 vs 他校”的深度对比分析。");
    }

    // 创建模态框显示报告
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="width:95%; max-width:1600px; height:90vh; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding-bottom:10px;">
                <h3>🤖 AI 深度质量诊断: ${MY_SCHOOL} (对比分析版)</h3>
                <button onclick="this.closest('.modal').remove()" style="border:none; bg:none; cursor:pointer; font-size:20px;">&times;</button>
            </div>
            <div id="ai-report-content" style="flex:1; overflow-y:auto; padding:20px; white-space:pre-wrap; line-height:1.8; font-family:serif; font-size:16px;">
                正在调取 ${MY_SCHOOL} 与全镇其他 ${Object.keys(SCHOOLS).length - 1} 所学校的对比数据...
                <br>正在分析学科短板与提分空间...
                <br>正在生成针对 ${CONFIG.name} 的备考建议...
                <br><br>
                <span class="loader-spinner" style="width:20px;height:20px;display:inline-block;"></span> AI 正在奋笔疾书，请稍候 (约30秒)...
            </div>
            <div style="border-top:1px solid #eee; padding-top:10px; text-align:right;">
                <button class="btn btn-blue" onclick="copyReport()">📋 复制全文</button>
                <button class="btn btn-primary" onclick="exportToWord()" style="background:#2b579a; margin-left:10px;">
                    <i class="ti ti-file-word"></i> 导出为 Word
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- A. 数据准备 (Data Context) ---
    const myData = SCHOOLS[MY_SCHOOL];
    const totalSchools = Object.keys(SCHOOLS).length;
    const myRank = myData.rank2Rate || '-';
    
    // 计算全镇基准数据
    let subjectComparison = []; // 存储单科对比详情

    // 遍历所有科目进行对比
    SUBJECTS.forEach(sub => {
        if (!myData.metrics[sub]) return;
        
        // 全镇该科数据收集
        const allSchoolsMetrics = Object.values(SCHOOLS).map(s => s.metrics[sub]).filter(m => m);
        const townSubAvg = allSchoolsMetrics.reduce((a,b) => a + b.avg, 0) / allSchoolsMetrics.length;
        const maxSubAvg = Math.max(...allSchoolsMetrics.map(m => m.avg)); // 第一名均分
        
        // 本校数据
        const mySub = myData.metrics[sub];
        const diff = mySub.avg - townSubAvg; // 与全镇平均差
        const diffMax = mySub.avg - maxSubAvg; // 与第一名差
        const rank = myData.rankings[sub]?.avg || '-';

        subjectComparison.push({
            subject: sub,
            myAvg: mySub.avg.toFixed(1),
            townAvg: townSubAvg.toFixed(1),
            diff: diff.toFixed(1), // 与均值差
            diffMax: diffMax.toFixed(1), // 与第一名差
            rank: rank,
            excRate: (mySub.excRate * 100).toFixed(1) + '%',
            passRate: (mySub.passRate * 100).toFixed(1) + '%'
        });
    });

    // 区分优势与劣势学科 (简单算法：排名前30%为优，后40%为劣)
    const strongSubjects = subjectComparison.filter(s => s.rank <= Math.ceil(totalSchools * 0.3)).map(s => s.subject).join('、');
    const weakSubjects = subjectComparison.filter(s => s.rank > Math.ceil(totalSchools * 0.6)).map(s => s.subject).join('、');

    // 构建上下文文本，喂给 AI
    const contextText = `
    【基本信息】
    年级模式：${CONFIG.name} (特别注意：如果是9年级则面临中考，如果是7/8年级则处于基础阶段)
    本校：${MY_SCHOOL}
    全镇学校数：${totalSchools}
    本校综合排名：第 ${myRank} 名
    本校综合得分：${myData.score2Rate ? myData.score2Rate.toFixed(2) : '-'}

    【学科详细对比数据】(正数代表高于全镇均分，负数代表低于)：
    ${subjectComparison.map(s => `- ${s.subject}: 均分${s.myAvg} (与全镇差${s.diff}, 与第一名差${s.diffMax}), 排名${s.rank}, 优率${s.excRate}, 及格率${s.passRate}`).join('\n')}
    
    【初步诊断】
    优势学科：${strongSubjects || '无明显优势'}
    薄弱学科：${weakSubjects || '无明显短板'}
    `;

   // --- B. 构建 Prompt (要求 AI 返回 JSON 格式) ---
    const prompt = `
    你是一位资深教育数据分析师。请基于以下 **${MY_SCHOOL}** 的考试数据，进行深度诊断。

    【数据上下文】：
    ${contextText}

    【输出指令】：
    请严格按照以下 **JSON** 格式返回分析结果，不要包含任何 Markdown 标记（如 \`\`\`json），也不要包含任何开场白或结束语，直接返回 JSON 对象：
    {
        "summary": "一句话考情综述（例如：整体稳中有进，但优生断层严重，需警惕两极分化）",
        "score": 85, 
        "highlights": ["亮点1：XX学科均分超全镇平均5分", "亮点2：及格率稳步提升"], 
        "warnings": ["预警1：903班数学出现严重滑坡", "预警2：全校前100名人数偏少"], 
        "strategies": [
            { "title": "学科攻坚", "action": "针对英语薄弱问题，建议早读增加20分钟单词听写..." },
            { "title": "培优辅差", "action": "建立临界生档案，实行导师制..." },
            { "title": "课堂常规", "action": "严抓晚自习纪律，提高作业完成率..." }
        ],
        "slogan": "一句鼓舞人心的短句（10字以内）"
    }
    `;

    const contentDiv = document.getElementById('ai-report-content');
    // 初始化 Loading 界面
    contentDiv.innerHTML = `
        <div style="text-align:center; padding:50px;">
            <div class="loader-spinner" style="width:40px;height:40px;margin:0 auto 15px;display:block;"></div>
            <div style="font-size:16px; color:#4f46e5; font-weight:bold;">🤖 AI 正在进行多维度推理...</div>
            <div style="font-size:12px; color:#64748b; margin-top:5px;">正在对比全镇数据 / 计算学科差异 / 生成提分策略</div>
        </div>`;
    
    // 调用 AI 接口 (使用累积模式处理 JSON)
    let jsonBuffer = "";
    
    callLLM(prompt, (chunk) => {
        // 流式接收数据，暂不渲染，只存入 buffer
        jsonBuffer += chunk;
    }, (fullText) => {
        // 生成结束，开始解析与渲染
        try {
            // 1. 清洗数据：去除可能存在的 Markdown 代码块标记
            const cleanJson = jsonBuffer.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // 2. 解析 JSON
            const data = JSON.parse(cleanJson);
            
            // 3. 渲染漂亮的 UI
            contentDiv.innerHTML = `
                <div style="padding:10px;">
                    <!-- 头部评分 -->
                    <div style="text-align:center; margin-bottom:30px; border-bottom:1px dashed #eee; padding-bottom:20px;">
                        <h2 style="color:#1e293b; margin:0 0 10px 0; font-size:24px;">${data.summary}</h2>
                        <div style="display:inline-flex; align-items:center; background:#fefce8; border:1px solid #facc15; padding:5px 15px; border-radius:20px;">
                            <span style="color:#854d0e; font-size:12px;">AI 综合健康指数：</span>
                            <span style="font-size:28px; font-weight:800; color:#d97706; margin-left:8px;">${data.score}</span>
                        </div>
                    </div>

                    <!-- 红绿榜对比 -->
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:25px;">
                        <div style="background:#f0fdf4; padding:20px; border-radius:12px; border:1px solid #bbf7d0;">
                            <h4 style="color:#166534; margin:0 0 10px 0; display:flex; align-items:center;">
                                <i class="ti ti-thumb-up" style="margin-right:5px;"></i> 亮点与优势
                            </h4>
                            <ul style="padding-left:20px; color:#14532d; font-size:14px; margin:0; line-height:1.6;">
                                ${data.highlights.map(h => `<li>${h}</li>`).join('')}
                            </ul>
                        </div>
                        <div style="background:#fef2f2; padding:20px; border-radius:12px; border:1px solid #fecaca;">
                            <h4 style="color:#991b1b; margin:0 0 10px 0; display:flex; align-items:center;">
                                <i class="ti ti-alert-triangle" style="margin-right:5px;"></i> 风险与预警
                            </h4>
                            <ul style="padding-left:20px; color:#7f1d1d; font-size:14px; margin:0; line-height:1.6;">
                                ${data.warnings.map(w => `<li>${w}</li>`).join('')}
                            </ul>
                        </div>
                    </div>

                    <!-- 策略清单 -->
                    <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px;">
                        <h4 style="color:#334155; margin:0 0 15px 0; border-left:4px solid var(--primary); padding-left:10px;">
                            🚀 提质增效行动方案
                        </h4>
                        <div style="display:flex; flex-direction:column; gap:15px;">
                            ${data.strategies.map((s, i) => `
                                <div style="display:flex; align-items:flex-start; gap:12px;">
                                    <div style="background:#eff6ff; color:#1d4ed8; width:28px; height:28px; border-radius:6px; text-align:center; line-height:28px; font-weight:bold; flex-shrink:0;">${i+1}</div>
                                    <div>
                                        <div style="font-weight:bold; color:#1e293b; font-size:15px;">${s.title}</div>
                                        <div style="font-size:14px; color:#475569; margin-top:4px; line-height:1.5;">${s.action}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 底部口号 -->
                    <div style="margin-top:30px; text-align:center;">
                        <span style="background:#f1f5f9; color:#64748b; padding:8px 20px; border-radius:50px; font-style:italic; font-size:14px;">
                            “ ${data.slogan} ”
                        </span>
                    </div>
                </div>
            `;
        } catch (e) {
            // 如果 AI 返回的不是合法 JSON，回退显示原始文本
            console.error("AI JSON 解析失败", e);
            contentDiv.innerHTML = `
                <div style="padding:20px; color:#333;">
                    <h3 style="color:#d97706;">⚠️ 解析模式降级</h3>
                    <p style="font-size:12px; color:#666;">AI 未返回标准 JSON 格式，已切换为纯文本显示。</p>
                    <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
                    <pre style="white-space:pre-wrap; font-family:sans-serif; line-height:1.6;">${jsonBuffer}</pre>
                </div>
            `;
        }
    });
}

function copyReport() {
    const text = document.getElementById('ai-report-content').innerText;
    navigator.clipboard.writeText(text).then(() => alert("已复制到剪贴板"));
}
function exportToWord() {
    const content = document.getElementById('ai-report-content').innerText;
    // 使用我们之前封装的 UI.toast 替代 alert，如果还没加 UI 模块，这里依然可以用 alert
    if (!content || content.includes("正在汇总")) return (window.UI ? UI.toast : alert)("请等待报告生成完毕后再导出");

    const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = docx;

    // 1. 解析文本：简单按换行符分割
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const docChildren = [];

    // 1.1 添加大标题
    docChildren.push(
        new Paragraph({
            text: `${CONFIG.name} 教学质量分析报告`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 } 
        })
    );

    // 1.2 添加生成日期
    docChildren.push(
        new Paragraph({
            children: [
                new TextRun({
                    text: `生成日期：${new Date().toLocaleDateString()}`,
                    italics: true,
                    color: "666666",
                    size: 20 // 10pt
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 500 }
        })
    );

    // 1.3 智能识别正文段落结构
    lines.forEach(line => {
        const trimmed = line.trim();
        
        // 简单的标题识别逻辑：以 "一、" "1." 等开头，或者包含 "【"
        const isHeading = /^[一二三四五六七八九十]、/.test(trimmed) || 
                          /^\d+\./.test(trimmed) || 
                          /^【.*】$/.test(trimmed);

        if (isHeading) {
            // 小标题格式：加粗，字号稍大，段前段后间距
            docChildren.push(
                new Paragraph({
                    children: [ new TextRun({ text: trimmed, bold: true, size: 28 }) ], // 14pt
                    spacing: { before: 400, after: 200 }
                })
            );
        } else {
            // 普通正文：首行缩进 2 字符，1.5倍行距
            docChildren.push(
                new Paragraph({
                    children: [ new TextRun({ text: trimmed, size: 24 }) ], // 12pt
                    indent: { firstLine: 480 }, 
                    spacing: { line: 360 } 
                })
            );
        }
    });

    // 1.4 底部落款
    docChildren.push(
        new Paragraph({
            children: [ new TextRun({ text: "（本报告由智能教务系统自动生成）", color: "999999", size: 18 }) ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 800 }
        })
    );

    // 2. 创建文档对象
    const doc = new Document({
        sections: [{ properties: {}, children: docChildren }],
    });

    // 3. 生成并下载
    Packer.toBlob(doc).then((blob) => {
        const fileName = `${CONFIG.name}_质量分析报告_${new Date().getTime()}.docx`;
        saveAs(blob, fileName);
        if(window.UI) UI.toast(`✅ 已导出 Word 文档：${fileName}`, "success");
    }).catch(err => {
        console.error(err);
        alert("导出 Word 失败：" + err.message);
    });
}
function loadTeacherStamp(input) {
    const file = input.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = function(e) { TEACHER_STAMP_BASE64 = e.target.result; alert("签名/章图片已导入"); }; reader.readAsDataURL(file);
}
function renderHistoryChart(student) {
    const ctx = document.getElementById('historyChart'); 
    if(!ctx) return;
    if (historyChartInstance) historyChartInstance.destroy();

    // 1. 尝试从历史档案中获取数据
    const uid = student.school + "_" + student.name;
    // 深度拷贝一份，以免修改原数据
    let history = HISTORY_ARCHIVE[uid] ? JSON.parse(JSON.stringify(HISTORY_ARCHIVE[uid])) : [];
    
    // 2. 将“本次”考试数据加入趋势图
    const currentRank = safeGet(student, 'ranks.total.township', 0);
    if(currentRank) {
        history.push({ exam: '本次期末', rank: currentRank });
    }

    // 如果完全没有数据
    if(history.length === 0) {
        // 画一个空图或者显示文字
        return;
    }

    // --- A. 简单线性回归预测 (Simple Linear Regression) ---
    let prediction = null;
    
    // 只有当历史数据 >= 3 次时才进行预测，否则样本太少不准确
    if (history.length >= 3) { 
        const n = history.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        // X轴为时间序列索引 (0, 1, 2...), Y轴为排名
        history.forEach((h, i) => {
            sumX += i;
            sumY += h.rank;
            sumXY += i * h.rank;
            sumXX += i * i;
        });

        // 计算斜率 (Slope) 和 截距 (Intercept)
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // 预测下一次 (索引为 n)
        const nextRank = Math.round(slope * n + intercept);
        
        // 限制预测值合理范围 (排名不能小于1)
        const predictedRank = Math.max(1, nextRank);
        
        // 判断趋势方向
        const trend = slope < 0 ? '📈 持续进步' : (slope > 0 ? '📉 有下滑风险' : '➡️ 保持稳定');
        
        prediction = { 
            rank: predictedRank, 
            label: "下期预测",
            trendText: trend
        };
    }

    // --- B. 准备图表数据 ---
    const labels = history.map(h => h.exam);
    const data = history.map(h => h.rank);
    
    // 定义点的颜色和大小 (真实数据用蓝色)
    const pointColors = data.map(() => '#2563eb'); 
    const pointRadii = data.map(() => 5);

    // 如果有预测数据，追加到数组末尾
    if (prediction) {
        labels.push(prediction.label);
        data.push(prediction.rank);
        // 预测点用橙色，且稍微大一点
        pointColors.push('#f59e0b'); 
        pointRadii.push(6); 
    }

    // --- C. 绘制图表 ---
    // 判断是否为波动生 (原有逻辑)
    const isUnstable = ROLLER_COASTER_STUDENTS.includes(uid);
    
    historyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '全镇排名 (越低越好)',
                data: data,
                // 样式配置
                backgroundColor: isUnstable ? 'rgba(220, 38, 38, 0.1)' : 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: pointColors, // 使用动态颜色数组
                pointRadius: pointRadii,       // 使用动态大小数组
                fill: true,
                tension: 0.3,
                
                // 关键：利用 segment 配置实现虚线连接预测点
                segment: {
                    borderDash: ctx => {
                        // 如果是连接到最后一点(且有预测)，则设为虚线 [5, 5]
                        if (prediction && ctx.p1DataIndex === data.length - 1) return [6, 4];
                        return undefined; // 实线
                    },
                    borderColor: ctx => {
                        // 预测线段用橙色
                        if (prediction && ctx.p1DataIndex === data.length - 1) return '#f59e0b';
                        // 波动生用红色，普通生用蓝色
                        return isUnstable ? '#dc2626' : '#2563eb';
                    }
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (prediction && context.dataIndex === data.length - 1) {
                                return label + context.raw + " (AI预测值)";
                            }
                            return label + context.raw;
                        }
                    }
                },
                // 动态标题显示预测结果
                title: { 
                    display: true, 
                    text: prediction 
                        ? `历史走势 | 🤖 预测下次: 第 ${prediction.rank} 名 (${prediction.trendText})`
                        : (isUnstable ? '⚠️ 排名波动剧烈，需关注' : '历史排名走势'),
                    color: (prediction && prediction.trendText.includes('风险')) || isUnstable ? '#dc2626' : '#333',
                    font: { size: 13 }
                }
            },
            scales: {
                y: {
                    reverse: true, // 排名反转，越靠上越好
                    title: { display: true, text: '名次' },
                    suggestedMin: 1 // 保证Y轴不为负
                }
            }
        }
    });
}

function renderRadarChart(student) {
    const ctx = document.getElementById('radarChart'); if(!ctx) return;
    if (!window.Chart) {
        const holder = ctx.parentElement;
        if (holder) holder.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">图表组件未加载，请刷新页面</div>';
        return;
    }
    if (radarChartInstance) { radarChartInstance.destroy(); }

    const labels = []; 
    const currentData = [];
    const prevData = []; 

    const prevStu = findPreviousRecord(student);

    SUBJECTS.forEach(sub => {
        if(student.scores[sub] !== undefined) {
            labels.push(sub); 
            
            // 本次百分位
            const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => v !== undefined).sort((a, b) => b - a); 
            const rank = allScores.indexOf(student.scores[sub]) + 1; 
            const total = allScores.length; 
            const percentile = ((1 - (rank / total)) * 100).toFixed(1); 
            currentData.push(percentile);

            // 上次百分位
            let prevPercentile = null;
            if (prevStu && prevStu.scores && prevStu.scores[sub] !== undefined && window.PREV_DATA) {
                const prevAllScores = window.PREV_DATA
                    .map(s => s.scores ? s.scores[sub] : undefined)
                    .filter(v => typeof v === 'number')
                    .sort((a, b) => b - a);
                
                if (prevAllScores.length > 0) {
                    const prevRank = prevAllScores.indexOf(prevStu.scores[sub]) + 1;
                    const prevTotal = prevAllScores.length;
                    prevPercentile = ((1 - (prevRank / prevTotal)) * 100).toFixed(1);
                }
            }
            prevData.push(prevPercentile);
        }
    });

    const datasets = [{ 
        label: '本次', 
        data: currentData, 
        fill: true, 
        backgroundColor: 'rgba(37, 99, 235, 0.2)', // 蓝色填充
        borderColor: '#2563eb', // 蓝色实线
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#fff',
        pointRadius: 4,
        order: 1
    }];

    // 如果有有效历史数据，添加橙色虚线
    if (prevData.some(d => d !== null)) {
         datasets.push({
            label: '上次',
            data: prevData,
            fill: false, // 不填充，避免颜色混杂
            borderDash: [6, 4], // 明显的虚线
            // 👇 改为醒目的橙色
            borderColor: '#f97316', 
            pointBackgroundColor: '#fff', 
            pointBorderColor: '#f97316',
            pointRadius: 4,
            pointStyle: 'rectRot', // 点形状改为菱形，区分更明显
            order: 0 // 置于底层
         });
    }

    radarChartInstance = new Chart(ctx, { 
        type: 'radar', 
        data: { labels: labels, datasets: datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            scales: { 
                r: { 
                    min: 0, max: 100, 
                    ticks: { display: false }, 
                    pointLabels: { font: { size: 12, family: 'Microsoft YaHei', weight: 'bold' }, color: '#475569' },
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    angleLines: { color: 'rgba(0,0,0,0.05)' }
                } 
            }, 
            plugins: { 
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, padding: 15 } } 
            } 
        } 
    });
}

let varianceChartInstance = null;

function renderVarianceChart(student) {
    const ctx = document.getElementById('varianceChart'); 
    if(!ctx) return;
    if (!window.Chart) {
        const holder = ctx.parentElement;
        if (holder) holder.innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:12px; padding:20px;">图表组件未加载，请刷新页面</div>';
        return;
    }
    if (varianceChartInstance) varianceChartInstance.destroy();

    const labels = [];
    const zScoresCurr = [];
    const zScoresPrev = []; 
    const bgColors = [];

    const prevStu = findPreviousRecord(student);

    const calcStats = (arr) => {
        const n = arr.length;
        if (n === 0) return { mean: 0, sd: 1 };
        const mean = arr.reduce((a, b) => a + b, 0) / n;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        return { mean, sd: Math.sqrt(variance) };
    };

    SUBJECTS.forEach(sub => {
        if(student.scores[sub] !== undefined) {
            // 本次 Z-Score
            const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
            const stats = calcStats(allScores);
            let z = 0;
            if (stats.sd > 0) z = (student.scores[sub] - stats.mean) / stats.sd;
            
            labels.push(sub);
            zScoresCurr.push(z);

            // 颜色判定
            if (z >= 0.8) bgColors.push('#16a34a');      // 强 (绿)
            else if (z <= -0.8) bgColors.push('#dc2626'); // 弱 (红)
            else bgColors.push('#3b82f6');                // 中 (蓝)

            // 上次 Z-Score
            let prevZ = null;
            if (prevStu && prevStu.scores && prevStu.scores[sub] !== undefined && window.PREV_DATA) {
                const prevAllScores = window.PREV_DATA
                    .map(s => s.scores ? s.scores[sub] : undefined)
                    .filter(v => typeof v === 'number');
                const prevStats = calcStats(prevAllScores);
                if (prevStats.sd > 0) {
                    prevZ = (prevStu.scores[sub] - prevStats.mean) / prevStats.sd;
                }
            }
            zScoresPrev.push(prevZ); 
        }
    });

    const datasets = [{
        label: '本次',
        data: zScoresCurr,
        backgroundColor: bgColors,
        borderRadius: 3,
        barPercentage: 0.5,
        categoryPercentage: 0.8,
        order: 1
    }];

    // 如果有历史数据，添加橙色半透明柱
    if (zScoresPrev.some(d => d !== null)) {
        datasets.push({
            label: '上次',
            data: zScoresPrev,
            // 👇 改为醒目的橙色 (半透明填充 + 实线边框)
            backgroundColor: 'rgba(249, 115, 22, 0.4)', // Orange
            borderColor: '#f97316',
            borderWidth: 1,
            borderRadius: 3,
            barPercentage: 0.5,
            categoryPercentage: 0.8,
            order: 2 // 稍微错开或重叠均可，bar图表默认是并列
        });
    }

    varianceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // 横向柱状图
            plugins: {
                legend: { display: true, position: 'bottom' }, 
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label} Z-Score: ${ctx.raw ? ctx.raw.toFixed(2) : '-'}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { 
                        color: (ctx) => ctx.tick.value === 0 ? '#475569' : '#f1f5f9', 
                        lineWidth: (ctx) => ctx.tick.value === 0 ? 1.5 : 1 
                    },
                    suggestedMin: -2.5,
                    suggestedMax: 2.5,
                    ticks: { display: false } 
                },
                y: { grid: { display: false } }
            }
        }
    });
}

function buildChartNarrative(student) {
    const isSingleSchool = Object.keys(SCHOOLS).length <= 1;
    const scopeText = isSingleSchool ? '全校' : '全镇';
    const rank = safeGet(student, 'ranks.total.township', safeGet(student, 'ranks.total.school', '-'));
    const totalCount = RAW_DATA.length || 1;
    const percentile = (typeof rank === 'number') ? ((1 - rank / totalCount) * 100) : null;

    const subjectPercentiles = [];
    const zScores = [];
    const strong = [];
    const weak = [];

    const calcStats = (arr) => {
        const n = arr.length;
        if (n === 0) return { mean: 0, sd: 1 };
        const mean = arr.reduce((a, b) => a + b, 0) / n;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
        return { mean, sd: Math.sqrt(variance) };
    };

    SUBJECTS.forEach(sub => {
        if (student.scores[sub] === undefined) return;
        const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number').sort((a, b) => b - a);
        if (!allScores.length) return;
        const r = allScores.indexOf(student.scores[sub]) + 1;
        const p = ((1 - r / allScores.length) * 100);
        subjectPercentiles.push(p);

        const stats = calcStats(allScores);
        const z = stats.sd > 0 ? (student.scores[sub] - stats.mean) / stats.sd : 0;
        zScores.push(z);
        if (z >= 0.8) strong.push(sub);
        if (z <= -0.8) weak.push(sub);
    });

    const avgPct = subjectPercentiles.length ? (subjectPercentiles.reduce((a, b) => a + b, 0) / subjectPercentiles.length) : null;
    const maxZ = zScores.length ? Math.max(...zScores) : 0;
    const minZ = zScores.length ? Math.min(...zScores) : 0;
    const range = maxZ - minZ;

    const balanceText = range >= 2.5 ? '偏科明显' : range >= 1.2 ? '相对均衡' : '结构优秀';
    const strengthText = strong.length ? `优势学科：${strong.join('、')}` : '暂无明显优势学科';
    const weakText = weak.length ? `薄弱学科：${weak.join('、')}` : '暂无明显薄弱学科';

    let advice = [];
    if (weak.length) advice.push(`优先补弱科（${weak.join('、')}），建议每天固定 15 分钟回归基础概念。`);
    if (strong.length) advice.push(`保持优势科（${strong.join('、')}），可通过错题复盘稳住高位。`);
    if (!weak.length && !strong.length) advice.push('整体均衡，建议选择一门兴趣学科进行小幅突破。');
    advice.push('复习建议：先概念后练习，错题当天归档。');

    const pctText = percentile !== null ? `${percentile.toFixed(0)}%` : '-';
    const avgPctText = avgPct !== null ? `${avgPct.toFixed(0)}%` : '-';

    return `
    <div class="fluent-card" style="margin-top:10px;">
        <div class="fluent-header"><i class="ti ti-info-circle" style="color:#6366f1;"></i><span class="fluent-title">图表解读与建议</span></div>
        <div style="font-size:13px; color:#475569; line-height:1.8;">
            <div><strong>综合素质评价（百分位）</strong>：表示学生在${scopeText}的相对位置，数值越高越优秀。</div>
            <div>当前综合排名：${rank} / ${totalCount}，综合百分位约 <strong>${pctText}</strong>；单科平均百分位约 <strong>${avgPctText}</strong>。</div>
            <div style="margin-top:6px;"><strong>学科均衡度（Z-Score）</strong>：正数代表优势、负数代表薄弱，绝对值越大差异越明显。</div>
            <div>均衡度判断：<strong>${balanceText}</strong>；${strengthText}；${weakText}。</div>
            <div style="margin-top:6px;"><strong>学习建议</strong>：${advice.join(' ')}</div>
        </div>
    </div>`;
}

function analyzeStrengthsAndWeaknesses(student) {
    const strengthsContainer = document.getElementById('strengths-container'); const weaknessesContainer = document.getElementById('weaknesses-container'); const suggestionsContainer = document.getElementById('suggestions-container');
    if(!strengthsContainer || !weaknessesContainer || !suggestionsContainer) return;
    const allTotals = RAW_DATA.map(s => s.total).sort((a, b) => b - a); const totalPercentile = (allTotals.indexOf(student.total) + 1) / allTotals.length;
    const strengths = [], weaknesses = [];
    SUBJECTS.forEach(subject => {
        if (student.scores[subject] !== undefined) {
            const allScores = RAW_DATA.map(s => s.scores[subject]).filter(v => v !== undefined).sort((a, b) => b - a); const percentile = (allScores.indexOf(student.scores[subject]) + 1) / allScores.length; if (percentile < totalPercentile - 0.2) strengths.push({ subject, percentile, score: student.scores[subject] }); else if (percentile > totalPercentile + 0.2) weaknesses.push({ subject, percentile, score: student.scores[subject] });
        }
    });
    strengthsContainer.innerHTML = strengths.length ? strengths.map(s => `<span>${s.subject} <small>(${s.score})</small></span>`).join('、') : '无明显优势学科'; weaknessesContainer.innerHTML = weaknesses.length ? weaknesses.map(w => `<span>${w.subject} <small>(${w.score})</small></span>`).join('、') : '无明显劣势学科';
    let suggestions = weaknesses.length ? `<p>建议重点关注：${weaknesses.map(w=>w.subject).join('、')}，制定针对性复习计划。</p>` : '<p>各科发展均衡，请继续保持当前的良好状态。</p>'; suggestionsContainer.innerHTML = suggestions;
}
