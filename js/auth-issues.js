// 🔐 权限与账号管理系统核心
const Auth = {
    currentUser: null,
    
    // 模拟数据库 (实际存储在 localStorage 'SYS_USERS')
    db: JSON.parse(localStorage.getItem('SYS_USERS')) || {
        admin: { pass: 'admin123' }, 
        teachers: [],
        parents: []
    },

    // 初始化：检查会话状态
    init: function() {
        const session = sessionStorage.getItem('CURRENT_USER');
        if(session) {
            this.currentUser = JSON.parse(session);
            this.applyRoleView();
            document.getElementById('login-overlay').style.display = 'none';
            
            // 如果是家长，恢复视图
            if(this.currentUser.role === 'parent' && typeof RAW_DATA !== 'undefined' && RAW_DATA.length > 0) {
                this.renderParentView();
            } 
            // 🟢 补充：如果是其他角色，恢复主视图 (防止刷新后空白)
            else if (this.currentUser.role !== 'parent') {
                document.getElementById('app').classList.remove('hidden');
                if(typeof renderNavigation === 'function') renderNavigation();
            }
        }
    },

    /* 👇👇👇 ✋ 🟢 [此处开始替换] 重写 login 函数 (登录后立即刷新主界面) 🟢 ✋ 👇👇👇 */
    
    // 🟢 核心登录逻辑：改为查 Supabase 数据库 (已修复 406 报错 + 增加班级强校验)
    login: async function() {
        const user = document.getElementById('login-user').value.trim();
        const pass = document.getElementById('login-pass').value.trim();
        // 获取输入的班级 (去除空格)
        const inputClass = document.getElementById('login-class').value.trim();
        
        if(!user || !pass) return UI.toast('请输入账号和密码', 'error');

        UI.loading(true, "正在验证身份...");

        try {
            // 1. 查询数据库 (使用新变量 sbClient)
            // 🔴 改动点：使用 .maybeSingle() 代替 .single()
            const { data, error } = await sbClient
                .from('system_users')
                .select('*')
                .eq('username', user)
                .eq('password', pass) // 简单明文匹配
                .maybeSingle(); 

            UI.loading(false);

            // 2. 检查是否有系统级错误
            if (error) {
                console.error("Database Login Error:", error);
                return alert("系统连接错误：" + error.message);
            }

            // 3. 检查是否找到了用户
            if (!data) {
                return alert("❌ 登录失败！\n\n可能原因：\n1. 账号或密码错误\n2. 管理员尚未将账号【同步到云端】");
            }

            /* 👇👇👇 🟢 新增代码：家长角色强制校验班级 🟢 👇👇👇 */
            if (data.role === 'parent') {
                if (!inputClass) {
                    return alert("❌ 登录失败：家长/学生必须输入【班级】才能登录。");
                }
                
                // 对比输入的班级和数据库存的班级 (去除空格后比较，防止 '701 ' 和 '701' 不匹配)
                // data.class_name 是数据库里的列名
                const dbClass = (data.class_name || "").toString().replace(/\s+/g, "");
                const userClass = inputClass.toString().replace(/\s+/g, "");

                if (dbClass !== userClass) {
                    return alert(`❌ 班级不匹配！\n\n您输入的班级：${inputClass}\n系统记录的班级：${data.class_name || '未录入'}\n\n请核对后重试。`);
                }
            }
            /* 👆👆👆 🟢 结束 🟢 👆👆👆 */

            // 4. 登录成功，构建用户对象
            const matchedUser = {
                name: data.username,
                role: data.role,
                school: data.school,
                class: data.class_name // 数据库字段名
            };

            this.currentUser = matchedUser;
            sessionStorage.setItem('CURRENT_USER', JSON.stringify(matchedUser));
            sessionStorage.setItem('CURRENT_ROLE', matchedUser.role); 
            setTimeout(() => {
                loadCloudData();
            }, 200);

            // 界面切换
            this.applyRoleView();
            updateAdminOnlyButtons();
            updateWatermark();
            updateRoleHint();
            logAction('登录', `用户 ${matchedUser.name} (${matchedUser.role}) 登录`);

            // === 🛡️ 安全检查：强制修改默认密码 ===
            // 默认密码定义：教师是 yssy2016，其他人是 123456
            const isDefaultPass = (matchedUser.role === 'teacher' && pass === 'yssy2016') || pass === '123456';
            
            if (isDefaultPass) {
                document.getElementById('login-overlay').style.display = 'none'; // 先关掉登录框
                
                // 弹出提示
                alert("⚠️ 安全警告：\n检测到您正在使用默认密码！\n为了保障账号安全，首次登录必须修改密码。");
                
                // 打开修改密码弹窗 (传入 true 表示强制模式)
                setTimeout(() => openUserPasswordModal(true), 500);
                return; // ⛔ 终止后续加载，直到密码修改完成
            }
            // === 🛡️ 安全检查结束 ===
            document.getElementById('login-overlay').style.display = 'none';
            
            if(window.UI) UI.toast(`登录成功！欢迎 ${matchedUser.name}`, 'success');

            // 5. 【关键】拉取云端数据
            UI.loading(true, "正在同步最新成绩数据...");
            await loadCloudData();
            UI.loading(false);

            // 6. 分流跳转与权限初始化
            if(matchedUser.role === 'parent') {
                // === 家长模式 ===
                this.renderParentView();
            } else {
                // === 教职工模式 (管理员/主任/教师/班主任/级部主任) ===
                document.getElementById('app').classList.remove('hidden');
                
                // 初始化导航和表格
                if(typeof renderNavigation === 'function') renderNavigation();
                if(typeof updateSchoolSelect === 'function') updateSchoolSelect();
                if(typeof renderTables === 'function') renderTables();

                // 7. 届别自动记忆/选择
                if (typeof CohortManager !== 'undefined') {
                    CohortManager.init();
                    applyUserCohortPreference();
                }

                // 👇👇👇 🟢 新增：角色专属初始化逻辑 🟢 👇👇👇
                
                // A. 如果有学校绑定 (除管理员外通常都有)
                if (matchedUser.school) {
                    // 自动设置本校全局变量
                    window.MY_SCHOOL = matchedUser.school; 
                    
                    // 尝试更新界面上的“选择本校”下拉框
                    const sel = document.getElementById('mySchoolSelect');
                    if(sel) { 
                        sel.value = matchedUser.school; 
                        // 触发一次 change 事件以更新相关下拉框 (如班级列表)
                        sel.dispatchEvent(new Event('change')); 
                    }
                }

                // B. 角色权限细分处理
                if (matchedUser.role === 'teacher') {
                    // 普通教师：后续将在 renderStudentDetails 中过滤只能看自己教的课
                    UI.toast(`欢迎您，${matchedUser.name}老师`, "success");
                } 
                else if (matchedUser.role === 'class_teacher') {
                    // 班主任：后续将在 renderStudentDetails 中过滤只能看本班
                    UI.toast(`欢迎您，${matchedUser.class}班班主任`, "success");
                    
                    // 尝试自动定位到“学生档案查询”模块的班级筛选
                    setTimeout(() => {
                        const clsSel = document.getElementById('studentClassSelect');
                        if(clsSel) {
                            clsSel.value = matchedUser.class;
                            clsSel.dispatchEvent(new Event('change')); // 触发筛选
                        }
                    }, 500);
                }
                else if (matchedUser.role === 'grade_director') {
                    // 级部主任：
                    // 1. 拥有修改成绩权限 (在 updateStudentScore 中控制)
                    // 2. 能接收消息 (需显示铃铛按钮)
                    // 3. 只能看本级部 (在 renderStudentDetails 中控制)
                    
                    UI.toast(`欢迎您，${matchedUser.class}年级主任`, "success");
                    
                    // 开启消息轮询 (复用管理员的逻辑)
                    const msgBtn = document.getElementById('admin-msg-btn');
                    if(msgBtn) msgBtn.style.display = 'block'; // 显示铃铛
                    
                    if (typeof IssueManager !== 'undefined') {
                        IssueManager.checkIssues(); // 立即查一次
                        // 每30秒轮询一次新消息
                        setInterval(() => IssueManager.checkIssues(), 30000);
                    }
                }
                /* 👆👆👆 🟢 结束 🟢 👆👆👆 */
            }

        } catch (err) {
            UI.loading(false);
            console.error(err);
            alert("登录异常中断：" + err.message);
        }
    },

    // 登出
    logout: function() {
        logAction('登出', '退出登录');
        sessionStorage.removeItem('CURRENT_USER');
        location.reload(); // 刷新页面最彻底，清除所有临时状态
    },

    // 应用视图权限 (配合 CSS data-role 属性)
    applyRoleView: function() {
        if(!this.currentUser) return;
        const role = this.currentUser.role;
        document.body.dataset.role = role;

        const msgBtn = document.getElementById('admin-msg-btn');
        if (msgBtn) {
            // 🟢 修改：允许 管理员、教务主任、级部主任、班主任 看到铃铛
            // 只有这些角色有资格处理申诉或查看通知
            if (role === 'admin' || role === 'director' || role === 'grade_director' || role === 'class_teacher') {
                msgBtn.style.display = 'block';
                
                // 启动消息轮询 (每30秒查一次，检查 IssueManager 是否已加载)
                if (typeof IssueManager !== 'undefined') {
                    IssueManager.checkIssues();
                    // 清除旧定时器防止重复
                    if (window.msgInterval) clearInterval(window.msgInterval);
                    window.msgInterval = setInterval(() => IssueManager.checkIssues(), 30000);
                }
            } else {
                msgBtn.style.display = 'none';
            }
        }

        // 添加或更新悬浮个人中心条 (包含修改密码)
        let btn = document.getElementById('logout-btn');
        
        if(!btn) {
            btn = document.createElement('div');
            btn.id = 'logout-btn';
            // 增加一点样式调整，让它更像一个工具条
            btn.style.display = 'flex';
            btn.style.gap = '10px';
            btn.style.alignItems = 'center';
            document.body.appendChild(btn);
        }

        // 渲染两个按钮：修改密码 | 退出
        btn.innerHTML = `
            <span onclick="openUserPasswordModal()" style="cursor:pointer; border-right:1px solid rgba(255,255,255,0.3); padding-right:10px; display:flex; align-items:center; gap:4px;" title="修改密码">
                <i class="ti ti-key"></i> 密码
            </span>
            <span onclick="Auth.logout()" style="cursor:pointer; display:flex; align-items:center; gap:4px;" title="退出登录">
                <i class="ti ti-logout"></i> ${this.currentUser.name}
            </span>
        `;
        
        // 注意：这里移除了 btn.onclick，因为点击事件直接写在 span 里的 HTML 中了
        // 🟢 [新增] 动态添加“账号管理”入口按钮 (针对有权用户)
        // 1. 获取当前用户角色
        const currentRole = this.currentUser.role;
        const allowedRoles = ['admin', 'director', 'grade_director', 'class_teacher'];
        
        // 2. 查找 header 里的工具栏容器 (通常是 header 的最后一个子元素的最后一个 div)
        // 根据 CSS 结构: header > div(flex) > div(toolbar)
        const toolbar = document.querySelector('header > div > div:last-child');
        
        // 3. 先移除旧按钮(防止重复添加)
        const oldBtn = document.getElementById('header-acc-mgr-btn');
        if(oldBtn) oldBtn.remove();

        // 4. 如果有权限且容器存在，插入按钮
        if (toolbar && allowedRoles.includes(currentRole)) {
            const mgrBtn = document.createElement('button');
            mgrBtn.id = 'header-acc-mgr-btn';
            mgrBtn.className = 'btn';
            // 样式微调：半透明背景，白色文字
            mgrBtn.style.cssText = 'background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); color:white; margin-right:5px; font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:5px;';
            mgrBtn.innerHTML = '<i class="ti ti-user-cog"></i> 账号';
            mgrBtn.title = "管理账号 / 重置密码";
            
            // 绑定点击事件：打开账号管理弹窗
            mgrBtn.onclick = () => AccountManager.open();
            
            // 5. 将按钮插入到工具栏的最前面 (作为第一个按钮显示)
            // 也可以改为 insertBefore 到特定按钮前，这里放最前比较显眼
            if (toolbar.firstChild) {
                toolbar.insertBefore(mgrBtn, toolbar.firstChild);
            } else {
                toolbar.appendChild(mgrBtn);
            }
        }
        // 🟢 [修正]：将以下代码移入 applyRoleView 函数内部，接在上面的代码后面

        // 🟢 [新增] 动态添加“数据管理”入口 (仅限 管理员/教务主任)
        const dataRoles = ['admin', 'director'];
        
        // 先移除旧按钮(防止重复)
        const oldDataBtn = document.getElementById('header-data-mgr-btn');
        if(oldDataBtn) oldDataBtn.remove();

        // 如果有权限且容器存在
        // 注意：这里的 role 和 toolbar 变量继承自 applyRoleView 函数顶部的定义
        if (toolbar && dataRoles.includes(role)) {
            const dataBtn = document.createElement('button');
            dataBtn.id = 'header-data-mgr-btn';
            dataBtn.className = 'btn';
            // 样式：紫色背景，区别于账号管理
            dataBtn.style.cssText = 'background:rgba(124, 58, 237, 0.4); border:1px solid rgba(255,255,255,0.4); color:white; margin-right:5px; font-size:12px; padding:6px 12px; display:inline-flex; align-items:center; gap:5px;';
            dataBtn.innerHTML = '<i class="ti ti-database-edit"></i> 数据';
            dataBtn.title = "管理原始成绩和教师设置";
            
            // 绑定点击事件
            dataBtn.onclick = () => DataManager.open();
            
            // 插入到工具栏最前面 (作为最高频功能，排在账号按钮前面)
            if (toolbar.firstChild) {
                toolbar.insertBefore(dataBtn, toolbar.firstChild);
            } else {
                toolbar.appendChild(dataBtn);
            }
        }
        
    },

    // 👨‍👩‍👧 渲染家长专属视图 (完全隔离)
    renderParentView: function() {
        // 1. 彻底隐藏主界面及所有干扰元素 (防止透视)
        const app = document.getElementById('app');
        const header = document.querySelector('header');
        const nav = document.querySelector('.nav-wrapper');
        const overlay = document.getElementById('login-overlay');
        const loader = document.getElementById('global-loader');

        if(app) app.style.display = 'none'; // 关键：隐藏主应用
        if(header) header.style.display = 'none';
        if(nav) nav.style.display = 'none';
        if(overlay) overlay.style.display = 'none';
        if(loader) loader.classList.add('hidden');

        // 2. 创建或重置家长容器
        let container = document.getElementById('parent-view-container');
        if(!container) {
            container = document.createElement('div');
            container.id = 'parent-view-container';
            document.body.appendChild(container);
        }
        
        // 确保容器可见
        container.style.display = 'block';

        // 3. 移动端视口适配 (防止表格太宽看不全)
        let viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes');
        }

        // A. 立即渲染骨架屏 (Skeleton Screen)
        container.innerHTML = `
            <div class="sk-card skeleton"><div class="sk-header"></div></div>
            <div class="sk-card skeleton"><div class="sk-block" style="width:80%"></div></div>
            <div style="display:flex; gap:10px;">
                <div class="sk-card skeleton" style="flex:1;"><div class="sk-chart"></div></div>
                <div class="sk-card skeleton" style="flex:1;"><div class="sk-chart"></div></div>
            </div>
        `;

        // 延时加载数据，给骨架屏一点展示时间
        setTimeout(() => {
            if(!RAW_DATA || RAW_DATA.length === 0) {
                container.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">
                    <i class="ti ti-database-off" style="font-size:48px; margin-bottom:10px; display:block;"></i>
                    数据加载中...<br><small>请稍候 (如长时间无反应请刷新)</small>
                </div>`;
                return;
            }

            // 精确查找：姓名 + 班级
            const stu = RAW_DATA.find(s => s.name === this.currentUser.name && s.class === this.currentUser.class);
            
            if(!stu) {
                container.innerHTML = `<div style="text-align:center; padding:50px; color:red;">
                    ❌ 未找到学生【${this.currentUser.name}】（${this.currentUser.class}班）的数据。<br>
                    请联系班主任确认名单是否已上传。
                </div>`;
                return;
            }

            // 渲染报表 HTML
            let reportHtml = renderSingleReportCardHTML(stu, 'H5');
            
            // 去除不必要的按钮和输入框
            reportHtml = reportHtml.replace(/<button.*AI 深度生成.*<\/button>/, '');
            const teacherName = TEACHER_MAP[stu.class+'_班主任'] || '班主任';
            reportHtml = reportHtml.replace(/<input.*id="inp-teacher-name".*?>/, `<span style="font-weight:bold">${teacherName}</span>`);

            // 安全处理：防止姓名或班级中有引号导致 JS 报错
            const safeName = stu.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeClass = stu.class.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeSchool = stu.school.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // 追加底部功能栏 (申诉 & 退出)
            reportHtml += `
                <div style="text-align:center; margin-top:30px; padding-bottom:80px; border-top:1px dashed #e5e7eb; padding-top:20px;">
                    <p style="font-size:14px; color:#64748b; margin-bottom:15px;">数据有疑问？</p>
                    
                    <!-- 核心修复：使用转义后的变量 -->
                    <button class="btn" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; font-size:16px; padding:10px 20px; margin-bottom:20px;" 
                            onclick="IssueManager.openSubmitModal('${safeName}', '${safeClass}', '${safeSchool}')">
                        <i class="ti ti-alert-circle"></i> 申请成绩核查
                    </button>
                    
                    <br>
                    <button onclick="Auth.logout()" style="background:none; border:none; color:#94a3b8; text-decoration:underline; font-size:14px; cursor:pointer;">
                        退出登录
                    </button>
                </div>
            `;

            container.innerHTML = reportHtml;

            // 渲染图表 (Canvas)
            setTimeout(() => {
                try {
                    if(typeof renderRadarChart === 'function') renderRadarChart(stu);                        
                    if(typeof renderVarianceChart === 'function') renderVarianceChart(stu);
                } catch(e) { console.error("图表渲染失败:", e); }
            }, 200);

        }, 500); 
    },

    // 辅助：渲染生成账号时的学校列表
    renderSchoolCheckboxes: function() {
        const container = document.getElementById('admin-gen-school-list');
        if(!container) return; // 如果找不到容器（比如非管理员），直接返回，不报错
        
        if(typeof SCHOOLS === 'undefined' || Object.keys(SCHOOLS).length === 0) {
            container.innerHTML = '<div style="color:#999; text-align:center; padding:10px;">暂无数据，请先上传成绩</div>';
            return;
        }

        let html = '';
        Object.keys(SCHOOLS).forEach(sch => {
            html += `
                <label style="display:flex; align-items:center; margin-bottom:3px; cursor:pointer;">
                    <input type="checkbox" class="gen-school-check" value="${sch}" checked>
                    <span style="margin-left:5px;">${sch}</span>
                </label>
            `;
        });
        container.innerHTML = html;
    },

    // 辅助：全选/反选
    toggleAllSchools: function(check) {
        document.querySelectorAll('.gen-school-check').forEach(el => el.checked = check);
    },

    // 🛠️ 管理员工具：批量生成账号 (支持指定学校增量更新)
    generateAccounts: function() {
        if(!RAW_DATA.length) return alert("请先在【数据中心】上传成绩数据");
        
        // 1. 获取界面上勾选的学校
        const checkboxes = document.querySelectorAll('.gen-school-check:checked');
        const selectedSchools = Array.from(checkboxes).map(cb => cb.value);

        if(selectedSchools.length === 0) {
            return alert("请至少勾选一所学校！\n(如果列表为空，请先上传数据)");
        }
        
        if(!confirm(`⚠️ 确定要为选中的 [${selectedSchools.length}] 所学校生成账号吗？\n\n1. 仅生成/更新选中学校的学生和老师账号。\n2. 未选中学校的现有账号将【保留】。\n3. 默认初始密码均为 123456。`)) return;

        let countParentNew = 0;
        let countParentUpd = 0;
        let countTeacherNew = 0;

        // --- A. 生成家长账号 (增量更新) ---
        // 策略：遍历数据，如果该学生属于选中学校，则更新/添加；否则不动。
        
        // 筛选出属于选中學校的学生
        const targetStudents = RAW_DATA.filter(s => selectedSchools.includes(s.school));
        
        targetStudents.forEach(s => {
            // 检查是否已存在账号 (唯一键：姓名+班级)
            const existIdx = this.db.parents.findIndex(p => p.name === s.name && p.class === s.class);
            
            const newAccount = {
                name: s.name,
                class: s.class,
                pass: '123456' // 默认密码
            };

            if (existIdx >= 0) {
                // 已存在，强制重置密码为默认 (也可选择不重置，看需求)
                this.db.parents[existIdx] = newAccount; 
                countParentUpd++;
            } else {
                // 不存在，添加
                this.db.parents.push(newAccount);
                countParentNew++;
            }
        });

        // --- B. 生成教师账号 (增量更新) ---
        // 策略：先找到选中学校涉及的所有班级，再反查 TEACHER_MAP 里的老师
        const targetClasses = new Set();
        targetStudents.forEach(s => targetClasses.add(s.class));
        
        // 收集涉及到的老师名字 (去重)
        let targetTeachers = new Set();
        if(Object.keys(TEACHER_MAP).length > 0) {
            Object.keys(TEACHER_MAP).forEach(key => {
                // key 格式通常为 "701_语文" 或 "701_班主任"
                const [cls, sub] = key.split('_');
                // 如果这个班级属于选中的学校
                if (targetClasses.has(cls)) {
                    targetTeachers.add(TEACHER_MAP[key]);
                }
            });
        } else {
            console.warn("未配置教师任课表，仅能生成家长账号");
        }

        targetTeachers.forEach(tName => {
            // 检查是否存在
            const existIdx = this.db.teachers.findIndex(t => t.name === tName);
            const newAccount = {
                name: tName,
                pass: 'yssy2016', // 🟢 修改点：将 '123456' 改为 'yssy2016'
                grade: 'all'
            };

            if (existIdx >= 0) {
                // 教师账号通常跨年级，如果已存在，一般不重置密码，或者也重置
                this.db.teachers[existIdx].pass = 'yssy2016'; // 🟢 修改点：将 '123456' 改为 'yssy2016'
            } else {
                this.db.teachers.push(newAccount);
                countTeacherNew++;
            }
        });

        // 4. 保存结果到本地存储
        localStorage.setItem('SYS_USERS', JSON.stringify(this.db));
        
        let msg = `✅ 操作完成！\n\n`;
        msg += `覆盖学校：${selectedSchools.join(', ')}\n`;
        msg += `家长账号：新增 ${countParentNew} / 重置 ${countParentUpd}\n`;
        msg += `教师账号：新增 ${countTeacherNew} / 涉及 ${targetTeachers.size}\n`;
        msg += `\n(提示：未选中学校的旧账号已自动保留)`;
        
        // 🚫 已注释掉成功后的弹窗，避免干扰
        // alert(msg);
        
        // 仅在右下角显示轻提示
        if(window.UI) UI.toast("✅ 账号生成操作完成", "success");
    },


     // 🛠️ 管理员工具：导出账号明细 (新功能)
    exportAccounts: function() {
        if(!this.db.teachers.length && !this.db.parents.length) {
            return alert("当前没有生成任何普通账号，请先点击“一键生成”。");
        }

        // 1. 获取界面上勾选的学校
        const checkboxes = document.querySelectorAll('.gen-school-check:checked');
        const selectedSchools = Array.from(checkboxes).map(cb => cb.value);
        
        // 判断是否启用了筛选 (如果有勾选，且勾选数量小于总学校数，则视为筛选)
        // 逻辑优化：只要有勾选，就只导出勾选的；如果一个都没勾(或全没勾)，则导出全部
        const isFiltering = selectedSchools.length > 0;

        const wb = XLSX.utils.book_new();
        // 表头增加一列 "所属学校 (仅导出时计算)"
        const data = [['角色', '用户名/姓名', '登录班级 (家长必填)', '密码', '所属学校/备注']];

        // --- A. 写入管理员/主任 (始终导出，不受筛选影响) ---
        data.push(['管理员', 'admin', '-', this.db.admin.pass, '最高权限']);
        const dirPass = this.db.director ? this.db.director.pass : 'admin123';
        data.push(['教务主任', 'director', '-', dirPass, '查看除账号外所有信息']);

        // --- 准备筛选辅助数据 ---
        let validClasses = new Set();   // 选中学校包含的所有班级
        
        if (isFiltering) {
            // 遍历 RAW_DATA 构建白名单，比每次 find 快
            RAW_DATA.forEach(s => {
                if (selectedSchools.includes(s.school)) {
                    validClasses.add(s.class);
                }
            });
        }

        // --- B. 写入教师信息 ---
        let teacherCount = 0;
        this.db.teachers.forEach(t => {
            let shouldExport = true;
            if (isFiltering) {
                // 检查该老师是否任教于选中的学校 (通过班级反查)
                let isRelevant = false;
                // 遍历 TEACHER_MAP 查找该老师教的班级
                for (const [key, tName] of Object.entries(TEACHER_MAP)) {
                    if (tName === t.name) {
                        const [cls, sub] = key.split('_');
                        if (validClasses.has(cls)) {
                            isRelevant = true;
                            break;
                        }
                    }
                }
                shouldExport = isRelevant;
            }

            if (shouldExport) {
                data.push(['教师', t.name, '-', t.pass, isFiltering ? '关联选中学校' : '']);
                teacherCount++;
            }
        });

        // --- C. 写入家长信息 ---
        let parentCount = 0;
        this.db.parents.forEach(p => {
            let shouldExport = true;
            let schoolName = '';

            // 尝试找回学校名以便填写在备注里 (账号库里没存学校，需要回查 RAW_DATA)
            const stuRecord = RAW_DATA.find(r => r.name === p.name && r.class === p.class);
            if (stuRecord) schoolName = stuRecord.school;

            if (isFiltering) {
                // 只有当学生属于选中学校时才导出
                if (stuRecord && selectedSchools.includes(stuRecord.school)) {
                    shouldExport = true;
                } else {
                    shouldExport = false;
                }
            }

            if (shouldExport) {
                data.push(['家长', p.name, p.class, p.pass, schoolName || '未知/已删除']);
                parentCount++;
            }
        });

        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{wch:10}, {wch:20}, {wch:15}, {wch:15}, {wch:25}];
        
        let fileName = `账号清单_${new Date().toLocaleDateString()}.xlsx`;
        if (isFiltering) {
            // 如果只选了一个学校，文件名带上学校名
            if (selectedSchools.length === 1) fileName = `${selectedSchools[0]}_账号清单.xlsx`;
            else fileName = `特定学校账号清单(共${selectedSchools.length}校).xlsx`;
        }

        XLSX.utils.book_append_sheet(wb, ws, "账号列表");
        XLSX.writeFile(wb, fileName);
        
        // 🚫 已注释掉导出成功后的弹窗
        /*
        if (isFiltering) {
            alert(`✅ 已导出选定范围的账号：\n教师: ${teacherCount} 人\n家长: ${parentCount} 人`);
        }
        */
    },

    // 🟢 [新增] 向云端数据库添加账号
    
    // 🟢 [修改] 适配级部主任和班主任的手动添加
    addCloudAccount: async function() {
        const role = document.getElementById('manual-role').value;
        const username = document.getElementById('manual-name').value.trim();
        const password = document.getElementById('manual-pass').value.trim();
        const school = document.getElementById('manual-school').value.trim();
        
        // 获取各个输入框的元素
        const classInput = document.getElementById('manual-class');
        const gradeInput = document.getElementById('manual-grade');

        // 根据角色获取 "class_name" 字段应该存什么
        let className = "";
        
        if (role === 'parent' || role === 'class_teacher') {
            // 必须检查元素是否存在
            if(classInput) className = classInput.value.trim(); 
        } 
        else if (role === 'grade_director') {
            // 必须检查元素是否存在
            if(gradeInput) className = gradeInput.value.trim(); 
        }
        // 普通教师给一个默认值，防止数据库非空报错
        else if (role === 'teacher') {
            className = "教师"; 
        }

        // --- 校验逻辑 ---
        // 1. 账号密码必填
        if (!username || !password) return alert("❌ 请填写账号和密码");
        
        // 2. 学校必填 (除了管理员)
        if (role !== 'admin' && !school) return alert("❌ 请填写所属学校");

        // 3. 班级/年级必填校验
        if ((role === 'parent' || role === 'class_teacher') && !className) {
            return alert("❌ 请填写【班级】(例如: 701)");
        }
        if (role === 'grade_director' && !className) {
            return alert("❌ 请填写【级部/年级】(例如: 7)");
        }

        UI.loading(true, "正在写入数据库...");

        const newUserData = {
            username: username,
            password: password,
            role: role,
            school: role === 'admin' ? '系统' : school, // 管理员默认学校
            class_name: className // 这是一个复用字段：对家长/班主任是班级，对级部主任是年级
        };

        // 执行插入 (使用 upsert 以便支持“更新”操作，即覆盖旧账号)
        const { error } = await sbClient
            .from('system_users')
            .upsert(newUserData, { onConflict: 'username' });

        UI.loading(false);

        if (error) {
            console.error(error);
            alert("❌ 操作失败：" + error.message);
        } else {
            UI.toast(`✅ 账号 [${username}] 已添加/更新成功！`, "success");
            // 清空姓名输入框，方便继续添加
            document.getElementById('manual-name').value = '';
            // 如果是家长，不清空班级，方便连续添加同班学生
            if(role !== 'parent') {
                 if(classInput) classInput.value = '';
                 if(gradeInput) gradeInput.value = '';
            }
        }
    },
    // 🛠️ 管理员工具：批量同步本地生成的账号到云端 (V4 智能容错版)
    // 特性：自动去重 + 失败自动降级为单条上传 + 精确报错
    syncBatchToCloud: async function() {
        if (!sbClient) return alert("❌ 云端数据库连接失败。");

        const parents = this.db.parents || [];
        const teachers = this.db.teachers || [];
        
        if (parents.length === 0 && teachers.length === 0) {
            return alert("⚠️ 本地账号为空！请先点击【👤 一键生成所有账号】。");
        }

        if (!confirm(`⚠️ 准备同步账号到云端：\n\n👨‍👩‍👧 家长：${parents.length}\n👨‍🏫 教师：${teachers.length}\n\n确定覆盖云端数据吗？`)) return;

        UI.loading(true, "正在清洗并去重数据...");

        // 1. 构建映射表与去重容器
        const uniqueMap = new Map(); // key: username, value: dataObj
        const globalDefaultSchool = window.MY_SCHOOL || "默认学校";
        
        // 辅助：查找学校
        const getSchool = (name, cls) => {
            // 尝试从 RAW_DATA 查找准确学校
            if(typeof RAW_DATA !== 'undefined') {
                const s = RAW_DATA.find(r => r.name === name && r.class == cls);
                if(s) return s.school;
            }
            return globalDefaultSchool;
        };

        // 辅助：强力清洗字符串 (去空格、去特殊符)
        const cleanStr = (str) => String(str || "").trim().replace(/\s+/g, "");

        // --- A. 处理家长数据 ---
        parents.forEach(p => {
            const user = cleanStr(p.name);
            if(!user) return;
            
            uniqueMap.set(user, {
                username: user,
                password: cleanStr(p.pass) || "123456",
                role: 'parent',
                school: getSchool(p.name, p.class),
                class_name: cleanStr(p.class) // 班级
            });
        });

        // --- B. 处理教师数据 (优先级高，覆盖同名家长) ---
        // 预处理教师学校映射
        const teaSchMap = {};
        if(typeof TEACHER_MAP !== 'undefined') {
            Object.entries(TEACHER_MAP).forEach(([k, v]) => {
                const cls = k.split('_')[0];
                // 简易反查：遍历学校找班级
                if(typeof SCHOOLS !== 'undefined') {
                    for(let sName in SCHOOLS) {
                        if(SCHOOLS[sName].students.some(s => s.class == cls)) {
                            teaSchMap[v] = sName; break;
                        }
                    }
                }
            });
        }

        teachers.forEach(t => {
            const user = cleanStr(t.name);
            if(!user) return;

            uniqueMap.set(user, { // 写入 Map，自动覆盖同名 Key
                username: user,
                password: cleanStr(t.pass) || "123456",
                role: 'teacher',
                school: teaSchMap[t.name] || globalDefaultSchool,
                class_name: '教师'
            });
        });

        const batchData = Array.from(uniqueMap.values());
        console.log(`[同步准备] 原始:${parents.length+teachers.length} -> 去重后:${batchData.length}`);

        // --- C. 智能分批上传 ---
        const BATCH_SIZE = 10; // 保守批次大小
        let successCount = 0;
        let failCount = 0;
        let errorDetails = [];

        // 定义单条重试函数
        const uploadOneByOne = async (items) => {
            let ok = 0;
            for(let item of items) {
                const { error } = await sbClient.from('system_users').upsert(item, { onConflict: 'username' });
                if(error) {
                    console.warn(`❌ 单条写入失败 [${item.username}]:`, error.message);
                    failCount++;
                    errorDetails.push(`${item.username}: ${error.message}`);
                } else {
                    ok++;
                    successCount++;
                }
            }
            return ok;
        };

        try {
            for (let i = 0; i < batchData.length; i += BATCH_SIZE) {
                const chunk = batchData.slice(i, i + BATCH_SIZE);
                
                // 1. 尝试批量写入
                const { error } = await sbClient.from('system_users').upsert(chunk, { onConflict: 'username' });

                const pct = Math.round(((i + chunk.length) / batchData.length) * 100);
                
                if (error) {
                    console.warn(`⚠️ 批次 ${Math.ceil(i/BATCH_SIZE)+1} 报错 (HTTP 500/409)，自动降级为单条上传模式...`);
                    // 2. 批量失败，自动降级为单条循环
                    await uploadOneByOne(chunk);
                } else {
                    successCount += chunk.length;
                }
                
                UI.loading(true, `☁️ 同步中... ${pct}% (成功:${successCount} / 失败:${failCount})`);
                // 稍微延时防止数据库压力过大
                if(failCount > 50) throw new Error("错误过多，中止上传"); // 熔断机制
                await new Promise(r => setTimeout(r, 50));
            }

            UI.loading(false);

            if (failCount > 0) {
                console.error("失败详情:", errorDetails);
                alert(`⚠️ 同步完成，但有 ${failCount} 个账号失败！\n\n✅ 成功：${successCount}\n❌ 失败：${failCount}\n\n可能原因：账号包含非法字符或数据库字段超长。\n按 F12 查看控制台可看具体失败名单。`);
            } else {
                UI.toast(`✅ 完美同步！共 ${successCount} 个账号已上线`, "success");
                if(window.Logger) Logger.log('同步账号', `同步了 ${successCount} 个账号`);
            }

        } catch (e) {
            UI.loading(false);
            console.error(e);
            alert("❌ 同步中断：" + e.message);
        }
    },

    // 🛠️ 管理员工具：批量删除云端账号 (保留管理员)
    deleteCloudAccounts: async function() {
        if (!sbClient) return alert("❌ 云端数据库连接失败。");

        // 1. 第一重确认
        if (!confirm("⚠️【高风险操作】⚠️\n\n您确定要清空云端数据库中的所有【家长】和【教师】账号吗？\n\n注意：\n1. 此操作不可撤销！\n2. 管理员账号会被保留，不会被删除。\n3. 删除后用户将无法登录，直到您再次同步。")) {
            return;
        }

        // 2. 第二重确认 (防止误触)
        const input = prompt("🔴 请输入 '确认删除' 四个字以执行清空操作：");
        if (input !== "确认删除") {
            return alert("操作已取消。");
        }

        UI.loading(true, "正在清理云端账号库...");

        try {
            // 执行删除操作
            // 逻辑：删除所有 role 不等于 'admin' 和 'director' 的用户
            const { error, count } = await sbClient
                .from('system_users')
                .delete({ count: 'exact' }) // 请求返回删除的数量
                .neq('role', 'admin')       // 保护管理员
                .neq('role', 'director');   // 保护教务主任

            UI.loading(false);

            if (error) {
                throw error;
            }

            alert(`✅ 清理完成！\n共删除了 ${count !== null ? count : '若干'} 个云端账号。\n\n现在您可以重新生成并同步新名单了。`);

            // 🛡️ [日志埋点] 记录清空账号操作
            Logger.log('清空账号', `管理员执行了清空云端普通账号操作 (影响:${count}人)`);

        } catch (e) {
            UI.loading(false);
            console.error(e);
            alert("❌ 删除失败：" + e.message);
        }
    },
 
    exportAllCloudAccounts: async function() {
        if (!sbClient) return alert("❌ 云端数据库未连接，无法导出。");
        
        if (!confirm("⚠️ 准备从云端下载所有账号数据。\n\n这将包含数据库中存储的：\n1. 管理员\n2. 教师/班主任/主任\n3. 家长/学生\n\n确定要导出吗？")) return;

        UI.loading(true, "正在从云端拉取所有账号...");

        try {
            // 1. 从 Supabase 获取所有用户 (限制10000条，一般够用，不够需分页)
            const { data, error } = await sbClient
                .from('system_users')
                .select('*')
                .order('school', { ascending: true }) // 按学校排序
                .order('role', { ascending: true });  // 再按角色排序
                
            if (error) throw error;
            
            if (!data || data.length === 0) {
                throw new Error("云端数据库为空，没有账号可导出。");
            }

            // 2. 准备 Excel 数据
            const headers = ['角色', '学校', '班级/范围', '账号/姓名', '密码 (如可见)'];
            const excelData = [headers];

            // 角色名称映射字典
            const roleMap = {
                'admin': '👑 管理员',
                'director': '🎓 教务主任',
                'grade_director': '🚀 级部主任',
                'class_teacher': '📋 班主任',
                'teacher': '👨‍🏫 科任教师',
                'parent': '👨‍👩‍👧 家长/学生'
            };

            data.forEach(u => {
                const roleName = roleMap[u.role] || u.role;
                excelData.push([
                    roleName,
                    u.school || '-',       // 学校
                    u.class_name || '-',   // 班级
                    u.username,            // 账号
                    u.password             // 密码
                ]);
            });

            // 3. 生成并下载 Excel
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            // 设置列宽 (美观)
            ws['!cols'] = [{wch:15}, {wch:20}, {wch:15}, {wch:20}, {wch:15}];
            
            XLSX.utils.book_append_sheet(wb, ws, "云端全量账号");
            
            const fileName = `云端全量账号备份_${new Date().toLocaleDateString().replace(/\//g,'-')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
            UI.loading(false);
            UI.toast(`✅ 导出成功！共 ${data.length} 条数据`, "success");

        } catch (err) {
            UI.loading(false);
            console.error(err);
            alert("❌ 导出失败: " + err.message);
        }
    },
 
    // 🛠️ 管理员工具：清除账号
    clearAccounts: function() {
        if(!confirm("⚠️ 确定清空所有教师和家长账号吗？\n(管理员密码不会被清除)")) return;
        this.db.teachers = [];
        this.db.parents = [];
        localStorage.setItem('SYS_USERS', JSON.stringify(this.db));
        alert("✅ 所有普通账号已清空");
    }
};

// 🟢 [修复] 确保 Auth 挂载到 window 以便 HTML onclick 访问
window.Auth = Auth;

const IssueManager = {
    isHistoryMode: false, // 状态标记：是否处于历史记录模式

    // 1. 打开家长申诉弹窗
    openSubmitModal: function(name, cls, school) {
        document.getElementById('issue-student-name').value = name;
        document.getElementById('issue-student-class').value = cls;
        document.getElementById('issue-student-school').value = school;
        // 清空旧内容
        const descArea = document.getElementById('issue-desc');
        descArea.value = '';
        descArea.style.borderColor = '#d1d5db'; // 重置边框颜色
        
        // 动态插入语音按钮 (如果还没加过)
        if (!document.getElementById('btn-voice-input-issue')) {
            const label = descArea.previousElementSibling; // 找到 Label
            const voiceBtn = document.createElement('span');
            voiceBtn.id = 'btn-voice-input-issue';
            voiceBtn.innerHTML = '🎤 语音输入';
            voiceBtn.style.cssText = 'float:right; font-size:12px; color:var(--primary); cursor:pointer; margin-right:5px;';
            voiceBtn.onclick = function() {
                // 调用简单的 Web Speech API
                if (!('webkitSpeechRecognition' in window)) return alert("您的浏览器不支持语音输入");
                const recognition = new webkitSpeechRecognition();
                recognition.lang = 'zh-CN';
                recognition.start();
                voiceBtn.innerText = '🔴 正在聆听...';
                recognition.onresult = function(event) {
                    descArea.value += event.results[0][0].transcript;
                    voiceBtn.innerText = '🎤 语音输入';
                };
                recognition.onerror = function() {
                    alert("语音识别失败，请手动输入");
                    voiceBtn.innerText = '🎤 语音输入';
                };
            };
            label.appendChild(voiceBtn);
        }
        document.getElementById('issue-submit-modal').style.display = 'flex';
    },

    // 2. 提交申诉 (家长端)
    submit: async function() {
        if (!sbClient) return alert("❌ 云端服务未连接，无法提交。");

        const name = document.getElementById('issue-student-name').value;
        const cls = document.getElementById('issue-student-class').value;
        const school = document.getElementById('issue-student-school').value;
        const type = document.getElementById('issue-type').value;
        const desc = document.getElementById('issue-desc').value.trim();
        const contact = document.getElementById('issue-contact').value.trim();

        // 实时验证：描述必填
        if (!desc) {
            const descArea = document.getElementById('issue-desc');
            descArea.style.borderColor = '#ef4444'; // 变红
            descArea.focus();
            
            // 使用 SweetAlert2 (如果有) 或 Toast 提示
            if(window.Swal) {
                Swal.fire({
                    icon: 'warning',
                    title: '请填写说明',
                    text: '为了老师能准确核实，请详细描述您遇到的问题。',
                    timer: 2000
                });
            } else {
                alert("请填写具体情况说明");
            }
            return;
        }

        UI.loading(true, "正在提交申请...");

        const { error } = await sbClient
            .from('issues')
            .insert([{
                student_name: name,
                student_class: cls,
                school: school,
                issue_type: type,
                description: desc,
                contact_info: contact,
                status: 'pending' // 默认为待处理
            }]);

        UI.loading(false);

        if (error) {
            alert("提交失败：" + error.message);
        } else {
            alert("✅ 申请已提交！\n教务处将尽快核查，请留意后续通知或老师反馈。");
            document.getElementById('issue-submit-modal').style.display = 'none';
            document.getElementById('issue-desc').value = '';
        }
    },

    // 3. 检查待处理消息 (红点轮询 - 核心权限逻辑)
    checkIssues: async function() {
        if (!sbClient) return;
        const user = typeof Auth !== 'undefined' ? Auth.currentUser : null;
        if (!user) return;

        // 基础条件是 status = pending
        let query = sbClient
            .from('issues')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        // 🟢 [新增] 权限过滤：确保红点数量只统计自己管辖范围内的
        if (user.role === 'grade_director') {
            // 级部主任：看本年级 (模糊匹配 "7%")
            if (user.class) query = query.ilike('student_class', `${user.class}%`);
        } else if (user.role === 'class_teacher') {
            // 🟢 班主任：只看本班 (精确匹配 "701")
            if (user.class) query = query.eq('student_class', user.class);
        } else if (user.role === 'director') {
            // 教务主任：看本校
            if (user.school) query = query.eq('school', user.school);
        }

        const { count, error } = await query;

        if (!error) {
            const badge = document.getElementById('msg-badge');
            if (badge) {
                if (count > 0) {
                    badge.innerText = count > 99 ? '99+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        }
    },

    // 4. 打开管理员处理面板
    openAdminPanel: async function() {
        this.isHistoryMode = false; // 默认进入看正常列表
        this.updateUIState();
        const modal = document.getElementById('admin-issue-modal');
        modal.style.display = 'flex';
        this.loadIssues();
    },

    // 切换 历史记录 / 正常视图
    toggleHistoryView: function() {
        this.isHistoryMode = !this.isHistoryMode;
        this.updateUIState();
        this.loadIssues(); // 重新加载数据
    },

    // 更新界面按钮状态
    updateUIState: function() {
        const titleEl = document.getElementById('issue-modal-title');
        const btnHistory = document.getElementById('btn-issue-history');
        const normalActions = document.getElementById('issue-normal-actions');
        const historyActions = document.getElementById('issue-history-actions');
        const tipBar = document.getElementById('issue-tip-bar');
        
        // 重置全选状态
        if(document.getElementById('issue-check-all')) document.getElementById('issue-check-all').checked = false;
        if(document.getElementById('issue-history-check-all')) document.getElementById('issue-history-check-all').checked = false;

        if (this.isHistoryMode) {
            titleEl.innerHTML = '<i class="ti ti-trash"></i> 删除历史记录 (回收站)';
            titleEl.style.color = '#666';
            btnHistory.innerHTML = '<i class="ti ti-arrow-back-up"></i> 返回列表';
            btnHistory.className = 'btn btn-sm btn-primary';
            normalActions.style.display = 'none';
            historyActions.style.display = 'flex';
            tipBar.style.display = 'none';
        } else {
            titleEl.innerHTML = '<i class="ti ti-bell"></i> 申诉反馈中心';
            titleEl.style.color = 'var(--primary)';
            btnHistory.innerHTML = '<i class="ti ti-history"></i> 查看删除记录';
            btnHistory.className = 'btn btn-sm btn-gray';
            normalActions.style.display = 'flex';
            historyActions.style.display = 'none';
            tipBar.style.display = 'block';
        }
    },

    // 全选/反选
    toggleSelectAll: function(source) {
        const checkboxes = document.querySelectorAll('.issue-item-check');
        checkboxes.forEach(cb => cb.checked = source.checked);
    },

    // 获取选中的ID
    getCheckedIds: function() {
        const checkboxes = document.querySelectorAll('.issue-item-check:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    },

    // 5. 加载申诉列表 (列表渲染 - 核心权限逻辑)
    loadIssues: async function() {
        const listEl = document.getElementById('admin-issue-list');
        listEl.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">⏳ 加载中...</div>';

        const user = typeof Auth !== 'undefined' ? Auth.currentUser : null;
        
        // 构建查询
        let query = sbClient
            .from('issues')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        // 状态过滤 (正常 vs 历史)
        if (this.isHistoryMode) {
            query = query.eq('status', 'deleted');
        } else {
            query = query.neq('status', 'deleted');
        }

        // 🟢 [新增] 权限过滤 (确保只能看到自己管辖的班级)
        if (user && user.role === 'grade_director') {
            if (user.class) query = query.ilike('student_class', `${user.class}%`);
        } else if (user && user.role === 'class_teacher') {
            // 🟢 班主任过滤：强制匹配 student_class == 班级名
            if (user.class) query = query.eq('student_class', user.class);
        } else if (user && user.role === 'director') {
            if (user.school) query = query.eq('school', user.school);
        }

        const { data, error } = await query;

        if (error) {
            listEl.innerHTML = `<div style="color:red; text-align:center;">加载失败: ${error.message}</div>`;
            return;
        }

        if (!data || data.length === 0) {
            listEl.innerHTML = '<div style="text-align:center; padding:40px; color:#999;">📭 暂无相关记录</div>';
            return;
        }

        let html = '';
        data.forEach(item => {
            const time = new Date(item.created_at).toLocaleString();
            const isPending = item.status === 'pending';
            const isDeleted = item.status === 'deleted';
            
            let statusBadge = '';
            let actionBtn = '';

            if (isDeleted) {
                statusBadge = `<span class="badge" style="background:#9ca3af; color:white;">已删除</span>`;
                actionBtn = `<span style="font-size:12px; color:#999;">已删除</span>`;
            } else {
                statusBadge = isPending 
                    ? `<span class="badge" style="background:#ef4444; color:white;">待处理</span>` 
                    : `<span class="badge" style="background:#10b981; color:white;">已解决</span>`;
                
                actionBtn = isPending 
                    ? `<button class="btn btn-sm btn-primary" onclick="IssueManager.resolve(${item.id})">✅ 标记已阅/解决</button>` 
                    : `<span style="font-size:12px; color:#ccc;">已归档</span>`;
            }

            html += `
                <div style="background:white; border:1px solid #e2e8f0; border-left:4px solid ${isPending?'#ef4444':(isDeleted?'#9ca3af':'#10b981')}; border-radius:8px; padding:15px; margin-bottom:10px; display:flex; gap:10px;">
                    <div style="display:flex; align-items:center;">
                        <input type="checkbox" class="issue-item-check" value="${item.id}" style="transform:scale(1.2); cursor:pointer;">
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <div style="font-weight:bold; color:#333;">
                                ${item.school} · ${item.student_class} · ${item.student_name}
                            </div>
                            <div style="font-size:12px; color:#64748b;">${time}</div>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px; font-size:13px;">
                            <span style="background:#f3f4f6; padding:2px 6px; border-radius:4px;">${item.issue_type}</span>
                            ${statusBadge}
                        </div>
                        <div style="background:#f8fafc; padding:10px; border-radius:4px; font-size:14px; color:#475569; margin-bottom:10px;">
                            ${item.description}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-size:12px; color:#0369a1;">📞 联系: ${item.contact_info || '无'}</div>
                            <div>${actionBtn}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        listEl.innerHTML = html;
    },

    // 6. 单条处理
    resolve: async function(id) {
        if (!confirm("确认已核实并处理该问题了吗？\n标记为已解决后，该条目将不再显示红点。")) return;
        const { error } = await sbClient.from('issues').update({ status: 'resolved' }).eq('id', id);
        if (error) alert("操作失败：" + error.message);
        else { this.loadIssues(); this.checkIssues(); }
    },

    // 7. 🟢 [新功能] 批量软删除 (移入历史)
    batchSoftDelete: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");
        if (!confirm(`确定要删除选中的 ${ids.length} 条记录吗？\n(删除后可在“历史记录”中找回)`)) return;

        UI.loading(true, "正在移除...");
        // 将状态改为 deleted
        const { error } = await sbClient.from('issues').update({ status: 'deleted' }).in('id', ids);
        UI.loading(false);

        if (error) alert("删除失败: " + error.message);
        else {
            UI.toast(`已删除 ${ids.length} 条记录`, 'success');
            this.loadIssues(); // 重新加载，已删除的条目会消失
            this.checkIssues(); // 刷新红点
            document.getElementById('issue-check-all').checked = false;
        }
    },

    // 8. 🟢 [新功能] 批量还原
    batchRestore: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");
        
        UI.loading(true, "正在还原...");
        // 还原为 resolved (已读)，比较安全
        const { error } = await sbClient.from('issues').update({ status: 'resolved' }).in('id', ids);
        UI.loading(false);

        if (error) alert("还原失败: " + error.message);
        else {
            UI.toast(`已还原 ${ids.length} 条记录`, 'success');
            this.loadIssues(); // 重新加载，还原的条目会从历史列表中消失
            document.getElementById('issue-history-check-all').checked = false;
        }
    },

    // 9. 🟢 [新功能] 批量彻底删除 (物理删除)
    batchHardDelete: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");
        
        // 双重确认，防止误删
        if (!confirm(`⚠️ 高能预警 ⚠️\n\n确定要【彻底删除】选中的 ${ids.length} 条记录吗？\n此操作不可恢复！`)) return;

        UI.loading(true, "正在彻底粉碎数据...");
        const { error } = await sbClient.from('issues').delete().in('id', ids);
        UI.loading(false);

        if (error) alert("删除失败: " + error.message);
        else {
            UI.toast(`彻底删除了 ${ids.length} 条记录`, 'success');
            this.loadIssues(); // 重新加载，数据将永久消失
            document.getElementById('issue-history-check-all').checked = false;
        }
    }
};

// 🟢 [修复] 确保 IssueManager 挂载到 window 以便 HTML onclick 访问
window.IssueManager = IssueManager;
