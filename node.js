const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, 'data.json');
const ENV_FILE = path.join(__dirname, '.env');

if (fs.existsSync(ENV_FILE)) {
    const envLines = fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/);
    envLines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) return;

        const key = trimmed.slice(0, separatorIndex).trim();
        const value = trimmed.slice(separatorIndex + 1).trim();

        if (key && !process.env[key]) {
            process.env[key] = value;
        }
    });
}

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || 'http://localhost:3001';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'ReefTracker';
const LLM_TIMEOUT_MS = 60000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const defaultData = {
    tanks: [],
    logs: []
};

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
}

const readData = () => {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch (error) {
        console.error('读取数据文件失败，回退为空数据。', error);
        return defaultData;
    }
};

const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const buildAdvicePrompt = ({ tankName, latestParams, latestNote, userPrompt }) => {
    const formattedParams = Object.entries(latestParams || {})
        .map(([key, item]) => {
            if (!item || item.value === null || item.value === undefined || item.value === '') {
                return `- ${key}: 未提供`;
            }

            return `- ${key}: ${item.value}（时间: ${item.date || '未知'}）`;
        })
        .join('\n');

    return [
        `海缸名称: ${tankName || '未命名海缸'}`,
        '当前最新参数:',
        formattedParams || '- 暂无参数',
        `最近备注: ${latestNote || '无'}`,
        `用户补充问题: ${userPrompt || '请基于当前参数给出优化建议。'}`,
        '',
        '请用中文给出简洁、实操型建议，输出包含以下部分：',
        '1. 总体判断',
        '2. 优先处理项',
        '3. 建议操作',
        '4. 需要继续观察的点',
        '避免夸大风险；如果数据不足，请明确指出。'
    ].join('\n');
};

const buildLLMHeaders = () => {
    if (!OPENAI_API_KEY) {
        const error = new Error('服务端未配置 OPENAI_API_KEY');
        error.status = 503;
        throw error;
    }

    const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
    };

    if (OPENAI_BASE_URL.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = OPENROUTER_SITE_URL;
        headers['X-OpenRouter-Title'] = OPENROUTER_APP_NAME;
    }

    return headers;
};

const createAdviceRequestBody = ({ tankName, latestParams, latestNote, userPrompt, stream = false }) => ({
    model: OPENAI_MODEL,
    temperature: 0.4,
    stream,
    messages: [
        {
            role: 'system',
            content: '你是专业海缸顾问，擅长根据水质参数和观察记录给出谨慎、清晰、可执行的维护建议。'
        },
        {
            role: 'user',
            content: buildAdvicePrompt({ tankName, latestParams, latestNote, userPrompt })
        }
    ]
});

const createTimeoutController = () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    return { controller, timeoutId };
};

const normalizeFetchError = (error) => {
    if (error?.name === 'AbortError') {
        const timeoutError = new Error('模型响应超时，请稍后再试。');
        timeoutError.status = 504;
        return timeoutError;
    }

    const causeCode = error?.cause?.code;
    if (causeCode === 'ECONNRESET' || causeCode === 'ENOTFOUND' || causeCode === 'ETIMEDOUT') {
        const networkError = new Error(`无法连接到模型服务 (${error?.cause?.host || '远端主机'})。请检查当前网络、DNS、代理，或稍后再试。`);
        networkError.status = 502;
        return networkError;
    }

    return error;
};

const requestAdviceFromLLM = async ({ tankName, latestParams, latestNote, userPrompt }) => {
    const headers = buildLLMHeaders();
    const { controller, timeoutId } = createTimeoutController();

    let response;
    try {
        response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify(createAdviceRequestBody({ tankName, latestParams, latestNote, userPrompt }))
        });
    } catch (error) {
        clearTimeout(timeoutId);
        throw normalizeFetchError(error);
    }

    clearTimeout(timeoutId);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const llmError = new Error(payload?.error?.message || 'LLM 请求失败');
        llmError.status = response.status;
        throw llmError;
    }

    return payload?.choices?.[0]?.message?.content || '模型没有返回建议内容。';
};

const streamAdviceFromLLM = async ({ req, res, tankName, latestParams, latestNote, userPrompt }) => {
    const headers = buildLLMHeaders();
    const { controller, timeoutId } = createTimeoutController();

    req.on('close', () => {
        controller.abort();
    });

    let upstream;
    try {
        upstream = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers,
            signal: controller.signal,
            body: JSON.stringify(createAdviceRequestBody({ tankName, latestParams, latestNote, userPrompt, stream: true }))
        });
    } catch (error) {
        clearTimeout(timeoutId);
        const normalized = normalizeFetchError(error);

        if (normalized.status === 504) {
            const fallbackAdvice = await requestAdviceFromLLM({ tankName, latestParams, latestNote, userPrompt });
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.write(fallbackAdvice);
            res.end();
            return;
        }

        throw normalized;
    }

    clearTimeout(timeoutId);

    if (!upstream.ok) {
        const payload = await upstream.json().catch(() => ({}));
        const llmError = new Error(payload?.error?.message || 'LLM 请求失败');
        llmError.status = upstream.status;
        throw llmError;
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of upstream.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split('\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith('data:')) continue;

            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;

            try {
                const parsed = JSON.parse(data);
                const token = parsed?.choices?.[0]?.delta?.content;
                if (token) {
                    res.write(token);
                }
            } catch {
                // Ignore malformed SSE fragments from upstream.
            }
        }
    }

    res.end();
};

app.get('/api/data', (req, res) => {
    try {
        res.json(readData());
    } catch {
        res.status(500).json({ error: '读取数据失败' });
    }
});

app.post('/api/data', (req, res) => {
    try {
        const incomingData = req.body;
        if (!incomingData?.tanks || !incomingData?.logs) {
            return res.status(400).json({ error: '数据格式不正确，缺少 tanks 或 logs 字段' });
        }

        writeData(incomingData);
        res.status(200).json({ message: '数据保存成功' });
    } catch {
        res.status(500).json({ error: '保存数据失败' });
    }
});

app.post('/api/advice', async (req, res) => {
    try {
        const { tankName, latestParams, latestNote, userPrompt } = req.body || {};
        const advice = await requestAdviceFromLLM({ tankName, latestParams, latestNote, userPrompt });
        res.json({ advice });
    } catch (error) {
        console.error('生成建议失败:', error);
        res.status(error.status || 500).json({
            error: error.message || '生成建议失败'
        });
    }
});

app.post('/api/advice/stream', async (req, res) => {
    try {
        const { tankName, latestParams, latestNote, userPrompt } = req.body || {};
        await streamAdviceFromLLM({ req, res, tankName, latestParams, latestNote, userPrompt });
    } catch (error) {
        console.error('流式生成建议失败:', error);
        if (!res.headersSent) {
            res.status(error.status || 500).json({
                error: error.message || '生成建议失败'
            });
        } else {
            res.end();
        }
    }
});

app.listen(PORT, () => {
    console.log(`ReefTracker API 已启动: http://localhost:${PORT}`);
    console.log(`数据文件位置: ${DATA_FILE}`);
    console.log(`建议模型: ${OPENAI_MODEL}`);
});
