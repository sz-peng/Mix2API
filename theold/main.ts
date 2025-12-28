/**
 * Universal LLM Proxy - Deno Deploy
 * 优化版本：支持多Token轮换、调试模式、OpenAI标准格式响应
 */

// === 环境变量配置 ===
const BASE_URL = Deno.env.get("BASE_URL") || "https://theoldllm.vercel.app";
const AUTH_TOKENS = (Deno.env.get("AUTH_TOKENS") || "on_tenant_token1,on_tenant_token2").split(",").map(t => t.trim()).filter(Boolean);
const AUTH_KEYS = (Deno.env.get("AUTH_KEYS") || "sk-default,sk-false").split(",").map(k => k.trim()).filter(Boolean);
const DEBUG = (Deno.env.get("DEBUG") || "true").toLowerCase() === "true";
const DEFAULT_CHAT_MODEL = "gpt-4o";

// === 调试日志函数 ===
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function debugError(...args: any[]) {
  if (DEBUG) {
    console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
  }
}

// === User-Agent 列表 ===
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

// === 模型定义 ===
const CHAT_MODELS = [
  // OpenAI GPT 系列
  { id: "gpt-5.2", name: "GPT-5.2", llmVersion: "gpt-5.2", provider: "OpenAI" },
  { id: "gpt-5.1", name: "GPT-5.1", llmVersion: "gpt-5.1", provider: "OpenAI" },
  { id: "gpt-5", name: "GPT-5", llmVersion: "gpt-5", provider: "OpenAI" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", llmVersion: "gpt-5-mini", provider: "OpenAI" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", llmVersion: "gpt-5-nano", provider: "OpenAI" },
  { id: "o4-mini", name: "O4 Mini", llmVersion: "o4-mini", provider: "OpenAI" },
  { id: "o3", name: "O3", llmVersion: "o3", provider: "OpenAI" },
  { id: "o3-mini", name: "O3 Mini", llmVersion: "o3-mini", provider: "OpenAI" },
  { id: "o1", name: "O1", llmVersion: "o1", provider: "OpenAI" },
  { id: "o1-preview", name: "O1 Preview", llmVersion: "o1-preview", provider: "OpenAI" },
  { id: "o1-mini", name: "O1 Mini", llmVersion: "o1-mini", provider: "OpenAI" },
  { id: "gpt-4.1", name: "GPT-4.1", llmVersion: "gpt-4.1", provider: "OpenAI" },
  { id: "gpt-4o", name: "GPT-4o", llmVersion: "gpt-4o", provider: "OpenAI" },
  { id: "gpt-4o-2024-08-06", name: "GPT-4o (2024-08-06)", llmVersion: "gpt-4o-2024-08-06", provider: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", llmVersion: "gpt-4o-mini", provider: "OpenAI" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", llmVersion: "gpt-4-turbo", provider: "OpenAI" },
  { id: "gpt-4-turbo-preview", name: "GPT-4 Turbo Preview", llmVersion: "gpt-4-turbo-preview", provider: "OpenAI" },
  { id: "gpt-4", name: "GPT-4", llmVersion: "gpt-4", provider: "OpenAI" },
  { id: "gpt-4-1106-preview", name: "GPT-4 1106 Preview", llmVersion: "gpt-4-1106-preview", provider: "OpenAI" },
  { id: "gpt-4-vision-preview", name: "GPT-4 Vision Preview", llmVersion: "gpt-4-vision-preview", provider: "OpenAI" },
  { id: "gpt-4-0613", name: "GPT-4 (0613)", llmVersion: "gpt-4-0613", provider: "OpenAI" },
  { id: "gpt-4-0314", name: "GPT-4 (0314)", llmVersion: "gpt-4-0314", provider: "OpenAI" },
  { id: "gpt-4-32k-0314", name: "GPT-4 32K (0314)", llmVersion: "gpt-4-32k-0314", provider: "OpenAI" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", llmVersion: "gpt-3.5-turbo", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-0125", name: "GPT-3.5 Turbo (0125)", llmVersion: "gpt-3.5-turbo-0125", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-1106", name: "GPT-3.5 Turbo (1106)", llmVersion: "gpt-3.5-turbo-1106", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-16k", name: "GPT-3.5 Turbo 16K", llmVersion: "gpt-3.5-turbo-16k", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-0613", name: "GPT-3.5 Turbo (0613)", llmVersion: "gpt-3.5-turbo-0613", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-16k-0613", name: "GPT-3.5 Turbo 16K (0613)", llmVersion: "gpt-3.5-turbo-16k-0613", provider: "OpenAI" },
  { id: "gpt-3.5-turbo-0301", name: "GPT-3.5 Turbo (0301)", llmVersion: "gpt-3.5-turbo-0301", provider: "OpenAI" },

  // Anthropic Claude 系列
  { id: "claude-opus-4.5", name: "Claude Opus 4.5", llmVersion: "claude-opus-4-5", provider: "Anthropic" },
  { id: "claude-opus-4.5-20251101", name: "Claude Opus 4.5 (20251101)", llmVersion: "claude-opus-4-5-20251101", provider: "Anthropic" },
  { id: "claude-opus-4.1", name: "Claude Opus 4.1", llmVersion: "claude-opus-4-1", provider: "Anthropic" },
  { id: "claude-opus-4.1-20250805", name: "Claude Opus 4.1 (20250805)", llmVersion: "claude-opus-4-1-20250805", provider: "Anthropic" },
  { id: "claude-opus-4", name: "Claude Opus 4", llmVersion: "claude-opus-4-20250514", provider: "Anthropic" },
  { id: "claude-4-opus", name: "Claude 4 Opus", llmVersion: "claude-4-opus-20250514", provider: "Anthropic" },
  { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", llmVersion: "claude-sonnet-4-5", provider: "Anthropic" },
  { id: "claude-sonnet-4.5-20250929", name: "Claude Sonnet 4.5 (20250929)", llmVersion: "claude-sonnet-4-5-20250929", provider: "Anthropic" },
  { id: "claude-sonnet-4", name: "Claude Sonnet 4", llmVersion: "claude-sonnet-4-20250514", provider: "Anthropic" },
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", llmVersion: "claude-4-sonnet-20250514", provider: "Anthropic" },
  { id: "claude-3.7-sonnet", name: "Claude 3.7 Sonnet", llmVersion: "claude-3-7-sonnet-latest", provider: "Anthropic" },
  { id: "claude-3.7-sonnet-20250219", name: "Claude 3.7 Sonnet (20250219)", llmVersion: "claude-3-7-sonnet-20250219", provider: "Anthropic" },
  { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet", llmVersion: "claude-3-5-sonnet-latest", provider: "Anthropic" },
  { id: "claude-3.5-sonnet-20241022", name: "Claude 3.5 Sonnet (20241022)", llmVersion: "claude-3-5-sonnet-20241022", provider: "Anthropic" },
  { id: "claude-3.5-sonnet-20240620", name: "Claude 3.5 Sonnet (20240620)", llmVersion: "claude-3-5-sonnet-20240620", provider: "Anthropic" },
  { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", llmVersion: "claude-haiku-4-5", provider: "Anthropic" },
  { id: "claude-haiku-4.5-20251001", name: "Claude Haiku 4.5 (20251001)", llmVersion: "claude-haiku-4-5-20251001", provider: "Anthropic" },
  { id: "claude-3.5-haiku", name: "Claude 3.5 Haiku", llmVersion: "claude-3-5-haiku-latest", provider: "Anthropic" },
  { id: "claude-3.5-haiku-20241022", name: "Claude 3.5 Haiku (20241022)", llmVersion: "claude-3-5-haiku-20241022", provider: "Anthropic" },
  { id: "claude-3-opus", name: "Claude 3 Opus", llmVersion: "claude-3-opus-latest", provider: "Anthropic" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus (20240229)", llmVersion: "claude-3-opus-20240229", provider: "Anthropic" },
  { id: "claude-3-haiku", name: "Claude 3 Haiku", llmVersion: "claude-3-haiku-20240307", provider: "Anthropic" },

  // DeepSeek 系列
  { id: "deepseek-prover-v2", name: "DeepSeek Prover V2", llmVersion: "deepseek-prover-v2", provider: "DeepSeek" },
  { id: "deepseek-r1", name: "DeepSeek R1", llmVersion: "deepseek-r1", provider: "DeepSeek" },
  { id: "deepseek-v3", name: "DeepSeek V3", llmVersion: "deepseek-v3", provider: "DeepSeek" },
  { id: "deepseek-v3.1", name: "DeepSeek V3.1", llmVersion: "deepseek-v3.1", provider: "DeepSeek" },
  { id: "deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale", llmVersion: "deepseek-v3.2-speciale", provider: "DeepSeek" },

  // Google Gemini 系列
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", llmVersion: "gemini-3-flash-preview", provider: "Google" },
  { id: "gemini-3-pro-preview", name: "Gemini 3 Pro Preview", llmVersion: "gemini-3-pro-preview", provider: "Google" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", llmVersion: "gemini-2.5-pro", provider: "Google" },
  { id: "gemini-2.0-flash-001", name: "Gemini 2.0 Flash", llmVersion: "gemini-2.0-flash-001", provider: "Google" },
  { id: "gemini-2.0-flash-lite-001", name: "Gemini 2.0 Flash Lite", llmVersion: "gemini-2.0-flash-lite-001", provider: "Google" },
  { id: "gemma-3n-e2b-it:free", name: "Gemma 3N E2B", llmVersion: "gemma-3n-e2b-it:free", provider: "Google" },

  // Mistral 系列
  { id: "devstral-medium", name: "Devstral Medium", llmVersion: "devstral-medium", provider: "Mistral" },
  { id: "devstral-2512:free", name: "Devstral 2512", llmVersion: "devstral-2512:free", provider: "Mistral" },
  { id: "magistral-medium-2506:thinking", name: "Magistral Medium Thinking", llmVersion: "magistral-medium-2506:thinking", provider: "Mistral" },
  { id: "mistral-large-2512", name: "Mistral Large 2512", llmVersion: "mistral-large-2512", provider: "Mistral" },
  { id: "mistral-medium-3.1", name: "Mistral Medium 3.1", llmVersion: "mistral-medium-3.1", provider: "Mistral" },
  { id: "mistral-nemo", name: "Mistral Nemo", llmVersion: "mistral-nemo", provider: "Mistral" },
  { id: "mistral-saba", name: "Mistral Saba", llmVersion: "mistral-saba", provider: "Mistral" },
  { id: "mistral-small-3.2-24b-instruct", name: "Mistral Small 3.2 24B", llmVersion: "mistral-small-3.2-24b-instruct", provider: "Mistral" },
  { id: "mixtral-8x7b-instruct", name: "Mixtral 8x7B Instruct", llmVersion: "mixtral-8x7b-instruct", provider: "Mistral" },
  { id: "mixtral-8x22b-instruct", name: "Mixtral 8x22B Instruct", llmVersion: "mixtral-8x22b-instruct", provider: "Mistral" },

  // Kimi / Moonshot 系列
  { id: "kimi-dev-72b", name: "Kimi Dev 72B", llmVersion: "kimi-dev-72b", provider: "Moonshot" },
  { id: "kimi-k2", name: "Kimi K2", llmVersion: "kimi-k2", provider: "Moonshot" },
  { id: "kimi-k2-0905", name: "Kimi K2 0905", llmVersion: "kimi-k2-0905", provider: "Moonshot" },
  { id: "kimi-k2:1t", name: "Kimi K2 1T", llmVersion: "kimi-k2:1t", provider: "Moonshot" },

  // Alibaba Qwen 系列
  { id: "qwen3-14b", name: "Qwen 3 14B", llmVersion: "qwen3-14b", provider: "Alibaba" },
  { id: "qwen3-32b", name: "Qwen 3 32B", llmVersion: "qwen3-32b", provider: "Alibaba" },
  { id: "qwen3-coder", name: "Qwen 3 Coder", llmVersion: "qwen3-coder", provider: "Alibaba" },
  { id: "qwen3-235b-a22b", name: "Qwen 3 235B", llmVersion: "qwen3-235b-a22b", provider: "Alibaba" },

  // xAI Grok 系列
  { id: "grok-3", name: "Grok 3", llmVersion: "grok-3", provider: "xAI" },
  { id: "grok-3-beta", name: "Grok 3 Beta", llmVersion: "grok-3-beta", provider: "xAI" },
  { id: "grok-3-mini", name: "Grok 3 Mini", llmVersion: "grok-3-mini", provider: "xAI" },
  { id: "grok-4", name: "Grok 4", llmVersion: "grok-4", provider: "xAI" },
  { id: "grok-4-fast", name: "Grok 4 Fast", llmVersion: "grok-4-fast", provider: "xAI" },
  { id: "grok-4.1-fast", name: "Grok 4.1 Fast", llmVersion: "grok-4.1-fast", provider: "xAI" },
  { id: "grok-code-fast-1", name: "Grok Code Fast", llmVersion: "grok-code-fast-1", provider: "xAI" },

  // GLM 系列
  { id: "glm-4-32b", name: "GLM-4 32B", llmVersion: "glm-4-32b", provider: "Zhipu" },
  { id: "glm-4.5", name: "GLM-4.5", llmVersion: "glm-4.5", provider: "Zhipu" },
  { id: "glm-4.5-air", name: "GLM-4.5 Air", llmVersion: "glm-4.5-air", provider: "Zhipu" },
  { id: "glm-4.5v", name: "GLM-4.5v", llmVersion: "glm-4.5v", provider: "Zhipu" },
  { id: "glm-4.6", name: "GLM-4.6", llmVersion: "glm-4.6", provider: "Zhipu" },
  { id: "glm-4.7", name: "GLM-4.7", llmVersion: "glm-4.7", provider: "Zhipu" },

  // MiniMax 系列
  { id: "minimax-01", name: "Minimax 01", llmVersion: "minimax-01", provider: "MiniMax" },
  { id: "minimax-m1", name: "Minimax M1", llmVersion: "minimax-m1", provider: "MiniMax" },
  { id: "minimax-m2", name: "Minimax M2", llmVersion: "minimax-m2", provider: "MiniMax" },
  { id: "minimax-m2.1", name: "Minimax M2.1", llmVersion: "minimax-m2.1", provider: "MiniMax" },

  // Meta Llama 系列
  { id: "llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct", llmVersion: "llama-3.1-8b-instruct", provider: "Meta" },
  { id: "llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", llmVersion: "llama-3.3-70b-instruct", provider: "Meta" },

  // 其他
  { id: "kat-coder-pro", name: "KAT Coder Pro", llmVersion: "kat-coder-pro", provider: "Other" },
];

const IMAGE_MODELS = [
  { id: "sd-3.5-large", name: "SD 3.5 Large", provider: "Stability" },
  { id: "flux-dev", name: "Flux Dev", provider: "BFL" },
];

const ALL_MODELS = [...CHAT_MODELS, ...IMAGE_MODELS];

// === 辅助函数 ===

/**
 * 随机选择数组中的一个元素
 */
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机 UUID
 */
function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 获取当前时间戳（秒）
 */
function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * 解析并验证授权Token
 * 返回用于转发请求的实际Token
 */
function resolveAuthToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    debugLog("No valid Authorization header provided");
    return null;
  }

  const tokenPart = authHeader.slice(7).trim(); // 移除 "Bearer " 前缀
  const userTokens = tokenPart.split(",").map(t => t.trim()).filter(Boolean);

  debugLog(`User provided ${userTokens.length} token(s)`);

  // 如果用户只传入一个token且该token在AUTH_KEYS中
  if (userTokens.length === 1 && AUTH_KEYS.includes(userTokens[0])) {
    const selectedToken = randomChoice(AUTH_TOKENS);
    debugLog(`User token is in AUTH_KEYS, using random AUTH_TOKEN`);
    return `Bearer ${selectedToken}`;
  }

  // 否则从用户传入的tokens中随机选择一个
  const selectedToken = randomChoice(userTokens);
  debugLog(`Using user-provided token`);
  
  // 确保token有正确的Bearer前缀
  if (selectedToken.startsWith("Bearer ")) {
    return selectedToken;
  }
  return `Bearer ${selectedToken}`;
}

/**
 * 获取伪装请求头
 */
function getCamouflagedHeaders(token: string): Record<string, string> {
  const ua = randomChoice(USER_AGENTS);
  const urlObj = new URL(BASE_URL);
  
  return {
    "Host": urlObj.host,
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "sec-ch-ua": '"Chromium";v="131", "Not/A)Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": ua,
    "Accept": "*/*",
    "Content-Type": "application/json",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "Referer": `${BASE_URL}/`,
    "Origin": BASE_URL,
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Authorization": token,
    "Priority": "u=1, i"
  };
}

/**
 * 将 OpenAI 格式的 messages 转换为 prompt 字符串
 */
function convertMessagesToPrompt(messages: any[]): string {
  if (!Array.isArray(messages)) return "";
  
  return messages.map(m => {
    const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
    let content = "";
    
    // 处理 content 可能是数组的情况（多模态）
    if (Array.isArray(m.content)) {
      content = m.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
    } else {
      content = m.content || "";
    }
    
    return `${role}: ${content}`;
  }).join("\n\n");
}

/**
 * 获取后端模型配置
 */
function getBackendModelConfig(requestedId: string): { version: string; provider: string } {
  const modelObj = CHAT_MODELS.find(m => m.id === requestedId);
  
  if (modelObj) {
    return {
      version: modelObj.llmVersion || modelObj.id,
      provider: modelObj.provider || inferProvider(modelObj.llmVersion || modelObj.id)
    };
  }
  
  // 如果找不到模型，尝试推断provider
  return {
    version: requestedId,
    provider: inferProvider(requestedId)
  };
}

/**
 * 根据模型名称推断 Provider
 */
function inferProvider(modelName: string): string {
  const nameLower = modelName.toLowerCase();
  
  if (nameLower.includes("claude")) return "Anthropic";
  if (nameLower.includes("gemini") || nameLower.includes("gemma")) return "Google";
  if (nameLower.includes("mistral") || nameLower.includes("mixtral") || nameLower.includes("magistral") || nameLower.includes("devstral")) return "Mistral";
  if (nameLower.includes("deepseek")) return "DeepSeek";
  if (nameLower.includes("grok")) return "xAI";
  if (nameLower.includes("llama")) return "Meta";
  if (nameLower.includes("minimax")) return "MiniMax";
  if (nameLower.includes("qwen")) return "Alibaba";
  if (nameLower.includes("kimi")) return "Moonshot";
  if (nameLower.includes("glm")) return "Zhipu";
  
  return "OpenAI"; // 默认
}

/**
 * 创建 OpenAI 标准格式的错误响应
 */
function createErrorResponse(message: string, status: number = 500): Response {
  return new Response(JSON.stringify({
    error: {
      message: message,
      type: "api_error",
      code: status
    }
  }), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

/**
 * 创建 CORS 响应头
 */
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400"
  };
}

// === 主服务逻辑 ===
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const method = req.method;
  const startTime = Date.now();

  debugLog(`${method} ${url.pathname}`);

  // 处理 CORS 预检请求
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders()
    });
  }

  // 验证授权
  const authHeader = req.headers.get("Authorization");
  const resolvedToken = resolveAuthToken(authHeader);
  
  if (!resolvedToken) {
    debugError("Authorization failed: No valid token");
    return createErrorResponse("Unauthorized: Invalid or missing API key", 401);
  }

  // === GET /v1/models - 获取模型列表 ===
  if (url.pathname === "/v1/models" && method === "GET") {
    debugLog("Handling GET /v1/models");
    
    const modelList = {
      object: "list",
      data: ALL_MODELS.map(m => ({
        id: m.id,
        object: "model",
        created: getCurrentTimestamp(),
        owned_by: "theoldllm"
      }))
    };

    debugLog(`Returning ${modelList.data.length} models`);
    
    return new Response(JSON.stringify(modelList), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders()
      }
    });
  }

  // === POST /v1/chat/completions - 聊天完成 ===
  if (url.pathname === "/v1/chat/completions" && method === "POST") {
    debugLog("Handling POST /v1/chat/completions");
    
    try {
      const body = await req.json();
      const userModel = body.model || DEFAULT_CHAT_MODEL;
      const isStream = body.stream === true;
      const messages = body.messages || [];

      debugLog(`Model: ${userModel}, Stream: ${isStream}, Messages: ${messages.length}`);

      const headers = getCamouflagedHeaders(resolvedToken);
      const { version: actualModelName, provider } = getBackendModelConfig(userModel);

      debugLog(`Backend model: ${actualModelName}, Provider: ${provider}`);

      // --- Step 1: 创建 Persona ---
      const randomSuffix = Math.floor(Math.random() * 9000) + 1000;
      const agentName = `${actualModelName} Agent v${randomSuffix}`;

      const personaPayload = {
        name: agentName,
        description: `Direct chat with ${provider}`,
        system_prompt: "You are a helpful assistant.",
        task_prompt: "",
        llm_model_provider_override: provider,
        llm_model_version_override: actualModelName,
        tool_ids: [],
        is_public: false,
        include_citations: false,
        num_chunks: 0,
        datetime_aware: false,
        llm_filter_extraction: false,
        llm_relevance_filter: false,
        document_set_ids: [],
        recency_bias: "no_decay"
      };

      debugLog("Creating persona...");
      const personaResp = await fetch(`${BASE_URL}/sv5/persona`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(personaPayload)
      });

      if (!personaResp.ok) {
        const errText = await personaResp.text();
        debugError(`Create Persona Failed: ${personaResp.status} - ${errText}`);
        throw new Error(`Create Persona Failed: ${personaResp.status}`);
      }

      const personaData = await personaResp.json();
      const personaId = personaData.id;
      debugLog(`Created Persona ID: ${personaId}`);

      // --- Step 2: 创建 Chat Session ---
      debugLog("Creating chat session...");
      const sessionResp = await fetch(`${BASE_URL}/sv5/chat/create-chat-session`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          persona_id: personaId,
          description: "Chat Session"
        })
      });

      if (!sessionResp.ok) {
        const errText = await sessionResp.text();
        debugError(`Create Session Failed: ${sessionResp.status} - ${errText}`);
        throw new Error(`Create Session Failed: ${sessionResp.status}`);
      }

      const sessionData = await sessionResp.json();
      const sessionId = sessionData.chat_session_id;
      debugLog(`Created Session ID: ${sessionId}`);

      // --- Step 3: 发送消息 ---
      const prompt = convertMessagesToPrompt(messages);
      debugLog(`Sending message (${prompt.length} chars)...`);

      const msgResp = await fetch(`${BASE_URL}/sv5/chat/send-message`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          chat_session_id: sessionId,
          parent_message_id: null,
          message: prompt,
          file_descriptors: [],
          search_doc_ids: [],
          retrieval_options: {}
        })
      });

      if (!msgResp.ok) {
        const errText = await msgResp.text();
        debugError(`Send Message Failed: ${msgResp.status} - ${errText}`);
        throw new Error(`Send Message Failed: ${msgResp.status}`);
      }

      const upstreamBody = msgResp.body;
      if (!upstreamBody) {
        throw new Error("No response body from upstream");
      }

      // --- Step 4: 处理响应 ---
      const completionId = `chatcmpl-${generateUUID()}`;
      const created = getCurrentTimestamp();

      if (isStream) {
        // 流式响应
        debugLog("Processing streaming response...");
        
        const transformStream = new TransformStream({
          async start(controller) {
            const encoder = new TextEncoder();
            
            // 发送首个开始块
            const startChunk = JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created: created,
              model: userModel,
              choices: [{
                index: 0,
                delta: {
                  role: "assistant",
                  content: ""
                },
                logprobs: null,
                finish_reason: null
              }]
            });
            controller.enqueue(encoder.encode(`data: ${startChunk}\n\n`));
          },
          
          async transform(chunk, controller) {
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            const text = decoder.decode(chunk, { stream: true });
            const lines = text.split("\n");

            for (const line of lines) {
              if (!line.trim()) continue;
              
              try {
                const json = JSON.parse(line);
                
                // 处理内容增量
                if (json?.obj?.type === "message_delta" && json.obj.content) {
                  const chunkData = JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created: created,
                    model: userModel,
                    choices: [{
                      index: 0,
                      delta: {
                        content: json.obj.content
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  });
                  controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
                }
                
                // 处理思考内容（如果有）
                if (json?.obj?.type === "reasoning_delta" && json.obj.content) {
                  const chunkData = JSON.stringify({
                    id: completionId,
                    object: "chat.completion.chunk",
                    created: created,
                    model: userModel,
                    choices: [{
                      index: 0,
                      delta: {
                        content: null,
                        reasoning_content: json.obj.content
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  });
                  controller.enqueue(encoder.encode(`data: ${chunkData}\n\n`));
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          },
          
          async flush(controller) {
            const encoder = new TextEncoder();
            
            // 发送结束块
            const endChunk = JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created: created,
              model: userModel,
              choices: [{
                index: 0,
                delta: {},
                logprobs: null,
                finish_reason: "stop"
              }]
            });
            controller.enqueue(encoder.encode(`data: ${endChunk}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            
            debugLog(`Streaming completed in ${Date.now() - startTime}ms`);
          }
        });

        const readable = upstreamBody.pipeThrough(transformStream);

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...getCorsHeaders()
          }
        });

      } else {
        // 非流式响应
        debugLog("Processing non-streaming response...");
        
        const reader = upstreamBody.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let reasoningContent = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const json = JSON.parse(line);
              
              if (json?.obj?.type === "message_delta" && json.obj.content) {
                fullContent += json.obj.content;
              }
              
              if (json?.obj?.type === "reasoning_delta" && json.obj.content) {
                reasoningContent += json.obj.content;
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }

        // 处理剩余buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json?.obj?.type === "message_delta" && json.obj.content) {
              fullContent += json.obj.content;
            }
            if (json?.obj?.type === "reasoning_delta" && json.obj.content) {
              reasoningContent += json.obj.content;
            }
          } catch (e) {
            // 忽略
          }
        }

        debugLog(`Non-streaming completed in ${Date.now() - startTime}ms, content length: ${fullContent.length}`);

        const responseBody: any = {
          id: completionId,
          object: "chat.completion",
          created: created,
          model: userModel,
          choices: [{
            index: 0,
            message: {
              role: "assistant",
              content: fullContent
            },
            logprobs: null,
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: Math.ceil(prompt.length / 4),
            completion_tokens: Math.ceil(fullContent.length / 4),
            total_tokens: Math.ceil((prompt.length + fullContent.length) / 4)
          }
        };

        // 如果有思考内容，添加到响应中
        if (reasoningContent) {
          responseBody.choices[0].message.reasoning_content = reasoningContent;
          responseBody.usage.completion_tokens_details = {
            reasoning_tokens: Math.ceil(reasoningContent.length / 4)
          };
        }

        return new Response(JSON.stringify(responseBody), {
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders()
          }
        });
      }

    } catch (e: any) {
      debugError(`Chat completion error: ${e.message}`);
      return createErrorResponse(e.message, 500);
    }
  }

  // === POST /v1/images/generations - 图像生成 ===
  if (url.pathname === "/v1/images/generations" && method === "POST") {
    debugLog("Handling POST /v1/images/generations");
    
    try {
      const body = await req.json();
      const headers = getCamouflagedHeaders(resolvedToken);
      const model = body.model || "sd-3.5-large";
      const prompt = body.prompt;
      const size = body.size || "1024x1024";
      const n = body.n || 1;

      if (!prompt) {
        return createErrorResponse("Missing required parameter: prompt", 400);
      }

      debugLog(`Image generation - Model: ${model}, Size: ${size}`);

      const imgPayload = {
        model: model,
        prompt: prompt,
        size: size,
        n: n,
        response_format: "url"
      };

      const resp = await fetch(`${BASE_URL}/api/v1/images/generations`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(imgPayload)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        debugError(`Image generation failed: ${resp.status} - ${errText}`);
        throw new Error(`Image generation failed: ${resp.status}`);
      }

      const data = await resp.json();
      debugLog(`Image generation completed in ${Date.now() - startTime}ms`);

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders()
        }
      });

    } catch (e: any) {
      debugError(`Image generation error: ${e.message}`);
      return createErrorResponse(e.message, 500);
    }
  }

  // === 根路径 - 返回API信息 ===
  if (url.pathname === "/" && method === "GET") {
    return new Response(JSON.stringify({
      name: "Universal LLM Proxy",
      version: "2.0.0",
      endpoints: {
        models: "GET /v1/models",
        chat: "POST /v1/chat/completions",
        images: "POST /v1/images/generations"
      },
      status: "running"
    }), {
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders()
      }
    });
  }

  // === 404 Not Found ===
  debugLog(`404 Not Found: ${url.pathname}`);
  return createErrorResponse("Not Found", 404);
});
