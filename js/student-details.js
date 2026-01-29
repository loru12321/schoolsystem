// 全局状态管理
let STD_STATE = {
    page: 1,
    size: 100,
    sortCol: null,     // 当前排序列
    sortDir: 'desc',   // desc 或 asc
    activeFilters: {}, // 存储筛选状态: { 'school': new Set(['实验中学', '二中']), '语文': ... }
    cacheData: []      // 最终展示的数据
};

// 1. 主渲染函数
function renderStudentDetails(reset = true) {
    // 隐藏可能存在的筛选菜单
    closeAllMenus();

    if (reset) {
        STD_STATE.page = 1;
        let data = [...RAW_DATA]; // 从原始数据副本开始

        const user = getCurrentUser();
        const role = user?.role || 'guest';
        const isTeacher = role === 'teacher';
        const isClassTeacher = role === 'class_teacher';
        const scope = isTeacher ? getTeacherScopeForUser(user) : null;

        // --- A. 权限过滤 (保持不变) ---
        if (typeof Auth !== 'undefined' && Auth.currentUser) {
             const user = Auth.currentUser;
             if (user.role !== 'admin' && user.role !== 'director' && user.school) {
                 data = data.filter(s => s.school === user.school);
             }
             if (user.role === 'class_teacher') {
                 // 班主任只能看本班或任教班级 (简化逻辑，详细逻辑见原代码)
                 data = data.filter(s => s.class == user.class);
             }
        }

        if (isTeacher && scope && scope.classes.size > 0) {
            data = data.filter(s => scope.classes.has(s.class));
        }

        // --- B. 顶部下拉框过滤 (依然保留，作为一级筛选) ---
        const selectedSchool = document.getElementById('studentSchoolSelect')?.value; 
        const selectedClass = document.getElementById('studentClassSelect')?.value;
        
        if (!isTeacher && !isClassTeacher && selectedSchool && !selectedSchool.includes('请选择')) {
            data = data.filter(s => s.school === selectedSchool);
            if (selectedClass && selectedClass !== '全部') {
                data = data.filter(s => s.class === selectedClass);
            }
        }

        // --- C. Excel 列筛选 (核心逻辑) ---
        // 遍历所有已激活的筛选器
        Object.keys(STD_STATE.activeFilters).forEach(colKey => {
            const allowedValues = STD_STATE.activeFilters[colKey]; // Set 对象
            if (!allowedValues || allowedValues.size === 0) return; 

            data = data.filter(s => {
                let val = getCellValue(s, colKey);
                // 将值统一转为字符串进行比对
                return allowedValues.has(String(val));
            });
        });

        // --- D. 排序 ---
        if (STD_STATE.sortCol) {
            const key = STD_STATE.sortCol;
            const dir = STD_STATE.sortDir === 'asc' ? 1 : -1;
            
            data.sort((a, b) => {
                let valA = getCellValue(a, key);
                let valB = getCellValue(b, key);
                
                // 处理空值
                if (valA === '-' || valA === undefined) valA = -9999;
                if (valB === '-' || valB === undefined) valB = -9999;

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * dir;
                }
                return String(valA).localeCompare(String(valB), 'zh-CN', {numeric: true}) * dir;
            });
        } else {
            // 默认按总分降序
            data.sort((a, b) => b.total - a.total);
        }

        STD_STATE.cacheData = data;
    }

    // --- E. 分页与渲染 ---
    const totalItems = STD_STATE.cacheData.length;
    const totalPages = Math.ceil(totalItems / STD_STATE.size) || 1;
    if (STD_STATE.page > totalPages) STD_STATE.page = totalPages;
    if (STD_STATE.page < 1) STD_STATE.page = 1;

    const startIdx = (STD_STATE.page - 1) * STD_STATE.size;
    const endIdx = startIdx + STD_STATE.size;
    const displayList = STD_STATE.cacheData.slice(startIdx, endIdx);

    const thead = document.querySelector('#studentDetailTable thead tr'); 
    const tbody = document.querySelector('#studentDetailTable tbody');

    const user = getCurrentUser();
    const role = user?.role || 'guest';
    const isTeacher = role === 'teacher';
    const isClassTeacher = role === 'class_teacher';
    const teacherScope = isTeacher ? getTeacherScopeForUser(user) : null;
    const visibleSubjects = isTeacher ? SUBJECTS.filter(s => teacherScope.subjects.has(normalizeSubject(s))) : SUBJECTS;

    // 生成表头 (带漏斗图标)
    let headerHTML = '';
    
    // 辅助：生成表头单元格
    const buildTh = (label, colKey, width='auto') => {
        // 判断该列是否有激活的筛选
        const isFiltered = STD_STATE.activeFilters[colKey] && STD_STATE.activeFilters[colKey].size > 0;
        // 判断该列是否正在排序
        const isSorted = STD_STATE.sortCol === colKey;
        const sortIcon = isSorted ? (STD_STATE.sortDir === 'asc' ? '↑' : '↓') : '';
        
        const activeClass = (isFiltered || isSorted) ? 'active' : '';
        
        return `
            <th style="min-width:${width}">
                <div class="excel-header" onclick="toggleExcelMenu('${colKey}', event)">
                    <div class="header-text">${label} <span style="color:#2563eb">${sortIcon}</span></div>
                    <div class="filter-icon-btn ${activeClass}">
                        <i class="ti ti-filter"></i>
                    </div>
                    <!-- 下拉菜单容器，点击时动态填充 -->
                    <div id="menu-${colKey}" class="excel-filter-menu" onclick="event.stopPropagation()"></div>
                </div>
            </th>
        `;
    };

    headerHTML += buildTh('学校', 'school', '120px');
    headerHTML += buildTh('班级', 'class', '80px');
    headerHTML += buildTh('姓名', 'name', '100px');
    if (!isTeacher && !isClassTeacher) {
        headerHTML += buildTh('考号', 'id', '100px');
        headerHTML += buildTh('考场', 'examRoom', '80px');
        headerHTML += buildTh('T分', 'totalTScore', '60px');
    }

            // 动态判断当前数据是否只有一所学校
    const isSingleSchool = isSingleSchoolMode();
    const townHeaderStyle = isSingleSchool ? 'display:none;' : ''; // 如果单校，隐藏列

    visibleSubjects.forEach(sub => {
        headerHTML += buildTh(sub, sub, '80px');
        if (!isTeacher && !isClassTeacher) {
            headerHTML += `<th>T</th><th>校</th><th>班</th><th style="${townHeaderStyle}">镇</th>`;
        } else if (isClassTeacher) {
            headerHTML += `<th>班</th>`;
        }
    });

    const totalLabel = CONFIG.name === '9年级' ? '五科总分' : '总分';
    if (!isTeacher) {
        headerHTML += buildTh(totalLabel, 'total', '80px');
        if (!isClassTeacher) {
            headerHTML += `<th>校</th><th>班</th><th style="${townHeaderStyle}">镇</th>`;
        } else {
            headerHTML += `<th>班</th>`;
        }
    }

    thead.innerHTML = headerHTML;

    // 生成数据行
    let rowsHTML = displayList.map(student => {
        const nameLink = `<a href="javascript:void(0)" onclick="jumpToStudent('${student.name}', '${student.school}', '${student.class}')" style="color:var(--primary); font-weight:800;">${student.name}</a>`;
        
        let row = `<tr>
            <td data-label="学校">${student.school}</td>
            <td data-label="班级">${student.class}</td>
            <td data-label="姓名">${nameLink}</td>
            ${!isTeacher && !isClassTeacher ? `<td data-label="考号">${student.id}</td><td data-label="考场">${student.examRoom || '-'}</td><td data-label="T分" style="color:#b45309; font-weight:bold;">${student.totalTScore || '-'}</td>` : ''}`;

        visibleSubjects.forEach(sub => {
            const score = student.scores[sub] !== undefined ? student.scores[sub] : '-';
            const t = student.tScores ? (student.tScores[sub] || '-') : '-';
            
            // 修改功能链接
            const clickAttr = `onclick="updateStudentScore('${student.name}', '${student.class}', '${sub}', ${score})"`;
            
            if (!isTeacher && !isClassTeacher) {
                    row += `<td data-label="${sub}分数" ${clickAttr} style="cursor:pointer;" title="点击修改">${score}</td>
                        <td data-label="${sub}T分" class="text-gray">${t}</td>
                        <td data-label="${sub}校排" class="text-gray">${safeGet(student, `ranks.${sub}.school`, '-') }</td>
                        <td data-label="${sub}班排" class="text-gray">${safeGet(student, `ranks.${sub}.class`, '-') }</td>
                        <td data-label="${sub}镇排" class="text-gray" style="${townHeaderStyle}">${safeGet(student, `ranks.${sub}.township`, '-') }</td>`;
            } else if (isClassTeacher) {
                    row += `<td data-label="${sub}分数" ${clickAttr} style="cursor:pointer;" title="点击修改">${score}</td>
                        <td data-label="${sub}班排" class="text-gray">${safeGet(student, `ranks.${sub}.class`, '-') }</td>`;
            } else {
                    row += `<td data-label="${sub}分数" ${clickAttr} style="cursor:pointer;" title="点击修改">${score}</td>`;
            }
        });

        if (!isTeacher) {
            if (!isClassTeacher) {
                    row += `<td data-label="总分" style="color:#2563eb; font-weight:bold;">${student.total}</td>
                        <td data-label="总分校排">${safeGet(student, 'ranks.total.school', '-') }</td>
                        <td data-label="总分班排">${safeGet(student, 'ranks.total.class', '-') }</td>
                        <td data-label="总分镇排">${safeGet(student, 'ranks.total.township', '-') }</td>
                    </tr>`;
            } else {
                    row += `<td data-label="总分" style="color:#2563eb; font-weight:bold;">${student.total}</td>
                        <td data-label="总分班排">${safeGet(student, 'ranks.total.class', '-') }</td>
                    </tr>`;
            }
        } else {
            row += `</tr>`;
        }
        return row;
    }).join('');

    // 分页条
    const paginationHTML = `
        <tr style="background:#f8fafc; font-weight:bold; position:sticky; bottom:0; z-index:150; border-top:2px solid #cbd5e1;">
            <td colspan="100" style="text-align:center; padding:8px;">
                <div style="display:flex; align-items:center; justify-content:center; gap:15px;">
                    <span style="font-size:12px; color:#666;">共 ${totalItems} 条 · ${STD_STATE.page}/${totalPages} 页</span>
                    <button class="btn btn-sm" onclick="changeStdPage(-1)" ${STD_STATE.page===1?'disabled':''}>◀</button>
                    <button class="btn btn-sm" onclick="changeStdPage(1)" ${STD_STATE.page===totalPages?'disabled':''}>▶</button>
                </div>
            </td>
        </tr>`;

    if(totalItems === 0) tbody.innerHTML = `<tr><td colspan="100" style="text-align:center; padding:30px; color:#999;">无数据</td></tr>`;
    else tbody.innerHTML = rowsHTML + paginationHTML;
}

// 辅助：获取单元格值
function getCellValue(student, colKey) {
    if (colKey === 'total') return student.total;
    if (colKey === 'totalTScore') return student.totalTScore;
    if (['school','class','name','id','examRoom'].includes(colKey)) return student[colKey];
    return student.scores[colKey] !== undefined ? student.scores[colKey] : '-';
}

// 2. 切换显示 Excel 菜单
function toggleExcelMenu(colKey, event) {
    // 阻止冒泡
    event.stopPropagation();
    
    const menuId = `menu-${colKey}`;
    const menu = document.getElementById(menuId);
    
    // 如果该菜单已打开，则关闭
    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
        return;
    }

    // 关闭其他所有菜单
    closeAllMenus();

    // 填充菜单内容
    buildFilterMenuContent(colKey, menu);
    
    // 显示
    menu.classList.add('show');
}

// 3. 构建菜单内容 (核心：提取唯一值)
function buildFilterMenuContent(colKey, container) {
    // 简单策略：从当前显示的 cacheData 中提取唯一值
    const uniqueValues = new Set();
    STD_STATE.cacheData.forEach(s => {
        let val = getCellValue(s, colKey);
        uniqueValues.add(String(val));
    });

    // 转为数组并排序
    const sortedValues = Array.from(uniqueValues).sort((a,b) => {
        const numA = parseFloat(a);
        const numB = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.localeCompare(b, 'zh-CN', {numeric:true});
    });

    // 检查哪些被选中了
    const currentSet = STD_STATE.activeFilters[colKey]; 
    const isAllChecked = !currentSet; 
    
    let listHtml = '';
    sortedValues.forEach(v => {
        const checked = isAllChecked || currentSet.has(v) ? 'checked' : '';
        listHtml += `
            <label class="menu-item">
                <input type="checkbox" value="${v}" ${checked} class="filter-cb-${colKey}"> ${v}
            </label>`;
    });

    container.innerHTML = `
        <div class="menu-actions">
            <button class="btn btn-sm btn-gray" style="width:100%" onclick="applySort('${colKey}', 'asc')">⬆️ 升序排列</button>
            <button class="btn btn-sm btn-gray" style="width:100%" onclick="applySort('${colKey}', 'desc')">⬇️ 降序排列</button>
            <input type="text" class="menu-search" placeholder="搜索..." oninput="filterCheckboxList(this)">
        </div>
        <div class="menu-list">
            <label class="menu-item" style="font-weight:bold; border-bottom:1px solid #eee;">
                <input type="checkbox" id="cb-all-${colKey}" ${isAllChecked?'checked':''} onchange="toggleAllCheckboxes('${colKey}', this)"> (全选)
            </label>
            ${listHtml}
        </div>
        <div class="menu-footer">
            <button class="btn btn-sm btn-primary" onclick="confirmFilter('${colKey}')">确定</button>
            <button class="btn btn-sm btn-gray" onclick="clearFilter('${colKey}')">重置</button>
        </div>
    `;
}

// 4. 菜单内部交互函数
window.applySort = function(colKey, dir) {
    STD_STATE.sortCol = colKey;
    STD_STATE.sortDir = dir;
    renderStudentDetails(true); // 重绘
};

window.filterCheckboxList = function(input) {
    const text = input.value.toLowerCase();
    const list = input.closest('.menu-actions').nextElementSibling;
    const items = list.querySelectorAll('.menu-item');
    // 跳过第一个(全选)
    for (let i = 1; i < items.length; i++) {
        const itemText = items[i].innerText.toLowerCase();
        items[i].style.display = itemText.includes(text) ? 'flex' : 'none';
    }
};

window.toggleAllCheckboxes = function(colKey, source) {
    const cbs = document.querySelectorAll(`.filter-cb-${colKey}`);
    cbs.forEach(cb => {
        if(cb.parentElement.style.display !== 'none') {
            cb.checked = source.checked;
        }
    });
};

window.confirmFilter = function(colKey) {
    const cbs = document.querySelectorAll(`.filter-cb-${colKey}:checked`);
    const allCbs = document.querySelectorAll(`.filter-cb-${colKey}`);
    
    if (cbs.length === allCbs.length) {
        delete STD_STATE.activeFilters[colKey];
    } else {
        const selectedValues = new Set();
        cbs.forEach(cb => selectedValues.add(cb.value));
        STD_STATE.activeFilters[colKey] = selectedValues;
    }
    
    renderStudentDetails(true);
};

window.clearFilter = function(colKey) {
    delete STD_STATE.activeFilters[colKey];
    renderStudentDetails(true);
};

function closeAllMenus() {
    document.querySelectorAll('.excel-filter-menu').forEach(el => el.classList.remove('show'));
}

// 点击空白关闭菜单
document.addEventListener('click', closeAllMenus);

// 辅助：翻页
window.changeStdPage = function(delta) {
    STD_STATE.page += delta;
    renderStudentDetails(false); 
    document.querySelector('#student-details .table-wrap').scrollTop = 0;
};

function exportStudentDetails() {
    if (!RAW_DATA.length) { alert('请先上传数据'); return; }

    const user = getCurrentUser();
    const role = user?.role || 'guest';
    if (role === 'teacher') {
        logAction('导出拦截', '科任教师尝试导出学生明细');
        return alert('⛔ 权限不足：科任教师禁止导出学生明细');
    }
    
    const selectedSchool = document.getElementById('studentSchoolSelect').value; 
    const selectedClass = document.getElementById('studentClassSelect').value;
    
    // 1. 判断是否为单校模式 (只有1所学校)
    const isSingleSchool = Object.keys(SCHOOLS).length <= 1;

    const wb = XLSX.utils.book_new(); 
    
    // 2. 动态构建表头
    const isClassTeacher = role === 'class_teacher';
    const headers = isClassTeacher
        ? ['学校', '班级', '姓名']
        : ['学校', '班级', '姓名', '考号', '考场', '标准分总和(T分)'];
    
    SUBJECTS.forEach(subject => {
        if (isClassTeacher) {
            headers.push(`${subject} 分数`, `${subject} 班排`);
        } else {
            headers.push(`${subject} 分数`, `${subject} T分`, `${subject} 校排`, `${subject} 班排`);
            if (!isSingleSchool) headers.push(`${subject} 镇排`);
        }
    });

    if (!isClassTeacher) {
        if (CONFIG.name === '9年级') {
            headers.push('五科总分', '五科校排', '五科班排');
            if (!isSingleSchool) headers.push('五科镇排');
        } else {
            headers.push('总分', '总分校排', '总分班排');
            if (!isSingleSchool) headers.push('总分镇排');
        }
    } else {
        headers.push(CONFIG.name === '9年级' ? '五科总分' : '总分', '总分班排');
    }
    
    const data = [headers]; 
    
    let studentsToShow = [...RAW_DATA]; 
    if (isClassTeacher && user?.class) {
        studentsToShow = studentsToShow.filter(s => s.class === user.class);
    } else if(selectedSchool && !selectedSchool.includes('请选择')) { 
        studentsToShow = studentsToShow.filter(s => s.school === selectedSchool); 
        if(selectedClass && selectedClass !== '全部') studentsToShow = studentsToShow.filter(s => s.class === selectedClass); 
    }
    studentsToShow.sort((a, b) => b.total - a.total);
    
    // 3. 填充数据行 (需与表头逻辑严格对应)
    studentsToShow.forEach(student => {
        const row = isClassTeacher
            ? [student.school, student.class, student.name]
            : [student.school, student.class, student.name, student.id, student.examRoom, student.totalTScore || 0]; 
        
        SUBJECTS.forEach(subject => {
            const tVal = student.tScores && student.tScores[subject] ? student.tScores[subject] : '-';
            if (isClassTeacher) {
                row.push(student.scores[subject] || '-', safeGet(student, `ranks.${subject}.class`, '-'));
            } else {
                row.push(
                    student.scores[subject] || '-', 
                    tVal, 
                    safeGet(student, `ranks.${subject}.school`, '-'), 
                    safeGet(student, `ranks.${subject}.class`, '-')
                );
                if (!isSingleSchool) {
                    row.push(safeGet(student, `ranks.${subject}.township`, '-'));
                }
            }
        });

        if (!isClassTeacher) {
            row.push(
                student.total, 
                safeGet(student, 'ranks.total.school', '-'), 
                safeGet(student, 'ranks.total.class', '-')
            );
            if (!isSingleSchool) {
                row.push(safeGet(student, 'ranks.total.township', '-'));
            }
        } else {
            row.push(student.total, safeGet(student, 'ranks.total.class', '-'));
        }

        data.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // 调用装饰函数美化 Excel
    decorateExcelSheet(ws, headers);
    
    XLSX.utils.book_append_sheet(wb, ws, '学生考试明细'); 
    XLSX.writeFile(wb, '学生考试明细.xlsx');
}

// 🟢 [新增] 核心功能：管理员/级部主任修改成绩并同步云端
async function updateStudentScore(name, cls, subject, oldScore) {
    /* 👇👇👇 🟢 修改：权限校验逻辑 (支持级部主任) 🟢 👇👇👇 */
    // 1. 权限与身份校验
    const user = typeof Auth !== 'undefined' ? Auth.currentUser : null;
    if (!user) return alert("请先登录系统");

    const role = user.role;
    
    // 允许: 管理员(admin) 和 级部主任(grade_director)
    if (role !== 'admin' && role !== 'grade_director') {
        return alert("⛔ 权限不足：只有【管理员】或【级部主任】可以修改原始成绩。\n\n(科任教师或班主任如需修改，请联系上级或重新上传Excel)");
    }

    // 级部主任特有检查：只能修改本年级的班级
    if (role === 'grade_director') {
        // 数据库中 class_name 存的是级部名称(如 "7" 或 "七")
        const myGrade = String(user.class || "").trim(); 
        const targetClass = String(cls).trim();

        // 简单逻辑：班级名必须以级部名开头 (例如 "7" 匹配 "701", "705")
        // 如果级部是中文 "七"，而班级是 "701"，可能需要更复杂的映射，这里假设输入一致
        if (!myGrade || !targetClass.startsWith(myGrade)) {
            return alert(`⛔ 越权操作拦截！\n\n您是【${myGrade}年级】主任，无权修改【${targetClass}班】的成绩。`);
        }
    }
    /* 👆👆👆 🟢 结束 🟢 👆👆👆 */

    // 2. 弹出输入框
    const newScoreStr = prompt(`📝 正在修改成绩\n\n学生：${cls}班 ${name}\n科目：${subject}\n\n当前分数：${oldScore}\n请输入新分数：`, oldScore);
    
    // 用户点击取消
    if (newScoreStr === null) return; 
    
    const newScore = parseFloat(newScoreStr);
    if (isNaN(newScore)) return alert("❌ 输入错误：请输入有效的数字！");
    if (newScore === oldScore) return; // 分数没变，不做处理

    // 3. 在内存数据中查找并更新
    // 使用 姓名 + 班级 + 学校 组合键进行精确查找
    const student = RAW_DATA.find(s => s.name === name && s.class === cls && s.school === (window.MY_SCHOOL || s.school));
    
    if (!student) {
        return alert("❌ 错误：未在内存中找到该学生数据，请尝试刷新页面。");
    }

    // 更新单科成绩
    student.scores[subject] = newScore;
    
    // 4. 重新计算该学生的总分
    // 逻辑：判断当前模式（9年级五科模式 vs 全科模式）
    let newTotal = 0;
    let subjectsToCount = [];

    if (CONFIG && CONFIG.name && CONFIG.name.includes('9')) {
        // 9年级模式：只累加语数英物化
        subjectsToCount = ['语文', '数学', '英语', '物理', '化学'];
    } else {
        // 其他模式：CONFIG.totalSubs 如果是 'auto' 则累加所有科目
        subjectsToCount = (CONFIG.totalSubs === 'auto') ? SUBJECTS : CONFIG.totalSubs;
    }
    
    // 执行累加
    subjectsToCount.forEach(sub => {
        const val = student.scores[sub];
        if (typeof val === 'number') {
            newTotal += val;
        }
    });
    
    student.total = parseFloat(newTotal.toFixed(2)); // 保持2位小数

    // 5. 全局重算 (触发 Worker 重新排名、计算两率一分)
    UI.loading(true, "正在重新排名并同步云端...");
    
    try {
        await processData(); // 等待 Worker 计算完成
        
        // 6. 保存到 Supabase 云端 (关键步骤)
        await saveCloudData();
        
        // 7. 刷新界面
        renderStudentDetails(false); // 刷新列表，false表示不重置页码
        renderTables(); // 刷新宏观分析表
        
        UI.loading(false);
        UI.toast(`✅ 修改成功！\n${name} 的 ${subject} 已更新为 ${newScore}\n总分更新为 ${student.total}`, "success");

        // 🛡️ [日志埋点] 记录成绩修改操作
        Logger.log('修改成绩', `${cls}班 ${name} - ${subject}: ${oldScore} -> ${newScore} (总分:${student.total}) [操作人:${user.name}]`);
       
    } catch (err) {
        UI.loading(false);
        console.error(err);
        alert("❌ 保存失败：" + err.message);
    }
}

function generateMobileLongImage() {
    const sch = document.getElementById('studentSchoolSelect').value;
    const cls = document.getElementById('studentClassSelect').value;
    if (!sch || !cls || cls === '全部' || sch.includes('请选择')) return alert("请先选择具体的【学校】和【班级】！");

    const students = RAW_DATA.filter(s => s.school === sch && s.class === cls);
    if (students.length === 0) return alert("该班级无数据");
    
    // 1. 数据准备
    students.sort((a, b) => b.total - a.total);
    const avg = students.reduce((a, b) => a + b.total, 0) / students.length;
    const max = students[0].total;
    
    // 2. 渲染容器
    const container = document.getElementById('mobile-share-render-area');
    const dateStr = new Date().toLocaleDateString();
    
    // 只展示前 15 名，避免图片过长，或者全部展示（视需求而定，这里展示前15+底部提示）
    const displayLimit = 15;
    let topListHtml = '';
    
    students.slice(0, displayLimit).forEach((s, i) => {
        let rankClass = 'background:#f1f5f9; color:#64748b;'; // 默认普通排名
        let rankIcon = i + 1;
        
        // 前三名特殊样式
        if (i === 0) { rankClass = 'background:#fee2e2; color:#dc2626; border:1px solid #fecaca;'; rankIcon = '🥇'; } 
        else if (i === 1) { rankClass = 'background:#ffedd5; color:#c2410c; border:1px solid #fed7aa;'; rankIcon = '🥈'; } 
        else if (i === 2) { rankClass = 'background:#fef9c3; color:#b45309; border:1px solid #fde047;'; rankIcon = '🥉'; }

        topListHtml += `
            <div class="m-list-row" style="display:flex; justify-content:space-between; padding:12px 10px; border-bottom:1px dashed #eee; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; ${rankClass}">${rankIcon}</span>
                    <span style="font-weight:bold; font-size:15px; color:#333;">${s.name}</span>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:#2563eb; font-size:16px;">${s.total}</div>
                    <div style="font-size:10px; color:#94a3b8;">镇排: ${safeGet(s, 'ranks.total.township', '-')}</div>
                </div>
            </div>`;
    });

    // 如果人数超过展示限制，加个提示
    if (students.length > displayLimit) {
        topListHtml += `<div style="text-align:center; padding:10px; color:#94a3b8; font-size:12px;">... 后续 ${students.length - displayLimit} 名学生略 ...</div>`;
    }

    // 3. 构建 HTML (内联样式确保 html2canvas 渲染准确)
    container.innerHTML = `
        <div style="background:white; padding-bottom:20px;">
            <!-- 头部海报区 -->
            <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 30px 20px; text-align: center; border-radius: 0 0 30px 30px; margin-bottom: 20px; position:relative; overflow:hidden;">
                <!-- 装饰背景圆 -->
                <div style="position:absolute; top:-20px; left:-20px; width:100px; height:100px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
                <div style="position:absolute; bottom:-10px; right:-10px; width:80px; height:80px; background:rgba(255,255,255,0.1); border-radius:50%;"></div>
                
                <div style="font-size: 12px; opacity: 0.9; letter-spacing: 2px; margin-bottom: 5px; text-transform:uppercase;">Academic Report</div>
                <div style="font-size: 24px; font-weight: 800; margin-bottom: 5px; text-shadow:0 2px 4px rgba(0,0,0,0.2);">${sch} · ${cls}</div>
                <div style="font-size: 14px; opacity: 0.9; background:rgba(255,255,255,0.2); display:inline-block; padding:4px 12px; border-radius:20px;">
                    ${CONFIG.name} 成绩快报
                </div>
            </div>
            
            <!-- 核心指标卡 -->
            <div style="margin: 0 15px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center; margin-bottom: 20px;">
                <div style="background:#f8fafc; padding:15px 5px; border-radius:12px; border:1px solid #e2e8f0;">
                    <div style="font-size:20px; font-weight:800; color:#334155;">${students.length}</div>
                    <div style="font-size:10px; color:#64748b; margin-top:2px;">参考人数</div>
                </div>
                <div style="background:#f0f9ff; padding:15px 5px; border-radius:12px; border:1px solid #bae6fd;">
                    <div style="font-size:20px; font-weight:800; color:#0284c7;">${avg.toFixed(1)}</div>
                    <div style="font-size:10px; color:#0369a1; margin-top:2px;">班级均分</div>
                </div>
                <div style="background:#fffbeb; padding:15px 5px; border-radius:12px; border:1px solid #fde68a;">
                    <div style="font-size:20px; font-weight:800; color:#d97706;">${max}</div>
                    <div style="font-size:10px; color:#b45309; margin-top:2px;">最高分</div>
                </div>
            </div>

            <!-- 榜单列表 -->
            <div style="margin: 0 15px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); border: 1px solid #f1f5f9; overflow: hidden;">
                <div style="background:#f8fafc; padding:12px 15px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:bold; color:#333; display:flex; align-items:center; gap:5px;">
                        <span style="color:#eab308;">🏆</span> 光荣榜 (Top ${displayLimit})
                    </span>
                    <span style="font-size:10px; color:#94a3b8;">按总分排序</span>
                </div>
                <div style="padding: 0 10px;">
                    ${topListHtml}
                </div>
            </div>

            <!-- 底部落款 -->
            <div style="text-align: center; margin-top: 30px; color: #cbd5e1; font-size: 10px; line-height: 1.5;">
                <div style="margin-bottom:5px;">📅 生成日期: ${dateStr}</div>
                <div>本数据由 [智能教务分析系统] 自动生成</div>
                <div>仅供班级内部学情分析使用</div>
            </div>
        </div>
    `;

    // 4. 调用 html2canvas
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="ti ti-loader"></i> 生成中...';
    btn.disabled = true;

    setTimeout(() => {
        html2canvas(container, { 
            scale: 2, // 2倍高清
            useCORS: true, 
            backgroundColor: '#f3f4f6' // 背景色
        }).then(canvas => {
            const imgData = canvas.toDataURL("image/png");
            const resultBox = document.getElementById('mobile-img-result');
            // 限制高度，允许滚动查看
            resultBox.innerHTML = `<img src="${imgData}" style="width:100%; display:block; border-radius:8px;">`;
            
            document.getElementById('mobileShareModal').style.display = 'flex';
            
            // 恢复按钮
            btn.innerHTML = originalText;
            btn.disabled = false;
        }).catch(err => {
            alert("生成失败: " + err.message);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    }, 300); // 稍微延时等待 DOM 渲染
}

// 辅助：获取进步之星 HTML
function getProgressStarsHtml(school, className) {
    if (!PROGRESS_CACHE || PROGRESS_CACHE.length === 0) return "暂无进退步数据 (需在'进退步追踪'模块分析)";
    
    // 筛选本班进步最大的前5名
    const stars = PROGRESS_CACHE.filter(p => p.class === className && p.change > 0)
                                .sort((a, b) => b.change - a.change)
                                .slice(0, 5);
    
    if (stars.length === 0) return "本次无明显进步记录";
    
    return stars.map(s => 
        `<span style="display:inline-block; margin:3px; padding:2px 6px; background:#dcfce7; color:#166534; border-radius:10px;">
            ${s.name} ↑${s.change}
         </span>`
    ).join("");
}

function downloadMobileImage() {
    const img = document.querySelector('#mobile-img-result img');
    if (img) {
        const link = document.createElement('a');
        link.download = `班级成绩长图_${new Date().getTime()}.png`;
        link.href = img.src;
        link.click();
    }
}
