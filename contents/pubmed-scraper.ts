// contents/pubmed-scraper.ts

// 该脚本被程序化地注入到PubMed搜索结果页面以抓取摘要列表。

(async () => {
  console.log("RAG PubMed Scraper: Content script injected.");

  try {
    // 等待页面元素加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    const articles = [];
    // 选取所有文章的容器
    const articleElements = document.querySelectorAll('article.full-docsum');

    console.log(`RAG PubMed Scraper: Found ${articleElements.length} articles.`);

    articleElements.forEach(articleEl => {
      // ?. 可选链操作符确保在元素不存在时不会报错，而是返回undefined
      const pmidEl = articleEl.querySelector('.docsum-pmid');
      const titleEl = articleEl.querySelector('a.docsum-title');
      const abstractEl = articleEl.querySelector('.full-abstract');

      const pmid = pmidEl?.textContent?.trim();
      const title = titleEl?.textContent?.trim();
      // 如果没有摘要，则提供一个默认值，以避免后续处理出错
      const abstract = abstractEl?.textContent?.trim() || "No abstract available.";

      // 确保我们获得了必要的信息
      if (pmid && title) {
        articles.push({ pmid, title, abstract });
      }
    });

    // 后台脚本正在等待此消息
    chrome.runtime.sendMessage({
      type: "SCRAPED_SEARCH_RESULTS",
      payload: articles
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

// 导出空对象，使其成为可注入的脚本
export {};