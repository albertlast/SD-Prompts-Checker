chrome.runtime.onMessage.addListener((message) => {
  if (message.command === "check_png_chunk_data") {
    processCSP(message.url);
  }
});

let backgroundPage = browser.extension.getBackgroundPage();
backgroundPage.cspLoaded();

function processCSP(url) {
  document.getElementById("cspImage").src = url;
}
