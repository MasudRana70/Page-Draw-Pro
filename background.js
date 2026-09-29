async function togglePDP(tab) {
  if (!tab || !tab.id || !tab.url) return;
  if (tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("https://chromewebstore.google.com")) {
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-pdp" });
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "toggle-pdp" }).catch(() => {});
    }, 100);
  }
}

chrome.action.onClicked.addListener((tab) => {
  togglePDP(tab);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-pdp") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        togglePDP(tabs[0]);
      }
    });
  }
});