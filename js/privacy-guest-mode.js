// 隐私/演示模式 + 阅后即焚模式

// --- 隐私/演示模式逻辑 ---
function togglePrivacyMode() {
    const btn = document.getElementById('btn-privacy-toggle');
    const indicator = document.getElementById('privacy-indicator');
    
    if (!IS_PRIVACY_ON) {
        // === 开启隐私模式 ===
        if (RAW_DATA.length === 0) return alert("请先上传数据后再开启演示模式。");
        
        if (!confirm("🛡️ 即将进入【隐私演示模式】：\n\n1. 所有学生姓名将变为代码 (如 S-001)\n2. 所有教师姓名将变为代码 (如 T-01)\n3. 适合投屏汇报或截图分享\n\n点击确定继续。")) return;

        // 1. 备份原始数据 (Deep Copy)
        DATA_BACKUP_PRIVACY = {
            RAW_DATA: JSON.parse(JSON.stringify(RAW_DATA)),
            TEACHER_MAP: JSON.parse(JSON.stringify(TEACHER_MAP)),
            // 也要备份历史数据，否则进退步分析会乱
            PREV_DATA: JSON.parse(JSON.stringify(PREV_DATA))
        };

        // 2. 执行脱敏 (Masking)
        // 建立映射表保证同名同ID
        const stuMap = new Map(); 
        let stuCounter = 1;
        
        // 脱敏 RAW_DATA
        RAW_DATA.forEach(s => {
            const key = s.name; // 简单按姓名映射，如果有重名会映射成同一个代码，符合演示逻辑
            if (!stuMap.has(key)) {
                stuMap.set(key, `S-${String(stuCounter++).padStart(3, '0')}`);
            }
            s.name = stuMap.get(key);
        });

        // 脱敏 PREV_DATA (如果有)
        if (PREV_DATA.length > 0) {
            PREV_DATA.forEach(p => {
                const key = p.name;
                // 如果是上次有但本次没有的学生，给新号；如果有，用旧号
                if (!stuMap.has(key)) {
                     stuMap.set(key, `S-${String(stuCounter++).padStart(3, '0')}`);
                }
                p.name = stuMap.get(key);
            });
        }

        // 脱敏 TEACHER_MAP
        const teacherMap = new Map();
        let teaCounter = 1;
        Object.keys(TEACHER_MAP).forEach(k => {
            const realName = TEACHER_MAP[k];
            if (!teacherMap.has(realName)) {
                teacherMap.set(realName, `T-${String(teaCounter++).padStart(2, '0')}`);
            }
            TEACHER_MAP[k] = teacherMap.get(realName);
        });

        // 3. 标记状态并刷新
        IS_PRIVACY_ON = true;
        btn.innerHTML = '<i class="ti ti-eye"></i> 退出隐私模式';
        btn.style.background = "#dc2626"; // 红色按钮提示退出
        indicator.style.display = "block";
        document.body.classList.add('privacy-mode-active'); // 可用于CSS扩展

    } else {
        // === 关闭隐私模式 (还原) ===
        if (DATA_BACKUP_PRIVACY) {
            RAW_DATA = DATA_BACKUP_PRIVACY.RAW_DATA;
            setTeacherMap(DATA_BACKUP_PRIVACY.TEACHER_MAP);
            PREV_DATA = DATA_BACKUP_PRIVACY.PREV_DATA;
            DATA_BACKUP_PRIVACY = null;
        }

        IS_PRIVACY_ON = false;
        btn.innerHTML = '<i class="ti ti-eye-off"></i> 开启隐私模式';
        btn.style.background = "rgba(255,255,255,0.2)";
        indicator.style.display = "none";
        document.body.classList.remove('privacy-mode-active');
    }

    // 4. 全局重算与重绘
    // 因为 SCHOOLS, TEACHER_STATS 等都是基于 RAW_DATA 计算的，必须重置
    SCHOOLS = {}; 
    TEACHER_STATS = {}; 
    TEACHER_TOWNSHIP_RANKINGS = {};
    
    // 重新运行数据处理流程
    processData(); 
    calculateRankings(); 
    
    // 如果当前在教师分析页，重算教师数据
    if (Object.keys(TEACHER_MAP).length > 0 && MY_SCHOOL) {
        analyzeTeachers(); 
    }

    // 刷新所有表格视图
    renderTables();
    
    // 刷新特定的视图（如果当前正停留在这些Tab）
    // 比如教师卡片
    if (!document.getElementById('teacherCardsContainer').innerHTML.includes('暂无')) {
        renderTeacherCards();
        renderTeacherComparisonTable();
        renderTeacherTownshipRanking();
    }
    // 比如进退步
    if (document.getElementById('progress-analysis').classList.contains('active')) {
         if (PREV_DATA.length > 0) renderProgressAnalysis();
    }

    alert(IS_PRIVACY_ON ? "✅ 隐私模式已开启：姓名已脱敏，可进行汇报演示。" : "✅ 隐私模式已退出：数据已还原。");
}

window.IS_GUEST_MODE = false; // 全局标记

function toggleGuestMode() {
    const btn = document.getElementById('btn-guest-mode');
    
    if (!window.IS_GUEST_MODE) {
        // === 准备开启 ===
        Swal.fire({
            title: '🔥 开启“阅后即焚”模式？',
            html: `
                <div style="text-align:left; font-size:14px; color:#555;">
                    <p>此模式适用于公用电脑或临时处理数据。</p>
                    <ul style="color:#b91c1c; font-weight:bold;">
                        <li>1. 立即清空现有的自动存档。</li>
                        <li>2. 停止一切自动备份功能。</li>
                        <li>3. 关闭页面或刷新后，所有数据将永久丢失。</li>
                    </ul>
                    <p>确定要进入此模式吗？</p>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#64748b',
            confirmButtonText: '确定开启 (清除旧缓存)',
            cancelButtonText: '取消'
        }).then(async (result) => {
            if (result.isConfirmed) {
                // 1. 立即清除缓存
                await DB.clear('autosave_backup');
                
                // 2. 清除 LocalStorage 中的非配置类数据
                localStorage.removeItem('FB_DATA_BACKUP');
                localStorage.removeItem('MP_SNAPSHOTS');
                
                // 3. 改变状态
                window.IS_GUEST_MODE = true;
                
                // 4. UI 变化
                btn.innerHTML = '<i class="ti ti-flame-off"></i> 退出并清空';
                btn.style.background = "#dc2626";
                btn.style.borderColor = "#b91c1c";
                
                // 5. 页面增加水印或标识
                document.body.style.borderTop = "5px solid #dc2626";
                const statusEl = document.getElementById('auto-backup-status');
                if(statusEl) statusEl.innerHTML = `<span style="color:#dc2626; font-weight:bold;">🔥 阅后即焚模式：数据不落地</span>`;

                UI.toast("🔥 已开启阅后即焚：旧缓存已清理，新数据将不再保存。", "success");
            }
        });

    } else {
        // === 准备关闭 (其实就是重置) ===
        Swal.fire({
            title: '退出阅后即焚',
            text: "退出将刷新页面并重置系统。当前屏幕上的数据将会丢失。",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '退出并刷新',
            confirmButtonColor: '#4f46e5'
        }).then((result) => {
            if (result.isConfirmed) {
                location.reload(); // 直接刷新，回归初始状态
            }
        });
    }
}

// 拦截手动保存操作 (双重保险)
const originalSaveSnapshot = saveProjectSnapshot; // 备份原函数
saveProjectSnapshot = function() {
    if (window.IS_GUEST_MODE) {
        Swal.fire({
            title: '⚠️ 模式限制',
            text: '当前处于“阅后即焚”模式，禁止保存项目快照到本地硬盘。请先退出此模式。',
            icon: 'error',
            confirmButtonColor: '#dc2626'
        });
        return;
    }
    originalSaveSnapshot();
};
