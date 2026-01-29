// 弹窗 DOM 位置修复
window.addEventListener('load', () => {
    // 延迟执行，确保 DOM 已经完全渲染
    setTimeout(() => {
        const modalIds = [
            'issue-submit-modal',   // 成绩核查申诉弹窗
            'admin-issue-modal',    // 管理员申诉处理弹窗
            'user-password-modal',  // 修改密码弹窗
            'account-manager-modal' // 账号管理弹窗
        ];

        modalIds.forEach(id => {
            const el = document.getElementById(id);
            // 如果元素存在，且它不是 body 的直接子元素，就移动它
            if (el && el.parentNode !== document.body) {
                console.log(`🔧 [AutoFix] 正在修复弹窗 DOM 位置: ${id}`);
                document.body.appendChild(el); // 移动到 body 末尾
            }
        });
    }, 1000); // 延迟 1 秒执行
});

// 回到顶部按钮显示/隐藏
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            btn.style.display = 'block';
            btn.style.opacity = '1';
        } else {
            btn.style.display = 'none';
        }
    });
});

// 全局性能监控工具
window.PerformanceMonitor = {
    // 获取页面性能数据
    getMetrics: function() {
        if (!window.performance || !performance.timing) {
            return { error: "浏览器不支持性能API" };
        }
        
        const t = performance.timing;
        const metrics = {
            DNS解析: t.domainLookupEnd - t.domainLookupStart,
            TCP连接: t.connectEnd - t.connectStart,
            请求响应: t.responseEnd - t.requestStart,
            DOM解析: t.domComplete - t.domLoading,
            页面完全加载: t.loadEventEnd - t.navigationStart,
            白屏时间: t.responseStart - t.navigationStart,
            首屏时间: t.domContentLoadedEventEnd - t.navigationStart
        };
        
        return metrics;
    },
    
    // 打印性能报告
    report: function() {
        const metrics = this.getMetrics();
        console.group('📊 系统性能报告');
        for (let key in metrics) {
            if (typeof metrics[key] === 'number') {
                console.log(`${key}: ${metrics[key]}ms`);
            }
        }
        console.groupEnd();
        
        // 检查内存使用(仅Chrome)
        if (performance.memory) {
            const memory = performance.memory;
            console.log(`💾 内存使用: ${(memory.usedJSHeapSize / 1048576).toFixed(2)}MB / ${(memory.jsHeapSizeLimit / 1048576).toFixed(2)}MB`);
        }
        
        return metrics;
    },
    
    // 优化建议
    getSuggestions: function() {
        const metrics = this.getMetrics();
        const suggestions = [];
        
        if (metrics['页面完全加载'] > 5000) {
            suggestions.push('⚠️ 页面加载时间超过5秒，建议优化网络或减少外部资源');
        }
        if (metrics['DOM解析'] > 2000) {
            suggestions.push('⚠️ DOM解析较慢，考虑减少DOM节点或延迟加载非关键内容');
        }
        if (performance.memory && performance.memory.usedJSHeapSize > 100 * 1048576) {
            suggestions.push('⚠️ 内存占用较高(>100MB)，建议定期刷新页面');
        }
        
        if (suggestions.length === 0) {
            suggestions.push('✅ 系统运行良好，无需优化');
        }
        
        return suggestions;
    }
};

// 内存清理工具
window.MemoryCleaner = {
    clean: function() {
        console.log('🧹 开始清理内存...');
        
        // 清理大型图表实例
        if (window.Chart && Chart.instances) {
            Object.values(Chart.instances).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
            console.log('✅ 已清理图表实例');
        }
        
        console.log('💡 建议: 刷新页面以完全释放内存');
        
        if (confirm('是否刷新页面以完全清理内存?')) {
            location.reload();
        }
    }
};

// 开发模式自动性能检测
if (localStorage.getItem('DEV_MODE') === 'true') {
    window.addEventListener('load', () => {
        setTimeout(() => {
            PerformanceMonitor.report();
            PerformanceMonitor.getSuggestions().forEach(s => console.log(s));
        }, 1000);
    });
}
