const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Very permissive CORS - allows SillyTavern and any other client
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['*']
}));

app.use(express.json());
app.options('*', cors());

const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_API_KEY = process.env.NIM_API_KEY;

const MODEL_MAPPING = {
  'gpt-3.5-turbo': 'meta/llama-3.1-8b-instruct',
  'gpt-4': 'meta/llama-3.1-70b-instruct',
  'gpt-4-turbo': 'meta/llama-3.1-70b-instruct',
  'gpt-4o': 'deepseek-ai/deepseek-v4-flash',
  'claude-3-opus': 'meta/llama-3.1-70b-instruct',
  'claude-3-sonnet': 'meta/llama-3.1-8b-instruct',
};

const DEFAULT_MODEL = 'deepseek-ai/deepseek-v4-flash';

// Health check
app.get('/', (req, res) => res.json({ status: 'ok' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: Object.keys(MODEL_MAPPING).map(id => ({
      id,
      object: 'model',
      created: 1700000000,
      owned_by: 'proxy'
    }))
  });
});

// Main handler function reused by all endpoints
async function handleChat(req, res) {
  try {
    const body = req.body;
    const requestedModel = body.model || 'gpt-4o';
    const nimModel = MODEL_MAPPING[requestedModel] || DEFAULT_MODEL;

    const messages = body.messages || [{ role: 'user', content: body.prompt || '' }];

    const nimRequest = {
      model: nimModel,
      messages,
      temperature: body.temperature || 0.7,
      max_tokens: body.max_tokens || 2048,
      stream: false
    };

    const response = await axios.post(`${NIM_API_BASE}/chat/completions`, nimRequest, {
      headers: {
        'Authorization': `Bearer ${NIM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    const content = response.data.choices[0].message.content;

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop'
      }],
      usage: response.data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({
      error: { message: error.response?.data?.detail || error.message, type: 'proxy_error' }
    });
  }
}

// All possible endpoints Chub might call
app.post('/v1/chat/completions', handleChat);
app.post('/v1/chat', handleChat);
app.post('/chat/completions', handleChat);
app.post('/api/v1/chat/completions', handleChat);
app.post('/api/chat/completions', handleChat);

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
