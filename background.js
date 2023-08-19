browser.contextMenus.onClicked.addListener((info, tab) => {
  // check if the clicked item was a PNG image
  if (info.menuItemId === "check-png" && info.mediaType === "image") {
    // send a message to the content script with the image URL
    browser.tabs.sendMessage(tab.id, {
      command: "check_png_chunk_data",
      url: info.srcUrl,
    });
  }
});

// create a context menu item for PNG images
browser.contextMenus.create({
  id: "check-png",
  title: "SD Prompts Checker",
  contexts: ["image"],
});
