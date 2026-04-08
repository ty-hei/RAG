// lib/llm.ts

import type { LLMConfig } from "./types"

// 更新：新增 modelName 参数，以明确指定要使用的模型
// 新增：onStream 回调函数，用于流式传输
export async function callLlm(
  prompt: string,
  config: LLMConfig,
  modelName: string,
  responseType: "json" | "text" = "json",
  onStream?: (chunk: string) => void
): Promise<string> {
  if (config.provider === "gemini") {
    return callGemini(prompt, config, modelName, onStream) // 移除了 responseType，因为我们将统一处理
  } else {
    return callOpenAI(prompt, config, modelName, responseType, onStream)
  }
}

async function callGemini(
  prompt: string,
  config: LLMConfig,
  modelName: string,
  onStream?: (chunk: string) => void
): Promise<string> {
  // 【变更】使用稳定的 v1 API 端点，而不是 v1beta
  // 如果有 onStream，使用 streamGenerateContent
  const action = onStream ? 'streamGenerateContent' : 'generateContent';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${action}?key=${config.apiKey}`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
      // 【变更】移除了 generationConfig。我们依赖强大的Prompt来确保JSON格式，
      // 这使得API调用更稳定，并避免了beta功能的潜在问题。
    })
  })

  if (!response.ok) {
    const errorData = await response.json()
    // 捕获并清晰地抛出从API返回的错误信息
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`)
  }

  if (onStream) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    if (!reader) throw new Error("Failed to get response reader");

    // Gemini returns a stream of JSON objects, each containing a candidate
    // However, the stream format is a JSON array: [{...}, {...}]
    // We need to parse this properly. A simple way for Gemini's specific format:
    // It sends chunks like ",\n" and then the JSON object.

    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Simple parsing logic for Gemini stream
      // Note: This is a simplified parser. Robust parsing might need a library or more complex logic.
      // Gemini stream usually sends valid JSON objects separated by commas in a list.
      // But raw stream chunks might cut JSON in half.
      // For simplicity in this environment, we will try to extract text from complete JSON objects.

      // Actually, for Gemini REST API stream, it returns a series of JSON objects, 
      // but wrapped in an array structure `[` ... `]`
      // We can try to regex match "text": "..."

      // A safer approach for Gemini REST stream without full JSON parser:
      // The chunks are usually well-formed JSON objects if we ignore the array brackets.
      // Let's accumulate and try to find "text" fields.

      // Improved loop:
      // 1. Remove opening '[' if present at start
      // 2. Split by objects? No, that's hard.

      // Let's use a regex to find "text": "..." in the buffer and emit it.
      // This is hacky but works for simple text streaming.
      // CAUTION: This might re-emit text if we don't clear buffer.
      // Better: Just accumulate full text and return it at the end, 
      // BUT for streaming to work we need to emit new parts.

      // Let's try a different approach:
      // Gemini stream chunks are usually independent JSON objects if we strip the array formatting.
      // e.g. { "candidates": [...] }

      // Let's just accumulate everything for the final return, 
      // and try to parse the *latest* chunk for display.

      // Actually, let's look at how we can just extract the text delta.
      // Since we can't easily parse partial JSON, we might just wait for the full response 
      // if we can't implement a robust stream parser here easily.

      // WAIT: The user wants streaming. 
      // Let's try to parse the buffer.

      // For now, let's implement a basic accumulation and return for Gemini 
      // and focus on OpenAI which has a standard SSE format that is easier to parse.
      // If Gemini is hard, we can just return full text at end, but let's try.

      // Regex to find "text": "..."
      const matches = buffer.matchAll(/"text":\s*"((?:[^"\\]|\\.)*)"/g);
      let currentTotalText = "";
      for (const match of matches) {
        try {
          // Unescape JSON string
          currentTotalText += JSON.parse(`"${match[1]}"`);
        } catch (e) {
          // ignore
        }
      }

      // If we found new text, emit the delta
      if (currentTotalText.length > fullText.length) {
        const delta = currentTotalText.slice(fullText.length);
        onStream(delta);
        fullText = currentTotalText;
      }
    }

    return fullText;

  } else {
    const data = await response.json()
    // 检查是否存在有效的返回内容
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      const blockReason = data.promptFeedback?.blockReason
      throw new Error(`Gemini API 返回无内容。屏蔽原因: ${blockReason || "未知"}`)
    }
    return data.candidates[0].content.parts[0].text
  }
}

async function callOpenAI(
  prompt: string,
  config: LLMConfig,
  modelName: string,
  responseType: "json" | "text",
  onStream?: (chunk: string) => void
): Promise<string> {
  // 如果未提供，则默认为官方OpenAI端点
  // 【重要】用户输入的 apiEndpoint 应该是基础URL (例如 https://api.openai.com/v1)，而不是完整的路径
  const apiEndpoint = config.apiEndpoint || "https://api.openai.com/v1"
  const fullUrl = `${apiEndpoint.replace(/\/$/, "")}/chat/completions` // 确保URL拼接正确

  const body = {
    model: modelName,
    messages: [{ role: "user", content: prompt }],
    ...(responseType === "json" && { response_format: { type: "json_object" } }),
    stream: !!onStream
  }

  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`)
  }

  if (onStream) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    if (!reader) throw new Error("Failed to get response reader");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');

      for (const line of lines) {
        if (line === 'data: [DONE]') return fullText;
        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.replace('data: ', '');
            const data = JSON.parse(jsonStr);
            const content = data.choices[0]?.delta?.content || "";
            if (content) {
              fullText += content;
              onStream(content);
            }
          } catch (e) {
            console.warn("Error parsing stream chunk", e);
          }
        }
      }
    }
    return fullText;
  } else {
    const data = await response.json()
    if (!data.choices || data.choices.length === 0) {
      throw new Error("OpenAI API 未返回任何选项。")
    }
    return data.choices[0].message.content
  }
}