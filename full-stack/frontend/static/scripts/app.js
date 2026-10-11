/* ======================================================================
 * 发票识别助手 · 前端逻辑
 * 数据流：Mock → 后续替换为 FastAPI 接口
 * ==================================================================== */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

/* ===================== 页面元信息 ===================== */
const PAGE_META = {
    upload: {title: '上传识别', sub: '上传发票图片，多模态模型自动抽取字段'},
    list: {title: '发票列表', sub: '查看、筛选、导出发票记录'},
    detail: {title: '发票详情', sub: '校对识别结果，保存入库'},
    chat: {title: '智能体对话', sub: '工具调用完成查重、政策问答、报销单生成'},
    eval: {title: '评测报告', sub: '多模型对比与 badcase 分析'},
};

/* ===================== 全局状态 ===================== */
const state = {
    files: [],
    currentResult: null,
    currentInvoiceId: null,
    invoices: [],
    chat: [],
    evaluator: {
        badcases: [
            {type: '模糊 / 低分辨率', count: 8, ratio: '6.7%', desc: '发票号码识别错误'},
            {type: '旋转 / 倾斜', count: 5, ratio: '4.2%', desc: '日期字段错位'},
            {type: '混贴多张', count: 4, ratio: '3.3%', desc: '只识别出第一张'},
            {type: '明细行过多', count: 3, ratio: '2.5%', desc: '明细漏行'},
            {type: '版式差异', count: 2, ratio: '1.7%', desc: '购买方名称截断'},
        ],
    },
};

/* ===================== Mock 数据 ===================== */
const MOCK_RESULT = {
    invoice_type: '增值税电子普通发票',
    invoice_code: '044001900111',
    invoice_number: '12345678',
    invoice_date: '2024-03-15',
    buyer_name: '深圳大学',
    buyer_tax_id: '1244030045575xxxxx',
    seller_name: '深圳市顺丰科技有限公司',
    seller_tax_id: '9144030070846xxxxx',
    amount: 188.68,
    tax: 11.32,
    total: 200.00,
    confidence: {
        invoice_code: 0.91, invoice_number: 0.99, invoice_date: 0.98,
        buyer_name: 0.95, buyer_tax_id: 0.79,
        seller_name: 0.93, seller_tax_id: 0.82,
        amount: 0.96, tax: 0.94, total: 0.97,
    },
};

const MOCK_INVOICES = [
    {
        id: 1,
        number: '12345678',
        date: '2024-03-15',
        seller: '深圳市顺丰科技有限公司',
        total: 200.00,
        type: '增值税电子普通发票',
        status: '已校对'
    },
    {
        id: 2,
        number: '87654321',
        date: '2024-03-14',
        seller: '滴滴出行科技有限公司',
        total: 56.80,
        type: '增值税电子普通发票',
        status: '待校对'
    },
    {
        id: 3,
        number: '22334455',
        date: '2024-03-12',
        seller: '华为技术有限公司',
        total: 8999.00,
        type: '增值税电子专用发票',
        status: '已校对'
    },
    {
        id: 4,
        number: '66778899',
        date: '2024-03-10',
        seller: '京东世纪贸易有限公司',
        total: 328.50,
        type: '增值税电子普通发票',
        status: '待校对'
    },
    {
        id: 5,
        number: '11223344',
        date: '2024-03-08',
        seller: '中国南方航空股份有限公司',
        total: 1560.00,
        type: '增值税电子普通发票',
        status: '已校对'
    },
    {
        id: 6,
        number: '99887766',
        date: '2024-03-05',
        seller: '深圳维也纳酒店有限公司',
        total: 468.00,
        type: '增值税电子普通发票',
        status: '待校对'
    },
];

/* ===================== 工具 ===================== */
let toastTimer = null;

function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function confClass(score, threshold = 0.85) {
    return score < threshold ? 'low' : '';
}

/* ===================== 路由 ===================== */
function go(page) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const target = $('#page-' + page);
    if (target) target.classList.add('active');

    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));

    const meta = PAGE_META[page];
    if (meta) {
        $('#pageTitle').textContent = meta.title;
        $('#pageSub').textContent = meta.sub;
    }

    // 详情页导航按需显示
    if (page === 'detail') {
        $('.nav-item[data-page="detail"]').hidden = false;
    }

    window.scrollTo({top: 0, behavior: 'smooth'});
}

/* ===================== 上传识别 ===================== */
function initUploadPage() {
    const dropzone = $('#dropzone');
    const fileInput = $('#fileInput');
    const btnRec = $('#btnRecognize');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.classList.add('drag');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        dropzone.classList.remove('drag');
        addFiles([...e.dataTransfer.files]);
    });

    fileInput.addEventListener('change', e => addFiles([...e.target.files]));

    $('#btnClear').addEventListener('click', () => {
        state.files = [];
        renderFileList();
        btnRec.disabled = true;
        $('#progressWrap').hidden = true;
        state.currentResult = null;
        renderResultEmpty();
    });

    $('#btnSample').addEventListener('click', () => {
        state.files = [{name: 'sample_invoice.jpg', size: 245 * 1024}];
        renderFileList();
        btnRec.disabled = false;
        toast('已加载示例发票');
    });

    btnRec.addEventListener('click', recognize);
}

function addFiles(list) {
    state.files = state.files.concat(list);
    renderFileList();
    $('#btnRecognize').disabled = state.files.length === 0;
}

function renderFileList() {
    const box = $('#fileList');
    box.innerHTML = '';
    state.files.forEach((f, i) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.innerHTML = `
      <span>📎</span>
      <span class="name">${f.name}</span>
      <span class="size">${(f.size / 1024).toFixed(0)} KB</span>
      <button class="rm" data-index="${i}">×</button>`;
        box.appendChild(li);
    });

    $$('.file-item .rm', box).forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            state.files.splice(+btn.dataset.index, 1);
            renderFileList();
            $('#btnRecognize').disabled = state.files.length === 0;
        });
    });
}

function recognize() {
    const btn = $('#btnRecognize');
    btn.disabled = true;
    btn.textContent = '识别中…';
    $('#progressWrap').hidden = false;

    const bar = $('#progressBar');
    bar.style.width = '0%';

    // TODO: 替换为真实接口
    // const fd = new FormData();
    // state.files.forEach(f => fd.append('files', f));
    // const res = await fetch('/api/v1/invoices/recognize', { method: 'POST', body: fd });
    // const data = await res.json();
    // renderResult(data);

    let p = 0;
    const timer = setInterval(() => {
        p += Math.random() * 22;
        if (p > 100) p = 100;
        bar.style.width = p + '%';

        if (p >= 100) {
            clearInterval(timer);
            setTimeout(() => {
                state.currentResult = {...MOCK_RESULT};
                renderResult(state.currentResult);
                btn.disabled = false;
                btn.textContent = '🚀 开始识别';
                toast('识别完成，2 个字段置信度偏低');
            }, 250);
        }
    }, 220);
}

function renderResultEmpty() {
    $('#resultBody').innerHTML = `
    <div class="empty">
      <div class="empty-icon">🧠</div>
      <div>还没有识别结果</div>
      <div class="empty-tip">上传发票后点击「开始识别」</div>
    </div>`;
    $('#resultBadge').hidden = true;
}

function renderResult(r) {
    const lowCount = Object.values(r.confidence).filter(v => v < 0.85).length;
    const badge = $('#resultBadge');
    badge.hidden = false;
    badge.textContent = lowCount ? `${lowCount} 个低置信字段` : '全部字段高置信';
    badge.className = 'badge ' + (lowCount ? 'orange' : 'green');

    const rows = [
        ['发票类型', r.invoice_type, 'invoice_type'],
        ['发票代码', r.invoice_code, 'invoice_code'],
        ['发票号码', r.invoice_number, 'invoice_number'],
        ['开票日期', r.invoice_date, 'invoice_date'],
        ['购买方', r.buyer_name, 'buyer_name'],
        ['购买方税号', r.buyer_tax_id, 'buyer_tax_id'],
        ['销售方', r.seller_name, 'seller_name'],
        ['销售方税号', r.seller_tax_id, 'seller_tax_id'],
        ['金额', '¥' + r.amount.toFixed(2), 'amount'],
        ['税额', '¥' + r.tax.toFixed(2), 'tax'],
        ['价税合计', '¥' + r.total.toFixed(2), 'total'],
    ];

    $('#resultBody').innerHTML = rows.map(([k, v, key]) => {
        const c = r.confidence[key];
        const cls = c !== undefined && c < 0.85 ? 'v low' : 'v';
        return `<div class="field-row"><span class="k">${k}</span><span class="${cls}">${v}</span></div>`;
    }).join('') + `
    <div class="btn-row">
      <button class="btn" id="btnGoDetail">进入校对</button>
      <button class="btn ghost" id="btnQuickSave">直接保存</button>
    </div>`;

    $('#btnGoDetail').addEventListener('click', () => {
        openDetailFromResult(state.currentResult);
        go('detail');
    });
    $('#btnQuickSave').addEventListener('click', () => {
        saveInvoiceToState(state.currentResult);
        toast('已保存到发票列表');
    });
}

/* ===================== 发票列表 ===================== */
function initListPage() {
    state.invoices = MOCK_INVOICES.map(i => ({...i}));

    $('#searchInput').addEventListener('input', renderList);
    $('#typeFilter').addEventListener('change', renderList);
    $('#statusFilter').addEventListener('change', renderList);

    $('#btnAddInvoice').addEventListener('click', () => {
        const id = Math.max(0, ...state.invoices.map(i => i.id)) + 1;
        state.invoices.unshift({
            id,
            number: String(10000000 + Math.floor(Math.random() * 89999999)),
            date: new Date().toISOString().slice(0, 10),
            seller: '手工新增发票',
            total: 0,
            type: '增值税电子普通发票',
            status: '待校对',
        });
        renderList();
        toast('已新增发票，请编辑详情');
    });

    $('#btnExportList').addEventListener('click', () => {
        toast('已导出 ' + state.invoices.length + ' 条记录');
    });

    renderList();
}

function renderList() {
    const kw = $('#searchInput').value.trim().toLowerCase();
    const tf = $('#typeFilter').value;
    const sf = $('#statusFilter').value;

    const rows = state.invoices.filter(i => {
        if (tf && i.type !== tf) return false;
        if (sf && i.status !== sf) return false;
        if (kw && !(i.number + i.seller).toLowerCase().includes(kw)) return false;
        return true;
    });

    const tbody = $('#invoiceTbody');

    if (!rows.length) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7">
      <div class="empty"><div class="empty-icon">📭</div><div>没有匹配的发票</div></div>
    </td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(i => `
    <tr data-id="${i.id}">
      <td><b>${i.number}</b></td>
      <td>${i.date}</td>
      <td>${i.seller}</td>
      <td class="num">¥${i.total.toFixed(2)}</td>
      <td><span class="badge blue">${i.type.includes('专用') ? '专票' : '普票'}</span></td>
      <td>${i.status === '已校对'
        ? '<span class="badge green">已校对</span>'
        : '<span class="badge orange">待校对</span>'}</td>
      <td>
        <button class="btn ghost sm" data-action="view">查看</button>
        <button class="btn ghost sm" data-action="delete">删除</button>
      </td>
    </tr>`).join('');

    $$('#invoiceTbody tr').forEach(tr => {
        tr.addEventListener('click', e => {
            if (e.target.dataset.action === 'delete') {
                e.stopPropagation();
                deleteInvoice(+tr.dataset.id);
                return;
            }
            openDetail(+tr.dataset.id);
        });
    });
}

function deleteInvoice(id) {
    const inv = state.invoices.find(i => i.id === id);
    if (!inv) return;
    if (!confirm(`确定删除发票 ${inv.number}？`)) return;
    state.invoices = state.invoices.filter(i => i.id !== id);
    renderList();
    toast('已删除');
}

/* ===================== 发票详情 ===================== */
function initDetailPage() {
    $('#btnSaveDetail').addEventListener('click', saveDetail);
    $('#btnRerecognize').addEventListener('click', () => {
        toast('已重新识别');
    });
    $('#btnBackList').addEventListener('click', () => go('list'));
}

function openDetail(id) {
    const inv = state.invoices.find(i => i.id === id);
    if (!inv) return;
    state.currentInvoiceId = id;
    openDetailFromResult({
        ...MOCK_RESULT,
        invoice_number: inv.number,
        invoice_date: inv.date,
        seller_name: inv.seller,
        total: inv.total,
        invoice_type: inv.type,
    });
    go('detail');
}

function openDetailFromResult(r) {
    state.currentResult = r;

    $('#detailFile').textContent = `invoice_${r.invoice_number}.jpg`;

    const fields = [
        ['发票代码', 'invoice_code'],
        ['发票号码', 'invoice_number'],
        ['开票日期', 'invoice_date'],
        ['购买方名称', 'buyer_name'],
        ['购买方税号', 'buyer_tax_id'],
        ['销售方名称', 'seller_name'],
        ['销售方税号', 'seller_tax_id'],
        ['金额', 'amount'],
        ['税额', 'tax'],
        ['价税合计', 'total'],
    ];

    const lowCount = Object.values(r.confidence).filter(v => v < 0.85).length;
    const badge = $('#detailLow');
    badge.textContent = lowCount ? `${lowCount} 个低置信字段` : '全部高置信';
    badge.className = 'badge ' + (lowCount ? 'orange' : 'green');

    $('#detailFields').innerHTML = fields.map(([label, key]) => {
        const val = r[key] ?? '';
        const c = r.confidence[key];
        const isLow = c !== undefined && c < 0.85;
        return `
      <div class="edit-field">
        <label>${label}${isLow ? ` <span style="color:var(--warn)">· 置信度 ${(c * 100).toFixed(0)}%</span>` : ''}</label>
        <input class="${isLow ? 'low' : ''}" data-key="${key}" value="${val}">
        ${isLow ? '<div class="hint">⚠ 建议人工确认</div>' : ''}
      </div>`;
    }).join('');
}

function saveDetail() {
    const data = {};
    $$('#detailFields input').forEach(i => data[i.dataset.key] = i.value);
    // TODO: fetch(`/api/v1/invoices/${state.currentInvoiceId}`, { method: 'PUT', body: JSON.stringify(data) })

    // 同步回列表
    if (state.currentInvoiceId) {
        const inv = state.invoices.find(i => i.id === state.currentInvoiceId);
        if (inv) {
            inv.number = data.invoice_number ?? inv.number;
            inv.date = data.invoice_date ?? inv.date;
            inv.seller = data.seller_name ?? inv.seller;
            inv.total = parseFloat(data.total) || inv.total;
            inv.status = '已校对';
        }
    }
    renderList();
    toast('校对已保存');
    setTimeout(() => go('list'), 600);
}

/* ===================== 智能体对话 ===================== */
const TOOL_TEMPLATES = {
    suggest_account: () => `
    <div class="tool-call">
      <div class="tool-call-head">🔧 调用工具：<b>suggest_account</b></div>
      <div class="tool-call-body">推荐科目：<b>管理费用 — 差旅费</b><br>依据：销售方为顺丰，发票类型为电子普票，金额 200 元</div>
    </div>`,
    query_policy: () => `
    <div class="tool-call">
      <div class="tool-call-head">🔧 调用工具：<b>query_policy</b></div>
      <div class="tool-call-body">差旅费报销标准：市内交通每日上限 100 元；住宿一线城市 500 元/晚<span class="cite" title="《差旅费管理办法》第 3 章">来源1</span></div>
    </div>`,
    check_duplicate: () => `
    <div class="tool-call">
      <div class="tool-call-head">🔧 调用工具：<b>check_duplicate</b></div>
      <div class="tool-call-body">未发现重复发票。发票号 12345678 在库中唯一。</div>
    </div>`,
    create_expense_report: () => `
    <div class="tool-call">
      <div class="tool-call-head">🔧 调用工具：<b>create_expense_report</b></div>
      <div class="tool-call-body">已生成报销单 <b>EXP-20240315-001</b>，含 1 张发票，合计 ¥200.00
        <div style="margin-top:8px">
          <button class="btn sm" data-action="export-expense">导出 Excel</button>
        </div>
      </div>
    </div>`,
};

function initChatPage() {
    $('#btnSend').addEventListener('click', sendChat);
    $('#chatInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendChat();
    });

    $$('#chatQuick .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            $('#chatInput').value = chip.dataset.ask;
            sendChat();
        });
    });

    // 全局事件委托：处理工具卡片里的按钮
    $('#chatBody').addEventListener('click', e => {
        const action = e.target.dataset.action;
        if (action === 'export-expense') toast('已导出报销单 Excel');
    });

    addMessage('你好，我是发票报销助手。我可以帮你查重、查报销政策、推荐会计科目，或直接生成报销单。', 'bot');
}

function addMessage(text, who, extraHtml = '') {
    const div = document.createElement('div');
    div.className = 'msg ' + (who === 'me' ? 'me' : '');
    div.innerHTML = `
    <div class="avatar ${who === 'me' ? 'user' : 'bot'}">${who === 'me' ? '我' : '🤖'}</div>
    <div class="bubble">${text}${extraHtml}</div>`;
    const body = $('#chatBody');
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

function botReply(q) {
    const text = q.toLowerCase();
    if (text.includes('科目')) return ['这张发票建议记入：<b>管理费用 — 差旅费</b>。', TOOL_TEMPLATES.suggest_account()];
    if (text.includes('标准') || text.includes('政策')) return ['根据公司差旅费管理办法：', TOOL_TEMPLATES.query_policy()];
    if (text.includes('重复') || text.includes('查重')) return ['正在检查重复发票…', TOOL_TEMPLATES.check_duplicate()];
    if (text.includes('报销单') || text.includes('生成')) return ['好的，正在为你生成报销单…', TOOL_TEMPLATES.create_expense_report()];
    return ['我可以帮你：查重、查报销政策、推荐科目、生成报销单。你可以直接说「帮我生成报销单」。', ''];
}

function sendChat() {
    const input = $('#chatInput');
    const q = input.value.trim();
    if (!q) return;

    addMessage(q, 'me');
    input.value = '';

    // TODO: 替换为真实接口
    // const res = await fetch('/api/v1/agent/chat', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ message: q, invoice_id: state.currentInvoiceId })
    // });
    // const data = await res.json();

    setTimeout(() => {
        const [txt, extra] = botReply(q);
        addMessage(txt, 'bot', extra);
    }, 500);
}

/* ===================== 评测页 ===================== */
function initEvalPage() {
    renderBadcase();

    $('#btnRefreshEval').addEventListener('click', () => {
        toast('已刷新评测数据');
    });

    $('#btnExportEval').addEventListener('click', () => {
        toast('已导出评测报告');
    });
}

function renderBadcase() {
    const tbody = $('#badcaseTbody');
    tbody.innerHTML = state.evaluator.badcases.map(b => `
    <tr>
      <td>${b.type}</td>
      <td class="num">${b.count}</td>
      <td class="num">${b.ratio}</td>
      <td>${b.desc}</td>
    </tr>`).join('');
}

/* ===================== 保存发票到 state（上传页快捷保存用） ===================== */
function saveInvoiceToState(r) {
    const id = Math.max(0, ...state.invoices.map(i => i.id)) + 1;
    state.invoices.unshift({
        id,
        number: r.invoice_number,
        date: r.invoice_date,
        seller: r.seller_name,
        total: r.total,
        type: r.invoice_type,
        status: '待校对',
    });
    renderList();
}

/* ===================== 全局导航 ===================== */
function initNavigation() {
    $$('.nav-item').forEach(item => {
        item.addEventListener('click', () => go(item.dataset.page));
    });

    // 顶栏按钮
    document.addEventListener('click', e => {
        const action = e.target.dataset.action;
        if (action === 'open-settings') toast('设置面板待开发');
        if (action === 'export-all') toast('已导出全部发票');
    });
}

/* ===================== 初始化 ===================== */
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUploadPage();
    initListPage();
    initDetailPage();
    initChatPage();
    initEvalPage();

    go('upload');
});