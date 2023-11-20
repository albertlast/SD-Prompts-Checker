let cspURL = "";
let cspID = null;

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  // check if the clicked item was a PNG image
  if (info.menuItemId === "check-png" && info.mediaType === "image") {
    // send a message to the content script with the image URL
    try {
      await browser.tabs.sendMessage(tab.id, {
        command: "check_png_chunk_data",
        url: info.srcUrl,
      });
    } catch (e) {
      //CSP ?
      if (
        e.message ===
        "Could not establish connection. Receiving end does not exist."
      ) {
        const newTab = await browser.tabs.create({ url: "/csp.html" });
        cspURL = info.srcUrl;
        cspID = newTab.id;
      } else {
        console.error(e);
      }
    }
  }
});

// create a context menu item for PNG images
browser.contextMenus.create({
  id: "check-png",
  title: "SD Prompts Checker",
  contexts: ["image"],
});

// callback of tab when page is loaded
function cspLoaded() {
  browser.tabs.sendMessage(cspID, {
    command: "check_png_chunk_data",
    url: cspURL,
  });
}
