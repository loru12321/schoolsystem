window.onerror = function (msg, url, lineNo, columnNo, error) {
    // 忽略第三方插件的非关键错误
    if (msg.includes('Script error')) return false;
    
    console.error('全局错误捕获:', error);
    
    // 如果 SweetAlert2 已加载，用它提示
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: '程序遇到意外错误',
            html: `<div style="text-align:left; font-size:12px; color:#666;">
                    <strong>错误信息:</strong> ${msg}<br>
                    <strong>位置:</strong> Line ${lineNo}<br><br>
                    建议操作：<br>1. 刷新页面重试<br>2. 检查上传的 Excel 是否格式正确<br>3. 点击下方按钮尝试清空缓存
                   </div>`,
            showCancelButton: true,
            confirmButtonText: '刷新页面',
            cancelButtonText: '清空缓存并刷新',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'
        }).then((result) => {
            if (result.isDismissed) { // 用户点击了“清空缓存”
                idbKeyval.del('autosave_backup').then(() => location.reload());
            } else {
                location.reload();
            }
        });
        return true; // 阻止默认的控制台报错
    }
    return false;
};

// Alpine.js 数据仓库初始化
document.addEventListener('alpine:init', () => {
    Alpine.store('teacherData', {
        list: [], // 存放扁平化的教师数据
        
        // 更新数据的逻辑 (供旧代码调用)
        update(statsObj, rankingObj) {
            const arr = [];
            // 将复杂的嵌套对象转换为数组，方便前端循环
            if (statsObj && Object.keys(statsObj).length > 0) {
                Object.keys(statsObj).sort().forEach(teacher => {
                    Object.keys(statsObj[teacher]).sort((a,b)=>a.localeCompare(b)).forEach(subject => {
                        const data = statsObj[teacher][subject];
                        // 计算评级样式
                        let badgeClass = 'performance-poor', badgeText = '需改进';
                        const avg = parseFloat(data.avg), exc = data.excellentRate*100, pass = data.passRate*100;
                        if (avg>=85 && exc>=30 && pass>=90) { badgeClass='performance-excellent'; badgeText='优秀'; }
                        else if (avg>=80 && exc>=25 && pass>=85) { badgeClass='performance-good'; badgeText='良好'; }
                        else if (avg>=75 && exc>=20 && pass>=80) { badgeClass='performance-average'; badgeText='中等'; }

                        // 获取排名
                        const rank = (rankingObj && rankingObj[teacher] && rankingObj[teacher][subject]) 
                                     ? rankingObj[teacher][subject].rank : '-';

                        arr.push({
                            id: `${teacher}-${subject}`, // 唯一键
                            name: teacher,
                            subject: subject,
                            classes: data.classes,
                            avg: data.avg,
                            excRate: (data.excellentRate * 100).toFixed(1) + '%',
                            passRate: (data.passRate * 100).toFixed(1) + '%',
                            count: data.studentCount,
                            rank: rank,
                            badgeClass: badgeClass,
                            badgeText: badgeText
                        });
                    });
                });
            }
            this.list = arr;
        }
    });
});

// 深色模式切换逻辑
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme-dark', isDark);
    // 定义颜色变量
    const textColor = isDark ? '#cbd5e1' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    // 更新 Chart.js 全局默认配置
    if (window.Chart) {
        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;
    }

    // 刷新页面上已存在的特定图表实例
    // 注意：这里列出了你代码中定义过的所有图表实例变量
    const charts = [
        window.radarChartInstance, 
        window.historyChartInstance, 
        window.varianceChartInstance, 
        window.segmentChartInstance, 
        window.balanceChartInstance,
        window.schoolRadarInstance,
        window.schoolDistInstance,
        window.sankeyChartInstance, // 桑基图
        window.trendChartInstance   // 散点图
    ];

    charts.forEach(chart => {
        if (chart) {
            // 更新图表配置
            chart.options.scales.x && (chart.options.scales.x.grid.color = gridColor);
            chart.options.scales.y && (chart.options.scales.y.grid.color = gridColor);
            
            // 特殊处理雷达图
            if (chart.config.type === 'radar') {
                chart.options.scales.r.grid.color = gridColor;
                chart.options.scales.r.pointLabels.color = textColor;
            }
            
            chart.update(); // 重绘
        }
    });
    
    // 提示用户
    if(window.UI) UI.toast(isDark ? "🌙 已切换深色模式" : "☀️ 已切换浅色模式");
}

function openSpotlight() {
    document.getElementById('spotlight-mask').style.display = 'flex';
    document.getElementById('spotlight-input').focus();
}

function closeSpotlight() {
    document.getElementById('spotlight-mask').style.display = 'none';
}

function jumpToStudent(name, school, cls) {
    closeSpotlight();
    switchTab('report-generator');
    const schSel = document.getElementById('sel-school');
    schSel.value = school;
    updateClassSelect(); // 触发更新班级下拉框
    setTimeout(() => {
        document.getElementById('sel-class').value = cls;
        document.getElementById('inp-name').value = name;
        doQuery();
    }, 100);
}

function showCertificate(name, honorType) {
    document.getElementById('cert-name').innerText = name;
    document.getElementById('cert-honor').innerText = honorType;
    document.getElementById('cert-exam-name').innerText = CONFIG.name || "本次考试";
    document.getElementById('cert-school-footer').innerText = MY_SCHOOL || "教务处";
    document.getElementById('cert-date').innerText = new Date().toLocaleDateString();
    document.getElementById('cert-modal').style.display = 'flex';
}

async function downloadCertificate() {
    const area = document.getElementById('cert-capture-area');
    const canvas = await html2canvas(area, { scale: 2 });
    const link = document.createElement('a');
    link.download = `奖状_${document.getElementById('cert-name').innerText}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

const UI = {
    // 1. 加载动画控制
    loading: (show, text = '系统正在处理数据...') => {
        const loader = document.getElementById('global-loader');
        const txt = document.getElementById('loader-text');
        if (show) {
            if(txt) txt.innerText = text;
            loader.classList.remove('hidden');
        } else {
            setTimeout(() => loader.classList.add('hidden'), 200); // 稍微延迟防止闪烁
        }
    },
    // 2. 消息提示控制
    toast: (msg, type = 'info') => {
        const container = document.getElementById('toast-container');
        const div = document.createElement('div');
        let icon = 'ℹ️';
        if(type === 'success' || msg.includes('成功') || msg.includes('✅')) { type = 'success'; icon = '✅'; }
        if(type === 'error' || msg.includes('失败') || msg.includes('错误') || msg.includes('❌')) { type = 'error'; icon = '❌'; }
        div.className = `toast-msg toast-${type}`;
        div.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
        container.appendChild(div);
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateY(-20px)';
            setTimeout(() => div.remove(), 300);
        }, 3000);
    }
};
