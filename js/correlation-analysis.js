// ================= 关联分析逻辑 =================
function updateCorrelationSchoolSelect() {
    const sel = document.getElementById('corrSchoolSelect'); const old = sel.value;
    sel.innerHTML = '<option value="ALL">全乡镇 (All)</option>';
    Object.keys(SCHOOLS).forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
    if(old) sel.value = old;
}

function calculatePearson(x, y) {
    let n = x.length; if (n === 0) return 0;
    let sum_x = 0, sum_y = 0, sum_xy = 0, sum_x2 = 0, sum_y2 = 0;
    for (let i = 0; i < n; i++) { sum_x += x[i]; sum_y += y[i]; sum_xy += x[i] * y[i]; sum_x2 += x[i] * x[i]; sum_y2 += y[i] * y[i]; }
    let numerator = (n * sum_xy) - (sum_x * sum_y); let denominator = Math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y));
    return (denominator === 0) ? 0 : numerator / denominator;
}

function renderCorrelationAnalysis() {
    const scope = document.getElementById('corrSchoolSelect').value;
    const students = (scope === 'ALL') ? RAW_DATA : (SCHOOLS[scope]?.students || []);
    if(students.length < 5) return alert('样本数据太少，无法进行有效分析');

    const matrixBody = document.querySelector('#corrMatrixTable tbody');
    let mHtml = '<tr><th></th>'; SUBJECTS.forEach(s => mHtml += `<th>${s}</th>`); mHtml += '</tr>';
    SUBJECTS.forEach(rowSub => {
        mHtml += `<tr><th>${rowSub}</th>`;
        SUBJECTS.forEach(colSub => {
            if (rowSub === colSub) { mHtml += '<td style="background:#eee;">-</td>'; } else {
                const common = students.filter(s => s.scores[rowSub] !== undefined && s.scores[colSub] !== undefined);
                const r = calculatePearson(common.map(s => s.scores[rowSub]), common.map(s => s.scores[colSub]));
                let bg = '#fff'; if(r > 0) bg = `rgba(220, 38, 38, ${r * 0.8})`; else bg = `rgba(37, 99, 235, ${Math.abs(r) * 0.8})`;
                let color = Math.abs(r) > 0.5 ? '#fff' : '#333';
                mHtml += `<td class="heatmap-cell" style="background:${bg}; color:${color}" title="${rowSub} vs ${colSub} 相关系数: ${r.toFixed(3)}">${r.toFixed(2)}</td>`;
            }
        });
        mHtml += '</tr>';
    });
    matrixBody.innerHTML = mHtml;

    const contribData = SUBJECTS.map(sub => {
        const common = students.filter(s => s.scores[sub] !== undefined);
        const r = calculatePearson(common.map(s => s.scores[sub]), common.map(s => s.total));
        return { sub, r };
    }).sort((a, b) => b.r - a.r);

    const chartContainer = document.getElementById('contributionChartContainer');
    chartContainer.innerHTML = '';
    contribData.forEach(item => {
        const w = Math.max(0, item.r * 100);
        chartContainer.innerHTML += `<div style="display:flex; align-items:center; margin-bottom:5px;"><span style="width:40px; font-size:12px; font-weight:bold;">${item.sub}</span><div style="flex:1; background:#f1f5f9; border-radius:4px; margin-left:10px; height:20px;"><div class="contribution-bar" style="width:${w}%; background:${item.r>0.8?'#16a34a':(item.r>0.6?'#2563eb':'#ca8a04')}">${item.r.toFixed(3)}</div></div></div>`;
    });

    const liftDragBody = document.querySelector('#liftDragTable tbody'); let ldHtml = '';
    SUBJECTS.forEach(sub => {
        let lift = 0, drag = 0, balance = 0; let validCount = 0;
        students.forEach(s => {
            const tRank = safeGet(s, 'ranks.total.township', 0); const sRank = safeGet(s, `ranks.${sub}.township`, 0);
            if(!tRank || !sRank) return;
            validCount++; const threshold = students.length * 0.1; 
            if (sRank < tRank - threshold) lift++; else if (sRank > tRank + threshold) drag++; else balance++;
        });
        if(validCount > 0) {
            const net = lift - drag;
            ldHtml += `<tr><td>${sub}</td><td class="text-green">${lift} 人 (${(lift/validCount*100).toFixed(0)}%)</td><td class="text-red">${drag} 人 (${(drag/validCount*100).toFixed(0)}%)</td><td>${balance} 人</td><td style="font-weight:bold; color:${net>0?'green':'red'}">${net>0?'+':''}${net}</td></tr>`;
        }
    });
    liftDragBody.innerHTML = ldHtml;
}
