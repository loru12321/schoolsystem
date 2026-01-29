// 📦 系统打包工具
const Packager = {
    // 生成包含数据的独立 HTML 文件
    exportDistributableHTML: function() {
        // 1. 检查数据
        if (!RAW_DATA.length) return alert("当前无成绩数据，无法生成分发版。");
        if (!Auth.db.parents.length && !Auth.db.teachers.length) return alert("当前无账号信息，请先在账号管理中生成账号。");

        if (!confirm("⚠️ 准备生成【分发版网页】...\n\n此文件将包含：\n1. 所有学生成绩数据\n2. 所有生成的账号密码\n\n请将生成的 .html 文件发送给家长/老师。\n他们无需上传Excel，直接输入账号即可登录。\n\n确定继续吗？")) return;

        UI.loading(true, "正在打包全量数据...");

        setTimeout(() => {
            try {
                // 2. 准备要注入的数据包
                const dataPackage = {
                    timestamp: new Date().getTime(),
                    // 核心业务数据
                    RAW_DATA: RAW_DATA,
                    SCHOOLS: SCHOOLS, // 包含统计结果，避免重新计算
                    SUBJECTS: SUBJECTS,
                    THRESHOLDS: THRESHOLDS,
                    TEACHER_MAP: TEACHER_MAP,
                    MY_SCHOOL: MY_SCHOOL,
                    CONFIG: CONFIG,
                    // 核心权限数据
                    AUTH_DB: Auth.db, 
                    // 其他配置
                    LLM_CONFIG: LLM_CONFIG
                };

                // 3. 获取当前页面的完整源代码
                let htmlContent = document.documentElement.outerHTML;

               // A. 强制显示登录遮罩，隐藏主界面
                htmlContent = htmlContent.replace(
                    /id="login-overlay"\s+style="([^"]*)"/, 
                    'id="login-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:#f3f4f6; z-index:50000; display:flex; align-items:center; justify-content:center; background-image: radial-gradient(#e5e7eb 1px, transparent 1px); background-size: 20px 20px;"'
                );
                
                // 强制隐藏主容器
                if (htmlContent.includes('id="app" class="container"')) {
                     htmlContent = htmlContent.replace('id="app" class="container"', 'id="app" class="container hidden"');
                } else {
                    htmlContent = htmlContent.replace('id="app"', 'id="app" class="hidden"');
                }

                // B. 【修复弹窗问题】强制隐藏管理员模态框
                htmlContent = htmlContent.replace(
                    /id="admin-modal"\s+class="modal"\s+style="([^"]*)"/,
                    'id="admin-modal" class="modal" style="display: none; z-index: 60000;"'
                );

                // C. 【修复右上角名字问题】移除已存在的退出按钮
                htmlContent = htmlContent.replace(/<div id="logout-btn".*?<\/div>/, '');

                // D. 隐藏管理员入口按钮
                htmlContent = htmlContent.replace('id="admin-panel-btn" onclick', 'id="admin-panel-btn" style="display:none" onclick');

                // E. 🔥【关键修复】强制隐藏全局加载遮罩 (修复一直转圈的问题) 🔥
                // 使用正则替换，强制给 global-loader 加上 hidden 类，并去掉可能存在的内联 style
                htmlContent = htmlContent.replace(
                    /<div id="global-loader"[\s\S]*?>/, 
                    '<div id="global-loader" class="hidden">'
                );

                // 4. 构建注入脚本 (将数据对象转为 JSON 字符串)
                // 为了防止 XSS 或闭合标签错误，进行简单的转义
                const jsonStr = JSON.stringify(dataPackage).replace(/<\/script>/g, '<\\/script>');
                const injectionCode = `window.EMBEDDED_DB = ${jsonStr};`;

                // 5. 替换插槽内容
                // 寻找第一步中预留的 window.EMBEDDED_DB = null;
                const targetStr = "window.EMBEDDED_DB = null;";
                
                if (!htmlContent.includes(targetStr)) {
                    throw new Error("模板插槽未找到，请检查 HTML 头部是否添加了 id='embedded-data-script'");
                }

                // 执行替换
                const newHtml = htmlContent.replace(targetStr, injectionCode);

                // 6. 下载新文件
                const blob = new Blob([newHtml], { type: "text/html;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                // 文件名带上时间，方便区分
                link.download = `查分系统_分发版_${new Date().toLocaleDateString().replace(/\//g,'-')}.html`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                UI.loading(false);
                alert("✅ 分发版已生成！\n\n请将下载的 .html 文件发送给家长。\n家长打开该文件后，可直接用账号登录。");

            } catch (e) {
                console.error(e);
                UI.loading(false);
                alert("打包失败: " + e.message);
            }
        }, 500);
    }
};

const HelpSystem = {
    // 定义各模块的帮助内容
    content: {
        'upload': {
            title: '📁 数据上传规范',
            html: `
                <div style="text-align:left; line-height:1.6;">
                    <p><strong>1. Excel 格式要求：</strong></p>
                    <ul>
                        <li>第一行必须是表头（如：姓名、班级、语文、数学...）。</li>
                        <li>必须包含<strong>姓名</strong>列。</li>
                        <li>如果有多个学校，请使用不同的 Sheet 页，<strong>Sheet名称即为学校名</strong>。</li>
                    </ul>
                    <p style="margin-top:10px;"><strong>2. 常见问题：</strong></p>
                    <ul>
                        <li>缺考/作弊：可填 "0" 或 "缺考"（系统按0分处理）。</li>
                        <li>列名识别：系统支持“语文/语/Chinese”等多种别名自动识别。</li>
                    </ul>
                </div>
            `,
            icon: 'info'
        },
        'macro': {
            title: '📊 两率一分算法说明',
            html: `
                <div style="text-align:left;">
                    <p><strong>核心公式：</strong></p>
                    <p>总分 = (均分赋分) + (优率赋分) + (及格赋分)</p>
                    <hr style="margin:10px 0; border:0; border-top:1px dashed #eee;">
                    <p><strong>默认权重配置：</strong></p>
                    <ul>
                        <li><strong>6-8年级：</strong> 均分60 + 优率70 + 及格70 = 满分200</li>
                        <li><strong>9年级：</strong> 均分40 + 优率80 + 及格40 = 满分160</li>
                    </ul>
                    <p style="font-size:12px; color:#666; margin-top:5px;">* 指标计算基准：以全镇最高值为满分进行归一化折算。</p>
                </div>
            `
        },
        'teacher': {
            title: '👨‍🏫 教师评价模型',
            html: `
                <div style="text-align:left;">
                    <p>系统通过以下维度评价教师教学质量：</p>
                    <ol>
                        <li><strong>三率指标：</strong> 优秀率、及格率、低分率。</li>
                        <li><strong>贡献值：</strong> (班级均分 - 年级均分)。</li>
                        <li><strong>乡镇排名：</strong> 该教师所教班级在全镇同科目的排名。</li>
                    </ol>
                    <div class="info-bar" style="margin-top:10px; font-size:12px;">
                        💡 提示：请先在【数据上传】页面下方配置好“教师任课表”才能看到此分析。
                    </div>
                </div>
            `
        }
    },

    // 显示单点帮助
    show: function(key) {
        if(this.content[key]) {
            Swal.fire({
                title: this.content[key].title,
                html: this.content[key].html,
                icon: 'question',
                confirmButtonText: '明白了',
                confirmButtonColor: '#4f46e5'
            });
        }
    },

    // 启动新手引导之旅 (Wizard)
    startTour: function() {
        const steps = [
            {
                title: '👋 欢迎使用智能教务系统',
                html: '只需 3 步完成一次完整流程：<strong>导入 → 分析 → 导出</strong>。',
                imageUrl: 'https://cdn-icons-png.flaticon.com/512/4205/4205622.png',
                imageWidth: 100,
                confirmButtonText: '下一步: 导入数据'
            },
            {
                title: '1️⃣ 导入',
                html: '进入<strong>【数据枢纽】</strong>上传 Excel。<br><small style="color:#666">系统自动识别学校、班级与学科。</small>',
                icon: 'info',
                confirmButtonText: '下一步: 分析'
            },
            {
                title: '2️⃣ 分析',
                html: '进入<strong>【校际联考分析】</strong>查看横向排名，<br>进入<strong>【班级教学管理】</strong>看教师贡献度。',
                icon: 'success',
                confirmButtonText: '下一步: 导出'
            },
            {
                title: '3️⃣ 导出',
                html: '进入<strong>【综合分析报告】</strong>或<strong>【成绩单/家长查分】</strong>一键导出。',
                icon: 'success',
                confirmButtonText: '开始使用！'
            }
        ];

        // 使用 SweetAlert2 的队列功能
        let currentStep = 0;
        const showStep = (index) => {
            if (index >= steps.length) return;
            Swal.fire({
                ...steps[index],
                showCancelButton: index < steps.length - 1,
                cancelButtonText: '跳过教程',
                confirmButtonColor: '#4f46e5',
                allowOutsideClick: false
            }).then((result) => {
                if (result.isConfirmed) {
                    showStep(index + 1);
                }
            });
        };
        showStep(0);
    },

    // 检查是否首次访问
    checkFirstRun: function() {
        if (!localStorage.getItem('hasSeenV3Tour')) {
            setTimeout(() => {
                this.startTour();
                localStorage.setItem('hasSeenV3Tour', 'true');
            }, 1000); // 延迟1秒显示，等待页面渲染
        }
    }
};
