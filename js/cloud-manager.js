// ✅ 统一云端同步逻辑 (重构版)
const CloudManager = {
    check: () => {
        if (!sbClient) {
            if (window.UI) UI.toast("云端未连接 (Supabase Disconnected)", "error");
            return false;
        }
        return true;
    },

    getKey: () => {
        const meta = typeof getExamMetaFromUI === 'function' ? getExamMetaFromUI() : {};
        if (!meta.cohortId || !meta.year || !meta.term || !meta.type) return null;
        const parts = [
            meta.cohortId + '级',
            meta.grade ? meta.grade + '年级' : '未知年级',
            meta.year,
            meta.term,
            meta.type,
            meta.name || '标准考试'
        ];
        return parts.join('_').replace(/[\s\/\\\?]/g, '');
    },

    save: async function() {
        if (!this.check()) return;
        const role = sessionStorage.getItem('CURRENT_ROLE');
        if (role !== 'admin' && role !== 'director' && role !== 'grade_director') {
            if (window.UI) UI.toast("⛔ 权限不足", "warning");
            return;
        }
        const key = this.getKey();
        if (!key) return alert("请先完善考试信息");
        if (window.UI) UI.loading(true, `☁️ 正在同步...`);
        try {
            if (!window.SYS_VARS) window.SYS_VARS = { indicator: { ind1: '', ind2: '' }, targets: {} };
            const i1 = document.getElementById('dm_ind1_input');
            const i2 = document.getElementById('dm_ind2_input');
            if (i1) window.SYS_VARS.indicator.ind1 = i1.value;
            if (i2) window.SYS_VARS.indicator.ind2 = i2.value;
            window.SYS_VARS.targets = window.TARGETS || {};

            const payload = typeof getCurrentSnapshotPayload === 'function' ? getCurrentSnapshotPayload() : {};
            const json = JSON.stringify(payload);
            const compressed = "LZ|" + LZString.compressToUTF16(json);

            const { error } = await sbClient.from('system_data').upsert({
                key,
                content: compressed,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
            if (error) throw error;

            localStorage.setItem('CURRENT_PROJECT_KEY', key);
            if (window.idbKeyval) await idbKeyval.set(`cache_${key}`, payload);
            if (window.UI) UI.toast("✅ 云端同步成功", "success");
            localStorage.setItem('CLOUD_SYNC_AT', new Date().toISOString());
            logAction('云端同步', `全量数据已同步：${key}`);
            updateStatusPanel();
        } catch (e) {
            console.error("CloudManager Save Error:", e);
            alert("同步失败: " + e.message);
        } finally {
            if (window.UI) UI.loading(false);
        }
    },

    load: async function() {
        if (!this.check()) return;
        const key = this.getKey() || localStorage.getItem('CURRENT_PROJECT_KEY');
        if (!key) return;
        if (window.UI) UI.toast("⏳ 正在检查云端数据...", "info");
        try {
            const { data, error } = await sbClient
                .from('system_data')
                .select('content')
                .eq('key', key)
                .maybeSingle();
            if (error) throw error;
            if (!data) return;

            let content = data.content;
            if (typeof content === 'string' && content.startsWith("LZ|")) {
                content = LZString.decompressFromUTF16(content.substring(3));
            }
            const payload = typeof content === 'string' ? JSON.parse(content) : content;
            if (typeof applySnapshotPayload === 'function') applySnapshotPayload(payload);
            if (window.UI) UI.toast("✅ 数据已同步到本地", "success");
            logAction('云端加载', `已加载全量数据：${key}`);
        } catch (e) {
            console.error("CloudManager Load Error:", e);
            if (window.UI) UI.toast("加载失败", "error");
        }
    },

    // 教师任课：学期级同步
    getTeacherKey: () => {
        const termSel = document.getElementById('dm-teacher-term-select');
        const meta = typeof getExamMetaFromUI === 'function' ? getExamMetaFromUI() : {};
        
        let termId = termSel?.value;
        if (!termId) termId = localStorage.getItem('CURRENT_TERM_ID');
        if (!termId && typeof getTermId === 'function') termId = getTermId(meta);

        const cohortId = window.CURRENT_COHORT_ID || window.CURRENT_COHORT_META?.id || meta.cohortId || localStorage.getItem('CURRENT_COHORT_ID');
        
        if (!cohortId || !termId) {
            console.warn(`[TeacherSync] 生成Key失败: Cohort=${cohortId}, Term=${termId}`);
            return null;
        }
        return `TEACHERS_${cohortId}级_${termId}`;
    },

    saveTeachers: async function() {
        console.log("[TeacherSync] 开始执行 saveTeachers...");
        if (!sbClient && typeof window.initSupabase === 'function') window.initSupabase();
        
        if (!this.check()) {
            console.error("[TeacherSync] Supabase 未连接");
            alert("云端服务未连接，无法保存！");
            return false;
        }

        const key = this.getTeacherKey();
        if (!key) {
            console.error("[TeacherSync] 无法生成 Key");
            if (window.UI) UI.toast("无法确定学期或年级信息", "error");
            alert("保存失败：无法确定学期或年级信息（Key生成失败）");
            return false;
        }

        if (!window.TEACHER_MAP || Object.keys(window.TEACHER_MAP).length === 0) {
            console.warn("[TeacherSync] TEACHER_MAP 为空");
            if (window.UI) UI.toast("当前无任课数据", "warning");
            alert("当前无任课数据，无需保存");
            return false;
        }

        if (window.UI) UI.loading(true, "☁️ 正在同步任课数据...");
        try {
            console.log('[TeacherSync] 准备保存任课表 Key:', key);
            const rawPayload = JSON.stringify(window.TEACHER_MAP);
            const compressed = "LZ|" + LZString.compressToUTF16(rawPayload);
            
            let error = null;
            
            // 尝试写入 (使用压缩数据)
            const primary = await sbClient.from('system_data').upsert({
                key,
                content: compressed,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });
            
            if (primary.error) {
                 console.warn('[TeacherSync] Primary upsert error:', primary.error);
                 throw primary.error;
            }

            // 验证写入
            const verify = await sbClient.from('system_data').select('key').eq('key', key).maybeSingle();
            if (verify.error) {
                console.warn('[TeacherSync] 写入后校验 API 报错:', verify.error);
            } else if (!verify.data) {
                console.warn('[TeacherSync] 写入后无法查回数据 (RLS BLOCK?)');
                throw new Error("写入疑似被 RLS 策略拦截，无法查回数据");
            }

            console.log('[TeacherSync] 保存成功且校验通过');
            if (window.UI) UI.toast(`✅ 任课表已同步（${key}）`, "success");
            localStorage.setItem('TEACHER_SYNC_AT', new Date().toISOString());
            logAction('任课同步', `任课表已保存：${key}`);
            updateStatusPanel();
            
            if (window.DataManager && typeof DataManager.refreshTeacherAnalysis === 'function') {
                DataManager.refreshTeacherAnalysis();
            }
            return true;
        } catch (e) {
            console.error('[TeacherSync] 保存异常:', e);
            alert("任课同步失败: " + (e.message || e.code) + "\nKey: " + key + "\n\n请联系管理员检查 Supabase system_data 表权限。");
            return false;
        } finally {
            if (window.UI) UI.loading(false);
        }
    },

    loadTeachers: async function() {
        if (!sbClient && typeof window.initSupabase === 'function') window.initSupabase();
        if (!this.check()) return;
        const key = this.getTeacherKey();
        if (!key) {
            console.warn('⚠️ 无法生成教师Key，请确保已选择学期');
            return;
        }
        try {
            console.log('[TeacherSync] 拉取任课表 Key:', key);
            if (window.UI) UI.loading(true, "☁️ 正在从云端拉取学期任课表...");
            const { data, error } = await sbClient.from('system_data').select('content').eq('key', key).maybeSingle();
            if (error) throw error;
            if (!data) {
                if (window.UI) UI.loading(false);
                console.warn(`☁️ 云端未找到本学期的任课档案: ${key}`);
                if (window.UI) UI.toast(`☁️ 云端暂无本学期任课数据`, "info");
                return;
            }
            let raw = data.content;
            if (typeof raw === 'string' && raw.startsWith('LZ|')) {
                raw = LZString.decompressFromUTF16(raw.substring(3));
            }
            const map = typeof raw === 'string' ? JSON.parse(raw) : raw;
            setTeacherMap(map);
            
            // 🟢 [修复]：加载后自动同步到本地历史记录
            if (window.DataManager && DataManager.syncTeacherHistory) DataManager.syncTeacherHistory();
            if (window.DataManager && DataManager.renderTeachers) DataManager.renderTeachers();
            if (window.DataManager && typeof DataManager.refreshTeacherAnalysis === 'function') {
                DataManager.refreshTeacherAnalysis();
            }
            updateStatusPanel();
            
            if (window.UI) UI.loading(false);
            if (window.UI) UI.toast(`✅ 已从云端加载本学期任课表（${Object.keys(map).length}条）`, "success");
            logAction('任课同步', `任课表已加载：${key}`);
            console.log(`✅ 云端任课表加载成功: ${key}, 共 ${Object.keys(map).length} 条记录`);
        } catch (e) {
            if (window.UI) UI.loading(false);
            console.error('云端加载失败:', e);
            if (window.UI) UI.toast('☁️ 云端数据加载失败', 'error');
        }
    }
};

window.CloudManager = CloudManager;
window.saveCloudData = () => CloudManager.save();
window.loadCloudData = () => CloudManager.load();
window.getUniqueExamKey = () => CloudManager.getKey();
window.saveCloudSnapshot = () => {};

// 🟢 [修复] 页面加载完成后检查关键库
window.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (typeof XLSX === 'undefined') {
            console.error('❌ XLSX库加载失败，Excel导入导出功能将不可用');
        } else {
            console.log('✅ XLSX库加载成功，版本:', XLSX.version);
        }
        updateStatusPanel();
        updateRoleHint();
        renderActionLogs();
        scanDataIssues();
        if (!localStorage.getItem('HAS_SEEN_STARTER')) {
            __guardBypass = true;
            switchTab('starter-hub');
            openStarterGuide();
        }
        scheduleTeacherSyncPrompt();
    }, 1000);
});
