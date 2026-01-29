// === 届别管理 (Cohort) ===
const COHORT_STORAGE_KEY = 'COHORT_LIST';

function getCohortKey(cohortId) {
    return `cohort::${cohortId}`;
}

function formatCohortLabel(meta) {
    if (!meta || !meta.year) return '未选择';
    return `${meta.year}级 (六年级入学)`;
}

function computeCohortGrade(meta, examMeta) {
    if (!meta || !meta.year) return '';
    const startGrade = 6;
    const entryYear = parseInt(meta.year);
    const baseYear = getAcademicYearStart(examMeta);
    if (!baseYear || isNaN(entryYear)) return '';
    const offset = baseYear - entryYear;
    const grade = startGrade + offset;
    return grade < 1 ? '' : grade;
}

function getAcademicYearStart(examMeta) {
    if (!examMeta || !examMeta.year) return new Date().getMonth() + 1 >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const parts = String(examMeta.year).split('-');
    const start = parseInt(parts[0]);
    return isNaN(start) ? new Date().getFullYear() : start;
}

function getTermId(meta) {
    if (!meta) return '';
    const grade = meta.grade || computeCohortGrade(CURRENT_COHORT_META, meta) || '';
    const term = meta.term || '';
    return grade ? `${grade}年级_${term}` : term;
}

function getExamLabelForKey(meta) {
    if (!meta) return '';
    const cohort = meta.cohortId ? `${meta.cohortId}级` : '';
    const grade = meta.grade ? `${meta.grade}年级` : '';
    const year = meta.year || '';
    const term = meta.term || '';
    const type = meta.type || '';
    const date = meta.date || '';
    const name = meta.name || '';
    return [cohort, grade, year, term, type, date, name].filter(Boolean).join('_');
}

function refreshExamYearOptions(entryYear) {
    const sel = document.getElementById('exam-year');
    if (!sel) return;
    const yearNum = parseInt(entryYear);
    if (!yearNum) return;
    const years = [];
    for (let y = yearNum; y <= yearNum + 3; y++) {
        years.push(`${y}-${y + 1}`);
    }
    const current = sel.value;
    sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (current && years.includes(current)) sel.value = current;
    else sel.value = years[0];
}

function getUserCohortPrefKey() {
    const user = Auth?.currentUser;
    if (!user) return '';
    return `LAST_COHORT_${user.name || 'user'}_${user.role || 'role'}`;
}

function rememberUserCohort(cohortId) {
    const key = getUserCohortPrefKey();
    if (!key) return;
    localStorage.setItem(key, cohortId);
}

function applyUserCohortPreference() {
    const key = getUserCohortPrefKey();
    if (!key) return;
    const saved = localStorage.getItem(key);
    if (saved) {
        CohortManager.switchTo(saved);
    } else {
        showCohortPicker();
    }
}

function showCohortPicker() {
    const mask = document.getElementById('mode-mask');
    const app = document.getElementById('app');
    if (mask) mask.style.display = 'flex';
    if (app) app.classList.add('hidden');
}

function resetCohortSelection() {
    localStorage.removeItem('CURRENT_COHORT_ID');
    localStorage.removeItem('CURRENT_COHORT_META');
    localStorage.removeItem('CURRENT_EXAM_ID');
    localStorage.removeItem('CURRENT_TERM_ID');
    CURRENT_COHORT_ID = '';
    CURRENT_COHORT_META = null;
    CURRENT_EXAM_ID = '';
    showCohortPicker();
}

function getActiveGrade() {
    const metaStr = localStorage.getItem('ARCHIVE_META');
    if (metaStr) {
        try {
            const meta = JSON.parse(metaStr);
            if (meta && meta.grade) return meta.grade;
        } catch (e) {}
    }
    if (CURRENT_COHORT_META) {
        const guess = computeCohortGrade(CURRENT_COHORT_META, getExamMetaFromUI());
        if (guess) return guess;
    }
    if (CONFIG.name && CONFIG.name.includes('9')) return 9;
    if (CONFIG.name && CONFIG.name.includes('8')) return 8;
    if (CONFIG.name && CONFIG.name.includes('7')) return 7;
    return 6;
}

function applyModeByGrade(grade) {
    const isGrade9 = String(grade) === '9';
    if (isGrade9) {
        CONFIG = { name: '9年级', label: '五科总', excRate: 0.06, totalSubs: ['语文','数学','英语','物理','化学'], analysisSubs: ['语文','数学','英语','物理','化学','政治'], showQuery: true, mode: CONFIG.mode || 'multi' };
    } else {
        CONFIG = { name: '6-8年级', label: '全科总', excRate: 0.05, totalSubs: 'auto', analysisSubs: 'auto', showQuery: true, mode: CONFIG.mode || 'multi' };
    }
    const badge = document.getElementById('mode-badge');
    if (badge) badge.innerText = CONFIG.name;
    const info = document.getElementById('mode-info');
    if (info) info.innerText = `${CONFIG.name}模式 (总分: ${CONFIG.label}, 后1/3剔除: ${CONFIG.excRate*100}%)`;
    document.querySelectorAll('.label-total').forEach(e => e.innerText = CONFIG.label);
    const excEl = document.getElementById('label-exc');
    if (excEl) excEl.innerText = (CONFIG.excRate*100) + '%';
    renderNavigation();
}

const CohortManager = {
    list: [],

    load: function() {
        try {
            this.list = JSON.parse(localStorage.getItem(COHORT_STORAGE_KEY) || '[]');
            this.list.forEach(c => { c.startGrade = 6; });
        } catch (e) {
            this.list = [];
        }
    },

    save: function() {
        localStorage.setItem(COHORT_STORAGE_KEY, JSON.stringify(this.list));
    },

    renderSelector: function() {
        const sel = document.getElementById('cohort-selector');
        if (!sel) return;
        const current = localStorage.getItem('CURRENT_COHORT_ID') || '';
        sel.innerHTML = '<option value="">📂 请选择届别</option>' + this.list.map(c => {
            const label = formatCohortLabel(c);
            return `<option value="${c.id}">${label}</option>`;
        }).join('');
        if (current) sel.value = current;
        sel.onchange = () => {
            if (sel.value) {
                this.switchTo(sel.value);
                setTimeout(() => scheduleTeacherSyncPrompt(), 1200);
            }
        };
    },

    addFromUI: function() {
        const year = parseYearFromInput('cohort-year');
        const startGrade = 6;
        if (!year || year < 2000) return alert('请输入有效的入学年份');
        this.addCohort({ year, startGrade });
    },

    addCohort: function({ year, startGrade }) {
        const id = String(year);
        if (this.list.some(c => c.id === id)) {
            return this.switchTo(id);
        }
        const meta = { id, year, startGrade, createdAt: Date.now() };
        this.list.unshift(meta);
        this.save();
        this.renderSelector();
        this.switchTo(id);
    },

    switchTo: function(cohortId) {
        if (!cohortId) return;
        const meta = this.list.find(c => c.id === cohortId);
        if (!meta) return alert('未找到该届别');
        CURRENT_COHORT_ID = cohortId;
        CURRENT_COHORT_META = meta;
        localStorage.setItem('CURRENT_COHORT_ID', cohortId);
        localStorage.setItem('CURRENT_COHORT_META', JSON.stringify(meta));
        rememberUserCohort(cohortId);
        const label = formatCohortLabel(meta);
        const status = document.getElementById('cohort-status');
        if (status) status.innerText = `已切换至 ${label}`;
        const currentLabel = document.getElementById('cohort-current-label');
        if (currentLabel) currentLabel.innerText = label;
        const examCohortLabel = document.getElementById('exam-cohort-label');
        if (examCohortLabel) examCohortLabel.innerText = label;
        refreshExamYearOptions(meta.year);
        this.renderSelector();
        switchCohort(cohortId);
        setTimeout(() => {
            scheduleTeacherSyncPrompt();
        }, 1200);
    },

    init: function() {
        this.load();
        const saved = localStorage.getItem('CURRENT_COHORT_ID');
        if (saved) {
            const metaStr = localStorage.getItem('CURRENT_COHORT_META');
            if (metaStr) {
                try { CURRENT_COHORT_META = JSON.parse(metaStr); } catch (e) {}
            }
            CURRENT_COHORT_ID = saved;
        }
        if (CURRENT_COHORT_META) CURRENT_COHORT_META.startGrade = 6;
        this.renderSelector();
        if (CURRENT_COHORT_META) {
            const currentLabel = document.getElementById('cohort-current-label');
            if (currentLabel) currentLabel.innerText = formatCohortLabel(CURRENT_COHORT_META);
            const examCohortLabel = document.getElementById('exam-cohort-label');
            if (examCohortLabel) examCohortLabel.innerText = formatCohortLabel(CURRENT_COHORT_META);
        }
    }
};

function enterCohortFromMask() {
    const year = parseYearFromInput('entry-cohort-year');
    const startGrade = 6;
    if (!year || year < 2000) return alert('请输入有效的入学年份');
    CohortManager.addCohort({ year, startGrade });
    document.getElementById('mode-mask').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    setTimeout(() => {
        scheduleTeacherSyncPrompt();
    }, 1200);
}

function parseYearFromInput(id) {
    const val = document.getElementById(id)?.value || '';
    return parseInt(val, 10);
}

// === 考试档案化与封存逻辑 ===
function buildExamKey(meta) {
    const cohortLabel = meta.cohortId ? `${meta.cohortId}级` : '未知届别';
    const gradeLabel = meta.grade ? `${meta.grade}年级` : '未知年级';
    const base = `${cohortLabel}-${gradeLabel}-${meta.year}-${meta.term}-${meta.type}` + (meta.date ? `-${meta.date}` : '');
    return meta.name ? `${base}-${meta.name}` : base;
}

function getExamMetaFromUI() {
    const year = document.getElementById('exam-year')?.value || '';
    const term = document.getElementById('exam-term')?.value || '';
    const type = document.getElementById('exam-type')?.value || '';
    const date = document.getElementById('exam-date')?.value || '';
    const name = (document.getElementById('exam-name')?.value || '').trim();
    const resetPoint = document.getElementById('exam-reset-point')?.checked || false;
    const cohortId = CURRENT_COHORT_ID || '';
    const cohortMeta = CURRENT_COHORT_META || null;
    const grade = computeCohortGrade(cohortMeta, { year, term, type, name, date });
    return { year, term, type, name, date, cohortId, grade, resetPoint };
}

function refreshExamGradePreview() {
    const meta = getExamMetaFromUI();
    const gradeEl = document.getElementById('exam-grade-label');
    if (gradeEl) gradeEl.textContent = meta.grade || '-';
}

function setCurrentExamMeta() {
    const meta = getExamMetaFromUI();
    if (!meta.cohortId) return alert("请先选择届别");
    if (!meta.year || !meta.term || !meta.type) return alert("请完整选择学年/学期/考试类型");
    if (!meta.date) return alert("请填写考试日期");
    const key = buildExamKey(meta);
    CURRENT_EXAM_ID = key;
    localStorage.setItem('CURRENT_EXAM_ID', key);
    localStorage.setItem('ARCHIVE_META', JSON.stringify(meta));
    if (COHORT_DB) COHORT_DB.currentExamId = key;
    applyModeByGrade(meta.grade);
    applyExamMetaUI();
    CohortDB.renderExamList();
    if(window.UI) UI.toast(`✅ 当前考试已设置: ${key}`, 'success');
}

function applyExamMetaUI() {
    const metaStr = localStorage.getItem('ARCHIVE_META');
    let meta = null;
    if (metaStr) {
        try {
            meta = JSON.parse(metaStr);
            const yearEl = document.getElementById('exam-year');
            const termEl = document.getElementById('exam-term');
            const typeEl = document.getElementById('exam-type');
            const dateEl = document.getElementById('exam-date');
            const nameEl = document.getElementById('exam-name');
            const resetEl = document.getElementById('exam-reset-point');
            if (yearEl && meta.year) yearEl.value = meta.year;
            if (termEl && meta.term) termEl.value = meta.term;
            if (typeEl && meta.type) typeEl.value = meta.type;
            if (dateEl && meta.date) dateEl.value = meta.date;
            if (nameEl && meta.name) nameEl.value = meta.name;
            if (resetEl) resetEl.checked = !!meta.resetPoint;
            if (CURRENT_COHORT_META) {
                const recalculated = computeCohortGrade(CURRENT_COHORT_META, meta);
                if (recalculated && meta.grade !== recalculated) {
                    meta.grade = recalculated;
                    localStorage.setItem('ARCHIVE_META', JSON.stringify(meta));
                }
            }
        } catch(e) {}
    }
    const key = localStorage.getItem('CURRENT_EXAM_ID') || '未设置';
    const keyEl = document.getElementById('exam-key-display');
    if (keyEl) keyEl.textContent = key;
    const gradeEl = document.getElementById('exam-grade-label');
    if (gradeEl) gradeEl.textContent = meta ? (meta.grade || '-') : '-';
    const cohortLabel = document.getElementById('exam-cohort-label');
    if (cohortLabel) {
        if (CURRENT_COHORT_META) cohortLabel.textContent = formatCohortLabel(CURRENT_COHORT_META);
        else if (meta && meta.cohortId) cohortLabel.textContent = `${meta.cohortId}级`;
        else cohortLabel.textContent = '未选择';
    }
    if (CURRENT_COHORT_META?.year) refreshExamYearOptions(CURRENT_COHORT_META.year);
    const statusEl = document.getElementById('exam-archive-status');
    if (statusEl) statusEl.textContent = isArchiveLocked() ? '已封存(只读)' : '未封存';
    refreshExamGradePreview();
    updateIndicatorUIState();
}

function isArchiveLocked() {
    const locked = localStorage.getItem('ARCHIVE_LOCKED') === 'true';
    const lockedKey = localStorage.getItem('ARCHIVE_LOCKED_KEY');
    const currentKey = localStorage.getItem('CURRENT_EXAM_ID');
    return locked && lockedKey && currentKey && lockedKey === currentKey;
}

async function archiveCurrentExam() {
    if (!RAW_DATA.length) return alert("当前无成绩数据，无法封存");
    if (isArchiveLocked()) return alert("当前考试已封存，无需重复操作");
    if (!confirm("⚠️ 封存后将进入只读模式，避免误改历史数据。确定封存吗？")) return;

    const meta = getExamMetaFromUI();
    if (!meta.year || !meta.term || !meta.type) return alert("请先设置学年/学期/考试类型");
    const key = buildExamKey(meta);
    localStorage.setItem('CURRENT_EXAM_ID', key);
    localStorage.setItem('ARCHIVE_META', JSON.stringify(meta));
    if (COHORT_DB) COHORT_DB.currentExamId = key;

    // 保存并生成快照
    await saveCloudData();
    createAutoSnapshot(getCurrentSnapshotPayload());

    localStorage.setItem('ARCHIVE_LOCKED', 'true');
    localStorage.setItem('ARCHIVE_LOCKED_KEY', key);
    applyExamMetaUI();
    applyArchiveLockUI();
    if(window.UI) UI.toast("✅ 已封存并进入只读模式", "success");
    if(window.Logger) Logger.log('封存考试', `封存考试 ${key}`);
}

function unlockArchive() {
    if (!isArchiveLocked()) return alert("当前未封存");
    if (!confirm("⚠️ 解除封存将允许编辑历史数据，是否继续？")) return;
    localStorage.setItem('ARCHIVE_LOCKED', 'false');
    localStorage.removeItem('ARCHIVE_LOCKED_KEY');
    applyExamMetaUI();
    applyArchiveLockUI();
    if(window.UI) UI.toast("✅ 已解除封存", "success");
    if(window.Logger) Logger.log('解除封存', '解除封存只读模式');
}

function applyArchiveLockUI() {
    const locked = isArchiveLocked();
    const lockNotice = locked ? '⛔ 当前考试已封存，只读模式' : '';
    const statusEl = document.getElementById('exam-archive-status');
    if (statusEl) statusEl.textContent = locked ? '已封存(只读)' : '未封存';

    const uploadBox = document.getElementById('uploadBox');
    if (uploadBox) {
        uploadBox.style.pointerEvents = locked ? 'none' : 'auto';
        uploadBox.style.opacity = locked ? '0.6' : '1';
        uploadBox.title = lockNotice;
    }
    const ids = ['fileInput','teacherFileInput','projectFileInput','btn-reset-system','btn-save-project','btn-load-project'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = !!locked;
    });
}

// === Cohort DB & Smart Link ===
const CohortDB = {
    ensure: function() {
        if (!COHORT_DB) {
            COHORT_DB = {
                cohortId: CURRENT_COHORT_ID || '',
                cohortMeta: CURRENT_COHORT_META || null,
                students: {},
                teachingHistory: {},
                exams: {},
                currentExamId: CURRENT_EXAM_ID || '',
                resetPoints: []
            };
        }
        return COHORT_DB;
    },

    renderExamList: function() {
        const sel = document.getElementById('exam-history-select');
        if (!sel) return;
        const db = this.ensure();
        const exams = Object.values(db.exams || {});
        if (!exams.length) {
            sel.innerHTML = '<option value="">暂无历史考试</option>';
            return;
        }
        exams.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        sel.innerHTML = exams.map(ex => `<option value="${ex.examId}">${ex.examId}</option>`).join('');
        if (db.currentExamId) sel.value = db.currentExamId;
    },

    loadExamFromSelect: function() {
        const sel = document.getElementById('exam-history-select');
        if (!sel || !sel.value) return;
        const examId = sel.value;
        const ok = this.applyExamToWorkspace(examId);
        if (ok) {
            applyExamMetaUI();
            renderTables();
            updateSchoolSelect();
            updateMySchoolSelect();
            updateStudentSchoolSelect();
            updateMarginalSchoolSelect();
            updateClassSelect();
            updateSegmentSelects();
            updateClassCompSchoolSelect();
            updatePotentialSchoolSelect();
            updateDiagnosisSelects();
            updateCorrelationSchoolSelect();
            updateSeatAdjSelects();
            updateProgressSchoolSelect();
            updateMutualAidSelects();
            updateMpSchoolSelect();
            UI.toast('✅ 已切换到历史考试', 'success');
        }
    },

    syncCurrentExam: async function() {
        if (!CURRENT_COHORT_ID) return;
        if (!CURRENT_EXAM_ID) setCurrentExamMeta();
        if (!CURRENT_EXAM_ID) return;

        const meta = getExamMetaFromUI();
        const db = this.ensure();
        const examId = CURRENT_EXAM_ID;

        await this.smartLinkStudents(examId, meta);

        db.exams[examId] = {
            examId,
            meta,
            data: JSON.parse(JSON.stringify(RAW_DATA || [])),
            teacherMap: JSON.parse(JSON.stringify(TEACHER_MAP || {})),
            subjects: JSON.parse(JSON.stringify(SUBJECTS || [])),
            thresholds: JSON.parse(JSON.stringify(THRESHOLDS || {})),
            config: JSON.parse(JSON.stringify(CONFIG || {})),
            createdAt: Date.now()
        };
        db.currentExamId = examId;
        const termId = getTermId(meta);
        if (termId) {
            db.teachingHistory = db.teachingHistory || {};
            db.teachingHistory[termId] = JSON.parse(JSON.stringify(TEACHER_MAP || {}));
        }
        this.renderExamList();
        if (meta.resetPoint) {
            db.resetPoints = db.resetPoints || [];
            if (!db.resetPoints.includes(examId)) db.resetPoints.push(examId);
        }
    },

    applyExamToWorkspace: function(examId) {
        const db = this.ensure();
        const exam = db.exams?.[examId];
        if (!exam) return false;
        RAW_DATA = exam.data || [];
        SUBJECTS = exam.subjects || [];
        THRESHOLDS = exam.thresholds || {};
        CONFIG = exam.config || CONFIG;
        setTeacherMap(exam.teacherMap || {});
        CURRENT_EXAM_ID = examId;
        localStorage.setItem('CURRENT_EXAM_ID', examId);
        localStorage.setItem('ARCHIVE_META', JSON.stringify(exam.meta || {}));
        const termId = getTermId(exam.meta || {});
        if (termId) localStorage.setItem('CURRENT_TERM_ID', termId);
        applyModeByGrade(exam.meta?.grade);
        return true;
    },

    smartLinkStudents: async function(examId, meta) {
        const db = this.ensure();
        const roster = db.students || {};
        const nameIndex = {};

        Object.values(roster).forEach(stu => {
            if (!nameIndex[stu.name]) nameIndex[stu.name] = [];
            nameIndex[stu.name].push(stu);
        });

        const conflicts = [];

        RAW_DATA.forEach(stu => {
            const name = String(stu.name || '').trim();
            if (!name) return;
            const candidates = nameIndex[name] || [];
            if (candidates.length === 0) {
                const uuid = this.createUUID();
                const rec = {
                    uuid,
                    name,
                    status: 'transfer_in',
                    history: [],
                    lastScore: null,
                    lastExamId: null
                };
                roster[uuid] = rec;
                stu.uuid = uuid;
            } else if (candidates.length === 1) {
                const target = candidates[0];
                stu.uuid = target.uuid;
            } else {
                conflicts.push({ current: stu, candidates });
            }
        });

        if (conflicts.length) {
            await this.resolveConflicts(conflicts);
        }

        RAW_DATA.forEach(stu => {
            if (!stu.uuid) return;
            const rec = roster[stu.uuid];
            if (!rec) return;
            rec.name = stu.name;
            rec.lastScore = typeof stu.total === 'number' ? stu.total : null;
            rec.lastExamId = examId;
            rec.history = rec.history || [];
            rec.history.push({ examId, class: stu.class, school: stu.school, total: stu.total });
        });

        db.students = roster;
    },

    resolveConflicts: async function(conflicts) {
        const db = this.ensure();
        for (const item of conflicts) {
            const current = item.current;
            const candidates = item.candidates || [];
            const options = {};
            const currentScore = current.total || 0;
            const sorted = candidates.slice().sort((a, b) => {
                const da = Math.abs((a.lastScore ?? 0) - currentScore);
                const db = Math.abs((b.lastScore ?? 0) - currentScore);
                return da - db;
            });

            sorted.forEach((c, idx) => {
                const label = `原${c.history?.slice(-1)[0]?.class || c.lastClass || '-'}班 ${c.name} (上次${c.lastScore ?? '-'})${idx === 0 ? ' —— 系统推荐' : ''}`;
                options[c.uuid] = label;
            });
            options['NEW'] = '以上都不是（新增转学生）';

            const result = await Swal.fire({
                title: '⚠️ 检测到重名冲突',
                html: `您上传了 ${current.class || '-'}班 的 ${current.name} (本次${currentScore}分)，请选择其历史身份：`,
                input: 'radio',
                inputOptions: options,
                inputValidator: value => !value ? '请选择一个匹配项' : undefined,
                confirmButtonText: '确认匹配',
                confirmButtonColor: '#4f46e5',
                showCancelButton: true,
                cancelButtonText: '设为新增'
            });

            const chosen = result.isConfirmed ? result.value : 'NEW';
            if (chosen === 'NEW') {
                const uuid = this.createUUID();
                db.students[uuid] = {
                    uuid,
                    name: current.name,
                    status: 'transfer_in',
                    history: [],
                    lastScore: null,
                    lastExamId: null
                };
                current.uuid = uuid;
            } else {
                current.uuid = chosen;
            }
        }
    },

    createUUID: function() {
        return 'stu_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
};

const CohortGrowth = {
    cache: { volatility: [], growth: [] },

    render: function() {
        if (!COHORT_DB || !COHORT_DB.exams || Object.keys(COHORT_DB.exams).length === 0) {
            return alert('当前届别暂无历史考试数据');
        }
        const result = this.compute();
        this.cache = result;
        this.renderVolatility(result.volatility);
        this.renderGrowth(result.growth);
    },

    compute: function() {
        const exams = Object.values(COHORT_DB.exams || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        const studentSeries = {};

        exams.forEach(exam => {
            const data = exam.data || [];
            const totals = data.map(s => Number(s.total)).filter(v => !isNaN(v));
            if (!totals.length) return;
            const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
            const variance = totals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / totals.length;
            const std = Math.sqrt(variance) || 1;

            const sorted = data.slice().sort((a, b) => (b.total || 0) - (a.total || 0));
            const rankMap = new Map();
            sorted.forEach((s, idx) => {
                const key = this.getStudentKey(s);
                if (!rankMap.has(key)) rankMap.set(key, idx + 1);
            });

            data.forEach(s => {
                const key = this.getStudentKey(s);
                if (!studentSeries[key]) studentSeries[key] = { name: s.name, class: s.class, z: [], p: [] };
                studentSeries[key].name = s.name || studentSeries[key].name;
                studentSeries[key].class = s.class || studentSeries[key].class;
                const z = (Number(s.total) - mean) / std;
                const rank = rankMap.get(key) || null;
                const p = rank && sorted.length > 1 ? (1 - (rank - 1) / (sorted.length - 1)) : 0.5;
                studentSeries[key].z.push(z);
                studentSeries[key].p.push(p);
            });
        });

        const volatility = [];
        const growth = [];

        Object.values(studentSeries).forEach(s => {
            if (s.z.length >= 4) {
                const sigma = this.std(s.z);
                volatility.push({ name: s.name, class: s.class, count: s.z.length, sigma });
            }
            if (s.p.length >= 2) {
                const start = s.p[0];
                const end = s.p[s.p.length - 1];
                const delta = end - start;
                growth.push({ name: s.name, class: s.class, start, end, delta });
            }
        });

        volatility.sort((a, b) => b.sigma - a.sigma);
        growth.sort((a, b) => b.delta - a.delta);

        return { volatility: volatility.slice(0, 50), growth: growth.slice(0, 50) };
    },

    renderVolatility: function(list) {
        const tbody = document.querySelector('#cohort-volatility-table tbody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999; padding:20px;">暂无足够数据</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => `
            <tr>
                <td>${s.name}</td>
                <td>${s.class || '-'}</td>
                <td>${s.count}</td>
                <td style="font-weight:bold; color:#0ea5e9;">${s.sigma.toFixed(2)}</td>
            </tr>
        `).join('');
    },

    renderGrowth: function(list) {
        const tbody = document.querySelector('#cohort-growth-table tbody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:20px;">暂无足够数据</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const delta = s.delta;
            const color = delta >= 0 ? '#16a34a' : '#dc2626';
            return `
            <tr>
                <td>${s.name}</td>
                <td>${s.class || '-'}</td>
                <td>${(s.start * 100).toFixed(1)}%</td>
                <td>${(s.end * 100).toFixed(1)}%</td>
                <td style="font-weight:bold; color:${color};">${(delta * 100).toFixed(1)}%</td>
            </tr>`;
        }).join('');
    },

    exportVolatility: function() {
        if (!this.cache.volatility || !this.cache.volatility.length) return alert('暂无可导出数据');
        const wsData = [['姓名', '班级', '考试次数', '波动率(σ)']];
        this.cache.volatility.forEach(s => wsData.push([s.name, s.class || '-', s.count, Number(s.sigma.toFixed(3))]));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsData), 'Z-Score波动率');
        XLSX.writeFile(wb, `纵向成长档案_波动率_${CURRENT_COHORT_ID || 'cohort'}.xlsx`);
    },

    std: function(arr) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    },

    getStudentKey: function(s) {
        return s.uuid || `${s.name || ''}|${s.class || ''}|${s.school || ''}`;
    }
};

// === 自动快照/回滚 ===
function getCurrentSnapshotPayload() {
    return {
        COHORT_DB: window.COHORT_DB || null,
        CURRENT_COHORT_ID: window.CURRENT_COHORT_ID || '',
        CURRENT_COHORT_META: window.CURRENT_COHORT_META || null,
        CURRENT_EXAM_ID: window.CURRENT_EXAM_ID || '',
        CURRENT_TERM_ID: localStorage.getItem('CURRENT_TERM_ID') || '',
        ARCHIVE_META: (() => {
            try { return JSON.parse(localStorage.getItem('ARCHIVE_META') || 'null'); } catch(e) { return null; }
        })(),
        RAW_DATA: window.RAW_DATA || [],
        SCHOOLS: window.SCHOOLS || {},
        SUBJECTS: window.SUBJECTS || [],
        THRESHOLDS: window.THRESHOLDS || {},
        TEACHER_MAP: window.TEACHER_MAP || {},
        CONFIG: window.CONFIG || {},
        MY_SCHOOL: window.MY_SCHOOL || "",
        TARGETS: window.SYS_VARS?.targets || window.TARGETS || {},
        INDICATOR_PARAMS: window.SYS_VARS?.indicator || { ind1: '', ind2: '' },
        PREV_DATA: window.PREV_DATA || [],
        TEACHER_STATS: window.TEACHER_STATS || {},
        HISTORY_ARCHIVE: window.HISTORY_ARCHIVE || {},
        FB_CLASSES: window.FB_CLASSES || [],
        MP_SNAPSHOTS: window.MP_SNAPSHOTS || {},
        timestamp: new Date().getTime()
    };
}

function createAutoSnapshot(payload) {
    try {
        if (!payload) return;
        const list = JSON.parse(localStorage.getItem('AUTO_SNAPSHOTS') || '[]');
        const item = {
            ts: Date.now(),
            key: localStorage.getItem('CURRENT_PROJECT_KEY') || 'autosave_backup',
            data: "LZ|" + LZString.compressToUTF16(JSON.stringify(payload))
        };
        list.unshift(item);
        const trimmed = list.slice(0, 5);
        localStorage.setItem('AUTO_SNAPSHOTS', JSON.stringify(trimmed));
        renderAutoSnapshotsUI();
    } catch(e) {
        console.warn('自动快照失败:', e);
    }
}

function renderAutoSnapshotsUI() {
    const container = document.getElementById('auto-snapshot-list');
    if (!container) return;
    const list = JSON.parse(localStorage.getItem('AUTO_SNAPSHOTS') || '[]');
    if (list.length === 0) {
        container.innerHTML = '暂无快照';
        return;
    }
    container.innerHTML = list.map((item, idx) => {
        const time = new Date(item.ts).toLocaleString();
        return `<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px dashed #fed7aa;">
            <span>⏱️ ${time} <span style="color:#64748b;">(${item.key})</span></span>
            <button class="btn btn-sm btn-gray" onclick="restoreAutoSnapshot(${idx})">回滚</button>
        </div>`;
    }).join('');
}

function restoreAutoSnapshot(index) {
    if (!confirm('确定回滚到该快照吗？当前未保存的修改将丢失。')) return;
    const list = JSON.parse(localStorage.getItem('AUTO_SNAPSHOTS') || '[]');
    const item = list[index];
    if (!item || !item.data) return;
    try {
        let dataStr = item.data;
        if (typeof dataStr === 'string' && dataStr.startsWith('LZ|')) {
            dataStr = LZString.decompressFromUTF16(dataStr.substring(3));
        }
        const db = JSON.parse(dataStr);
        applySnapshotPayload(db);
        if(window.UI) UI.toast('✅ 已回滚到快照', 'success');
    } catch(e) {
        alert('回滚失败: ' + e.message);
    }
}

function applySnapshotPayload(db) {
    window.COHORT_DB = db.COHORT_DB || window.COHORT_DB || null;
    window.CURRENT_COHORT_ID = db.CURRENT_COHORT_ID || window.CURRENT_COHORT_ID || '';
    window.CURRENT_COHORT_META = db.CURRENT_COHORT_META || window.CURRENT_COHORT_META || null;
    window.CURRENT_EXAM_ID = db.CURRENT_EXAM_ID || window.CURRENT_EXAM_ID || '';
    if (db.CURRENT_TERM_ID) localStorage.setItem('CURRENT_TERM_ID', db.CURRENT_TERM_ID);
    if (window.CURRENT_COHORT_ID) {
        localStorage.setItem('CURRENT_PROJECT_KEY', getCohortKey(window.CURRENT_COHORT_ID));
        localStorage.setItem('CURRENT_COHORT_ID', window.CURRENT_COHORT_ID);
    }
    if (window.CURRENT_EXAM_ID) {
        const metaStr = localStorage.getItem('ARCHIVE_META');
        try {
            const meta = metaStr ? JSON.parse(metaStr) : null;
            const termId = getTermId(meta || {});
            if (termId) localStorage.setItem('CURRENT_TERM_ID', termId);
        } catch(e) {}
    }
    window.RAW_DATA = db.RAW_DATA || [];
    window.SCHOOLS = db.SCHOOLS || {};
    window.SUBJECTS = db.SUBJECTS || [];
    window.THRESHOLDS = db.THRESHOLDS || {};
    setTeacherMap(db.TEACHER_MAP || {});
    window.CONFIG = db.CONFIG || {};
    window.MY_SCHOOL = db.MY_SCHOOL || "";
    window.TARGETS = db.TARGETS || {};
    window.SYS_VARS = window.SYS_VARS || { indicator: { ind1: '', ind2: '' }, targets: {} };
    window.SYS_VARS.targets = window.TARGETS;
    if (db.INDICATOR_PARAMS) {
        window.SYS_VARS.indicator.ind1 = db.INDICATOR_PARAMS.ind1 || '';
        window.SYS_VARS.indicator.ind2 = db.INDICATOR_PARAMS.ind2 || '';
        const dm1 = document.getElementById('dm_ind1_input');
        const dm2 = document.getElementById('dm_ind2_input');
        const main1 = document.getElementById('ind1');
        const main2 = document.getElementById('ind2');
        if(dm1) dm1.value = window.SYS_VARS.indicator.ind1;
        if(dm2) dm2.value = window.SYS_VARS.indicator.ind2;
        if(main1) main1.value = window.SYS_VARS.indicator.ind1;
        if(main2) main2.value = window.SYS_VARS.indicator.ind2;
    }
    if (db.PREV_DATA) window.PREV_DATA = db.PREV_DATA;
    if (db.TEACHER_STATS) window.TEACHER_STATS = db.TEACHER_STATS;
    if (db.HISTORY_ARCHIVE) window.HISTORY_ARCHIVE = db.HISTORY_ARCHIVE;
    if (db.FB_CLASSES) window.FB_CLASSES = db.FB_CLASSES;
    if (db.MP_SNAPSHOTS) window.MP_SNAPSHOTS = db.MP_SNAPSHOTS;

    if (window.COHORT_DB && window.COHORT_DB.currentExamId) {
        try { CohortDB.applyExamToWorkspace(window.COHORT_DB.currentExamId); } catch(e) {}
    }

    try { if(typeof renderTables === 'function') renderTables(); } catch(e) {}
    try { if(typeof updateSchoolSelect === 'function') updateSchoolSelect(); } catch(e) {}
    try { if (typeof renderAll === 'function') renderAll(); } catch(e) {}
    if (typeof DataManager !== 'undefined' && DataManager.renderHistoryPreview) DataManager.renderHistoryPreview();
}
