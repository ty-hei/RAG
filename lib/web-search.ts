// RAG-main/lib/web-search.ts

interface WebSearchResult {
  url: string;
  title: string;
  content: string;
}

// ✅ 【新增】调用 Google Custom Search API 的函数
async function searchWithGoogle(query: string, apiKey: string, cseId: string): Promise<WebSearchResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}`;
  
  const response = await fetch(url);

  if (!response.ok) {
    try {
      const errorBody = await response.json();
      const errorMessage = errorBody.error?.message || response.statusText;
      throw new Error(`Google Search API 请求失败: ${errorMessage}`);
    } catch (e) {
      throw new Error(`Google Search API 请求失败，状态码: ${response.status}`);
    }
  }

  const data = await response.json();
  if (!data.items) {
    return [];
  }

  // 格式化返回结果以匹配我们的内部类型
  return data.items.map((item: any) => ({
    url: item.link,
    title: item.title,
    content: item.snippet
  }));
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

  if (!response.ok) {
    try {
      const errorBody = await response.json();
      throw new Error(`Tavily API 请求失败: ${errorBody.error || response.statusText}`);
    } catch (e) {
      throw new Error(`Tavily API 请求失败，状态码: ${response.status}`);
    }
  }

  const data = await response.json();
  return data.results || [];
}

export async function performWebSearch(
  // ✅ 【变更】更新 provider 类型
  provider: 'tavily' | 'google' | 'none',
  query: string,
  // ✅ 【变更】apiKey 和 cseId 变为可选对象
  keys: { 
    tavilyApiKey?: string, 
    googleApiKey?: string, 
    googleCseId?: string 
  }
): Promise<WebSearchResult[]> {
  switch (provider) {
    case 'tavily':
      if (!keys.tavilyApiKey) {
        throw new Error("Tavily AI API 密钥缺失。");
      }
      return await searchWithTavily(query, keys.tavilyApiKey);
    
    // ✅ 【新增】处理 Google Search 的情况
    case 'google':
      if (!keys.googleApiKey || !keys.googleCseId) {
        throw new Error("Google API 密钥或搜索引擎ID缺失。");
      }
      return await searchWithGoogle(query, keys.googleApiKey, keys.googleCseId);

    case 'none':
      return [];
    default:
      return [];
  }
}