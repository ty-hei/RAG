// RAG-main/contents/scraper.ts

import { Readability } from "./Readability";

console.log("RAG Scraper: Content script loaded and waiting for messages.");

// 将所有抓取逻辑包裹在消息监听器中
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 确认是后台发来的指定任务
  if (message.type === "DO_SCRAPE") {
    console.log("RAG Scraper: Received DO_SCRAPE message, starting execution.");
    
    // 使用立即执行的异步函数来执行抓取
    (async () => {
      try {
        if (typeof Readability === "undefined") {
          throw new Error("Readability.js library not found. The bundle may be corrupted.");
        }

        const documentClone = document.cloneNode(true) as Document;
        const reader = new (Readability as any)(documentClone);
        const article = reader.parse();

        if (article && article.textContent) {
          console.log(`Readability parsed the article successfully: "${article.title}"`);
          // 将结果发回后台
          chrome.runtime.sendMessage({
            type: "SCRAPED_CONTENT",
            payload: {
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
        // 将错误信息发回后台
        chrome.runtime.sendMessage({
          type: "SCRAPING_FAILED",
          payload: {
            error: error.message,
          }
        });
      }
    })();

    // 返回 true 表示我们将异步地发送响应（虽然在这个场景我们用sendMessage，但这是个好习惯）
    return true; 
  }
});

// 不再需要导出一个空对象，因为这不是一个立即执行的脚本
// export {};