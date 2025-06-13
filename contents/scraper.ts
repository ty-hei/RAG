// RAG-main/contents/scraper.ts

// 【新增】为 Readability 构造函数声明一个类型，以避免 TypeScript 报错
declare const Readability: new (doc: Document, options?: object) => {
  parse(): {
    title: string;
    content: string;
    textContent: string;
    length: number;
    excerpt: string;
    byline: string;
    dir: string;
    siteName: string;
  } | null;
};


(async () => {
  console.log("RAG Scraper: Content script injected, now using Readability.");

  try {
    // Readability.js 库现在应该已经被 background.ts 注入到这个页面了
    if (typeof Readability === "undefined") {
      throw new Error("Readability.js library not found. Was it injected correctly?");
    }

    // 为了不破坏原页面，我们在文档的一个克隆上运行 Readability
    const documentClone = document.cloneNode(true) as Document;
    const reader = new Readability(documentClone);
    const article = reader.parse();

    if (article) {
      console.log(`Readability parsed the article successfully: "${article.title}"`);
      // 后台脚本正在等待此消息
      chrome.runtime.sendMessage({
        type: "SCRAPED_CONTENT",
        payload: {
          // 我们现在发送更结构化的数据
          text: article.textContent,
          title: article.title,
          excerpt: article.excerpt,
        }
      });
    } else {
      console.warn("Readability.parse() returned null. The page might not be an article.");
      throw new Error("Readability could not parse this page into an article.");
    }
    
  } catch (error) {
    console.error("RAG Scraper Error:", error);
    chrome.runtime.sendMessage({
      type: "SCRAPING_FAILED",
      payload: {
        error: error.message,
      }
    });
  }
})();

// 为了让此脚本成为可注入的普通脚本而不是模块，我们导出一个空对象。
export {};