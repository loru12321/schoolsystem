// 拦截页面刷新或关闭，防止未保存的数据丢失
window.addEventListener('beforeunload', (e) => {
    // 如果 RAW_DATA 里有数据，说明老师已经导入过文件
    if (RAW_DATA.length > 0) {
        const msg = "系统检测到您有正在处理的成绩数据，刷新或关闭页面将导致配置（如教师名单）丢失。确定离开吗？";
        e.preventDefault();
        e.returnValue = msg; // 现代浏览器大多数会展示其默认的提示语，但必须设置这个值
        return msg;
    }
});

// ================== 外观定制逻辑 (换肤 & Logo) ==================
const SKIN_CONFIG_KEY = 'app_skin_config';
let currentSkin = {
    primaryColor: '#4f46e5', // 默认颜色
    logoBase64: '',
    customTitle: ''
};

// 1. 打开模态框
function openSkinModal() {
    document.getElementById('skin-modal').style.display = 'flex';
    // 填充当前值
    document.getElementById('custom-color-input').value = currentSkin.primaryColor || '#4f46e5';
    document.getElementById('custom-title-input').value = currentSkin.customTitle || '';
}

// 2. 设置主题色 (动态计算深色变体)
function setThemeColor(color) {
    currentSkin.primaryColor = color;
    // 更新 CSS 变量
    document.documentElement.style.setProperty('--primary', color);
    
    // 简单的颜色变暗逻辑，用于 --primary-dark
    const darkenColor = (hex, percent) => {
        let num = parseInt(hex.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        B = ((num >> 8) & 0x00FF) - amt,
        G = (num & 0x0000FF) - amt;
        return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
    };
    
    try {
        const darkColor = darkenColor(color, 30); // 变暗 30% 形成渐变
        const lightColor = color + '1A'; // 增加 10% 透明度 (Hex Alpha)
        document.documentElement.style.setProperty('--primary-dark', darkColor);
        document.documentElement.style.setProperty('--primary-light', lightColor); 
        
        // 手动更新 Header 背景 (因为 CSS 变量在 linear-gradient 有时需要强制刷新)
        const header = document.querySelector('header');
        if(header) {
            header.style.background = `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)`;
        }
    } catch(e) { console.warn("颜色计算错误", e); }
}

// 3. 处理 Logo 上传
function handleLogoUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) return alert("Logo 图片过大，请使用 500KB 以内的图片");

    const reader = new FileReader();
    reader.onload = function(e) {
        currentSkin.logoBase64 = e.target.result;
        applyLogo(currentSkin.logoBase64);
        // alert("Logo 上传成功！点击下方保存按钮生效。");
    };
    reader.readAsDataURL(file);
}

function applyLogo(base64) {
    const img = document.getElementById('custom-logo-img');
    if (base64) {
        img.src = base64;
        img.style.display = 'block';
    } else {
        img.style.display = 'none';
        img.src = '';
    }
}

function clearLogo() {
    currentSkin.logoBase64 = '';
    applyLogo('');
}

// 4. 标题实时预览
function updateTitlePreview(val) {
    const titleEl = document.getElementById('app-title');
    // 保留里面的 span (badge)
    const badge = titleEl.querySelector('.badge');
    const badgeHtml = badge ? badge.outerHTML : '';
    
    if(val.trim()) {
        titleEl.innerHTML = val + ' ' + badgeHtml;
    } else {
        titleEl.innerHTML = '乡镇学校成绩分析与教务管理系统 ' + badgeHtml;
    }
    currentSkin.customTitle = val;
}

// 5. 保存设置到 LocalStorage
function saveSkinSettings() {
    localStorage.setItem(SKIN_CONFIG_KEY, JSON.stringify(currentSkin));
    document.getElementById('skin-modal').style.display = 'none';
    if(window.UI) window.UI.toast("✅ 外观设置已保存", "success");
    else alert("设置已保存");
}

// 6. 初始化加载设置
function loadSkinSettings() {
    const saved = localStorage.getItem(SKIN_CONFIG_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            currentSkin = { ...currentSkin, ...parsed };
            if(currentSkin.primaryColor) setThemeColor(currentSkin.primaryColor);
            if(currentSkin.logoBase64) applyLogo(currentSkin.logoBase64);
            if(currentSkin.customTitle) updateTitlePreview(currentSkin.customTitle);
        } catch(e) { console.error("加载皮肤配置失败", e); }
    }
}

// ================== 语音控制系统 (Web Speech API) ==================
const VoiceControl = {
    recognition: null,
    isListening: false,
    hud: null,
    statusEl: null,
    resultEl: null,
    fab: null,

    // 指令映射表 (模糊匹配)
    commands: [
        { keywords: ['总榜', '总排名', '综合排名', '全科'], action: () => switchTab('summary') },
        { keywords: ['两率一分', '横向', '宏观'], action: () => switchTab('analysis') },
        { keywords: ['教师', '老师', '教学'], action: () => switchTab('teacher-analysis') },
        { keywords: ['指标', '达标'], action: () => switchTab('indicator') },
        { keywords: ['后进', '后1/3', '三分之一'], action: () => switchTab('bottom3') },
        { keywords: ['进退', '进步', '退步', '追踪'], action: () => switchTab('progress-analysis') },
        { keywords: ['临界', '边缘'], action: () => switchTab('marginal-push') },
        { keywords: ['考场', '监考'], action: () => switchTab('exam-arranger') },
        { keywords: ['分班', '新生'], action: () => switchTab('freshman-simulator') },
        { keywords: ['全屏', '大屏'], action: () => VoiceControl.toggleFullScreen(true) },
        { keywords: ['退出全屏', '普通', '恢复'], action: () => VoiceControl.toggleFullScreen(false) },
        { keywords: ['关闭', '退出', '停止'], action: () => VoiceControl.stop() }
    ],

    init: function() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("您的浏览器不支持语音识别，请使用 Chrome 或 Edge 浏览器。");
            document.getElementById('voice-fab').style.display = 'none';
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true; // 连续监听
        this.recognition.interimResults = true; // 实时反馈
        this.recognition.lang = 'zh-CN';

        this.hud = document.getElementById('voice-hud');
        this.statusEl = document.getElementById('voice-status');
        this.resultEl = document.getElementById('voice-result');
        this.fab = document.getElementById('voice-fab');

        // 绑定事件
        this.recognition.onstart = () => {
            this.isListening = true;
            this.fab.classList.add('listening');
            this.hud.classList.add('active');
            this.statusEl.innerText = "正在聆听...";
            this.statusEl.style.color = "white";
        };

        this.recognition.onend = () => {
            // 如果非手动停止，且原本是开启状态，则自动重启（保持常驻）
            if (this.isListening) {
                try { this.recognition.start(); } catch(e){}
            } else {
                this.fab.classList.remove('listening');
                this.hud.classList.remove('active');
            }
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (interimTranscript) {
                this.statusEl.innerText = interimTranscript;
                this.statusEl.style.color = "#38bdf8"; // 蓝色表示正在输入
            }

            if (finalTranscript) {
                console.log("语音指令:", finalTranscript);
                this.statusEl.innerText = finalTranscript;
                this.statusEl.style.color = "#4ade80"; // 绿色表示已确认
                this.processCommand(finalTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error("语音识别错误", event.error);
            if (event.error === 'not-allowed') {
                alert("无法访问麦克风，请检查浏览器权限。");
                this.stop();
            }
        };
    },

    toggle: function() {
        if (!this.recognition) this.init();
        if (!this.recognition) return;

        if (this.isListening) {
            this.stop();
        } else {
            this.isListening = true;
            this.recognition.start();
        }
    },

    stop: function() {
        this.isListening = false;
        if (this.recognition) this.recognition.stop();
        this.fab.classList.remove('listening');
        this.hud.classList.remove('active');
    },

    processCommand: function(text) {
        text = text.replace(/。|？|！/g, ''); // 去标点
        
        // 1. 匹配预设指令
        const matchedCmd = this.commands.find(cmd => 
            cmd.keywords.some(key => text.includes(key))
        );

        if (matchedCmd) {
            this.resultEl.innerText = "✅ 执行指令...";
            setTimeout(() => {
                matchedCmd.action();
                // 执行后不关闭HUD，方便连续下达指令
                // 如果希望执行后关闭，取消下面注释
                // this.stop(); 
            }, 500);
            return;
        }

        // 2. 特殊指令：搜索学生/学校
        if (text.includes("搜索") || text.includes("查询") || text.includes("查找")) {
            const keyword = text.replace(/搜索|查询|查找/g, '').trim();
            if (keyword) {
                this.resultEl.innerText = `🔍 正在搜索 "${keyword}"...`;
                this.stop(); // 搜索需要跳转弹窗，关闭 HUD
                openSpotlight();
                const input = document.getElementById('spotlight-input');
                input.value = keyword;
                // 触发 input 事件以运行搜索
                input.dispatchEvent(new Event('input'));
            }
            return;
        }
        
        // 3. 特殊指令：切换本校
        if (text.startsWith("本校") || text.includes("切换到")) {
            const keyword = text.replace(/本校|切换到/g, '').trim();
            // 在 SCHOOLS 中模糊匹配
            const targetSchool = Object.keys(SCHOOLS).find(s => s.includes(keyword));
            if (targetSchool) {
                this.resultEl.innerText = `🏫 切换本校为：${targetSchool}`;
                document.getElementById('mySchoolSelect').value = targetSchool;
                // 触发 change
                document.getElementById('mySchoolSelect').dispatchEvent(new Event('change'));
                
                // 如果在教师分析页，重刷数据
                if(document.getElementById('teacher-analysis').classList.contains('active')) {
                    analyzeTeachers();
                }
            } else {
                this.resultEl.innerText = `❌ 未找到学校：${keyword}`;
            }
            return;
        }

        this.resultEl.innerText = "🤔 未识别的指令，请重试";
    },

    // 大屏沉浸模式 (隐藏 Header 和 导航)
    toggleFullScreen: function(enable) {
        const header = document.querySelector('header');
        const nav = document.querySelector('.nav-wrapper');
        const fab = document.getElementById('voice-fab');
        
        if (enable) {
            if(header) header.style.display = 'none';
            if(nav) nav.style.display = 'none';
            document.documentElement.requestFullscreen().catch(e=>{});
            UI.toast("📺 已进入大屏演示模式", "success");
        } else {
            if(header) header.style.display = 'block';
            if(nav) nav.style.display = 'block';
            if(document.fullscreenElement) document.exitFullscreen().catch(e=>{});
            UI.toast("已退出大屏模式");
        }
    }
};
