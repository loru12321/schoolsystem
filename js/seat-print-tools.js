// 座位调整 + 打印配置 + 标签组件

function renderSeatGrid() { } // Placeholder

function generateSeatSuggestions() {
    const sch = document.getElementById('seatAdjSchoolSelect').value; 
    const cls = document.getElementById('seatAdjClassSelect').value;
    if(!sch || !cls) return alert("请先选择学校和班级");
    
    let students = [];
    if(SCHOOLS[sch] && SCHOOLS[sch].students) {
        students = JSON.parse(JSON.stringify(SCHOOLS[sch].students.filter(s => s.class === cls)));
    }
    if(!students.length) return alert("该班级无学生数据");

    const diffInput = parseConstraintStr(document.getElementById('adj_c_diff').value);
    const visionInput = parseConstraintStr(document.getElementById('adj_c_vision').value);
    const psyInput = parseConstraintStr(document.getElementById('adj_c_psy').value);
    const talkInput = parseConstraintStr(document.getElementById('adj_c_talk').value);
    const conflictInput = parseConflictStr(document.getElementById('adj_c_conflict').value);

    const hasInputs = (diffInput.length || visionInput.length || psyInput.length || talkInput.length || conflictInput.length);
    if(!hasInputs) {
        if(!confirm("您未输入任何特殊情况约束（如视力、难管、矛盾等）。\n确定要按纯成绩生成座次吗？")) return;
    }

    students.forEach(s => {
        s._isDiff = false; s._isVision = false; s._isPsy = false; // Reset
        if(diffInput.includes(s.name) || talkInput.includes(s.name)) s._isDiff = true;
        if(psyInput.includes(s.name)) s._isPsy = true;
        if(visionInput.includes(s.name)) s._isVision = true;
    });
    
    students.sort((a,b) => b.total - a.total);
    const total = students.length;
    const strategy = document.getElementById('seatAdjStrategy').value;
    const groupsCount = parseInt(document.getElementById('seatAdjGroups').value) || 2;
    const colsPerGroup = parseInt(document.getElementById('seatAdjCols').value) || 4;
    
    let seatList = [];
    let strategyText = "";

    if(strategy === 'conversion') {
        strategyText = "【A带C，B带D】将学生按成绩分为4层。A层(优)与C层(潜)同桌，B层(良)与D层(后)同桌。旨在通过优生拉动临界生。";
        let quarter = Math.ceil(total / 4);
        let A = students.slice(0, quarter);
        let B = students.slice(quarter, quarter*2);
        let C = students.slice(quarter*2, quarter*3);
        let D = students.slice(quarter*3);
        
        let maxLen = Math.max(A.length, B.length, C.length, D.length);
        for(let i=0; i<maxLen; i++) {
            if(i < A.length) seatList.push(A[i]);
            if(i < C.length) seatList.push(C[i]);
            if(i < B.length) seatList.push(B[i]);
            if(i < D.length) seatList.push(D[i]);
        }
    } else if (strategy === 'balanced') {
        strategyText = "【4人均分平衡】S型蛇形排列，确保每4人小组（2x2区域）的平均分尽可能一致，适合开展小组PK机制。";
        seatList = [...students]; 
    } else {
        strategyText = "【传统互助】第1名与最后1名同桌。";
        let left = 0, right = total - 1;
        while(left <= right) {
            if (left === right) { seatList.push(students[left]); } 
            else { seatList.push(students[left]); seatList.push(students[right]); }
            left++; right--;
        }
    }

    if(visionInput.length > 0) {
        const visions = seatList.filter(s => s._isVision);
        const others = seatList.filter(s => !s._isVision);
        seatList = [...visions, ...others];
    }

    if(conflictInput.length > 0) {
        for(let k=0; k<3; k++) { 
            conflictInput.forEach(pair => {
                const idx1 = seatList.findIndex(s => s.name === pair[0]);
                const idx2 = seatList.findIndex(s => s.name === pair[1]);
                if(idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) <= 1) {
                    const safeIdx = Math.floor(seatList.length * 0.75);
                    if(safeIdx < seatList.length && safeIdx !== idx1) {
                        [seatList[idx2], seatList[safeIdx]] = [seatList[safeIdx], seatList[idx2]];
                    }
                }
            });
        }
    }

    document.getElementById('seat-strategy-desc').innerText = strategyText;
    const container = document.getElementById('seat-adj-container');
    const countDisplay = document.getElementById('seat-count-display');
    container.innerHTML = '';
    document.getElementById('seat-adj-workspace').classList.remove('hidden');
    countDisplay.innerHTML = `当前班级：${cls} | 总人数：${total} 人`;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = `repeat(${groupsCount}, 1fr)`;
    container.style.gap = '50px';
    container.style.alignItems = 'start';
    
    const rowCapacity = groupsCount * colsPerGroup;
    const totalRows = Math.ceil(seatList.length / rowCapacity);
    
    const groupEls = []; 
    for(let g=0; g<groupsCount; g++) { 
        const gel = document.createElement('div'); gel.className = 'seat-group'; 
        gel.style.display = 'grid'; gel.style.gridTemplateColumns = `repeat(${colsPerGroup}, 1fr)`; 
        gel.style.gap = '10px'; gel.style.position = 'relative';
        groupEls.push(gel); container.appendChild(gel); 
    }
    
    for(let r=0; r<totalRows; r++) {
        for(let g=0; g<groupsCount; g++) {
            for(let c=0; c<colsPerGroup; c++) {
                let idx = r * rowCapacity + g * colsPerGroup + c;
                if(strategy === 'balanced' && r % 2 !== 0) { idx = r * rowCapacity + g * colsPerGroup + (colsPerGroup - 1 - c); }

                if (idx < seatList.length) {
                    const stu = seatList[idx];
                    const desk = document.createElement('div');
                    desk.className = 'desk';
                    
                    const originalRank = students.findIndex(x => x.name === stu.name);
                    const rankPct = (originalRank + 1) / total;
                    if(rankPct <= 0.25) desk.classList.add('desk-rank-A'); else if(rankPct <= 0.5) desk.classList.add('desk-rank-B'); else if(rankPct <= 0.75) desk.classList.add('desk-rank-C'); else desk.classList.add('desk-rank-D');

                    if(stu._isDiff) desk.classList.add('is-diff'); 
                    if(stu._isVision) desk.style.border = "2px solid #3b82f6"; 
                    if(stu._isPsy) desk.style.border = "2px dashed #ec4899"; 

                    desk.draggable = true;
                    desk.innerHTML = `<div class="desk-name">${stu.name}</div><div class="desk-info">${stu.total}分</div>`;
                    
                    desk.ondragstart = (e) => { e.dataTransfer.setData('text/html', desk.outerHTML); desk.classList.add('dragging'); window.dragSrcEl = desk; };
                    desk.ondragover = (e) => { e.preventDefault(); };
                    desk.ondrop = (e) => {
                        e.preventDefault();
                        if (window.dragSrcEl !== desk) {
                            const srcHTML = window.dragSrcEl.innerHTML; const srcClass = window.dragSrcEl.className; const srcStyle = window.dragSrcEl.style.cssText;
                            window.dragSrcEl.innerHTML = desk.innerHTML; window.dragSrcEl.className = desk.className; window.dragSrcEl.style.cssText = desk.style.cssText;
                            desk.innerHTML = srcHTML; desk.className = srcClass; desk.style.cssText = srcStyle;
                        }
                        window.dragSrcEl.classList.remove('dragging');
                    };
                    groupEls[g].appendChild(desk);
                } else {
                    const emptyDesk = document.createElement('div'); emptyDesk.style.visibility = 'hidden'; groupEls[g].appendChild(emptyDesk);
                }
            }
        }
    }

    for(let g=0; g<groupsCount; g++) {
        const gel = groupEls[g];
        if(colsPerGroup % 2 === 0) {
            for(let r=0; r<totalRows; r+=2) {
                for(let c=0; c<colsPerGroup; c+=2) {
                    const box = document.createElement('div'); box.className = 'learning-group-box';
                    box.style.left = `${c * 90 - 5}px`; box.style.top = `${r * 65 - 5}px`; box.style.width = `175px`; box.style.height = `125px`;
                    box.innerHTML = `<div class="learning-group-label">小组 ${g+1}-${Math.ceil((c+1)/2) + (r/2)*(colsPerGroup/2)}</div>`;
                    gel.appendChild(box);
                }
            }
        }
    }
    
    if(strategy === 'balanced') document.getElementById('seat-stats').innerText = "提示：虚线框内为4人学习共同体，建议设立组长负责制，实行组间积分PK。";
    else document.getElementById('seat-stats').innerText = "";
}

function applyPrintSettings() {
    const size = document.getElementById('ps-size').value;
    const orient = document.getElementById('ps-orient').value;
    const scale = document.getElementById('ps-scale').value;
    const compact = document.getElementById('ps-compact').checked;
    const hideHeader = document.getElementById('ps-hide-header').checked;
    const hideNav = document.getElementById('ps-hide-nav').checked;
    const hideCharts = document.getElementById('ps-hide-charts').checked;
    const watermarkText = document.getElementById('ps-watermark-text').value;
    const watermarkOpacity = document.getElementById('ps-watermark-opacity').value;

    document.documentElement.style.setProperty('--p-size', size);
    document.documentElement.style.setProperty('--p-orient', orient);
    document.documentElement.style.setProperty('--p-scale', scale);
    document.documentElement.style.setProperty('--p-watermark-text', `"${watermarkText}"`);
    document.documentElement.style.setProperty('--p-watermark-opacity', watermarkOpacity);

    const body = document.body;
    if (watermarkText.trim()) body.classList.add('print-watermarked'); else body.classList.remove('print-watermarked');
    if (hideHeader) body.classList.add('p-hide-header'); else body.classList.remove('p-hide-header');
    if (hideNav) body.classList.add('p-hide-nav'); else body.classList.remove('p-hide-nav');
    if (hideCharts) body.classList.add('p-hide-charts'); else body.classList.remove('p-hide-charts');
    if (compact) body.classList.add('p-compact-table'); else body.classList.remove('p-compact-table');

    alert("✅ 打印配置已应用！\n\n请点击“调用打印机”按钮查看预览效果。\n提示：浏览器打印设置中请勾选“背景图形”以显示颜色。");
}

// ================== [新增] 智能标签输入组件逻辑 ==================
function initTagWidget(wrapperId, hiddenInputId) {
    const wrapper = document.getElementById(wrapperId); if(!wrapper) return;
    const input = wrapper.querySelector('.tag-input-field'); const dropdown = wrapper.querySelector('.suggestion-dropdown');
    wrapper.addEventListener('click', (e) => { if(e.target === wrapper) input.focus(); });
    if(input) {
        input.addEventListener('input', function() {
            const val = this.value.trim().toLowerCase();
            if(!val) { dropdown.style.display = 'none'; return; }
            const matches = CURRENT_CONTEXT_STUDENTS.filter(s => s.name.includes(val)).slice(0, 8);
            if(matches.length) { dropdown.innerHTML = matches.map(s => `<div class="suggestion-item" onclick="addTagToWidget('${wrapperId}', '${hiddenInputId}', '${s.name}')">${s.name} <small>${s.score||s.total}分</small></div>`).join(''); dropdown.style.display = 'block'; } 
            else { dropdown.style.display = 'none'; }
        });
        input.addEventListener('blur', () => { setTimeout(() => dropdown.style.display = 'none', 200); });
    }
}
function addTagToWidget(wrapperId, hiddenInputId, name) {
    const currentTags = getTagsFromHidden(hiddenInputId);
    if(currentTags.includes(name)) { const input = document.getElementById(wrapperId).querySelector('.tag-input-field'); if(input) input.value = ''; return; }
    currentTags.push(name); document.getElementById(hiddenInputId).value = currentTags.join(', ');
    renderTagsUI(wrapperId, hiddenInputId);
    const input = document.getElementById(wrapperId).querySelector('.tag-input-field'); if(input) { input.value = ''; input.focus(); }
}
function removeTagFromWidget(wrapperId, hiddenInputId, name) {
    const currentTags = getTagsFromHidden(hiddenInputId); const newTags = currentTags.filter(t => t !== name);
    document.getElementById(hiddenInputId).value = newTags.join(', '); renderTagsUI(wrapperId, hiddenInputId);
}
function getTagsFromHidden(id) { const val = document.getElementById(id).value; return val ? val.split(/[,;]/).map(s => s.trim()).filter(s => s) : []; }
function renderTagsUI(wrapperId, hiddenInputId) {
    const wrapper = document.getElementById(wrapperId); const tags = getTagsFromHidden(hiddenInputId);
    wrapper.querySelectorAll('.tag-chip').forEach(c => c.remove());
    const input = wrapper.querySelector('.tag-input-field');
    tags.forEach(tag => {
        const chip = document.createElement('div'); chip.className = 'tag-chip';
        chip.innerHTML = `${tag} <span class="tag-chip-remove" onclick="removeTagFromWidget('${wrapperId}', '${hiddenInputId}', '${tag}')">&times;</span>`;
        if(input) wrapper.insertBefore(chip, input); else wrapper.appendChild(chip);
    });
}
function addConflictPair(type) {
    // 根据类型获取对应的下拉框 ID
    const idA = type === 'adj' ? 'conflict_sel_a' : 'fb_conflict_sel_a';
    const idB = type === 'adj' ? 'conflict_sel_b' : 'fb_conflict_sel_b';
    const wrapperId = type === 'adj' ? 'widget_adj_conflict' : 'widget_fb_conflict'; 
    const hiddenId = type === 'adj' ? 'adj_c_conflict' : 'fb_c_conflict';

    const selA = document.getElementById(idA);
    const selB = document.getElementById(idB);

    // 校验选择
    if(!selA || !selB) return console.error("找不到下拉框元素");
    if(!selA.value || !selB.value) return alert("请先选择两个学生");
    if(selA.value === selB.value) return alert("不能选择同一个学生");

    // 添加到标签栏
    addTagToWidget(wrapperId, hiddenId, `${selA.value}&${selB.value}`); 
    
    // 重置选项
    selA.value = ""; 
    selB.value = "";
}

function updateConstraintWidgetsContext(type) {
    let students = [];

    // 1. 获取当前上下文的学生列表
    if(type === 'adj') {
        // 考后排座模式：从学校和班级下拉框获取数据
        const sch = document.getElementById('seatAdjSchoolSelect').value; 
        const cls = document.getElementById('seatAdjClassSelect').value;

        if(sch && cls && SCHOOLS[sch]) {
            // 过滤出该班学生
            students = SCHOOLS[sch].students.filter(s => s.class === cls);
        }
        
        // 更新全局上下文
        CURRENT_CONTEXT_STUDENTS = students;
        
        // 初始化其他标签组件
        ['diff', 'vision', 'psy', 'talk'].forEach(f => { 
            initTagWidget(`widget_adj_${f}`, `adj_c_${f}`); 
            renderTagsUI(`widget_adj_${f}`, `adj_c_${f}`); 
        });
        renderTagsUI('widget_adj_conflict', 'adj_c_conflict');

    } else if(type === 'fb') {
        // 新生分班模式：从当前选中的班级对象获取数据
        if(FB_CUR_CLASS_IDX !== -1 && FB_CLASSES[FB_CUR_CLASS_IDX]) {
            students = FB_CLASSES[FB_CUR_CLASS_IDX].students;
        }

        CURRENT_CONTEXT_STUDENTS = students;
        
        ['diff', 'vision', 'talk'].forEach(f => { 
            initTagWidget(`widget_fb_${f}`, `fb_c_${f}`); 
            renderTagsUI(`widget_fb_${f}`, `fb_c_${f}`); 
        });
        renderTagsUI('widget_fb_conflict', 'fb_c_conflict');
        
        // ★★★ 新增：初始化“强行绑定”组件 ★★★
        renderTagsUI('widget_fb_bind', 'fb_c_bind');
    }

    // 2. 生成下拉框选项 HTML (统一处理)
    let opts = '<option value="">--点击选择--</option>';
    if (students.length > 0) {
        // 按姓名排序，方便查找
        students.sort((a,b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
        opts += students.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    } else {
        opts = '<option value="">(暂无学生数据)</option>';
    }

    // 3. 将选项填充到对应的下拉框中
    if (type === 'fb') {
         // 更新新生分班的“矛盾”下拉框
         const cA = document.getElementById('fb_conflict_sel_a'); 
         const cB = document.getElementById('fb_conflict_sel_b');
         if(cA && cB) { cA.innerHTML = opts; cB.innerHTML = opts; }
         
         // ★★★ 新增：更新新生分班的“绑定”下拉框 ★★★
         const bA = document.getElementById('fb_bind_sel_a'); 
         const bB = document.getElementById('fb_bind_sel_b');
         if(bA && bB) { bA.innerHTML = opts; bB.innerHTML = opts; }
         
    } else if (type === 'adj') {
         // 更新考后排座的“矛盾”下拉框
         const elA = document.getElementById('conflict_sel_a'); 
         const elB = document.getElementById('conflict_sel_b');
         if(elA && elB) { elA.innerHTML = opts; elB.innerHTML = opts; }
    }
}
