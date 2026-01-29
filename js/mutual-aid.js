function updateMutualAidSelects() {
    const source = document.getElementById('aid_source').value;
    const schSel = document.getElementById('aidSchoolSelect'); 
    const clsSel = document.getElementById('aidClassSelect');
    const subSel = document.getElementById('aidSubjectSelect');
    schSel.innerHTML = ''; clsSel.innerHTML = '<option value="">--班级--</option>'; subSel.innerHTML = '';
    if (source === 'freshman') {
        schSel.disabled = true; schSel.innerHTML = '<option value="SIM">🚀 新生模拟数据</option>';
        subSel.innerHTML = '<option value="total">入学总分</option>'; subSel.disabled = true;
        if (Object.keys(FB_SIMULATED_DATA).length > 0) { Object.keys(FB_SIMULATED_DATA).sort().forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`); } else { clsSel.innerHTML = '<option value="">(暂无数据)</option>'; }
    } else {
        schSel.disabled = false; schSel.innerHTML = '<option value="">--请选择学校--</option>'; 
        Object.keys(SCHOOLS).forEach(s => schSel.innerHTML += `<option value="${s}">${s}</option>`);
        schSel.onchange = () => { clsSel.innerHTML = '<option value="">--班级--</option>'; if(schSel.value && SCHOOLS[schSel.value]) { const classes = [...new Set(SCHOOLS[schSel.value].students.map(s => s.class))].sort(); classes.forEach(c => clsSel.innerHTML += `<option value="${c}">${c}</option>`); } };
        subSel.disabled = false; subSel.innerHTML = '<option value="total">总分(综合)</option>'; SUBJECTS.forEach(s => subSel.innerHTML += `<option value="${s}">${s}</option>`);
    }
}

function renderMutualAidGroups() {
    const source = document.getElementById('aid_source').value;
    const sch = document.getElementById('aidSchoolSelect').value; 
    const cls = document.getElementById('aidClassSelect').value;
    const sub = document.getElementById('aidSubjectSelect').value;
    const groupSize = parseInt(document.getElementById('aidGroupSize').value) || 4;
    let students = [];
    if (source === 'freshman') {
        if(!cls || !FB_SIMULATED_DATA[cls]) return alert("无分班数据");
        students = FB_SIMULATED_DATA[cls].map(s => ({...s, class: cls, total: s.score, scores: {total: s.score}, ranks: {total: {class: 0}}}));
    } else {
        if(!sch || !cls) return alert("请选择学校和班级");
        students = JSON.parse(JSON.stringify(SCHOOLS[sch].students.filter(s => s.class === cls)));
    }
    if(students.length < groupSize) return alert("班级人数不足以分组");
    const getScore = (s) => (sub === 'total' ? s.total : (s.scores[sub] || 0));
    students.sort((a, b) => getScore(b) - getScore(a));
    students.forEach((s, i) => s._subRankPct = (i + 1) / students.length);
    let totalSorted = [...students].sort((a, b) => b.total - a.total);
    totalSorted.forEach((s, i) => { let target = students.find(x => x.name === s.name); if(target) target._totalRankPct = (i + 1) / students.length; });
    let mentors = students.filter(s => s._subRankPct <= 0.25 && s._totalRankPct <= 0.40);
    if (mentors.length < (students.length / groupSize) * 0.5) { mentors = students.filter(s => s._subRankPct <= 0.25 && s._totalRankPct <= 0.50); }
    const targetGroupCount = Math.ceil(students.length / groupSize);
    if (mentors.length < targetGroupCount) { mentors = students.slice(0, targetGroupCount); }
    mentors = mentors.slice(0, targetGroupCount);
    let remaining = students.filter(s => !mentors.includes(s));
    let groups = mentors.map((m, i) => ({ id: i + 1, leader: m, members: [] }));
    remaining.sort((a, b) => getScore(b) - getScore(a));
    let direction = 1; let gIdx = 0;
    while(remaining.length > 0) {
        let student = remaining.shift(); groups[gIdx].members.push(student);
        gIdx += direction;
        if (gIdx >= groups.length) { gIdx = groups.length - 1; direction = -1; } else if (gIdx < 0) { gIdx = 0; direction = 1; }
    }
    AID_GROUPS_CACHE = groups;
    renderAidGroupsHTML(groups, sub);
}

function renderAidGroupsHTML(groups, sub) {
    const container = document.getElementById('aid-groups-container'); container.innerHTML = '';
    groups.forEach(g => {
        const allScores = [g.leader, ...g.members].map(s => sub==='total'?s.total:(s.scores[sub]||0)); const avg = allScores.reduce((a,b)=>a+b,0) / allScores.length;
        let membersHtml = '';
        g.members.forEach(m => {
            const score = sub==='total'?m.total:(m.scores[sub]||0); let tag = ''; if (m._subRankPct > 0.8) tag = `<span class="aid-tag tag-weak">需帮扶</span>`;
            membersHtml += `<div class="aid-role-row aid-member"><div class="aid-avatar">${m.name[0]}</div><div class="aid-info"><div class="aid-name">${m.name} ${tag}</div><div class="aid-score">${sub}: ${score}</div></div></div>`;
        });
        const leaderScore = sub==='total'?g.leader.total:(g.leader.scores[sub]||0);
        const card = document.createElement('div'); card.className = 'aid-card';
        card.innerHTML = `<div class="aid-header"><span>第 ${g.id} 组</span><span style="font-weight:normal; color:#666;">均分: ${avg.toFixed(1)}</span></div><div class="aid-body"><div class="aid-role-row aid-leader"><div class="aid-avatar">组</div><div class="aid-info"><div class="aid-name">${g.leader.name} <span class="aid-tag tag-strong">组长</span></div><div class="aid-score">${sub}: ${leaderScore}</div></div></div>${membersHtml}</div>`; container.appendChild(card);
    });
}

function exportMutualAidGroups() {
    if(AID_GROUPS_CACHE.length === 0) return alert("请先生成分组");
    const wb = XLSX.utils.book_new(); const data = [['组号', '角色', '姓名', '参考分数']];
    AID_GROUPS_CACHE.forEach(g => {
        const sub = document.getElementById('aidSubjectSelect').value; const getS = (s) => sub==='total'?s.total:(s.scores[sub]||0);
        data.push([g.id, '组长', g.leader.name, getS(g.leader)]);
        g.members.forEach(m => { data.push([g.id, '组员', m.name, getS(m)]); });
        data.push(['', '', '', '']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "学科互助分组"); XLSX.writeFile(wb, "互助分组名单.xlsx");
}
