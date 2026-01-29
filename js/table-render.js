function getRankHTML(rank, type = 'school') { let cls = 'rank-cell'; if(rank===1) cls += ' r-1'; if(rank===2) cls += ' r-2'; if(rank===3) cls += ' r-3'; return `<td class="${cls}">${rank}</td>`; }
// 核心逻辑：如果是数字，保留2位小数展示；如果是无效值，显示 '-'
// 注意：这只改变显示，不改变 underlying calculation (底层计算)
function formatVal(val) {
    if (typeof val !== 'number' || isNaN(val)) return '-';
    // toFixed(2) 会四舍五入并转为字符串，如 89.567 -> "89.57", 90 -> "90.00"
    return val.toFixed(2);
}
function formatRankDisplay(value, rank, type = 'school', isPercent = false) { const displayValue = isPercent ? (value * 100).toFixed(2) + '%' : value.toFixed(2); return `${displayValue} <span style="font-size:0.9em; color:#94a3b8">(${rank})</span>`; }

function renderTables() {
    updateSchoolMode();
    const tbTotal = document.querySelector('#tb-total tbody'); 
    
    // --- 📊 新增：数据统计看板逻辑 开始 ---
    // 如果数据存在，且页面上有 KPI 容器 (我们可以动态插入一个)
    if(Object.keys(SCHOOLS).length > 0) {
        // 计算全镇数据
        const totalStudents = RAW_DATA.length;
        const totalSchools = Object.keys(SCHOOLS).length;
        const allScores = RAW_DATA.map(s => s.total);
        const globalAvg = (allScores.reduce((a,b)=>a+b,0) / totalStudents).toFixed(1);
        const maxScore = Math.max(...allScores);

        // 在看板模块中渲染KPI
        let dashboard = document.getElementById('macro-dashboard');
        if(!dashboard) {
            dashboard = document.createElement('div');
            dashboard.id = 'macro-dashboard';
            dashboard.className = 'fb-dashboard';
            dashboard.style.marginBottom = '25px';
            const watchSection = document.getElementById('macro-watch');
            if(watchSection) watchSection.appendChild(dashboard);
        }

        // 渲染卡片内容
        dashboard.innerHTML = `
            <div class="fb-card">
                <div class="fb-lbl">参考总人数</div>
                <div class="fb-val text-blue">${totalStudents}</div>
                <div class="fb-lbl">覆盖 ${totalSchools} 所学校</div>
            </div>
            <div class="fb-card">
                <div class="fb-lbl">全镇平均分</div>
                <div class="fb-val text-green">${globalAvg}</div>
                <div class="fb-lbl">总分基准线</div>
            </div>
            <div class="fb-card">
                <div class="fb-lbl">最高分 (状元)</div>
                <div class="fb-val text-orange">${maxScore}</div>
                <div class="fb-lbl">分差 ${(maxScore - Math.min(...allScores))} 分</div>
            </div>
            <div class="fb-card">
                <div class="fb-lbl">数据状态</div>
                <div class="fb-val" style="font-size:18px; color:#64748b; margin-top:5px;">${CONFIG.name}</div>
                <div class="fb-lbl">已剔除后 ${ (CONFIG.excRate*100) }%</div>
            </div>
        `;
    }
    // --- 📊 新增：数据统计看板逻辑 结束 ---

    const theadTotal = document.querySelector('#tb-total thead tr');
    
    // 1. 获取所有学校列表 (移除任何排序过滤，先拿原始数据)
    let list = Object.values(SCHOOLS);
    
    // --- 🔍 诊断代码开始 ---
    // 只有当点击“生成横向对比表”或页面加载时，如果学校数量少于预期(比如13)，可以在控制台看到
    console.log(`系统共识别到 ${list.length} 所学校：`, list.map(s => s.name));
    
    // 在表头显示醒目的数量
    const countInfo = `<span style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:11px;">共识别 ${list.length} 所</span>`;
    // --- 🔍 诊断代码结束 ---

    theadTotal.innerHTML = `
        <th>学校名称 ${countInfo}</th><th>实考人数</th><th>平均分</th><th>优秀率</th><th>及格率</th>
        <th>平均分赋分</th><th>优秀率赋分</th><th>及格率赋分</th>
        <th>两率一分总分</th><th>排名</th>
    `;
    
    // 2. 排序
    list.sort((a,b) => (a.rank2Rate || 9999) - (b.rank2Rate || 9999));
    
    // 3. 渲染
    let html = '';
    list.forEach(s => {
        const m = s.metrics.total || {}; 
        const rA = m.ratedAvg || 0; 
        const rE = m.ratedExc || 0; 
        const rP = m.ratedPass || 0; 
        const isMySchool = s.name === MY_SCHOOL;
        
        // 计算数据条百分比 (假设满分按全镇最高均分算，或者固定值如100/120)
        const maxAvg = list[0].metrics.total?.avg || 100; // 取第一名均分作为基准
        const barPercent = m.avg ? (m.avg / maxAvg * 100).toFixed(1) : 0;

        html += `<tr class="${isMySchool?'bg-highlight':''}">
            <td data-label="学校" class="clickable-school" onclick="showSchoolProfile('${s.name}')" title="点击查看学校学科诊断">
                ${s.name} <i class="ti ti-chart-radar" style="font-size:12px; opacity:0.5;"></i>
            </td>
            <td data-label="人数">${m.count||0}</td>
            
            <!-- 注入样式变量 --percent -->
            <td data-label="平均分" class="data-bar-bg" style="--percent: ${barPercent}%">
                ${formatRankDisplay(m.avg||0, s.rankings.total?.avg || 0)}
            </td>
            
            <td data-label="优秀率">${formatRankDisplay(m.excRate||0, s.rankings.total?.excRate || 0, 'school', true)}</td>
            <td data-label="及格率">${formatRankDisplay(m.passRate||0, s.rankings.total?.passRate || 0, 'school', true)}</td>
            <td data-label="均分赋分">${rA.toFixed(2)}</td>
            <td data-label="优率赋分">${rE.toFixed(2)}</td>
            <td data-label="及格赋分">${rP.toFixed(2)}</td>
            <td data-label="总分" class="text-red" style="font-size:1.1em; font-weight:bold;">${(s.score2Rate||0).toFixed(2)}</td>
            ${getRankHTML(s.rank2Rate)}
        </tr>`;
    });
    tbTotal.innerHTML = html;
    applySchoolModeToTables();

    // ... (下接各科渲染逻辑，保持不变) ...
    const subContainer = document.getElementById('subject-tables-container');         const sideNavSubjects = document.getElementById('side-nav-subjects-container'); 
    subContainer.innerHTML = ''; 
    sideNavSubjects.innerHTML = '';
    
    SUBJECTS.forEach(sub => {
        const thresh = THRESHOLDS[sub]; 
        const box = document.createElement('div'); 
        const anchorId = `anchor-subject-${sub}`; 
        box.id = anchorId; 
        box.className = 'anchor-target'; 
        box.style.paddingTop = '20px';
        box.innerHTML = `<div class="sub-header"><span>📘 ${sub}</span><span style="font-weight:normal; font-size:12px; opacity:0.8;">优秀线≥${(thresh?.exc || 0).toFixed(1)}, 及格线≥${(thresh?.pass || 0).toFixed(1)}</span></div><div class="table-wrap"><table><thead><tr><th>学校名称</th><th>实考人数</th><th>平均分</th><th>优秀率</th><th>及格率</th></tr></thead><tbody></tbody></table></div>`;
        const tbody = box.querySelector('tbody'); 
        const subList = Object.values(SCHOOLS).filter(s=>s.metrics[sub]).sort((a,b)=>(a.rankings[sub].avg - b.rankings[sub].avg)); 
        let htmlSub = '';
        subList.forEach(s => { const m = s.metrics[sub]; const r = s.rankings[sub]; const isMySchool = s.name === MY_SCHOOL; htmlSub += `<tr class="${isMySchool?'bg-highlight':''}"><td>${s.name}</td><td>${m.count}</td><td>${formatRankDisplay(m.avg, r.avg)}</td><td>${formatRankDisplay(m.excRate, r.excRate, 'school', true)}</td><td>${formatRankDisplay(m.passRate, r.passRate, 'school', true)}</td></tr>`; });
        tbody.innerHTML = htmlSub; subContainer.appendChild(box); const navLink = document.createElement('a'); navLink.className = 'side-nav-sub-link'; navLink.innerText = sub; navLink.onclick = () => scrollToSubAnchor(anchorId, navLink); sideNavSubjects.appendChild(navLink);
    });

    const tbBottom = document.querySelector('#tb-bottom3 tbody'); let htmlBottom = ''; 
    let bottomList = Object.values(SCHOOLS).sort((a,b)=> (a.rankBottom || 9999) - (b.rankBottom || 9999));
    bottomList.forEach(s => { 
        const isMySchool = s.name === MY_SCHOOL; 
        htmlBottom += `
        <tr class="${isMySchool?'bg-highlight':''}">
            <td>${s.name}</td>
            <td>${s.bottom3.totalN}</td>
            <td>${s.bottom3.bottomN}</td>
            <td>
                <span class="clickable-num" onclick="handleExcludedClick('${s.name}')" title="点击查看被剔除的低分学生">
                    ${s.bottom3.excN}
                </span>
            </td>
            <td>${s.bottom3.avg.toFixed(2)}</td>
            <td class="text-red">${s.scoreBottom.toFixed(2)}</td>
            ${getRankHTML(s.rankBottom)}
        </tr>`; 
    });
    tbBottom.innerHTML = htmlBottom;
    renderTrafficLightDashboard();
}

function renderTrafficLightDashboard() {
    const container = document.getElementById('traffic-light-dashboard');
    const listRed = document.getElementById('list-red');
    const listYellow = document.getElementById('list-yellow');
    const listGreen = document.getElementById('list-green');
    
    if(Object.keys(SCHOOLS).length === 0) {
        container.classList.add('hidden');
        return;
    }
    
    container.classList.remove('hidden');
    listRed.innerHTML = ''; listYellow.innerHTML = ''; listGreen.innerHTML = '';
    
    let cntRed = 0, cntYellow = 0, cntGreen = 0;

    // 遍历所有学校和所有科目进行“体检”
    Object.values(SCHOOLS).forEach(s => {
        [...SUBJECTS, 'total'].forEach(sub => {
            const m = s.metrics[sub];
            if(!m) return;
            
            const subName = sub === 'total' ? CONFIG.label : sub;
            const excP = m.excRate * 100;
            const passP = m.passRate * 100;
            const rank = s.rankings[sub]?.avg || 999;
            const totalSchools = Object.keys(SCHOOLS).length;

            // 1. 🔴 红色预警条件：及格率 < 60% 或 排名垫底
            if (passP < 60 || rank === totalSchools) {
                const reason = passP < 60 ? `及格率过低 (${passP.toFixed(1)}%)` : `全镇排名倒数第一`;
                const html = `
                    <div class="traffic-item" onclick="jumpToDetail('${s.name}', '${sub}')">
                        <div class="t-school">${s.name} <span class="t-badge bg-red-light">${subName}</span></div>
                        <div class="t-sub">
                            <span>${reason}</span>
                            <span style="font-weight:bold;">📉 Avg: ${m.avg.toFixed(1)}</span>
                        </div>
                    </div>`;
                listRed.innerHTML += html;
                cntRed++;
            }
            // 2. 🟢 绿色标杆条件：优秀率 > 30% 或 排名第一
            else if (excP > 30 || rank === 1) {
                const reason = rank === 1 ? `全镇排名第一` : `优秀率突出 (${excP.toFixed(1)}%)`;
                const html = `
                    <div class="traffic-item" onclick="jumpToDetail('${s.name}', '${sub}')">
                        <div class="t-school">${s.name} <span class="t-badge bg-green-light">${subName}</span></div>
                        <div class="t-sub">
                            <span>${reason}</span>
                            <span style="font-weight:bold;">🏆 No.${rank}</span>
                        </div>
                    </div>`;
                listGreen.innerHTML += html;
                cntGreen++;
            }
            // 3. 🟡 黄色关注条件：优秀率 < 15% (即缺乏尖子生) 且没被归入红灯
            else if (excP < 15) {
                const html = `
                    <div class="traffic-item" onclick="jumpToDetail('${s.name}', '${sub}')">
                        <div class="t-school">${s.name} <span class="t-badge bg-yellow-light">${subName}</span></div>
                        <div class="t-sub">
                            <span>尖子生匮乏 (优率${excP.toFixed(1)}%)</span>
                            <span>排: ${rank}</span>
                        </div>
                    </div>`;
                listYellow.innerHTML += html;
                cntYellow++;
            }
        });
    });

    // 更新计数徽章
    document.getElementById('count-red').innerText = cntRed;
    document.getElementById('count-yellow').innerText = cntYellow;
    document.getElementById('count-green').innerText = cntGreen;
    
    // 空状态处理
    if(cntRed===0) listRed.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">🎉 平安无事，暂无严重警告</div>';
    if(cntYellow===0) listYellow.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">无风险预警</div>';
    if(cntGreen===0) listGreen.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:10px;">暂无突出标杆，继续加油</div>';
}

// 辅助跳转函数：点击卡片定位到对应表格
function jumpToDetail(school, subject) {
    // 如果是总分，跳到总表
    if (subject === 'total') {
        document.getElementById('anchor-total').scrollIntoView({behavior: "smooth", block: "center"});
    } else {
        // 如果是单科，跳到单科表
        const anchor = document.getElementById(`anchor-subject-${subject}`);
        if(anchor) {
            // 展开侧边栏（如果有的话）
            const navLink = document.querySelector(`.side-nav-sub-link[onclick*="${subject}"]`);
            if(navLink) {
                // 模拟点击展开父级菜单
                const parent = navLink.closest('.side-nav-sub-container');
                if(parent) parent.classList.add('show');
            }
            anchor.scrollIntoView({behavior: "smooth", block: "center"});
        }
    }
    
    // 高亮行闪烁效果
    setTimeout(() => {
        // 简单查找包含学校名的行（不仅限于精确匹配，为了简化）
        // 实际应用中可能需要更精确的ID定位，但这里通过文字匹配即可
        // 提示用户
        UI.toast(`已定位到：${school} - ${subject}`, 'info');
    }, 500);
}
