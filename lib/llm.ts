// lib/llm.ts

import type { LLMConfig } from "./types";

// 新增一个参数来指定期望的响应格式
export async function callLlm(prompt: string, config: LLMConfig, responseType: 'json' | 'text' = 'json'): Promise<string> {
  if (config.provider === 'gemini') {
    return callGemini(prompt, config, responseType);
  } else {
    return callOpenAI(prompt, config, responseType);
  }
}

async function callGemini(prompt: string, config: LLMConfig, responseType: 'json' | 'text'): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  
  // 根据期望的响应类型动态设置 generationConfig
  const generationConfig = responseType === 'json' ? { responseMimeType: "application/json" } : {};

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig, // 使用动态配置
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  // 检查安全评级和被屏蔽的内容，这可能导致错误
  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      const blockReason = data.promptFeedback?.blockReason;
      throw new Error(`Gemini API 返回无内容。屏蔽原因: ${blockReason || '未知'}`);
  }
  return data.candidates[0].content.parts[0].text;
}

async function callOpenAI(prompt: string, config: LLMConfig, responseType: 'json' | 'text'): Promise<string> {
  // 如果未提供，则默认为官方OpenAI端点
  const apiEndpoint = config.apiEndpoint || 'https://api.openai.com/v1/chat/completions';

  // 动态设置 response_format
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    ...(responseType === 'json' && { response_format: { type: "json_object" } })
  };

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`OpenAI API Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
   if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenAI API 未返回任何选项。');
  }
  return data.choices[0].message.content;
}