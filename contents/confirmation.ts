// RAG-main/contents/confirmation.ts

(() => {
  // 确保脚本不会重复注入
  if (document.getElementById('rag-confirmation-bar')) {
    return;
  }

  console.log("RAG Confirmation: Injecting confirmation bar.");

  // 创建操作栏的容器
  const bar = document.createElement('div');
  bar.id = 'rag-confirmation-bar';
  bar.style.position = 'fixed';
  bar.style.top = '0';
  bar.style.left = '0';
  bar.style.width = '100%';
  bar.style.backgroundColor = '#2c3e50';
  bar.style.color = 'white';
  bar.style.padding = '12px 20px';
  bar.style.zIndex = '9999999';
  bar.style.display = 'flex';
  bar.style.justifyContent = 'center';
  bar.style.alignItems = 'center';
  bar.style.fontFamily = 'sans-serif';
  bar.style.fontSize = '16px';
  bar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';

  // 创建提示信息
  const message = document.createElement('span');
  message.textContent = 'PubMed RAG 智能助理：请确认此页面是否为正确的文章。';
  message.style.marginRight = '20px';

  // 创建“确认抓取”按钮
  const confirmButton = document.createElement('button');
  confirmButton.textContent = '确认抓取并继续';
  confirmButton.style.cssText = `
    background-color: #27ae60;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
    margin-right: 10px;
  `;

  // 创建“跳过”按钮
  const skipButton = document.createElement('button');
  skipButton.textContent = '跳过此篇';
  skipButton.style.cssText = `
    background-color: #c0392b;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 14px;
  `;

  // "确认抓取"按钮的点击事件
  confirmButton.addEventListener('click', () => {
    console.log("RAG Confirmation: User confirmed scrape.");
    chrome.runtime.sendMessage({ type: 'CONFIRM_SCRAPE' });
    bar.remove(); // 操作后移除操作栏
  });

  // "跳过"按钮的点击事件
  skipButton.addEventListener('click', () => {
    console.log("RAG Confirmation: User skipped article.");
    chrome.runtime.sendMessage({ type: 'SKIP_ARTICLE' });
    bar.remove(); // 操作后移除操作栏
  });

  // 将所有元素添加到操作栏
  bar.appendChild(message);
  bar.appendChild(confirmButton);
  bar.appendChild(skipButton);

  // 将操作栏添加到页面
  document.body.appendChild(bar);

})();

// 导出空对象，使其成为可注入的脚本
export {};