// 数据持久化 + 届别切换 + 启动恢复 + 性能工具 + 全局状态 + 本地AI

// 🟢 [优化版] 数据持久化工具：支持 Supabase 云端同步 + IndexedDB 本地缓存
const DB = {
    // 保存数据：同时保存到云端和本地缓存
    save: async (key, value) => {
        // 1. 优先保存到本地 IndexedDB (极速)
        try {
            if (window.idbKeyval) {
                await idbKeyval.set(`cache_${key}`, value);
                console.log(`💾 本地缓存已更新: ${key}`);
            }
        } catch (e) { console.warn("本地缓存失败:", e); }

        // 2. 异步同步到云端
        if (!sbClient) return; 
        try {
            const jsonStr = JSON.stringify(value);
            const compressedStr = "LZ|" + LZString.compressToUTF16(jsonStr);
            
            const { error } = await sbClient
                .from('system_data') 
                .upsert({ key: key, content: compressedStr }, { onConflict: 'key' });

            if (error) {
                console.error("云端备份失败:", error);
            } else {
                const statusEl = document.getElementById('auto-backup-status');
                if (statusEl) statusEl.innerHTML = `<span style="color:#16a34a;">☁️ 云端已同步</span>`;
            }
        } catch (e) {
            console.error("云端同步出错:", e);
        }
    },

    // 读取数据：优先本地缓存，后台静默更新
    get: async (key) => {
        let localData = null;
        // 1. 尝试从本地 IndexedDB 读取 (秒开)
        try {
            if (window.idbKeyval) {
                localData = await idbKeyval.get(`cache_${key}`);
                if (localData) {
                    console.log(`🚀 从本地缓存加载成功: ${key}`);
                    // 触发异步云端校验（可选，此处为了性能先返回本地）
                    DB.syncFromCloud(key); 
                    return localData;
                }
            }
        } catch (e) { console.warn("读取本地缓存失败:", e); }

        // 2. 本地无数据，从云端读取
        return await DB.syncFromCloud(key);
    },

    // 从云端强制同步并更新本地
    syncFromCloud: async (key) => {
        if (!sbClient) return null;
        try {
            const { data, error } = await sbClient
                .from('system_data')
                .select('content')
                .eq('key', key)
                .maybeSingle();

            if (error) throw error;

            if (data && data.content) {
                let db = data.content;
                if (typeof db === 'string' && db.startsWith("LZ|")) {
                    if (typeof LZString === 'undefined') {
                        throw new Error('LZString 未加载，无法解压云端内容');
                    }
                    const decompressed = LZString.decompressFromUTF16(db.substring(3));
                    db = JSON.parse(decompressed);
                } else if (typeof db === 'string') {
                    db = JSON.parse(db);
                }

                // 更新本地缓存
                if (window.idbKeyval) await idbKeyval.set(`cache_${key}`, db);
                return db;
            }
        } catch (e) {
            console.error("云端同步失败:", e);
        }
        return null;
    },

    // 清除数据
    clear: async (key) => {
        if (!sbClient) return;
        try {
            await sbClient.from('system_data').delete().eq('key', key);
        } catch(e) {
            console.error("清除数据失败", e);
        }
    }
};

// 🔄 切换届别 (安全修复版)
async function switchCohort(cohortId) {
    if (!cohortId) return;
    const cohortKey = getCohortKey(cohortId);
    const current = localStorage.getItem('CURRENT_PROJECT_KEY') || '';
    if (current === cohortKey) return;

    if(!confirm("⚠️ 正在切换届别档案...\n\n切换前请确保当前工作已保存（数据会自动保存），否则未同步的修改可能丢失。\n\n确定切换吗？")) {
        const selector = document.getElementById('cohort-selector');
        if(selector) selector.value = localStorage.getItem('CURRENT_COHORT_ID') || '';
        return;
    }

    UI.loading(true, "正在从云端拉取 [" + cohortKey + "] 的数据...");
    
    // 1. 记录当前选择的届别
    localStorage.setItem('CURRENT_PROJECT_KEY', cohortKey);
    localStorage.setItem('CURRENT_COHORT_ID', cohortId);
    const label = CURRENT_COHORT_META ? formatCohortLabel(CURRENT_COHORT_META) : `${cohortId}级`;
    const currentLabel = document.getElementById('cohort-current-label');
    if (currentLabel) currentLabel.innerText = label;
    const examCohortLabel = document.getElementById('exam-cohort-label');
    if (examCohortLabel) examCohortLabel.innerText = label;

    // 2. 从云端拉取新届别的数据
    const data = await DB.get(cohortKey);

    if (data) {
        // 3. 恢复数据
        COHORT_DB = data.COHORT_DB || null;
        CURRENT_COHORT_ID = data.CURRENT_COHORT_ID || cohortId;
        CURRENT_COHORT_META = data.CURRENT_COHORT_META || CURRENT_COHORT_META;
        CURRENT_EXAM_ID = data.CURRENT_EXAM_ID || '';

        // 优先使用届别考试快照
        if (COHORT_DB && COHORT_DB.currentExamId && CohortDB.applyExamToWorkspace(COHORT_DB.currentExamId)) {
            // 已加载当前考试快照
        } else {
            RAW_DATA = data.RAW_DATA || [];
            SCHOOLS = data.SCHOOLS || {};
            SUBJECTS = data.SUBJECTS || [];
            THRESHOLDS = data.THRESHOLDS || {};
            setTeacherMap(data.TEACHER_MAP || {});
            CONFIG = data.CONFIG || {};
        }
        scheduleTeacherSyncPrompt();
        
        // ★★★ 关键：恢复账号数据 ★★★
        if(data.AUTH_DB) {
            Auth.db = data.AUTH_DB;
            localStorage.setItem('SYS_USERS', JSON.stringify(Auth.db));
            console.log("✅ 账号已切换为 [" + projectKey + "] 的版本");
        }
        
        // ★★★ 关键：恢复指标参数输入框 (安全检查版) ★★★
        if(data.INDICATOR_PARAMS) {
            const i1 = document.getElementById('ind1');
            const i2 = document.getElementById('ind2');
            // 🟢 修复：先检查元素是否存在，再赋值
            if(i1) i1.value = data.INDICATOR_PARAMS.ind1 || '';
            if(i2) i2.value = data.INDICATOR_PARAMS.ind2 || '';
            
            // 同时更新内存
            if(!window.SYS_VARS) window.SYS_VARS = { indicator: {}, targets: {} };
            window.SYS_VARS.indicator = data.INDICATOR_PARAMS;
        }

        // 恢复其他变量
        if(data.TARGETS) { 
            TARGETS = data.TARGETS;
            if(!window.SYS_VARS) window.SYS_VARS = { indicator: {}, targets: {} };
            window.SYS_VARS.targets = data.TARGETS;
        }
        if(data.PREV_DATA) PREV_DATA = data.PREV_DATA;
        if(data.HISTORY_ARCHIVE) HISTORY_ARCHIVE = data.HISTORY_ARCHIVE;
        if(data.FB_CLASSES) FB_CLASSES = data.FB_CLASSES;
        
        // 4. 刷新界面
        updateSchoolSelect();
        updateMySchoolSelect();
        renderTables();
        
        // 如果有配置名，刷新导航
        const badge = document.getElementById('mode-badge');
        if(badge && CONFIG.name) badge.innerText = CONFIG.name;
        renderNavigation();
        document.getElementById('mode-mask').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');

        CohortDB.renderExamList();
        
        UI.toast(`✅ 已切换到 [${cohortKey}]，数据加载完毕`, "success");
        logAction('届别切换', `已切换到 ${cohortKey}`);
        updateStatusPanel();
    } else {
        // 4. 如果云端没这个届别的数据（新档案）
        RAW_DATA = [];
        SCHOOLS = {};
        SUBJECTS = [];
        THRESHOLDS = {};
        COHORT_DB = {
            cohortId,
            cohortMeta: CURRENT_COHORT_META || null,
            students: {},
            teachingHistory: {},
            exams: {},
            currentExamId: '',
            resetPoints: []
        };
        
        Auth.db = { admin: { pass: 'admin123' }, teachers: [], parents: [] }; 
        localStorage.setItem('SYS_USERS', JSON.stringify(Auth.db));
        
        // 清空指标输入框 (安全检查版)
        const i1 = document.getElementById('ind1');
        const i2 = document.getElementById('ind2');
        // 🟢 修复：先检查元素是否存在，再清空
        if(i1) i1.value = '';
        if(i2) i2.value = '';

        updateSchoolSelect();
        renderTables();
        const grade = computeCohortGrade(CURRENT_COHORT_META, getExamMetaFromUI());
        applyModeByGrade(grade);
        document.getElementById('mode-mask').style.display = 'none';
        document.getElementById('app').classList.remove('hidden');

        CohortDB.renderExamList();
        
        UI.toast(`✨ 已切换到 [${cohortKey}] (新存档)，请开始上传数据`, "info");
        logAction('届别切换', `新建并切换到 ${cohortKey}`);
        updateStatusPanel();
    }
    
    UI.loading(false);
}

// 兼容旧入口
window.switchProject = switchCohort;


// 4. 启动时自动检查恢复 (程序入口)
window.addEventListener('load', async () => {
    
    // ✋ 🔴 [已移除]：删除了 MobApp.init() 的拦截逻辑，确保手机端也继续执行后续的完整初始化流程 🔴

    // 0. 初始化届别选择器状态
    if (typeof CohortManager !== 'undefined') {
        CohortManager.init();
    }
    const selector = document.getElementById('cohort-selector');
    if(selector) selector.value = localStorage.getItem('CURRENT_COHORT_ID') || '';

    // 1. 初始化鉴权 (最先执行)
    if (typeof Auth !== 'undefined') {
        Auth.init();
    }

    // 2. 教程检查
    if(typeof HelpSystem !== 'undefined') {
        HelpSystem.checkFirstRun();
    }
    
    // (setInterval 代码在第一步已经修改过，这里不再重复展示，保持第一步的代码即可)

    // 🟢 分支一：这是分发版 (有内置数据) -> 加载内置数据
    if (window.EMBEDDED_DB) {
        console.log("检测到内置数据包，正在装载...");
        const loader = document.getElementById('global-loader');
        if(loader) loader.classList.add('hidden');
        sessionStorage.removeItem('CURRENT_USER'); 
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('app').classList.add('hidden');
        const db = window.EMBEDDED_DB;
        
        // 恢复内存
        RAW_DATA = db.RAW_DATA || [];
        SCHOOLS = db.SCHOOLS || {};
        SUBJECTS = db.SUBJECTS || [];
        THRESHOLDS = db.THRESHOLDS || {};
        setTeacherMap(db.TEACHER_MAP || {});
        MY_SCHOOL = db.MY_SCHOOL || "";
        CONFIG = db.CONFIG || {};
        
        // 恢复账号 (分发版核心)
        if (db.AUTH_DB) {
            localStorage.setItem('SYS_USERS', JSON.stringify(db.AUTH_DB));
            if (typeof Auth !== 'undefined') Auth.db = db.AUTH_DB;
        }
        
        // 恢复指标参数
        if(db.INDICATOR_PARAMS) {
            setTimeout(() => {
                const i1 = document.getElementById('ind1');
                const i2 = document.getElementById('ind2');
                if(i1) i1.value = db.INDICATOR_PARAMS.ind1 || '';
                if(i2) i2.value = db.INDICATOR_PARAMS.ind2 || '';
            }, 100);
        }
        if(db.TARGETS) window.TARGETS = db.TARGETS;

        // 刷新
        updateSchoolSelect();
        updateMySchoolSelect();
        renderTables();
        document.getElementById('mode-mask').style.display = 'none';
        if(CONFIG.name) renderNavigation();

        UI.toast("✅ 数据已自动加载 (分发版模式)", "success");
    } 
    
    // 🟠 分支二：这是管理员原版 -> 从云端/本地加载
    else {
        // 🔥 关键：读取当前选中的项目 Key
        const currentKey = localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup';
        const backup = await DB.get(currentKey);
        const isForceRestore = localStorage.getItem('SYS_FORCE_RESTORE'); 

        // 定义统一的恢复函数
        const performRestore = async () => {
            Perf.runAsync(async () => {
                // 恢复基础数据
                RAW_DATA = backup.RAW_DATA || [];
                SCHOOLS = backup.SCHOOLS || {};
                SUBJECTS = backup.SUBJECTS || [];
                THRESHOLDS = backup.THRESHOLDS || {};
                setTeacherMap(backup.TEACHER_MAP || {});
                MY_SCHOOL = backup.MY_SCHOOL || "";
                if(backup.CONFIG) CONFIG = backup.CONFIG;
                
                // ★★★ 恢复账号 ★★★
                if (backup.AUTH_DB) {
                    Auth.db = backup.AUTH_DB;
                    localStorage.setItem('SYS_USERS', JSON.stringify(Auth.db));
                    console.log("✅ 账号信息已同步");
                }

                // ★★★ 恢复指标参数 (修复版) ★★★
                if(backup.INDICATOR_PARAMS) {
                    // 1. 核心修复：必须更新全局内存变量！
                    // 这样当你打开管理面板时，switchTab 才能读取到正确的值
                    if (!window.SYS_VARS) window.SYS_VARS = { indicator: {}, targets: {} };
                    window.SYS_VARS.indicator = backup.INDICATOR_PARAMS;

                    // 2. 尝试回填到 DOM (使用正确的新 ID: dm_ind..._input)
                    // 使用 setTimeout 确保模态框DOM已就绪
                    setTimeout(() => {
                        const dm1 = document.getElementById('dm_ind1_input');
                        const dm2 = document.getElementById('dm_ind2_input');
                                                    
                        if(dm1) dm1.value = backup.INDICATOR_PARAMS.ind1 || '';
                        if(dm2) dm2.value = backup.INDICATOR_PARAMS.ind2 || '';
                                                    
                    }, 500);

                    console.log("✅ [自动恢复] 指标参数已加载到内存:", window.SYS_VARS.indicator);
                }
                if(backup.TARGETS) TARGETS = backup.TARGETS;
                
                // 恢复其他
                if(backup.PREV_DATA) PREV_DATA = backup.PREV_DATA;
                if(backup.HISTORY_ARCHIVE) HISTORY_ARCHIVE = backup.HISTORY_ARCHIVE;
                
                // 刷新界面
                const modeMask = document.getElementById('mode-mask');
                const appRoot = document.getElementById('app');
                if (modeMask) modeMask.style.display = 'none';
                if (appRoot) appRoot.classList.remove('hidden');
                
                if(CONFIG.name) {
                    document.getElementById('mode-badge').innerText = CONFIG.name;
                    document.getElementById('mode-info').innerText = `${CONFIG.name}模式`;
                    renderNavigation();
                }
                
                updateSchoolSelect(); 
                updateMySchoolSelect();
                // 👈 修复位置：添加 null 检查，防止元素不存在时报错
                const mySchoolSelect = document.getElementById('mySchoolSelect');
                if(MY_SCHOOL && mySchoolSelect) mySchoolSelect.value = MY_SCHOOL;
                
                renderTables();
                if(MY_SCHOOL) generateTeacherInputs();

                UI.toast(`✅ 已加载项目：[${currentKey}]`, 'success');
            }, "正在加载数据...");
        };

        if (isForceRestore === 'true' && backup && backup.RAW_DATA) {
            localStorage.removeItem('SYS_FORCE_RESTORE'); 
            await performRestore(); 
        } 
        else if (backup && backup.RAW_DATA && backup.RAW_DATA.length > 0 && RAW_DATA.length === 0) {
            // 如果发现有缓存，且非首次空加载
            await performRestore();
        } 
        else {
            // 无数据，显示初始模式选择
            const modeMask = document.getElementById('mode-mask');
            if (modeMask) modeMask.style.display = 'flex';
        }
    }
});


// 性能优化工具
const Perf = {
    // 异步任务包装器：解决点击按钮后界面“假死”的问题
    runAsync: (fn, loadingText) => {
        UI.loading(true, loadingText);
        // 利用 setTimeout 将任务推到下一帧，让 UI 先渲染出 Loading
        setTimeout(async () => {
            try {
                await fn();
            } catch (e) {
                console.error(e);
                UI.toast("发生错误: " + e.message, 'error');
            } finally {
                UI.loading(false);
            }
        }, 50);
    },
    // 高性能列表渲染：解决 += HTML 导致的卡顿
    renderList: (data, templateFn) => {
        if(!data || !data.length) return '';
        return data.map(templateFn).join('');
    }
};
// ================= 全局变量 =================
let CONFIG = { 
    name: '6-8年级', 
    label: '全科总', 
    excRate: 0.05, 
    totalSubs: 'auto', 
    analysisSubs: 'auto', 
    showQuery: true,
    mode: 'multi'
};
let RAW_DATA = [], SCHOOLS = {}, SUBJECTS = [], THRESHOLDS = {}, TARGETS = {};
// 🟢 [修复]：全局变量显式挂载到 window，确保 CloudManager 可访问
var TEACHER_MAP = {}, MY_SCHOOL = "", TEACHER_STATS = {}; 
window.TEACHER_MAP = TEACHER_MAP;
window.MY_SCHOOL = MY_SCHOOL;
window.TEACHER_STATS = TEACHER_STATS;

const AI_DISABLED = true;
function aiDisabledAlert() {
    if (window.UI) UI.toast('AI 功能已移除', 'warning');
    else alert('AI 功能已移除');
    return true;
}

function uiAlert(message, type = 'info') {
    if (window.Swal) {
        return Swal.fire({
            title: type === 'error' ? '出错了' : (type === 'warning' ? '提示' : '提示'),
            text: message,
            icon: type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'info'),
            confirmButtonText: '知道了'
        });
    }
    if (window.UI) {
        const map = { error: 'error', warning: 'warning', info: 'info' };
        UI.toast(message, map[type] || 'info');
        return;
    }
    alert(message);
}

function setTeacherMap(map) {
    TEACHER_MAP = map || {};
    window.TEACHER_MAP = TEACHER_MAP;
    return TEACHER_MAP;
}

let COHORT_DB = null;
let CURRENT_COHORT_ID = '';
let CURRENT_COHORT_META = null;
let CURRENT_EXAM_ID = '';
window.switchMobileTab = function(tabName) {
    const app = document.getElementById('mobile-app');
    // 兼容 Alpine V3 的写法
    if (app && window.Alpine) {
        Alpine.$data(app).activeTab = tabName;
    } else {
        console.error("Alpine 未加载或元素不存在");
    }
};
let TEACHER_TOWNSHIP_RANKINGS = {}; MARGINAL_STUDENTS = {}; 
let POTENTIAL_STUDENTS_CACHE = []; TOWNSHIP_RANKING_DATA = {}; 
let radarChartInstance = null; 
let segmentChartInstance = null; // 新增：分数段直方图实例
let trendChartInstance = null; // 进退步趋势图实例
let TEACHER_STAMP_BASE64 = "";
// 存储结构: { "学校_姓名": [ {exam:"初一上", rank:100}, {exam:"初一下", rank:50} ... ] }
let HISTORY_ARCHIVE = {}; 
let ROLLER_COASTER_STUDENTS = []; // 存储波动剧烈的学生名单
let historyChartInstance = null;
let LLM_CONFIG = {
    apiKey: localStorage.getItem('LLM_API_KEY') || '',
    baseURL: localStorage.getItem('LLM_BASE_URL') || 'https://api.deepseek.com',
    model: localStorage.getItem('LLM_MODEL') || 'deepseek-chat',
    systemPrompt: "你是一位经验丰富、语调温和的初中班主任。请根据学生数据写评语，多鼓励，指出具体优缺点。",
    source: 'cloud' // 新增字段：cloud | local
};

// 1. 本地引擎状态管理
let LOCAL_ENGINE = null;
let IS_LOCAL_LOADING = false;

// 2. 切换 AI 来源 (UI 交互)
function toggleAISource() {
    if (AI_DISABLED) return aiDisabledAlert();
    const source = document.querySelector('input[name="ai_source"]:checked').value;
    LLM_CONFIG.source = source;
    if(source === 'cloud') {
        document.getElementById('ai-config-cloud').classList.remove('hidden');
        document.getElementById('ai-config-local').classList.add('hidden');
    } else {
        document.getElementById('ai-config-cloud').classList.add('hidden');
        document.getElementById('ai-config-local').classList.remove('hidden');
        // 检查浏览器是否支持 WebGPU
        if (!navigator.gpu) {
            document.getElementById('local-ai-status').innerHTML = '<span style="color:red">❌ 您的浏览器不支持 WebGPU，无法使用本地 AI。请尝试升级 Chrome/Edge 浏览器。</span>';
        }
    }
}

// 3. 初始化本地模型 (WebLLM 核心)
async function initLocalModel() {
    if(IS_LOCAL_LOADING) return;
    if(!window.webllm) return alert("WebLLM 库尚未加载完成，请检查网络或刷新页面");

    // 尝试等待模块加载（如果是异步导入）
    if (!window.webllm) {
        try {
            // 动态再次导入尝试，确保模块就绪
            const loadedModule = await import("https://esm.run/@mlc-ai/web-llm");
            window.webllm = loadedModule;
        } catch (e) {
            console.error("WebLLM module load failed:", e);
            return alert("WebLLM AI 引擎加载失败。请检查网络连接（需要访问 jsdelivr CDN）。");
        }
    }

    const modelId = document.getElementById('local_model_select').value;
    IS_LOCAL_LOADING = true;
    
    const statusEl = document.getElementById('local-ai-status');
    const progressEl = document.getElementById('local-ai-progress');
    const btn = document.querySelector('button[onclick="initLocalModel()"]');
    
    btn.disabled = true;
    btn.innerHTML = '⏳ 加载中...';

    try {
        // 定义加载进度回调
        const initProgressCallback = (report) => {
            console.log(report); // 控制台调试
            statusEl.innerText = report.text; // 显示具体阶段
            // 解析进度 (WebLLM返回 0.0 ~ 1.0)
            const pct = Math.round(report.progress * 100);
            progressEl.style.width = `${pct}%`;
        };

        // 如果已有引擎实例，先卸载释放显存
        if (LOCAL_ENGINE) { await LOCAL_ENGINE.unload(); }

        // 创建引擎实例
        LOCAL_ENGINE = new window.webllm.MLCEngine();
        
        // 开始加载模型
        await LOCAL_ENGINE.reload(modelId, { initProgressCallback });
        
        statusEl.innerHTML = '✅ 模型加载完毕！现在可以断网使用了。';
        progressEl.style.background = '#16a34a';
        UI.toast('本地 AI 引擎就绪', 'success');
    } catch (err) {
        console.error(err);
        statusEl.innerHTML = `<span style="color:red">❌ 加载失败: ${err.message}</span>`;
        alert("本地模型加载失败。\n可能原因：显存不足、网络中断或浏览器不支持 WebGPU。\n建议切换回云端 API 模式。");
    } finally {
        IS_LOCAL_LOADING = false;
        btn.disabled = false;
        btn.innerHTML = '⬇️ 重新加载';
    }
}

// 4. 统一 AI 调用接口 (自动路由)
async function callUnifiedAI(prompt, onChunk) {
    if (AI_DISABLED) throw new Error('AI 功能已移除');
    // --- 分支 A: 本地模型 ---
    if (LLM_CONFIG.source === 'local') {
        if (!LOCAL_ENGINE) return alert("请先在【数据枢纽 -> AI配置】中加载本地模型！");
        
        try {
            const completion = await LOCAL_ENGINE.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                stream: true, // 强制流式输出
            });

            let fullText = "";
            for await (const chunk of completion) {
                const delta = chunk.choices[0].delta.content;
                if (delta) {
                    fullText += delta;
                    if (onChunk) onChunk(delta);
                }
            }
            return fullText;
        } catch (err) {
            console.error("Local AI Error", err);
            throw new Error("本地推理出错: " + err.message);
        }
    } 
    // --- 分支 B: 云端 API ---
    else {
        return new Promise((resolve, reject) => {
            let fullResponse = "";
            // 复用之前的 callLLM 逻辑，但包裹在 Promise 中
            callLLM(prompt, 
                (chunk) => { // onChunk
                    fullResponse += chunk;
                    if (onChunk) onChunk(chunk);
                }, 
                (finalText) => { // onFinish
                    if(finalText.includes("(请求失败)")) reject(new Error("API请求失败"));
                    else resolve(finalText);
                }
            );
        });
    }
}
