// st-chatu8-comfy —— 基于 st-chatu8 拆分出的精简 ComfyUI 连接插件
// 仅保留「主要设置 + ComfyUI」核心：聊天标记触发、工作流预设、生图轮询、图片插入楼层
// 代码重新实现，便于二次开发做更复杂的酒馆内生图效果。

import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import * as sillyTavern from '../../../../script.js';
import { getContext } from '../../../st-context.js';

// ============ 扩展元信息 ============
const EXT_KEY = 'st-chatu8-comfy';            // extension_settings key
const EXT_DISPLAY = 'st-chatu8-comfy';

// ============ 默认配置 ============
function defaultSettings() {
    return {
        scriptEnabled: false,
        comfyuiUrl: 'http://127.0.0.1:8188',
        startTag: 'image###',
        endTag: '###image',
        negativePrompt: '',
        width: 1024,
        height: 1024,
        steps: 25,
        cfgScale: 7,
        seed: -1,
        samplerName: 'euler',
        scheduler: 'normal',
        insertOriginalText: false,
        cacheSeconds: 0,
        // 工作流预设：{ 默认: { workflow: '<API JSON 字符串>' } }
        comfyuiProfiles: { '默认': { workflow: defaultWorkflow() } },
        currentProfile: '默认',
        debugMode: false,
    };
}

function defaultWorkflow() {
    return JSON.stringify({
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": "%seed%",
                "steps": "%steps%",
                "cfg": "%cfg_scale%",
                "sampler_name": "%sampler_name%",
                "scheduler": "%scheduler%",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": { "ckpt_name": "%model_name%" }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": { "width": "%width%", "height": "%height%", "batch_size": 1 }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": "%prompt%", "clip": ["4", 1] }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": "%negative_prompt%", "clip": ["4", 1] }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": { "samples": ["3", 0], "vae": ["4", 2] }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": { "images": ["8", 0] }
        }
    }, null, 2);
}

// ============ settings 读写 ============
function getSettings() {
    if (!extension_settings[EXT_KEY]) extension_settings[EXT_KEY] = {};
    if (!extension_settings[EXT_KEY].comfyuiProfiles) extension_settings[EXT_KEY].comfyuiProfiles = { '默认': { workflow: defaultWorkflow() } };
    return extension_settings[EXT_KEY];
}
function ensureSettings() {
    const def = defaultSettings();
    const cur = getSettings();
    for (const k in def) {
        if (cur[k] === undefined) cur[k] = def[k];
    }
    return cur;
}
function saveSettings() {
    saveSettingsDebounced();
}

// ============ 日志 ============
function log(...a) { console.log(`[${EXT_DISPLAY}]`, ...a); }
function debug(...a) { if (ensureSettings().debugMode) console.debug(`[${EXT_DISPLAY}][debug]`, ...a); }

// ============ URL/请求工具 ============
function normalizeUrl(u) {
    let s = (u || '').trim().replace(/\/+$/, '');
    return s;
}
function comfyHeaders(json) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    return h;
}

// ============ ComfyUI 通信 ============
async function testConnect() {
    const s = ensureSettings();
    const url = normalizeUrl(s.comfyuiUrl);
    if (!url) throw new Error('ComfyUI 地址为空');
    const res = await fetch(url + '/system_stats', { method: 'GET', headers: comfyHeaders(true) });
    if (!res.ok) throw new Error('连接失败: ' + res.status);
    return await res.json();
}

function uid() { return 'c8-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

// 占位符替换：把 workflow(JSON 字符串) 中的 %xxx% 全部替换为实际值
function applyWorkflow(workflowStr, ctx) {
    let s = workflowStr;
    const map = {
        '%prompt%': ctx.prompt,
        '%negative_prompt%': ctx.negativePrompt,
        '%width%': String(ctx.width),
        '%height%': String(ctx.height),
        '%steps%': String(ctx.steps),
        '%cfg_scale%': String(ctx.cfgScale),
        '%seed%': String(ctx.seed),
        '%sampler_name%': ctx.samplerName,
        '%scheduler%': ctx.scheduler,
    };
    for (const k in map) {
        s = s.split(k).join(String(map[k]));
    }
    return s;
}

// 发起一次 ComfyUI 请求，轮询直至拿到图片 blob dataURL
async function runComfyUI(ctx, onProgress) {
    const s = ensureSettings();
    const url = normalizeUrl(s.comfyuiUrl);
    if (!url) throw new Error('ComfyUI 地址为空');

    const profile = s.comfyuiProfiles[s.currentProfile] || { workflow: defaultWorkflow() };
    const wfStr = applyWorkflow(profile.workflow, ctx);
    let workflowObj;
    try { workflowObj = JSON.parse(wfStr); }
    catch (e) { throw new Error('工作流 JSON 无效: ' + e.message); }

    const clientId = uid();
    const payload = JSON.stringify({ client_id: clientId, prompt: workflowObj });
    debug('POST /prompt', payload);

    const res = await fetch(url + '/prompt', { method: 'POST', body: payload, headers: comfyHeaders(true) });
    if (!res.ok) {
        const t = await res.text();
        throw new Error('请求失败 状态码 ' + res.status + ' 详情: ' + t);
    }
    const rj = await res.json();
    const promptId = rj.prompt_id;
    if (!promptId) throw new Error('ComfyUI 未返回 prompt_id');

    // 轮询 /history/{prompt_id}
    const startTs = Date.now();
    const MAX_MS = 10 * 60 * 1000;
    while (true) {
        if (Date.now() - startTs > MAX_MS) throw new Error('生图超时');
        await new Promise(r => setTimeout(r, 1000));
        const hres = await fetch(url + '/history/' + promptId, { headers: comfyHeaders() });
        if (!hres.ok) continue;
        const hj = await hres.json();
        if (!hj.hasOwnProperty(promptId)) continue;
        const entry = hj[promptId];
        if (entry.status && entry.status.status_str === 'error') {
            let msg = (entry.status.exception_message) || 'ComfyUI 执行错误';
            throw new Error(msg);
        }
        const outputs = entry.outputs || {};
        let found = null;
        for (const k in outputs) {
            const node = outputs[k];
            if (node.images && node.images.length) {
                const out = node.images.find(it => it.type === 'output') || node.images[0];
                found = { filename: out.filename, subfolder: out.subfolder || '', isVideo: false, format: 'image' };
                break;
            }
            if (node.gifs && node.gifs.length) {
                const g = node.gifs[0];
                const isVid = !!(g.format && g.format.startsWith('video/'));
                found = { filename: g.filename, subfolder: g.subfolder || '', isVideo: isVid, format: g.format || 'image/gif' };
                break;
            }
        }
        if (!found) throw new Error('未能从 API 响应中找到文件名');
        const viewUrl = `${url}/view?filename=${encodeURIComponent(found.filename)}&subfolder=${encodeURIComponent(found.subfolder)}&type=output`;
        const vres = await fetch(viewUrl, { headers: comfyHeaders() });
        if (!vres.ok) throw new Error('获取图片失败 状态码 ' + vres.status);
        const blob = await vres.blob();
        const dataUrl = await blobToDataUrl(blob);
        return { dataUrl, isVideo: found.isVideo, format: found.format };
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = reject;
        fr.readAsDataURL(blob);
    });
}

// ============ 聊天楼层：链接图片到楼层 ============
// 借鉴原插件做法：在目标楼层 mes_text 中插入 <img src=dataUrl>，
// 并通过 SillyTavern 提供的 message 数据 API 持久化（避免刷新丢失）。
async function insertImageIntoMessage(messageId, dataUrl, altText) {
    try {
        const ctx = getContext();
        const msg = ctx.chat?.[messageId];
        if (!msg) { log('目标楼层不存在', messageId); return false; }
        const html = `\n\n<img src="${dataUrl}" alt="${(altText||'').replace(/"/g,'&quot;')}" style="max-width:100%;border-radius:6px;" />\n\n`;
        const newMes = (msg.mes || '') + html;
        msg.mes = newMes;
        // 触发刷新显示
        if (typeof sillyTavern.saveChatConditional === 'function') {
            await sillyTavern.saveChatConditional();
        }
        // 刷新单楼
        try {
            const evt = sillyTavern.eventSource;
            if (evt && typeof sillyTavern.event_types !== 'undefined') {
                evt.emit(sillyTavern.event_types.MESSAGE_UPDATED, messageId);
            }
        } catch (_) {}
        return true;
    } catch (e) {
        log('插入楼层失败', e);
        return false;
    }
}

// 简易前端 DOM 兜底刷新（在 mes API 不可用时使用）
async function insertImageIntoDom(messageId, dataUrl) {
    try {
        const $mes = $(`#chat .mes[mes_id="${messageId}"] .mes_text`);
        if (!$mes.length) return false;
        $mes.append(`<img src="${dataUrl}" style="max-width:100%;border-radius:6px;" />`);
        return true;
    } catch (_) { return false; }
}

// ============ 聊天消息扫描与触发 ============
// 在 AI 消息更新后扫描 startTag...endTag 包裹的提示词，触发生成并插入到当前楼层
let currentTaskAbort = null;

async function processMessageForPrompts(messageId, text) {
    const s = ensureSettings();
    if (!s.scriptEnabled) return;
    if (!text || typeof text !== 'string') return;
    const start = s.startTag, end = s.endTag;
    if (!start || !end) return;
    const re = new RegExp(escapeRegex(start) + '([\\s\\S]*?)' + escapeRegex(end), 'g');
    let m;
    let count = 0;
    while ((m = re.exec(text)) !== null) {
        const prompt = m[1].trim();
        if (!prompt) continue;
        count++;
        try {
            await generateOneFor(messageId, prompt);
        } catch (e) {
            log('生成失败', prompt, e);
            toastr && toastr.error('生图失败: ' + e.message);
        }
    }
    return count;
}

async function generateOneFor(messageId, rawPrompt) {
    const s = ensureSettings();
    const ctx = {
        prompt: rawPrompt,
        negativePrompt: s.negativePrompt || '',
        width: Number(s.width) || 1024,
        height: Number(s.height) || 1024,
        steps: Number(s.steps) || 25,
        cfgScale: Number(s.cfgScale) || 7,
        seed: Number(s.seed) === -1 ? Math.floor(Math.random() * 2 ** 31) : Number(s.seed),
        samplerName: s.samplerName || 'euler',
        scheduler: s.scheduler || 'normal',
    };
    toastr && toastr.info('开始生成: ' + (rawPrompt.length > 30 ? rawPrompt.slice(0, 30) + '…' : rawPrompt));
    const res = await runComfyUI(ctx);
    await insertImageIntoMessage(messageId, res.dataUrl, rawPrompt);
    await insertImageIntoDom(messageId, res.dataUrl);
    toastr && toastr.success('生图完成');
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ============ 事件绑定 ============
function bindEvents() {
    try {
        const evt = sillyTavern.eventSource;
        const T = sillyTavern.event_types;
        if (evt && T) {
            // AI 消息更新后扫描
            evt.on(T.MESSAGE_RECEIVED, (mesId) => onMessageReceived(mesId));
            evt.on(T.MESSAGE_UPDATED, (mesId) => onMessageReceived(mesId));
        }
    } catch (e) { log('事件绑定失败', e); }
}

async function onMessageReceived(messageId) {
    try {
        const ctx = getContext();
        const msg = ctx.chat?.[messageId];
        if (!msg) return;
        if (msg.is_user) return;
        await processMessageForPrompts(messageId, msg.mes);
    } catch (e) { log('onMessageReceived error', e); }
}

// ============ 设置面板 UI ============
const PANEL_ID = 'st-chatu8-comfy-settings-panel';

function ensureSettingsDict() { return ensureSettings(); }

function openPanel() {
    const s = ensureSettings();
    if ($(`#${PANEL_ID}`).length) { $(`#${PANEL_ID}`).remove(); }
    const $panel = $(`
    <div id="${PANEL_ID}" class="st-chatu8-comfy-panel">
      <div class="cc-header">
        <h2>ComfyUI 连接 <small>v0.1.0</small></h2>
        <span class="cc-close">&times;</span>
      </div>
      <div class="cc-body">
        <section>
          <h3>主要设置</h3>
          <div class="cc-field">
            <label><input type="checkbox" id="cc-scriptEnabled" /> 启用插件</label>
          </div>
          <div class="cc-field">
            <label>开始标记</label><input type="text" id="cc-startTag" class="cc-input" />
          </div>
          <div class="cc-field">
            <label>结束标记</label><input type="text" id="cc-endTag" class="cc-input" />
          </div>
          <div class="cc-field">
            <label>负面提示词</label>
            <textarea id="cc-negativePrompt" rows="3" class="cc-textarea"></textarea>
          </div>
        </section>
        <section>
          <h3>ComfyUI 连接</h3>
          <div class="cc-field cc-row">
            <input type="text" id="cc-comfyuiUrl" class="cc-input" placeholder="http://127.0.0.1:8188" />
            <button id="cc-testConnect" class="cc-btn">测试连接</button>
          </div>
        </section>
        <section>
          <h3>生成参数</h3>
          <div class="cc-grid">
            <div class="cc-field"><label>宽</label><input type="number" id="cc-width" class="cc-input" /></div>
            <div class="cc-field"><label>高</label><input type="number" id="cc-height" class="cc-input" /></div>
            <div class="cc-field"><label>步数</label><input type="number" id="cc-steps" class="cc-input" /></div>
            <div class="cc-field"><label>CFG</label><input type="number" step="0.5" id="cc-cfgScale" class="cc-input" /></div>
            <div class="cc-field"><label>种子 (-1 随机)</label><input type="number" id="cc-seed" class="cc-input" /></div>
            <div class="cc-field"><label>采样器</label><input type="text" id="cc-samplerName" class="cc-input" /></div>
            <div class="cc-field"><label>调度器</label><input type="text" id="cc-scheduler" class="cc-input" /></div>
          </div>
        </section>
        <section>
          <h3>工作流预设</h3>
          <div class="cc-field cc-row">
            <select id="cc-profileSelect" class="cc-select"></select>
            <button class="cc-btn" id="cc-loadProfile">读取</button>
            <button class="cc-btn" id="cc-saveProfile">保存</button>
            <button class="cc-btn" id="cc-newProfile">新建</button>
            <button class="cc-btn danger" id="cc-delProfile">删除</button>
          </div>
          <div class="cc-field">
            <label>工作流 (API JSON，支持 %prompt% %negative_prompt% %width% %height% %steps% %cfg_scale% %seed% %sampler_name% %scheduler% 占位符)</label>
            <textarea id="cc-workflow" rows="12" class="cc-textarea mono"></textarea>
          </div>
        </section>
        <section>
          <h3>其他</h3>
          <div class="cc-field"><label><input type="checkbox" id="cc-debugMode" /> 调试模式（输出控制台日志）</label></div>
        </section>
      </div>
      <div class="cc-footer">
        <button id="cc-saveAll" class="cc-btn primary">保存全部</button>
      </div>
    </div>`);
    $('body').append($panel);

    // 填充
    refreshProfileOptions();
    fillForm();

    // 事件
    $panel.off('.cc').on('click.cc', '.cc-close', () => $panel.remove());
    $panel.on('click.cc', '#cc-saveAll', saveAllFromForm);
    $panel.on('click.cc', '#cc-testConnect', async () => {
        try {
            s.comfyuiUrl = $('#cc-comfyuiUrl').val();
            saveSettings();
            const j = await testConnect();
            toastr && toastr.success('连接成功: ' + (j && j.system ? j.system.comfyui_version : 'OK'));
        } catch (e) { toastr && toastr.error(e.message); }
    });
    $panel.on('change.cc', '#cc-profileSelect', () => {
        ensureSettings().currentProfile = $('#cc-profileSelect').val();
        loadProfileToTextarea();
    });
    $panel.on('click.cc', '#cc-loadProfile', loadProfileToTextarea);
    $panel.on('click.cc', '#cc-saveProfile', () => {
        const name = $('#cc-profileSelect').val();
        ensureSettings().comfyuiProfiles[name] = { workflow: $('#cc-workflow').val() };
        saveSettings();
        toastr && toastr.success('预设已保存: ' + name);
    });
    $panel.on('click.cc', '#cc-newProfile', () => {
        const name = prompt('新预设名称：');
        if (!name) return;
        if (ensureSettings().comfyuiProfiles[name]) { toastr && toastr.warning('已存在'); return; }
        ensureSettings().comfyuiProfiles[name] = { workflow: defaultWorkflow() };
        ensureSettings().currentProfile = name;
        saveSettings();
        refreshProfileOptions();
        $('#cc-profileSelect').val(name);
        loadProfileToTextarea();
    });
    $panel.on('click.cc', '#cc-delProfile', () => {
        const name = $('#cc-profileSelect').val();
        if (Object.keys(ensureSettings().comfyuiProfiles).length <= 1) { toastr && toastr.warning('至少保留一个预设'); return; }
        if (!confirm('删除预设「' + name + '」？')) return;
        delete ensureSettings().comfyuiProfiles[name];
        ensureSettings().currentProfile = Object.keys(ensureSettings().comfyuiProfiles)[0];
        saveSettings();
        refreshProfileOptions();
        loadProfileToTextarea();
    });
}

function refreshProfileOptions() {
    const s = ensureSettings();
    const $sel = $('#cc-profileSelect');
    $sel.empty();
    Object.keys(s.comfyuiProfiles).forEach(n => $sel.append(`<option value="${n}">${n}</option>`));
    $sel.val(s.currentProfile);
}
function loadProfileToTextarea() {
    const s = ensureSettings();
    const p = s.comfyuiProfiles[s.currentProfile];
    $('#cc-workflow').val(p ? p.workflow : '');
}
function fillForm() {
    const s = ensureSettings();
    $('#cc-scriptEnabled').prop('checked', !!s.scriptEnabled);
    $('#cc-comfyuiUrl').val(s.comfyuiUrl);
    $('#cc-startTag').val(s.startTag);
    $('#cc-endTag').val(s.endTag);
    $('#cc-negativePrompt').val(s.negativePrompt);
    $('#cc-width').val(s.width);
    $('#cc-height').val(s.height);
    $('#cc-steps').val(s.steps);
    $('#cc-cfgScale').val(s.cfgScale);
    $('#cc-seed').val(s.seed);
    $('#cc-samplerName').val(s.samplerName);
    $('#cc-scheduler').val(s.scheduler);
    $('#cc-debugMode').prop('checked', !!s.debugMode);
    loadProfileToTextarea();
}
function saveAllFromForm() {
    const s = ensureSettings();
    s.scriptEnabled = !!$('#cc-scriptEnabled').prop('checked');
    s.comfyuiUrl = $('#cc-comfyuiUrl').val().trim();
    s.startTag = $('#cc-startTag').val();
    s.endTag = $('#cc-endTag').val();
    s.negativePrompt = $('#cc-negativePrompt').val();
    s.width = Number($('#cc-width').val()) || 1024;
    s.height = Number($('#cc-height').val()) || 1024;
    s.steps = Number($('#cc-steps').val()) || 25;
    s.cfgScale = Number($('#cc-cfgScale').val()) || 7;
    s.seed = Number($('#cc-seed').val());
    s.samplerName = $('#cc-samplerName').val();
    s.scheduler = $('#cc-scheduler').val();
    s.debugMode = !!$('#cc-debugMode').prop('checked');
    const name = $('#cc-profileSelect').val();
    s.comfyuiProfiles[name] = { workflow: $('#cc-workflow').val() };
    s.currentProfile = name;
    saveSettings();
    toastr && toastr.success('设置已保存');
}

// ============ 注册扩展按钮 ============
function addEntryButton() {
    try {
        // 在扩展菜单加一个按钮
        const SETTINGS_SELECTOR = '#extensions_settings';
        const $anchor = $(SETTINGS_SELECTOR);
        if (!$anchor.length) {
            setTimeout(addEntryButton, 2000);
            return;
        }
        if ($('#st-chatu8-comfy-entry').length) return;
        const $btn = $(`
            <div id="st-chatu8-comfy-entry" class="inlineGov-setting">
                <button class="menu_button" type="button" id="st-chatu8-comfy-open">
                    <i class="fa-solid fa-image"></i> ComfyUI 连接
                </button>
            </div>
        `);
        $anchor.append($btn);
        $btn.on('click', '#st-chatu8-comfy-open', openPanel);
    } catch (e) { log('addEntryButton error', e); setTimeout(addEntryButton, 2000); }
}

// ============ 启动 ============
jQuery(() => {
    ensureSettings();
    bindEvents();
    addEntryButton();
    log('loaded', EXT_DISPLAY);
});