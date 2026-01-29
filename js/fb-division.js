// ================== 新生分班 & 座位编排 ==================
function FB_loadData(input) {
    const file = input.files[0]; if(!file) return; const reader= new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if(!json.length) throw new Error("Excel没有数据");
            FB_STUDENTS = json.map((r, i) => {
                const remarks = String(r['备注']||r['说明']||""); const sameMatch = remarks.match(/(?:和|与|跟)([\u4e00-\u9fa5\w]+)(?:同班|一起|一班)/); const diffMatch = remarks.match(/(?:和|与|跟)([\u4e00-\u9fa5\w]+)(?:分开|不同班|不在一起)/);
                return { _id: i, name: r['姓名'] || '未知', gender: (r['性别'] === '男' || r['Gender'] === 'M') ? 'M' : 'F', score: parseFloat(r['总分'] || r['语数英'] || 0), height: parseFloat(r['身高'] || 160), vision: parseFloat(r['视力'] || r['左眼'] || 5.0), isDiff: (String(r['难管']||"").includes('是') || remarks.includes('难管') || remarks.includes('调皮')), remarks: remarks, constraints: { same: sameMatch ? [sameMatch[1]] : [], diff: diffMatch ? [diffMatch[1]] : [] }, classIdx: -1 };
            });
            alert(`✅ 导入成功！共 ${FB_STUDENTS.length} 人。`); document.getElementById('fb-results-area').classList.add('hidden'); 
        } catch(err) { alert("读取失败：" + err.message); }
    }; reader.readAsArrayBuffer(file);
}

function calculateQuartiles(sortedData) {
    const q2 = calculateMedian(sortedData); const midIndex = Math.floor(sortedData.length / 2); const lowerHalf = sortedData.slice(0, midIndex); const upperHalf = sortedData.slice((sortedData.length % 2 === 0) ? midIndex : midIndex + 1); const q1 = calculateMedian(lowerHalf); const q3 = calculateMedian(upperHalf); return { q1, q2, q3 };
}
function calculateMedian(sortedData) { const mid = Math.floor(sortedData.length / 2); return sortedData.length % 2 !== 0 ? sortedData[mid] : (sortedData[mid - 1] + sortedData[mid]) / 2; }
function calculateSD(data) { const n = data.length; if (n === 0) return 0; const mean = data.reduce((a, b) => a + b, 0) / n; const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n; return Math.sqrt(variance); }

 // 1. 主入口：运行分班
function FB_runDivision() {
    if(!FB_STUDENTS.length) return alert("请先导入数据");
    
    // 获取参数
    const k = parseInt(document.getElementById('fb_cls_num').value) || 6; 
    const algo = document.getElementById('fb_algorithm').value;
    const btn = document.querySelector('button[onclick="FB_runDivision()"]');
    
    // UI 反馈
    btn.innerHTML = '⏳ 正在运算多套方案...';
    btn.disabled = true;

    // 使用 setTimeout 让 UI 有机会渲染 Loading 状态
    setTimeout(() => {
        FB_SCHEMES_CACHE = [];
        
        // 如果是蛇形分班，因为是固定的，只生成 1 套
        // 如果是智能优化，生成 3 套供选择
        const runs = (algo === 'snake') ? 1 : 3;

        for(let i = 0; i < runs; i++) {
            const classes = FB_generateSingleScheme(k, algo);
            // 计算该方案的评分 (极差)
            const avgs = classes.map(c => c.stats.avg);
            const range = Math.max(...avgs) - Math.min(...avgs);
            const sd = calculateSD(avgs);
            
            FB_SCHEMES_CACHE.push({
                id: i,
                name: runs === 1 ? '标准方案' : `方案 ${String.fromCharCode(65+i)}`, // 方案A, 方案B...
                data: classes,
                range: range,
                sd: sd,
                desc: `均分极差 ${range.toFixed(2)}`
            });
        }

        // 恢复按钮
        btn.innerHTML = '🚀 开始智能分班';
        btn.disabled = false;

        // 渲染方案选择器
        FB_renderSchemeSelector();
        
        // 默认应用均分极差最小（最均衡）的方案
        const bestScheme = FB_SCHEMES_CACHE.sort((a,b) => a.range - b.range)[0];
        FB_applyScheme(bestScheme.id);
        
        // 显示区域
        document.getElementById('fb-results-area').classList.remove('hidden');
        if(runs > 1) {
            document.getElementById('fb-scheme-panel').classList.remove('hidden');
        } else {
            document.getElementById('fb-scheme-panel').classList.add('hidden');
        }

    }, 100);
}

// 2. 核心算法：生成单次方案 (提取出来的纯逻辑)
function FB_generateSingleScheme(k, algo) {
    // 初始化空班级
    let classes = Array.from({length: k}, (_, i) => ({ id: i, name: (i+1)+"班", students: [], stats: {} }));
    let pool = JSON.parse(JSON.stringify(FB_STUDENTS)); // 深拷贝，防止污染
    
    // 预处理：按分数排序
    pool.sort((a,b) => b.score - a.score);

    if(algo === 'snake') {
        // --- 蛇形分班 ---
        pool.forEach((s, i) => { 
            const round = Math.floor(i / k); 
            const target = (round % 2 === 0) ? (i % k) : (k - 1 - (i % k)); 
            classes[target].students.push(s); 
            s.classIdx = target; 
        });
    } else {
        // --- 智能优化分班 (基于模拟退火思想的简化版) ---
        // A. 初步蛇形分配作为基准
        pool.forEach((s, i) => { 
            const target = (Math.floor(i/k) % 2 === 0) ? (i % k) : (k - 1 - (i % k)); 
            classes[target].students.push(s); 
            s.classIdx = target; 
        });

        // B. 随机交换优化
        const iterations = 8000; // 增加迭代次数以获得不同结果
        const globalAvg = pool.reduce((a,b)=>a+b.score,0) / pool.length;
        
        for(let i=0; i<iterations; i++) {
            const c1 = Math.floor(Math.random() * k); 
            const c2 = Math.floor(Math.random() * k); 
            if(c1 === c2) continue;
            
            const cls1 = classes[c1];
            const cls2 = classes[c2];
            if(!cls1.students.length || !cls2.students.length) continue;

            const idx1 = Math.floor(Math.random() * cls1.students.length); 
            const idx2 = Math.floor(Math.random() * cls2.students.length);

            const s1 = cls1.students[idx1]; 
            const s2 = cls2.students[idx2];

            // 计算交换前的代价 (方差 + 性别平衡 + 难管分布)
            const costBefore = FB_calcClassCost(cls1, globalAvg) + FB_calcClassCost(cls2, globalAvg);
            
            // 试探性交换
            cls1.students[idx1] = s2; s2.classIdx = c1; 
            cls2.students[idx2] = s1; s1.classIdx = c2;

            const costAfter = FB_calcClassCost(cls1, globalAvg) + FB_calcClassCost(cls2, globalAvg);
            
            // 检查硬性约束 (如: 互斥)
            let violate = false; 
            if(FB_checkConflict(s1, cls2.students) || FB_checkConflict(s2, cls1.students)) violate = true;

            // 决策：如果代价变高了(更不平衡) 或者 违反约束，则撤销交换
            // (加入一点点随机接受概率以跳出局部最优，但这里为了稳定简化处理)
            if(violate || costAfter > costBefore) { 
                // 撤销
                cls1.students[idx1] = s1; s1.classIdx = c1; 
                cls2.students[idx2] = s2; s2.classIdx = c2; 
            }
        }
    }

    // 这里的计算是为了 stats，方便外部筛选
    classes.forEach(c => {
        const n = c.students.length;
        const total = c.students.reduce((a,b)=>a+b.score,0);
        c.stats.avg = n ? total/n : 0;
        c.stats.male = c.students.filter(s=>s.gender==='M').length;
        c.stats.count = n;
    });

    return classes;
}

// 3. 渲染方案选择卡片
function FB_renderSchemeSelector() {
    const container = document.getElementById('fb-scheme-cards');
    container.innerHTML = '';
    
    FB_SCHEMES_CACHE.forEach(scheme => {
        // 简单的评分逻辑
        const isBest = (scheme.range <= FB_SCHEMES_CACHE[0].range); // 假设已排序
        const borderStyle = isBest ? 'border:2px solid #16a34a; background:#fff;' : 'border:1px solid #ddd; background:#fff;';
        
        // 找出该方案中男女比例极差
        const males = scheme.data.map(c => c.stats.male);
        const maleRange = Math.max(...males) - Math.min(...males);

        container.innerHTML += `
            <div onclick="FB_applyScheme(${scheme.id})" style="cursor:pointer; padding:10px; border-radius:6px; ${borderStyle} transition:0.2s;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='#fff'">
                <div style="font-weight:bold; color:#333; display:flex; justify-content:space-between;">
                    <span>${scheme.name}</span>
                    ${isBest ? '<span style="color:red; font-size:10px;">★ 推荐</span>' : ''}
                </div>
                <div style="font-size:12px; color:#666; margin-top:5px;">
                    <div>均分极差: <strong>${scheme.range.toFixed(2)}</strong></div>
                    <div>男女极差: ${maleRange} 人</div>
                </div>
            </div>
        `;
    });
}

// 4. 应用选中的方案
function FB_applyScheme(id) {
    const scheme = FB_SCHEMES_CACHE.find(s => s.id === id);
    if(!scheme) return;
    
    // 更新全局变量
    FB_CLASSES = scheme.data;
    FB_SIMULATED_DATA = {}; 
    FB_CLASSES.forEach(c => FB_SIMULATED_DATA[c.name] = c.students);
    
    // 渲染原有仪表盘
    FB_renderDashboard();
    
    // 高亮选中的卡片
    const cards = document.getElementById('fb-scheme-cards').children;
    Array.from(cards).forEach((card, idx) => {
        if(scheme.id === FB_SCHEMES_CACHE[idx].id) { // 注意：这里简单按索引对应，实际上按ID匹配更稳
            card.style.borderColor = '#16a34a';
            card.style.boxShadow = '0 0 0 3px rgba(22, 163, 74, 0.2)';
        } else {
            card.style.borderColor = '#ddd';
            card.style.boxShadow = 'none';
        }
    });
}

function FB_calcClassCost(cls, gAvg) {
    const n = cls.students.length; if(n===0) return 10000; const avg = cls.students.reduce((a,b)=>a+b.score,0) / n; const male = cls.students.filter(s=>s.gender==='M').length; 
    const diff = cls.students.filter(s=>(s.isDiff || s._isDiff)).length;
    let cost = Math.pow(avg - gAvg, 2) * 100; cost += Math.pow((male/n) - 0.5, 2) * 5000; 
    if(document.getElementById('fb_rule_diff').value === 'spread') { cost += Math.pow(diff, 2) * 500; } return cost;
}

function FB_checkConflict(stu, targetArr) { 
    if(!stu.constraints) return false;
    for(let name of stu.constraints.diff) { if(targetArr.find(s => s.name === name)) return true; } 
    return false; 
}

function FB_renderDashboard() {
    document.getElementById('fb-results-area').classList.remove('hidden'); const container = document.getElementById('fb_class_container'); container.innerHTML = '';
    let allAvgs = [], tMale = 0, tFemale = 0, totalDiffCnt = 0;
    FB_CLASSES.forEach(c => {
        const n = c.students.length; const total = c.students.reduce((a,b)=>a+b.score,0); const avg = n ? total/n : 0; const male = c.students.filter(s=>s.gender==='M').length; 
        const diffCnt = c.students.filter(s=>(s.isDiff || s._isDiff)).length;
        allAvgs.push(avg); tMale += male; tFemale += (n-male); totalDiffCnt += diffCnt; c.stats = { avg, male, female: n-male, count: n }; const isWarn = diffCnt > 3; 
        container.innerHTML += `<div class="fb-class-box ${isWarn?'fb-warn-bg':''}" onclick="FB_openSeatMap(${c.id})"><div class="fb-c-head"><span style="font-weight:bold; font-size:16px;">${c.name}</span><span class="fb-tag fb-tag-red" style="${diffCnt>0?'':'display:none'}">难管: ${diffCnt}</span></div><div class="fb-c-body"><div>人数: <strong>${n}</strong></div><div>均分: <strong>${avg.toFixed(1)}</strong></div><div>男生: ${male}</div><div>女生: ${n-male}</div><div style="grid-column:span 2; font-size:11px; color:#999; margin-top:5px;">点击进入座位编排 →</div></div></div>`;
    });
    const range = Math.max(...allAvgs) - Math.min(...allAvgs);
    document.getElementById('fb_res_total').innerText = FB_STUDENTS.length; document.getElementById('fb_res_male').innerText = tMale; document.getElementById('fb_res_female').innerText = tFemale; document.getElementById('fb_res_diff').innerText = range.toFixed(2); document.getElementById('fb_res_diff_cnt').innerText = totalDiffCnt;
    const evalEl = document.getElementById('fb_res_eval');
    if(range <= 1.0) evalEl.innerHTML = '<span style="color:green;font-weight:bold;">✅ 完美均衡</span>'; else if(range <= 3.0) evalEl.innerHTML = '<span style="color:#d97706;font-weight:bold;">⚠️ 基本均衡</span>'; else evalEl.innerHTML = '<span style="color:red;font-weight:bold;">❌ 差异过大</span>';
    FB_renderBalanceChart();
}

function FB_renderBalanceChart() {
    const ctx = document.getElementById('balanceChart'); const tableContainer = document.getElementById('balanceTableContainer'); const labels = FB_CLASSES.map(c => c.name);
    const statsData = FB_CLASSES.map(c => { const scores = c.students.map(s => s.score).sort((a,b)=>a-b); const qs = calculateQuartiles(scores); return { min: scores[0], max: scores[scores.length-1], q1: qs.q1, median: qs.q2, q3: qs.q3, avg: c.stats.avg, sd: calculateSD(scores) }; });
    if (balanceChartInstance) balanceChartInstance.destroy();
    balanceChartInstance = new Chart(ctx, {
        type: 'bar', data: { labels: labels, datasets: [ { label: '平均分', data: statsData.map(s => s.avg), type: 'scatter', backgroundColor: '#2563eb', borderColor: '#2563eb', pointStyle: 'rectRot', pointRadius: 6 }, { label: '分数区间 (Min-Max)', data: statsData.map(s => [s.min, s.max]), backgroundColor: 'rgba(156, 163, 175, 0.2)', borderColor: 'rgba(156, 163, 175, 0.5)', borderWidth: 1, barPercentage: 0.1 }, { label: '核心分布 (Q1-Q3)', data: statsData.map(s => [s.q1, s.q3]), backgroundColor: 'rgba(37, 99, 235, 0.5)', borderColor: '#1e40af', borderWidth: 1, barPercentage: 0.6 } ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function(context) { const s = statsData[context.dataIndex]; if(context.dataset.type === 'scatter') return `平均分: ${s.avg.toFixed(2)}`; if(context.datasetIndex === 1) return `范围: ${s.min} - ${s.max}`; if(context.datasetIndex === 2) return `核心区间: ${s.q1} - ${s.q3}`; } } }, title: { display: true, text: '班级分数结构对比 (箱线图)' } }, scales: { y: { beginAtZero: false, title: { display: true, text: '分数' } } } }
    });
    let tableHtml = `<table class="comparison-table" style="font-size:12px;"><thead><tr><th>班级</th><th>人数</th><th>平均分</th><th>标准差 (SD)</th><th>极差 (Max-Min)</th><th>前25%线 (Q3)</th><th>后25%线 (Q1)</th></tr></thead><tbody>`;
    statsData.forEach((s, i) => { tableHtml += `<tr><td>${labels[i]}</td><td>${FB_CLASSES[i].students.length}</td><td>${s.avg.toFixed(2)}</td><td>${s.sd.toFixed(2)}</td><td>${(s.max - s.min).toFixed(1)}</td><td>${s.q3}</td><td>${s.q1}</td></tr>`; });
    tableContainer.innerHTML = tableHtml + `</tbody></table>`;
}

const HistoryManager = {
    past: [],   // 过去的状态栈
    future: [], // 未来的状态栈 (供重做)
    limit: 20,  // 最多记录20步，防止内存溢出

    // 1. 记录当前状态 (在修改数据前调用)
    record: function() {
        // 深拷贝当前班级数据 (FB_CLASSES)
        // 注意：这里我们只记录当前正在操作的班级，以节省内存
        if (FB_CUR_CLASS_IDX === -1) return;
        
        const currentClassData = FB_CLASSES[FB_CUR_CLASS_IDX];
        const snapshot = JSON.parse(JSON.stringify(currentClassData));
        
        this.past.push(snapshot);
        if (this.past.length > this.limit) this.past.shift(); // 超过限制删最早的
        
        this.future = []; // 一旦有新操作，清空未来栈
        this.updateUI();
    },

    // 2. 执行撤销
    undo: function() {
        if (this.past.length === 0) return;
        
        // A. 把当前状态推入未来栈
        const current = JSON.parse(JSON.stringify(FB_CLASSES[FB_CUR_CLASS_IDX]));
        this.future.push(current);
        
        // B. 从过去栈取出上一个状态
        const previous = this.past.pop();
        FB_CLASSES[FB_CUR_CLASS_IDX] = previous;
        
        // C. 刷新视图
        this.refreshView("已撤销 ↩");
    },

    // 3. 执行重做
    redo: function() {
        if (this.future.length === 0) return;
        
        // A. 把当前状态推入过去栈
        const current = JSON.parse(JSON.stringify(FB_CLASSES[FB_CUR_CLASS_IDX]));
        this.past.push(current);
        
        // B. 从未来栈取出下一个状态
        const next = this.future.pop();
        FB_CLASSES[FB_CUR_CLASS_IDX] = next;
        
        // C. 刷新视图
        this.refreshView("已重做 ↪");
    },

    // 4. 辅助：刷新界面和按钮状态
    refreshView: function(msg) {
        FB_renderSeatMap(); // 重绘座位表
        this.updateUI();
        UI.toast(msg, 'info'); // 提示用户
    },

    updateUI: function() {
        const btnUndo = document.getElementById('btn_undo');
        const btnRedo = document.getElementById('btn_redo');
        if(btnUndo) {
            btnUndo.disabled = (this.past.length === 0);
            btnUndo.className = this.past.length > 0 ? "btn btn-primary" : "btn btn-gray";
        }
        if(btnRedo) {
            btnRedo.disabled = (this.future.length === 0);
            btnRedo.className = this.future.length > 0 ? "btn btn-primary" : "btn btn-gray";
        }
    },
    
    // 5. 初始化/清空
    reset: function() {
        this.past = [];
        this.future = [];
        this.updateUI();
    }
};

function FB_openSeatMap(clsId) {
    HistoryManager.reset(); 
    FB_CUR_CLASS_IDX = clsId; const cls = FB_CLASSES[clsId]; document.getElementById('seat_class_title').innerText = cls.name;
    document.getElementById('fb_seat_view').classList.remove('hidden'); document.getElementById('fb_seat_view').scrollIntoView({behavior:'smooth'});
    updateConstraintWidgetsContext('fb'); // 联动更新
    if(!cls.seatLayout) { FB_autoSeatAlgo(); } else { FB_renderSeatMap(); }
      FB_initScenarioSelect(); // <--- 记得加上这句
}
