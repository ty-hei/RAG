// RAG-main/lib/web-search.ts

interface WebSearchResult {
  url: string;
  title: string;
  content: string;
}

async function searchWithTavily(query: string, apiKey: string): Promise<WebSearchResult[]> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: query,
      search_depth: "basic",
      include_answer: false,
      max_results: 10
    }),
  });

  // 【变更】增强错误处理逻辑
  if (!response.ok) {
    try {
      const errorBody = await response.json();
      // 返回Tavily提供的具体错误信息
      throw new Error(`Tavily API 请求失败: ${errorBody.error || response.statusText}`);
    } catch (e) {
      // 如果错误响应不是JSON格式，则返回通用错误
      throw new Error(`Tavily API 请求失败，状态码: ${response.status}`);
    }
  }

  const data = await response.json();
  return data.results || [];
}

export async function performWebSearch(
  provider: 'tavily' | 'none',
  query: string,
  apiKey: string | undefined
): Promise<WebSearchResult[]> {
  switch (provider) {
    case 'tavily':
      if (!apiKey) {
        throw new Error("Tavily API 密钥缺失。");
      }
      return await searchWithTavily(query, apiKey);
    case 'none':
      return [];
    default:
      return [];
  }
}