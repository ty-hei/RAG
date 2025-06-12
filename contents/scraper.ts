// contents/scraper.ts

// 该脚本被程序化地注入到文章页面以抓取全文。

(async () => {
  console.log("RAG Scraper: Content script injected.");

  // 一个简单的启发式方法，用于寻找页面的主要内容。
  // 这并非万无一失，需要针对不同出版商网站进行优化。
  const getMainContent = (): HTMLElement | null => {
    return (
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body // 作为最后的备用选项
    );
  };

  try {
    // 确保页面已基本加载完成
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mainContent = getMainContent();
    const text = mainContent ? mainContent.innerText : document.body.innerText;

    // 后台脚本正在等待此消息
    chrome.runtime.sendMessage({
      type: "SCRAPED_CONTENT",
      payload: {
        text: text,
        url: window.location.href,
      }
    });
  } catch (error) {
    chrome.runtime.sendMessage({
      type: "SCRAPING_FAILED",
      payload: {
        error: error.message,
        url: window.location.href,
      }
    });
  }
})();

// 为了让此脚本成为可注入的普通脚本而不是模块，我们导出一个空对象。
export {};