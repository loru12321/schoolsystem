// 1. Worker 脚本源码 (后台线程逻辑)
const WORKER_SOURCE = `
    self.onmessage = function(e) {
        const { cmd, data } = e.data;
        if (cmd === 'PROCESS_ALL') {
            const { RAW_DATA, SUBJECTS, CONFIG, THRESHOLDS } = data;
            // 接收轻量版 SCHOOLS (无循环引用)
            let SCHOOLS = data.SCHOOLS_LITE; 

            try {
                // --- A. 重建索引 ---
                const schoolMap = {};
                Object.keys(SCHOOLS).forEach(k => {
                    schoolMap[k] = { ...SCHOOLS[k], students: [] };
                });
                // 重新归类学生
                RAW_DATA.forEach(s => {
                    if (schoolMap[s.school]) schoolMap[s.school].students.push(s);
                });

                // --- B. 计算统计指标 (原 processData 逻辑) ---
                Object.values(schoolMap).forEach(sch => {
                    [...SUBJECTS, 'total'].forEach(k => {
                        const vals = sch.students.map(s => k==='total'?s.total:s.scores[k]).filter(v=>v!==undefined);
                        if(!vals.length) { sch.metrics[k] = { count:0, avg:0, excRate:0, passRate:0 }; return; }
                        const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
                        const excN = vals.filter(v=>v>=THRESHOLDS[k].exc).length;
                        const passN = vals.filter(v=>v>=THRESHOLDS[k].pass).length;
                        sch.metrics[k] = { count: vals.length, avg: avg, excRate: excN / vals.length, passRate: passN / vals.length };
                    });
                    
                    // 后1/3计算
                    const totalN = sch.students.length; 
                    const bottomN = Math.ceil(totalN / 3); 
                    const excN = Math.ceil(bottomN * CONFIG.excRate);
                    const sorted = [...sch.students].sort((a,b)=>b.total - a.total);
                    const bottomGroup = sorted.slice(-bottomN);
                    const validGroup = bottomGroup.slice(0, Math.max(0, bottomGroup.length - excN));
                    const bAvg = validGroup.length ? validGroup.reduce((a,b)=>a+b.total,0)/validGroup.length : 0;
                    sch.bottom3 = { totalN, bottomN, excN, avg: bAvg };
                });

               // === 新增功能：计算全镇各科标准差 & 学生 T 分 (T-Score) ===
                
                // 1. 计算全镇各科的统计指标 (均分 & 标准差)
                const globalStats = {};
                SUBJECTS.forEach(sub => {
                    const scores = RAW_DATA.map(s => s.scores[sub]).filter(v => typeof v === 'number');
                    if (scores.length > 1) {
                        const sum = scores.reduce((a, b) => a + b, 0);
                        const avg = sum / scores.length;
                        const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length;
                        const sd = Math.sqrt(variance);
                        globalStats[sub] = { avg, sd };
                    }
                });

                // 2. 定义 9 年级核心五科 (用于锁定标准分总分计算范围)
                const isGrade9Mode = CONFIG.name && CONFIG.name.includes('9');
                const grade9CoreSubjects = ['语文', '数学', '英语', '物理', '化学'];

                // 3. 为每个学生计算 T 分
                RAW_DATA.forEach(stu => {
                    stu.tScores = {}; // 存储单科 T 分
                    stu.totalTScore = 0; // T 分总和
                    
                    SUBJECTS.forEach(sub => {
                        const val = stu.scores[sub];
                        const stats = globalStats[sub];
                        
                        // 必须确保 stats 存在，且标准差大于极小值防止除零
                        if (typeof val === 'number' && stats && stats.sd > 0.00001) {
                            // T分公式：50 + 10 * Z
                            const z = (val - stats.avg) / stats.sd;
                            let t = 50 + 10 * z;
                            
                            // 边界保护：限制 T 分在 0-100 之间，防止极端离群值破坏总分
                            t = Math.max(0, Math.min(100, t));
                            
                            // A. 记录单科 T 分 (所有科目都记录，方便查看单科强弱)
                            stu.tScores[sub] = parseFloat(t.toFixed(1));

                            // B. 计算标准分总和 (根据年级模式筛选)
                            if (isGrade9Mode) {
                                // ★ 9年级模式：只累加 语数英物化
                                if (grade9CoreSubjects.includes(sub)) {
                                    stu.totalTScore += t;
                                }
                            } else {
                                // ★ 6-8年级模式：累加所有科目
                                stu.totalTScore += t;
                            }
                        } else {
                            stu.tScores[sub] = 0; 
                        }
                    });
                    
                    stu.totalTScore = parseFloat(stu.totalTScore.toFixed(1));
                });

                // --- C. 计算排名 (原 calculateStudentRanks 部分) ---
                const calcRank = (list, keyGetter, rankSetter) => {
                    list.sort((a, b) => keyGetter(b) - keyGetter(a));
                    list.forEach((item, i) => {
                        let rank = i + 1;
                        if (i > 0 && Math.abs(keyGetter(item) - keyGetter(list[i-1])) < 0.0001) {
                            rank = list[i-1]._tempRank;
                        }
                        item._tempRank = rank;
                        rankSetter(item, rank);
                    });
                };

                // 全镇排名
                SUBJECTS.forEach(sub => {
                    const validStus = RAW_DATA.filter(s => s.scores[sub] !== undefined);
                    calcRank(validStus, s => s.scores[sub], (s, r) => { if(!s.ranks) s.ranks={}; if(!s.ranks[sub]) s.ranks[sub]={}; s.ranks[sub].township = r; });
                });
                calcRank(RAW_DATA, s => s.total, (s, r) => { if(!s.ranks) s.ranks={}; if(!s.ranks.total) s.ranks.total={}; s.ranks.total.township = r; });

                // 校内排名
                Object.values(schoolMap).forEach(sch => {
                    calcRank(sch.students, s => s.total, (s, r) => s.ranks.total.school = r);
                    SUBJECTS.forEach(sub => {
                        const subStus = sch.students.filter(s => s.scores[sub] !== undefined);
                        calcRank(subStus, s => s.scores[sub], (s, r) => s.ranks[sub].school = r);
                    });
                });

               // --- D. 学校综合排名 (原 calculateRankings) ---
                const doSchoolRank = (sub, key) => {
                    const list = Object.values(schoolMap).filter(s => s.metrics[sub]);
                    list.sort((a,b) => b.metrics[sub][key] - a.metrics[sub][key]);
                    list.forEach((s, i) => {
                        if(!s.rankings) s.rankings = {}; if(!s.rankings[sub]) s.rankings[sub] = {};
                        if(i>0 && Math.abs(s.metrics[sub][key] - list[i-1].metrics[sub][key]) < 0.0001) s.rankings[sub][key] = list[i-1].rankings[sub][key]; 
                        else s.rankings[sub][key] = i + 1;
                    });
                };
                [...SUBJECTS, 'total'].forEach(sub => { doSchoolRank(sub, 'avg'); doSchoolRank(sub, 'excRate'); doSchoolRank(sub, 'passRate'); });
                
                // 计算综合得分的最大值基准
                let max = { avg:0, exc:0, pass:0 };
                Object.values(schoolMap).forEach(s => { if(s.metrics.total) { max.avg = Math.max(max.avg, s.metrics.total.avg); max.exc = Math.max(max.exc, s.metrics.total.excRate); max.pass = Math.max(max.pass, s.metrics.total.passRate); } });

                // === 🔥 1. 新增：9年级高分段统计 (>=490分) ===
                let maxHighRatio = 0;
                // 判断是否为9年级模式
                const isGrade9 = CONFIG.name && CONFIG.name.includes('9');
                
                if (isGrade9) {
                    Object.values(schoolMap).forEach(s => {
                        // 计算高分人数 (总分 >= 490)
                        const highCount = s.students.filter(stu => stu.total >= 490).length;
                        const totalCount = s.metrics.total ? s.metrics.total.count : 1;
                        const ratio = totalCount > 0 ? (highCount / totalCount) : 0;
                        
                        s.highScoreStats = {
                            count: highCount,
                            ratio: ratio,
                            score: 0 // 稍后计算
                        };
                        
                        if (ratio > maxHighRatio) maxHighRatio = ratio;
                    });
                }

                // === 🔥 2. 计算各项赋分 (含9年级特殊权重) ===
                Object.values(schoolMap).forEach(s => {
                    if(s.metrics.total) {
                        const m = s.metrics.total;
                        // 定义默认权重 (6-8年级)
                        let wAvg = 60, wExc = 70, wPass = 70;
                        
                        // 🟢 如果是 9年级模式，修改权重 (均分40 + 优秀80 + 及格40)
                        if (isGrade9) {
                            wAvg = 40; 
                            wExc = 80; 
                            wPass = 40; 
                        }

                        // 分别计算三项赋分
                        const valAvg = (max.avg ? m.avg/max.avg * wAvg : 0);
                        const valExc = (max.exc ? m.excRate/max.exc * wExc : 0);
                        const valPass = (max.pass ? m.passRate/max.pass * wPass : 0);
                        
                        // 保存到对象中供前端显示
                        m.ratedAvg = valAvg;
                        m.ratedExc = valExc;
                        m.ratedPass = valPass;
                        
                        // 计算两率一分基准总分
                        s.score2Rate = valAvg + valExc + valPass;

                        // === 🔥 3. 如果是9年级，计算高分赋分 ===
                        if (isGrade9 && s.highScoreStats) {
                            // 赋分公式：(本校比例 / 最高比例) * 70
                            const highScore = maxHighRatio > 0 ? (s.highScoreStats.ratio / maxHighRatio * 70) : 0;
                            s.highScoreStats.score = highScore;
                            
                            // ⚠️ 注意：目前高分赋分仅做展示，暂未叠加到 score2Rate (总排名分) 中。
                            // 如果需要叠加进总排名，请取消下一行的注释：
                            // s.score2Rate += highScore; 
                        }

                    } else { 
                        s.score2Rate = 0; 
                        // 防止空对象报错
                        if(isGrade9) s.highScoreStats = { count:0, ratio:0, score:0 };
                    }
                });

                // 排序 (按两率一分总分降序)
                // 修复：确保 list 包含所有学校，不进行任何 slice 截断
                const list = Object.values(schoolMap).sort((a,b) => {
                    const scoreA = a.score2Rate || 0;
                    const scoreB = b.score2Rate || 0;
                    return scoreB - scoreA; 
                });
                
                // 重新赋予排名索引
                list.forEach((s, i) => {
                    s.rank2Rate = i + 1;
                });
                
                // 后1/3排序
                let maxBAvg = 0; 
                list.forEach(s => maxBAvg = Math.max(maxBAvg, s.bottom3.avg || 0));
                
                list.forEach(s => {
                    s.scoreBottom = maxBAvg ? (s.bottom3.avg / maxBAvg * 40) : 0;
                });
                
                // 按后1/3得分排序
                list.sort((a,b) => (b.scoreBottom || 0) - (a.scoreBottom || 0))
                    .forEach((s,i) => s.rankBottom = i + 1);

                // 返回结果：我们要把 RAW_DATA (含ranks) 和 SCHOOLS (含metrics/rankings) 发回去
                const SCHOOLS_RESULT = {};
                Object.keys(schoolMap).forEach(k => {
                    const { students, ...rest } = schoolMap[k];
                    SCHOOLS_RESULT[k] = rest;
                });

                self.postMessage({ status: 'ok', RAW_DATA, SCHOOLS: SCHOOLS_RESULT });

            } catch(err) {
                self.postMessage({ status: 'error', msg: err.message });
            }
        }
    };`;

window.WORKER_SOURCE = WORKER_SOURCE;
