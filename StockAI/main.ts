// Deno Deploy Script for StockAI API Proxy
// 部署到 Deno Deploy 边缘网络

// ==================== 配置变量 ====================

// 环境变量
const AUTH_KEYS = (Deno.env.get("AUTH_KEYS") || "sk-default,sk-false").split(",").map(k => k.trim());
const DEBUG = (Deno.env.get("DEBUG") || "true") === "true";

// 目标地址
const BASE_URL = "https://free.stockai.trade";

// User-Agent 列表
const USER_AGENTS = [
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
];

// 固定的 AI SDK User-Agent
const AI_SDK_UA = "ai-sdk/5.0.49 runtime/browser";

// 模型列表
const MODELS = [
  { name: "mistral-devstral-2", value: "mistral/devstral-2" },
  { name: "glm-4.6v-flash", value: "zai/glm-4.6v-flash" },
  { name: "News新闻模型", value: "stockai/news" },
  { name: "gpt-4o-mini", value: "arcee-ai/trinity-mini" },
  { name: "deepseek-v3", value: "deepcogito/cogito-v2.1-671b" },
  { name: "gemini-2.5-flash", value: "google/gemini-2.0-flash" },
  { name: "glm-4.5-air", value: "z-ai/glm-4.5-air" },
  { name: "glm-4.6", value: "z-ai/glm-4.6" },
  { name: "kimi-k2", value: "moonshotai/kimi-k2" },
  { name: "kimi-k2-thinking", value: "moonshotai/kimi-k2-thinking" },
  { name: "llama-4-scout", value: "meta/llama-4-scout" },
  { name: "longcat-flash-chat", value: "meituan/longcat-flash-chat" },
  { name: "longcat-flash-chat-search", value: "meituan/longcat-flash-chat-search" },
  { name: "gpt-oss-20b", value: "openai/gpt-oss-20b" },
  { name: "qwen3-coder", value: "qwen/qwen3-coder" },
  { name: "deepseek-r1", value: "alibaba/tongyi-deepresearch-30b-a3b" },
];

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

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function generateUUID(): string {
  return crypto.randomUUID();
}

function generateRandomId(length: number = 16): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

function createErrorResponse(status: number, message: string, type: string = "invalid_request_error"): Response {
  return new Response(JSON.stringify({
    error: {
      message,
      type,
      param: null,
      code: null
    }
  }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== 模型列表处理 ====================

function handleModelsRequest(): Response {
  const timestamp = Math.floor(Date.now() / 1000);
  
  const models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
  
  for (const model of MODELS) {
    models.push({
      id: model.name,
      object: "model",
      created: timestamp,
      owned_by: "stockai"
    });
  }
  
  return new Response(JSON.stringify({
    object: "list",
    data: models
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    }
  });
}

// ==================== 模型名称映射 ====================

function getModelValue(modelName: string): string | null {
  const model = MODELS.find(m => m.name === modelName);
  return model ? model.value : null;
}

function isSearchModel(modelValue: string): boolean {
  return modelValue.includes("-search");
}

// ==================== 消息格式化 ====================

interface Message {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

function formatMessagesToSingleText(messages: Message[]): string {
  return messages.map(msg => {
    let content: string;
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .filter(item => item.type === "text" && item.text)
        .map(item => item.text)
        .join(" ");
    } else {
      content = "";
    }
    return `${msg.role}: ${content}`;
  }).join("\n");
}

// ==================== SSE 解析器 ====================

interface SSEEvent {
  type: string;
  id?: string;
  delta?: string;
  data?: string;
  messageId?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  inputTextDelta?: string;
}

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith("data: ")) {
    return null;
  }
  
  const data = line.slice(6);
  if (data === "[DONE]") {
    return { type: "done" };
  }
  
  try {
    return JSON.parse(data) as SSEEvent;
  } catch {
    return null;
  }
}

// ==================== 工具调用格式化 ====================

function formatToolCall(toolName: string, input: unknown): string {
  let markdown = `\n\n---\n**🔧 工具调用: ${toolName}**\n\n`;
  
  if (input && typeof input === "object") {
    const inputObj = input as Record<string, unknown>;
    markdown += "**参数:**\n";
    for (const [key, value] of Object.entries(inputObj)) {
      markdown += `- \`${key}\`: ${JSON.stringify(value)}\n`;
    }
  }
  
  return markdown;
}

function formatToolOutput(toolName: string, output: unknown): string {
  let markdown = `\n**📋 ${toolName} 结果:**\n\n`;
  
  if (output && typeof output === "object") {
    const outputObj = output as { content?: Array<{ type: string; text?: string }>, isError?: boolean };
    
    if (outputObj.isError) {
      markdown += "⚠️ 工具执行出错\n";
    }
    
    if (outputObj.content && Array.isArray(outputObj.content)) {
      for (const item of outputObj.content) {
        if (item.type === "text" && item.text) {
          // 提取关键信息，格式化输出
          const text = item.text;
          // 尝试解析标题和URL
          const titleMatch = text.match(/Title: (.+?)(?:\n|$)/);
          const urlMatch = text.match(/URL: (.+?)(?:\n|$)/);
          
          if (titleMatch && urlMatch) {
            markdown += `- [${titleMatch[1]}](${urlMatch[1]})\n`;
          } else {
            // 截取前200字符避免过长
            markdown += text.substring(0, 200) + (text.length > 200 ? "..." : "") + "\n\n";
          }
        }
      }
    }
  }
  
  markdown += "\n---\n\n";
  return markdown;
}

// ==================== 聊天请求处理 ====================

interface ChatRequest {
  model: string;
  messages: Message[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

async function handleChatCompletions(request: Request): Promise<Response> {
  let requestBody: ChatRequest;
  
  try {
    requestBody = await request.json();
  } catch {
    return createErrorResponse(400, "Invalid JSON in request body");
  }
  
  const { model, messages, stream = false } = requestBody;
  
  if (!model) {
    return createErrorResponse(400, "Missing 'model' field");
  }
  
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return createErrorResponse(400, "Missing or invalid 'messages' field");
  }
  
  // 获取模型对应的 value
  const modelValue = getModelValue(model);
  if (!modelValue) {
    return createErrorResponse(400, `Unknown model: ${model}. Please use model name from /v1/models`);
  }
  
  const webSearch = isSearchModel(modelValue);
  
  log(`Model: ${model}, Value: ${modelValue}, WebSearch: ${webSearch}, Stream: ${stream}`);
  
  // 格式化消息为单条文本
  const formattedMessage = formatMessagesToSingleText(messages);
  log("Formatted message:", formattedMessage.substring(0, 100) + "...");
  
  // 获取随机 UA
  const userAgent = getRandomUserAgent();
  log("Using User-Agent:", userAgent);
  
  try {
    // 构造请求体
    const requestId = generateRandomId(16);
    const messageId = generateRandomId(16);
    
    const stockaiRequest = {
      model: modelValue,
      webSearch: webSearch,
      id: requestId,
      messages: [{
        parts: [{
          type: "text",
          text: formattedMessage
        }],
        id: messageId,
        role: "user"
      }],
      trigger: "submit-message"
    };
    
    log("Sending request to StockAI...");
    log("Request body:", JSON.stringify(stockaiRequest));
    
    // 发送请求
    const chatResponse = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": AI_SDK_UA,
        "User-Agent": userAgent,
        "Referer": `${BASE_URL}/`,
      },
      body: JSON.stringify(stockaiRequest)
    });
    
    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      logError("StockAI API error:", chatResponse.status, errorText);
      return createErrorResponse(502, `Upstream API error: ${chatResponse.status}`);
    }
    
    // 处理 SSE 响应
    if (stream) {
      return await handleStreamResponse(chatResponse, model);
    } else {
      return await handleNonStreamResponse(chatResponse, model);
    }
    
  } catch (error) {
    logError("Error processing chat request:", error);
    return createErrorResponse(500, `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// ==================== 流式响应处理 ====================

async function handleStreamResponse(response: Response, model: string): Promise<Response> {
  const responseId = `chatcmpl-${generateUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const reader = response.body?.getReader();
  if (!reader) {
    return createErrorResponse(500, "Failed to read response stream");
  }
  
  let buffer = "";
  let reasoningContent = "";
  let textContent = "";
  let toolCallInfo = "";
  let isReasoningPhase = false;
  let isTextPhase = false;
  let sentRoleChunk = false;
  let currentToolName = "";
  let currentToolInput = "";
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 发送首个块
        const firstChunk = {
          id: responseId,
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
        sentRoleChunk = true;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            const event = parseSSELine(line);
            if (!event) continue;
            
            log("SSE Event:", event.type, event);
            
            switch (event.type) {
              case "reasoning-start":
                isReasoningPhase = true;
                break;
                
              case "reasoning-delta":
                if (event.delta) {
                  reasoningContent += event.delta;
                  // 发送思考内容
                  const reasoningChunk = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: timestamp,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {
                        content: null,
                        reasoning_content: event.delta
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(reasoningChunk)}\n\n`));
                }
                break;
                
              case "reasoning-end":
                isReasoningPhase = false;
                break;
                
              case "text-start":
                isTextPhase = true;
                // 如果有工具调用信息，先发送
                if (toolCallInfo) {
                  const toolChunk = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: timestamp,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {
                        content: toolCallInfo
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`));
                  toolCallInfo = "";
                }
                break;
                
              case "text-delta":
                if (event.delta) {
                  textContent += event.delta;
                  const textChunk = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: timestamp,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {
                        content: event.delta
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(textChunk)}\n\n`));
                }
                break;
                
              case "text-end":
                isTextPhase = false;
                break;
                
              case "tool-input-start":
                currentToolName = event.toolName || "";
                currentToolInput = "";
                break;
                
              case "tool-input-delta":
                if (event.inputTextDelta) {
                  currentToolInput += event.inputTextDelta;
                }
                break;
                
              case "tool-input-available":
                if (event.toolName && event.input) {
                  toolCallInfo += formatToolCall(event.toolName, event.input);
                }
                break;
                
              case "tool-output-available":
                if (event.toolName && event.output) {
                  toolCallInfo += formatToolOutput(event.toolName, event.output);
                }
                break;
                
              case "data-text":
                // 处理 stockai/news 等模型的特殊响应格式
                if (event.data && event.data !== "Loading...") {
                  const dataChunk = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created: timestamp,
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {
                        content: event.data
                      },
                      logprobs: null,
                      finish_reason: null
                    }]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(dataChunk)}\n\n`));
                }
                break;
                
              case "done":
              case "finish":
                // 发送结束块
                const finishChunk = {
                  id: responseId,
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
                    completion_tokens: textContent.length + reasoningContent.length,
                    total_tokens: textContent.length + reasoningContent.length,
                    completion_tokens_details: {
                      reasoning_tokens: reasoningContent.length
                    }
                  }
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(finishChunk)}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                break;
            }
          }
        }
        
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

// ==================== 非流式响应处理 ====================

async function handleNonStreamResponse(response: Response, model: string): Promise<Response> {
  const responseId = `chatcmpl-${generateUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  
  const decoder = new TextDecoder();
  const reader = response.body?.getReader();
  
  if (!reader) {
    return createErrorResponse(500, "Failed to read response stream");
  }
  
  let buffer = "";
  let reasoningContent = "";
  let textContent = "";
  let toolCallInfo = "";
  let currentToolName = "";
  let currentToolInput = "";
  
  // 读取所有 SSE 事件
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const event = parseSSELine(line);
      if (!event) continue;
      
      log("SSE Event (non-stream):", event.type);
      
      switch (event.type) {
        case "reasoning-delta":
          if (event.delta) {
            reasoningContent += event.delta;
          }
          break;
          
        case "text-delta":
          if (event.delta) {
            textContent += event.delta;
          }
          break;
          
        case "tool-input-available":
          if (event.toolName && event.input) {
            toolCallInfo += formatToolCall(event.toolName, event.input);
          }
          break;
          
        case "tool-output-available":
          if (event.toolName && event.output) {
            toolCallInfo += formatToolOutput(event.toolName, event.output);
          }
          break;
          
        case "data-text":
          // 处理 stockai/news 等模型的特殊响应格式
          if (event.data && event.data !== "Loading...") {
            textContent += event.data;
          }
          break;
      }
    }
  }
  
  // 组合最终内容：工具调用信息 + 正式回复
  const finalContent = toolCallInfo + textContent;
  
  const responseBody = {
    id: responseId,
    object: "chat.completion",
    created: timestamp,
    model: model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: finalContent,
        ...(reasoningContent ? { reasoning_content: reasoningContent } : {})
      },
      logprobs: null,
      finish_reason: "stop"
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: finalContent.length + reasoningContent.length,
      total_tokens: finalContent.length + reasoningContent.length,
      ...(reasoningContent ? {
        completion_tokens_details: {
          reasoning_tokens: reasoningContent.length
        }
      } : {})
    }
  };
  
  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
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
      service: "StockAI OpenAI Compatible API Proxy",
      version: "1.0.0",
      endpoints: {
        models: "/v1/models",
        chat: "/v1/chat/completions"
      },
      debug: DEBUG,
      availableModels: MODELS.map(m => m.name)
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
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
      return createErrorResponse(401, auth.error!, "authentication_error");
    }
    return handleModelsRequest();
  }
  
  if (path === "/v1/chat/completions" && method === "POST") {
    const auth = authenticateRequest(request);
    if (!auth.success) {
      return createErrorResponse(401, auth.error!, "authentication_error");
    }
    return await handleChatCompletions(request);
  }
  
  // 404 - 路由不存在
  return createErrorResponse(404, `Endpoint not found: ${method} ${path}`, "not_found");
}

// ==================== Deno Deploy 入口 ====================

Deno.serve({
  port: 8000,
  onListen({ port, hostname }) {
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Debug mode: ${DEBUG}`);
    console.log(`Configured API keys: ${AUTH_KEYS.length}`);
    console.log(`Available models: ${MODELS.length}`);
  }
}, handleRequest);
