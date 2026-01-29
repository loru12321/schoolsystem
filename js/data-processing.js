// ================= 数据处理 =================
const fileInputEl = document.getElementById('fileInput');
if (fileInputEl) fileInputEl.addEventListener('change', function(e) {
    if (isArchiveLocked()) return alert("⛔ 当前考试已封存，禁止上传新数据");
    if (!CURRENT_COHORT_ID) return alert("请先选择或新建届别");
    if (!CURRENT_EXAM_ID) {
        setCurrentExamMeta();
        if (!CURRENT_EXAM_ID) return;
    }
    const files = e.target.files; 
    if(!files.length) return;

    // 使用 Perf.runAsync 包裹，实现加载动画 + 防卡死
    Perf.runAsync(async () => {
        // 重置数据
        RAW_DATA = []; SCHOOLS = {}; SUBJECTS = []; setTeacherMap({}); TEACHER_STATS = {}; 
        TEACHER_TOWNSHIP_RANKINGS = {}; MARGINAL_STUDENTS = {}; POTENTIAL_STUDENTS_CACHE = []; TOWNSHIP_RANKING_DATA = {}; MY_SCHOOL = "";
        document.getElementById('teacherCardsContainer').innerHTML = ''; 
        document.getElementById('teacherComparisonTable').querySelector('tbody').innerHTML = '';
        document.getElementById('teacher-township-ranking-container').innerHTML = ''; 
        document.getElementById('studentDetailTable').querySelector('tbody').innerHTML = '';
        document.getElementById('marginal-student-results').innerHTML = '';
        
        // 耗时操作
        for(let f of files) await readExcel(f);
        SUBJECTS.sort(sortSubjects);
        await processData(); // 这是一个耗时操作

        updateSchoolMode();

        // 🟣 Cohort：写入考试快照并执行智能匹配
        await CohortDB.syncCurrentExam();
        
        // 🟢 [新增] 处理完数据后，立即同步到云端 (仅管理员有效)
        // 注意：因为是异步，我们在后台默默保存，不阻塞界面显示
        saveCloudData().then(() => {
            console.log("自动备份完成");
        }).catch(e => console.error("自动备份失败", e));
        renderTables();            
        applySchoolModeToTables();
        // 更新所有下拉框
        updateSchoolSelect(); updateMySchoolSelect(); updateStudentSchoolSelect(); updateMarginalSchoolSelect(); 
        updateClassSelect(); updateSegmentSelects(); updateClassCompSchoolSelect(); updatePotentialSchoolSelect(); 
        updateDiagnosisSelects(); updateCorrelationSchoolSelect(); updateSeatAdjSelects(); updateProgressSchoolSelect(); 
        updateMutualAidSelects(); updateMpSchoolSelect(); 

        document.getElementById('msg-box').innerText = `✅ 成功导入 ${Object.keys(SCHOOLS).length} 所学校，共 ${RAW_DATA.length} 名学生`;
        UI.toast(`✅ 导入成功！包含 ${RAW_DATA.length} 条数据`, 'success');
        logAction('导入', `成绩导入 ${RAW_DATA.length} 条`);
        updateStatusPanel();
    }, "正在解析 Excel 并计算排名...");
});
else console.warn('[data-processing] 未找到 fileInput，已跳过绑定。');

async function readExcel(file) {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array'});
    wb.SheetNames.forEach(sname => {
        if(sname.includes('二模本校') || sname.includes('各班各科') || sname.includes('横向对比')) return;
        const json = XLSX.utils.sheet_to_json(wb.Sheets[sname], {header:1});
        if(json.length < 2) return;
        parseRows(json, sname);
    });
}

// =========== 🔥 修改重点：parseRows 全自动版 (含缺考录入) ===========
// 逻辑说明：
// 1. 只要Excel里有姓名，就录入系统，作为【在籍人数】的基数。
// 2. 只有当学生有有效分数时，标记 hasValidScore=true，作为【实考人数】的基数。
function parseRows(rows, defaultSchool) {
    const headers = rows[0].map(h => String(h).trim());
    
    // 1. 初始化索引映射
    const idxMap = { name: -1, id: -1, school: -1, class: -1, examRoom: -1, scores: {} };

    // 2. 别名匹配
    const aliasMap = {
        name: ['姓名', '学生姓名', '学生', 'Name', '考生姓名'],
        id: ['考号', '学号', '准考证号', 'ID', '考生号'],
        // school: 忽略表内学校列，强制使用Sheet名
        class: ['班级', '班', '班次', 'Class', '行政班'],
        examRoom: ['考场', '考室', 'Room', '考试地点']
    };
    
    // 增加容错：常见的学科名称
    const subjectMap = { '语文':'语文', '数学':'数学', '英语':'英语', '物理':'物理', '化学':'化学', '政治':'政治', '道法':'政治', '道德与法治':'政治', '历史':'历史', '地理':'地理', '生物':'生物', '科学':'科学' };
    const excludeKeywords = ['排', '次', '级', 'Rank', '赋分', '标准分', 'T分', '折算', '等级', '优劣'];

    // 3. 扫描表头
    headers.forEach((h, i) => {
        const hTrim = h.replace(/\s+/g, '');
        for (const [key, aliases] of Object.entries(aliasMap)) {
            if (aliases.some(alias => hTrim.includes(alias))) idxMap[key] = i;
        }
        for (const [key, standardName] of Object.entries(subjectMap)) {
            if(h.includes(key) && !excludeKeywords.some(ex => h.includes(ex))) {
                if(!idxMap.scores[standardName]) idxMap.scores[standardName] = [];
                idxMap.scores[standardName].push(i);
                if(!SUBJECTS.includes(standardName)) SUBJECTS.push(standardName);
            }
        }
    });

    if(CONFIG.analysisSubs && CONFIG.analysisSubs !== 'auto') {
        SUBJECTS = SUBJECTS.filter(s => CONFIG.analysisSubs.includes(s));
    }
    const subsForTotal = CONFIG.totalSubs === 'auto' ? SUBJECTS : CONFIG.totalSubs;

    // 1. 全角转半角工具 (针对分数录入错误)
    const toHalfWidth = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
                  .replace(/\u3000/g, ' ');
    };

    // 2. 姓名清洗工具 (去除空格、不可见字符)
    const cleanNameStr = (str) => {
        if (!str) return "";
        return String(str).replace(/\s+/g, '').replace(/[\u200b-\u200f\uFEFF]/g, '');
    };

    // 4. 遍历数据 (核心修改区)
    for(let i=1; i<rows.length; i++) {
        const r = rows[i]; 
        if(!r || !r.length) continue;

        // --- 修改点 A: 姓名处理 ---
        // 如果找不到姓名列，或者单元格为空，自动生成 "匿名考生_行号"
        let rawName = idxMap.name !== -1 ? (r[idxMap.name] || "") : "";
        let nameStr = cleanNameStr(rawName);

        if (!nameStr || nameStr === '-' || nameStr === '0' || nameStr === '0.0' || nameStr === '姓名') {
            nameStr = `考生${String(i).padStart(3, '0')}`;
        }

        // --- 修改点 B: 班级处理 ---
        // 如果找不到班级列，默认为 "未分班"
        let classStr = "未分班";
        if (idxMap.class !== -1 && r[idxMap.class]) {
            classStr = normalizeClass(r[idxMap.class]);
        }

        const stu = { 
            name: nameStr, 
            id: idxMap.id !== -1 ? r[idxMap.id] : '-', 
            
            // 强制使用Sheet名作为学校
            school: defaultSchool, 
            class: classStr, 
            
            examRoom: idxMap.examRoom !== -1 ? r[idxMap.examRoom] : '-', 
            scores: {}, 
            total: 0,
            hasValidScore: false 
        };
        
        // 数据读取逻辑
        let hasAnyScore = false;
        SUBJECTS.forEach(sub => {
            const colIndices = idxMap.scores[sub];
            if(colIndices && colIndices.length > 0) {
                let subSum = 0;
                let validSub = false;
                colIndices.forEach(idx => {
                    let rawVal = r[idx];
                    // 如果是字符串，先尝试转半角
                    if (typeof rawVal === 'string') {
                        rawVal = toHalfWidth(rawVal).trim();
                    }
                    let val = parseFloat(rawVal);

                    // 如果解析结果不是数字，进行智能清洗
                    if (isNaN(val)) {
                        const strVal = String(rawVal || "").trim().toUpperCase(); // 转大写去空格
                        
                        // 定义由于特殊原因导致的“0分”关键词
                        // 缺考(ABS/Q/缺), 作弊(CHE/违纪), 病假(BJ), 缓考 等
                        const zeroKeywords = ["缺", "ABS", "作弊", "违纪", "病假", "缓考", "取消", "零分", "Q", "CHE"];
                        
                        // 如果包含上述关键词，强制视为 0 分 (参与排名)
                        if (zeroKeywords.some(key => strVal.includes(key))) {
                            val = 0;
                        } 
                        // 否则，该数据依然为 NaN，后续逻辑会自动“排除” (不参与均分计算)
                    }
                    if(!isNaN(val)) { subSum += val; validSub = true; }
                });
                if(validSub) {
                    stu.scores[sub] = parseFloat(subSum.toFixed(2));
                    stu.hasValidScore = true;
                    hasAnyScore = true;
                    if (subsForTotal.includes(sub)) stu.total += subSum;
                }
            }
        });

        // 如果这一行完全没有成绩，并且名字也是自动生成的，大概率是空行，跳过
        if (!hasAnyScore && nameStr.startsWith("考生")) continue;

        stu.total = parseFloat(stu.total.toFixed(2));
        RAW_DATA.push(stu);
        
        if(!SCHOOLS[stu.school]) SCHOOLS[stu.school] = { name: stu.school, students: [], metrics: {}, rankings: {} };
        SCHOOLS[stu.school].students.push(stu);
    }
    updateStatusPanel();
}

function normalizeClass(classStr) {
    if (!classStr) return '';
    let normalized = String(classStr).replace(/班/g, '').replace(/\s/g, '');
    if (normalized.includes('.')) return normalized;
    else if (/^\d+$/.test(normalized)) {
        const grade = String(getActiveGrade() || '6');
        return `${grade}.${normalized}`;
    } else if (/^[6789]\d+$/.test(normalized)) { const grade = normalized.charAt(0); const classNum = normalized.substring(1); return `${grade}.${classNum}`; }
    return classStr;
}

function normalizeSubject(subj) {
    if (!subj) return '';
    const s = String(subj).replace(/\s/g, '').trim();
    const subjectMap = {
        '语文': '语文',
        '数学': '数学',
        '英语': '英语',
        '物理': '物理',
        '化学': '化学',
        '政治': '政治',
        '道法': '政治',
        '道德与法治': '政治',
        '思政': '政治',
        '历史': '历史',
        '地理': '地理',
        '生物': '生物',
        '生物学': '生物',
        '科学': '科学'
    };
    if (subjectMap[s]) return subjectMap[s];
    return s;
}

async function processData() {
    // 1. 预处理
    // 🟢 [修改开始]：引入单校模式判断与阈值计算优化
            
    // 重新构建临时的 SCHOOLS 键列表以检测数量
    const schoolSet = new Set(RAW_DATA.map(s => s.school));
    const isSingleSchool = schoolSet.size === 1;

    // 获取用户输入的指标参数 (用于单校模式下的精确划线)
    // 确保 window.SYS_VARS 已初始化
    const input1 = parseFloat(window.SYS_VARS?.indicator?.ind1) || 0;
    const input2 = parseFloat(window.SYS_VARS?.indicator?.ind2) || 0;

    const keys = [...SUBJECTS, 'total'];
    keys.forEach(k => {
        const vals = RAW_DATA.map(s => k==='total'?s.total:s.scores[k]).filter(v=>v!==undefined).sort((a,b)=>b-a);
        
        if(vals.length) {
            // 如果是单校模式，且是总分，且用户输入了有效的名次指标
            if (isSingleSchool && k === 'total' && input1 > 0 && input2 > 0) {
                // 🏫 单校模式特殊逻辑：
                // 使用用户输入的“年级名次”来反推分数线，这在单校月考中比百分比更稳定
                const idx1 = Math.min(Math.floor(input1), vals.length) - 1;
                const idx2 = Math.min(Math.floor(input2), vals.length) - 1;
                
                THRESHOLDS[k] = { 
                    exc: vals[Math.max(0, idx1)] || 0, 
                    pass: vals[Math.max(0, idx2)] || 0 
                };
                console.log(`[单校模式] 总分划线锁定: 优=${THRESHOLDS[k].exc} (Top${input1}), 良=${THRESHOLDS[k].pass} (Top${input2})`);
            } else {
                // 🌍 多校联考模式 / 单科默认逻辑：按固定比例
                // 9年级 15%，其他 20%
                const excRatio = (CONFIG.name && CONFIG.name.includes('9')) ? 0.15 : 0.2;
                // 单校模式下，如果没有手动指定，单科依然沿用百分比，但可以考虑后续增加单科手动设置
                THRESHOLDS[k] = { 
                    exc: vals[Math.floor(vals.length * excRatio)] || 0, 
                    pass: vals[Math.floor(vals.length * 0.5)] || 0 
                };
            }
        }
    });

    // 2. 呼叫 Worker
    const result = await WorkerAPI.run({ RAW_DATA, SUBJECTS, CONFIG, THRESHOLDS, SCHOOLS });
    
    // 3. 接收结果 (RAW_DATA 是全新的，带有排名的数组)
    RAW_DATA = result.RAW_DATA; 

    // 4. 【关键修复】重建 SCHOOLS 与新 RAW_DATA 的关联
    // Worker 返回了全新的 RAW_DATA，必须把这些新对象重新塞回 SCHOOLS 的 students 数组里
    // 否则 SCHOOLS 里存的还是旧对象(无排名)，导致"本校"查询失效
    
    // A. 先清空所有学校的学生列表
    Object.keys(SCHOOLS).forEach(k => { 
        if(SCHOOLS[k]) SCHOOLS[k].students = []; 
    });
    
    // B. 重新分配新学生对象
    RAW_DATA.forEach(stu => {
        if (!SCHOOLS[stu.school]) {
            // 防止有漏网之鱼
            SCHOOLS[stu.school] = { name: stu.school, students: [], metrics: {}, rankings: {} };
        }
        SCHOOLS[stu.school].students.push(stu);
    });

    // 5. 更新统计指标 (metrics)
    const newSchools = result.SCHOOLS;
    Object.keys(newSchools).forEach(k => {
        if (SCHOOLS[k]) {
            const { students, ...metricsData } = newSchools[k]; 
            // 只合并统计数据，不动刚才重新生成的 students 数组
            Object.assign(SCHOOLS[k], metricsData);
        }
    });

    // 6. 补全班级排名
    calculateClassRanksOnly(); 

    if (typeof fuseInstance !== 'undefined') fuseInstance = null; // 强制重建索引

    if (isSingleSchool) {
        console.log("🏫 检测到单校数据，自动切换 UI 为年级模式...");
        
        // 1. 隐藏横向对比入口 (自己跟自己没法比)
        const analysisMod = document.getElementById('analysis');
        if(analysisMod) analysisMod.style.display = 'none';

        // 2. 修改表头文字 (延迟执行确保 DOM 已渲染)
        // 将 "全镇"、"镇排" 替换为 "年级"、"级排"，消除歧义
        setTimeout(() => {
            document.querySelectorAll('th').forEach(th => {
                if(th.innerText.includes('镇排')) th.innerHTML = th.innerHTML.replace('镇排', '级排');
                if(th.innerText.includes('全镇')) th.innerHTML = th.innerHTML.replace('全镇', '年级');
            });
        }, 500);
    } else {
        const analysisMod = document.getElementById('analysis');
        if(analysisMod) analysisMod.style.display = 'block';
    }

    try {
        console.log("🔄 正在自动执行衍生计算...");
        
        // 1. 自动计算指标生 (依赖 RAW_DATA 和 TARGETS)
        // 即使没有设置划线，运行一下也不会报错，只是得分为0
        if (typeof calcIndicators === 'function' && isIndicatorCalcAllowed()) {
            calcIndicators(true); // 传入 true 表示静默模式(可选，视函数实现而定)
        }

        // 2. 自动计算综合总榜 (依赖前一步计算出的 scoreInd)
        if (typeof calcSummary === 'function') {
            calcSummary(true);    // 传入 true 表示静默模式
        }

    } catch (e) {
        console.warn("⚠️ 自动计算衍生指标时遇到非致命错误:", e);
    }

    // 7. 自动保存
    if(typeof DB !== 'undefined') {
        // ✋ 🔴 [修复开始]：不要写死 'autosave_backup'，而是获取当前选中的项目 KEY
        // 如果获取不到，才兜底使用 'autosave_backup'
        const currentKey = localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup';
        
        DB.save(currentKey, { 
            timestamp: Date.now(), 
            RAW_DATA, SCHOOLS, SUBJECTS, THRESHOLDS, TEACHER_MAP, CONFIG, MY_SCHOOL 
        });
        console.log(`✅ 数据已自动保存至: ${currentKey}`);
        // 👆 🟢 [修复结束]
    }
    updateStatusPanel();
}

// 辅助：仅计算班级排名
function calculateClassRanksOnly() {
    const classes = {}; 
    RAW_DATA.forEach(s => { if (!classes[s.class]) classes[s.class] = []; classes[s.class].push(s); });
    
    Object.values(classes).forEach(group => {
        // 总分
        group.sort((a,b)=>b.total - a.total);
        group.forEach((s,i) => { if(!s.ranks) s.ranks={}; if(!s.ranks.total) s.ranks.total={}; s.ranks.total.class = i+1; });
        // 单科
        SUBJECTS.forEach(sub => {
            const subGroup = group.filter(s => s.scores[sub] !== undefined).sort((a,b)=>b.scores[sub]-a.scores[sub]);
            subGroup.forEach((s,i) => { if(!s.ranks[sub]) s.ranks[sub]={}; s.ranks[sub].class = i+1; });
        });
    });
}

function calculateStudentRanks() {
    return;SUBJECTS.forEach(subject => {
        const subjectStudents = RAW_DATA.filter(s => s.scores[subject] !== undefined).sort((a, b) => b.scores[subject] - a.scores[subject]);
        subjectStudents.forEach((student, index) => {
            if (!student.ranks) student.ranks = {}; if (!student.ranks[subject]) student.ranks[subject] = {};
            if (index > 0 && student.scores[subject] === subjectStudents[index - 1].scores[subject]) student.ranks[subject].township = subjectStudents[index - 1].ranks[subject].township;
            else student.ranks[subject].township = index + 1;
        });
        Object.values(SCHOOLS).forEach(school => {
            const schStus = school.students.filter(s => s.scores[subject] !== undefined).sort((a,b) => b.scores[subject] - a.scores[subject]);
            schStus.forEach((s, i) => { if (!s.ranks[subject]) s.ranks[subject] = {}; if (i > 0 && s.scores[subject] === schStus[i - 1].scores[subject]) s.ranks[subject].school = schStus[i - 1].ranks[subject].school; else s.ranks[subject].school = i + 1; });
        });
        const classes = {}; RAW_DATA.forEach(student => { if (!classes[student.class]) classes[student.class] = []; classes[student.class].push(student); });
        Object.values(classes).forEach(classStudents => {
            const classSubjectStudents = classStudents.filter(s => s.scores[subject] !== undefined).sort((a, b) => b.scores[subject] - a.scores[subject]);
            classSubjectStudents.forEach((student, index) => { if (index > 0 && student.scores[subject] === classSubjectStudents[index - 1].scores[subject]) student.ranks[subject].class = classSubjectStudents[index - 1].ranks[subject].class; else student.ranks[subject].class = index + 1; });
        });
    });
    const totalStudents = RAW_DATA.filter(s => s.total !== undefined).sort((a, b) => b.total - a.total);
    totalStudents.forEach((student, index) => {
        if (!student.ranks) student.ranks = {}; if (!student.ranks.total) student.ranks.total = {};
        if (index > 0 && Math.abs(student.total - totalStudents[index - 1].total) < 0.0001) student.ranks.total.township = totalStudents[index - 1].ranks.total.township; else student.ranks.total.township = index + 1;
    });
     Object.values(SCHOOLS).forEach(school => {
        const schStus = school.students.sort((a,b) => b.total - a.total);
        schStus.forEach((s, i) => { if (i > 0 && Math.abs(s.total - schStus[i - 1].total) < 0.0001) s.ranks.total.school = schStus[i - 1].ranks.total.school; else s.ranks.total.school = i + 1; });
    });
    const classes = {}; RAW_DATA.forEach(student => { if (!classes[student.class]) classes[student.class] = []; classes[student.class].push(student); });
    Object.values(classes).forEach(classStudents => {
        const classTotalStudents = classStudents.sort((a, b) => b.total - a.total);
        classTotalStudents.forEach((student, index) => { if (index > 0 && Math.abs(student.total - classTotalStudents[index - 1].total) < 0.0001) student.ranks.total.class = classTotalStudents[index - 1].ranks.total.class; else student.ranks.total.class = index + 1; });
    });
}

function calculateRankings() {
    return;const doRank = (subject, key) => {
        const list = Object.values(SCHOOLS).filter(s => s.metrics[subject]);
        list.sort((a,b) => b.metrics[subject][key] - a.metrics[subject][key]);
        list.forEach((s, i) => {
            if(!s.rankings[subject]) s.rankings[subject] = {};
            if(i>0 && Math.abs(s.metrics[subject][key] - list[i-1].metrics[subject][key]) < 0.0001) s.rankings[subject][key] = list[i-1].rankings[subject][key]; else s.rankings[subject][key] = i + 1;
        });
    };
    [...SUBJECTS, 'total'].forEach(sub => { doRank(sub, 'avg'); doRank(sub, 'excRate'); doRank(sub, 'passRate'); });
    const max = { avg:0, exc:0, pass:0 };
    Object.values(SCHOOLS).forEach(s => { if(s.metrics.total) { max.avg = Math.max(max.avg, s.metrics.total.avg); max.exc = Math.max(max.exc, s.metrics.total.excRate); max.pass = Math.max(max.pass, s.metrics.total.passRate); } });
    Object.values(SCHOOLS).forEach(s => {
        if(s.metrics.total) {
            const m = s.metrics.total; const ratedAvg = max.avg > 0 ? (m.avg / max.avg * 60) : 0; const ratedExc = max.exc > 0 ? (m.excRate / max.exc * 70) : 0; const ratedPass = max.pass > 0 ? (m.passRate / max.pass * 70) : 0;
            m.ratedAvg = ratedAvg; m.ratedExc = ratedExc; m.ratedPass = ratedPass; s.score2Rate = ratedAvg + ratedExc + ratedPass;
        } else { s.score2Rate = 0; }
    });
    const list = Object.values(SCHOOLS); list.sort((a,b)=>b.score2Rate - a.score2Rate); list.forEach((s,i)=>s.rank2Rate = i+1);
    let maxBAvg = 0; list.forEach(s => maxBAvg = Math.max(maxBAvg, s.bottom3.avg));
    list.forEach(s => s.scoreBottom = maxBAvg ? (s.bottom3.avg/maxBAvg*40) : 0); list.sort((a,b)=>b.scoreBottom - a.scoreBottom).forEach((s,i)=>s.rankBottom = i+1);
}
