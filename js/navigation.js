const SUBJECT_ORDER = ['语文', '数学', '英语', '物理', '化学', '政治', '历史', '地理', '生物'];

// [修改] 导航配置与逻辑 (方案二：功能场景导向版)
// 说明：按“管数据 -> 比学校 -> 评班级 -> 抓学生 -> 用工具”的逻辑排列
const NAV_STRUCTURE = {
    'data': { 
        title: '📂 数据管理', 
        color: '#334155', // 深灰 Slate
        items: [
            { id: 'starter-hub', icon: 'ti-rocket', text: '新手入口与诊断' },
            { id: 'upload', icon: 'ti-database-import', text: '数据上传与设置' }
        ] 
    },
    'town': { 
        title: '🏆 校际联考分析', 
        color: '#b45309', // 金色 Amber (代表荣誉与排名)
        items: [
            { id: 'summary', icon: 'ti-report', text: '综合评价总榜' }, // 领导最爱看，放第一
            { id: 'analysis', icon: 'ti-chart-pie', text: '两率一分(横向)' }, 
            { id: 'macro-watch', icon: 'ti-alert-triangle', text: '预警与亮点看板' },
            { id: 'high-score', icon: 'ti-trophy', text: '高分段/尖子生' }, 
            { id: 'indicator', icon: 'ti-target', text: '指标生达标核算' },
            { id: 'bottom3', icon: 'ti-arrow-bar-to-down', text: '低分率/后1/3核算' }
        ] 
    },
    'class': { 
        title: '🏫 班级教学管理', 
        color: '#dc2626', // 红色 Red (代表绩效与考核)
        items: [
            { id: 'teacher-analysis', icon: 'ti-school', text: '教师教学质量画像' }, 
            { id: 'single-school-eval', icon: 'ti-scale', text: '绩效公平考核模型' },
            { id: 'class-comparison', icon: 'ti-layout-columns', text: '班级横向对比' },
            { id: 'class-diagnosis', icon: 'ti-activity', text: '班级分化诊断(SD)' }
        ] 
    },
    'student': { 
        title: '🔎 学情深度诊断', 
        color: '#059669', // 绿色 Emerald (代表生长与诊治)
        items: [
            { id: 'student-details', icon: 'ti-list-details', text: '学生档案查询' },                 
            { id: 'subject-balance', icon: 'ti-scale', text: '⚖️ 优劣势学科透视' },
            { id: 'marginal-push', icon: 'ti-target-arrow', text: '🎯 临界生精准干预' }, 
            { id: 'progress-analysis', icon: 'ti-trending-up', text: '进退步/增值评价' },
            { id: 'cohort-growth', icon: 'ti-timeline', text: '📈 纵向成长档案' },
            { id: 'potential-analysis', icon: 'ti-bulb', text: '偏科潜力挖掘' },
            { id: 'segment-analysis', icon: 'ti-chart-histogram', text: '分数段统计' },
            { id: 'correlation-analysis', icon: 'ti-topology-star-3', text: '学科关联度分析' },                
            { id: 'report-generator', icon: 'ti-certificate', text: '成绩单/家长查分' }
        ] 
    },
    'tools': { 
        title: '🛠️ 教务考务工具', 
        color: '#7c3aed', // 紫色 Violet (代表工具箱)
        items: [
            { id: 'exam-arranger', icon: 'ti-id-badge-2', text: '智能考场编排' }, 
            { id: 'freshman-simulator', icon: 'ti-arrows-split', text: '新生均衡分班' },
            { id: 'grade-scheduler', icon: 'ti-calendar-time', text: '级部智能排课' },
            { id: 'seat-adjustment', icon: 'ti-armchair', text: '考后排座/互助组' },
            { id: 'mutual-aid', icon: 'ti-friends', text: '学科小老师分组' },
            { id: 'poster-generator', icon: 'ti-photo-star', text: '喜报红榜生成' }
        ] 
    }
};

let currentCategory = 'data';

function renderNavigation() {
    const catContainer = document.getElementById('navCategories');
    const subContainer = document.getElementById('navSubItems');
    catContainer.innerHTML = '';

    // 如果 Auth 未初始化或未登录，默认为 guest
    const role = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser.role : 'guest';
    
    // 1. 定义受限人群 (科任教师, 班主任, 级部主任)
    const restrictedRoles = ['teacher', 'class_teacher', 'grade_director'];
    const isRestricted = restrictedRoles.includes(role);
    const isTeacherRole = (role === 'teacher' || role === 'class_teacher');

    // 2. 强制重定向：如果当前所在的大类是被禁止的，强制切换到“校际联考分析”('town')
    // (防止用户刷新页面后停留在被隐藏的模块)
    if (isRestricted && (currentCategory === 'data' || currentCategory === 'tools')) {
        currentCategory = 'town';
        // 同时应用新颜色的主题 (金色)
        document.documentElement.style.setProperty('--primary', NAV_STRUCTURE['town'].color);
    }

    Object.keys(NAV_STRUCTURE).forEach(key => {
        const cat = NAV_STRUCTURE[key];

        // 3. 核心屏蔽逻辑：如果是受限角色，跳过 'data' 和 'tools' 的渲染
        if (isRestricted) {
            if (key === 'data' || key === 'tools') return;
        }

        // 3.1 班主任/科任教师隐藏校际联考模块
        if (isTeacherRole && key === 'town') return;

        // --- 原有渲染逻辑保持不变 ---
        const div = document.createElement('div');
        div.className = `nav-cat-item ${key === currentCategory ? 'active' : ''}`;
        div.innerHTML = `${cat.title}`;
        
        div.onclick = () => {
            currentCategory = key;
            document.documentElement.style.setProperty('--primary', cat.color);
            renderNavigation();
            
            if (cat.items.length > 0) {
                // 自动跳转到该类目下的第一个功能
                switchTab(cat.items[0].id);
            }
        };
        catContainer.appendChild(div);
    });

    subContainer.innerHTML = '';
    if (!NAV_STRUCTURE[currentCategory]) currentCategory = 'town';
    const subItems = NAV_STRUCTURE[currentCategory].items;
    subItems.forEach(item => {
        
        // 1. 教师/班主任权限控制
        if ((role === 'teacher' || role === 'class_teacher') && !canAccessModule(item.id)) return;

        // 2. 教师权限控制补充
        if (role === 'teacher') {
            const blockedModules = ['single-school-eval', 'exam-arranger', 'freshman-simulator'];
            if(blockedModules.includes(item.id)) return; 
        }

        // 3. 家长权限控制 (虽然 CSS 已经隐藏了 header，这里做双重保险)
        if (role === 'parent') return; 

        // 3. 教务主任权限 (通常拥有所有业务权限，除了账号管理，账号管理已在 Header 按钮处控制)
        
        if (item.id === 'report-generator' && !CONFIG.showQuery) return;
        const a = document.createElement('a');
        a.className = `nav-link`;
        const itemEl = document.getElementById(item.id);
        if(itemEl && itemEl.classList.contains('active')) a.classList.add('active');
        a.innerHTML = `<i class="ti ${item.icon}"></i> ${item.text}`;
        a.onclick = () => switchTab(item.id);
        subContainer.appendChild(a);
    });
}

// ================= 初始化 =================
function initSystem(type) {
    document.getElementById('mode-mask').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    if (type === '6-8') CONFIG = { name: '6-8年级', label: '全科总', excRate: 0.05, totalSubs: 'auto', analysisSubs: 'auto', showQuery: true };
    else CONFIG = { name: '9年级', label: '五科总', excRate: 0.06, totalSubs: ['语文','数学','英语','物理','化学'], analysisSubs: ['语文','数学','英语','物理','化学','政治'], showQuery: true };
    document.getElementById('mode-badge').innerText = CONFIG.name;
    document.getElementById('mode-info').innerText = `${CONFIG.name}模式 (总分: ${CONFIG.label}, 后1/3剔除: ${CONFIG.excRate*100}%)`;
    document.querySelectorAll('.label-total').forEach(e => e.innerText = CONFIG.label);
    document.getElementById('label-exc').innerText = (CONFIG.excRate*100) + '%';
    renderNavigation();
}

let __guardBypass = false;
function guardBeforeSwitch(id) {
    if (id === 'starter-hub' || id === 'upload') return true;
    const needGuard = [
        'summary','analysis','macro-watch','high-score','indicator','bottom3',
        'teacher-analysis','single-school-eval','class-comparison','class-diagnosis',
        'student-details','subject-balance','marginal-push','progress-analysis','cohort-growth',
        'potential-analysis','segment-analysis','correlation-analysis','report-generator'
    ];
    if (!needGuard.includes(id)) return true;

    const termId = localStorage.getItem('CURRENT_TERM_ID') || (typeof getTermId === 'function' ? getTermId(getExamMetaFromUI()) : '');
    const hasSchool = !!MY_SCHOOL;
    const hasScores = RAW_DATA && RAW_DATA.length > 0;
    const missing = [];
    if (!termId) missing.push('学期');
    if (!hasSchool) missing.push('本校');
    if (!hasScores) missing.push('成绩数据');

    if (missing.length) {
        Swal.fire({
            title: '⛔ 需要先完成基础配置',
            html: `<div style="text-align:left; font-size:13px; color:#475569;">
                    缺少：<strong>${missing.join('、')}</strong><br>
                    建议先进入<strong>新手入口</strong>完成引导步骤。
                </div>`,
            showCancelButton: true,
            confirmButtonText: '去新手入口',
            cancelButtonText: '我知道了',
            confirmButtonColor: '#0ea5e9'
        }).then((r) => {
            if (r.isConfirmed) {
                __guardBypass = true;
                switchTab('starter-hub');
            }
        });
        return false;
    }
    return true;
}

// [优化] switchTab: 增加动态副标题更新，提升上下文感知
function switchTab(id) {
    if (!canAccessModule(id)) {
        alert('⛔ 权限不足：该模块对当前角色不可见');
        return;
    }
    if (!__guardBypass && !guardBeforeSwitch(id)) return;
    if (__guardBypass) __guardBypass = false;
    // 1. 切换内容区域显示
    const targetSection = document.getElementById(id);
    if (!targetSection) {
        console.warn('[switchTab] 未找到 section:', id);
        return;
    }
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    targetSection.classList.add('active');
    
    // 2. 定位所属大类
    let foundCategory = null;
    let currentItemName = '';
    
    Object.keys(NAV_STRUCTURE).forEach(catKey => { 
        const item = NAV_STRUCTURE[catKey].items.find(i => i.id === id);
        if(item) {
            foundCategory = catKey;
            currentItemName = item.text;
        }
    });

    // 3. 如果大类变化，刷新一级导航和全局颜色
    if(foundCategory && foundCategory !== currentCategory) {
        currentCategory = foundCategory;
        // 立即应用新颜色的主题
        const newColor = NAV_STRUCTURE[currentCategory].color;
        document.documentElement.style.setProperty('--primary', newColor);
        
        // 重新渲染导航以更新高亮
        renderNavigation();
    } else {
        // 如果大类没变，仅更新二级菜单的高亮状态 (性能优化，不重绘整个导航)
        document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        // 找到含有对应 onclick 的链接添加 active
        const activeLink = Array.from(document.querySelectorAll('.nav-link')).find(el => el.onclick.toString().includes(id));
        if(activeLink) activeLink.classList.add('active');
    }

    // 4. [新增] 动态更新 Header 副标题 (面包屑效果)
    const catTitle = NAV_STRUCTURE[currentCategory].title; // e.g. "🏆 校际联考"
    const subTitleEl = document.getElementById('app-subtitle');
    if(subTitleEl) {
        subTitleEl.innerHTML = `<span style="opacity:0.7">${catTitle}</span> <i class="ti ti-chevron-right" style="font-size:10px;"></i> <strong>${currentItemName}</strong>`;
        subTitleEl.style.animation = 'none';
        subTitleEl.offsetHeight; /* trigger reflow */
        subTitleEl.style.animation = 'fadeIn 0.5s';
    }

    // [新增] 5. 自动同步当前页面的“说明条”颜色 (视觉统一)
    // 找到当前激活的 section
    const activeSection = document.getElementById(id);
    if(activeSection) {
        // 找到内部的 module-desc-bar
        const descBar = activeSection.querySelector('.module-desc-bar');
        if(descBar) {
            // 强制应用当前大类的颜色
            descBar.style.borderLeftColor = NAV_STRUCTURE[currentCategory].color;
            // 可选：同时让标题颜色也跟随变化
            const descTitle = descBar.querySelector('h3');
            if(descTitle) descTitle.style.color = '#333'; // 保持深色或设为 NAV_STRUCTURE[currentCategory].color
        }
    }
    ensureModuleHelpButton(id);
    
    // 6. 模块特定初始化逻辑 (保持原有逻辑不变)
    if (id === 'student-details') updateStudentSchoolSelect();
    if (id === 'high-score') renderHighScoreTable(); 
    if (id === 'teacher-analysis') {
        if (window.DataManager && typeof DataManager.ensureTeacherMap === 'function') {
            DataManager.ensureTeacherMap(true);
        }
        const cta = document.getElementById('teacher-sync-cta');
        if (cta) cta.style.display = (window.TEACHER_MAP && Object.keys(window.TEACHER_MAP).length > 0) ? 'none' : 'inline-flex';

        const user = getCurrentUser();
        const role = user?.role || 'guest';
        const restricted = (role === 'teacher' || role === 'class_teacher');
        const exportBtn = document.querySelector('#teacher-analysis .sec-head button');
        if (exportBtn) exportBtn.style.display = restricted ? 'none' : 'inline-flex';
        const detailSection = document.getElementById('anchor-detail');
        const pairSection = document.getElementById('anchor-pair');
        const townshipContainer = document.getElementById('teacher-township-ranking-container');
        if (detailSection) detailSection.style.display = restricted ? 'none' : 'block';
        if (pairSection) pairSection.style.display = restricted ? 'none' : 'block';
        if (townshipContainer) townshipContainer.style.display = restricted ? 'none' : 'block';
        
        // 1. 核心修复：如果本校变量为空，立即根据数据进行暴力推断
        if (!MY_SCHOOL && typeof SCHOOLS !== 'undefined' && Object.keys(SCHOOLS).length > 0) {
            
            // 策略A: 如果全镇只有一所学校（单校版），直接锁定
            const schoolNames = Object.keys(SCHOOLS);
            if (schoolNames.length === 1) {
                MY_SCHOOL = schoolNames[0];
            } 
            // 策略B: 如果有多所学校，根据任课表反推“最可能的学校”
            else if (typeof TEACHER_MAP !== 'undefined' && Object.keys(TEACHER_MAP).length > 0) {
                const schoolCounts = {};
                
                // 遍历任课表中的每一个“班级_科目”键
                Object.keys(TEACHER_MAP).forEach(key => {
                    const cls = key.split('_')[0]; // 提取班级名，如 "9.1"
                    
                    // 在所有学校中搜寻：谁拥有这个班级？
                    for (const sName of schoolNames) {
                        const hasClass = SCHOOLS[sName].students.some(s => s.class == cls);
                        if (hasClass) {
                            // 找到归属，给该学校投一票
                            schoolCounts[sName] = (schoolCounts[sName] || 0) + 1;
                            break; 
                        }
                    }
                });

                // 票数最高的学校即为本校
                let max = 0;
                let winner = "";
                for(const [s, c] of Object.entries(schoolCounts)) {
                    if(c > max) { max = c; winner = s; }
                }
                
                if (winner) {
                    MY_SCHOOL = winner;
                    console.log("🤖 [智能修复] 系统已自动根据任课表锁定本校为:", MY_SCHOOL);
                }
            }
            
            // 如果推断成功，自动同步 UI 下拉框，让用户无感
            if (MY_SCHOOL) {
                const sel = document.getElementById('mySchoolSelect');
                if (sel) sel.value = MY_SCHOOL;
            }
        }

        // 2. 执行分析 (现在 MY_SCHOOL 应该已经被自动填好了)
        if (MY_SCHOOL && Object.keys(TEACHER_MAP).length > 0) {
            analyzeTeachers(); 
            renderTeacherComparisonTable(); 
            renderTeacherTownshipRanking();
        } else {
            // 3. 如果还是失败（通常是因为还没上传学生成绩，只有教师名单是无法分析的）
            const compTable = document.getElementById('teacherComparisonTable');
            if(compTable) {
                compTable.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#999;">
                        <div style="font-size:48px; margin-bottom:10px;">🏫❓</div>
                        <p style="font-size:16px; font-weight:bold; color:#333;">无法自动识别“本校”</p>
                        <div style="background:#f9fafb; padding:10px 20px; border-radius:6px; display:inline-block; text-align:left; margin-top:10px; font-size:13px; color:#666; line-height:1.8;">
                            <strong>可能原因：</strong><br>
                            1. 您仅导入了教师配置，但尚未上传<strong>【学生成绩】</strong>数据。<br>
                            <span style="color:#d97706">(系统需要结合学生名单才能确认班级归属)</span><br>
                            2. 任课表中的班级名 (如 9.1) 与成绩表中的班级名 (如 901) 不一致。<br>
                        </div>
                    </div>`;
            }
            document.getElementById('teacher-township-ranking-container').innerHTML = '';
        }
    }
    if (id === 'exam-arranger') {
        EXAM_initProctorUI(); 
    }
    if (id === 'report-generator') { updateMarginalSchoolSelect(); updateClassSelect(); }
    if (id === 'segment-analysis') updateSegmentSelects();
    if (id === 'class-comparison') updateClassCompSchoolSelect();
    if (id === 'potential-analysis') updatePotentialSchoolSelect();
    if (id === 'class-diagnosis') updateDiagnosisSelects();
    if (id === 'correlation-analysis') updateCorrelationSchoolSelect();
    if (id === 'seat-adjustment') updateSeatAdjSelects();
    if (id === 'subject-balance') updateSubjectBalanceSelects();
    if (id === 'progress-analysis') {
        
        // 1. 智能推断本校 (逻辑保持不变)
        if (!MY_SCHOOL && typeof TEACHER_MAP !== 'undefined' && Object.keys(TEACHER_MAP).length > 0 && typeof SCHOOLS !== 'undefined') {
            const schoolCounts = {};
            const schoolNames = Object.keys(SCHOOLS);
            Object.keys(TEACHER_MAP).forEach(key => {
                const cls = key.split('_')[0]; 
                for (const sName of schoolNames) {
                    if (SCHOOLS[sName].students.some(s => s.class == cls)) {
                        schoolCounts[sName] = (schoolCounts[sName] || 0) + 1;
                        break; 
                    }
                }
            });
            let max = 0; let winner = "";
            for(const [s, c] of Object.entries(schoolCounts)) { if(c > max) { max = c; winner = s; } }
            if (winner) { MY_SCHOOL = winner; }
        }

        // 2. 初始化下拉框
        updateProgressSchoolSelect();
        updateProgressBaselineSelect();
        const progSel = document.getElementById('progressSchoolSelect');
        if (MY_SCHOOL && progSel) progSel.value = MY_SCHOOL;

        // 3. 🔥 核心修复：检查内存数据并激活 🔥
        const statusEl = document.getElementById('va-data-status');
        
        const baselineSel = document.getElementById('progressBaselineSelect');
        const baselineId = baselineSel?.value || '';
        const baselineData = baselineId ? getBaselineDataFromExam(baselineId) : (window.PREV_DATA || []);

        // 只要 baseline 有长度，就说明云端或本地已加载
        if (baselineData && baselineData.length > 0) {
            // 成功状态
            if(statusEl) {
                statusEl.innerHTML = `✅ 数据就绪 (已加载 ${baselineData.length} 条历史记录)`;
                statusEl.style.color = "#16a34a";
                statusEl.style.fontWeight = "bold";
            }
            
            // 如果还没有生成缓存(PROGRESS_CACHE)，立即执行静默匹配
            window.PREV_DATA = baselineData;
            if (!window.PROGRESS_CACHE || window.PROGRESS_CACHE.length === 0) {
                if (typeof performSilentMatching === 'function') performSilentMatching();
            }
            
            // 渲染报表
            if (typeof renderValueAddedReport === 'function') renderValueAddedReport(true);
            
            // 如果选中了学校，渲染个人追踪
            if (progSel && progSel.value && typeof renderProgressAnalysis === 'function') {
                renderProgressAnalysis(); 
            }
        } else {
            // 失败状态
            if(statusEl) {
                statusEl.innerHTML = `❌ 缺上次考试数据 (请到“数据 -> 历史数据对比”上传)`;
                statusEl.style.color = "#dc2626";
            }
        }
    }
    if (id === 'mutual-aid') updateMutualAidSelects();
    if (id === 'poster-generator') updatePosterSelects();
    if (id === 'marginal-push') updateMpSchoolSelect();
    // 如果是单校绩效模块，触发一次下拉框更新
    if (id === 'single-school-eval') updateSSESchoolSelect();
}

function switchCategory(key) { currentCategory = key; renderNavigation(); }

// ================= 侧边栏与通用工具 =================
function scrollToAnchor(id, element) {
    const target = document.getElementById(id);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (element && element.closest) {
            const parent = element.closest('.side-nav');
            if(parent) {
                parent.querySelectorAll('.side-nav-link').forEach(el => el.classList.remove('active'));
                parent.querySelectorAll('.side-nav-sub-link').forEach(el => el.classList.remove('active')); 
            }
            if (element.classList) element.classList.add('active');
        }
    }
}

function toggleSubNav(element) {
    const container = element.nextElementSibling;
    if (container && container.classList.contains('side-nav-sub-container')) {
        container.classList.toggle('show');
        element.classList.toggle('expanded');
    }
}

function scrollToSubAnchor(id, element) {
    const target = document.getElementById(id);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const sideNav = element.closest('.side-nav');
        if(sideNav) {
            sideNav.querySelectorAll('.side-nav-link').forEach(el => el.classList.remove('active'));
            sideNav.querySelectorAll('.side-nav-sub-link').forEach(el => el.classList.remove('active'));
            const parentContainer = element.closest('.side-nav-sub-container');
            if(parentContainer && parentContainer.previousElementSibling) parentContainer.previousElementSibling.classList.add('active');
        }
        element.classList.add('active');
    }
}

function safeGet(obj, path, defaultValue = '-') { return path.split('.').reduce((acc, key) => acc && acc[key], obj) || defaultValue; }
function getSubjectOrderIndex(sub) { const idx = SUBJECT_ORDER.indexOf(sub); return idx === -1 ? 999 : idx; }
function sortSubjects(a, b) { const idxA = getSubjectOrderIndex(a); const idxB = getSubjectOrderIndex(b); if (idxA !== idxB) return idxA - idxB; return a.localeCompare(b); }

function resetSystem() {
    if (isArchiveLocked()) {
        return alert("⛔ 当前考试已封存，仅支持只读查看");
    }
    Swal.fire({
        title: '⚠️ 确定要重置系统吗？',
        text: "此操作将清空当前所有导入的数据、教师设置以及自动存档，且无法撤销！系统将回到初始“模式选择”界面。",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626', // 红色警示
        cancelButtonColor: '#6b7280',
        confirmButtonText: '确定清空重置',
        cancelButtonText: '取消'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // 1. 清空 IndexedDB 存储
            await DB.clear('autosave_backup');
            
            // 2. 清空 LocalStorage (如果有相关的)
            localStorage.removeItem('FB_DATA_BACKUP');
            localStorage.removeItem('MP_SNAPSHOTS');
            
            // 3. 刷新页面 -> 触发 onload -> 发现无数据 -> 显示模式选择
            location.reload();
        }
    });
}
