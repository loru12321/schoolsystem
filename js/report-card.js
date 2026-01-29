// 报告查询 / 成绩单 / 移动端 管理逻辑

// ================= 报告查询逻辑（打印增强） =================
function doQuery() {
    const name = document.getElementById('inp-name').value; 
    const sch = document.getElementById('sel-school').value; 
    const cls = document.getElementById('sel-class').value;
    
    let stu = SCHOOLS[sch]?.students.find(s => s.name === name && (cls === '--请先选择学校--' || s.class === cls));
    if(!stu) return alert("未找到该学生");
    CURRENT_REPORT_STUDENT = stu;
    
    document.getElementById('single-report-result').classList.remove('hidden'); 
    const container = document.getElementById('report-card-capture-area');
    
    // 强制使用 'A4' 模式进行渲染，这样打印出来的效果最好
    container.innerHTML = renderSingleReportCardHTML(stu, 'A4');
    
    setTimeout(() => { renderRadarChart(stu); renderVarianceChart(stu);}, 100); 
    analyzeStrengthsAndWeaknesses(stu);
}

function generateAIComment(student) {
    if (AI_DISABLED) return aiDisabledAlert();
    const style = 'encouraging'; 
    const teacherName = '老师'; // 默认称呼
    const totalRank = safeGet(student, 'ranks.total.township', 99999); const totalStudents = RAW_DATA.length || 1; const percentile = totalRank / totalStudents;
    let progress = 0; if(PROGRESS_CACHE.length > 0) { const progRecord = PROGRESS_CACHE.find(p => p.name === student.name && p.class === student.class); if(progRecord) progress = progRecord.change; }
    let bestSub = { name: '', rank: 99999 }; let worstSub = { name: '', rank: 0 };
    SUBJECTS.forEach(sub => { const r = safeGet(student, `ranks.${sub}.township`, 0); if(r > 0) { if(r < bestSub.rank) bestSub = { name: sub, rank: r }; if(r > worstSub.rank) worstSub = { name: sub, rank: r }; } });
    const isPartial = (worstSub.rank - bestSub.rank) > (totalStudents * 0.4);
    const phrases = {
        opening: { top: [`${student.name}同学，你一直是班级的领头羊。`, `你优秀的成绩证明了你的努力和天赋。`], mid: [`${student.name}同学，你是一个潜力巨大的学生。`, `你的成绩保持在班级中游，基础比较扎实。`], low: [`${student.name}同学，老师看到了你身上的闪光点。`, `虽然目前的成绩不尽如人意，但只要不放弃，总有希望。`] },
        progress: { up: [`本次考试你进步了${progress}名，这是你辛勤付出的回报！`, `欣喜地看到你的排名在稳步上升，继续保持！`], down: [`本次排名有所下滑，我们需要一起找找原因。`, `最近是不是有些分心？成绩出现了一点波动。`], flat: [`你的成绩非常稳定，保持这种状态很难得。`] },
        subjects: { partial: [`你的${bestSub.name}非常有优势，但${worstSub.name}稍微拖了后腿，如果能平衡一下，总分会更高。`, `要警惕偏科现象，${worstSub.name}学科需要投入更多精力。`], balanced: [`各科发展比较均衡，没有明显的短板，这是你的核心竞争力。`, `全面发展是你最大的优势，请继续保持这种良好的学习节奏。`] },
        advice: { encouraging: [`相信自己，你一定行！${teacherName}老师会一直支持你。`, `期待在下次光荣榜上看到更耀眼的你！`] }
    };
    let parts = []; let tier = 'mid'; if(percentile <= 0.15) tier = 'top'; else if(percentile >= 0.75) tier = 'low';
    parts.push(phrases.opening[tier][Math.floor(Math.random() * phrases.opening[tier].length)]);
    if(Math.abs(progress) >= 10) { let pType = progress > 0 ? 'up' : 'down'; parts.push(phrases.progress[pType][Math.floor(Math.random() * phrases.progress[pType].length)]); } else { if(Math.random() > 0.5) parts.push(phrases.progress.flat[Math.floor(Math.random() * phrases.progress.flat.length)]); }
    if(isPartial) { parts.push(phrases.subjects.partial[Math.floor(Math.random() * phrases.subjects.partial.length)]); } else { parts.push(phrases.subjects.balanced[Math.floor(Math.random() * phrases.subjects.balanced.length)]); }
    parts.push(phrases.advice[style][Math.floor(Math.random() * phrases.advice[style].length)]);
    return parts.join("");
}

function findPreviousRecord(student) {
    // 1. 基础检查
    if (!window.PREV_DATA || window.PREV_DATA.length === 0) {
        console.warn("历史数据(PREV_DATA)为空，无法进行对比。请先上传历史成绩。");
        return null;
    }

    // 2. 标准化工具函数 (清洗数据)
    const cleanStr = (str) => String(str || "").trim().replace(/\s+/g, ""); // 去空格
    const normalizeClass = (cls) => {
        let s = String(cls || "").trim();
        // 移除 "班", "级", "(", ")", ".", "-", "grade", "class"
        return s.replace(/[班级\(\)\.\-gradeclass]/gi, "");
    };

    const targetName = cleanStr(student.name);
    const targetClass = normalizeClass(student.class);
    const targetSchool = student.school;

    // 3. 在历史库中查找
    const match = window.PREV_DATA.find(p => {
        // A. 校内模式：必须匹配学校 (如果历史数据有学校字段)
        if (p.school && targetSchool && p.school !== targetSchool) return false;

        // B. 姓名匹配 (严格匹配清洗后的姓名)
        if (cleanStr(p.name) !== targetName) return false;

        // C. 班级智能匹配 (核心修复点)
        // 将 "7.1", "701", "7年级1班" 都清洗为 "71" 或 "701" 进行比对
        const histClass = normalizeClass(p.class);
        
        // 规则1: 完全相等
        if (histClass === targetClass) return true;
        
        // 规则2: 处理 "0" 的差异 (例如 71 vs 701)
        // 如果两个班级号都包含数字，且去掉0后相等，视为匹配 (存在风险，但在同一年级内通常安全)
        const numC1 = histClass.replace(/0/g, '');
        const numC2 = targetClass.replace(/0/g, '');
        if (numC1 === numC2 && numC1.length > 0) return true;

        return false;
    });

    if (!match) {
        // 调试日志：如果你发现某人没匹配上，按F12看控制台会显示原因
        // console.log(`未找到历史记录: ${student.name} (班级:${targetClass})`);
    } else {
        // console.log(`匹配成功: ${student.name} -> 上次分: ${match.total}`);
    }

    return match;
}

// 🟢 [新增]：生成进退步胶囊标签 (Windows 风格)
function getTrendBadge(current, previous, type = 'score') {
    if (previous === undefined || previous === null || previous === '-' || previous === '') return '';
    
    // 确保数值类型
    const currVal = parseFloat(current);
    const prevVal = parseFloat(previous);
    if (isNaN(currVal) || isNaN(prevVal)) return '';

    const diff = currVal - prevVal;
    if (Math.abs(diff) < 0.01) return `<span style="color:#94a3b8; font-size:11px; margin-left:4px; font-weight:normal;">(持平)</span>`;

    let color = '';
    let icon = '';
    let bg = '';
    
    if (type === 'score') {
        // 分数：正数=进步(绿), 负数=退步(红/橙)
        if (diff > 0) { color = '#15803d'; bg = '#dcfce7'; icon = '▲'; } 
        else { color = '#b91c1c'; bg = '#fee2e2'; icon = '▼'; }
    } else {
        // 排名：负数=进步(名次变小), 正数=退步(名次变大)
        if (diff < 0) { color = '#15803d'; bg = '#dcfce7'; icon = '▲'; } // 排名上升
        else { color = '#b91c1c'; bg = '#fee2e2'; icon = '▼'; }          // 排名下降
    }

    const absDiff = Math.abs(diff);
    // Windows 11 风格圆角胶囊
    return `<span style="display:inline-flex; align-items:center; background:${bg}; color:${color}; padding:1px 6px; border-radius:10px; font-size:11px; font-weight:bold; margin-left:5px; vertical-align:middle;">
        ${icon} ${type==='score' ? absDiff.toFixed(1) : absDiff}
    </span>`;
}

// 1. 综合渲染入口：根据设备类型自动选择模板
function renderSingleReportCardHTML(stu, mode) {
    // 1. 安卓 Canvas 兼容性兜底 (部分低版本安卓 WebView 无法渲染 Chart.js)
    // 如果是安卓且屏幕小，且没有 window.Chart 对象(极少数情况)，强制回退到 PC 版 HTML 表格
    const ua = navigator.userAgent.toLowerCase();
    const isAndroid = ua.includes('android');
    const isProblemAndroid = isAndroid && window.innerWidth <= 768 && !window.Chart;

    if (isProblemAndroid) {
        console.warn('⚠️ Android Canvas 异常，强制切换 PC 模式');
        // 递归调用自己，传入 'PC' 模式以跳过下方的 Mobile 判断
        return renderSingleReportCardHTML(stu, 'PC');
    }

    // 2. 判断是否为手机端 (或显式请求 IG 模式)
    const isMobile = window.innerWidth <= 768; 
    
    if (isMobile || mode === 'IG') {
        // A. 获取 HTML 字符串
        const html = renderInstagramCard(stu);
        
        // B. 关键：设置延时回调，在 HTML 插入 DOM 后绘制 Canvas 图表
        // 必须使用 setTimeout，否则此时 canvas 元素还不存在于页面上
        setTimeout(() => {
            if (typeof renderIGCharts === 'function') {
                renderIGCharts(stu);
            }
        }, 50);

        // C. 返回 HTML 字符串
        return html;
    }

    // --- 否则：渲染原有的 PC 端 Fluent Design 风格 (A4打印版) ---
    const totalStudentsCount = RAW_DATA.length; 
    const genDate = new Date().toLocaleDateString(); 
    
    // 获取对比数据
    const prevStu = findPreviousRecord(stu); 
    
    // 排名数据准备
    const curTownRank = safeGet(stu, 'ranks.total.township', '-');
    const prevTownRank = prevStu ? (prevStu.townRank || '-') : '-';
    const curClassRank = safeGet(stu, 'ranks.total.class', '-');
    const prevClassRank = prevStu ? (prevStu.classRank || '-') : '-';
    const curSchoolRank = safeGet(stu, 'ranks.total.school', '-');
    const prevSchoolRank = prevStu ? (prevStu.schoolRank || '-') : '-';

    // 单校判断
    const isSingleSchool = Object.keys(SCHOOLS).length <= 1;
    const townColStyle = isSingleSchool ? 'display:none !important;' : '';

    // 构建表格行
    let tableRows = '';

    // A. 9年级五科总分行 (逻辑保持不变)
    if (CONFIG.name === '9年级') { 
        let fiveTotal = 0, count = 0; 
        ['语文', '数学', '英语', '物理', '化学'].forEach(sub => { 
            if (stu.scores[sub] !== undefined) { fiveTotal += stu.scores[sub]; count++; }
        }); 
        if (count > 0) { 
            tableRows += `<tr style="background:rgba(248,250,252,0.5);">
                <td style="font-weight:bold; color:#475569;">🏁 核心五科</td>
                <td style="font-weight:bold; color:#2563eb;">${fiveTotal.toFixed(1)}</td>
                <td>-</td><td>-</td><td style="${townColStyle}">-</td>
            </tr>`; 
        } 
    }

    // B. 总分行
    const prevTotal = prevStu ? prevStu.total : '-';
    const trendTotal = getTrendBadge(stu.total, prevTotal, 'score');
    const trendClass = getTrendBadge(curClassRank, prevClassRank, 'rank');
    const trendSchool = getTrendBadge(curSchoolRank, prevSchoolRank, 'rank');
    const trendTown = getTrendBadge(curTownRank, prevTownRank, 'rank');

    tableRows += `<tr style="background:rgba(239,246,255,0.7); backdrop-filter:blur(4px); border-bottom:2px solid #fff;">
        <td style="font-weight:bold; color:#1e3a8a;">🏆 ${CONFIG.label}</td>
        <td style="font-weight:800; font-size:16px; color:#1e40af;">${stu.total.toFixed(2)} ${trendTotal}</td>
        <td style="font-weight:bold; color:#334155;">${curClassRank} ${trendClass}</td>
        <td style="font-weight:bold; color:#334155;">${curSchoolRank} ${trendSchool}</td>
        <td style="${townColStyle} font-weight:bold; color:#334155;">${curTownRank} ${trendTown}</td>
    </tr>`;

    // C. 单科行
    const uniqueSubjects = [...new Set(SUBJECTS)];
    uniqueSubjects.forEach(sub => {
        if (stu.scores[sub] !== undefined) {
            const prevSubScore = (prevStu && prevStu.scores) ? prevStu.scores[sub] : '-';
            const subTrend = getTrendBadge(stu.scores[sub], prevSubScore, 'score');
            
            let prevRanks = {};
            if (prevStu && prevStu.ranks && prevStu.ranks[sub]) prevRanks = prevStu.ranks[sub];
            
            const curCR = safeGet(stu, `ranks.${sub}.class`, '-');
            const tC = getTrendBadge(curCR, prevRanks.class || '-', 'rank');
            const curSR = safeGet(stu, `ranks.${sub}.school`, '-');
            const tS = getTrendBadge(curSR, prevRanks.school || '-', 'rank');
            const curTR = safeGet(stu, `ranks.${sub}.township`, '-');
            const tT = getTrendBadge(curTR, prevRanks.township || '-', 'rank');
            
            tableRows += `<tr style="transition:0.2s;" onmouseover="this.style.background='rgba(241,245,249,0.5)'" onmouseout="this.style.background='transparent'">
                <td style="font-weight:600; color:#475569;">${sub}</td>
                <td style="font-weight:bold; color:#334155;">${stu.scores[sub]} ${subTrend}</td>
                <td style="color:#64748b;">${curCR} ${tC}</td>
                <td style="color:#64748b;">${curSR} ${tS}</td>
                <td style="color:#64748b; ${townColStyle}">${curTR} ${tT}</td>
            </tr>`;
        }
    });

    const fluentStyle = `
        <style>
            .fluent-card { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255, 255, 255, 0.6); box-shadow: 0 4px 24px -1px rgba(0, 0, 0, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            .fluent-header { display: flex; align-items: center; gap: 8px; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid rgba(0,0,0,0.05); }
            .fluent-title { font-size: 15px; font-weight: 700; color: #1e293b; }
            .fluent-subtitle { font-size: 11px; color: #94a3b8; margin-left: auto; }
            .fluent-table { width: 100%; border-collapse: separate; border-spacing: 0; }
            .fluent-table th { text-align: center; padding: 10px 5px; color: #64748b; font-size: 12px; font-weight: 600; border-bottom: 1px solid #e2e8f0; background: rgba(248, 250, 252, 0.5); }
            .fluent-table td { text-align: center; padding: 12px 5px; border-bottom: 1px solid rgba(0,0,0,0.03); font-size: 14px; }
            .fluent-table tr:last-child td { border-bottom: none; }
            @media print { .fluent-card { box-shadow: none; border: 1px solid #ccc; backdrop-filter: none; } }
        </style>
    `;

    const chartNarrativeHtml = buildChartNarrative(stu);

    return `
    ${fluentStyle}
    <div class="report-header" style="border-bottom:none; margin-bottom:10px; text-align:center;">
        <h3 style="font-family:'Microsoft YaHei', sans-serif; font-weight:800; color:#1e293b; letter-spacing:1px; margin:0;">${stu.school} 学生学业发展报告</h3>
        <p style="color:#94a3b8; font-size:12px; margin-top:5px;">生成日期: ${genDate}</p>
    </div>
    <div class="fluent-card" style="padding:15px 25px; background:linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:baseline; gap:15px;">
                <span style="font-size:24px; font-weight:800; color:#1e3a8a;">${stu.name}</span>
                <span style="font-size:14px; color:#475569; background:#fff; padding:2px 8px; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">${stu.class}</span>
            </div>
            <div style="font-size:13px; color:#64748b; font-family:monospace;">考号: ${stu.id}</div>
        </div>
    </div>
    <div class="fluent-card" style="padding:0; overflow:hidden;">
        <table class="fluent-table" id="tb-query">
            <thead><tr><th style="text-align:left; padding-left:20px;">科目</th><th>成绩 (对比)</th><th>班排</th><th>校排</th><th style="${townColStyle}">全镇排名</th></tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
    </div>
    <div style="display:flex; gap:15px; margin-bottom:15px; flex-wrap:wrap;">
        <div class="fluent-card" style="flex:1; min-width:300px; margin-bottom:0; display:flex; flex-direction:column;">
            <div class="fluent-header"><i class="ti ti-radar" style="color:#2563eb;"></i><span class="fluent-title">综合素质评价 (百分位)</span></div>
            <div style="flex:1; position:relative; min-height:220px;"><canvas id="radarChart"></canvas></div>
        </div>            
        <div class="fluent-card" style="flex:1; min-width:300px; margin-bottom:0; display:flex; flex-direction:column;">
            <div class="fluent-header"><i class="ti ti-scale" style="color:#059669;"></i><span class="fluent-title">学科均衡度诊断 (Z-Score)</span></div>
            <div style="flex:1; position:relative; min-height:220px;"><canvas id="varianceChart"></canvas></div>
        </div> 
    </div>
    ${chartNarrativeHtml}
    <div style="text-align:center; font-size:11px; color:#cbd5e1; margin-top:20px;">系统自动生成 · 仅供家校沟通参考</div>`;
}

// 2. 🟢 新增：生成 Instagram 风格卡片的函数 (Mobile Only)
function renderInstagramCard(stu) {
    const genDate = new Date().toLocaleDateString();
    const totalStudents = RAW_DATA.length;
    const rank = safeGet(stu, 'ranks.total.township', '-');
    const pct = (typeof rank === 'number') ? ((1 - rank/totalStudents)*100).toFixed(0) : '-';
    const avatarLetter = stu.name.charAt(0); // 头像取首字
    
    // 判断是否为单校模式
    const isSingleSchool = Object.keys(SCHOOLS).length <= 1;
    const scopeText = isSingleSchool ? "全校" : "全镇";

    let statusTag = '';
    if (pct >= 90) statusTag = '🌟 卓越之星';
    else if (pct >= 75) statusTag = '🔥 进步飞速';
    else statusTag = '📚 持续努力';

    // 3. 构建单科评论行
    let commentsHtml = '';
    SUBJECTS.forEach(sub => {
        if (stu.scores[sub] !== undefined) {
            const score = stu.scores[sub];
            
            // 修改点 1：获取校内排名 (即年级排名/级排) 而不是班级排名 (.class)
            const subRank = safeGet(stu, `ranks.${sub}.school`, '-');
            
            commentsHtml += `
                <div class="insta-comment-row">
                    <div>
                        <span class="insta-comm-user">${sub}</span>
                        <span class="insta-comm-text">成绩单</span>
                    </div>
                    <div>
                        <span class="insta-comm-score">${score}</span>
                        <!-- 修改点 2：显示文字改为 级排 -->
                        <span class="insta-comm-rank">级排#${subRank}</span>
                    </div>
                </div>
            `;
        }
    });

    // 新增：雷达图和均衡度图表的 Canvas 容器
    // 注意：这里只是占位，具体的图表将在 renderIGCharts 函数中绘制
    const chartsHtml = `
        <div style="margin-top: 20px; padding: 0 14px;">
            <!-- 雷达图容器 -->
            <div style="background: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
                <div style="font-size: 13px; font-weight: bold; color: #475569; margin-bottom: 10px; border-left: 4px solid #2563eb; padding-left: 8px;">
                    📊 学科能力雷达图
                </div>
                <div style="height: 250px; position: relative;">
                    <canvas id="igRadarChart"></canvas>
                </div>
            </div>

            <!-- 均衡度容器 -->
            <div style="background: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0;">
                <div style="font-size: 13px; font-weight: bold; color: #475569; margin-bottom: 10px; border-left: 4px solid #059669; padding-left: 8px;">
                    ⚖️ 学科均衡度诊断
                </div>
                <div style="height: 200px; position: relative;">
                    <canvas id="igVarianceChart"></canvas>
                </div>
                <div style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 5px;">
                    注：向右(绿)为优势学科，向左(红)为薄弱学科
                </div>
            </div>
        </div>
    `;

    // 1. 定义一个内部函数，用于计算 Z-Score 并对科目进行分层 (强/中/弱)
    // 目的：为后续的“一句话诊断”、“优势清单”、“家长建议”提供数据支撑
    const getSubjectLevels = () => {
        let strong = [], weak = [], mid = [], zScores = [];

        SUBJECTS.forEach(sub => {
            if (stu.scores[sub] !== undefined) {
                // A. 获取该科全镇数据 (用于计算标准分)
                const allScores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
                if (allScores.length < 2) return;

                // B. 计算均值与标准差 (Standard Deviation)
                const avg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
                const variance = allScores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / allScores.length;
                const sd = Math.sqrt(variance) || 1; // 防止除以0

                // C. 计算标准分 Z-Score (反映该生在全体考生中的相对位置)
                const z = (stu.scores[sub] - avg) / sd;
                zScores.push(z);

                // D. 分类 (阈值 0.8，约等于前20%和后20%)
                const item = `${sub}`; // 仅存科目名
                if (z >= 0.8) strong.push(item);      // 强科
                else if (z <= -0.8) weak.push(item);  // 弱科
                else mid.push(item);                  // 中等
            }
        });

        // 计算极差 (Range)，用于判断整体结构是“均衡”还是“偏科”
        const maxZ = zScores.length ? Math.max(...zScores) : 0;
        const minZ = zScores.length ? Math.min(...zScores) : 0;
        const range = maxZ - minZ;

        return { strong, weak, mid, range };
    };

    // 2. 执行计算，获取分层结果
    const levels = getSubjectLevels();

    // 3. 生成【模块④】一句话诊断文案
    const getDiagnosisText = (range) => {
        if (range >= 2.5) {
            // 极差大：严重偏科
            return {
                tag: '⚠️ 严重偏科',
                color: '#b91c1c', bg: '#fee2e2',
                text: '不同学科成绩差异极大，存在明显优势科目与薄弱科目，需要针对性调整学习重心，补齐短板。'
            };
        } else if (range >= 1.2) {
            // 极差中：相对均衡
            return {
                tag: '⚖️ 相对均衡',
                color: '#0369a1', bg: '#e0f2fe',
                text: '各学科成绩整体较为均衡，个别学科略有波动，保持稳定发挥是关键。'
            };
        } else {
            // 极差小：结构优秀
            return {
                tag: '🌟 结构优秀',
                color: '#15803d', bg: '#dcfce7',
                text: '各学科发展极其均衡，无明显短板，心理素质稳定，是冲刺更高目标的理想状态。'
            };
        }
    };

    const diag = getDiagnosisText(levels.range);

    // --- 生成【模块④】HTML：一句话诊断 ---
    const igDiagnosisHtml = `
        <div style="margin: 15px 14px 0 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-weight:bold; color:#334155; font-size:14px;">🧠 学情结构诊断</span>
                <span style="font-size:12px; background:${diag.bg}; color:${diag.color}; padding:2px 8px; border-radius:12px; font-weight:bold;">
                    ${diag.tag}
                </span>
            </div>
            <div style="font-size:13px; color:#64748b; line-height:1.5;">
                ${diag.text}
            </div>
        </div>
    `;

    // --- 生成【模块⑤】HTML：优势/短板折叠清单 ---
    // 辅助函数：生成列表项
    const renderListItems = (arr, emptyText) => {
        if (!arr || arr.length === 0) return `<div style="font-size:12px; color:#ccc; padding:5px;">${emptyText}</div>`;
        return arr.map(sub => 
            `<span style="display:inline-block; background:#f1f5f9; color:#334155; font-size:12px; padding:4px 10px; border-radius:4px; margin:0 5px 5px 0;">${sub}</span>`
        ).join('');
    };

    const igSubjectListHtml = `
        <div style="margin: 15px 14px 0 14px;">
            <!-- 优势科目 -->
            <details open style="margin-bottom:10px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                <summary style="padding:10px 15px; font-size:13px; font-weight:bold; color:#333; cursor:pointer; background:#f8fafc; list-style:none; display:flex; align-items:center;">
                    <span style="margin-right:8px;">☀️</span> 优势学科 (Z≥0.8)
                    <span style="margin-left:auto; font-size:10px; color:#999;">${levels.strong.length}科</span>
                </summary>
                <div style="padding:15px;">
                    ${renderListItems(levels.strong, '暂无明显优势学科，继续加油')}
                </div>
            </details>

            <!-- 薄弱科目 -->
            <details ${levels.weak.length > 0 ? 'open' : ''} style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                <summary style="padding:10px 15px; font-size:13px; font-weight:bold; color:#333; cursor:pointer; background:#fff1f2; list-style:none; display:flex; align-items:center;">
                    <span style="margin-right:8px;">🌧️</span> 需关注学科 (Z≤-0.8)
                    <span style="margin-left:auto; font-size:10px; color:#dc2626;">${levels.weak.length}科</span>
                </summary>
                <div style="padding:15px;">
                    ${renderListItems(levels.weak, '暂无明显短板，保持均衡')}
                </div>
            </details>
        </div>
    `;

    // --- 生成【模块⑥】HTML：家长执行建议 ---
    const getParentAdvice = () => {
        const adv = [];
        // 策略1：有弱科
        if (levels.weak.length > 0) {
            const subStr = levels.weak.join('、');
            adv.push(`🎯 <strong>精准攻坚：</strong>针对 ${subStr}，建议每天安排 15 分钟回归课本基础概念，不盲目刷题。`);
        }
        // 策略2：有强科
        if (levels.strong.length > 0) {
            const subStr = levels.strong.join('、');
            adv.push(`🛡️ <strong>保持自信：</strong>${subStr} 是孩子的信心来源，请多给予具体表扬，稳住优势。`);
        }
        // 策略3：全是中间 (均衡)
        if (levels.strong.length === 0 && levels.weak.length === 0) {
            adv.push(`🚀 <strong>寻找突破：</strong>目前成绩非常稳定。建议选定一门孩子最感兴趣的学科，尝试增加 5% 的投入，培养成优势学科。`);
        }
        // 通用建议
        adv.push(`📅 <strong>习惯养成：</strong>检查孩子是否养成了“先复习，后作业”的习惯。`);
        
        return adv.map(t => `<li style="margin-bottom:8px; line-height:1.5;">${t}</li>`).join('');
    };

    const igAdviceHtml = `
        <div style="margin: 15px 14px 20px 14px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 15px;">
            <div style="font-size:13px; font-weight:bold; color:#b45309; margin-bottom:10px; display:flex; align-items:center;">
                <i class="ti ti-bulb" style="margin-right:5px; font-size:16px;"></i> 家长行动指南
            </div>
            <ul style="padding-left:15px; margin:0; font-size:12px; color:#78350f;">
                ${getParentAdvice()}
            </ul>
        </div>
    `;

    // 模拟图表区域 (使用CSS渐变背景代替 Canvas，确保渲染稳定)
    const visualAreaHtml = `
        <div class="insta-visual-area">
            <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045); border-radius:8px; color:white; padding:40px 0;">
                <div style="font-size:16px; opacity:0.9; text-transform:uppercase; letter-spacing:2px;">Total Score</div>
                <div style="font-size:64px; font-weight:800; text-shadow:0 4px 10px rgba(0,0,0,0.2);">${stu.total}</div>
                <div style="margin-top:10px; font-size:18px; font-weight:bold; background:rgba(255,255,255,0.2); padding:5px 15px; border-radius:20px;">
                    全校排名: ${safeGet(stu, 'ranks.total.school', '-')}
                </div>
                <div style="margin-top:20px; font-size:12px; opacity:0.8;">击败了${scopeText} ${pct}% 的考生</div>
            </div>
        </div>
    `;

    return `
        <div class="insta-view-container" style="background:#fafafa; padding-top:20px;">
            <div class="insta-card">
                <!-- Header -->
                <div class="insta-header">
                    <div class="insta-avatar-ring"><div class="insta-avatar">${avatarLetter}</div></div>
                    <div class="insta-user-info">
                        <div class="insta-username">${stu.name} <i class="ti ti-discount-check-filled insta-verified"></i></div>
                        <div class="insta-location">${stu.school} · ${stu.class}</div>
                    </div>
                    <i class="ti ti-dots"></i>
                </div>
                
                <!-- 1. 核心总分大卡片 (Visual Area - 旧模块) -->
                ${visualAreaHtml}
                
                <!-- Actions (点赞栏 - 旧模块) -->
                <div class="insta-actions">
                    <div class="insta-action-left">
                        <i class="ti ti-heart insta-icon liked"></i>
                        <i class="ti ti-message-circle-2 insta-icon"></i>
                        <i class="ti ti-send insta-icon"></i>
                    </div>
                    <i class="ti ti-bookmark insta-icon"></i>
                </div>
                
                <!-- Likes -->
                <div class="insta-likes">${(Math.random()*100 + 50).toFixed(0)} likes</div>
                
                <!-- Caption (文案 - 旧模块) -->
                <div class="insta-caption">
                    <span class="insta-caption-name">${CONFIG.name}教务处</span>
                    本次考试成绩已出炉！${statusTag}，请查收您的学习报告。
                    <span class="insta-tags">#期末考试 #${stu.school} #学习报告</span>
                </div>

                <!-- 2. 🟢 新增：模块④ 学情结构一句话诊断 -->
                ${typeof igDiagnosisHtml !== 'undefined' ? igDiagnosisHtml : ''}

                <!-- 3. 🟢 新增：模块⑤ 优势/短板学科折叠清单 -->
                ${typeof igSubjectListHtml !== 'undefined' ? igSubjectListHtml : ''}

                <!-- 4. 🟢 新增：图表容器 (雷达图/均衡度 - 之前定义的 chartsHtml) -->
                ${chartsHtml}

                <!-- 5. 单科成绩列表 (旧模块) -->
                <div class="insta-comments" style="margin-top:15px;">
                    <div style="color:#8e8e8e; margin-bottom:5px; font-size:12px; font-weight:bold;">📄 单科成绩详情</div>
                    ${commentsHtml}
                </div>

                <!-- 6. 🟢 新增：模块⑥ 家长执行建议 -->
                ${typeof igAdviceHtml !== 'undefined' ? igAdviceHtml : ''}

                <!-- Timestamp -->
                <div class="insta-timestamp">${genDate}</div>
            </div>
            
            <div style="text-align:center; padding:20px; color:#999; font-size:12px;">
                <p>已显示全部数据</p>
                <button class="btn btn-sm btn-gray" onclick="Auth.logout()">退出登录</button>
            </div>
        </div>
    `;
} 

// 3. 🟢 新增：专门用于渲染 IG 风格卡片内 Canvas 的函数 (手机端图表核心逻辑)
function renderIGCharts(stu) {
    // 使用 setTimeout 确保 DOM 元素已经插入页面
    setTimeout(() => {
        // === 绘制雷达图 ===
        const radarCtx = document.getElementById('igRadarChart');
        if (radarCtx) {
            // 防止重复渲染，先销毁旧实例
            if (window.igRadarInstance) window.igRadarInstance.destroy();

            const labels = [];
            const data = [];

            SUBJECTS.forEach(sub => {
                if (stu.scores[sub] !== undefined) {
                    labels.push(sub);
                    
                    // 计算百分位
                    const all = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number').sort((a, b) => b - a);
                    const rank = all.indexOf(stu.scores[sub]) + 1;
                    // (1 - 排名/总数) * 100
                    data.push(((1 - rank / all.length) * 100).toFixed(1));
                }
            });

            window.igRadarInstance = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '能力值',
                        data: data,
                        backgroundColor: 'rgba(37, 99, 235, 0.2)', // 蓝色填充
                        borderColor: '#2563eb',
                        pointBackgroundColor: '#2563eb',
                        pointBorderColor: '#fff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            min: 0,
                            max: 100,
                            ticks: { display: false }, // 隐藏刻度
                            pointLabels: { 
                                font: { size: 11, weight: 'bold' },
                                color: '#333'
                            },
                            grid: { color: 'rgba(0,0,0,0.05)' }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // === 绘制均衡度图 (Z-Score) ===
        const varCtx = document.getElementById('igVarianceChart');
        if (varCtx) {
            if (window.igVarianceInstance) window.igVarianceInstance.destroy();

            const labels = [];
            const zData = [];
            const colors = [];

            // 简单的标准差计算函数
            const calcStats = (arr) => {
                const n = arr.length;
                if (n === 0) return { mean: 0, sd: 1 };
                const mean = arr.reduce((a, b) => a + b, 0) / n;
                const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
                return { mean, sd: Math.sqrt(variance) };
            };

            SUBJECTS.forEach(sub => {
                if (stu.scores[sub] !== undefined) {
                    const allArr = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
                    const stats = calcStats(allArr);
                    
                    let z = 0;
                    if (stats.sd > 0) z = (stu.scores[sub] - stats.mean) / stats.sd;
                    
                    labels.push(sub);
                    zData.push(z);
                    // 正数绿色，负数红色
                    colors.push(z >= 0 ? '#16a34a' : '#dc2626');
                }
            });

            window.igVarianceInstance = new Chart(varCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '标准分 (Z-Score)',
                        data: zData,
                        backgroundColor: colors,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y', // 横向柱状图
                    scales: {
                        x: { 
                            grid: { display: true, color: '#f1f5f9' },
                            title: { display: true, text: '← 弱势 | 强势 →', font: {size: 10}, color:'#94a3b8' }
                        },
                        y: { 
                            grid: { display: false } 
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

    }, 150); // 延时 150ms 确保 HTML 渲染完毕
}

// 3. 🟢 新增：手机端管理器逻辑对象 (MobMgr)
const MobMgr = {
    currentTab: 'home',

    // 1. 初始化手机管理界面
    init: function() {
        // 隐藏 PC 端的大容器及导航
        document.getElementById('app').classList.add('hidden');
        const header = document.querySelector('header');
        if(header) header.style.display = 'none';
        const nav = document.querySelector('.nav-wrapper');
        if(nav) nav.style.display = 'none';
        
        // 显示手机端容器
        const mobApp = document.getElementById('mobile-manager-app');
        mobApp.style.display = 'block';
        
        // 填充用户信息
        const user = Auth.currentUser;
        if(user) {
            document.getElementById('mob-user-name').innerText = user.name;
            const roleMap = { 'admin':'管理员', 'teacher':'教师', 'class_teacher':'班主任', 'grade_director':'级部主任', 'director':'教务主任' };
            document.getElementById('mob-user-role').innerText = roleMap[user.role] || user.role;
        }

        this.switchTab('home');
    },

    // 2. 切换 Tab
    switchTab: function(tabId) {
        this.currentTab = tabId;
        
        // 隐藏所有 view
        document.querySelectorAll('.mob-view').forEach(el => el.classList.remove('active'));
        // 显示目标 view
        const targetView = document.getElementById(`mob-view-${tabId}`);
        if(targetView) targetView.classList.add('active');
        
        // 更新底部导航高亮
        document.querySelectorAll('.mob-nav-btn').forEach(btn => btn.classList.remove('active'));
        // 匹配 onclick 字符串来激活按钮
        const activeBtn = Array.from(document.querySelectorAll('.mob-nav-btn')).find(b => b.getAttribute('onclick').includes(tabId));
        if(activeBtn) activeBtn.classList.add('active');

        // 触发特定页面的渲染逻辑
        if(tabId === 'students') this.renderStudentList();
        if(tabId === 'analysis') this.renderAnalysis();
    },

    // 3. 渲染学生列表 (支持搜索)
    renderStudentList: function() {
        const container = document.getElementById('mob-student-list');
        const keyword = document.getElementById('mob-search-input').value.toLowerCase();
        const user = Auth.currentUser;
        
        let list = RAW_DATA;
        
        // 权限过滤
        if(user) {
            if(user.school) list = list.filter(s => s.school === user.school);
            if(user.role === 'class_teacher' && user.class) {
                list = list.filter(s => s.class === user.class);
            }
        }

        if(keyword) {
            list = list.filter(s => s.name.toLowerCase().includes(keyword) || String(s.id).includes(keyword));
        }

        // 限制显示数量，防止手机 DOM 过多卡顿
        const displayList = list.slice(0, 50);
        
        if(displayList.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">无匹配学生<br><small>请尝试搜索姓名</small></div>';
            return;
        }

        let html = '';
        displayList.forEach(s => {
            // 根据总分给个颜色区分
            const badgeColor = s.total >= 500 ? '#16a34a' : (s.total >= 360 ? '#2563eb' : '#d97706');
            html += `
                <div class="mob-list-item" onclick="MobMgr.showStudentDetail('${s.name}')">
                    <div class="mob-avatar">${s.name[0]}</div>
                    <div class="mob-info">
                        <div class="mob-name">${s.name}</div>
                        <div class="mob-detail">${s.class} | 考号:${s.id}</div>
                    </div>
                    <div class="mob-score-badge" style="color:${badgeColor}">${s.total}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    },

    // 4. 显示学生详情 (复用 IG 风格卡片 + 全屏模态)
    showStudentDetail: function(name) {
        // 简单查找 (实际应考虑同名问题，这里优先取第一个)
        const stu = RAW_DATA.find(s => s.name === name);
        if(!stu) return;
        
        const html = renderInstagramCard(stu);
        
        // 创建临时全屏容器
        let modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0';
        modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.background = '#fafafa';
        modal.style.zIndex = '20000';
        modal.style.overflowY = 'auto';
        // 动画
        modal.style.animation = 'fadeIn 0.2s ease-out';
        
        modal.innerHTML = `
            <div style="position:fixed; top:0; width:100%; padding:10px; background:white; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; z-index:20001;">
                <div style="font-weight:bold; color:#333;">学生详情</div>
                <button onclick="this.closest('div').parentElement.remove()" style="padding:6px 15px; background:#f3f4f6; border:none; border-radius:4px; font-weight:bold; color:#333;">关闭</button>
            </div>
            <div style="padding-top:60px; padding-bottom:40px;">${html}</div>
        `;
        document.body.appendChild(modal);
    },

    // 5. 渲染简单分析 (总览)
    renderAnalysis: function() {
        const container = document.getElementById('mob-analysis-content');
        
        let list = RAW_DATA;
        const user = Auth.currentUser;
        if(user && user.school) {
            list = list.filter(s => s.school === user.school);
        }
        
        if(!list.length) {
            container.innerHTML = '<div style="padding:20px;text-align:center;">暂无数据</div>'; return;
        }
        
        const total = list.length;
        const allTotal = list.map(s=>s.total).reduce((a,b)=>a+b,0);
        const avg = (allTotal / total).toFixed(1);
        
        let html = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; text-align:center;">
                <div style="background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0;">
                    <div style="font-size:24px; font-weight:bold; color:#333;">${total}</div>
                    <div style="font-size:12px; color:#64748b;">本校人数</div>
                </div>
                <div style="background:#f0f9ff; padding:15px; border-radius:8px; border:1px solid #bae6fd;">
                    <div style="font-size:24px; font-weight:bold; color:#2563eb;">${avg}</div>
                    <div style="font-size:12px; color:#0369a1;">年级均分</div>
                </div>
            </div>
            <div style="margin-top:20px; text-align:center; font-size:12px; color:#999;">
                <i class="ti ti-device-desktop"></i><br>更多复杂分析（如进退步、班级对比）<br>请登录电脑端查看
            </div>
        `;
        container.innerHTML = html;
    }
};

// 4. Hook: 拦截 Auth.applyRoleView，实现手机端自动跳转
// 必须确保在 Auth 对象定义之后执行此代码 (通常放在脚本末尾即可)
const originalApplyRoleView = Auth.applyRoleView;
Auth.applyRoleView = function() {
    const isMobile = window.innerWidth <= 768;
    const role = this.currentUser.role;

    // A. 家长角色：始终进入专属的 Parent View (会自动调用 renderInstagramCard)
    if (role === 'parent') {
        this.renderParentView();
        return;
    }

    // B. 教师/管理员 + 手机端：进入 Mobile Manager App
    if (role !== 'parent' && isMobile) {
        MobMgr.init();
        return; // 阻断后续 PC 逻辑
    }

    // C. 其他情况 (PC端)：执行原有逻辑
    originalApplyRoleView.call(this);
};

function printSingleReport() {
    const reportContent = document.getElementById('report-card-capture-area');
    if (!reportContent || reportContent.innerHTML.trim() === "") return uiAlert("请先查询生成报告", 'warning');
    const printContainer = document.createElement('div'); printContainer.id = 'temp-print-wrapper';
    const originalCanvas = reportContent.querySelector('canvas');
    let canvasImg = ''; if (originalCanvas) { canvasImg = `<img src="${originalCanvas.toDataURL()}" style="width:100%; height:100%; object-fit:contain;">`; }
    printContainer.innerHTML = reportContent.innerHTML;
    if (originalCanvas) { const tempCanvasContainer = printContainer.querySelector('.chart-wrapper'); if(tempCanvasContainer) tempCanvasContainer.innerHTML = canvasImg; }
    printContainer.className = 'exam-print-page'; document.body.appendChild(printContainer);
    const style = document.createElement('style'); style.id = 'temp-print-style';
    style.innerHTML = `@media print { body > *:not(#temp-print-wrapper) { display: none !important; } #temp-print-wrapper { display: block !important; width: 100%; position: absolute; top: 0; left: 0; } .report-card-container { box-shadow: none; border: 1px solid #ccc; } -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;
    document.head.appendChild(style); window.print();
    setTimeout(() => { document.body.removeChild(printContainer); document.head.removeChild(style); }, 500);
}

async function downloadSingleReportPDF() {
    const reportContent = document.getElementById('report-card-capture-area');
    if (!reportContent || reportContent.innerHTML.trim() === "") return uiAlert("请先查询生成报告", 'warning');
    if (!window.jspdf || !window.jspdf.jsPDF) return uiAlert('PDF 库未加载，请刷新页面重试', 'error');
    if (typeof html2canvas === 'undefined') return uiAlert('截图引擎未加载，请刷新页面重试', 'error');

    const { jsPDF } = window.jspdf;
    const canvas = await html2canvas(reportContent, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
    }
    pdf.save(`成绩单_${new Date().toISOString().slice(0,10)}.pdf`);
}

async function batchGeneratePDF() {
    const sch = document.getElementById('sel-school').value; const cls = document.getElementById('sel-class').value;
    if (!sch || sch === '--请先选择学校--' || !cls || cls === '--请先选择学校--') { return uiAlert("请先选择学校和班级！", 'warning'); }
    const students = SCHOOLS[sch].students.filter(s => s.class === cls); if (students.length === 0) { return uiAlert("该班级没有学生数据", 'warning'); }
    students.sort((a, b) => b.total - a.total);
    if (window.Swal) {
        const res = await Swal.fire({
            title: '确认批量打印',
            text: `即将生成 ${students.length} 份 A4 报告，是否继续？`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '继续',
            cancelButtonText: '取消'
        });
        if (!res.isConfirmed) return;
    } else if (!confirm(`即将生成 ${students.length} 份 A4 报告。\n\n系统将调用浏览器打印功能，请在打印预览页选择：\n1. 目标打印机：另存为 PDF\n2. 更多设置 -> 勾选“背景图形”\n\n确定继续吗？`)) return;
    const container = document.getElementById('batch-print-container'); container.innerHTML = ''; let batchHtml = '';
    students.forEach(stu => { 
        let reportHtml = renderSingleReportCardHTML(stu, 'A4');
        reportHtml = reportHtml.replace(/<div class="chart-wrapper"[\s\S]*?<\/div>/, '<div style="height:50px; text-align:center; color:#999; line-height:50px; border:1px dashed #eee; margin:10px 0;">(批量打印模式暂不显示雷达图)</div>');
        batchHtml += `<div style="page-break-after: always; padding: 20px; height: 100vh;">${reportHtml}</div>`; 
    });
    container.innerHTML = batchHtml; container.style.display = 'block';
    const style = document.createElement('style'); style.id = 'batch-print-style';
    style.innerHTML = `@media print { body > *:not(#batch-print-container) { display: none !important; } #batch-print-container { display: block !important; } .report-card-container { box-shadow: none !important; border: 2px solid #333 !important; } -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;
    document.head.appendChild(style);
    setTimeout(() => { window.print(); setTimeout(() => { container.style.display = 'none'; container.innerHTML = ''; document.head.removeChild(style); }, 2000); }, 500);
}
