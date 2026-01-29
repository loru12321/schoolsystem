// ✅ 兜底初始化 Supabase，防止 sbClient 未定义
var sbClient = window.sbClient || null;
window.SUPABASE_URL = localStorage.getItem('SUPABASE_URL') || "https://okwcciujnfvobbwaydiv.supabase.co";
window.SUPABASE_KEY = localStorage.getItem('SUPABASE_KEY') || "sb_publishable_NQqut_NdTW2z1_R27rJ8jA_S3fTh2r4";
window.initSupabase = function() {
    if (window.supabase && !sbClient) {
        sbClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
        window.sbClient = sbClient;
        console.log("✅ Supabase 连接初始化成功");
    }
};
