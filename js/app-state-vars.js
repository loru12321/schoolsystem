// 应用状态变量

let CURRENT_REPORT_STUDENT = null; // 暂存当前正在查询的学生对象
let BATCH_AI_CACHE = {}; // 存储批量生成的评语 key: "学校_班级_姓名"
let IS_BATCH_AI_RUNNING = false; // 控制批量任务状态
// ✋ 性能优化：定义学生明细表的分页状态
let STD_PAGINATION = {
    page: 1,       // 当前页码
    size: 100,     // 每页显示条数 (调整此数值平衡性能与信息量)
    data: []       // 缓存当前筛选后的完整数据，避免翻页时重复筛选
};

let PREV_DATA = []; // 进退步分析专用
let PROGRESS_CACHE = []; 
let MANUAL_ID_MAPPINGS = {}; // 存储用户手动确认的同名映射关系 key: "Current_Class_Name" -> val: "Prev_Class_Name"
let balanceChartInstance = null;
let AID_GROUPS_CACHE = []; 
let MP_DATA_CACHE = []; // 临界生数据缓存
let MP_SNAPSHOTS = JSON.parse(localStorage.getItem('MP_SNAPSHOTS') || '{}'); // 持久化存储临界生快照
let CURRENT_CONTEXT_STUDENTS = []; // 标签组件用

// 考务与分班相关变量
let FB_STUDENTS = []; let FB_CLASSES = []; let FB_CUR_CLASS_IDX = -1; let FB_SIMULATED_DATA = {};
let EXAM_DATA = []; let EXAM_ROOMS = [];

let FB_SCHEMES_CACHE = []; // 存储生成的多种方案
