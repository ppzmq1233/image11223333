import { extension_settings, saveSettingsDebounced } from '../../../extensions.js';
import * as tavern from '../../../../script.js';
import { getContext } from '../../../st-context.js';

const EXT_KEY = 'st-chatu8-comfy';
const EXT_NAME = 'st-chatu8-comfy';
const PANEL_ID = 'st-chatu8-comfy-settings-panel';
const ENTRY_ID = 'st-chatu8-comfy-entry';
const CHAT_BUTTON_ID = 'st-chatu8-comfy-chat-button';
const QUICK_MENU_ID = 'st-chatu8-comfy-quick-menu';

const DEFAULT_EDIT_WORKFLOW = JSON.stringify({
    "1": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": { "ckpt_name": "%model_name%" }
    },
    "2": {
        "class_type": "LoadImage",
        "inputs": { "image": "%edit_image%" }
    },
    "3": {
        "class_type": "VAEEncode",
        "inputs": { "pixels": ["2", 0], "vae": ["1", 2] }
    },
    "4": {
        "class_type": "CLIPTextEncode",
        "inputs": { "text": "%prompt%", "clip": ["1", 1] }
    },
    "5": {
        "class_type": "CLIPTextEncode",
        "inputs": { "text": "%negative_prompt%", "clip": ["1", 1] }
    },
    "6": {
        "class_type": "KSampler",
        "inputs": {
            "seed": "%seed%",
            "steps": "%steps%",
            "cfg": "%cfg_scale%",
            "sampler_name": "%sampler_name%",
            "scheduler": "%scheduler%",
            "denoise": "%denoise%",
            "model": ["1", 0],
            "positive": ["4", 0],
            "negative": ["5", 0],
            "latent_image": ["3", 0]
        }
    },
    "7": {
        "class_type": "VAEDecode",
        "inputs": { "samples": ["6", 0], "vae": ["1", 2] }
    },
    "8": {
        "class_type": "SaveImage",
        "inputs": { "images": ["7", 0], "filename_prefix": "st-comfy-edit" }
    }
}, null, 2);

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
        fixedPromptPrefix: '',
        fixedPromptSuffix: '',
        qualityPositive: 'best quality, amazing quality, very aesthetic, absurdres',
        qualityNegative: 'bad proportions, out of focus, username, text, bad anatomy, lowres, worst quality, watermark, cropped, deformed, extra limbs, missing fingers, blurry, low quality',
        enableQualityPositive: true,
        enableQualityNegative: true,
        promptProfiles: {
            '默认': {
                fixedPromptPrefix: '',
                fixedPromptSuffix: '',
                negativePrompt: '',
                qualityPositive: 'best quality, amazing quality, very aesthetic, absurdres',
                qualityNegative: 'bad proportions, out of focus, username, text, bad anatomy, lowres, worst quality, watermark, cropped, deformed, extra limbs, missing fingers, blurry, low quality'
            }
        },
        currentPromptProfile: '默认',
        promptReplaceProfiles: { '默认': { rules: '' } },
        currentPromptReplaceProfile: '默认',
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
        showImageActions: true,
        compressToJpeg: false,
        jpegQuality: 0.9,
        debugMode: false,
        models: [],
        samplers: [],
        schedulers: [],
        vaes: [],
        clips: [],
        loras: [],
        selectedLoras: [],
        uploadedImages: [],
        customPlaceholders: {},
        comfyuiProfiles: { '默认': { workflow: DEFAULT_WORKFLOW } },
        currentProfile: '默认',
        editProfiles: { '默认修图': { workflow: DEFAULT_EDIT_WORKFLOW } },
        currentEditProfile: '默认修图',
        editImageSlot: 'ref',
        editMaskSlot: 'mask',
        denoise: 0.75,
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
    if (!s.editProfiles || typeof s.editProfiles !== 'object') s.editProfiles = { '默认修图': { workflow: DEFAULT_EDIT_WORKFLOW } };
    if (!s.currentEditProfile || !s.editProfiles[s.currentEditProfile]) s.currentEditProfile = Object.keys(s.editProfiles)[0] || '默认修图';
    if (!s.editProfiles[s.currentEditProfile]) s.editProfiles[s.currentEditProfile] = { workflow: DEFAULT_EDIT_WORKFLOW };
    if (!s.promptProfiles || typeof s.promptProfiles !== 'object') s.promptProfiles = defaultSettings().promptProfiles;
    if (!s.currentPromptProfile || !s.promptProfiles[s.currentPromptProfile]) s.currentPromptProfile = Object.keys(s.promptProfiles)[0] || '默认';
    if (!s.promptReplaceProfiles || typeof s.promptReplaceProfiles !== 'object') s.promptReplaceProfiles = { '默认': { rules: '' } };
    if (!s.currentPromptReplaceProfile || !s.promptReplaceProfiles[s.currentPromptReplaceProfile]) s.currentPromptReplaceProfile = Object.keys(s.promptReplaceProfiles)[0] || '默认';
    if (!Array.isArray(s.selectedLoras)) s.selectedLoras = [];
    if (!Array.isArray(s.uploadedImages)) s.uploadedImages = [];
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

function dataUrlToJpeg(dataUrl, quality = 0.9) {
    return new Promise((resolve) => {
        if (!settings().compressToJpeg || !String(dataUrl).startsWith('data:image/')) return resolve(dataUrl);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', Math.max(0.1, Math.min(1, Number(quality) || 0.9))));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function downloadDataUrl(dataUrl, filename = 'comfyui-image.png') {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toastr?.success('已复制'); }
    catch (_) { prompt('复制文本', text); }
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

function applyPromptReplaceRules(prompt) {
    const s = settings();
    const profile = s.promptReplaceProfiles[s.currentPromptReplaceProfile] || { rules: '' };
    const lines = String(profile.rules || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    let result = String(prompt || '');
    for (const line of lines) {
        if (line.startsWith('#')) continue;
        const parsed = parseReplaceRule(line);
        if (!parsed) continue;
        if (parsed.ifText && !result.includes(parsed.ifText)) continue;
        if (parsed.regex) {
            try {
                result = result.replace(new RegExp(parsed.find, parsed.flags || 'g'), parsed.replace);
            } catch (error) {
                console.warn(`[${EXT_NAME}] 替换规则正则错误`, line, error);
            }
        } else {
            result = result.split(parsed.find).join(parsed.replace);
        }
    }
    return result;
}

function parseReplaceRule(line) {
    let ifText = '';
    let body = line;
    const ifMatch = body.match(/^if\s+(.+?)\s*=>\s*(.+)$/i);
    if (ifMatch) {
        ifText = ifMatch[1].trim();
        body = ifMatch[2].trim();
    }
    if (body.startsWith('regex:')) {
        const m = body.match(/^regex:\s*\/(.*)\/([gimsuy]*)\s*=>\s*(.*)$/);
        if (!m) return null;
        return { regex: true, find: m[1], flags: m[2] || 'g', replace: m[3], ifText };
    }
    const parts = body.split('=>');
    if (parts.length < 2) return null;
    return { regex: false, find: parts[0].trim(), replace: parts.slice(1).join('=>').trim(), ifText };
}

function joinPromptParts(parts) {
    return parts.map(x => String(x || '').trim()).filter(Boolean).join(', ');
}

function buildFinalPrompt(rawPrompt) {
    const s = settings();
    const replaced = applyPromptReplaceRules(rawPrompt);
    return joinPromptParts([
        s.enableQualityPositive ? s.qualityPositive : '',
        s.fixedPromptPrefix,
        replaced,
        s.fixedPromptSuffix,
    ]);
}

function buildFinalNegativePrompt() {
    const s = settings();
    return joinPromptParts([
        s.enableQualityNegative ? s.qualityNegative : '',
        s.negativePrompt,
    ]);
}

function buildExtraContext() {
    const s = settings();
    const ctx = {};
    const selected = Array.isArray(s.selectedLoras) ? s.selectedLoras : [];
    ctx.lora_tags = selected.map(l => l.trigger || '').filter(Boolean).join(', ');
    ctx.lora_names = selected.map(l => l.name || '').filter(Boolean).join(',');
    ctx.lora_json = JSON.stringify(selected);
    selected.forEach((lora, index) => {
        const n = index + 1;
        ctx[`lora_${n}_name`] = lora.name || '';
        ctx[`lora_${n}_model_strength`] = lora.modelStrength ?? 1;
        ctx[`lora_${n}_clip_strength`] = lora.clipStrength ?? 1;
        ctx[`lora_${n}_trigger`] = lora.trigger || '';
    });
    const images = Array.isArray(s.uploadedImages) ? s.uploadedImages : [];
    ctx.images_json = JSON.stringify(images);
    images.forEach((img, index) => {
        const n = index + 1;
        ctx[`image_${n}`] = img.name || '';
        ctx[`image_${n}_filename`] = img.name || '';
        ctx[`image_${n}_subfolder`] = img.subfolder || '';
        ctx[`image_${n}_type`] = img.type || 'input';
        ctx[`image_${n}_json`] = JSON.stringify(img);
    });
    return ctx;
}

function findImageBySlot(slot) {
    const images = Array.isArray(settings().uploadedImages) ? settings().uploadedImages : [];
    return images.find(img => img.slot === slot) || images.find(img => img.name === slot) || null;
}

function buildContext(rawPrompt, overrides = {}) {
    const s = settings();
    const seed = Number(overrides.seed ?? s.seed);
    const finalPrompt = buildFinalPrompt(rawPrompt);
    const finalNegative = overrides.negativePrompt ?? buildFinalNegativePrompt();
    const editImage = overrides.editImage || findImageBySlot(overrides.editImageSlot || s.editImageSlot);
    const editMask = overrides.editMask || findImageBySlot(overrides.editMaskSlot || s.editMaskSlot);
    return {
        raw_prompt: rawPrompt,
        prompt: finalPrompt,
        negative_prompt: finalNegative,
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
        denoise: Number(overrides.denoise ?? s.denoise ?? 0.75),
        edit_image: editImage?.name || '',
        edit_image_filename: editImage?.name || '',
        edit_image_subfolder: editImage?.subfolder || '',
        edit_image_type: editImage?.type || 'input',
        edit_mask: editMask?.name || '',
        edit_mask_filename: editMask?.name || '',
        edit_mask_subfolder: editMask?.subfolder || '',
        edit_mask_type: editMask?.type || 'input',
        inpaint_positive: finalPrompt,
        inpaint_negative: finalNegative,
        profile: s.currentProfile,
        ...buildExtraContext(),
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
        if (node.class_type === 'LoraLoader' && node.inputs.lora_name !== undefined && ctx.lora_1_name) {
            node.inputs.lora_name = ctx.lora_1_name;
            if (node.inputs.strength_model !== undefined) node.inputs.strength_model = Number(ctx.lora_1_model_strength || 1);
            if (node.inputs.strength_clip !== undefined) node.inputs.strength_clip = Number(ctx.lora_1_clip_strength || 1);
        }
    });
    return workflow;
}

function prepareWorkflow(rawPrompt, overrides = {}) {
    const s = settings();
    const profile = overrides.mode === 'edit'
        ? (s.editProfiles[s.currentEditProfile] || { workflow: DEFAULT_EDIT_WORKFLOW })
        : (s.comfyuiProfiles[s.currentProfile] || { workflow: DEFAULT_WORKFLOW });
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

async function uploadImageToComfy(file, slotName = '') {
    const base = normalizeUrl(settings().comfyuiUrl);
    if (!base) throw new Error('ComfyUI 地址为空');
    const form = new FormData();
    form.append('image', file, file.name);
    form.append('overwrite', 'true');
    const response = await fetch(`${base}/upload/image`, { method: 'POST', body: form });
    if (!response.ok) throw new Error(`上传失败 ${response.status}: ${await response.text()}`);
    const json = await response.json();
    return {
        slot: slotName || file.name,
        name: json.name || file.name,
        subfolder: json.subfolder || '',
        type: json.type || 'input',
        originalName: file.name,
    };
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
    const finalDataUrl = await dataUrlToJpeg(dataUrl, settings().jpegQuality);
    const escaped = String(prompt || '').replace(/"/g, '&quot;');
    const actions = settings().showImageActions ? `<div class="st-chatu8-comfy-actions">
        <button data-cc-action="preview">预览</button>
        <button data-cc-action="redo">重做</button>
        <button data-cc-action="edit">修图</button>
        <button data-cc-action="copy">复制提示词</button>
        <button data-cc-action="download">下载</button>
    </div>` : '';
    const html = `\n\n<div class="st-chatu8-comfy-result" data-comfy-prompt="${escaped}"><img class="st-chatu8-comfy-image" src="${finalDataUrl}" alt="${escaped}" data-comfy-prompt="${escaped}" />${actions}</div>\n\n`;
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

function renderLoraChips(list = []) {
    return (Array.isArray(list) ? list : []).map((lora, index) => `<span class="cc-chip" data-lora-index="${index}">${escapeHtml(lora.name)} <small>m:${escapeHtml(lora.modelStrength ?? 1)} c:${escapeHtml(lora.clipStrength ?? 1)}</small>${lora.trigger ? ` <em>${escapeHtml(lora.trigger)}</em>` : ''}<button data-remove-lora="${index}">×</button></span>`).join('') || '<span class="cc-empty">未选择 LORA</span>';
}

function renderImageChips(list = []) {
    return (Array.isArray(list) ? list : []).map((img, index) => `<span class="cc-chip" data-image-index="${index}">${escapeHtml(img.slot || img.name)} <small>${escapeHtml(img.name)}</small><button data-remove-image="${index}">×</button></span>`).join('') || '<span class="cc-empty">未上传图片</span>';
}

function openPanel() {
    $(`#${PANEL_ID}`).remove();
    const s = settings();
    const $panel = $(`
<div id="${PANEL_ID}" class="st-chatu8-comfy-panel">
  <div class="cc-header"><h2>ComfyUI 生图桥 <small>v0.6.1</small></h2><span class="cc-close">&times;</span></div>
  <div class="cc-body">
    <section><h3>主要设置</h3>
      <label class="cc-check"><input id="cc-scriptEnabled" type="checkbox" ${s.scriptEnabled ? 'checked' : ''}> 启用插件</label>
      <div class="cc-grid two"><label>开始标记<input id="cc-startTag" class="cc-input" value="${escapeHtml(s.startTag)}"></label><label>结束标记<input id="cc-endTag" class="cc-input" value="${escapeHtml(s.endTag)}"></label></div>
      <div class="cc-grid two"><label>批量分隔符<input id="cc-batchDelimiter" class="cc-input" value="${escapeHtml(String(s.batchDelimiter).replace(/\n/g, '\\n'))}"></label><label>并发数<input id="cc-maxConcurrent" type="number" min="1" max="8" class="cc-input" value="${escapeHtml(s.maxConcurrent)}"></label></div>
      <label class="cc-check"><input id="cc-allowBatch" type="checkbox" ${s.allowBatch ? 'checked' : ''}> 一个标记内允许批量提示词</label>
      <label class="cc-check"><input id="cc-showImageActions" type="checkbox" ${s.showImageActions ? 'checked' : ''}> 在生成图下方显示操作按钮</label>
      <label class="cc-check"><input id="cc-compressToJpeg" type="checkbox" ${s.compressToJpeg ? 'checked' : ''}> 图片插入楼层前压缩为 JPEG</label>
      <label>JPEG 质量<input id="cc-jpegQuality" class="cc-input" type="number" step="0.05" min="0.1" max="1" value="${escapeHtml(s.jpegQuality)}"></label>
    </section>
    <section><h3>连接与模型</h3>
      <div class="cc-row"><input id="cc-comfyuiUrl" class="cc-input" value="${escapeHtml(s.comfyuiUrl)}"><button id="cc-test" class="cc-btn">测试连接</button><button id="cc-refresh" class="cc-btn">刷新列表</button></div>
      <div class="cc-grid two"><label>模型<select id="cc-modelName" class="cc-select">${optionList(s.models, s.modelName)}</select></label><label>采样器<select id="cc-samplerName" class="cc-select">${optionList(s.samplers, s.samplerName)}</select></label></div>
      <div class="cc-grid two"><label>调度器<select id="cc-scheduler" class="cc-select">${optionList(s.schedulers, s.scheduler)}</select></label><label>VAE<select id="cc-vaeName" class="cc-select">${optionList(s.vaes, s.vaeName)}</select></label></div>
      <label>CLIP<select id="cc-clipName" class="cc-select">${optionList(s.clips, s.clipName)}</select></label>
    </section>
    <section><h3>LORA 库</h3>
      <div class="cc-row"><select id="cc-loraSelect" class="cc-select">${optionList(s.loras, '')}</select><input id="cc-loraModelStrength" class="cc-input short" type="number" step="0.05" value="1" title="model strength"><input id="cc-loraClipStrength" class="cc-input short" type="number" step="0.05" value="1" title="clip strength"><input id="cc-loraTrigger" class="cc-input" placeholder="触发词，可空"><button id="cc-addLora" class="cc-btn">添加 LORA</button></div>
      <div id="cc-selectedLoras" class="cc-chipbox">${renderLoraChips(s.selectedLoras)}</div>
      <p class="cc-help">占位符：%lora_tags%、%lora_names%、%lora_json%、%lora_1_name%、%lora_1_model_strength%、%lora_1_clip_strength%、%lora_1_trigger%。自动补丁会填充第一个 LoraLoader；复数 LORA 推荐在工作流中预留多节点并使用 lora_2/lora_3 占位符。</p>
    </section>
    <section><h3>上传图片槽位</h3>
      <div class="cc-row"><input id="cc-imageSlot" class="cc-input" placeholder="槽位名，如 ref / pose / mask"><input id="cc-imageFile" type="file" accept="image/*" class="cc-input"><button id="cc-uploadImage" class="cc-btn">上传到 ComfyUI</button></div>
      <div id="cc-uploadedImages" class="cc-chipbox">${renderImageChips(s.uploadedImages)}</div>
      <p class="cc-help">占位符：%image_1%、%image_1_filename%、%image_1_subfolder%、%image_1_type%、%image_1_json%、%images_json%。上传结果可填入 LoadImage / IPA / inpaint 工作流节点。</p>
    </section>
    <section><h3>生成参数</h3>
      <div class="cc-grid three"><label>宽<input id="cc-width" type="number" class="cc-input" value="${escapeHtml(s.width)}"></label><label>高<input id="cc-height" type="number" class="cc-input" value="${escapeHtml(s.height)}"></label><label>步数<input id="cc-steps" type="number" class="cc-input" value="${escapeHtml(s.steps)}"></label></div>
      <div class="cc-grid three"><label>CFG<input id="cc-cfgScale" type="number" step="0.1" class="cc-input" value="${escapeHtml(s.cfgScale)}"></label><label>种子<input id="cc-seed" type="number" class="cc-input" value="${escapeHtml(s.seed)}"></label><label>轮询(ms)<input id="cc-pollIntervalMs" type="number" class="cc-input" value="${escapeHtml(s.pollIntervalMs)}"></label></div>
    </section>
    <section><h3>提示词增强</h3>
      <div class="cc-row"><select id="cc-promptProfile" class="cc-select">${Object.keys(s.promptProfiles).map(name => `<option value="${escapeHtml(name)}" ${name === s.currentPromptProfile ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select><button id="cc-savePromptProfile" class="cc-btn">保存提示词档</button><button id="cc-newPromptProfile" class="cc-btn">新建</button><button id="cc-deletePromptProfile" class="cc-btn danger">删除</button></div>
      <label>固定前置正面<textarea id="cc-fixedPromptPrefix" class="cc-textarea" rows="2">${escapeHtml(s.fixedPromptPrefix)}</textarea></label>
      <label>固定后置正面<textarea id="cc-fixedPromptSuffix" class="cc-textarea" rows="2">${escapeHtml(s.fixedPromptSuffix)}</textarea></label>
      <label>固定负面提示词<textarea id="cc-negativePrompt" class="cc-textarea" rows="3">${escapeHtml(s.negativePrompt)}</textarea></label>
      <label class="cc-check"><input id="cc-enableQualityPositive" type="checkbox" ${s.enableQualityPositive ? 'checked' : ''}> 启用正面质量预设</label>
      <textarea id="cc-qualityPositive" class="cc-textarea" rows="2">${escapeHtml(s.qualityPositive)}</textarea>
      <label class="cc-check"><input id="cc-enableQualityNegative" type="checkbox" ${s.enableQualityNegative ? 'checked' : ''}> 启用负面质量预设</label>
      <textarea id="cc-qualityNegative" class="cc-textarea" rows="2">${escapeHtml(s.qualityNegative)}</textarea>
      <div class="cc-row"><select id="cc-replaceProfile" class="cc-select">${Object.keys(s.promptReplaceProfiles).map(name => `<option value="${escapeHtml(name)}" ${name === s.currentPromptReplaceProfile ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select><button id="cc-saveReplaceProfile" class="cc-btn">保存替换</button><button id="cc-newReplaceProfile" class="cc-btn">新建</button><button id="cc-deleteReplaceProfile" class="cc-btn danger">删除</button></div>
      <label>替换规则<textarea id="cc-replaceRules" class="cc-textarea mono" rows="6">${escapeHtml(s.promptReplaceProfiles[s.currentPromptReplaceProfile]?.rules || '')}</textarea></label>
      <p class="cc-help">替换规则：每行一个，支持 <code>猫=>cat</code>、<code>regex:/女孩|少女/g=>girl</code>、<code>if 夜晚=>天空=>night sky</code>。# 开头为注释。</p>
      <p class="cc-help">最终正面 = 正面质量 + 固定前置 + 聊天提示词(替换后) + 固定后置；最终负面 = 负面质量 + 固定负面。</p>
    </section>
    <section><h3>工作流预设</h3>
      <div class="cc-row"><select id="cc-profile" class="cc-select">${Object.keys(s.comfyuiProfiles).map(name => `<option value="${escapeHtml(name)}" ${name === s.currentProfile ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select><button id="cc-saveProfile" class="cc-btn">保存预设</button><button id="cc-newProfile" class="cc-btn">新建</button><button id="cc-deleteProfile" class="cc-btn danger">删除</button></div>
      <textarea id="cc-workflow" class="cc-textarea mono" rows="14">${escapeHtml(s.comfyuiProfiles[s.currentProfile]?.workflow || DEFAULT_WORKFLOW)}</textarea>
      <label class="cc-check"><input id="cc-autoPatchWorkflow" type="checkbox" ${s.autoPatchWorkflow ? 'checked' : ''}> 自动补丁工作流常见节点参数</label>
      <p class="cc-help">占位符支持 %prompt% / {{prompt}}、%negative_prompt%、%raw_prompt%、%width%、%height%、%steps%、%cfg_scale%、%seed%、%sampler_name%、%scheduler%、%model_name%、%vae_name%、%clip_name%。</p>
    </section>
    <section><h3>修图 / inpaint 工作流</h3>
      <div class="cc-row"><select id="cc-editProfile" class="cc-select">${Object.keys(s.editProfiles).map(name => `<option value="${escapeHtml(name)}" ${name === s.currentEditProfile ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select><button id="cc-saveEditProfile" class="cc-btn">保存修图预设</button><button id="cc-newEditProfile" class="cc-btn">新建</button><button id="cc-deleteEditProfile" class="cc-btn danger">删除</button></div>
      <div class="cc-grid three"><label>原图槽位<input id="cc-editImageSlot" class="cc-input" value="${escapeHtml(s.editImageSlot)}"></label><label>遮罩槽位<input id="cc-editMaskSlot" class="cc-input" value="${escapeHtml(s.editMaskSlot)}"></label><label>去噪<input id="cc-denoise" class="cc-input" type="number" step="0.05" value="${escapeHtml(s.denoise)}"></label></div>
      <textarea id="cc-editWorkflow" class="cc-textarea mono" rows="12">${escapeHtml(s.editProfiles[s.currentEditProfile]?.workflow || DEFAULT_EDIT_WORKFLOW)}</textarea>
      <div class="cc-row"><input id="cc-editPrompt" class="cc-input" placeholder="修图提示词"><button id="cc-runEdit" class="cc-btn">用当前槽位修图</button></div>
      <p class="cc-help">修图占位符：%edit_image%、%edit_mask%、%denoise%、%inpaint_positive%、%inpaint_negative%。先在“上传图片槽位”上传原图/遮罩，再运行修图。</p>
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
    s.showImageActions = $('#cc-showImageActions').prop('checked');
    s.compressToJpeg = $('#cc-compressToJpeg').prop('checked');
    s.jpegQuality = Number($('#cc-jpegQuality').val()) || 0.9;
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
    s.fixedPromptPrefix = $('#cc-fixedPromptPrefix').val();
    s.fixedPromptSuffix = $('#cc-fixedPromptSuffix').val();
    s.negativePrompt = $('#cc-negativePrompt').val();
    s.qualityPositive = $('#cc-qualityPositive').val();
    s.qualityNegative = $('#cc-qualityNegative').val();
    s.enableQualityPositive = $('#cc-enableQualityPositive').prop('checked');
    s.enableQualityNegative = $('#cc-enableQualityNegative').prop('checked');
    s.currentPromptProfile = $('#cc-promptProfile').val();
    s.promptProfiles[s.currentPromptProfile] = {
        fixedPromptPrefix: s.fixedPromptPrefix,
        fixedPromptSuffix: s.fixedPromptSuffix,
        negativePrompt: s.negativePrompt,
        qualityPositive: s.qualityPositive,
        qualityNegative: s.qualityNegative,
    };
    s.currentPromptReplaceProfile = $('#cc-replaceProfile').val();
    s.promptReplaceProfiles[s.currentPromptReplaceProfile] = { rules: $('#cc-replaceRules').val() };
    s.autoPatchWorkflow = $('#cc-autoPatchWorkflow').prop('checked');
    s.debugMode = $('#cc-debugMode').prop('checked');
    s.currentProfile = $('#cc-profile').val();
    s.comfyuiProfiles[s.currentProfile] = { workflow: $('#cc-workflow').val() };
    s.currentEditProfile = $('#cc-editProfile').val();
    s.editProfiles[s.currentEditProfile] = { workflow: $('#cc-editWorkflow').val() };
    s.editImageSlot = $('#cc-editImageSlot').val();
    s.editMaskSlot = $('#cc-editMaskSlot').val();
    s.denoise = Number($('#cc-denoise').val()) || 0.75;
    save();
}

function bindPanel($panel) {
    $panel.off('.cc')
        .on('click.cc', '.cc-close', () => $panel.remove())
        .on('click.cc', '#cc-save', () => { readPanel(); toastr?.success('已保存'); })
        .on('change.cc', '#cc-promptProfile', () => {
            const s = settings();
            s.currentPromptProfile = $('#cc-promptProfile').val();
            const p = s.promptProfiles[s.currentPromptProfile] || {};
            $('#cc-fixedPromptPrefix').val(p.fixedPromptPrefix || '');
            $('#cc-fixedPromptSuffix').val(p.fixedPromptSuffix || '');
            $('#cc-negativePrompt').val(p.negativePrompt || '');
            $('#cc-qualityPositive').val(p.qualityPositive || s.qualityPositive || '');
            $('#cc-qualityNegative').val(p.qualityNegative || s.qualityNegative || '');
        })
        .on('click.cc', '#cc-savePromptProfile', () => { readPanel(); toastr?.success('提示词档已保存'); })
        .on('click.cc', '#cc-newPromptProfile', () => {
            const name = prompt('新提示词档名称');
            if (!name) return;
            const s = settings();
            if (s.promptProfiles[name]) return toastr?.warning('提示词档已存在');
            readPanel();
            s.promptProfiles[name] = {
                fixedPromptPrefix: s.fixedPromptPrefix,
                fixedPromptSuffix: s.fixedPromptSuffix,
                negativePrompt: s.negativePrompt,
                qualityPositive: s.qualityPositive,
                qualityNegative: s.qualityNegative,
            };
            s.currentPromptProfile = name;
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-deletePromptProfile', () => {
            const s = settings();
            if (Object.keys(s.promptProfiles).length <= 1) return toastr?.warning('至少保留一个提示词档');
            const name = $('#cc-promptProfile').val();
            if (!confirm(`删除提示词档「${name}」？`)) return;
            delete s.promptProfiles[name];
            s.currentPromptProfile = Object.keys(s.promptProfiles)[0];
            save();
            $panel.remove(); openPanel();
        })
        .on('change.cc', '#cc-replaceProfile', () => {
            const s = settings();
            s.currentPromptReplaceProfile = $('#cc-replaceProfile').val();
            $('#cc-replaceRules').val(s.promptReplaceProfiles[s.currentPromptReplaceProfile]?.rules || '');
        })
        .on('click.cc', '#cc-saveReplaceProfile', () => { readPanel(); toastr?.success('替换规则已保存'); })
        .on('click.cc', '#cc-newReplaceProfile', () => {
            const name = prompt('新替换规则名称');
            if (!name) return;
            const s = settings();
            if (s.promptReplaceProfiles[name]) return toastr?.warning('替换规则已存在');
            s.promptReplaceProfiles[name] = { rules: $('#cc-replaceRules').val() || '' };
            s.currentPromptReplaceProfile = name;
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-deleteReplaceProfile', () => {
            const s = settings();
            if (Object.keys(s.promptReplaceProfiles).length <= 1) return toastr?.warning('至少保留一个替换规则');
            const name = $('#cc-replaceProfile').val();
            if (!confirm(`删除替换规则「${name}」？`)) return;
            delete s.promptReplaceProfiles[name];
            s.currentPromptReplaceProfile = Object.keys(s.promptReplaceProfiles)[0];
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-test', async () => {
            try { readPanel(); await testComfyConnection(); toastr?.success('ComfyUI 连接成功'); }
            catch (error) { toastr?.error(error.message); }
        })
        .on('click.cc', '#cc-addLora', () => {
            const s = settings();
            const name = $('#cc-loraSelect').val();
            if (!name) return toastr?.warning('没有可添加的 LORA，请先刷新列表');
            s.selectedLoras.push({
                name,
                modelStrength: Number($('#cc-loraModelStrength').val()) || 1,
                clipStrength: Number($('#cc-loraClipStrength').val()) || 1,
                trigger: $('#cc-loraTrigger').val() || '',
            });
            save();
            $('#cc-selectedLoras').html(renderLoraChips(s.selectedLoras));
        })
        .on('click.cc', '[data-remove-lora]', function () {
            const s = settings();
            const index = Number($(this).attr('data-remove-lora'));
            s.selectedLoras.splice(index, 1);
            save();
            $('#cc-selectedLoras').html(renderLoraChips(s.selectedLoras));
        })
        .on('click.cc', '#cc-uploadImage', async () => {
            try {
                readPanel();
                const file = $('#cc-imageFile')[0]?.files?.[0];
                if (!file) return toastr?.warning('请选择图片文件');
                const slot = $('#cc-imageSlot').val();
                const result = await uploadImageToComfy(file, slot);
                settings().uploadedImages.push(result);
                save();
                $('#cc-uploadedImages').html(renderImageChips(settings().uploadedImages));
                toastr?.success('图片已上传到 ComfyUI');
            } catch (error) { toastr?.error(error.message); }
        })
        .on('click.cc', '[data-remove-image]', function () {
            const s = settings();
            const index = Number($(this).attr('data-remove-image'));
            s.uploadedImages.splice(index, 1);
            save();
            $('#cc-uploadedImages').html(renderImageChips(s.uploadedImages));
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
        .on('change.cc', '#cc-editProfile', () => {
            const s = settings();
            s.currentEditProfile = $('#cc-editProfile').val();
            $('#cc-editWorkflow').val(s.editProfiles[s.currentEditProfile]?.workflow || DEFAULT_EDIT_WORKFLOW);
        })
        .on('click.cc', '#cc-saveEditProfile', () => { readPanel(); toastr?.success('修图预设已保存'); })
        .on('click.cc', '#cc-newEditProfile', () => {
            const name = prompt('新修图预设名称');
            if (!name) return;
            const s = settings();
            if (s.editProfiles[name]) return toastr?.warning('修图预设已存在');
            s.editProfiles[name] = { workflow: DEFAULT_EDIT_WORKFLOW };
            s.currentEditProfile = name;
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-deleteEditProfile', () => {
            const s = settings();
            if (Object.keys(s.editProfiles).length <= 1) return toastr?.warning('至少保留一个修图预设');
            const name = $('#cc-editProfile').val();
            if (!confirm(`删除修图预设「${name}」？`)) return;
            delete s.editProfiles[name];
            s.currentEditProfile = Object.keys(s.editProfiles)[0];
            save();
            $panel.remove(); openPanel();
        })
        .on('click.cc', '#cc-runEdit', () => {
            readPanel();
            const prompt = $('#cc-editPrompt').val() || 'inpaint, best quality';
            const messageId = getLastMessageIdSafe();
            queue.push({ messageId, prompt, overrides: { mode: 'edit' } });
            toastr?.info('修图任务已加入队列');
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

function getPromptTextareaValue() {
    const selectors = ['#send_textarea', '#send_textarea textarea', 'textarea[name="send_textarea"]', '#send_form textarea', '#send_form [contenteditable="true"]'];
    for (const selector of selectors) {
        const $el = $(selector).first();
        if (!$el.length) continue;
        if ($el.is('[contenteditable="true"]')) return ($el.text() || '').trim();
        return ($el.val() || '').trim();
    }
    return '';
}

function addChatQuickButton() {
    if ($(`#${CHAT_BUTTON_ID}`).length) return;
    const $button = $(`<button id="${CHAT_BUTTON_ID}" class="menu_button st-chatu8-comfy-chat-button" type="button" title="ComfyUI 生图桥：左键打开，Shift+左键用输入框生图，右键快速菜单"><i class="fa-solid fa-image"></i></button>`);
    const anchors = ['#send_form .mes_button_bar', '#send_form .send_buttons', '#send_form', '#chat_footer', '#form_sheld'];
    let inserted = false;
    for (const selector of anchors) {
        const $anchor = $(selector).first();
        if ($anchor.length) {
            $anchor.append($button);
            inserted = true;
            break;
        }
    }
    if (!inserted) $('body').append($button.addClass('floating'));
    $button.on('click', event => {
        if (event.shiftKey) return quickGenerateFromInput('normal');
        openPanel();
    });
    $button.on('contextmenu', event => {
        event.preventDefault();
        openQuickMenu(event.clientX, event.clientY);
    });
}

function openQuickMenu(x, y) {
    $(`#${QUICK_MENU_ID}`).remove();
    const $menu = $(`<div id="${QUICK_MENU_ID}" class="st-chatu8-comfy-quick-menu">
        <button data-quick="panel">打开面板</button>
        <button data-quick="generate">输入框内容生图</button>
        <button data-quick="edit">输入框内容修图</button>
        <button data-quick="cancel">取消全部任务</button>
    </div>`);
    $('body').append($menu);
    $menu.css({ left: `${x}px`, top: `${y}px` });
    $menu.on('click', '[data-quick]', function () {
        const action = $(this).attr('data-quick');
        if (action === 'panel') openPanel();
        if (action === 'generate') quickGenerateFromInput('normal');
        if (action === 'edit') quickGenerateFromInput('edit');
        if (action === 'cancel') queue.cancelAll();
        $menu.remove();
    });
    setTimeout(() => $(document).one('click', () => $menu.remove()), 0);
}

function quickGenerateFromInput(mode = 'normal') {
    const prompt = getPromptTextareaValue();
    if (!prompt) return toastr?.warning('输入框为空');
    queue.push({ messageId: getLastMessageIdSafe(), prompt, overrides: mode === 'edit' ? { mode: 'edit' } : {} });
    toastr?.info(mode === 'edit' ? '已加入修图任务' : '已加入生图任务');
}

function getLastMessageIdSafe() {
    try {
        const context = getContext();
        if (Array.isArray(context.chat) && context.chat.length) return context.chat.length - 1;
    } catch (_) {}
    const $last = $('#chat .mes').last();
    const id = Number($last.attr('mes_id'));
    return Number.isFinite(id) ? id : 0;
}

function getPromptFromResult($el) {
    return $el.closest('.st-chatu8-comfy-result').attr('data-comfy-prompt') || $el.attr('data-comfy-prompt') || '';
}

function getMessageIdFromElement($el) {
    const id = Number($el.closest('.mes').attr('mes_id'));
    return Number.isFinite(id) ? id : getLastMessageIdSafe();
}

function openPreview(dataUrl) {
    const win = window.open('', '_blank');
    if (win) win.document.write(`<img src="${dataUrl}" style="max-width:100%;height:auto;display:block;margin:auto;">`);
}

async function rerunFromElement($el, mode = 'normal') {
    const prompt = getPromptFromResult($el);
    const messageId = getMessageIdFromElement($el);
    if (!prompt) return toastr?.warning('没有找到原提示词');
    queue.push({ messageId, prompt, overrides: mode === 'edit' ? { mode: 'edit' } : {} });
}

function bindChatInteractions() {
    let longPressTimer = null;
    $(document).off('.stComfyImage')
        .on('click.stComfyImage', '.st-chatu8-comfy-image', function () {
            const src = $(this).attr('src');
            if (src) openPreview(src);
        })
        .on('dblclick.stComfyImage', '.st-chatu8-comfy-image', function () {
            rerunFromElement($(this), 'normal');
        })
        .on('contextmenu.stComfyImage', '.st-chatu8-comfy-image', function (event) {
            event.preventDefault();
            const prompt = getPromptFromResult($(this));
            const next = window.prompt('修改提示词后重做', prompt);
            if (next === null) return;
            const messageId = getMessageIdFromElement($(this));
            queue.push({ messageId, prompt: next, overrides: {} });
        })
        .on('touchstart.stComfyImage mousedown.stComfyImage', '.st-chatu8-comfy-image', function () {
            const $img = $(this);
            clearTimeout(longPressTimer);
            longPressTimer = setTimeout(() => {
                const prompt = getPromptFromResult($img);
                const next = window.prompt('修改提示词后重做', prompt);
                if (next !== null) queue.push({ messageId: getMessageIdFromElement($img), prompt: next, overrides: {} });
            }, 700);
        })
        .on('touchend.stComfyImage mouseup.stComfyImage mouseleave.stComfyImage', '.st-chatu8-comfy-image', function () {
            clearTimeout(longPressTimer);
        })
        .on('click.stComfyImage', '[data-cc-action]', function (event) {
            event.preventDefault();
            const action = $(this).attr('data-cc-action');
            const $result = $(this).closest('.st-chatu8-comfy-result');
            const $img = $result.find('.st-chatu8-comfy-image').first();
            const src = $img.attr('src');
            const prompt = getPromptFromResult($result);
            if (action === 'preview' && src) openPreview(src);
            if (action === 'redo') rerunFromElement($result, 'normal');
            if (action === 'edit') rerunFromElement($result, 'edit');
            if (action === 'copy') copyText(prompt);
            if (action === 'download' && src) downloadDataUrl(src, 'comfyui-image.jpg');
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
    addChatQuickButton();
    setTimeout(addChatQuickButton, 1500);
    setTimeout(addChatQuickButton, 5000);
    log('loaded');
});
