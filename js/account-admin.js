// 👇👇👇 🟢 新增：Excel 账号批量导入工具 🟢 👇👇👇
const AccountExcel = {
    downloadTemplate: function() {
        const wb = XLSX.utils.book_new();
        const headers = ["角色", "学校", "班级", "级部(年级)", "姓名/账号", "密码", "备注"];
        const data = [
            headers,
            ["科任教师", "实验中学", "", "7", "张老师", "123456", "只看自己教的课"],
            ["班主任", "实验中学", "701", "7", "王班头", "123456", "看本班所有"],
            ["级部主任", "实验中学", "", "7", "李级部", "123456", "管理整个七年级"],
            ["家长", "实验中学", "701", "", "张小明", "123456", "只能看自己"],
            ["教务主任", "实验中学", "", "", "赵主任", "123456", "查看全校"]
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{wch:12}, {wch:15}, {wch:8}, {wch:10}, {wch:15}, {wch:10}, {wch:20}];
        XLSX.utils.book_append_sheet(wb, ws, "账号导入模板");
        XLSX.writeFile(wb, "账号批量导入模板.xlsx");
    },

    upload: function(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = XLSX.read(data, {type: 'array'});
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                
                if (json.length === 0) return alert("表格为空");
                if (!confirm(`解析到 ${json.length} 条账号数据，确定要导入云端吗？`)) return;

                UI.loading(true, "正在批量创建云端账号...");
                
                const roleMap = {
                    "科任教师": "teacher", "教师": "teacher",
                    "班主任": "class_teacher",
                    "级部主任": "grade_director", "年级主任": "grade_director",
                    "家长": "parent", "学生": "parent",
                    "教务主任": "director",
                    "管理员": "admin"
                };

                let successCount = 0;
                const batchData = [];

                json.forEach(row => {
                    const roleCN = row['角色'] || "";
                    const role = roleMap[roleCN.trim()] || "teacher"; // 默认教师
                    const user = row['姓名/账号'] || row['姓名'];
                    const pass = row['密码'] || "123456";
                    const school = row['学校'] || window.MY_SCHOOL || "默认学校";
                    const cls = row['班级'] ? String(row['班级']).trim() : "";
                    const grade = row['级部(年级)'] ? String(row['级部(年级)']).trim() : ""; // 新增级部字段

                    if (user) {
                        batchData.push({
                            username: user,
                            password: pass.toString(),
                            role: role,
                            school: school,
                            class_name: role === 'class_teacher' || role === 'parent' ? cls : (role === 'grade_director' ? grade : ""), // 级部主任的class字段存年级
                            // 注意：这里复用了 class_name 字段。
                            // 对于级部主任，class_name 存 "7" (代表7年级)
                            // 对于班主任，class_name 存 "701"
                        });
                    }
                });

                // 分批写入 Supabase
                const { error } = await sbClient.from('system_users').upsert(batchData, { onConflict: 'username' });
                
                UI.loading(false);
                if (error) throw error;
                
                alert(`✅ 成功导入 ${batchData.length} 个账号！`);
                input.value = ''; // 清空

            } catch (err) {
                UI.loading(false);
                alert("导入失败：" + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
};

// 👇👇👇 🟢 修改：输入框联动逻辑 (适配新角色) 🟢 👇👇👇
function toggleAdminManualInput() {
    const role = document.getElementById('manual-role').value;
    const clsWrap = document.getElementById('manual-class-wrap'); // 家长/班主任用
    const clsInput = document.getElementById('manual-class');
    const nameInp = document.getElementById('manual-name');
    const schoolInp = document.getElementById('manual-school');
    const gradeInp = document.getElementById('manual-grade'); // 级部主任用
    
    // 1. 先全部隐藏/重置
    clsWrap.style.display = 'none';
    gradeInp.style.display = 'none';
    schoolInp.style.display = 'block'; // 默认显示学校
    
    // 2. 根据角色开启特定框
    if (role === 'parent') {
        clsWrap.style.display = 'block';
        clsInput.placeholder = "输入班级 (如: 701，家长必填)";
        nameInp.placeholder = "学生姓名";
    } 
    else if (role === 'class_teacher') {
        clsWrap.style.display = 'block'; 
        clsInput.placeholder = "管理班级 (如: 701)";
        nameInp.placeholder = "班主任姓名";
    }
    else if (role === 'grade_director') {
        gradeInp.style.display = 'block'; // ✅ 确保这行执行，显示年级框
        nameInp.placeholder = "主任姓名";
    }
    else if (role === 'director') {
        nameInp.placeholder = "主任姓名";
    } 
    else if (role === 'admin') {
        schoolInp.style.display = 'none'; // 管理员不需要填学校
        nameInp.placeholder = "管理员账号";
    } 
    else { // teacher
        nameInp.placeholder = "教师姓名";
    }
}

// 简单的修改密码脚本 (云端同步版)
async function changeAdminPass() {
    const p = document.getElementById('new-admin-pass').value.trim();
    if(!p) return alert("密码不能为空");

    // 1. 更新本地状态 (确保当前会话立即生效)
    if(typeof Auth !== 'undefined') {
        Auth.db.admin.pass = p;
        localStorage.setItem('SYS_USERS', JSON.stringify(Auth.db));
    }

    // 2. 同步到云端数据库 (核心修复)
    if(sbClient) {
        // 显示加载动画
        const loader = document.getElementById('global-loader');
        const txt = document.getElementById('loader-text');
        if(loader) { loader.classList.remove('hidden'); if(txt) txt.innerText = "正在更新云端密码..."; }

        try {
            // 更新 system_users 表中 username='admin' 的记录
            const { error } = await sbClient
                .from('system_users')
                .update({ password: p })
                .eq('username', 'admin');

            // 隐藏加载动画
            if(loader) loader.classList.add('hidden');

            if (error) {
                console.error(error);
                alert("❌ 本地修改成功，但【云端同步失败】！\n错误信息：" + error.message);
            } else {
                alert("✅ 管理员密码已修改！\n(本地和云端均已更新为: " + p + ")");
                document.getElementById('new-admin-pass').value = '';
            }
        } catch (err) {
            if(loader) loader.classList.add('hidden');
            alert("❌ 程序异常：" + err.message);
        }
    } else {
        alert("⚠️ 警告：未连接到云端数据库，仅修改了本地缓存密码。");
    }
}

// 1. 打开修改密码弹窗 (支持强制模式)
function openUserPasswordModal(isForced = false) {
    // 获取当前用户
    const user = JSON.parse(sessionStorage.getItem('CURRENT_USER'));
    if (!user) return alert("未检测到登录用户，请刷新页面。");

    // 清空输入框
    document.getElementById('upm-old').value = '';
    document.getElementById('upm-new').value = '';
    document.getElementById('upm-confirm').value = '';
    
    const modal = document.getElementById('user-password-modal');
    const closeBtn = modal.querySelector('button[onclick*="none"]'); // 查找关闭按钮

    if (isForced) {
        // 🔴 强制模式：隐藏关闭按钮，禁止点击背景关闭
        if(closeBtn) closeBtn.style.display = 'none';
        // 简单的防止点击背景关闭逻辑 (覆盖 onclick)
        modal.onclick = (e) => e.stopPropagation(); 
    } else {
        // 普通模式：显示关闭按钮
        if(closeBtn) closeBtn.style.display = 'block';
        modal.onclick = (e) => { 
            if(e.target === modal) modal.style.display = 'none'; 
        };
    }
    
    // 显示弹窗
    modal.style.display = 'flex';
}

// 2. 提交密码修改 (同步云端)
async function submitUserPasswordChange() {
    // 检查数据库连接
    if (!sbClient) return alert("❌ 云端未连接，无法修改密码。");
    
    const user = JSON.parse(sessionStorage.getItem('CURRENT_USER'));
    if (!user) return alert("未检测到登录用户，请刷新重试。");

    // 获取输入值
    const oldPass = document.getElementById('upm-old').value.trim();
    const newPass = document.getElementById('upm-new').value.trim();
    const confirmPass = document.getElementById('upm-confirm').value.trim();

    // 基础校验
    if (!oldPass || !newPass) return alert("密码不能为空");
    if (newPass !== confirmPass) return alert("两次输入的新密码不一致");
    if (newPass.length < 6) return alert("新密码长度至少需要 6 位，建议使用字母+数字组合");
    if (oldPass === newPass) return alert("新密码不能与旧密码相同");

    UI.loading(true, "正在验证并更新密码...");

    try {
        // A. 验证旧密码是否正确 (必须去数据库查，防止本地篡改)
        const { data: verifyData, error: verifyError } = await sbClient
            .from('system_users')
            .select('*')
            .eq('username', user.name)
            .eq('password', oldPass)
            .maybeSingle();

        if (verifyError) {
            throw new Error("验证旧密码时出错: " + verifyError.message);
        }

        if (!verifyData) {
            UI.loading(false);
            return alert("❌ 旧密码错误！请检查后重试。");
        }

        // B. 执行更新操作
        const { error: updateError } = await sbClient
            .from('system_users')
            .update({ password: newPass })
            .eq('username', user.name); 

        UI.loading(false);

        if (updateError) {
            throw new Error("更新密码失败: " + updateError.message);
        }

        // C. 成功后处理
        alert("✅ 密码修改成功！\n\n为了安全起见，请使用新密码重新登录。");
        document.getElementById('user-password-modal').style.display = 'none';
        
        // 强制登出
        Auth.logout(); 

    } catch (e) {
        UI.loading(false);
        console.error(e);
        alert("❌ 修改失败：" + e.message);
    }
}
