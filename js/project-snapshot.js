// === 项目快照逻辑 ===
function saveProjectSnapshot() {
    const hasData = RAW_DATA.length > 0 || Object.keys(TEACHER_MAP).length > 0;
    const hasConfig = localStorage.getItem('LLM_API_KEY') || localStorage.getItem('app_skin_config');

    if (!hasData && !hasConfig) { 
        return alert("当前系统为空，无需备份！"); 
    }

    // 获取当前界面上的输入框数值
    const elInd1 = document.getElementById('ind1');
    const elInd2 = document.getElementById('ind2');

    const snapshot = {
        meta: { 
            version: "3.3", 
            timestamp: new Date().toISOString(), 
            desc: "全量备份(含指标参数)" 
        },
        db: {
            // 核心变量
            CONFIG, MY_SCHOOL, RAW_DATA, SCHOOLS, SUBJECTS, THRESHOLDS, 
            TARGETS, // 👈 确保这里包含目标人数对象
            TEACHER_MAP, TEACHER_STATS, TEACHER_TOWNSHIP_RANKINGS, TEACHER_STAMP_BASE64, 
            PREV_DATA, PROGRESS_CACHE, MARGINAL_STUDENTS, POTENTIAL_STUDENTS_CACHE, 
            MP_DATA_CACHE, FB_STUDENTS, FB_CLASSES, FB_SIMULATED_DATA, EXAM_DATA, 
            EXAM_ROOMS, AID_GROUPS_CACHE, HISTORY_ARCHIVE, ROLLER_COASTER_STUDENTS,
            MP_SNAPSHOTS,
            
            // 🟢 关键修改：保存输入框的具体数值
            INDICATOR_PARAMS: {
                ind1: elInd1 ? elInd1.value : '',
                ind2: elInd2 ? elInd2.value : ''
            }
        },
        settings: {
            ai: {
                key: localStorage.getItem('LLM_API_KEY'),
                url: localStorage.getItem('LLM_BASE_URL'),
                model: localStorage.getItem('LLM_MODEL')
            },
            skin: localStorage.getItem('app_skin_config'),
            themeDark: localStorage.getItem('theme-dark'),
            hasSeenTour: localStorage.getItem('hasSeenV3Tour')
        }
    };

    try {
        const jsonStr = JSON.stringify(snapshot);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toLocaleDateString().replace(/\//g, "-");
        const fileName = `全站备份_${dateStr}.json`;

        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        UI.toast("✅ 备份已下载 (含指标参数)", "success");
    } catch (e) {
        console.error(e);
        alert("备份失败：" + e.message);
    }
}

function loadProjectSnapshot(input) {
    if (isArchiveLocked()) return alert("⛔ 当前考试已封存，禁止恢复项目");
    const file = input.files[0];
    if (!file) return;

    if(!confirm("⚠️ 警告：导入备份将【覆盖】当前系统中的所有数据！\n确定要继续吗？")) {
        input.value = ''; return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            UI.loading(true, "正在恢复全站数据...");
            
            const jsonStr = e.target.result; 
            const snapshot = JSON.parse(jsonStr);

            // 1. 校验版本结构
            if (!snapshot.meta || (!snapshot.data && !snapshot.db)) { 
                throw new Error("文件格式不兼容或已损坏"); 
            }

            // 兼容旧版备份 (旧版数据在 .data，新版在 .db)
            const db = snapshot.db || snapshot.data || {};
            const settings = snapshot.settings || {};

            // 2. 恢复 LocalStorage 配置
            if (settings.ai) {
                if(settings.ai.key) localStorage.setItem('LLM_API_KEY', settings.ai.key);
                if(settings.ai.url) localStorage.setItem('LLM_BASE_URL', settings.ai.url);
                if(settings.ai.model) localStorage.setItem('LLM_MODEL', settings.ai.model);
            }
            if (settings.skin) localStorage.setItem('app_skin_config', settings.skin);
            if (settings.themeDark) localStorage.setItem('theme-dark', settings.themeDark);
            if (settings.hasSeenTour) localStorage.setItem('hasSeenV3Tour', settings.hasSeenTour);

            // 3. 恢复 IndexedDB 数据 (关键步骤：写入后刷新页面)
            if (Object.keys(db).length > 0) {
                /* 👇👇👇 🟢 关键：恢复全局变量 TARGETS (防止刷新前点击无效) 🟢 👇👇👇 */
                window.TARGETS = db.TARGETS || {};
                
                await DB.save('autosave_backup', {
                    timestamp: Date.now(),
                    RAW_DATA: db.RAW_DATA || [],
                    SCHOOLS: db.SCHOOLS || {},
                    SUBJECTS: db.SUBJECTS || [],
                    THRESHOLDS: db.THRESHOLDS || {},
                    
                    /* 👇👇👇 🟢 关键：写入 TARGETS 到缓存 🟢 👇👇👇 */
                    TARGETS: db.TARGETS || {}, 
                    
                    /* 👇👇👇 🟢 关键：写入 指标参数 到缓存 🟢 👇👇👇 */
                    INDICATOR_PARAMS: db.INDICATOR_PARAMS || { ind1: '', ind2: '' },

                    TEACHER_MAP: db.TEACHER_MAP || {},
                    TEACHER_STATS: db.TEACHER_STATS || {},
                    FB_CLASSES: db.FB_CLASSES || [],
                    CONFIG: db.CONFIG || {},
                    MY_SCHOOL: db.MY_SCHOOL || "",
                    // 其他字段...
                    TEACHER_TOWNSHIP_RANKINGS: db.TEACHER_TOWNSHIP_RANKINGS || {},
                    PREV_DATA: db.PREV_DATA || [],
                    PROGRESS_CACHE: db.PROGRESS_CACHE || [],
                    MARGINAL_STUDENTS: db.MARGINAL_STUDENTS || {},
                    POTENTIAL_STUDENTS_CACHE: db.POTENTIAL_STUDENTS_CACHE || [],
                    FB_STUDENTS: db.FB_STUDENTS || [],
                    FB_SIMULATED_DATA: db.FB_SIMULATED_DATA || {},
                    EXAM_DATA: db.EXAM_DATA || [],
                    EXAM_ROOMS: db.EXAM_ROOMS || [],
                    AID_GROUPS_CACHE: db.AID_GROUPS_CACHE || [],
                    HISTORY_ARCHIVE: db.HISTORY_ARCHIVE || {},
                    ROLLER_COASTER_STUDENTS: db.ROLLER_COASTER_STUDENTS || []
                });
                
                // 恢复临界生快照到 LocalStorage
                if(db.MP_SNAPSHOTS) {
                    localStorage.setItem('MP_SNAPSHOTS', JSON.stringify(db.MP_SNAPSHOTS));
                }
            }

            // 标记强制恢复
            localStorage.setItem('SYS_FORCE_RESTORE', 'true');

            UI.loading(false);
            
            // 4. 成功提示并刷新
            Swal.fire({
                title: '恢复成功',
                text: '数据已导入，系统即将重启以应用更改...',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                location.reload(); 
            });

        } catch (err) { 
            UI.loading(false);
            console.error(err); 
            alert("❌ 恢复失败：文件可能损坏。\nDEBUG: " + err.message); 
        }
    }; 
    reader.readAsText(file);
}

function openTargetEditor() {
    if (Object.keys(SCHOOLS).length === 0) return alert("请先上传成绩数据，系统需要读取学校列表。");
    
    const tbody = document.querySelector('#target-editor-table tbody');
    tbody.innerHTML = '';

    // 遍历所有学校，生成输入框
    Object.keys(SCHOOLS).forEach(sch => {
        // 获取现有目标，如果没有则默认为 0
        const t = TARGETS[sch] || { t1: 0, t2: 0 };
        
        tbody.innerHTML += `
            <tr data-school="${sch}">
                <td style="font-weight:bold;">${sch}</td>
                <td>
                    <input type="number" class="inp-t1" value="${t.t1}" style="width:80px; text-align:center; border:1px solid #93c5fd;">
                </td>
                <td>
                    <input type="number" class="inp-t2" value="${t.t2}" style="width:80px; text-align:center; border:1px solid #fdba74;">
                </td>
            </tr>
        `;
    });

    document.getElementById('target-editor-modal').style.display = 'flex';
}

function saveTargetEditor() {
    const rows = document.querySelectorAll('#target-editor-table tbody tr');
    let updateCount = 0;

    rows.forEach(tr => {
        const sch = tr.dataset.school;
        const t1 = parseInt(tr.querySelector('.inp-t1').value) || 0;
        const t2 = parseInt(tr.querySelector('.inp-t2').value) || 0;

        TARGETS[sch] = { t1: t1, t2: t2 };
        updateCount++;
    });

    document.getElementById('target-editor-modal').style.display = 'none';
    
    UI.toast(`✅ 已更新 ${updateCount} 所学校的目标设定`, "success");
    
    // 自动触发一次计算，让用户看到变化
    if(document.getElementById('ind1').value && document.getElementById('ind2').value) {
        calcIndicators();
    } else {
        alert("目标已保存！\n请记得在上方输入框设置【划线名次】，然后点击【开始计算】。");
    }
}
