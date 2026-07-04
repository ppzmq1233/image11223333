import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import * as tavern from '../../../../script.js';
import { getContext } from '../../../st-context.js';

const EXT_KEY = 'st-chatu8-comfy';
const EXT_NAME = 'st-chatu8-comfy';
const PANEL_ID = 'st-chatu8-comfy-settings-panel';
const ENTRY_ID = 'st-chatu8-comfy-entry';

const DEFAULT_WORKFLOW = JSON.stringify({
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
        "inputs": { "images": ["8", 0], "filename_prefix": "st-comfy" }
    }
}, null, 2);

function defaultSettings() {
    return {
        scriptEnabled: false,
        comfyuiUrl: 'http://127.0.0.1:8188',
        startTag: 'image###',
        endTag: '###image',
        negativePrompt: '',
        width: 1024,
        height: 1024,
        steps: 28,
        cfgScale: 6,
        seed: -1,
        samplerName: 'euler',
        scheduler: 'normal',
        modelName: '',
        vaeName: '',
        clipName: '',
        autoPatchWorkflow: true,
        maxConcurrent: 1,
        pollIntervalMs: 1000,
        timeoutMs: 600000,
        allowBatch: true,
        batchDelimiter: '\n---\n',
        appendOriginalPrompt: false,
        debugMode: false,
        models: [],
        samplers: [],
        schedulers: [],
        vaes: [],
        clips: [],
        loras: [],
        customPlaceholders: {},
        comfyuiProfiles: { '默认': { workflow: DEFAULT_WORKFLOW } },
        currentProfile: '默认',
    };
}

function settings() {
    if (!extension_settings[EXT_KEY]) extension_settings[EXT_KEY] = {};
    const s = extension_settings[EXT_KEY];
    const d = defaultSettings();
    for (const k in d) {
        if (s[k] === undefined) s[k] = d[k];
    }
    if (!s.comfyuiProfiles || typeof s.comfyuiProfiles !== 'object') s.comfyuiProfiles = { '默认': { workflow: DEFAULT_WORKFLOW } };
    if (!s.currentProfile || !s.comfyuiProfiles[s.currentProfile]) s.currentProfile = Object.keys(s.comfyuiProfiles)[0] || '默认';
    if (!s.comfyuiProfiles[s.currentProfile]) s.comfyuiProfiles[s.currentProfile] = { workflow: DEFAULT_WORKFLOW };
    if (!s.customPlaceholders || typeof s.customPlaceholders !== 'object') s.customPlaceholders = {};
    return s;
}

function save() {
    saveSettingsDebounced();
}

function normalizeUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function log(...args) {
    console.log(`[${EXT_NAME}]`, ...args);
}

function debug(...args) {
    if (settings().debugMode) console.debug(`[${EXT_NAME}][debug]`, ...args);
}

function headers(json = false) {
    return json ? { 'Content-Type': 'application/json' } : {};
}

function uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'cc-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        let detail = '';
        try { detail = await response.text(); } catch (_) {}
        throw new Error(`${response.status} ${response.statusText}${detail ? ': ' + detail : ''}`);
    }
    return response.json();
}

async function testComfyConnection() {
    const base = normalizeUrl(settings().comfyuiUrl);
    if (!base) throw new Error('ComfyUI 地址为空');
    return fetchJson(`${base}/system_stats`, { headers: headers() });
}

function getInputChoices(objectInfo, nodeName, inputName) {
    const info = objectInfo?.[nodeName];
    const required = info?.input?.required || {};
    const optional = info?.input?.optional || {};
    const item = required[inputName] || optional[inputName];
    if (Array.isArray(item?.[0])) return item[0];
    if (Array.isArray(item)) return item.find(Array.isArray) || [];
    return [];
}

async function refreshComfyObjects() {
    const s = settings();
    const base = normalizeUrl(s.comfyuiUrl);
    if (!base) throw new Error('ComfyUI 地址为空');
    const info = await fetchJson(`${base}/object_info`, { headers: headers() });
    s.models = getInputChoices(info, 'CheckpointLoaderSimple', 'ckpt_name');
    s.samplers = getInputChoices(info, 'KSampler', 'sampler_name');
    s.schedulers = getInputChoices(info, 'KSampler', 'scheduler');
    s.vaes = getInputChoices(info, 'VAELoader', 'vae_name');
    s.clips = getInputChoices(info, 'CLIPLoader', 'clip_name');
    s.loras = getInputChoices(info, 'LoraLoader', 'lora_name');
    if (!s.modelName && s.models.length) s.modelName = s.models[0];
    if (!s.samplerName && s.samplers.length) s.samplerName = s.samplers[0];
    if (!s.scheduler && s.schedulers.length) s.scheduler = s.schedulers[0];
    if (!s.vaeName && s.vaes.length) s.vaeName = s.vaes[0];
    if (!s.clipName && s.clips.length) s.clipName = s.clips[0];
    save();
    return info;
}

function buildContext(rawPrompt, overrides = {}) {
    const s = settings();
    const seed = Number(overrides.seed ?? s.seed);
    return {
        prompt: rawPrompt,
        negative_prompt: overrides.negativePrompt ?? s.negativePrompt ?? '',
        width: Number(overrides.width ?? s.width) || 1024,
        height: Number(overrides.height ?? s.height) || 1024,
        steps: Number(overrides.steps ?? s.steps) || 28,
        cfg_scale: Number(overrides.cfgScale ?? s.cfgScale) || 6,
        seed: seed === -1 ? Math.floor(Math.random() * 2147483647) : seed,
        sampler_name: overrides.samplerName ?? s.samplerName ?? '',
        scheduler: overrides.scheduler ?? s.scheduler ?? '',
        model_name: overrides.modelName ?? s.modelName ?? '',
        vae_name: overrides.vaeName ?? s.vaeName ?? '',
        clip_name: overrides.clipName ?? s.clipName ?? '',
        profile: s.currentProfile,
        ...s.customPlaceholders,
    };
}

function replacePlaceholders(text, ctx) {
    let out = String(text || '');
    const map = { ...ctx };
    for (const [key, value] of Object.entries(map)) {
        out = out.split(`%${key}%`).join(String(value ?? ''));
        out = out.split(`{{${key}}}`).join(String(value ?? ''));
    }
    return out;
}

function deepWalk(value, callback, path = []) {
    if (Array.isArray(value)) {
        value.forEach((item, index) => deepWalk(item, callback, path.concat(index)));
        return;
    }
    if (value && typeof value === 'object') {
        callback(value, path);
        for (const [k, v] of Object.entries(value)) deepWalk(v, callback, path.concat(k));
    }
}

function autoPatchWorkflow(workflow, ctx) {
    if (!settings().autoPatchWorkflow) return workflow;
    deepWalk(workflow, (node) => {
        if (!node.inputs || !node.class_type) return;
        if (node.class_type === 'KSampler') {
            if ('seed' in node.inputs) node.inputs.seed = Number(ctx.seed);
            if ('steps' in node.inputs) node.inputs.steps = Number(ctx.steps);
            if ('cfg' in node.inputs) node.inputs.cfg = Number(ctx.cfg_scale);
            if ('sampler_name' in node.inputs && ctx.sampler_name) node.inputs.sampler_name = ctx.sampler_name;
            if ('scheduler' in node.inputs && ctx.scheduler) node.inputs.scheduler = ctx.scheduler;
        }
        if (node.class_type === 'EmptyLatentImage') {
            if ('width' in node.inputs) node.inputs.width = Number(ctx.width);
            if ('height' in node.inputs) node.inputs.height = Number(ctx.height);
        }
        if (node.class_type === 'CheckpointLoaderSimple' && node.inputs.ckpt_name !== undefined && ctx.model_name) node.inputs.ckpt_name = ctx.model_name;
        if (node.class_type === 'VAELoader' && node.inputs.vae_name !== undefined && ctx.vae_name) node.inputs.vae_name = ctx.vae_name;
        if (node.class_type === 'CLIPLoader' && node.inputs.clip_name !== undefined && ctx.clip_name) node.inputs.clip_name = ctx.clip_name;
    });
    return workflow;
}

function prepareWorkflow(rawPrompt, overrides = {}) {
    const s = settings();
    const profile = s.comfyuiProfiles[s.currentProfile] || { workflow: DEFAULT_WORKFLOW };
    const ctx = buildContext(rawPrompt, overrides);
    const replaced = replacePlaceholders(profile.workflow, ctx);
    let workflow;
    try {
        workflow = JSON.parse(replaced);
    } catch (error) {
        throw new Error('工作流 JSON 无效: ' + error.message);
    }
    return { workflow: autoPatchWorkflow(workflow, ctx), ctx };
}

function findOutputFile(outputs) {
    for (const node of Object.values(outputs || {})) {
        if (node?.images?.length) {
            const image = node.images.find(x => x.type === 'output') || node.images[0];
            return { filename: image.filename, subfolder: image.subfolder || '', type: 'output', isVideo: false, format: 'image' };
        }
        if (node?.gifs?.length) {
            const gif = node.gifs[0];
            const isVideo = !!gif.format?.startsWith('video/');
            return { filename: gif.filename, subfolder: gif.subfolder || '', type: 'output', isVideo, format: gif.format || 'image/gif' };
        }
    }
    return null;
}

async function submitComfyPrompt(task) {
    const s = settings();
    const base = normalizeUrl(s.comfyuiUrl);
    if (!base) throw new Error('ComfyUI 地址为空');
    const { workflow, ctx } = prepareWorkflow(task.prompt, task.overrides);
    const payload = JSON.stringify({ client_id: task.clientId, prompt: workflow });
    debug('payload', payload);
    const response = await fetch(`${base}/prompt`, { method: 'POST', body: payload, headers: headers(true) });
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${await response.text()}`);
    const json = await response.json();
    if (!json.prompt_id) throw new Error('ComfyUI 未返回 prompt_id');
    task.promptId = json.prompt_id;
    task.ctx = ctx;
}

async function pollComfyResult(task) {
    const s = settings();
    const base = normalizeUrl(s.comfyuiUrl);
    const start = Date.now();
    while (!task.cancelled) {
        if (Date.now() - start > Number(s.timeoutMs || 600000)) throw new Error('ComfyUI 生图超时');
        await new Promise(resolve => setTimeout(resolve, Number(s.pollIntervalMs || 1000)));
        const response = await fetch(`${base}/history/${task.promptId}`, { headers: headers() });
        if (!response.ok) continue;
        const history = await response.json();
        if (!history.hasOwnProperty(task.promptId)) continue;
        const entry = history[task.promptId];
        if (entry.status?.status_str === 'error') throw new Error(entry.status.exception_message || 'ComfyUI 执行错误');
        const file = findOutputFile(entry.outputs);
        if (!file) throw new Error('未能从 API 响应中找到输出文件');
        const url = `${base}/view?filename=${encodeURIComponent(file.filename)}&subfolder=${encodeURIComponent(file.subfolder)}&type=${encodeURIComponent(file.type)}`;
        const fileResponse = await fetch(url, { headers: headers() });
        if (!fileResponse.ok) throw new Error(`获取输出失败 ${fileResponse.status}`);
        const blob = await fileResponse.blob();
        return { dataUrl: await blobToDataUrl(blob), file, task };
    }
    throw new Error('任务已取消');
}

async function interruptComfy() {
    const base = normalizeUrl(settings().comfyuiUrl);
    if (!base) return;
    try { await fetch(`${base}/api/interrupt`, { method: 'POST', headers: headers() }); } catch (error) { debug('interrupt failed', error); }
}

const queue = {
    items: [],
    active: 0,
    seq: 0,
    push(task) {
        task.id = ++this.seq;
        task.clientId = uuid();
        task.status = 'pending';
        this.items.push(task);
        this.render();
        this.run();
        return task;
    },
    cancelAll() {
        for (const item of this.items) item.cancelled = true;
        this.items = this.items.filter(item => item.status === 'running');
        interruptComfy();
        this.render();
    },
    async run() {
        const max = Math.max(1, Number(settings().maxConcurrent || 1));
        while (this.active < max) {
            const task = this.items.find(item => item.status === 'pending');
            if (!task) break;
            this.execute(task);
        }
    },
    async execute(task) {
        this.active++;
        task.status = 'running';
        this.render();
        try {
            await submitComfyPrompt(task);
            const result = await pollComfyResult(task);
            await insertResult(task.messageId, result.dataUrl, task.prompt);
            task.status = 'done';
            toastr?.success(`生图完成 #${task.id}`);
        } catch (error) {
            task.status = 'error';
            task.error = error.message;
            console.error(`[${EXT_NAME}] task failed`, error);
            toastr?.error(`生图失败 #${task.id}: ${error.message}`);
        } finally {
            this.active--;
            this.items = this.items.filter(item => item.status === 'pending' || item.status === 'running');
            this.render();
            this.run();
        }
    },
    render() {
        const pending = this.items.filter(x => x.status === 'pending').length;
        const running = this.items.filter(x => x.status === 'running').length;
        $('#cc-queue-status').text(`运行 ${running} / 等待 ${pending}`);
    }
};

async function insertResult(messageId, dataUrl, prompt) {
    const escaped = String(prompt || '').replace(/"/g, '&quot;');
    const html = `\n\n<img class="st-chatu8-comfy-image" src="${dataUrl}" alt="${escaped}" data-comfy-prompt="${escaped}" />\n\n`;
    let saved = false;
    try {
        const context = getContext();
        const message = context.chat?.[messageId];
        if (message) {
            message.mes = String(message.mes || '') + html;
            await tavern.saveChatConditional?.();
            saved = true;
        }
    } catch (error) {
        console.warn(`[${EXT_NAME}] 保存楼层失败`, error);
    }
    const $mes = $(`#chat .mes[mes_id="${messageId}"] .mes_text`);
    if ($mes.length) $mes.append(html);
    if (saved) {
        try { tavern.eventSource?.emit?.(tavern.event_types?.MESSAGE_UPDATED, messageId); } catch (_) {}
    }
}

function splitPrompts(text) {
    const s = settings();
    if (!s.allowBatch) return [text.trim()].filter(Boolean);
    const delimiter = String(s.batchDelimiter || '').replace(/\\n/g, '\n');
    if (!delimiter) return [text.trim()].filter(Boolean);
    return text.split(delimiter).map(x => x.trim()).filter(Boolean);
}

function extractPromptBlocks(text) {
    const s = settings();
    if (!s.startTag || !s.endTag) return [];
    const re = new RegExp(escapeRegex(s.startTag) + '([\\s\\S]*?)' + escapeRegex(s.endTag), 'g');
    const list = [];
    let match;
    while ((match = re.exec(text)) !== null) {
        list.push(...splitPrompts(match[1]));
    }
    return list;
}

async function processMessage(messageId) {
    const s = settings();
    if (!s.scriptEnabled) return;
    const context = getContext();
    const message = context.chat?.[messageId];
    if (!message || message.is_user) return;
    const prompts = extractPromptBlocks(message.mes || '');
    for (const prompt of prompts) queue.push({ messageId, prompt, overrides: {} });
    if (prompts.length) toastr?.info(`已加入 ${prompts.length} 个生图任务`);
}

function bindMessageEvents() {
    try {
        const es = tavern.eventSource;
        const et = tavern.event_types;
        if (!es || !et) return;
        es.on(et.MESSAGE_RECEIVED, id => processMessage(Number(id)));
        es.on(et.MESSAGE_UPDATED, id => processMessage(Number(id)));
    } catch (error) {
        console.warn(`[${EXT_NAME}] 事件绑定失败`, error);
    }
}

function optionList(values, selected) {
    const list = Array.isArray(values) ? values : [];
    const opts = list.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('');
    return opts || `<option value="${escapeHtml(selected || '')}">${escapeHtml(selected || '未刷新')}</option>`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function openPanel() {
    $(`#${PANEL_ID}`).remove();
    const s = settings();
    const $panel = $(`
<div id="${PANEL_ID}" class="st-chatu8-comfy-panel">
  <div class="cc-header"><h2>ComfyUI 生图桥 <small>v0.2.0</small></h2><span class="cc-close">&times;</span></div>
  <div class="cc-body">
    <section><h3>主要设置</h3>
      <label class="cc-check"><input id="cc-scriptEnabled" type="checkbox" ${s.scriptEnabled ? 'checked' : ''}> 启用插件</label>
      <div class="cc-grid two"><label>开始标记<input id="cc-startTag" class="cc-input" value="${escapeHtml(s.startTag)}"></label><label>结束标记<input id="cc-endTag" class="cc-input" value="${escapeHtml(s.endTag)}"></label></div>
      <div class="cc-grid two"><label>批量分隔符<input id="cc-batchDelimiter" class="cc-input" value="${escapeHtml(String(s.batchDelimiter).replace(/\n/g, '\\n'))}"></label><label>并发数<input id="cc-maxConcurrent" type="number" min="1" max="8" class="cc-input" value="${escapeHtml(s.maxConcurrent)}"></label></div>
      <label class="cc-check"><input id="cc-allowBatch" type="checkbox" ${s.allowBatch ? 'checked' : ''}> 一个标记内允许批量提示词</label>
    </section>
    <section><h3>连接与模型</h3>
      <div class="cc-row"><input id="cc-comfyuiUrl" class="cc-input" value="${escapeHtml(s.comfyuiUrl)}"><button id="cc-test" class="cc-btn">测试连接</button><button id="cc-refresh" class="cc-btn">刷新列表</button></div>
      <div class="cc-grid two"><label>模型<select id="cc-modelName" class="cc-select">${optionList(s.models, s.modelName)}</select></label><label>采样器<select id="cc-samplerName" class="cc-select">${optionList(s.samplers, s.samplerName)}</select></label></div>
      <div class="cc-grid two"><label>调度器<select id="cc-scheduler" class="cc-select">${optionList(s.schedulers, s.scheduler)}</select></label><label>VAE<select id="cc-vaeName" class="cc-select">${optionList(s.vaes, s.vaeName)}</select></label></div>
      <label>CLIP<select id="cc-clipName" class="cc-select">${optionList(s.clips, s.clipName)}</select></label>
    </section>
    <section><h3>生成参数</h3>
      <div class="cc-grid three"><label>宽<input id="cc-width" type="number" class="cc-input" value="${escapeHtml(s.width)}"></label><label>高<input id="cc-height" type="number" class="cc-input" value="${escapeHtml(s.height)}"></label><label>步数<input id="cc-steps" type="number" class="cc-input" value="${escapeHtml(s.steps)}"></label></div>
      <div class="cc-grid three"><label>CFG<input id="cc-cfgScale" type="number" step="0.1" class="cc-input" value="${escapeHtml(s.cfgScale)}"></label><label>种子<input id="cc-seed" type="number" class="cc-input" value="${escapeHtml(s.seed)}"></label><label>轮询(ms)<input id="cc-pollIntervalMs" type="number" class="cc-input" value="${escapeHtml(s.pollIntervalMs)}"></label></div>
      <label>负面提示词<textarea id="cc-negativePrompt" class="cc-textarea" rows="3">${escapeHtml(s.negativePrompt)}</textarea></label>
      <label class="cc-check"><input id="cc-autoPatchWorkflow" type="checkbox" ${s.autoPatchWorkflow ? 'checked' : ''}> 自动补丁工作流常见节点参数</label>
    </section>
    <section><h3>工作流预设</h3>
      <div class="cc-row"><select id="cc-profile" class="cc-select">${Object.keys(s.comfyuiProfiles).map(name => `<option value="${escapeHtml(name)}" ${name === s.currentProfile ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select><button id="cc-saveProfile" class="cc-btn">保存预设</button><button id="cc-newProfile" class="cc-btn">新建</button><button id="cc-deleteProfile" class="cc-btn danger">删除</button></div>
      <textarea id="cc-workflow" class="cc-textarea mono" rows="14">${escapeHtml(s.comfyuiProfiles[s.currentProfile]?.workflow || DEFAULT_WORKFLOW)}</textarea>
      <p class="cc-help">占位符支持 %prompt% / {{prompt}}、%negative_prompt%、%width%、%height%、%steps%、%cfg_scale%、%seed%、%sampler_name%、%scheduler%、%model_name%、%vae_name%、%clip_name%。</p>
    </section>
    <section><h3>任务队列</h3>
      <div class="cc-row"><span id="cc-queue-status">运行 0 / 等待 0</span><button id="cc-cancelAll" class="cc-btn danger">取消全部</button></div>
      <label class="cc-check"><input id="cc-debugMode" type="checkbox" ${s.debugMode ? 'checked' : ''}> 调试日志</label>
    </section>
  </div>
  <div class="cc-footer"><button id="cc-save" class="cc-btn primary">保存全部</button></div>
</div>`);
    $('body').append($panel);
    bindPanel($panel);
    queue.render();
}

function readPanel() {
    const s = settings();
    s.scriptEnabled = $('#cc-scriptEnabled').prop('checked');
    s.startTag = $('#cc-startTag').val();
    s.endTag = $('#cc-endTag').val();
    s.batchDelimiter = $('#cc-batchDelimiter').val();
    s.allowBatch = $('#cc-allowBatch').prop('checked');
    s.maxConcurrent = Number($('#cc-maxConcurrent').val()) || 1;
    s.comfyuiUrl = $('#cc-comfyuiUrl').val();
    s.modelName = $('#cc-modelName').val();
    s.samplerName = $('#cc-samplerName').val();
    s.scheduler = $('#cc-scheduler').val();
    s.vaeName = $('#cc-vaeName').val();
    s.clipName = $('#cc-clipName').val();
    s.width = Number($('#cc-width').val()) || 1024;
    s.height = Number($('#cc-height').val()) || 1024;
    s.steps = Number($('#cc-steps').val()) || 28;
    s.cfgScale = Number($('#cc-cfgScale').val()) || 6;
    s.seed = Number($('#cc-seed').val());
    s.pollIntervalMs = Number($('#cc-pollIntervalMs').val()) || 1000;
    s.negativePrompt = $('#cc-negativePrompt').val();
    s.autoPatchWorkflow = $('#cc-autoPatchWorkflow').prop('checked');
    s.debugMode = $('#cc-debugMode').prop('checked');
    s.currentProfile = $('#cc-profile').val();
    s.comfyuiProfiles[s.currentProfile] = { workflow: $('#cc-workflow').val() };
    save();
}

function bindPanel($panel) {
    $panel.off('.cc')
        .on('click.cc', '.cc-close', () => $panel.remove())
        .on('click.cc', '#cc-save', () => { readPanel(); toastr?.success('已保存'); })
        .on('click.cc', '#cc-test', async () => {
            try { readPanel(); await testComfyConnection(); toastr?.success('ComfyUI 连接成功'); }
            catch (error) { toastr?.error(error.message); }
        })
        .on('click.cc', '#cc-refresh', async () => {
            try { readPanel(); await refreshComfyObjects(); toastr?.success('列表已刷新'); $panel.remove(); openPanel(); }
            catch (error) { toastr?.error(error.message); }
        })
        .on('change.cc', '#cc-profile', () => {
            const s = settings();
            s.currentProfile = $('#cc-profile').val();
            $('#cc-workflow').val(s.comfyuiProfiles[s.currentProfile]?.workflow || DEFAULT_WORKFLOW);
        })
        .on('click.cc', '#cc-saveProfile', () => { readPanel(); toastr?.success('预设已保存'); })
        .on('click.cc', '#cc-newProfile', () => {
            const name = prompt('新预设名称');
            if (!name) return;
            const s = settings();
            if (s.comfyuiProfiles[name]) return toastr?.warning('预设已存在');
            s.comfyuiProfiles[name] = { workflow: DEFAULT_WORKFLOW };
            s.currentProfile = name;
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-deleteProfile', () => {
            const s = settings();
            const names = Object.keys(s.comfyuiProfiles);
            if (names.length <= 1) return toastr?.warning('至少保留一个预设');
            const name = $('#cc-profile').val();
            if (!confirm(`删除预设「${name}」？`)) return;
            delete s.comfyuiProfiles[name];
            s.currentProfile = Object.keys(s.comfyuiProfiles)[0];
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-cancelAll', () => { queue.cancelAll(); toastr?.warning('已请求取消全部任务'); });
}

function addEntryButton() {
    const $root = $('#extensions_settings');
    if (!$root.length) return setTimeout(addEntryButton, 1200);
    if ($(`#${ENTRY_ID}`).length) return;
    const $entry = $(`<div id="${ENTRY_ID}" class="inline-drawer"><button class="menu_button" type="button"><i class="fa-solid fa-image"></i> ComfyUI 生图桥</button></div>`);
    $root.append($entry);
    $entry.on('click', 'button', openPanel);
}

function bindChatInteractions() {
    $(document).off('.stComfyImage')
        .on('click.stComfyImage', '.st-chatu8-comfy-image', function () {
            const src = $(this).attr('src');
            if (!src) return;
            const win = window.open('', '_blank');
            if (win) win.document.write(`<img src="${src}" style="max-width:100%;height:auto;display:block;margin:auto;">`);
        })
        .on('dblclick.stComfyImage', '.st-chatu8-comfy-image', function () {
            const prompt = $(this).attr('data-comfy-prompt');
            const $mes = $(this).closest('.mes');
            const messageId = Number($mes.attr('mes_id'));
            if (prompt && Number.isFinite(messageId)) queue.push({ messageId, prompt, overrides: {} });
        });
}

function bindEvents() {
    try {
        tavern.eventSource?.on?.(tavern.event_types?.MESSAGE_RECEIVED, id => processMessage(Number(id)));
        tavern.eventSource?.on?.(tavern.event_types?.MESSAGE_UPDATED, id => processMessage(Number(id)));
    } catch (error) {
        console.warn(`[${EXT_NAME}] event bind failed`, error);
    }
}

jQuery(() => {
    settings();
    bindEvents();
    bindChatInteractions();
    addEntryButton();
    log('loaded');
});
