// --- 家长查分轻量包生成器 (严格验证版：必须输入 密码+班级+姓名) ---
function generateInquiryPackage() {
    const sch = document.getElementById('studentSchoolSelect').value;
    if (!sch || sch.includes('请选择')) return alert("请先选择一个学校，系统将生成该校的查分包。");
    
    // 1. 准备数据
    const schoolStudents = SCHOOLS[sch].students;
    if (!schoolStudents || schoolStudents.length === 0) return alert("该学校无数据");

    // 判断是否只有一所学校 (用于控制显示的排名类型)
    const isSingleSchool = Object.keys(SCHOOLS).length <= 1;

    const gradeStats = {};
    SUBJECTS.forEach(sub => {
        const scores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
        if (scores.length > 0) {
            const sum = scores.reduce((a, b) => a + b, 0);
            const avg = sum / scores.length;
            const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length;
            gradeStats[sub] = { avg: avg, sd: Math.sqrt(variance) };
        } else {
            gradeStats[sub] = { avg: 0, sd: 1 };
        }
    });

    // 2. 数据打包
    const secureData = {};
    
    schoolStudents.forEach(stu => {
        // 生成唯一 Key: 班级_姓名 (例如: 701_张三)
        // 去除所有空格，确保匹配准确
        const key = (stu.class + "_" + stu.name).replace(/\s+/g, "");
        
        const scoresSimple = {};

        const radarData = { labels: [], data: [] }; // 雷达图数据
        const varianceData = { labels: [], data: [] }; // 均衡度数据
        
        SUBJECTS.forEach(sub => {
            if(stu.scores[sub] !== undefined) {
                scoresSimple[sub] = [
                    stu.scores[sub],
                    safeGet(stu, `ranks.${sub}.school`, '-'),
                    safeGet(stu, `ranks.${sub}.township`, '-')
                ];

                // A. 计算雷达图数据 (百分位)
                // 逻辑复用 renderRadarChart 中的算法
                const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => v !== undefined).sort((a, b) => b - a);
                const rank = allScores.indexOf(stu.scores[sub]) + 1;
                const total = allScores.length;
                const percentile = ((1 - (rank / total)) * 100).toFixed(1);
                radarData.labels.push(sub);
                radarData.data.push(percentile);

                // B. 计算均衡度数据 (Z-Score)
                const stats = gradeStats[sub];
                let z = 0;
                if (stats && stats.sd > 0) {
                    z = (stu.scores[sub] - stats.avg) / stats.sd;
                }
                varianceData.labels.push(sub);
                varianceData.data.push(parseFloat(z.toFixed(2)));
            }
        });

        // C. 获取或生成评语
        // 优先从批量生成缓存中取，如果没有则现场生成一条简单的
        const cacheKey = `${stu.school}_${stu.class}_${stu.name}`;
        const aiComment = BATCH_AI_CACHE[cacheKey] || generateAIComment(stu);
        
        secureData[key] = {
            cls: stu.class,  // 存储班级
            name: stu.name,  // 存储姓名
            s: scoresSimple, 
            t: stu.total,    
            tr: safeGet(stu, 'ranks.total.township', '-'), 
            sr: safeGet(stu, 'ranks.total.school', '-'),   
            cr: safeGet(stu, 'ranks.total.class', '-'), 

            rd: radarData,   // Radar Data
            vd: varianceData,// Variance Data
            cm: aiComment    // Comment

        };
    });

    // 3. 提示设置访问密码
    const password = prompt(`🔐 安全设置\n\n请设置一个“访问密码” (例如: 123456)。\n\n家长查询时要求：\n1. 输入此密码\n2. 输入准确的班级\n3. 输入准确的姓名`, "123456");
    
    if (password === null) return; 
    if (!password) return alert("❌ 必须设置密码才能生成安全查分包！");

    // 使用 CryptoJS 进行 AES 加密
    const jsonStr = JSON.stringify(secureData);
    const encryptedData = CryptoJS.AES.encrypt(jsonStr, password).toString();

    // 4. 构建独立的 HTML 模板 (包含班级输入框)
    const examName = CONFIG.name || "期中考试";
    const genDate = new Date().toLocaleDateString();
    
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${sch} - 成绩查询</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 420px; margin: 0 auto; background: white; border-radius: 12px; padding: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h2 { text-align: center; color: #2563eb; margin-bottom: 5px; font-size: 20px; }
    .sub-title { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 14px; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; transition:0.3s; }
    input:focus { border-color: #2563eb; outline: none; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
    button { width: 100%; background: #2563eb; color: white; border: none; padding: 12px; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.2s; }
    button:active { transform: scale(0.98); }
    
    .password-section { background: #fffbeb; padding: 10px; border-radius: 8px; border: 1px solid #fcd34d; margin-bottom: 15px; }
    .password-section label { color: #b45309; }

    /* 结果卡片样式 */
    .result-box { margin-top: 20px; display: none; animation: fadeIn 0.3s; }
    .score-card { background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 2px 5px rgba(0,0,0,0.05); margin-bottom: 15px; }
    .head-section { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 20px; text-align: center; }
    .total-val { font-size: 36px; font-weight: 800; line-height: 1; margin-bottom: 5px; }
    .total-lbl { font-size: 12px; opacity: 0.9; }
    .stu-info-bar { background: rgba(0,0,0,0.1); padding: 4px 10px; border-radius: 20px; font-size: 12px; display: inline-block; margin-bottom: 10px; }
    .rank-bar { display: flex; background: #eff6ff; border-bottom: 1px solid #dbeafe; padding: 10px 0; }
    .rank-item { flex: 1; text-align: center; border-right: 1px solid #dbeafe; }
    .rank-item:last-child { border-right: none; }
    .rank-val { font-weight: bold; color: #1e40af; font-size: 15px; }
    .rank-lbl { font-size: 10px; color: #64748b; }
    .sub-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 15px; background: #f8fafc; }
    .sub-item { background: white; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .sub-main { display: flex; flex-direction: column; }
    .sub-name { font-size: 13px; color: #64748b; font-weight: bold; }
    .sub-val { font-size: 18px; font-weight: 800; color: #333; margin-top: 2px; }
    .sub-ranks { text-align: right; font-size: 11px; color: #94a3b8; display: flex; flex-direction: column; gap: 2px; }
    .tag-rank { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; }
    .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #ccc; }

    .chart-box { background:white; border-radius:10px; padding:15px; margin-bottom:15px; border:1px solid #e2e8f0; position:relative; min-height:220px; }
    .chart-title { font-size:13px; font-weight:bold; color:#475569; margin-bottom:10px; border-left:4px solid #2563eb; padding-left:8px; }
    .comment-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:15px; margin-bottom:15px; position:relative; }
    .comment-title { font-weight:bold; color:#166534; font-size:14px; margin-bottom:8px; display:flex; align-items:center; gap:5px; }
    .comment-text { font-size:13px; color:#333; line-height:1.6; white-space: pre-wrap; }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>
</head>
<body>
<div class="container">
    <h2>${sch} 成绩查询</h2>
    <div class="sub-title">${examName} | 发布日期: ${genDate}</div>
    
    <div class="password-section">
        <label>🔐 访问密码 (由老师提供)</label>
        <input type="password" id="inpPass" placeholder="请输入查看密码">
    </div>

    <!-- 👇👇👇 🟢 恢复：班级输入框 (必填) 🟢 👇👇👇 -->
    <div class="form-group">
        <label>班级</label>
        <input type="text" id="inpClass" placeholder="请输入班级 (如: 701)">
    </div>

    <div class="form-group">
        <label>学生姓名</label>
        <input type="text" id="inpName" placeholder="请输入姓名 (如: 张三)">
    </div>
    
    <button onclick="doSearch()">🔓 解密并查询</button>

    <div id="resultArea" class="result-box"></div>
</div>
<div class="footer">AES 256位端对端加密<br>仅限查询本人成绩</div>

<script>
    const PAYLOAD = "${encryptedData}";
    const IS_SINGLE_SCHOOL = ${isSingleSchool}; 

    let radarInst = null;
    let varInst = null;
    
    function doSearch() {
        const pass = document.getElementById('inpPass').value.trim();
        const cls = document.getElementById('inpClass').value.trim();
        const name = document.getElementById('inpName').value.trim();
        const resBox = document.getElementById('resultArea');
        
        if(!pass) return alert("❌ 请输入访问密码");
        if(!cls) return alert("❌ 请输入班级");
        if(!name) return alert("❌ 请输入学生姓名");
        
        let allData = null;

        // 1. 解密数据
        try {
            if (typeof CryptoJS === 'undefined') return alert("⚠️ 加载中，请稍后重试...");
            const bytes = CryptoJS.AES.decrypt(PAYLOAD, pass);
            const originalText = bytes.toString(CryptoJS.enc.Utf8);
            if (!originalText) throw new Error("密码错误");
            allData = JSON.parse(originalText);
        } catch(e) {
            return alert("⛔ 访问拒绝：密码错误！");
        }

        // 2. 精确查找 (班级 + 姓名 必须完全匹配)
        // 构造 Key：将用户输入的班级和姓名拼接，并去除空格 (例如 "701_张三")
        const key = (cls + "_" + name).replace(/\s+/g, "");
        const res = allData[key];

        // 3. 渲染结果
        resBox.innerHTML = '';
        
        if(!res) {
            alert("❌ 未找到学生信息！\n请检查【班级】和【姓名】是否输入正确。\n(班级如：701)");
        } else {
            let subHtml = '';
            for(let sub in res.s) {
                const item = res.s[sub];
                let rankHtml = '<span class="tag-rank">校: ' + item[1] + '</span>';
                if (!IS_SINGLE_SCHOOL) rankHtml += '<span class="tag-rank">镇: ' + item[2] + '</span>';
                subHtml += 
                    '<div class="sub-item">' +
                        '<div class="sub-main"><div class="sub-name">' + sub + '</div><div class="sub-val">' + item[0] + '</div></div>' +
                        '<div class="sub-ranks">' + rankHtml + '</div>' +
                    '</div>';
            }
            
            let totalRankHtml = 
                '<div class="rank-item"><div class="rank-val">' + res.cr + '</div><div class="rank-lbl">班排</div></div>' +
                '<div class="rank-item"><div class="rank-val">' + res.sr + '</div><div class="rank-lbl">校排</div></div>';
            if (!IS_SINGLE_SCHOOL) totalRankHtml += '<div class="rank-item"><div class="rank-val">' + res.tr + '</div><div class="rank-lbl">镇排</div></div>';

            // 注意：Canvas 需要固定高度
            const chartsHtml =
                '<div class="comment-box">' +
                    '<div class="comment-title">👩‍🏫 班主任评语</div>' +
                    '<div class="comment-text">' + (res.cm || '暂无评语') + '</div>' +
                '</div>' +
                '<div class="chart-box">' +
                    '<div class="chart-title">📊 学科能力分布 (雷达图)</div>' +
                    '<div style="height:200px; position:relative;">' +
                        '<canvas id="mobRadarChart"></canvas>' +
                    '</div>' +
                '</div>' +
                '<div class="chart-box">' +
                    '<div class="chart-title">⚖️ 学科均衡度诊断 (标准分)</div>' +
                    '<div style="height:200px; position:relative;">' +
                        '<canvas id="mobVarChart"></canvas>' +
                    '</div>' +
                    '<div style="font-size:10px; color:#999; text-align:center; margin-top:5px;">' +
                        '注: 柱子朝上为优势科目，朝下为弱势科目' +
                    '</div>' +
                '</div>';

            resBox.innerHTML = 
                '<div class="score-card">' +
                    '<div class="head-section">' +
                        '<div class="stu-info-bar">' + res.cls + '班 · ' + res.name + '</div>' +
                        '<div class="total-val">' + res.t + '</div>' +
                        '<div class="total-lbl">总分</div>' +
                    '</div>' +
                    '<div class="rank-bar">' + totalRankHtml + '</div>' +
                    '<div class="sub-grid">' + subHtml + '</div>' +
                '</div>' + 
                chartsHtml +
                '<div style="text-align:center; color:green; font-size:12px; margin-top:10px;">✅ 查询成功</div>';
            
            resBox.style.display = 'block';

            setTimeout(() => {
                // 1. 绘制雷达图
                if (radarInst) radarInst.destroy();
                const ctxRadar = document.getElementById('mobRadarChart');
                if (ctxRadar && res.rd) {
                    radarInst = new Chart(ctxRadar, {
                        type: 'radar',
                        data: {
                            labels: res.rd.labels,
                            datasets: [{
                                label: '能力值',
                                data: res.rd.data,
                                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                                borderColor: '#2563eb',
                                pointBackgroundColor: '#2563eb'
                            }]
                        },
                        options: {
                            maintainAspectRatio: false,
                            scales: { r: { min: 0, max: 100, ticks: { display: false }, pointLabels: { font: { size: 10 } } } },
                            plugins: { legend: { display: false } }
                        }
                    });
                }

                // 2. 绘制均衡度柱状图
                if (varInst) varInst.destroy();
                const ctxVar = document.getElementById('mobVarChart');
                if (ctxVar && res.vd) {
                    const colors = res.vd.data.map(v => v >= 0 ? '#16a34a' : '#dc2626');
                    varInst = new Chart(ctxVar, {
                        type: 'bar',
                        data: {
                            labels: res.vd.labels,
                            datasets: [{
                                label: '标准分',
                                data: res.vd.data,
                                backgroundColor: colors,
                                borderRadius: 3
                            }]
                        },
                        options: {
                            maintainAspectRatio: false,
                            indexAxis: 'y', // 横向柱状图更适合手机查看长标签
                            scales: { 
                                x: { grid: { display: true }, title: {display:true, text:'← 弱势 | 强势 →'} },
                                y: { grid: { display: false } }
                            },
                            plugins: { legend: { display: false } }
                        }
                    });
                }
            }, 100);

        }
    }
<\/script>
</body>
</html>`;

    // 5. 下载文件
    const blob = new Blob([htmlContent], {type: "text/html;charset=utf-8"});
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sch}_查分包_${new Date().getTime()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert("✅ 加密查分包已生成！\n文件名：" + link.download + "\n访问密码：" + password + "\n\n请将文件发给家长，告知密码。\n家长必须输入正确的 [班级] 和 [姓名] 才能查询。");
}
