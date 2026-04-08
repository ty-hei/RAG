// contents/pubmed-scraper.ts

// 该脚本被程序化地注入到PubMed搜索结果页面以抓取摘要列表。

(async () => {
  console.log("RAG PubMed Scraper: Content script injected.");

  // Helper function to wait for an element to appear in the DOM
  const waitForElement = (selector: string, timeout = 10000): Promise<Element> => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    });
  };


  try {
    // Wait for the main results container to appear before scraping
    // This is more reliable than a fixed timeout.
    // I'm guessing 'div.search-results-chunk' is a container for results.
    // If not, 'article.docsum-article' is another good candidate.
    await waitForElement('article.docsum-article');
    
    // Add a small extra delay for content to populate within elements.
    await new Promise(resolve => setTimeout(resolve, 500));

    const articles = [];
    // The selector for article containers might have changed. 
    // 'article.docsum-article' is a common pattern on PubMed.
    const articleElements = document.querySelectorAll('article.docsum-article');

    console.log(`RAG PubMed Scraper: Found ${articleElements.length} articles.`);

    if (articleElements.length === 0) {
        console.warn("RAG PubMed Scraper: Found 0 articles. The page structure may have changed. Please check the selectors.");
    }

    articleElements.forEach(articleEl => {
      const pmidEl = articleEl.querySelector('.docsum-pmid');
      const titleEl = articleEl.querySelector('a.docsum-title');
      // The abstract class might have changed from .full-abstract to .docsum-abstract
      const abstractEl = articleEl.querySelector('.docsum-abstract, .full-abstract');

      const pmid = pmidEl?.textContent?.trim();
      const title = titleEl?.textContent?.trim();
      const abstract = abstractEl?.textContent?.trim() || "No abstract available.";

      if (pmid && title) {
        articles.push({ pmid, title, abstract });
      } else {
        console.warn("RAG PubMed Scraper: Skipped an article due to missing pmid or title.", {
            pmid: pmid || 'not found',
            title: title || 'not found',
            element: articleEl.innerHTML
        });
      }
    });

    chrome.runtime.sendMessage({
      type: "SCRAPED_SEARCH_RESULTS",
      payload: articles
    });

  } catch (error) {
    console.error("RAG PubMed Scraper: Error during scraping.", error);
    chrome.runtime.sendMessage({
      type: "SCRAPING_FAILED",
      payload: {
        error: `Scraping failed: ${error.message}. The PubMed website structure may have changed.`,
        url: window.location.href,
      }
    });
  }
})();

export {};
