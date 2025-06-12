// lib/llm.ts

import type { LLMConfig } from "./types"

// 更新：新增 modelName 参数，以明确指定要使用的模型
export async function callLlm(
  prompt: string,
  config: LLMConfig,
  modelName: string,
  responseType: "json" | "text" = "json"
): Promise<string> {
  if (config.provider === "gemini") {
    return callGemini(prompt, config, modelName) // 移除了 responseType，因为我们将统一处理
  } else {
    return callOpenAI(prompt, config, modelName, responseType)
  }
}

async function callGemini(prompt: string, config: LLMConfig, modelName: string): Promise<string> {
  // 【变更】使用稳定的 v1 API 端点，而不是 v1beta
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${config.apiKey}`

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

  const data = await response.json()
  // 检查是否存在有效的返回内容
  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    const blockReason = data.promptFeedback?.blockReason
    throw new Error(`Gemini API 返回无内容。屏蔽原因: ${blockReason || "未知"}`)
  }
  return data.candidates[0].content.parts[0].text
}

async function callOpenAI(
  prompt: string,
  config: LLMConfig,
  modelName: string,
  responseType: "json" | "text"
): Promise<string> {
  // 如果未提供，则默认为官方OpenAI端点
  // 【重要】用户输入的 apiEndpoint 应该是基础URL (例如 https://api.openai.com/v1)，而不是完整的路径
  const apiEndpoint = config.apiEndpoint || "https://api.openai.com/v1"
  const fullUrl = `${apiEndpoint.replace(/\/$/, "")}/chat/completions` // 确保URL拼接正确

  const body = {
    model: modelName,
    messages: [{ role: "user", content: prompt }],
    ...(responseType === "json" && { response_format: { type: "json_object" } })
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

  const data = await response.json()
  if (!data.choices || data.choices.length === 0) {
    throw new Error("OpenAI API 未返回任何选项。")
  }
  return data.choices[0].message.content
}