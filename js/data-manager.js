// 📊 数据综合管理器 (学生/教师/档案/参数/目标/SQL)
const DataManager = {
    currentTab: 'student', // student | teacher | archive | params | targets
    pagination: { page: 1, size: 50, total: 0 },
    
    // 1. 打开面板
    open: function() {
        const user = Auth.currentUser;
        if (!user) return alert("请先登录");
        if (user.role !== 'admin' && user.role !== 'director') {
            return alert("⛔ 权限不足：只有管理员或教务主任可操作底层数据。");
        }
        
        document.getElementById('data-manager-modal').style.display = 'flex';
        this.switchTab('student');
    },

    // 2. 切换标签页 (修复版：支持所有管理模块)
    switchTab: function(tab) {
        this.currentTab = tab;
        this.pagination.page = 1;
        const searchInput = document.getElementById('dm-search-input');
        if(searchInput) searchInput.value = ''; 
        
        // 样式切换
        document.querySelectorAll('.login-tab').forEach(el => el.classList.remove('active'));
        
        let tabId = 'tab-data-stu';
        if(tab === 'teacher') tabId = 'tab-data-tea';
        if(tab === 'archive') tabId = 'tab-data-arch';
        if(tab === 'params') tabId = 'tab-data-params';
        if(tab === 'targets') tabId = 'tab-data-targets';
        if(tab === 'sql') tabId = 'tab-data-sql';
        if(tab === 'cloud') tabId = 'tab-data-cloud';
        if(tab === 'history') tabId = 'tab-data-history';

        const el = document.getElementById(tabId);
        if(el) el.classList.add('active');
        
        // --- 区域显隐控制 ---
        
        // 学生表
        const stuTable = document.getElementById('dm-student-table');
        if(stuTable) stuTable.style.display = tab === 'student' ? 'table' : 'none';
        
        // 教师区域 (新版容器)
        const teaArea = document.getElementById('dm-teacher-area');
        if(teaArea) teaArea.style.display = tab === 'teacher' ? 'block' : 'none';
        
        // 隐藏旧版直接引用的教师表 (防止冲突)
        const oldTeaTable = document.getElementById('dm-teacher-table');
        if(oldTeaTable && !teaArea) oldTeaTable.style.display = tab === 'teacher' ? 'table' : 'none';

        // 其他区域
        const archArea = document.getElementById('dm-archive-area');
        if(archArea) archArea.style.display = tab === 'archive' ? 'block' : 'none';
        
        const paramArea = document.getElementById('dm-params-area');
        if(paramArea) paramArea.style.display = tab === 'params' ? 'block' : 'none';
        
        const targetArea = document.getElementById('dm-targets-area');
        if(targetArea) targetArea.style.display = tab === 'targets' ? 'block' : 'none';
        
        const sqlArea = document.getElementById('dm-sql-area');
        if(sqlArea) sqlArea.style.display = tab === 'sql' ? 'flex' : 'none';

        const cloudArea = document.getElementById('dm-cloud-area');
        if(cloudArea) cloudArea.style.display = tab === 'cloud' ? 'flex' : 'none';

        const histArea = document.getElementById('dm-history-area');
        if(histArea) histArea.style.display = tab === 'history' ? 'flex' : 'none';
        
        // 如果切到云端管理，立即加载列表
        if(tab === 'cloud') this.renderCloudBackups();
        if(tab === 'sql') this.renderSQLHistory();

        // 搜索栏和分页栏逻辑 (教师页现在有独立筛选，不再使用顶部通用搜索)
        const showSearch = (tab === 'student'); 
        const searchBar = document.getElementById('dm-search-bar');
        const pageBar = document.getElementById('dm-pagination');
        if(searchBar) searchBar.style.display = showSearch ? 'flex' : 'none';
        if(pageBar) pageBar.style.display = showSearch ? 'flex' : 'none';

        // 初始化教师页面的学校下拉框
        if (tab === 'teacher') {
            // 强制重新初始化届别元数据，防止因数据延迟导致的渲染失败
            if (!window.CURRENT_COHORT_META && window.CURRENT_COHORT_ID) {
                try {
                    const storedMeta = localStorage.getItem('CURRENT_COHORT_META');
                    if (storedMeta) window.CURRENT_COHORT_META = JSON.parse(storedMeta);
                    else window.CURRENT_COHORT_META = { id: window.CURRENT_COHORT_ID, year: String(window.CURRENT_COHORT_ID).replace(/\D/g,'') };
                } catch(e) {}
            }

            this.updateTeacherSchoolSelect();
            this.renderTeacherTermSelect();
            
            // 🟢 [修复]：选中学期并自动同步云端数据
            setTimeout(() => {
                const termId = localStorage.getItem('CURRENT_TERM_ID') || getTermId(getExamMetaFromUI());
                if(termId) {
                    const sel = document.getElementById('dm-teacher-term-select');
                    if(sel) sel.value = termId;
                    // switchTeacherTerm 内部已经包含云端同步逻辑
                    DataManager.switchTeacherTerm(termId);
                }
            }, 50);
        }

        // 👇👇👇 🟢 [同步修复]：切换到参数页时，强制刷新数据显示 🟢 👇👇👇
        if (tab === 'params') {
            this.renderParams();
        }

        this.renderCurrentTab();
    },

    // --- 模块 A: 云端数据管理 (重构版) ---
    renderCloudBackups: async function() {
        if (!sbClient) return;
        const tbody = document.querySelector('#dm-cloud-table tbody');
        const summaryEl = document.getElementById('dm-cloud-summary');
        
        // 初始化加载状态
        if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">⏳ 正在读取云端数据库...</td></tr>';
        if(summaryEl) {
            summaryEl.style.display = 'block';
            summaryEl.innerHTML = '⏳ 正在分析数据...';
        }

        try {
            // 1. 获取数据列表 (只取元数据，不取你可以让载荷过大的 content)
            const { data, error } = await sbClient
                .from('system_data')
                .select('key, created_at, updated_at, content') // content 用于计算大小
                .order('updated_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                if(tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;">☁️ 云端数据库为空</td></tr>';
                if(summaryEl) summaryEl.innerHTML = '📌 暂无存档记录';
                return;
            }

            // 2. 统计信息
            const totalSize = data.reduce((acc, item) => acc + (item.content ? item.content.length : 0), 0);
            const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
            if(summaryEl) {
                summaryEl.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>📌 云端共 <b>${data.length}</b> 个存档 | 总占用: <b>${totalSizeMB} MB</b></span>
                        <span style="font-size:11px; color:#94a3b8;">只显示最近更新的记录</span>
                    </div>
                `;
            }

            // 3. 渲染列表
            const currentKey = localStorage.getItem('CURRENT_PROJECT_KEY');
            let rows = '';
            
            data.forEach(item => {
                const isCurrent = (item.key === currentKey);
                const sizeKB = (item.content ? item.content.length / 1024 : 0).toFixed(1);
                const time = new Date(item.updated_at || item.created_at).toLocaleString();
                
                // 解析Key结构：2022级_9年级_2025-2026_上学期_期中_全镇联考
                // 如果不符合结构，则直接显示Key
                let displayName = item.key;
                let tags = '';
                
                const parts = item.key.split('_');
                if (parts.length >= 5) {
                    displayName = `<b>${parts[0]} ${parts[1]}</b><br><span style="color:#64748b; font-size:11px;">${parts[2]} ${parts[3]} ${parts[5]||''}</span>`;
                    tags = `<span class="badge" style="background:${parts[4]==='期末'?'#ef4444':'#3b82f6'}; color:white; padding:2px 6px; border-radius:4px; font-size:10px;">${parts[4]}</span>`;
                }

                rows += `
                    <tr style="${isCurrent ? 'background:#f0fdf4;' : ''}">
                        <td>
                            <div style="display:flex; align-items:center; gap:8px;">
                                ${isCurrent ? '<i class="ti ti-current-location" style="color:#16a34a;" title="当前项目"></i>' : ''}
                                <div>${displayName}</div>
                                ${tags}
                            </div>
                        </td>
                        <td style="font-size:12px; color:#64748b;">${time}</td>
                        <td style="font-size:12px;">${sizeKB} KB</td>
                        <td>
                            <div style="display:flex; gap:6px;">
                                <button class="btn btn-sm btn-primary" onclick="DataManager.loadCloudBackup('${item.key}')" title="读取此存档">
                                    <i class="ti ti-download"></i> 读取
                                </button>
                                <button class="btn btn-sm btn-danger" onclick="DataManager.deleteCloudBackup('${item.key}')" title="永久删除">
                                    <i class="ti ti-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            if(tbody) tbody.innerHTML = rows;

        } catch (err) {
            console.error(err);
            if(tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444;">❌ 加载失败: ${err.message}</td></tr>`;
        }
    },

    // 加载指定的云端存档
    loadCloudBackup: async function(key) {
        if (!confirm(`⚠️ 确定要切换到存档 [${key}] 吗？\n当前未保存的工作将会丢失。`)) return;
        
        // 临时修改 Current Key，然后调用 CloudManager.load
        localStorage.setItem('CURRENT_PROJECT_KEY', key);
        await CloudManager.load();
        
        // 刷新列表状态
        this.renderCloudBackups();
    },

    deleteCloudBackup: async function(key) {
        if (!confirm(`🧨 危险操作！\n\n确定要永久删除 [${key}] 吗？\n删除后无法恢复！`)) return;
        
        UI.loading(true, `正在删除 ${key}...`);
        try {
            const { error } = await sbClient
                .from('system_data')
                .delete()
                .eq('key', key);
            
            if (error) throw error;
            
            UI.toast('✅ 删除成功', 'success');
            this.renderCloudBackups();
        } catch (e) {
            alert('删除失败: ' + e.message);
        } finally {
            UI.loading(false);
        }
    },



    // --- 模块 B: 历史数据上传 (Sheet名=学校名, 班级+姓名=Key) ---
    handleHistoryUpload: function(input) {
        const file = input.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                
                let parsedHistory = [];
                let calcModeMsg = ""; 
                
                // 1. 遍历所有 Sheet
                wb.SheetNames.forEach(sheetName => {
                    const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
                    if (json.length === 0) return;

                    const sample = json[0];
                    const keyName = Object.keys(sample).find(k => k.includes('姓名') || k.toLowerCase() === 'name');
                    const keyClass = Object.keys(sample).find(k => k.includes('班') || k.toLowerCase().includes('class'));
                    const keyScore = Object.keys(sample).find(k => k.includes('总分') || k.includes('得分') || k.includes('Total'));
                    
                    const subjectKeywords = ['语文','数学','英语','物理','化学','政治','历史','地理','生物','科学','道法'];
                    const subjectColMap = {}; 
                    
                    Object.keys(sample).forEach(header => {
                        const cleanHeader = header.trim();
                        if (cleanHeader.includes('排') || cleanHeader.includes('赋')) return;
                        const matchedSub = subjectKeywords.find(k => cleanHeader.includes(k));
                        if (matchedSub) {
                            subjectColMap[matchedSub] = header; 
                            if (!SUBJECTS.includes(matchedSub)) SUBJECTS.push(matchedSub);
                        }
                    });
                    SUBJECTS.sort(sortSubjects);

                    // 确定计算策略
                    const isGrade9 = CONFIG.name && CONFIG.name.includes('9');
                    let targetSubjects = isGrade9 ? ['语文', '数学', '英语', '物理', '化学'] : Object.keys(subjectColMap);
                    if (isGrade9) calcModeMsg = "9年级模式"; else calcModeMsg = "全科模式";

                    let schoolStudents = [];

                    json.forEach((row, idx) => {
                        let name = keyName ? row[keyName] : "";
                        if (!name || String(name).trim() === '') name = `${sheetName}_考生_${idx + 1}`;
                        let className = (keyClass && row[keyClass]) ? normalizeClass(row[keyClass]) : "默认班级";
                        
                        let totalScore = 0;
                        let scoresObj = {}; 

                        // 解析单科
                        Object.keys(subjectColMap).forEach(sub => {
                            const colName = subjectColMap[sub];
                            if (row[colName] !== undefined) {
                                const val = parseFloat(row[colName]);
                                if (!isNaN(val)) scoresObj[sub] = val;
                            }
                        });

                        // 计算总分
                        if (keyScore && row[keyScore] !== undefined) {
                            totalScore = parseFloat(row[keyScore]);
                        } else {
                            let sum = 0; let hasValidSub = false;
                            targetSubjects.forEach(sub => {
                                if (scoresObj[sub] !== undefined) { sum += scoresObj[sub]; hasValidSub = true; }
                            });
                            if (hasValidSub) totalScore = parseFloat(sum.toFixed(2));
                        }

                        schoolStudents.push({
                            name: String(name).trim(),
                            class: className,
                            school: sheetName,
                            total: totalScore || 0,
                            scores: scoresObj,
                            ranks: {} // 初始化排名对象
                        });
                    });
                    parsedHistory = parsedHistory.concat(schoolStudents);
                });

                if (parsedHistory.length === 0) throw new Error("未解析到有效数据");

                // ==========================================
                // 🔥 核心升级：计算历史数据的【总分】及【所有单科】排名 🔥
                // ==========================================
                
                // 辅助函数：通用排名计算
                const calcRank = (list, scoreGetter, rankSetter) => {
                    list.sort((a,b) => scoreGetter(b) - scoreGetter(a));
                    list.forEach((s, i) => rankSetter(s, i + 1));
                };

                // 1. 全镇范围 (总分 + 单科)
                calcRank(parsedHistory, s => s.total, (s, r) => { if(!s.ranks.total) s.ranks.total={}; s.townRank = r; s.ranks.total.township = r; });
                
                SUBJECTS.forEach(sub => {
                    // 过滤出有该科成绩的学生
                    const validList = parsedHistory.filter(s => s.scores[sub] !== undefined);
                    calcRank(validList, s => s.scores[sub], (s, r) => { if(!s.ranks[sub]) s.ranks[sub]={}; s.ranks[sub].township = r; });
                });

                // 2. 学校范围 (总分 + 单科)
                const schools = {};
                parsedHistory.forEach(s => { if(!schools[s.school]) schools[s.school]=[]; schools[s.school].push(s); });
                
                Object.values(schools).forEach(group => {
                    calcRank(group, s => s.total, (s, r) => { s.schoolRank = r; s.ranks.total.school = r; });
                    SUBJECTS.forEach(sub => {
                        const validList = group.filter(s => s.scores[sub] !== undefined);
                        calcRank(validList, s => s.scores[sub], (s, r) => { if(!s.ranks[sub]) s.ranks[sub]={}; s.ranks[sub].school = r; });
                    });
                });

                // 3. 班级范围 (总分 + 单科)
                const classes = {};
                parsedHistory.forEach(s => { const k = s.school+"_"+s.class; if(!classes[k]) classes[k]=[]; classes[k].push(s); });

                Object.values(classes).forEach(group => {
                    calcRank(group, s => s.total, (s, r) => { s.classRank = r; s.ranks.total.class = r; });
                    SUBJECTS.forEach(sub => {
                        const validList = group.filter(s => s.scores[sub] !== undefined);
                        calcRank(validList, s => s.scores[sub], (s, r) => { if(!s.ranks[sub]) s.ranks[sub]={}; s.ranks[sub].class = r; });
                    });
                });
                // ==========================================

                window.PREV_DATA = parsedHistory; 
                
                // 更新 UI
                const statusEl = document.getElementById('dm-history-status');
                statusEl.innerHTML = `✅ 已加载 ${parsedHistory.length} 条 | ${calcModeMsg}`;
                statusEl.style.color = "#16a34a";
                
                DataManager.renderHistoryPreview();
                if (typeof performSilentMatching === 'function') performSilentMatching();
                if(typeof saveCloudData === 'function') saveCloudData();

                alert(`历史数据导入成功！\n共 ${parsedHistory.length} 人。\n✅ 已自动计算历史总分及单科的三级排名(班/校/镇)。`);
                input.value = ''; 

            } catch (err) {
                console.error(err);
                alert("解析失败: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    },
    

    renderHistoryPreview: function() {
        const tbody = document.querySelector('#dm-history-preview-table tbody');
        if (!window.PREV_DATA || window.PREV_DATA.length === 0) return;

        // 判断是否单校
        const schools = new Set(window.PREV_DATA.map(s => s.school));
        const isSingleSchool = schools.size === 1;

        let html = '';
        // 只展示前 50 条预览
        window.PREV_DATA.slice(0, 50).forEach(s => {
            const townRankDisplay = isSingleSchool ? '<span style="color:#ccc">-</span>' : s.townRank;
            html += `
                <tr>
                    <td>${s.school}</td>
                    <td>${s.class}</td>
                    <td>${s.name.includes('无名氏') ? '<span style="color:#999;font-style:italic;">'+s.name+'</span>' : '<strong>'+s.name+'</strong>'}</td>
                    <td style="font-weight:bold; color:#1e3a8a;">${s.total}</td>
                    <td>${s.schoolRank}</td>
                    <td>${townRankDisplay}</td>
                </tr>
            `;
        });
        
        if (window.PREV_DATA.length > 50) {
            html += `<tr><td colspan="6" style="text-align:center; color:#666;">... 共 ${window.PREV_DATA.length} 条记录 ...</td></tr>`;
        }
        
        tbody.innerHTML = html;
        
        // 动态隐藏/显示表头
        const townTh = document.querySelector('#dm-history-preview-table th:last-child');
        if (townTh) {
            if (isSingleSchool) {
                townTh.innerHTML = '<span style="color:#ccc; text-decoration:line-through">全镇排名</span><br><small>(单校已隐藏)</small>';
            } else {
                townTh.innerText = '全镇排名';
            }
        }
    },

    // 3. 渲染调度器
    renderCurrentTab: function() {
        const input = document.getElementById('dm-search-input');
        const keyword = input ? input.value.trim().toLowerCase() : '';
        
        if (this.currentTab === 'student') {
            this.renderStudents(keyword);
        } else if (this.currentTab === 'teacher') {
            this.renderTeachers(); // 教师页独立渲染
        } else if (this.currentTab === 'archive') {
            this.renderArchives();
        } else if (this.currentTab === 'params') {
            this.renderParams();
        } else if (this.currentTab === 'targets') {
            this.renderTargets();
        }        
    },

    // 4. 学生列表渲染 (优化版：使用 DocumentFragment 和字符串拼接优化性能)
    renderStudents: function(keyword) {
        if (!window.RAW_DATA) return;

        // 性能优化：仅在有搜索词时进行过滤
        let list = keyword 
            ? RAW_DATA.filter(s => 
                (s.name && s.name.toLowerCase().includes(keyword)) || 
                (String(s.id) && String(s.id).includes(keyword)) || 
                (s.class && s.class.includes(keyword)) || 
                (s.school && s.school.includes(keyword))
              ).map((item, index) => ({ ...item, _originalIndex: RAW_DATA.indexOf(item) }))
            : RAW_DATA.map((item, index) => ({ ...item, _originalIndex: index }));
        
        this.pagination.total = list.length;
        const totalPages = Math.ceil(this.pagination.total / this.pagination.size) || 1;
        
        if (this.pagination.page > totalPages) this.pagination.page = totalPages;
        if (this.pagination.page < 1) this.pagination.page = 1;
        
        const start = (this.pagination.page - 1) * this.pagination.size;
        const pageData = list.slice(start, start + this.pagination.size);
        
        const tbody = document.querySelector('#dm-student-table tbody');
        if (!tbody) return;

        if (pageData.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">无数据</td></tr>'; 
        } else {
            // 使用数组 join 拼接字符串，比 += 性能更好
            const rows = pageData.map(s => `
                <tr>
                    <td>${s.school}</td>
                    <td>${s.class}</td>
                    <td style="font-weight:bold;">${s.name}</td>
                    <td>${s.id}</td>
                    <td>${s.total}</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="DataManager.editStudent(${s._originalIndex})" style="padding:2px 6px; font-size:11px;">编辑</button> 
                        <button class="btn btn-sm btn-danger" onclick="DataManager.deleteStudent(${s._originalIndex})" style="padding:2px 6px; background:#dc2626; font-size:11px;">删除</button>
                    </td>
                </tr>`);
            tbody.innerHTML = rows.join('');
        }
        this.updatePaginationUI(totalPages);
    },

    // 5. 分页 UI 更新
    updatePaginationUI: function(totalPages) {
        const el = document.getElementById('dm-page-info');
        if(el) el.innerText = `${this.pagination.page} / ${totalPages}`;
    },

    changePage: function(delta) {
        this.pagination.page += delta;
        this.renderCurrentTab();
    },

    // --- 教师管理核心逻辑 ---

    // 🟢 [修复]：动态渲染学期下拉框 (智能届别模式)
    renderTeacherTermSelect: function() {
        const sel = document.getElementById('dm-teacher-term-select');
        if (!sel) return;
        
        let years = [];
        let startYear = null;

        // 1. 优先从内存元数据读取
        if (window.CURRENT_COHORT_META && window.CURRENT_COHORT_META.year) {
            startYear = parseInt(window.CURRENT_COHORT_META.year, 10);
        }

        // 2. 再从本地存储读取
        if (!startYear) {
            try {
                const metaStr = localStorage.getItem('CURRENT_COHORT_META');
                if (metaStr) {
                    const meta = JSON.parse(metaStr);
                    if (meta && meta.year) startYear = parseInt(meta.year, 10);
                }
            } catch (e) {}
        }

        // 3. 再从届别ID推断
        if (!startYear) {
            const id = window.CURRENT_COHORT_ID || localStorage.getItem('CURRENT_COHORT_ID');
            const match = id ? String(id).match(/(\d{4})/) : null;
            if (match) startYear = parseInt(match[1], 10);
        }

        // 4. 最后从界面标签文本兜底
        if (!startYear) {
            const label = document.getElementById('cohort-current-label')?.innerText || '';
            const match = label.match(/(\d{4})/);
            if (match) startYear = parseInt(match[1], 10);
        }

        // 2. 生成学年列表
        if (startYear) {
            // 届别模式：生成 6年级(入学) 到 9年级(毕业) 的4个学年
            // Year 0 (6级): startYear
            // Year 3 (9级): startYear + 3
            for (let i = 0; i < 4; i++) {
                years.push(startYear + i);
            }
        } else {
            // 兜底模式：当前年份 前后推导
            const currentYear = new Date().getFullYear();
            years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
        }

        let options = '';
        years.forEach(year => {
            const yearStr = `${year}-${year+1}`; // e.g., 2022-2023
            
            // 计算年级标签
            let gradeLabel = '';
            if (startYear) {
                const gradeNum = 6 + (year - startYear);
                gradeLabel = ` [${gradeNum}年级]`;
            }

            ['上学期','下学期'].forEach(term => {
                const termId = `${yearStr}_${term}`; 
                options += `<option value="${termId}">${yearStr} ${term}${gradeLabel}</option>`;
            });
        });

        sel.innerHTML = options;
        
        // 3. 智能选中逻辑
        const uiMeta = getExamMetaFromUI();
        const savedTerm = localStorage.getItem('CURRENT_TERM_ID');

        // 数据清洗：检查当前 value 是否在 options 里
        const setAndValidate = (val) => {
            sel.value = val;
            return sel.value === val; // 验证是否选中成功
        };

        let isSet = false;
        if (uiMeta.year && uiMeta.term) {
            // 优先选中顶部工具栏的设置
            isSet = setAndValidate(`${uiMeta.year}_${uiMeta.term}`);
        } 
        
        if (!isSet && savedTerm) {
            // 其次选中上次保存的
            isSet = setAndValidate(savedTerm);
        }

        // 如果都没选中（比如切换了届别，年份变了），默认选中最后一项（最高年级）
        if (!sel.value && sel.options.length > 0) {
            sel.value = sel.options[sel.options.length - 1].value;
        }
    },

    // 🟢 [修复]：修正 updateTeacherSchoolSelect 缺失问题
    updateTeacherSchoolSelect: function() {
        const sel = document.getElementById('dm-teacher-school-select');
        if (!sel) return;
        
        const currentVal = sel.value;
        // 如果有上传数据，则从 TEACHER_MAP 中扫描学校
        // 否则显示 global SCHOOLS
        let schools = new Set();
        
        if (typeof SCHOOLS !== 'undefined') {
            Object.keys(SCHOOLS).forEach(s => schools.add(s));
        }

        sel.innerHTML = '<option value="">-- 显示全部 --</option>';
        [...schools].sort().forEach(s => {
            sel.innerHTML += `<option value="${s}">${s}</option>`;
        });
        
        if (currentVal && schools.has(currentVal)) sel.value = currentVal;
    },
    
    updateTeacherSchoolFilter: function() {
        const sel = document.getElementById('dm-teacher-school-select');
        const selectedSchool = sel ? sel.value : '';
        if (selectedSchool) {
            window.MY_SCHOOL = selectedSchool;
            const mainSelect = document.getElementById('mySchoolSelect');
            if (mainSelect) {
                mainSelect.value = selectedSchool;
                mainSelect.dispatchEvent(new Event('change'));
            }
        }
        // 切换学校筛选时重新渲染表格
        this.renderTeachers();
    },
    
    addTeacher: function() {
        const school = prompt('请输入学校名称：');
        if (!school) return;
        
        const className = prompt('请输入班级（如：701）：');
        if (!className) return;
        
        const subject = prompt('请输入学科（如：语文）：');
        if (!subject) return;
        
        const teacher = prompt('请输入教师姓名：');
        if (!teacher) return;
        
        const key = `${normalizeClass(className)}_${subject}`;
        TEACHER_MAP[key] = teacher;
        
        this.syncTeacherHistory();
        this.renderTeachers();
        
        if (window.UI) UI.toast('✅ 已添加任课记录', 'success');
    },

    switchTeacherTerm: function(termId) {
        if (!termId) return;
        localStorage.setItem('CURRENT_TERM_ID', termId);
        
        // 🟢 [增强] 切换学期时，先尝试从本地历史读取
        const db = CohortDB.ensure();
        const history = db.teachingHistory || {};
        const hasLocal = history[termId] && Object.keys(history[termId]).length > 0;
        
        if (hasLocal) {
            // 有本地数据，直接使用
            TEACHER_MAP = JSON.parse(JSON.stringify(history[termId]));
            this.renderTeachers();
            console.log(`✅ 已从本地历史加载学期 ${termId} 的任课表`);
            if (typeof this.refreshTeacherAnalysis === 'function') this.refreshTeacherAnalysis();
        } else {
            // 🟢 [增强] 本地无数据，自动尝试从云端拉取
            console.log(`⚠️ 本地无学期 ${termId} 的任课数据，尝试从云端同步...`);
            TEACHER_MAP = {};
            this.renderTeachers(); // 先渲染空表
            
            // 异步从云端加载
            if (window.CloudManager && CloudManager.loadTeachers) {
                CloudManager.loadTeachers().catch(err => {
                    console.warn('云端加载失败:', err);
                });
            }
        }
    },

    renderTeacherTermSelect: function() {
        const sel = document.getElementById('dm-teacher-term-select');
        if (!sel) return;

        const getEntryYear = () => {
            let y = null;

            if (window.CURRENT_COHORT_META && window.CURRENT_COHORT_META.year) {
                y = parseInt(window.CURRENT_COHORT_META.year, 10);
            }

            if (!y) {
                try {
                    const metaStr = localStorage.getItem('CURRENT_COHORT_META');
                    if (metaStr) {
                        const meta = JSON.parse(metaStr);
                        if (meta && meta.year) y = parseInt(meta.year, 10);
                    }
                } catch (e) {}
            }

            if (!y) {
                const id = window.CURRENT_COHORT_ID || localStorage.getItem('CURRENT_COHORT_ID');
                const match = id ? String(id).match(/(\d{4})/) : null;
                if (match) y = parseInt(match[1], 10);
            }

            if (!y) {
                const label = document.getElementById('cohort-current-label')?.innerText || '';
                const match = label.match(/(\d{4})/);
                if (match) y = parseInt(match[1], 10);
            }

            if (!y) {
                try {
                    const list = JSON.parse(localStorage.getItem(COHORT_STORAGE_KEY) || '[]');
                    const currentId = window.CURRENT_COHORT_ID || localStorage.getItem('CURRENT_COHORT_ID');
                    const found = list.find(c => String(c.id) === String(currentId));
                    if (found && found.year) y = parseInt(found.year, 10);
                    if (!y && list.length) y = parseInt(list[0].year, 10);
                } catch (e) {}
            }

            return y;
        };

        let years = [];
        const startYear = getEntryYear();

        if (startYear) {
            for (let i = 0; i < 4; i++) years.push(startYear + i);
        } else {
            const currentYear = new Date().getFullYear();
            years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
        }

        let options = '';
        years.forEach(year => {
            const yearStr = `${year}-${year + 1}`;
            let gradeLabel = '';
            if (startYear) {
                const gradeNum = 6 + (year - startYear);
                gradeLabel = ` [${gradeNum}年级]`;
            }
            ['上学期', '下学期'].forEach(term => {
                const termId = `${yearStr}_${term}`;
                options += `<option value="${termId}">${yearStr} ${term}${gradeLabel}</option>`;
            });
        });

        sel.innerHTML = options || '<option value="">暂无学期</option>';

        const uiMeta = getExamMetaFromUI();
        const saved = localStorage.getItem('CURRENT_TERM_ID');
        const prefer = uiMeta.year && uiMeta.term ? `${uiMeta.year}_${uiMeta.term}` : saved;
        if (prefer) sel.value = prefer;
        if (!sel.value && sel.options.length) sel.value = sel.options[0].value;
    },

    switchTeacherTerm: function(termId) {
        if (!termId) return;
        localStorage.setItem('CURRENT_TERM_ID', termId);
        
        // 🟢 [修复]：切换学期时，先尝试从本地历史读取
        const db = CohortDB.ensure();
        const history = db.teachingHistory || {};
        const hasLocal = history[termId] && Object.keys(history[termId]).length > 0;
        
        if (hasLocal) {
            // 有本地数据，直接使用
            setTeacherMap(JSON.parse(JSON.stringify(history[termId])));
            this.renderTeachers();
            console.log(`✅ 已从本地历史加载学期 ${termId} 的任课表`);
        } else {
            // 🟢 [修复]：本地无数据，自动尝试从云端拉取
            console.log(`⚠️ 本地无学期 ${termId} 的任课数据，尝试从云端同步...`);
            setTeacherMap({});
            this.renderTeachers(); // 先渲染空表
            
            // 异步从云端加载
            if (window.CloudManager && CloudManager.loadTeachers) {
                CloudManager.loadTeachers().catch(err => {
                    console.warn('云端加载失败:', err);
                });
            }
        }
    },

    syncTeacherHistory: function() {
        const termId = localStorage.getItem('CURRENT_TERM_ID') || getTermId(getExamMetaFromUI());
        if (!termId) return;
        const db = CohortDB.ensure();
        db.teachingHistory = db.teachingHistory || {};
        db.teachingHistory[termId] = JSON.parse(JSON.stringify(TEACHER_MAP));
        if (typeof this.refreshTeacherAnalysis === 'function') this.refreshTeacherAnalysis();
    },

    ensureTeacherMap: function(triggerCloud) {
        const termId = localStorage.getItem('CURRENT_TERM_ID') || getTermId(getExamMetaFromUI());
        if (!termId) return false;
        if (window.TEACHER_MAP && Object.keys(window.TEACHER_MAP).length > 0) return true;

        const db = CohortDB.ensure();
        const history = db.teachingHistory || {};
        if (history[termId] && Object.keys(history[termId]).length > 0) {
            setTeacherMap(JSON.parse(JSON.stringify(history[termId])));
            return true;
        }

        if (triggerCloud && window.CloudManager && CloudManager.loadTeachers) {
            CloudManager.loadTeachers();
        }
        return false;
    },

    refreshTeacherAnalysis: function() {
        const section = document.getElementById('teacher-analysis');
        if (section && section.classList.contains('active')) {
            if (typeof analyzeTeachers === 'function') analyzeTeachers();
        }
    },

    handleTeacherUpload: function(input) {
        const file = input.files[0];
        if (!file) {
            console.warn('未选择文件');
            return;
        }
        
        // 检查 XLSX 库
        if (typeof XLSX === 'undefined') {
            alert('❌ Excel解析库未加载，请刷新页面后重试');
            return;
        }
        
        // 检查学期
        const termId = localStorage.getItem('CURRENT_TERM_ID') || getTermId(getExamMetaFromUI());
        if (!termId) {
            alert('⚠️ 请先选择学期！\n\n点击【学期】下拉框选择一个学期后再导入Excel。');
            return;
        }
        localStorage.setItem('CURRENT_TERM_ID', termId);

        console.log(`开始导入教师Excel: ${file.name}, 学期: ${termId}`);
        
        if (window.UI) UI.loading(true, '✨ 正在解析Excel...');

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                // 解析Excel
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                const sheetName = wb.SheetNames[0];
                const json = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
                
                if (!json || json.length === 0) {
                    if (window.UI) UI.loading(false);
                    alert("❌ 表格为空或格式不正确\n\n请确保 Excel 包含：班级、学科、教师姓名列");
                    return;
                }

                console.log(`解析到 ${json.length} 行数据`);

                // 导入数据
                let count = 0;
                const errors = [];
                
                json.forEach((row, idx) => {
                    const className = normalizeClass(row['班级'] || row['class'] || row['Class'] || row['班级名称']);
                    const subject = normalizeSubject(row['学科'] || row['subject'] || row['科目'] || row['Subject']);
                    const teacher = row['教师'] || row['teacher'] || row['教师姓名'] || row['姓名'] || row['Teacher'];

                    if (className && subject && teacher) {
                        const key = `${className}_${subject}`;
                        TEACHER_MAP[key] = String(teacher).trim();
                        count++;
                    } else {
                        if (idx < 5) { // 只记录前5个错误
                            errors.push(`第${idx+2}行: 班级=${className||'空'}, 学科=${subject||'空'}, 教师=${teacher||'空'}`);
                        }
                    }
                });

                console.log(`导入成功: ${count} 条记录`);

                if (count === 0) {
                    if (window.UI) UI.loading(false);
                    alert(`❌ 未能导入任何数据\n\n请检查Excel格式：\n- 必须包含列：【班级】【学科】【教师】\n- 或英文列：class, subject, teacher\n\n${errors.length > 0 ? '错误示例：\n' + errors.join('\n') : ''}`);
                    return;
                }

                // 同步到本地历史
                DataManager.syncTeacherHistory();
                updateStatusPanel();
                
                // 渲染界面
                DataManager.renderTeachers();
                logAction('导入', `任课表导入 ${count} 条（${termId}）`);
                
                // 自动同步到云端
                if (window.CloudManager && CloudManager.saveTeachers) {
                    try {
                        console.log('[TeacherSync] 尝试上传任课表到云端...');
                        const ok = await CloudManager.saveTeachers();
                        if (window.UI) UI.loading(false);
                        if (ok) {
                            if (window.UI) {
                                UI.toast(`✅ 成功导入 ${count} 条任课信息并同步到云端！`, "success");
                            } else {
                                alert(`✅ 成功导入 ${count} 条任课信息并同步到云端！`);
                            }
                        } else {
                            alert(`✅ 成功导入 ${count} 条任课信息！\n\n⚠️ 但云端同步失败，请检查 Supabase 权限或 RLS 设置。`);
                        }
                    } catch (cloudErr) {
                        if (window.UI) UI.loading(false);
                        console.error('云端同步失败:', cloudErr);
                        alert(`✅ 成功导入 ${count} 条任课信息！\n\n⚠️ 但云端同步失败：${cloudErr.message}\n\n请手动点击右上角【保存修改并同步云端】按钮。`);
                    }
                } else {
                    if (window.UI) UI.loading(false);
                    alert(`✅ 成功导入 ${count} 条任课信息！`);
                }
                
                // 清空输入
                input.value = ''; 

            } catch (err) {
                if (window.UI) UI.loading(false);
                console.error('Excel导入错误:', err);
                alert("❌ 解析失败：" + err.message + "\n\n请确保：\n1. Excel文件格式正确 (.xlsx 或 .xls)\n2. 包含'班级'、'学科'、'教师'列\n3. 数据格式符合要求");
            }
        };
        
        reader.onerror = function() {
            if (window.UI) UI.loading(false);
            alert('❌ 文件读取失败，请重试');
        };
        
        reader.readAsArrayBuffer(file);
    },

    renderTeachers: function() {
        const tbody = document.querySelector('#dm-teacher-table tbody');
        if(!tbody) return;
        tbody.innerHTML = '';

        const sel = document.getElementById('dm-teacher-school-select');
        const selectedSchool = sel ? sel.value : "";

        // 若学期下拉仍未渲染，进行兜底刷新
        const termSel = document.getElementById('dm-teacher-term-select');
        if (termSel && termSel.options && termSel.options.length <= 1) {
            const txt = termSel.options[0]?.textContent || '';
            if (txt.includes('暂无学期')) {
                this.renderTeacherTermSelect();
            }
        }
        
        let list = Object.entries(TEACHER_MAP).map(([key, name]) => {
            const parts = key.split('_');
            const clsName = parts[0];
            const subject = parts.length > 1 ? parts[1] : '(未知)';
            
            let schoolName = "未知/未上传";
            if (typeof SCHOOLS !== 'undefined') {
                for (const [schName, schData] of Object.entries(SCHOOLS)) {
                    if (schData.students && schData.students.some(s => s.class == clsName)) {
                        schoolName = schName;
                        break;
                    }
                }
            }
            return { key, class: clsName, subject, name, school: schoolName };
        });

        // 逻辑：统计列表中出现频率最高的学校，自动将其设为 MY_SCHOOL
        if (list.length > 0) {
            const schoolCounts = {};
            list.forEach(t => {
                if (t.school && !t.school.includes("未知")) {
                    schoolCounts[t.school] = (schoolCounts[t.school] || 0) + 1;
                }
            });

            // 找出数量最多的学校
            let maxCount = 0;
            let autoDetectedSchool = "";
            for (const [sch, count] of Object.entries(schoolCounts)) {
                if (count > maxCount) {
                    maxCount = count;
                    autoDetectedSchool = sch;
                }
            }

            // 如果找到了有效学校，且当前未设置或不一致，则强制自动同步
            if (autoDetectedSchool && window.MY_SCHOOL !== autoDetectedSchool) {
                window.MY_SCHOOL = autoDetectedSchool;
                localStorage.setItem('MY_SCHOOL', autoDetectedSchool);
                console.log(`🤖 系统已自动将本校锁定为：${autoDetectedSchool}`);
                
                // 同步更新主界面的下拉框 UI
                const mainSelect = document.getElementById('mySchoolSelect');
                if (mainSelect) {
                    mainSelect.value = autoDetectedSchool;
                    // 稍微延时触发变更事件，确保数据加载完成
                    setTimeout(() => {
                        // 仅更新内存，不频繁触发 renderTables 以免卡顿，但在关闭模态框时会生效
                    }, 100);
                }
                updateStatusPanel();
                
                // 提示用户
                if(window.UI && list.length > 5) { // 只有数据量足够时才提示
                    // UI.toast(`已自动识别本校为：${autoDetectedSchool}`, "success");
                }
            }
        }

        if (selectedSchool) {
            list = list.filter(t => t.school === selectedSchool);
        }

        list.sort((a,b) => {
            if (a.school !== b.school) return a.school.localeCompare(b.school);
            if (a.class !== b.class) return a.class.localeCompare(b.class, undefined, {numeric:true});
            return a.subject.localeCompare(b.subject);
        });

        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#999;">暂无任课数据 (或未匹配到该校班级)</td></tr>';
        } else {
            const displayList = list.slice(0, 500); 
            
            displayList.forEach(t => {
                const schoolStyle = t.school.includes("未知") ? "color:#94a3b8; font-style:italic;" : "color:#475569;";
                tbody.innerHTML += `
                    <tr>
                        <td style="${schoolStyle}">${t.school}</td>
                        <td style="font-weight:bold;">${t.class}</td>
                        <td><span class="badge" style="background:#f1f5f9; color:#475569;">${t.subject}</span></td>
                        <td style="font-weight:bold; color:#1e293b;">${t.name}</td>
                        <td>
                            <button class="btn btn-sm btn-primary" onclick="DataManager.editTeacher('${t.key}', '${t.name}')" style="padding:2px 6px; font-size:11px;">修改</button> 
                            <button class="btn btn-sm btn-danger" onclick="DataManager.deleteTeacher('${t.key}')" style="padding:2px 6px; background:#dc2626; font-size:11px;">删除</button>
                        </td>
                    </tr>`;
            });
            
            if (list.length > 500) {
                tbody.innerHTML += `<tr><td colspan="5" style="text-align:center; color:#999; padding:5px;">... 数据过多，仅显示前 500 条 ...</td></tr>`;
            }
        }
    },

    // --- 数据操作辅助函数 ---

    deleteStudent: function(index) { 
        const s = RAW_DATA[index]; 
        if(!s) return; 
        if(!confirm(`⚠️ 确定要永久删除学生【${s.school} ${s.class}班 ${s.name}】吗？`)) return; 
        RAW_DATA.splice(index, 1); 
        this.renderCurrentTab(); 
        UI.toast("已暂存删除 (请点击保存)", "info"); 
    },

    editStudent: function(index) { 
        const s = RAW_DATA[index]; 
        Swal.fire({ 
            title: '编辑学生信息', 
            html: `<div style="text-align:left; font-size:14px; line-height:2.5;">
                <label style="width:50px; display:inline-block;">姓名:</label> <input id="swal-name" class="swal2-input" value="${s.name}" style="width:200px; height:30px; margin:0;"><br>
                <label style="width:50px; display:inline-block;">班级:</label> <input id="swal-class" class="swal2-input" value="${s.class}" style="width:200px; height:30px; margin:0;"><br>
                <label style="width:50px; display:inline-block;">考号:</label> <input id="swal-id" class="swal2-input" value="${s.id}" style="width:200px; height:30px; margin:0;"><br>
                <label style="width:50px; display:inline-block;">学校:</label> <input id="swal-school" class="swal2-input" value="${s.school}" style="width:200px; height:30px; margin:0;"><br>
                <label style="width:50px; display:inline-block;">状态:</label>
                <select id="swal-status" class="swal2-input" style="width:200px; height:30px; margin:0;">
                    <option value="active">正常</option>
                    <option value="transfer_in">转入</option>
                    <option value="transfer_out">转出</option>
                    <option value="leave">休学/借读</option>
                </select>
            </div>`, 
            showCancelButton: true, 
            confirmButtonText: '暂存修改', 
            didOpen: () => {
                const st = document.getElementById('swal-status');
                const saved = (s.status || (COHORT_DB?.students?.[s.uuid]?.status)) || 'active';
                if (st) st.value = saved;
            },
            preConfirm: () => ({ 
                name: document.getElementById('swal-name').value.trim(), 
                class: document.getElementById('swal-class').value.trim(), 
                id: document.getElementById('swal-id').value.trim(), 
                school: document.getElementById('swal-school').value.trim(),
                status: document.getElementById('swal-status').value
            }) 
        }).then((result) => { 
            if (result.isConfirmed) { 
                const n = result.value; 
                if(!n.name || !n.class) return; 
                Object.assign(s, n); 
                if (s.uuid && COHORT_DB && COHORT_DB.students && COHORT_DB.students[s.uuid]) {
                    COHORT_DB.students[s.uuid].status = n.status || 'active';
                }
                this.renderCurrentTab(); 
                UI.toast("已修改 (请点击保存)", "success"); 
            } 
        }); 
    },

    editTeacher: function(key, oldName) { 
        const newName = prompt(`修改 [${key.replace('_',' ')}] 的任课教师：`, oldName); 
        if (newName && newName.trim()) { 
            TEACHER_MAP[key] = newName.trim(); 
            this.syncTeacherHistory();
            this.renderTeachers(); 
            UI.toast("已修改 (需点击保存)", "info"); 
        } 
    },

    deleteTeacher: function(key) { 
        if(!confirm(`确定移除【${key.replace('_',' ')}】的任课信息吗？`)) return; 
        delete TEACHER_MAP[key]; 
        this.syncTeacherHistory();
        this.renderTeachers(); 
        UI.toast("已移除 (需点击保存)", "info"); 
    },

    addTeacher: function() { 
        Swal.fire({ 
            title: '新增任课', 
            html: `<div style="text-align:left; font-size:14px; line-height:2.5;">
                <label style="width:60px;">班级:</label> <input id="add-cls" class="swal2-input" placeholder="如: 701" style="width:180px; height:30px;"><br>
                <label style="width:60px;">学科:</label> <input id="add-sub" class="swal2-input" placeholder="如: 语文" style="width:180px; height:30px;"><br>
                <label style="width:60px;">教师:</label> <input id="add-name" class="swal2-input" placeholder="姓名" style="width:180px; height:30px;">
            </div>`, 
            confirmButtonText: '添加', showCancelButton: true, 
            preConfirm: () => ({ 
                cls: document.getElementById('add-cls').value.trim(), 
                sub: document.getElementById('add-sub').value.trim(), 
                name: document.getElementById('add-name').value.trim() 
            }) 
        }).then((result) => { 
            if (result.isConfirmed) { 
                const d = result.value; 
                if(!d.cls || !d.sub || !d.name) return alert("请填写完整"); 
                TEACHER_MAP[`${d.cls}_${d.sub}`] = d.name; 
                this.syncTeacherHistory();
                this.renderTeachers(); 
                UI.toast("添加成功 (需点击保存)", "success"); 
            } 
        }); 
    },

    // --- 档案管理 ---

    renderArchives: function() {
        const examStats = {}; 
        if (typeof HISTORY_ARCHIVE !== 'undefined') {
            Object.keys(HISTORY_ARCHIVE).forEach(uid => {
                const records = HISTORY_ARCHIVE[uid];
                records.forEach(r => { if (!examStats[r.exam]) examStats[r.exam] = 0; examStats[r.exam]++; });
            });
        }
        const tbody = document.getElementById('dm-history-tbody');
        if(!tbody) return;

        if (Object.keys(examStats).length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#999;">暂无历史轨迹数据</td></tr>'; 
        } else {
            let html = '';
            Object.keys(examStats).forEach(examName => {
                html += `<tr><td style="font-weight:bold;">${examName}</td><td>${examStats[examName]} 条记录</td><td><button class="btn btn-sm btn-primary" onclick="DataManager.renameHistoryExam('${examName}')" style="padding:2px 6px;">重命名</button> <button class="btn btn-sm btn-danger" onclick="DataManager.deleteHistoryExam('${examName}')" style="padding:2px 6px; background:#dc2626;">删除</button></td></tr>`;
            });
            tbody.innerHTML = html;
        }
        if (this.currentTab === 'archive') { this.loadCloudSnapshots(); }
    },

    deleteHistoryExam: function(examName) { 
        if (!confirm(`⚠️ 确定要删除【${examName}】吗？`)) return; 
        Object.keys(HISTORY_ARCHIVE).forEach(key => { 
            HISTORY_ARCHIVE[key] = HISTORY_ARCHIVE[key].filter(r => r.exam !== examName); 
            if (HISTORY_ARCHIVE[key].length === 0) delete HISTORY_ARCHIVE[key]; 
        }); 
        this.renderArchives(); 
        UI.toast("已删除", "success"); 
    },

    renameHistoryExam: function(oldName) { 
        const newName = prompt("重命名为：", oldName); 
        if (!newName) return; 
        Object.values(HISTORY_ARCHIVE).forEach(records => { 
            records.forEach(r => { if (r.exam === oldName) r.exam = newName; }); 
        }); 
        this.renderArchives(); 
    },

    loadCloudSnapshots: async function() { 
        if (!sbClient) return; 
        const tbody = document.getElementById('dm-cloud-tbody'); 
        if(!tbody) return;
        tbody.innerHTML = '<tr><td colspan="3">⏳ 加载中...</td></tr>'; 
        const { data } = await sbClient.from('system_data').select('key, created_at').order('created_at', { ascending: false }); 
        if (!data || !data.length) { 
            tbody.innerHTML = '<tr><td colspan="3">无备份</td></tr>'; return; 
        } 
        tbody.innerHTML = data.map(i => `<tr><td>${i.key}</td><td>${new Date(i.created_at).toLocaleString()}</td><td><button class="btn btn-sm btn-danger" onclick="DataManager.deleteCloudSnapshot('${i.key}')">删除</button></td></tr>`).join(''); 
    },

    deleteCloudSnapshot: async function(key) { 
        if(!confirm("确定删除？")) return; 
        await sbClient.from('system_data').delete().eq('key', key); 
        this.loadCloudSnapshots(); 
    },

    // 👇👇👇 🟢 [同步修复]：参数管理渲染逻辑优化 🟢 👇👇👇
    renderParams: function() {
        if (!isIndicatorPromptAllowed()) {
            const area = document.getElementById('dm-params-area');
            if (area) area.style.display = 'none';
            return;
        }
        // 1. 确保全局变量结构存在
        if (!window.SYS_VARS) window.SYS_VARS = { indicator: { ind1: '', ind2: '' }, targets: {} };
        if (!window.SYS_VARS.indicator) window.SYS_VARS.indicator = { ind1: '', ind2: '' };

        // 2. 优先从全局变量读取
        let i1 = window.SYS_VARS.indicator.ind1;
        let i2 = window.SYS_VARS.indicator.ind2;

        // 3. 兜底：如果全局变量为空，尝试从主界面 DOM 获取（防止主界面有值但这里没显示）
        const mainInput1 = document.getElementById('ind1');
        const mainInput2 = document.getElementById('ind2');
        
        if (!i1 && mainInput1) i1 = mainInput1.value;
        if (!i2 && mainInput2) i2 = mainInput2.value;
        
        // 4. 将值填入弹窗的输入框
        const el1 = document.getElementById('dm_ind1_input');
        const el2 = document.getElementById('dm_ind2_input');
        
        if(el1) {
            el1.value = i1 || '';
            // 绑定实时更新
            el1.oninput = function() { 
                if(!window.SYS_VARS.indicator) window.SYS_VARS.indicator = {};
                window.SYS_VARS.indicator.ind1 = this.value; 
            };
        }
        if(el2) {
            el2.value = i2 || '';
            el2.oninput = function() { 
                if(!window.SYS_VARS.indicator) window.SYS_VARS.indicator = {};
                window.SYS_VARS.indicator.ind2 = this.value; 
            };
        }
    },

    saveParamsLocally: function() {
        if (!isIndicatorAllowed()) return;
        // 1. 防御性初始化
        if (!window.SYS_VARS) window.SYS_VARS = { indicator: {}, targets: {} };
        
        // 2. 获取管理面板弹窗内的值
        const v1 = document.getElementById('dm_ind1_input').value;
        const v2 = document.getElementById('dm_ind2_input').value;
        
        // 3. 更新内存全局变量
        window.SYS_VARS.indicator = { ind1: v1, ind2: v2 };
        
        // 4. 同步更新主界面的输入框 (确保 processData 运行时能读到)
        const main1 = document.getElementById('ind1');
        const main2 = document.getElementById('ind2');
        if(main1) main1.value = v1;
        if(main2) main2.value = v2;

        // 5. 🔥 核心新增：立即触发云端同步 🔥
        if(typeof saveCloudData === 'function') {
            // 使用 toast 提示正在保存，体验更好
            UI.toast('💾 正在同步参数至云端...', 'info');
            saveCloudData().then(() => {
                UI.toast('✅ 参数已保存并同步云端', 'success');
                
                // 可选：参数变动后，通常需要重算指标生数据
                // if(confirm("参数已更新，是否立即重新计算指标生数据？")) {
                //     calcIndicators();
                // }
            });
        } else {
            UI.toast('✅ 参数已暂存到内存 (未连接云端)', 'success');
        }
    },

    // --- 目标人数管理 (增强版) ---
    renderTargets: function() {
        const tbody = document.getElementById('dm-targets-tbody');
        if(!tbody) return;
        
        // 确保全局变量存在
        if(typeof window.TARGETS === 'undefined') window.TARGETS = {};
        
        const list = Object.keys(window.TARGETS).sort();
        
        if(list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:30px; color:#999;">暂无数据，请先点击上方按钮导入 Excel</td></tr>';
            return;
        }

        let html = '';
        list.forEach(sch => {
            const t = window.TARGETS[sch];
            html += `<tr><td style="font-weight:bold;">${sch}</td><td>${t.t1}</td><td>${t.t2}</td><td><button class="btn btn-sm btn-primary" onclick="DataManager.editTarget('${sch}')" style="padding:2px 6px;">修改</button> <button class="btn btn-sm btn-danger" onclick="DataManager.deleteTarget('${sch}')" style="padding:2px 6px;">删除</button></td></tr>`;
        });
        tbody.innerHTML = html;
    },

    handleTargetUpload: function(input) {
        if (isArchiveLocked()) return alert("⛔ 当前考试已封存，禁止导入目标人数");
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                if (json.length === 0) return alert("空表格");

                let successCount = 0;
                let errorCount = 0;
                let dupCount = 0;
                const seen = new Set();
                const errors = [];

                json.forEach((row, idx) => {
                    const rowNo = idx + 2;
                    const name = row['学校名称'] || row['学校'];
                    const t1Key = Object.keys(row).find(k => k.includes('指标一') || k.includes('目标一'));
                    const t2Key = Object.keys(row).find(k => k.includes('指标二') || k.includes('目标二'));

                    if (!name) {
                        errorCount++;
                        errors.push(`第 ${rowNo} 行：学校名称为空`);
                        return;
                    }
                    if (seen.has(name)) {
                        dupCount++;
                    }
                    seen.add(name);

                    const t1 = parseInt(row[t1Key] || row['指标一目标人数'] || 0);
                    const t2 = parseInt(row[t2Key] || row['指标二目标人数'] || 0);

                    if (isNaN(t1) || isNaN(t2)) {
                        errorCount++;
                        errors.push(`第 ${rowNo} 行：目标人数非数字 (${name})`);
                        return;
                    }

                    window.TARGETS[name] = { t1, t2 };
                    successCount++;
                });

                DataManager.renderTargets();

                if(typeof saveCloudData === 'function') {
                    saveCloudData();
                    if (window.UI) UI.toast("✅ 目标数据已自动同步云端", "success");
                }

                const msg = `✅ 导入完成：成功 ${successCount} 条，重复 ${dupCount} 条，错误 ${errorCount} 条。`;
                if (errors.length > 0 && typeof Swal !== 'undefined') {
                    Swal.fire('导入结果', `<div style="text-align:left; font-size:12px;">${msg}<br><br>${errors.slice(0, 8).join('<br>')}${errors.length > 8 ? '<br>...': ''}</div>`, errorCount > 0 ? 'warning' : 'success');
                } else {
                    alert(msg);
                }
                input.value = '';
            } catch (err) { alert("失败：" + err.message); }
        };
        reader.readAsArrayBuffer(file);
    },

    editTarget: function(schoolName) {
        const t = window.TARGETS[schoolName] || { t1: 0, t2: 0 };
        Swal.fire({
            title: `编辑目标 - ${schoolName}`,
            html: `<div style="text-align:left;line-height:2.5;"><label>指标一:</label><input id="swal-t1" type="number" class="swal2-input" value="${t.t1}" style="width:100px;height:30px;"><br><label>指标二:</label><input id="swal-t2" type="number" class="swal2-input" value="${t.t2}" style="width:100px;height:30px;"></div>`,
            showCancelButton: true,
            confirmButtonText: '确定',
            preConfirm: () => ({ t1: parseInt(document.getElementById('swal-t1').value)||0, t2: parseInt(document.getElementById('swal-t2').value)||0 })
        }).then((result) => {
            if (result.isConfirmed) {
                window.TARGETS[schoolName] = result.value;
                this.renderTargets();
            }
        });
    },

    deleteTarget: function(schoolName) {
        if(!confirm("确定删除？")) return;
        delete window.TARGETS[schoolName];
        this.renderTargets();
    },

    // 7. 保存并同步 (核心修复)
    saveAndSync: async function() {
        if (isArchiveLocked()) return alert("⛔ 当前考试已封存，仅支持只读查看");
        if (!confirm("⚠️ 确定要应用所有修改并同步到云端吗？\n\n1. 系统将重算排名\n2. 目标/参数将被保存")) return;
        
        UI.loading(true, "正在保存...");
        
        try {
            // 1. 确保参数已同步到全局
            this.saveParamsLocally();
            this.syncTeacherHistory();
            if (!window.SYS_VARS) window.SYS_VARS = { indicator: {}, targets: {} };
            window.SYS_VARS.targets = window.TARGETS || {};
            
            // 2. 重新计算数据 (会读取 ind1, ind2)
            if (window.RAW_DATA && window.RAW_DATA.length) {
                try {
                    await processData(); 
                    renderTables();
                } catch (e) {
                    console.warn('重算失败，仍将同步云端：', e);
                }
            }
            
            // 3. 上传到云端
            await saveCloudData();
            
            UI.loading(false);
            Swal.fire('成功', '数据已更新并同步至云端！', 'success');
        } catch (e) {
            UI.loading(false);
            alert("保存失败: " + e.message);
        }
    }, // 👈 注意这里有一个逗号，连接下面的新函数

    // 👇👇👇 🟢 [修改点 4.2]：在此处粘贴 SQL 执行核心逻辑 🟢 👇👇👇
    
    // 缓存查询结果
    sqlResultCache: [],
    sqlHistoryKey: 'SQL_HISTORY',
    sqlHistoryLimit: 12,

    // 获取历史
    getSQLHistory: function() {
        try {
            return JSON.parse(localStorage.getItem(this.sqlHistoryKey) || '[]');
        } catch(e) {
            return [];
        }
    },

    // 保存历史
    setSQLHistory: function(list) {
        try {
            localStorage.setItem(this.sqlHistoryKey, JSON.stringify(list));
        } catch(e) {}
    },

    // 添加最近查询
    addRecentSQL: function(sql) {
        if (!sql) return;
        let list = this.getSQLHistory();
        list = list.filter(item => item.sql !== sql);
        list.unshift({ name: '最近查询', sql, ts: Date.now(), pinned: false });
        if (list.length > this.sqlHistoryLimit) list = list.slice(0, this.sqlHistoryLimit);
        this.setSQLHistory(list);
    },

    // 渲染历史下拉
    renderSQLHistory: function() {
        const sel = document.getElementById('dm-sql-history-select');
        if (!sel) return;
        const list = this.getSQLHistory();
        let options = '<option value="">🕘 最近/收藏</option>';
        list.forEach((item, idx) => {
            const label = item.pinned ? `⭐ ${item.name}` : `🕘 ${item.sql.slice(0, 28)}${item.sql.length > 28 ? '...' : ''}`;
            options += `<option value="${idx}">${label}</option>`;
        });
        sel.innerHTML = options;
    },

    // 应用历史
    applySQLHistory: function(idx) {
        if (idx === '') return;
        const list = this.getSQLHistory();
        const item = list[Number(idx)];
        if (item && item.sql) {
            document.getElementById('dm-sql-input').value = item.sql;
        }
    },

    // 保存收藏
    saveNamedSQL: function() {
        const sql = document.getElementById('dm-sql-input').value.trim();
        if (!sql) return alert('请先输入 SQL');
        const nameInput = document.getElementById('dm-sql-history-name');
        const name = (nameInput && nameInput.value.trim()) || `收藏 ${new Date().toLocaleString()}`;
        let list = this.getSQLHistory();
        list = list.filter(item => item.sql !== sql);
        list.unshift({ name, sql, ts: Date.now(), pinned: true });
        if (list.length > this.sqlHistoryLimit) list = list.slice(0, this.sqlHistoryLimit);
        this.setSQLHistory(list);
        if (nameInput) nameInput.value = '';
        this.renderSQLHistory();
        if (window.UI) UI.toast('✅ 已保存收藏', 'success');
    },

    // 清空历史
    clearSQLHistory: function() {
        if (!confirm('确定清空SQL历史吗？')) return;
        localStorage.removeItem(this.sqlHistoryKey);
        this.renderSQLHistory();
    },

    // 预设 SQL 语句
    setQuickSQL: function(type) {
        let sql = "";
        switch(type) {
            case 'base': 
                sql = "SELECT school, class, name, total FROM students ORDER BY total DESC LIMIT 10"; 
                break;
            case 'count': 
                sql = "SELECT school, COUNT(*) as cnt, AVG(total) as avg_score FROM students GROUP BY school ORDER BY avg_score DESC"; 
                break;
            case 'avg': 
                sql = "SELECT class, AVG(语文) as chinese_avg FROM students GROUP BY class ORDER BY chinese_avg DESC"; 
                break;
            case 'failed': 
                sql = "SELECT class, name, 数学 FROM students WHERE 数学 < 90 ORDER BY 数学 ASC"; // 假设满分150
                break;
            case 'teacher':
                // 联合查询示例
                sql = "SELECT s.class, s.name, s.英语, t.teacher FROM students s JOIN teachers t ON s.class = t.class AND t.subject = '英语' WHERE t.teacher LIKE '张%' LIMIT 20";
                break;
        }
        document.getElementById('dm-sql-input').value = sql;
    },

    // 准备数据源
    prepareSQLData: function() {
        // 1. 准备 students 表 (RAW_DATA 已经是数组，可以直接用，但为了方便查询把 scores 展开)
        const studentsTable = window.RAW_DATA.map(s => {
            // 浅拷贝基础信息
            let row = { school: s.school, class: s.class, name: s.name, id: s.id, total: s.total };
            // 展开科目分数 (例如 s.scores.语文 -> row.语文)
            if(s.scores) {
                Object.keys(s.scores).forEach(sub => row[sub] = s.scores[sub]);
            }
            return row;
        });

        // 2. 准备 teachers 表 (将 TEACHER_MAP 转换为数组)
        // TEACHER_MAP 结构是Key-Value，需转为 [{class:'701', subject:'语文', teacher:'张三'}]
        const teachersTable = [];
        if(window.TEACHER_MAP) {
            Object.keys(window.TEACHER_MAP).forEach(key => {
                const [cls, sub] = key.split('_');
                teachersTable.push({ class: cls, subject: sub, teacher: window.TEACHER_MAP[key] });
            });
        }

        return { students: studentsTable, teachers: teachersTable };
    },

    runSQL: function() {
        const sql = document.getElementById('dm-sql-input').value.trim();
        const msgEl = document.getElementById('sql-status-msg');
        const thead = document.querySelector('#dm-sql-table thead');
        const tbody = document.querySelector('#dm-sql-table tbody');
        
        msgEl.innerText = "";
        thead.innerHTML = "";
        tbody.innerHTML = "";

        if(!sql) return;

        try {
            // 1. 准备数据
            const db = this.prepareSQLData();
            
            // 2. 执行查询 (Alasql 支持直接传入数据对象作为表)
            alasql("CREATE TABLE students");
            alasql("SELECT * INTO students FROM ?", [db.students]);
            
            alasql("CREATE TABLE teachers");
            alasql("SELECT * INTO teachers FROM ?", [db.teachers]);

            // 执行用户输入的 SQL
            const res = alasql(sql);
            
            this.sqlResultCache = res; // 存起来供导出

            // 3. 渲染结果
            if (!res || res.length === 0) {
                tbody.innerHTML = '<tr><td style="padding:20px; text-align:center; color:#666;">查询结果为空</td></tr>';
                return;
            }

            // 动态生成表头
            const columns = Object.keys(res[0]);
            let headerHtml = "<tr>";
            columns.forEach(col => headerHtml += `<th style="background:#f1f5f9; padding:8px;">${col}</th>`);
            headerHtml += "</tr>";
            thead.innerHTML = headerHtml;

            // 生成内容 (限制显示前 500 条防止卡顿)
            let bodyHtml = "";
            res.slice(0, 500).forEach(row => {
                bodyHtml += "<tr>";
                columns.forEach(col => {
                    let val = row[col];
                    // 简单的格式化小数
                    if (typeof val === 'number' && val % 1 !== 0) val = val.toFixed(2);
                    bodyHtml += `<td>${val}</td>`;
                });
                bodyHtml += "</tr>";
            });
            
            if (res.length > 500) {
                bodyHtml += `<tr><td colspan="${columns.length}" style="text-align:center; color:#999;">(结果过多，仅显示前 500 条，请导出 Excel 查看全部)</td></tr>`;
            }

            tbody.innerHTML = bodyHtml;

            // 记录最近查询
            this.addRecentSQL(sql);
            this.renderSQLHistory();
            
            // 清理内存表
            alasql("DROP TABLE students");
            alasql("DROP TABLE teachers");

        } catch (e) {
            console.error(e);
            msgEl.innerText = "❌ SQL 错误: " + e.message;
            // 确保清理
            try { alasql("DROP TABLE IF EXISTS students"); alasql("DROP TABLE IF EXISTS teachers"); } catch(ex){}
        }
    },

    exportSQLResult: function() {
        if (!this.sqlResultCache || this.sqlResultCache.length === 0) return alert("当前没有查询结果可导出");
        
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(this.sqlResultCache);
        XLSX.utils.book_append_sheet(wb, ws, "SQL查询结果");
        XLSX.writeFile(wb, "自定义查询结果.xlsx");
    }
};

// 🟣 Talk to Data：自然语言查数
async function talkToData() {
    const inputEl = document.getElementById('dm-nlq-input');
    const statusEl = document.getElementById('dm-nlq-status');
    if (!inputEl || !statusEl) return;
    const question = inputEl.value.trim();
    if (!question) return alert('请输入查询需求');
    statusEl.innerText = 'AI 解析中...';

    try {
        const schema = buildNLQSchema();
        const prompt = buildNLQPrompt(question, schema);
        const aiText = await callUnifiedAI(prompt);
        const sql = extractSQLFromAI(aiText);

        if (!isSafeSQL(sql)) {
            statusEl.innerText = '⚠️ 生成SQL不安全或不完整，请修改后再执行';
            return;
        }

        document.getElementById('dm-sql-input').value = sql;
        DataManager.runSQL();
        statusEl.innerText = '✅ 已生成SQL并执行';
    } catch (e) {
        console.error(e);
        statusEl.innerText = '❌ 解析失败，请重试';
        if (window.UI) UI.toast('AI 解析失败，请重试', 'error');
    }
}

function buildNLQSchema() {
    const db = DataManager.prepareSQLData();
    const studentsCols = db.students && db.students.length ? Object.keys(db.students[0]) : [];
    const teachersCols = db.teachers && db.teachers.length ? Object.keys(db.teachers[0]) : ['class', 'subject', 'teacher'];
    return {
        tables: {
            students: studentsCols,
            teachers: teachersCols
        },
        notes: 'students含成绩字段，teachers为任课表，可JOIN students.class=teachers.class'
    };
}

function buildNLQPrompt(question, schema) {
    return `你是校务数据分析师。请把用户的自然语言查询转换为可执行的 AlaSQL SELECT 语句。
要求：
1) 只允许 SELECT 查询；不要使用 INSERT/UPDATE/DELETE/CREATE/DROP。
2) 表只有 students 和 teachers。
3) 优先输出明确字段，不要 SELECT *。
4) 输出仅包含 SQL，不要解释，不要 Markdown。

【表结构】\n${JSON.stringify(schema)}\n
【用户问题】\n${question}\n`;
}

function extractSQLFromAI(text) {
    if (!text) return '';
    let sql = text.trim();
    const codeMatch = sql.match(/```(?:sql)?\s*([\s\S]*?)```/i);
    if (codeMatch) sql = codeMatch[1].trim();
    const selectIdx = sql.toUpperCase().indexOf('SELECT');
    if (selectIdx > 0) sql = sql.slice(selectIdx);
    sql = sql.replace(/;\s*$/g, '').trim();
    return sql;
}

function isSafeSQL(sql) {
    if (!sql) return false;
    const s = sql.trim();
    if (!/^select\b/i.test(s)) return false;
    if (/(update|delete|insert|drop|alter|truncate|create|replace|merge|grant|revoke)\b/i.test(s)) return false;
    return true;
}
