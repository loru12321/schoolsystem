// === 全局搜索 (Spotlight) 逻辑 ===
// 快捷键绑定
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSpotlight();
    }
            // 1. 全局 ESC 关闭逻辑 (Portal 思想)
    if (e.key === 'Escape') {
        // 关闭 Spotlight
        closeSpotlight();
        
        // 关闭所有显示的 Modal (按 z-index 倒序关闭最上层的)
        const modals = Array.from(document.querySelectorAll('.modal'))
            .filter(m => m.style.display !== 'none' && m.style.display !== '')
            .sort((a, b) => {
                const zA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                const zB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                return zB - zA;
            });
        
        if (modals.length > 0) {
            modals[0].style.display = 'none'; // 只关闭最上层的一个
            e.preventDefault(); // 阻止其他默认行为
            return;
        }
    }

    // 2. Spotlight 键盘导航 (ArrowUp / ArrowDown / Enter)
    const spotlightBox = document.getElementById('spotlight-mask');
    if (spotlightBox && spotlightBox.style.display === 'flex') {
        const resultsDiv = document.getElementById('spotlight-results');
        const items = resultsDiv.querySelectorAll('.spotlight-item');
        if (items.length === 0) return;

        // 获取当前选中项索引
        let activeIdx = Array.from(items).findIndex(el => el.classList.contains('active'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = (activeIdx + 1) % items.length;
            updateSpotlightSelection(items, activeIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = (activeIdx - 1 + items.length) % items.length;
            updateSpotlightSelection(items, activeIdx);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIdx >= 0 && items[activeIdx]) {
                items[activeIdx].click(); // 触发点击跳转
            }
        }
    }
});

// 辅助：更新 Spotlight 选中样式
function updateSpotlightSelection(items, index) {
    items.forEach(el => el.classList.remove('active'));
    if (items[index]) {
        items[index].classList.add('active');
        items[index].scrollIntoView({ block: 'nearest' }); // 确保可见
        // 样式补丁：确保 .active 有高亮 (配合 CSS)
        items[index].style.backgroundColor = 'var(--primary-light)';
    }
}

function openSpotlight() {
    document.getElementById('spotlight-mask').style.display = 'flex';
    document.getElementById('spotlight-input').focus();
}
function closeSpotlight() {
    document.getElementById('spotlight-mask').style.display = 'none';
}

let fuseInstance = null;

function initFuse() {
    if (!window.Fuse || RAW_DATA.length === 0) return;
    
    // 配置 Fuse 选项
    const options = {
        keys: ['name', 'id', 'class', 'school'], // 搜索字段
        threshold: 0.3, // 模糊阈值：0.0完全匹配，1.0匹配任何。0.3适合人名容错
        distance: 100,
        ignoreLocation: true, // 忽略位置，只要包含就行
        minMatchCharLength: 2
    };
    fuseInstance = new Fuse(RAW_DATA, options);
}

function doSpotlightSearch() {
    const val = document.getElementById('spotlight-input').value.trim();
    const resDiv = document.getElementById('spotlight-results');
    resDiv.innerHTML = '';
    if(!val) return;

    // 1. 搜功能模块 (保持原有逻辑，简单包含匹配即可)
    const modules = [
        {name: "新生分班", id: "freshman-simulator"}, 
        {name: "考场编排", id: "exam-arranger"},
        {name: "座位微调", id: "seat-adjustment"}, 
        {name: "教师分析", id: "teacher-analysis"},
        {name: "进退步追踪", id: "progress-analysis"}, 
        {name: "两率一分(宏观)", id: "analysis"},
        {name: "临界生任务单", id: "marginal-push"},
        {name: "学生成绩单", id: "report-generator"}
    ];
    
    modules.forEach(m => {
        if(m.name.includes(val)) {
            resDiv.innerHTML += `
                <div class="spotlight-item" onclick="switchTab('${m.id}');closeSpotlight()">
                    <span>🛠️ 功能：${m.name}</span>
                    <span style="font-size:10px;color:#999">跳转</span>
                </div>`;
        }
    });

    // 2. 搜学生 (使用 Fuse.js 模糊搜索)
    let matches = [];
    
    // 如果 Fuse 还没初始化或者数据更新了，重新初始化
    if (!fuseInstance && RAW_DATA.length > 0) initFuse();

    if (fuseInstance) {
        // 使用 Fuse 搜索
        const results = fuseInstance.search(val);
        // Fuse 返回格式是 [{item: ...}, ...]
        matches = results.map(r => r.item).slice(0, 8); // 取前8个
    } else {
        // 降级方案：原有简单搜索
        matches = RAW_DATA.filter(s => s.name.includes(val) || String(s.id).includes(val)).slice(0, 5);
    }

    if (matches.length === 0) {
         resDiv.innerHTML += `<div style="padding:10px; text-align:center; color:#999;">无匹配结果</div>`;
    } else {
        matches.forEach(s => {
            // 高亮匹配文字逻辑略复杂，这里直接显示结果
            resDiv.innerHTML += `
                <div class="spotlight-item" onclick="jumpToStudent('${s.name}', '${s.school}', '${s.class}')">
                    <span>👤 ${s.name} <small style="color:#666">(${s.school} ${s.class})</small></span>
                    <span style="font-weight:bold;">${s.total}分</span>
                </div>`;
        });
    }
}

const SYSTEM_MANUAL = {
    'upload': {
        title: '📁 数据上传与设置·使用说明',
        fit: `用于<strong>导入并规范化成绩数据</strong>，为后续所有分析提供可靠数据基础。`,
        when: `每次考试结束后、首次使用或更换数据来源时使用。`,
        use: `<ul>
                <li><strong>上传文件：</strong>点击虚线框，选择从考务系统导出的原始Excel（支持多选）。系统会自动识别“姓名、班级、科目”。</li>
                <li><strong>教师配置：</strong>若要进行“教师教学评价”，请在下方“教师信息配置”处上传【班级-学科-教师】对应表。</li>
                <li><strong>进退步基准：</strong>若要分析进退步，请在“历史成绩档案库”上传上次考试的成绩文件。</li>
              </ul>`,
        calc: `系统自动清洗数据，缺考/作弊记为0分。`
    },
    'macro': {
        title: '🏆 镇域宏观横向评价·算法说明',
        fit: `用于<strong>校际横向对比</strong>与镇域整体水平研判。`,
        when: `需要对各校进行整体排名、阶段性质量对比或迎检材料汇总时使用。`,
        use: `用于教育组/教研室查看全镇各校排名。点击“生成横向对比表”可查看详细数据。`,
        calc: `<strong>核心公式：两率一分总分 = (均分赋分 + 优率赋分 + 及格赋分)</strong>
               <div class="formula-box">
               均分赋分 = (本校均分 ÷ 全镇最高均分) × 权重(60/40)<br>
               优率赋分 = (本校优率 ÷ 全镇最高优率) × 权重(70/80)<br>
               及格赋分 = (本校及格 ÷ 全镇最高及格) × 权重(70/40)
               </div>
               * 6-8年级权重：60/70/70；9年级权重：40/80/40。`
    },
    'high-score': {
        title: '🌟 9年级高分段核算·算法说明',
        fit: `用于<strong>尖子生培养</strong>与拔尖人才监测。`,
        when: `中考备考阶段或重点关注拔尖学生结构时使用。`,
        use: `仅针对 9 年级中考备考。统计总分 ≥ 490分 (可配置) 的尖子生情况。`,
        calc: `<div class="formula-box">得分 = (本校高分率 ÷ 全镇最高高分率) × 70</div>
               旨在鼓励学校培养拔尖人才。`
    },
    'value-added': {
        title: '📈 增值性评价·算法说明',
        fit: `用于<strong>衡量真实教学增值</strong>，避免仅看入口生源。`,
        when: `有上次成绩可对比、需要评价教学贡献与进步空间时使用。`,
        use: `解决“生源差”学校的评价不公问题。需先在【进退步追踪】模块上传“上次成绩”。`,
        calc: `<div class="formula-box">平均增值 = (入口平均排名 - 出口平均排名)</div>
               正数代表进步，负数代表退步。例如：某校入口均名500，出口均名450，增值 = +50 (大进步)。`
    },
    'bottom3': {
        title: '📉 后1/3学生核算·规则说明',
        fit: `用于<strong>低分率监控</strong>与后进生转化跟踪。`,
        when: `需要识别薄弱学校或班级、制定扶弱计划时使用。`,
        use: `关注“后进生”转化情况，防止低分率过高。`,
        calc: `1. 找出全校总分后 1/3 的学生。<br>
               2. 剔除其中最低分的 <strong>5% (或6%)</strong> (不计入考核，视为特困生)。<br>
               3. 计算剩余后进生的平均分作为考核依据。`
    },
    'indicator': {
        title: '🎯 指标生达标核算·算法说明',
        fit: `用于<strong>目标完成度</strong>与指标生达标考核。`,
        when: `有明确指标生任务数，需考核完成度时使用。`,
        use: `点击蓝色按钮“在线调整目标”设定各校任务数。`,
        calc: `<div class="formula-box">
               得分 = 基础分(满分30) + 附加分<br>
               基础分 = (实际达标 ÷ 目标人数) × 30 (封顶30)<br>
               附加分 = (超额人数 ÷ 全镇最大超额数) × 5
               </div>`
    },
    'summary': {
        title: '📑 综合分析报告·计算方式',
        fit: `用于<strong>汇总全模块成绩</strong>形成总排名报告。`,
        when: `需要一键出具综合汇报或向上级汇报时使用。`,
        use: `点击“生成总排名”汇总所有模块得分。`,
        calc: `<div class="formula-box">总榜得分 = 两率一分得分 + 后1/3得分 + 指标生得分 + (高分段得分)</div>`
    },
    'teacher': {
        title: '👩‍🏫 教师教学质量画像·评价模型',
        fit: `用于<strong>教师教学成效</strong>与班级贡献度分析。`,
        when: `完成教师任课配置后，进行校内绩效评估时使用。`,
        use: `查看每位老师的实绩。需先在数据中心配置【教师任课】。`,
        calc: `<strong>综合绩效分 (默认模型)：</strong><br>
               <div class="formula-box">30(基准) + 贡献值 + 优率分 + 及格分 - 低分惩罚</div>
               其中“贡献值” = 班级均分 - 年级均分。`
    },
    'sse': {
        title: '⚖️ 校内绩效公平考核·算法说明',
        fit: `用于<strong>校内公平考核</strong>与班级工作量补偿。`,
        when: `需要兼顾在籍人数与实考人数差异的绩效评价时使用。`,
        use: `校长室专用。用于计算班级津贴，解决生源不均问题。`,
        calc: `<strong>核心理念：不让老实人吃亏</strong><br>
               1. <strong>实考 vs 在籍</strong>：在籍人数算大班补贴，实考人数算平均分。<br>
               2. <strong>大班补偿</strong>：每多于年级平均人数1人，加0.1分。<br>
               3. <strong>生源增值</strong>：根据学生排名进步情况加分。`
    },
    'class-comp': {
        title: '🏫 班级横向对比·说明',
        fit: `用于<strong>班级间横向对比</strong>与学科差距定位。`,
        when: `需要识别强弱班级、安排分层教学或重点帮扶时使用。`,
        use: `横向比较各班各科实力。全景矩阵中，绿色代表前3名，红色代表后3名。`,
        calc: `<strong>综合排名：</strong> 各科校内排名的平均值。<br>
               * 注：9年级模式下，"综合"列不计入政治科目，但表格中仍会列出。`
    },
    'student-diag': {
        title: '🔎 学情深度诊断·原理说明',
        fit: `用于<strong>个人层面诊断</strong>与精准提分。`,
        when: `期中/期末后需要制定个性化提升方案时使用。`,
        use: `寻找提分点。`,
        calc: `<strong>1. 临界生</strong>：距优生线/及格线差 5 分以内的学生。<br>
               <strong>2. 偏科挖掘</strong>：总分排名靠前，但单科排名严重滞后的学生。<br>
               <strong>3. 优劣势透视</strong>：基于 Z-Score (标准分) 判断学科强弱。`
    },
    'tools': {
        title: '🛠️ 教务考务工具·算法说明',
        fit: `用于<strong>教务考务流程化</strong>与日常工作降本。`,
        when: `开学初、考试前后、宣传展示时使用。`,
        use: `包含新生分班、考场编排、红榜生成。`,
        calc: `<strong>分班算法</strong>：S型蛇形排列 + 均分极差优化 (模拟退火)。<br>
               <strong>考场编排</strong>：同班互斥逻辑 (自动检测并调换同班相邻考生)。`
    },
    'starter-hub': {
        title: '🚀 新手入口·说明',
        fit: `用于<strong>新教师快速上手</strong>，一步完成核心配置。`,
        when: `第一次使用系统或更换学期/届别后。`,
        use: `按“学期 → 成绩 → 任课 → 教师画像”顺序完成配置。`,
        calc: `本页不计算成绩，只提供流程引导、诊断与快捷入口。`
    }
};

function showModuleHelp(key) {
    const info = SYSTEM_MANUAL[key];
    if (!info) {
        Swal.fire({
            title: '📘 模型说明',
            html: `<div class="help-modal-content">
                    <h4>🎯 适合干什么</h4>
                    <div>用于当前模块的功能理解与使用边界说明。</div>
                    <h4>⏱️ 什么时候用</h4>
                    <div>导入数据后，按业务场景进入相应模块使用。</div>
                    <h4>🧮 计算方式 / 底层逻辑</h4>
                    <div>该模块基于系统统一数据模型进行统计与展示。</div>
                </div>`,
            width: 600,
            confirmButtonText: '我明白了',
            confirmButtonColor: '#4f46e5'
        });
        return;
    }
    
    Swal.fire({
        title: info.title,
        html: `
            <div class="help-modal-content">
                <h4>🎯 适合干什么</h4>
                <div>${info.fit || info.use}</div>
                <h4>⏱️ 什么时候用</h4>
                <div>${info.when || '适用于日常教学分析与阶段性教学复盘。'}</div>
                <h4>🧮 计算方式 / 底层逻辑</h4>
                <div>${info.calc}</div>
            </div>
        `,
        width: 600,
        confirmButtonText: '我明白了',
        confirmButtonColor: '#4f46e5'
    });
}

function ensureModuleHelpButton(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    const titleEl = section.querySelector('.sec-head h2') || section.querySelector('.module-desc-bar h3');
    if (!titleEl || titleEl.querySelector('.module-help-btn')) return;
    const btn = document.createElement('span');
    btn.className = 'module-help-btn';
    btn.textContent = '📘 模型说明';
    btn.onclick = () => showModuleHelp(sectionId);
    titleEl.appendChild(btn);
}
