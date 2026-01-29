// Worker 管理 + 弹窗兼容 + 操作日志 + 账号管理

// 2. Worker 管理器
const WorkerAPI = {
    worker: null,
    init() {
        if (this.worker) return;
        const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
    },
    run(data) {
        this.init();
        return new Promise((resolve, reject) => {
            this.worker.onmessage = (e) => {
                if (e.data.status === 'ok') resolve(e.data);
                else reject(e.data.msg);
            };
            this.worker.onerror = (e) => reject(e.message);
            
            // 为了传输效率，剥离 SCHOOLS 中的 students 引用
            const schoolsLite = {};
            Object.keys(data.SCHOOLS).forEach(k => {
                const { students, ...rest } = data.SCHOOLS[k];
                schoolsLite[k] = rest;
            });

            this.worker.postMessage({ 
                cmd: 'PROCESS_ALL', 
                data: { ...data, SCHOOLS_LITE: schoolsLite } 
            });
        });
    }
};

// 【魔法】劫持原生 alert，你旧代码里的 alert 都会自动变漂亮
// 升级版：使用 SweetAlert2 替代原生弹窗
window.alert = function(msg, icon = 'info') {
    if(typeof Swal !== 'undefined') {
        Swal.fire({
            text: msg,
            icon: (msg.includes('成功') || msg.includes('✅')) ? 'success' : ((msg.includes('失败') || msg.includes('错误')) ? 'error' : 'info'),
            confirmButtonColor: '#4f46e5',
            timer: 2000,
            timerProgressBar: true
        });
    } else {
        // 降级处理
        UI.toast(msg);
    }
};

// 👇👇👇 ✋ 🔴 [修复重点开始]：调整代码顺序，防止递归死循环 🔴 ✋ 👇👇👇

// 🟢 [修正步骤 1]：必须在重写之前，先备份浏览器原生的 confirm 函数！
// 之前代码把这行放在了后面，导致备份的是“新函数自己”，从而引发死循环。
if(!window.originalConfirm) window.originalConfirm = window.confirm;

// 🟢 [修正步骤 2]：然后再重写 window.confirm
// (这是为了让 window.confirm = async function 变成异步，虽然这里暂时还是同步调用)
window.confirm = function(msg) {
    // 注意：原生的 confirm 是同步阻塞的，SweetAlert2 是异步 Promise。
    // 这里只是为了覆盖默认行为，实际代码中需要把 if(confirm(...)) 改为 await 模式
    // 为了兼容旧代码，这里暂时保留原生 confirm 作为同步阻塞，
    // 但建议在关键操作（如删除）中显式调用 Swal.fire
    
    // 这里的 window.originalConfirm 现在指向的是真正的原生函数，不会死循环了
    return window.originalConfirm ? window.originalConfirm(msg) : true; 
};

// 备份原生 confirm 以防万一 (这段旧有的冗余代码可以保留，也可以删掉，上面的步骤1已经处理了)
if(!window.originalConfirm) window.originalConfirm = window.confirm;

// 👆👆👆 ✋ 🟢 [修复重点结束] 🟢 ✋ 👆👆👆

// 🛡️ [升级版] 系统操作日志记录器 (支持回收站)
const Logger = {
    isHistoryMode: false,

    // 1. 写入日志 (保持不变)
    log: async function(action, details) {
        if (!sbClient) return;
        let operator = "未知/系统";
        try {
            const userStr = sessionStorage.getItem('CURRENT_USER');
            if (userStr) {
                const user = JSON.parse(userStr);
                operator = `${user.name} (${user.role})`;
            }
        } catch(e) {}

        try {
            await sbClient.from('system_logs').insert([{
                operator: operator,
                action: action,
                details: details,
                status: 'normal' // 默认状态
            }]);
            console.log(`[Log] ${action}: ${details}`);
        } catch (e) {
            console.error("写日志失败:", e);
        }
    },

    // 2. 打开查看面板 (UI升级)
    view: function() {
        this.isHistoryMode = false;
        this.updateUIState();
        document.getElementById('admin-log-modal').style.display = 'flex';
        this.loadLogs();
    },

    // 3. 切换视图
    toggleHistoryView: function() {
        this.isHistoryMode = !this.isHistoryMode;
        this.updateUIState();
        this.loadLogs();
    },

    // 4. 更新UI状态
    updateUIState: function() {
        const titleEl = document.getElementById('log-modal-title');
        const btnHistory = document.getElementById('btn-log-history');
        const normalActions = document.getElementById('log-normal-actions');
        const historyActions = document.getElementById('log-history-actions');
        
        // 重置全选
        if(document.getElementById('log-check-all')) document.getElementById('log-check-all').checked = false;
        if(document.getElementById('log-history-check-all')) document.getElementById('log-history-check-all').checked = false;

        if (this.isHistoryMode) {
            titleEl.innerHTML = '<i class="ti ti-trash"></i> 日志回收站';
            titleEl.style.color = '#666';
            btnHistory.innerHTML = '<i class="ti ti-arrow-back-up"></i> 返回日志列表';
            btnHistory.className = 'btn btn-sm btn-primary';
            normalActions.style.display = 'none';
            historyActions.style.display = 'flex';
        } else {
            titleEl.innerHTML = '<i class="ti ti-history"></i> 系统操作日志';
            titleEl.style.color = '#333';
            btnHistory.innerHTML = '<i class="ti ti-recycle"></i> 日志回收站';
            btnHistory.className = 'btn btn-sm btn-gray';
            normalActions.style.display = 'flex';
            historyActions.style.display = 'none';
        }
    },

    // 5. 加载日志数据
    loadLogs: async function() {
        const listEl = document.getElementById('admin-log-list');
        listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">⏳ 加载中...</div>';

        let query = sbClient
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        // 状态过滤
        if (this.isHistoryMode) {
            query = query.eq('status', 'deleted');
        } else {
            // 兼容旧数据：status 不等于 deleted，或者 status 为 null
            query = query.or('status.eq.normal,status.is.null'); 
        }

        const { data, error } = await query;

        if (error) return listEl.innerHTML = `<div style="color:red; padding:20px;">加载失败: ${error.message}</div>`;
        if (!data || data.length === 0) return listEl.innerHTML = `<div style="padding:40px; text-align:center; color:#999;">📭 暂无记录</div>`;

        // 渲染表格
        let html = `
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                <thead style="position:sticky; top:0; background:#f3f4f6; z-index:1;">
                    <tr style="border-bottom:1px solid #ddd; color:#64748b;">
                        <th style="width:40px; padding:10px; text-align:center;">选</th>
                        <th style="width:140px; padding:10px; text-align:left;">时间</th>
                        <th style="width:120px; padding:10px; text-align:left;">操作人</th>
                        <th style="width:100px; padding:10px; text-align:left;">动作</th>
                        <th style="padding:10px; text-align:left;">详情</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            let color = "#333";
            if(log.action.includes("删除")) color = "#dc2626";
            if(log.action.includes("修改")) color = "#d97706";
            if(log.action.includes("同步")) color = "#2563eb";

            html += `
                <tr style="border-bottom:1px solid #eee; background:white;">
                    <td style="text-align:center;">
                        <input type="checkbox" class="log-item-check" value="${log.id}">
                    </td>
                    <td style="padding:8px 10px; color:#666;">${time}</td>
                    <td style="padding:8px 10px; font-weight:bold;">${log.operator || '-'}</td>
                    <td style="padding:8px 10px; color:${color}; font-weight:bold;">${log.action}</td>
                    <td style="padding:8px 10px; color:#444;">${log.details}</td>
                </tr>
            `;
        });
        html += `</tbody></table>`;
        listEl.innerHTML = html;
    },

    // --- 批量操作逻辑 ---

    toggleSelectAll: function(source) {
        document.querySelectorAll('.log-item-check').forEach(cb => cb.checked = source.checked);
    },

    getCheckedIds: function() {
        return Array.from(document.querySelectorAll('.log-item-check:checked')).map(cb => cb.value);
    },

    // 批量软删除
    batchSoftDelete: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");
        
        UI.loading(true, "正在删除...");
        const { error } = await sbClient.from('system_logs').update({ status: 'deleted' }).in('id', ids);
        UI.loading(false);

        if (error) alert("删除失败: " + error.message);
        else {
            UI.toast(`已删除 ${ids.length} 条日志`, "success");
            this.loadLogs();
            if(document.getElementById('log-check-all')) document.getElementById('log-check-all').checked = false;
        }
    },

    // 批量还原
    batchRestore: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");

        UI.loading(true, "正在还原...");
        const { error } = await sbClient.from('system_logs').update({ status: 'normal' }).in('id', ids);
        UI.loading(false);

        if (error) alert("还原失败: " + error.message);
        else {
            UI.toast(`已还原 ${ids.length} 条日志`, "success");
            this.loadLogs();
            if(document.getElementById('log-history-check-all')) document.getElementById('log-history-check-all').checked = false;
        }
    },

    // 批量彻底删除
    batchHardDelete: async function() {
        const ids = this.getCheckedIds();
        if (ids.length === 0) return UI.toast("请至少选择一项", "error");
        if (!confirm(`⚠️ 确定要【彻底销毁】这 ${ids.length} 条日志吗？\n此操作不可恢复！`)) return;

        UI.loading(true, "正在粉碎...");
        const { error, count } = await sbClient.from('system_logs').delete({ count: 'exact' }).in('id', ids);
        UI.loading(false);

        if (error) {
            alert("删除失败: " + error.message);
        } else if (count === 0) {
            alert("⚠️ 删除失败：权限不足！请在 Supabase 开启 system_logs 的 DELETE 权限。");
        } else {
            UI.toast(`彻底删除了 ${count} 条日志`, "success");
            this.loadLogs();
            if(document.getElementById('log-history-check-all')) document.getElementById('log-history-check-all').checked = false;
        }
    }
};

// 🔐 [新增] 多角色账号管理控制器 (管理员/主任/班主任)
const AccountManager = {
    // 1. 打开管理面板
    open: function() {
        const user = Auth.currentUser;
        if (!user) return alert("请先登录");

        // 权限检查列表
        const allowedRoles = ['admin', 'director', 'grade_director', 'class_teacher'];
        if (!allowedRoles.includes(user.role)) {
            return alert("⛔ 权限不足：只有管理员、主任或班主任可以使用此功能。");
        }

        // 根据角色设置提示文案
        const hintEl = document.getElementById('acc-permission-hint');
        let hintText = "";
        
        if (user.role === 'admin') hintText = "👑 管理员权限：可管理系统中【所有】账号。";
        else if (user.role === 'director') hintText = "🎓 教务主任权限：可管理本校【所有】账号。";
        else if (user.role === 'grade_director') hintText = `🚀 级部主任权限：可管理 ${user.class}年级 的【家长】及本校【教师】。`;
        else if (user.role === 'class_teacher') hintText = `📋 班主任权限：仅可管理 ${user.class}班 的【家长】账号。`;

        hintEl.innerHTML = `<i class="ti ti-shield-lock"></i> ${hintText}`;
        
        // 重置界面
        document.getElementById('acc-result-table').querySelector('tbody').innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">请输入关键字搜索</td></tr>';
        document.getElementById('acc-search-input').value = "";
        
        // 显示弹窗
        document.getElementById('account-manager-modal').style.display = 'flex';
        document.getElementById('acc-search-input').focus();
    },

    // 2. 执行搜索 (核心权限逻辑)
    search: async function() {
        const keyword = document.getElementById('acc-search-input').value.trim();
        if (!keyword) return UI.toast("请输入搜索关键字", "warning");

        const user = Auth.currentUser;
        if (!user) return;

        UI.loading(true, "正在搜索账号...");

        // --- A. 构建基础查询 ---
        let query = sbClient
            .from('system_users')
            .select('*')
            .ilike('username', `%${keyword}%`) // 模糊匹配用户名
            .limit(50); // 限制返回条数，防止数据量过大

        // --- B. 数据库级初步过滤 (Role-Based Filter) ---
        
        // 1. 管理员 (admin): 无限制，查所有
        if (user.role === 'admin') {
            // No filter
        }
        
        // 2. 教务主任 (director): 限制本校
        else if (user.role === 'director') {
            query = query.eq('school', user.school);
        }

        // 3. 级部主任 (grade_director): 限制本校 (后续在内存中细分)
        else if (user.role === 'grade_director') {
            query = query.eq('school', user.school);
        }

        // 4. 班主任 (class_teacher): 限制本校 + 本班 + 仅家长
        else if (user.role === 'class_teacher') {
            query = query
                .eq('school', user.school)
                .eq('class_name', user.class) // user.class 如 "701"
                .eq('role', 'parent'); // 只能管家长
        }

        // 执行查询
        const { data, error } = await query;
        
        UI.loading(false);

        if (error) {
            return alert("查询失败: " + error.message);
        }

        // --- C. 内存级二次过滤 (处理复杂逻辑) ---
        let filteredData = data;

        // 级部主任特殊逻辑：可以管【教师】 OR 【本年级家长】
        if (user.role === 'grade_director') {
            const gradePrefix = String(user.class); // 如 "7"
            filteredData = data.filter(u => {
                // 允许管理本校所有教师
                if (u.role === 'teacher') return true; 
                // 允许管理本年级家长 (班级以 "7" 开头)
                if (u.role === 'parent' && String(u.class_name).startsWith(gradePrefix)) return true; 
                // 其他情况 (如别的年级家长、管理员账号) 过滤掉
                return false;
            });
        }

        this.renderTable(filteredData);
    },

    // 3. 渲染结果表格 (已添加“修改信息”按钮)
        renderTable: function(list) {
            const tbody = document.querySelector('#acc-result-table tbody');
            if (!list || list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:#999;">未找到匹配的账号 (或无权管理)</td></tr>';
                return;
            }
    
            const roleMap = { 'admin':'👑 管理员', 'director':'🎓 教务主任', 'grade_director':'🚀 级部主任', 'class_teacher':'📋 班主任', 'teacher':'👨‍🏫 教师', 'parent':'👨‍👩‍👧 家长' };
            const myRole = Auth.currentUser ? Auth.currentUser.role : 'guest';
    
            let html = '';
            list.forEach(u => {
                const roleName = roleMap[u.role] || u.role;
                
                let canEdit = false;
    
                // 权限判定逻辑 (保持原有严谨性)
                if (myRole === 'admin') {
                    canEdit = (u.role !== 'admin' || u.username === Auth.currentUser.name); // 可以改自己，不能改别的admin
                } else if (myRole === 'director') {
                    canEdit = (u.role !== 'admin' && u.role !== 'director');
                } else {
                    canEdit = (u.role === 'parent' || u.role === 'teacher');
                }
                
                // 按钮样式
                const btnClass = canEdit ? 'btn-primary' : 'btn-gray';
                const cursorStyle = canEdit ? '' : 'cursor:not-allowed; opacity:0.6;';
                const disableAttr = canEdit ? '' : 'disabled';

                // 转义处理，防止单引号破坏 HTML 结构
                const safeUser = u.username.replace(/'/g, "\\'");
                const safeRole = u.role;
                const safeClass = (u.class_name || '').replace(/'/g, "\\'");
    
                html += `
                    <tr>
                        <td style="font-weight:bold;">${u.username}</td>
                        <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${roleName}</span></td>
                        <td>${u.class_name || '-'}</td>
                        <td style="font-family:monospace; color:#666;">${u.password}</td>
                        <td>
                            <!-- 🟢 新增：修改信息按钮 -->
                            <button class="btn btn-sm btn-purple" ${disableAttr} style="padding:2px 6px; font-size:12px; margin-right:5px; ${cursorStyle}" 
                                    onclick="AccountManager.editAttributes('${safeUser}', '${safeRole}', '${safeClass}')">
                                <i class="ti ti-edit"></i> 修改
                            </button>
                            <!-- 原有：改密按钮 -->
                            <button class="btn btn-sm ${btnClass}" ${disableAttr} style="padding:2px 6px; font-size:12px; ${cursorStyle}" 
                                    onclick="AccountManager.resetPassword('${safeUser}')">
                                <i class="ti ti-key"></i> 改密
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        },


        // 3.5 编辑用户属性 (角色 & 班级)
        editAttributes: async function(username, currentRole, currentClass) {
            // 构建角色下拉选项
            const roleOptions = [
                {val: 'teacher', txt: '👨‍🏫 科任教师 (默认)'},
                {val: 'class_teacher', txt: '📋 班主任 (需填班级)'},
                {val: 'grade_director', txt: '🚀 级部主任 (需填年级)'},
                {val: 'parent', txt: '👨‍👩‍👧 家长/学生 (需填班级)'},
                {val: 'director', txt: '🎓 教务主任'},
                {val: 'admin', txt: '👑 管理员'}
            ].map(opt => `<option value="${opt.val}" ${opt.val === currentRole ? 'selected' : ''}>${opt.txt}</option>`).join('');

            // 弹出 SweetAlert2 表单
            const { value: formValues } = await Swal.fire({
                title: `修改账号信息：${username}`,
                html: `
                    <div style="text-align:left; font-size:14px;">
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">角色权限</label>
                        <select id="swal-edit-role" class="swal2-input" style="margin:0 0 15px 0; width:100%; font-size:14px;">
                            ${roleOptions}
                        </select>
                        
                        <label style="display:block; margin-bottom:5px; font-weight:bold;">
                            班级 / 范围 <small style="color:#666; font-weight:normal;">(教师留空, 家长填班级, 主任填年级)</small>
                        </label>
                        <input id="swal-edit-class" class="swal2-input" value="${currentClass}" placeholder="例如: 901 或 9" style="margin:0; width:100%; font-size:14px;">
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: '保存修改',
                cancelButtonText: '取消',
                focusConfirm: false,
                preConfirm: () => {
                    return {
                        role: document.getElementById('swal-edit-role').value,
                        class_name: document.getElementById('swal-edit-class').value.trim()
                    }
                }
            });

            if (!formValues) return; // 用户取消

            // 简单校验
            if ((formValues.role === 'parent' || formValues.role === 'class_teacher') && !formValues.class_name) {
                return Swal.fire('错误', '修改为家长或班主任时，【班级】不能为空！', 'error');
            }

            UI.loading(true, "正在更新云端数据...");

            // 提交到 Supabase
            const { error } = await sbClient
                .from('system_users')
                .update({ 
                    role: formValues.role,
                    class_name: formValues.class_name 
                })
                .eq('username', username);

            UI.loading(false);

            if (error) {
                alert("❌ 更新失败: " + error.message);
            } else {
                UI.toast(`✅ 账号 [${username}] 信息已更新`, "success");
                // 刷新列表
                this.search(); 
                
                // 记录日志
                if(window.Logger) Logger.log('修改账号信息', `修改了 ${username} 的角色为 ${formValues.role}, 范围为 ${formValues.class_name}`);
            }
        },

    // 4. 重置/修改密码
    resetPassword: async function(username) {
        const newPass = prompt(`🔐 正在修改账号 [${username}] 的密码\n\n请输入新密码 (留空则取消):`);
        if (newPass === null) return;
        if (!newPass.trim()) return alert("密码不能为空");
        const ok = confirm(`⚠️ 确认将账号 [${username}] 的密码修改为：\n${newPass}\n\n此操作将立即生效。是否继续？`);
        if (!ok) return;

        UI.loading(true, "正在更新密码...");

        // 调用 Supabase 更新
        const { error } = await sbClient
            .from('system_users')
            .update({ password: newPass.trim() })
            .eq('username', username);

        UI.loading(false);

        if (error) {
            alert("❌ 修改失败: " + error.message);
        } else {
            UI.toast(`✅ 账号 [${username}] 密码已修改为 ${newPass}`, "success");
            
            // 刷新列表显示新密码
            this.search();
            
            // 记录到操作日志 (如果有 Logger 模块)
            if(window.Logger) Logger.log('修改密码', `修改了用户 ${username} 的密码`);
        }
    }
};
