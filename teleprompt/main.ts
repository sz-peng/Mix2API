// Deno Deploy Script for Teleprompt API Proxy
// 部署到 Deno Deploy 边缘网络

// ==================== 配置变量 ====================

// 环境变量
const AUTH_KEYS = (Deno.env.get("AUTH_KEYS") || "sk-default,sk-false").split(",").map(k => k.trim());
const DEBUG = (Deno.env.get("DEBUG") || "true") === "true";

// 项目元数据
const PROJECT_NAME = "teleprompt";
const PROJECT_VERSION = "1.0.0";

// 上游服务配置
const UPSTREAM_ORIGIN = "https://teleprompt-v2-backend-production.up.railway.app";

// 伪装配置
const EXTENSION_ORIGIN = "chrome-extension://alfpjlcndmeoainjfgbbnphcidpnmoae";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

// 模型定义与路径映射
const MODEL_MAP: Record<string, string> = {
  "gpt-4o": "/api/v1/prompt/optimize_reason_auth",   // 推理优化
  "gpt-4o-mini": "/api/v1/prompt/optimize_auth",         // 标准优化
  "gpt-4o-nano": "/api/v1/prompt/optimize_apps_auth"         // 应用/表格优化
};

const DEFAULT_MODEL = "gpt-4o";

// 伪流式生成的打字速度 (毫秒)
const STREAM_DELAY = 10;
const STREAM_CHUNK_SIZE = 2;

// ==================== 工具函数 ====================

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log(`[${new Date().toISOString()}]`, ...args);
  }
}

function logError(...args: unknown[]) {
  if (DEBUG) {
    console.error(`[${new Date().toISOString()}] [ERROR]`, ...args);
  }
}

function generateUUID(): string {
  return crypto.randomUUID();
}

// ==================== API 鉴权 ====================

function authenticateRequest(request: Request): { success: boolean; error?: string } {
  const authHeader = request.headers.get("Authorization");
  
  if (!authHeader) {
    return { success: false, error: "Missing Authorization header" };
  }
  
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return { success: false, error: "Invalid Authorization header format. Expected: Bearer <token>" };
  }
  
  const token = parts[1];
  if (!AUTH_KEYS.includes(token)) {
    return { success: false, error: "Invalid API key" };
  }
  
  return { success: true };
}

function createErrorResponse(message: string, status: number, code: string = "api_error"): Response {
  return new Response(JSON.stringify({
    error: {
      message,
      type: "api_error",
      code
    }
  }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== 模型列表处理 ====================

function handleModelsRequest(): Response {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const models = Object.keys(MODEL_MAP).map(modelId => ({
    id: modelId,
    object: "model",
    created: timestamp,
    owned_by: PROJECT_NAME
  }));
  
  return new Response(JSON.stringify({
    object: "list",
    data: models
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== 消息格式化 ====================

interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

function extractUserMessage(messages: Message[]): string | null {
  // 从后往前找最后一条用户消息
  const reversedMessages = [...messages].reverse();
  const lastUserMsg = reversedMessages.find(m => m.role === "user");
  
  if (!lastUserMsg) {
    return null;
  }
  
  if (typeof lastUserMsg.content === "string") {
    return lastUserMsg.content;
  } else if (Array.isArray(lastUserMsg.content)) {
    return lastUserMsg.content
      .filter(item => item.type === "text" && item.text)
      .map(item => item.text)
      .join(" ");
  }
  
  return null;
}

// ==================== 聊天请求处理 ====================

interface ChatRequest {
  model?: string;
  messages: Message[];
  stream?: boolean;
}

async function handleChatCompletions(request: Request): Promise<Response> {
  const requestId = `req-${generateUUID()}`;
  
  let requestBody: ChatRequest;
  
  try {
    requestBody = await request.json();
  } catch {
    return createErrorResponse("Invalid JSON in request body", 400, "invalid_request");
  }
  
  const { messages, stream = false } = requestBody;
  const model = requestBody.model || DEFAULT_MODEL;
  
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return createErrorResponse("Missing or invalid 'messages' field", 400, "invalid_request");
  }
  
  // 提取用户消息
  const prompt = extractUserMessage(messages);
  if (!prompt) {
    return createErrorResponse("未找到用户消息 (role: user)", 400, "invalid_request");
  }
  
  // 获取模型对应的端点
  const endpoint = MODEL_MAP[model] || MODEL_MAP[DEFAULT_MODEL];
  
  log(`Model: ${model}, Endpoint: ${endpoint}, Stream: ${stream}`);
  log("Prompt:", prompt.substring(0, 100) + "...");
  
  try {
    // 生成随机 UUID 作为 email，实现匿名无限使用
    const randomEmail = `${generateUUID()}@anonymous.user`;
    
    const upstreamPayload = {
      text: prompt
    };
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Origin": EXTENSION_ORIGIN,
      "User-Agent": DEFAULT_USER_AGENT,
      "email": randomEmail,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "none"
    };
    
    log("Sending request to upstream...");
    log("Email:", randomEmail);
    
    // 发送请求到上游
    const response = await fetch(`${UPSTREAM_ORIGIN}${endpoint}`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(upstreamPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logError("Upstream error:", response.status, errorText);
      throw new Error(`上游服务错误 (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data) {
      throw new Error(`上游返回业务错误: ${JSON.stringify(data)}`);
    }
    
    const resultText = data.data;
    log("Upstream response received, length:", resultText.length);
    
    // 处理响应 (流式或非流式)
    if (stream) {
      return handleStreamResponse(resultText, model, requestId);
    } else {
      return handleNormalResponse(resultText, model, requestId);
    }
    
  } catch (error) {
    logError("Error processing chat request:", error);
    return createErrorResponse(
      error instanceof Error ? error.message : "Unknown error",
      500,
      "generation_failed"
    );
  }
}

// ==================== 非流式响应 ====================

function handleNormalResponse(text: string, model: string, requestId: string): Response {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const response = {
    id: requestId,
    object: "chat.completion",
    created: timestamp,
    model: model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: text
      },
      logprobs: null,
      finish_reason: "stop"
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: text.length,
      total_tokens: text.length
    }
  };
  
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== 伪流式响应 ====================

function handleStreamResponse(text: string, model: string, requestId: string): Response {
  const timestamp = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 发送首个块：角色声明
        const firstChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            delta: {
              role: "assistant",
              content: ""
            },
            logprobs: null,
            finish_reason: null
          }]
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(firstChunk)}\n\n`));
        
        // 模拟打字机效果，逐字符发送
        for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
          const chunkContent = text.slice(i, i + STREAM_CHUNK_SIZE);
          const chunk = {
            id: requestId,
            object: "chat.completion.chunk",
            created: timestamp,
            model: model,
            choices: [{
              index: 0,
              delta: {
                content: chunkContent
              },
              logprobs: null,
              finish_reason: null
            }]
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          
          // 添加延迟模拟打字效果
          await new Promise(resolve => setTimeout(resolve, STREAM_DELAY));
        }
        
        // 发送结束块
        const endChunk = {
          id: requestId,
          object: "chat.completion.chunk",
          created: timestamp,
          model: model,
          choices: [{
            index: 0,
            delta: {},
            logprobs: null,
            finish_reason: "stop"
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: text.length,
            total_tokens: text.length
          }
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(endChunk)}\n\n`));
        
        // [DONE] 标志
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        
        controller.close();
      } catch (error) {
        logError("Stream error:", error);
        controller.error(error);
      }
    }
  });
  
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== CORS 预检处理 ====================

function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "86400",
    }
  });
}

// ==================== 主路由处理 ====================

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  log(`${method} ${path}`);
  
  // 处理 CORS 预检请求
  if (method === "OPTIONS") {
    return handleCORS();
  }
  
  // 根路径 - 返回服务信息
  if (path === "/" || path === "") {
    return new Response(JSON.stringify({
      service: PROJECT_NAME,
      version: PROJECT_VERSION,
      description: "Teleprompt Prompt Optimization API Proxy",
      endpoints: {
        models: "/v1/models",
        chat: "/v1/chat/completions"
      },
      availableModels: Object.keys(MODEL_MAP),
      modelDescriptions: {
        "gpt-4o": "推理优化 - 适合复杂推理任务",
        "gpt-4o-mini": "标准优化 - 通用提示词优化",
        "gpt-4o-nano": "应用优化 - 适合表格/应用场景"
      },
      debug: DEBUG
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
  
  // 健康检查
  if (path === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
  
  // API 路由 - 需要鉴权
  if (path === "/v1/models" && method === "GET") {
    const auth = authenticateRequest(request);
    if (!auth.success) {
      return createErrorResponse(auth.error!, 401, "unauthorized");
    }
    return handleModelsRequest();
  }
  
  if (path === "/v1/chat/completions" && method === "POST") {
    const auth = authenticateRequest(request);
    if (!auth.success) {
      return createErrorResponse(auth.error!, 401, "unauthorized");
    }
    return await handleChatCompletions(request);
  }
  
  // 404 - 路由不存在
  return createErrorResponse(`路径未找到: ${path}`, 404, "not_found");
}

// ==================== Deno Deploy 入口 ====================

Deno.serve({
  port: 8000,
  onListen({ port, hostname }) {
    console.log(`🚀 ${PROJECT_NAME} v${PROJECT_VERSION}`);
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Debug mode: ${DEBUG}`);
    console.log(`Configured API keys: ${AUTH_KEYS.length}`);
    console.log(`Available models: ${Object.keys(MODEL_MAP).join(", ")}`);
  }
}, handleRequest);
