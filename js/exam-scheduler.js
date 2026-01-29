// ================== 智能考场编排逻辑 ==================
function EXAM_loadData(input) {
    const file = input.files[0]; if(!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, {type: 'array'}); const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            if(!json.length) throw new Error("Excel没有数据");
            EXAM_DATA = json.map(r => ({ name: r['姓名'] || '未知', class: r['班级'] || r['班'] || '未知', school: r['学校'] || '', score: parseFloat(r['总分'] || r['score'] || 0) }));
            alert(`✅ 已导入 ${EXAM_DATA.length} 名学生，准备进行考场编排。`);
        } catch(err) { alert("读取失败：" + err.message); }
    }; reader.readAsArrayBuffer(file);
}

function EXAM_generate() {
    if(!EXAM_DATA.length) return alert("请先导入学生名单"); 
    
    const prefix = document.getElementById('exam_prefix').value; 
    const seatsPerRoom = parseInt(document.getElementById('exam_seats_per_room').value) || 30;
    const useSeparate = document.getElementById('exam_opt_separate').checked;
    const useSnake = document.getElementById('exam_opt_snake').checked;

    // 1. 初步排序：按成绩降序 (保证考场分层)
    let list = [...EXAM_DATA].sort((a,b) => b.score - a.score);
    
    // 2. 同班互斥逻辑 (核心业务升级)
    // 原理：遍历列表，如果发现当前学生与上一个学生同班，则向后寻找非同班学生进行交换
    // 限制：仅在小范围内(如后10名)寻找，避免破坏成绩分层太严重
    if (useSeparate) {
        let swapCount = 0;
        for (let i = 1; i < list.length - 1; i++) {
            // 如果当前学生与前一个同班
            if (list[i].class === list[i-1].class) {
                // 向后寻找最近的一个不同班同学
                let swapped = false;
                for (let j = i + 1; j < Math.min(i + 15, list.length); j++) {
                    if (list[j].class !== list[i].class && list[j].class !== list[i-1].class) {
                        // 交换位置
                        [list[i], list[j]] = [list[j], list[i]];
                        swapped = true;
                        swapCount++;
                        break;
                    }
                }
            }
        }
        if(swapCount > 0) UI.toast(`已智能微调 ${swapCount} 人次以打散同班同学`, 'success');
    }

    EXAM_ROOMS = [];
    const cols = 4; // 假设每行4列 (用于计算蛇形)

    list.forEach((s, i) => {
        // 基础考号逻辑
        s.examNo = prefix + String(i+1).padStart(3, '0'); 
        s.roomNo = Math.floor(i / seatsPerRoom) + 1; 
        
        // 3. 座位号计算
        let seatIdx = (i % seatsPerRoom); // 0 ~ 29
        
        // 蛇形排列逻辑 (S型)
        // 假设排列是：
        // 1 2 3 4
        // 8 7 6 5 (反向)
        // 9 10 11 12
        if (useSnake) {
            const row = Math.floor(seatIdx / cols);
            // 如果是奇数行(第2行, idx=1)，则列号反转
            if (row % 2 !== 0) {
                const col = seatIdx % cols;
                const reversedCol = (cols - 1) - col;
                // 重新计算 seatIdx
                seatIdx = (row * cols) + reversedCol;
            }
        }
        
        s.seatNo = seatIdx + 1;

        if(!EXAM_ROOMS[s.roomNo-1]) { 
            EXAM_ROOMS[s.roomNo-1] = { id: s.roomNo, students: [] }; 
        } 
        EXAM_ROOMS[s.roomNo-1].students.push(s);
    });

    // 如果用了蛇形，按座号重新排序一下，方便打印查看
    if (useSnake) {
        EXAM_ROOMS.forEach(r => r.students.sort((a,b) => a.seatNo - b.seatNo));
    }

    document.getElementById('exam-results-area').classList.remove('hidden'); 
    EXAM_renderOverview(); 
    EXAM_renderStudentList(); 
    EXAM_renderProctorTable(); 
    EXAM_renderPrintView();
}

function EXAM_switchView(view, btn) {
    document.querySelectorAll('#exam-results-area .nav-link').forEach(l => l.classList.remove('active')); btn.classList.add('active');
    document.getElementById('exam-view-overview').classList.add('hidden'); document.getElementById('exam-view-students').classList.add('hidden'); document.getElementById('exam-view-proctor').classList.add('hidden'); document.getElementById('exam-view-'+view).classList.remove('hidden');
}

function EXAM_renderOverview() {
    const container = document.getElementById('exam_room_grid'); container.innerHTML = '';
    EXAM_ROOMS.forEach(room => { const first = room.students[0].examNo; const last = room.students[room.students.length-1].examNo; container.innerHTML += `<div class="exam-room-card" onclick="alert('提示：请使用“打印桌贴”功能查看该考场的详细座次表')"><div class="exam-room-title">第 ${String(room.id).padStart(2,'0')} 考场</div><div class="exam-room-info"><span>人数: ${room.students.length}</span></div><div class="exam-room-range">${first} - ${last}</div></div>`; });
}

function EXAM_renderStudentList() {
    const tbody = document.querySelector('#exam_student_table tbody'); let html = '';
    const sorted = [...EXAM_DATA].sort((a,b) => { if(a.class !== b.class) return String(a.class).localeCompare(String(b.class), undefined, {numeric:true}); return a.examNo.localeCompare(b.examNo); });
    sorted.slice(0, 500).forEach(s => { html += `<tr><td>${s.examNo}</td><td>${s.name}</td><td>${s.class}</td><td>${String(s.roomNo).padStart(2,'0')}</td><td>${String(s.seatNo).padStart(2,'0')}</td><td>${s.score}</td></tr>`; });
    if(sorted.length > 500) html += `<tr><td colspan="6" style="text-align:center">...更多数据请导出Excel查看...</td></tr>`; tbody.innerHTML = html;
}

function EXAM_renderProctorTable() {
    const tbody = document.querySelector('#exam_proctor_table tbody'); let html = '';
    EXAM_ROOMS.forEach(room => { const first = room.students[0].examNo; const last = room.students[room.students.length-1].examNo; html += `<tr><td>第 ${String(room.id).padStart(2,'0')} 考场</td><td>${room.students.length}</td><td>${first} - ${last}</td><td></td><td></td></tr>`; });
    tbody.innerHTML = html;
}

function EXAM_renderPrintView() {
    const container = document.getElementById('batch-print-area-wrapper'); if(!container) return; container.innerHTML = ''; let html = '';
    EXAM_ROOMS.forEach(room => {
        let seatsHtml = ''; room.students.forEach(s => { seatsHtml += `<div class="exam-print-seat"><div class="exam-print-seat-num">第${String(s.seatNo).padStart(2,'0')}号</div><div class="exam-print-seat-name">${s.name}</div><div class="exam-print-seat-id">考号: ${s.examNo}</div><div style="font-size:10px;">${s.class}</div></div>`; });
        html += `<div class="exam-print-page"><div class="exam-print-header">第 ${String(room.id).padStart(2,'0')} 考场座位表 (共${room.students.length}人)</div><div class="exam-print-grid">${seatsHtml}</div><div style="margin-top:20px; font-size:12px;">监考员签字：_________________   &nbsp;&nbsp;&nbsp; 巡考员签字：_________________</div></div>`;
    });
    container.innerHTML = html;
}

function EXAM_generateDeskLabels() {
    if (!EXAM_ROOMS || EXAM_ROOMS.length === 0) return alert("请先点击“一键生成考场安排”");
    
    const container = document.getElementById('desk-labels-print-area');
    container.innerHTML = ''; 
    let html = '';

    EXAM_ROOMS.forEach(room => {
        html += `<div class="desk-label-page">`; 
        
        room.students.forEach(s => {
            html += `
                <div class="desk-label-card">
                    <!-- 1. 顶部：考号 (最大) -->
                    <div class="dl-exam-no">${s.examNo}</div>
                    
                    <!-- 2. 中间：班级(左) + 姓名(右) (中等) -->
                    <div class="dl-main-row">
                        <span>${s.class}</span>
                        <span>${s.name}</span>
                    </div>
                    
                    <!-- 3. 底部：考场 + 座号 (最小) -->
                    <div class="dl-footer-row">
                        <span class="dl-room-box">${String(room.id).padStart(2,'0')}场</span>
                        <span class="dl-seat-box">${String(s.seatNo).padStart(2,'0')}座</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`; 
    });

    container.innerHTML = html;
    UI.toast("✅ 桌贴生成完毕 (考号最大化)", "success");

    const app = document.getElementById('app');
    const labelsArea = document.getElementById('desk-labels-print-area');
    const originalDisplay = app.style.display;
    
    app.style.display = 'none';
    labelsArea.style.display = 'block';

    setTimeout(() => {
        window.print();
        app.style.display = originalDisplay;
        labelsArea.style.display = 'none';
        container.innerHTML = ''; 
    }, 500);
}

// 初始化教师勾选列表和下拉框
function EXAM_initProctorUI() {
    const teachers = [...new Set(Object.values(TEACHER_MAP))].sort();
    const poolContainer = document.getElementById('proctor-teacher-pool');
    const patrolSel = document.getElementById('proctor-role-patrol');
    const affairsSel = document.getElementById('proctor-role-affairs');
    
    if (!teachers.length) return;

    // 渲染黑名单勾选
    poolContainer.innerHTML = teachers.map(name => `
        <label class="teacher-item">
            <input type="checkbox" class="exclude-check" value="${name}"> ${name}
        </label>
    `).join('');

    // 渲染多选下拉框
    const options = teachers.map(name => `<option value="${name}">${name}</option>`).join('');
    patrolSel.innerHTML = options;
    affairsSel.innerHTML = options;
}

// 执行编排逻辑
function EXAM_assignProctors() {
    if (!EXAM_ROOMS.length) return alert("请先生成考场安排");

    const allTeachers = [...new Set(Object.values(TEACHER_MAP))];
    
    // 获取排除人员
    const excluded = Array.from(document.querySelectorAll('.exclude-check:checked')).map(el => el.value);
    
    // 获取特殊岗位人员
    const patrols = Array.from(document.getElementById('proctor-role-patrol').selectedOptions).map(o => o.value);
    const affairs = Array.from(document.getElementById('proctor-role-affairs').selectedOptions).map(o => o.value);

    // 可用监考池 = 总人员 - 排除 - 特殊岗位
    let availablePool = allTeachers.filter(t => 
        !excluded.includes(t) && !patrols.includes(t) && !affairs.includes(t)
    );

    const needed = EXAM_ROOMS.length * 2;
    if (availablePool.length < needed) {
        return alert(`❌ 人员不足！\n当前考场需要 ${needed} 名监考，但排除后仅剩 ${availablePool.length} 人。\n请减少排除项或合并岗位。`);
    }

    // 洗牌算法乱序
    availablePool.sort(() => Math.random() - 0.5);

    // 填充监考汇总表
    const tbody = document.querySelector('#exam_proctor_table tbody');
    let html = '';
    EXAM_ROOMS.forEach((room, i) => {
        const p1 = availablePool[i * 2];
        const p2 = availablePool[i * 2 + 1];
        const first = room.students[0].examNo;
        const last = room.students[room.students.length-1].examNo;
        
        html += `
            <tr>
                <td><strong>第 ${String(room.id).padStart(2,'0')} 考场</strong></td>
                <td>${room.students.length}</td>
                <td>${first} - ${last}</td>
                <td style="background:#eff6ff; font-weight:bold;">${p1}</td>
                <td style="background:#eff6ff; font-weight:bold;">${p2}</td>
            </tr>
        `;
    });

    // 底部追加考务组
    html += `
        <tr style="background:#f8fafc; border-top: 2px solid #333;">
            <td colspan="3" style="text-align:right; font-weight:bold;">⚖️ 纪律巡考人员：</td>
            <td colspan="2" style="text-align:left; color:var(--danger); font-weight:bold;">${patrols.join('、') || '未指定'}</td>
        </tr>
        <tr style="background:#f8fafc;">
            <td colspan="3" style="text-align:right; font-weight:bold;">🧹 卫生考务保障：</td>
            <td colspan="2" style="text-align:left; color:var(--success); font-weight:bold;">${affairs.join('、') || '未指定'}</td>
        </tr>
    `;

    tbody.innerHTML = html;
    UI.toast("✅ 监考人员分配完成，请查看“监考汇总表”", "success");
    // 自动切到汇总表看结果
    EXAM_switchView('proctor', document.querySelector('.nav-link[onclick*="proctor"]'));
}

function EXAM_exportResult() {
    if(!EXAM_DATA.length) return alert("无考生数据"); 
    if(!EXAM_ROOMS.length) return alert("请先生成考场安排");

    const wb = XLSX.utils.book_new();
    
    // 1. 考生总表
    const sheet1Data = [['考号','姓名','学校','班级','考场号','座号','参考分']]; 
    EXAM_DATA.forEach(s => sheet1Data.push([s.examNo, s.name, s.school, s.class, s.roomNo, s.seatNo, s.score]));
    
    // 2. 监考人员安排表 (核心：直接读取界面表格，所见即所得)
    const sheet2Data = [['单位/考场','应考人数','起止考号','监考老师 A','监考老师 B']];
    const proctorRows = document.querySelectorAll('#exam_proctor_table tbody tr');
    
    if (proctorRows.length === 0) {
        alert("⚠️ 提示：您尚未进行“人员配置”或点击“一键编排”。监考表将只包含考生信息。");
    } else {
        proctorRows.forEach(tr => {
            const tds = tr.querySelectorAll('td');
            const rowData = [];
            tds.forEach(td => rowData.push(td.innerText));
            sheet2Data.push(rowData);
        });
    }

    // 3. 考场参考表
    const sheet3Data = [['考场','座号','姓名','考号','班级']]; 
    EXAM_DATA.forEach(s => sheet3Data.push([s.roomNo, s.seatNo, s.name, s.examNo, s.class]));
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), "考生座次总表"); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), "全校监考考务表"); 
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet3Data), "桌贴打印备份"); 
    
    XLSX.writeFile(wb, `${CONFIG.name || '学校'}考务编排结果全集.xlsx`);
}
