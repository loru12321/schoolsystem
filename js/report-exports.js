// 报表导出 / 模板下载 / 班级PPT

async function exportPPTReport() {
    // --- 0. 基础数据校验 ---
    if (Object.keys(SCHOOLS).length === 0) { 
        alert("暂无数据，无法生成汇报。"); 
        return; 
    }
    var checkSchool = Object.values(SCHOOLS)[0];
    if (!checkSchool.score2Rate) { 
        alert("请先点击【生成总排名】按钮，计算完各项指标后再导出。"); 
        return; 
    }

    // --- 1. PPT 初始化 ---
    var pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9'; 
    pptx.title = CONFIG.name + " 质量分析汇报";
    
    // 颜色定义
    var colorMain = "1E3A8A";    // 深蓝
    var colorSub = "3B82F6";     // 亮蓝
    var colorAccent = "D97706";  // 金色
    var colorBg = "F8FAFC";      // 浅灰背景
    var colorDanger = "DC2626";  // 红色
    var colorSuccess = "166534"; // 绿色

    // --- 2. 母版定义 ---
    pptx.defineSlideMaster({
        title: 'EXEC_REPORT',
        background: { color: colorBg },
        objects: [
            { rect: { x: 0, y: 0, w: "100%", h: 0.6, fill: colorMain } },
            { text: { text: CONFIG.name + " 教学质量监测", x: 0.3, y: 0.15, w: 5, h: 0.3, fontSize: 14, color: "FFFFFF", bold: true } },
            { line: { x: 0.5, y: 6.8, w: 9.0, h: 0, line: { color: "CBD5E1", width: 1 } } },
            { text: { text: "内部教研数据 · 请勿外传", x: 0.5, y: 6.9, w: 4, h: 0.3, fontSize: 9, color: "94A3B8" } }
        ],
        slideNumber: { x: 9.5, y: 6.9, fontSize: 9, color: "94A3B8" } // 右下角页码
    });

    // 辅助函数：将长表格数据分页
    // rows: 表格数据数组（包含表头）
    // maxRowsPerPage: 每页最大行数（含表头）
    function splitTableToSlides(rows, maxRowsPerPage, titleText) {
        var header = rows[0];
        var dataRows = rows.slice(1);
        var chunks = [];
        // 第一页能放 maxRowsPerPage - 1 行数据
        var i = 0;
        while (i < dataRows.length) {
            chunks.push(dataRows.slice(i, i + maxRowsPerPage - 1));
            i += (maxRowsPerPage - 1);
        }
        
        chunks.forEach(function(chunk, index) {
            var slide = pptx.addSlide({ masterName: 'EXEC_REPORT' });
            var pageTitle = titleText + (chunks.length > 1 ? " (" + (index + 1) + "/" + chunks.length + ")" : "");
            slide.addText(pageTitle, { x: 0.5, y: 0.8, fontSize: 18, bold: true, color: colorMain });
            
            // 组合表头和当前页数据
            var currentTable = [header].concat(chunk);
            // 渲染表格
            slide.addTable(currentTable, { 
                x: 0.5, y: 1.3, w: 9.0, // 宽度调整适应 16:9
                fontSize: 9, rowH: 0.35, // 字体缩小，行高缩小
                border: { color: "E2E8F0", pt:0, pb:0 },
                autoPage: false // 手动分页
            });
        });
    }

    // --- 3. 封面页 ---
    var slide1 = pptx.addSlide();
    slide1.background = { color: "FFFFFF" };
    slide1.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 2.5, fill: colorMain });
    slide1.addText("教学质量分析汇报", { x: 0.5, y: 1.2, w: "90%", h: 1, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "黑体" });
    slide1.addText(CONFIG.name + " · " + new Date().getFullYear() + "年", { x: 0.5, y: 0.8, fontSize: 18, color: "93C5FD" });
    
    slide1.addText("汇报概要", { x: 0.5, y: 3.5, fontSize: 14, color: colorMain, bold: true });
    slide1.addShape(pptx.ShapeType.line, { x: 0.5, y: 3.8, w: 0.5, h: 0, line: {color: colorAccent, width: 2} });
    var summaryText = "本次考试共覆盖 " + Object.keys(SCHOOLS).length + " 所学校，参考学生 " + RAW_DATA.length + " 人。\n" +
                      "分析维度包含：两率一分、后1/3转化、指标生完成度及学科均衡性诊断。";
    slide1.addText(summaryText, { x: 0.5, y: 4.0, w: 8, h: 1.5, fontSize: 12, color: "64748B", lineSpacing: 18 });

    // --- 4. 领导看板页 ---
    var slide2 = pptx.addSlide({ masterName: 'EXEC_REPORT' });
    slide2.addText("核心指标看板", { x: 0.5, y: 0.8, fontSize: 20, bold: true, color: colorMain });
    
    var allScores = RAW_DATA.map(function(s) { return s.total; });
    var totalSum = allScores.reduce(function(a, b) { return a + b; }, 0);
    var townAvg = totalSum / allScores.length;
    var townMax = Math.max.apply(null, allScores);
    var sortedSchools = Object.values(SCHOOLS).sort(function(a, b) { return (a.rank2Rate || 999) - (b.rank2Rate || 999); });
    var topSchool = sortedSchools[0];

    // 调整卡片布局以适应更多学校（稍微紧凑一点）
    // 卡片1: 人数
    slide2.addShape(pptx.ShapeType.roundRect, { x: 0.5, y: 1.5, w: 2.0, h: 1.5, fill: "FFFFFF", line: {color: "E2E8F0"}, rectRadius: 0.1 });
    slide2.addText(RAW_DATA.length, { x: 0.5, y: 1.7, w: 2.0, h: 0.6, fontSize: 24, bold: true, color: colorMain, align: 'center' });
    slide2.addText("参考人数", { x: 0.5, y: 2.3, w: 2.0, h: 0.3, fontSize: 10, color: "64748B", align: 'center' });

    // 卡片2: 学校数
    slide2.addShape(pptx.ShapeType.roundRect, { x: 2.8, y: 1.5, w: 2.0, h: 1.5, fill: "FFFFFF", line: {color: "E2E8F0"}, rectRadius: 0.1 });
    slide2.addText(Object.keys(SCHOOLS).length, { x: 2.8, y: 1.7, w: 2.0, h: 0.6, fontSize: 24, bold: true, color: colorSub, align: 'center' });
    slide2.addText("学校总数", { x: 2.8, y: 2.3, w: 2.0, h: 0.3, fontSize: 10, color: "64748B", align: 'center' });

    // 卡片3: 均分
    slide2.addShape(pptx.ShapeType.roundRect, { x: 5.1, y: 1.5, w: 2.0, h: 1.5, fill: "FFFFFF", line: {color: "E2E8F0"}, rectRadius: 0.1 });
    slide2.addText(townAvg.toFixed(1), { x: 5.1, y: 1.7, w: 2.0, h: 0.6, fontSize: 24, bold: true, color: colorSub, align: 'center' });
    slide2.addText("全镇均分", { x: 5.1, y: 2.3, w: 2.0, h: 0.3, fontSize: 10, color: "64748B", align: 'center' });

    // 卡片4: 榜首 (稍微加宽)
    slide2.addShape(pptx.ShapeType.roundRect, { x: 7.4, y: 1.5, w: 2.2, h: 1.5, fill: "FFFFFF", line: {color: "E2E8F0"}, rectRadius: 0.1 });
    slide2.addText(topSchool.name.substring(0,6), { x: 7.4, y: 1.7, w: 2.2, h: 0.6, fontSize: 18, bold: true, color: colorAccent, align: 'center' });
    slide2.addText("综合NO.1", { x: 7.4, y: 2.3, w: 2.2, h: 0.3, fontSize: 10, color: "64748B", align: 'center' });

    // 图表：改为显示所有学校
    slide2.addText("🏆 综合考核得分排名", { x: 0.5, y: 3.5, fontSize: 14, bold: true, color: "1E293B" });
    
    // 移除 slice(0,10)，显示所有学校
    var chartSchools = sortedSchools; 
    
    var chartLabels = chartSchools.map(function(s) { return s.name; });
    var chartValues = chartSchools.map(function(s) { return ((s.score2Rate||0) + (s.scoreBottom||0) + (s.scoreInd||0) + ((s.highScoreStats?s.highScoreStats.score:0)||0)).toFixed(1); });

    slide2.addChart(pptx.ChartType.bar, [{
        name: "考核总分", labels: chartLabels, values: chartValues
    }], {
        x: 0.5, y: 4.0, w: 9.0, h: 3.0, 
        barDir: 'col', chartColors: [colorMain], barGapWidthPct: 40,
        dataLabelPosition: "outEnd", showValue: true, showLegend: false,
        valAxisHidden: true, gridLineNone: true,
        // 动态调整字体大小：学校越多字体越小，防止重叠
        catAxisLabelFontSize: chartSchools.length > 15 ? 7 : 9 
    });

    // --- 5. 第三页：综合总表 (自动分页) ---
    var headers = [
        { text: "排名", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'center', w: 0.6 } },
        { text: "学校", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'left', w: 1.8 } },
        { text: "人数", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'center', w: 0.8 } },
        { text: "两率一分", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'center', w: 1.2 } },
        { text: "后1/3得分", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'center', w: 1.2 } },
        { text: "指标生得分", options: { fill: colorMain, color: "FFFFFF", bold: true, align: 'center', w: 1.2 } },
        { text: "综合总分", options: { fill: colorAccent, color: "FFFFFF", bold: true, align: 'center', w: 1.2 } }
    ];

    var tableRows = [headers];
    sortedSchools.forEach(function(s, i) {
        var isTop3 = i < 3;
        var bgColor = (i % 2 === 0) ? "FFFFFF" : "F1F5F9";
        var boldOpts = isTop3 ? { bold: true, color: colorDanger } : { color: "1E293B" };
        var totalScore = (s.score2Rate||0) + (s.scoreBottom||0) + (s.scoreInd||0);

        tableRows.push([
            { text: i + 1, options: { fill: bgColor, align: 'center', bold: boldOpts.bold, color: boldOpts.color } },
            { text: s.name, options: { fill: bgColor, align: 'left', bold: boldOpts.bold, color: boldOpts.color } },
            { text: s.metrics.total ? s.metrics.total.count : 0, options: { fill: bgColor, align: 'center', color: "64748B" } },
            { text: (s.score2Rate || 0).toFixed(1), options: { fill: bgColor, align: 'center' } },
            { text: (s.scoreBottom || 0).toFixed(1), options: { fill: bgColor, align: 'center' } },
            { text: (s.scoreInd || 0).toFixed(1), options: { fill: bgColor, align: 'center' } },
            { text: totalScore.toFixed(2), options: { fill: bgColor, align: 'center', bold: true, color: colorMain } }
        ]);
    });
    
    // 调用分页函数：每页最多 12 行 (含表头)
    splitTableToSlides(tableRows, 12, "综合考核总表");

    // --- 6. 循环生成学科页 (分页表格 + 分页图表) ---
    SUBJECTS.forEach(function(sub) {
        // 获取该学科数据并排序
        var subData = Object.values(SCHOOLS).filter(function(s) { return s.metrics[sub] !== undefined; })
            .sort(function(a, b) { return b.metrics[sub].avg - a.metrics[sub].avg; });

        if(subData.length === 0) return;

        // 6.1 生成学科表格页 (可能有多页)
        var subHeaders = [
            { text: "排名", options: { fill: "DBEAFE", color: colorMain, bold: true, align: 'center', w: 0.6 } },
            { text: "学校", options: { fill: "DBEAFE", color: colorMain, bold: true, align: 'left', w: 1.8 } },
            { text: "均分", options: { fill: "DBEAFE", color: colorMain, bold: true, align: 'center', w: 1.0 } },
            { text: "优秀率", options: { fill: "DBEAFE", color: colorMain, bold: true, align: 'center', w: 1.0 } },
            { text: "及格率", options: { fill: "DBEAFE", color: colorMain, bold: true, align: 'center', w: 1.0 } }
        ];
        
        var subRows = [subHeaders];
        subData.forEach(function(s, i) {
            var m = s.metrics[sub];
            subRows.push([
                i + 1, 
                s.name, 
                m.avg.toFixed(1), 
                (m.excRate * 100).toFixed(1) + "%",
                (m.passRate * 100).toFixed(1) + "%"
            ]);
        });
        // 每页 12 行表格
        splitTableToSlides(subRows, 12, "📘 " + sub + " · 数据详情");

        // 6.2 生成学科图表页 (一页展示前10，如果超多再加页，这里为了PPT简洁，只展示一页概览图表)
        var subChartSlide = pptx.addSlide({ masterName: 'EXEC_REPORT' });
        subChartSlide.addText("📘 " + sub + " · 校际横向对比", { x: 0.5, y: 0.8, fontSize: 18, bold: true, color: colorMain });

        // 图表数据 (如果超过14个学校，X轴字体自动缩小)
        var chartNames = subData.map(function(s) { return s.name; });
        var chartAvgs = subData.map(function(s) { return s.metrics[sub].avg; });
        
        // 计算极差用于诊断
        var topSc = subData[0];
        var botSc = subData[subData.length - 1];
        var gap = (topSc.metrics[sub].avg - botSc.metrics[sub].avg).toFixed(1);
        var gapColor = parseFloat(gap) > 10 ? colorDanger : colorSuccess;

        // 绘制横向条形图
        subChartSlide.addChart(pptx.ChartType.bar, [{
            name: "平均分", labels: chartNames, values: chartAvgs
        }], {
            x: 0.5, y: 1.3, w: 9.0, h: 4.5, // 占满宽度
            barDir: 'col', // 改为纵向柱状图，能放下更多学校
            chartColors: [colorSub],
            dataLabelPosition: "outEnd", showValue: true, showLegend: false,
            catAxisLabelFontSize: chartNames.length > 10 ? 8 : 10, // 自适应字体
            title: { text: "校际均分排名", fontSize: 11, color: "64748B" }
        });

        // 底部诊断
        subChartSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 6.0, w: 9.0, h: 0.8, fill: "FFFBEB", line: { color: "FCD34D", width: 1 } });
        subChartSlide.addText("💡 智能诊断结论：", { x: 0.6, y: 6.1, fontSize: 10, bold: true, color: colorAccent });
        subChartSlide.addText([
            { text: "本学科第一名为 ", options: { color: "475569" } },
            { text: topSc.name, options: { bold: true, color: colorMain } },
            { text: "，最后一名为 " + botSc.name + "。校际极差达 ", options: { color: "475569" } },
            { text: gap + "分", options: { bold: true, color: gapColor } },
            { text: "。建议关注后进学校的 " + sub + " 学科教学整改。", options: { color: "475569" } }
        ], { x: 0.6, y: 6.4, w: 8.5, h: 0.4, fontSize: 10 });
    });

    // --- 7. 导出 ---
    var dateStr = new Date().toISOString().slice(0,10);
    pptx.writeFile({ fileName: CONFIG.name + "_汇报材料_" + dateStr + ".pptx" });
}

function exportTeacherAnalysis() {
    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher' || role === 'class_teacher') {
        logAction('导出拦截', '教师尝试导出教师分析');
        return alert('⛔ 权限不足：当前角色禁止导出教师分析');
    }
    if (!MY_SCHOOL || Object.keys(TEACHER_STATS).length === 0) { alert('请先选择本校并配置教师信息'); return; }
    analyzeTeachers();
    alert('教师分析数据已准备就绪，请查看"本校教师分析"标签页');
}

function downloadTemplate(type) {
    const wb = XLSX.utils.book_new();
    let headers = [];
    let sampleData = [];
    let filename = "模板.xlsx";
    let sheetName = "成绩表";

    switch(type) {
        case 'primary':
            headers = ["学校", "班级", "姓名", "考号", "语文", "数学", "英语"];
            sampleData = [
                ["实验小学", "601", "张三", "2024001", 95, 98, 92],
                ["实验小学", "601", "李四", "2024002", 88, 90, 85]
            ];
            filename = "小学期末考试_标准模板.xlsx";
            break;
        case 'junior':
            headers = ["学校", "班级", "姓名", "考号", "语文", "数学", "英语", "物理", "历史", "地理", "生物", "政治"];
            sampleData = [
                ["镇中", "801", "王五", "2024101", 105, 110, 108, 85, 90, 88, 92, 80],
                ["镇中", "801", "赵六", "2024102", 98, 102, 95, 78, 85, 80, 88, 75]
            ];
            filename = "初中月考_标准模板.xlsx";
            break;
        case 'grade9':
            headers = ["学校", "班级", "姓名", "考号", "语文", "数学", "英语", "物理", "化学", "政治", "历史", "体育"];
            sampleData = [
                ["一中", "901", "孙七", "2024901", 112, 115, 110, 68, 48, 55, 58, 40],
                ["一中", "901", "周八", "2024902", 105, 108, 102, 60, 42, 50, 52, 38]
            ];
            filename = "中考一模_标准模板.xlsx";
            break;
        case 'teacher':
            headers = ["班级", "学科", "教师姓名"];
            sampleData = [
                ["701", "语文", "张老师"],
                ["701", "数学", "李老师"],
                ["702", "语文", "张老师"],
                ["702", "数学", "王老师"]
            ];
            filename = "教师任课信息_导入模板.xlsx";
            sheetName = "任课表";
            break;
    }

    const wsData = [headers, ...sampleData];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // 设置列宽，让模板稍微好看点
    ws['!cols'] = headers.map(() => ({ wch: 15 }));

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    
    if(window.UI) UI.toast(`✅ 已下载：${filename}`, "success");
    logAction('下载模板', filename);
}

// --- 班级分析会 PPT 生成器 (修复图表数据结构) ---
async function generateClassPPT() {
    // 1. 检查库
    if (typeof PptxGenJS === 'undefined') {
        return alert("❌ 错误：缺少 PPT 生成库。\n请刷新页面重试，或检查网络是否能加载 cdn.jsdelivr.net。");
    }

    const sch = document.getElementById('studentSchoolSelect').value;
    const cls = document.getElementById('studentClassSelect').value;
    
    if (!sch || sch.includes('请选择')) return alert("请先选择【学校】！");
    if (!cls || cls === '全部' || cls.includes('请选择')) return alert("请先选择【具体班级】！");

    const students = RAW_DATA.filter(s => s.school === sch && s.class === cls);
    if (students.length === 0) return alert("该班级没有数据！");

    try {
        // --- 数据准备 ---
        students.sort((a,b) => b.total - a.total);
        const count = students.length;
        const avg = students.reduce((a,b) => a + b.total, 0) / count;
        const maxScore = students[0].total;
        const minScore = students[students.length - 1].total;
        
        // 获取年级数据 (用于对比)
        const schoolData = SCHOOLS[sch];
        const gradeStats = schoolData.metrics.total || { avg: 0, excRate: 0, passRate: 0 };

        // 计算班级两率
        const excLine = THRESHOLDS.total?.exc || 0;
        const passLine = THRESHOLDS.total?.pass || 0;
        const clsExcCount = students.filter(s => s.total >= excLine).length;
        const clsPassCount = students.filter(s => s.total >= passLine).length;
        const clsExcRate = clsExcCount / count;
        const clsPassRate = clsPassCount / count;

        // --- PPT 初始化 ---
        let pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_16x9';
        pptx.title = `${cls}班 学情分析报告`;
        
        // 配色方案
        const C_MAIN = "1E3A8A";  // 深蓝
        const C_ACCENT = "F59E0B"; // 金色
        const C_TEXT = "374151";   // 深灰

        // 母版
        pptx.defineSlideMaster({
            title: 'MASTER',
            background: { color: "FFFFFF" },
            objects: [
                { rect: { x: 0, y: 0, w: "100%", h: 0.6, fill: C_MAIN } },
                { text: { text: `${sch} ${cls}班 | ${CONFIG.name} 学情分析`, x: 0.2, y: 0.15, fontSize: 14, color: "FFFFFF", bold: true } },
                { line: { x: 0.5, y: 6.8, w: 9, h: 0, line: { color: "E5E7EB", width: 1 } } },
                { text: { text: "内部教研资料 · 请勿外传", x: 0.5, y: 6.9, fontSize: 10, color: "9CA3AF" } },
                { text: { text: "生成日期: " + new Date().toLocaleDateString(), x: 9, y: 6.9, w:3, align:'right', fontSize: 10, color: "9CA3AF" } }
            ],
            slideNumber: { x: 12.3, y: 6.9, fontSize: 10, color: "9CA3AF" }
        });

        // ================= 第1页：封面 =================
        let slide = pptx.addSlide();
        slide.background = { color: C_MAIN };
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 4, h: 7.5, fill: "172554" });
        slide.addText("成绩分析与\n教学诊断报告", { x: 0.8, y: 2.5, w: 6, fontSize: 40, bold: true, color: "FFFFFF", fontFace: "微软雅黑" });
        slide.addText(`${CONFIG.name}`, { x: 0.8, y: 4.5, fontSize: 20, color: C_ACCENT, bold: true });
        slide.addText(`汇报班级：${cls}班`, { x: 0.8, y: 5.2, fontSize: 16, color: "E0F2FE" });
        slide.addText("数据驱动 · 精准施教 · 科学提升", { x: 5, y: 3.5, w: 7, align: 'center', fontSize: 24, color: "FFFFFF", bold: true, letterSpacing: 3, shadow: {type:'outer', color:'000000', opacity:0.3} });

        // ================= 第2页：目录 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("汇报目录 / Contents", { x: 0.5, y: 1, fontSize: 24, bold: true, color: C_MAIN });
        const chapters = ["班级整体概况 (均分/两率)", "分数段分布与极差分析", "学科优劣势深度诊断", "关键学生名单 (光荣榜/临界生)", "教学建议与改进措施"];
        chapters.forEach((t, i) => {
            let y = 2.2 + i * 0.9;
            slide.addShape(pptx.ShapeType.roundRect, { x: 1.5, y: y, w: 0.6, h: 0.6, fill: C_MAIN, rectRadius: 0.1 });
            slide.addText("0"+(i+1), { x: 1.5, y: y, w: 0.6, h: 0.6, align: 'center', fontSize: 14, color: "FFFFFF", bold: true });
            slide.addText(t, { x: 2.3, y: y, w: 8, h: 0.6, fontSize: 16, color: C_TEXT, bold: true });
            slide.addShape(pptx.ShapeType.line, { x: 2.3, y: y+0.7, w: 8, h: 0, line: { color: "E5E7EB", dashType: 'dash' } });
        });

        // ================= 第3页：班级核心指标 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("01 班级整体概况", { x: 0.5, y: 1, fontSize: 20, bold: true, color: C_MAIN });

        const kpiStyle = { w: 2.8, h: 1.6, fill: "FFFFFF", border: { color: "E5E7EB" }, shadow: {type:'outer', blur:3, offset:2, opacity:0.1} };
        const kpiY = 1.8;
        
        // KPI 卡片绘制函数
        const drawKPI = (x, val, label, diff=null) => {
            slide.addShape(pptx.ShapeType.roundRect, { x: x, y: kpiY, ...kpiStyle });
            slide.addText(val, { x: x, y: kpiY+0.3, w: 2.8, align:'center', fontSize: 32, bold:true, color:C_MAIN });
            slide.addText(label, { x: x, y: kpiY+1.1, w: 2.8, align:'center', fontSize: 10, color:"6B7280" });
            if(diff !== null) {
                slide.addText(`${diff>=0?'+':''}${diff.toFixed(1)}`, { x: x+2, y: kpiY+0.1, fontSize:10, bold:true, color: diff>=0?"16A34A":"DC2626" });
            }
        };

        drawKPI(0.5, avg.toFixed(1), `班级均分 (年级${gradeStats.avg.toFixed(1)})`, avg - gradeStats.avg);
        drawKPI(3.5, `${(clsExcRate*100).toFixed(1)}%`, `优秀率 (年级${(gradeStats.excRate*100).toFixed(1)}%)`, (clsExcRate-gradeStats.excRate)*100);
        drawKPI(6.5, `${(clsPassRate*100).toFixed(1)}%`, `及格率 (年级${(gradeStats.passRate*100).toFixed(1)}%)`, (clsPassRate-gradeStats.passRate)*100);
        drawKPI(9.5, (maxScore-minScore).toFixed(0), `分差 (最高${maxScore}-最低${minScore})`);

        // [修复] 图表数据结构：必须包含 labels 和 values
        const chartLabels = ["平均分", "优秀率%", "及格率%"];
        const chartData = [
            { name: "本班", labels: chartLabels, values: [avg, clsExcRate*100, clsPassRate*100] },
            { name: "年级", labels: chartLabels, values: [gradeStats.avg, gradeStats.excRate*100, gradeStats.passRate*100] }
        ];

        slide.addChart(pptx.ChartType.bar, chartData, {
            x: 2, y: 4, w: 9, h: 3,
            barDir: 'col', barGrouping: 'clustered',
            chartColors: [C_MAIN, "9CA3AF"],
            catAxisLabelColor: C_TEXT, valAxisHidden: true,
            showValue: true, showLegend: true,
            title: { text: "核心指标对比图", fontSize: 11, color: "6B7280" }
        });

        // ================= 第4页：分数段分布 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("02 分数段分布 (整体结构)", { x: 0.5, y: 1, fontSize: 20, bold: true, color: C_MAIN });

        const step = 50; 
        const maxCeil = Math.ceil(maxScore / step) * step;
        const segmentLabels = [];
        const segmentValues = [];
        
        for (let i = maxCeil; i > 0; i -= step) {
            const low = i - step;
            const high = i;
            const c = students.filter(s => s.total > low && s.total <= high).length;
            if (c > 0 || segmentValues.length > 0) {
                segmentLabels.push(`${low}-${high}`);
                segmentValues.push(c);
            }
        }

        if (segmentLabels.length > 0) {
            slide.addChart(pptx.ChartType.bar, [
                { name: "人数", labels: segmentLabels, values: segmentValues }
            ], {
                x: 0.5, y: 1.8, w: 7.5, h: 4.5,
                barDir: 'col', chartColors: [C_MAIN],
                showValue: true, title: { text: "班级分数分布图", fontSize: 12 }
            });
        }

        // 右侧文字
        slide.addText("💡 结构诊断：", { x: 8.5, y: 2, fontSize: 14, bold: true, color: C_ACCENT });
        const topRatio = (students.slice(0, Math.ceil(count*0.2)).reduce((a,b)=>a+b.total,0) / Math.ceil(count*0.2)).toFixed(0);
        slide.addText([
            { text: "● 尖子生群体：", options: { bold:true, color:C_TEXT } },
            { text: `前20%学生均分为 ${topRatio} 分。\n\n`, options: { fontSize:12, color:"666666" } },
            { text: "● 中间层断档：", options: { bold:true, color:C_TEXT } },
            { text: `请关注 ${Math.floor(avg-30)}-${Math.floor(avg+30)} 分段的学生。`, options: { fontSize:12, color:"666666" } }
        ], { x: 8.5, y: 2.5, w: 4, h: 3, fill: "F9FAFB", inset:0.2 });

        // ================= 第5页：学科深度诊断 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("03 学科优劣势深度诊断", { x: 0.5, y: 1, fontSize: 20, bold: true, color: C_MAIN });

        const subHeaders = [
            { text: "学科", options: { fill: C_MAIN, color: "FFFFFF", bold: true, align: 'center', w:1.2 } },
            { text: "班级均分", options: { fill: "DBEAFE", color: C_TEXT, bold: true, align: 'center' } },
            { text: "年级均分", options: { fill: "DBEAFE", color: C_TEXT, bold: true, align: 'center' } },
            { text: "差值", options: { fill: "DBEAFE", color: C_TEXT, bold: true, align: 'center' } },
            { text: "班级优率%", options: { fill: "FEF3C7", color: C_TEXT, bold: true, align: 'center' } },
            { text: "班级及格%", options: { fill: "D1FAE5", color: C_TEXT, bold: true, align: 'center' } }
        ];

        const subRows = [subHeaders];
        
        SUBJECTS.forEach(sub => {
            const m = schoolData.metrics[sub]; 
            if (!m) return;
            
            const subScores = students.map(s => s.scores[sub]).filter(v => typeof v === 'number');
            const cnt = subScores.length || 1;
            const sAvg = subScores.reduce((a,b)=>a+b,0) / cnt;
            const sExc = subScores.filter(v => v >= THRESHOLDS[sub].exc).length / cnt;
            const sPass = subScores.filter(v => v >= THRESHOLDS[sub].pass).length / cnt;
            const diff = sAvg - m.avg;

            subRows.push([
                { text: sub, options: { bold: true, align: 'center' } },
                { text: sAvg.toFixed(1), options: { align: 'center' } },
                { text: m.avg.toFixed(1), options: { align: 'center', color: "666666" } },
                { text: (diff>=0?'+':'') + diff.toFixed(1), options: { align: 'center', bold: true, color: diff>=0?"16A34A":"DC2626" } },
                { text: (sExc*100).toFixed(1), options: { align: 'center' } },
                { text: (sPass*100).toFixed(1), options: { align: 'center' } }
            ]);
        });

        slide.addTable(subRows, { x: 0.5, y: 1.8, w: 12.3, fontSize: 10, rowH: 0.5, border: { color: "E5E7EB" } });

        // ================= 第6页：光荣榜 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("04 榜样力量", { x: 0.5, y: 1, fontSize: 20, bold: true, color: C_MAIN });

        slide.addText("🏆 学习标兵 (Top 10)", { x: 0.8, y: 1.8, fontSize: 14, bold: true, color: C_ACCENT });
        const top10Names = students.slice(0, 10).map((s,i) => `${i+1}.${s.name}(${s.total})`).join("  ");
        slide.addText(top10Names, { x: 0.8, y: 2.2, w: 11.5, h: 1.2, fill: "FFFBEB", color: "B45309", fontSize: 14, inset: 0.2, border: {color:"FCD34D"} });

        if (PROGRESS_CACHE && PROGRESS_CACHE.length > 0) {
            slide.addText("📈 进步之星 (较上次考试)", { x: 0.8, y: 3.8, fontSize: 14, bold: true, color: "16A34A" });
            const stars = PROGRESS_CACHE.filter(p => p.class === cls && p.change > 0).sort((a,b) => b.change - a.change).slice(0, 12);
            const starNames = stars.map(p => `${p.name}↑${p.change}`).join("  ");
            slide.addText(starNames || "暂无显著进步数据", { x: 0.8, y: 4.2, w: 11.5, h: 1.2, fill: "DCFCE7", color: "166534", fontSize: 14, inset: 0.2, border: {color:"86EFAC"} });
        }

        // ================= 第7页：临界生 =================
        slide = pptx.addSlide({ masterName: 'MASTER' });
        slide.addText("🎯 重点关注 (临界生)", { x: 0.5, y: 1, fontSize: 20, bold: true, color: C_MAIN });
        
        const marginalGap = 5;
        let marginalHtml = [];
        SUBJECTS.forEach(sub => {
            const excLine = THRESHOLDS[sub].exc;
            const passLine = THRESHOLDS[sub].pass;
            const excMarginal = students.filter(s => s.scores[sub] >= excLine - marginalGap && s.scores[sub] < excLine).map(s => s.name);
            const passMarginal = students.filter(s => s.scores[sub] >= passLine - marginalGap && s.scores[sub] < passLine).map(s => s.name);
            
            if(excMarginal.length > 0 || passMarginal.length > 0) {
                marginalHtml.push([
                    { text: sub, options: { bold:true, fill: "F3F4F6" } },
                    { text: "冲刺优: " + (excMarginal.join("、") || "-"), options: { color: "0369A1", fontSize: 9 } },
                    { text: "保及格: " + (passMarginal.join("、") || "-"), options: { color: "B45309", fontSize: 9 } }
                ]);
            }
        });

        if(marginalHtml.length > 0) {
            // 表头
            const mHeader = [{ text:"学科", options:{bold:true, w:1.2} }, { text:"冲刺优秀 (差<5分)", options:{bold:true, w:5.4} }, { text:"保及格 (差<5分)", options:{bold:true, w:5.4} }];
            slide.addTable([mHeader, ...marginalHtml], { x: 0.5, y: 1.8, w: 12, border: { color: "E5E7EB" }, rowH: 0.6, fontSize:10 });
        } else {
            slide.addText("暂无明显临界生。", { x: 0.5, y: 3, color: "9CA3AF" });
        }

        // ================= 第8页：结束语 =================
        slide = pptx.addSlide();
        slide.background = { color: C_MAIN };
        slide.addText("感谢各位家长的配合！", { x: 0, y: 2.5, w: "100%", align: 'center', fontSize: 36, bold: true, color: "FFFFFF" });
        slide.addText("家校共育 · 静待花开", { x: 0, y: 3.5, w: "100%", align: 'center', fontSize: 20, color: C_ACCENT });

        pptx.writeFile({ fileName: `${sch}_${cls}班_深度分析报告.pptx` });

    } catch (e) {
        console.error(e);
        alert("生成出错：" + e.message);
    }
}
