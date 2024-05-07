chrome.runtime.onMessage.addListener((message) => {
  if (message.command === "check_png_chunk_data") {
    processFile(message.url);
  }
});

async function processFile(url) {
  try {
    // const response = await fetch("https://corsproxy.io/?" + url);
    const response = await fetch(url);

    if (!response.headers.get("Content-Type").startsWith("image")) return;
    const arrayBuffer = await response.arrayBuffer();
    const byteArray = new Uint8Array(arrayBuffer);

    let keywords = "";
    let text = "";
    let width,
      height,
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
      fileType;

    ({
      width,
      height,
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
      text,
      keywords,
      fileType,
    } = await newReader(arrayBuffer));

    if (text === "" && colorType === 6 && fileType === "png") {
      // NovelAI Stealth PNG
      debugger;
      ({
        width,
        height,
        bitDepth,
        colorType,
        compressionMethod,
        filterMethod,
        interlaceMethod,
        text,
        keywords,
      } = await novelAiRead(byteArray, width, height));
    }

    if (text === "") {
      ({
        width,
        height,
        bitDepth,
        colorType,
        compressionMethod,
        filterMethod,
        interlaceMethod,
        text,
        keywords,
      } = await oldReader(byteArray));
    }

    // when no text is found stop here
    if (text === "") {
      console.info("no prompts found");
      return;
    }

    // console.log("Keywords: " + keywords);
    // console.log("Text: " + text);
    // console.log("Image Width: " + width);
    // console.log("Image Height: " + height);
    // console.log("Image Bit Depth: " + bitDepth);
    // console.log("Image Color Type: " + colorType);
    // console.log("Image Compression Method: " + compressionMethod);
    // console.log("Image Filter Method: " + filterMethod);
    // console.log("Image Interlace Method: " + interlaceMethod);
    let dialog = document.createElement("dialog");
    dialog.id = "container-stablediffusion";
    dialog.innerHTML += `
      <form method="dialog">
        <h1>SD Prompts Checker<sup> by albertlast (orginal Hunter69.com)</sup></h1>
        <br/>
        Prompt:  <div id="container-stablediffusion-promps" > </div>
        <br/><br/>
        Image Width: <span id="container-stablediffusion-width" > </span> px
        <br/>
        Image Height: <span id="container-stablediffusion-height" > </span> px
        <br/>
        <br/>

        <button> Close </button>
      </form>
    `;

    dialog.querySelector("#container-stablediffusion-promps").innerText = text;
    dialog.querySelector("#container-stablediffusion-width").innerText =
      Number.parseInt(width);
    dialog.querySelector("#container-stablediffusion-height").innerText =
      Number.parseInt(height);

    function onClickSD_Prompt(event) {
      if (event.target === dialog) {
        dialog.close();
        dialog.remove();
      }
      event.stopPropagation();
    }

    dialog.addEventListener("click", onClickSD_Prompt);

    document.body.appendChild(dialog);
    dialog.showModal();
  } catch (error) {
    console.log(error);
  }
}

async function novelAiRead(byteArray, maxWidth, maxHeight) {
  debugger;
  let text = "",
    textCompressionm = "";
  let aplhaData = {};
  let img = new Blob([byteArray]);
  let bitmap = await createImageBitmap(img);
  let canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);

  let imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  let rows = 0;
  let cols = 0;

  for (let x = 3; x < imgData.length; x += 4) {
    if (cols === 0) aplhaData[rows] = {};
    aplhaData[rows][cols] = imgData[x] & 1;
    cols++;
    if (cols === maxWidth) {
      rows++;
      cols = 0;
    }
  }

  //magic number check
  const magic = "stealth_pngcomp";
  let readWidth = 0;
  let readHeight = 0;
  let readObj;
  let pngByte = new Uint8Array();
  for (let y = 0; y < magic.length; y++) {
    const tempByte = pngByte;
    readObj = readBytes(aplhaData, readWidth, readHeight, maxWidth, maxHeight);
    readWidth = readObj.width;
    readHeight = readObj.height;
    pngByte = new Uint8Array(pngByte.length + 1);
    pngByte.set(tempByte);
    pngByte.set([readObj.byte], tempByte.length);
  }

  const magicCode = String.fromCharCode(...pngByte);
  pngByte = new Uint8Array();

  if (magic !== magicCode) return;

  //get the size of data
  for (let y = 0; y < 4; y++) {
    const tempByte = pngByte;
    readObj = readBytes(aplhaData, readWidth, readHeight, maxWidth, maxHeight);
    readWidth = readObj.width;
    readHeight = readObj.height;
    pngByte = new Uint8Array(pngByte.length + 1);
    pngByte.set(tempByte);
    pngByte.set([readObj.byte], tempByte.length);
  }

  const zipLong = new DataView(pngByte.buffer).getInt32(0, false) / 8;
  pngByte = new Uint8Array();
  //read data
  for (let y = 0; y < zipLong; y++) {
    const tempByte = pngByte;
    readObj = readBytes(aplhaData, readWidth, readHeight, maxWidth, maxHeight);
    readWidth = readObj.width;
    readHeight = readObj.height;
    pngByte = new Uint8Array(pngByte.length + 1);
    pngByte.set(tempByte);
    pngByte.set([readObj.byte], tempByte.length);
  }

  let promp = pako.ungzip(pngByte);
  const utf8decoder = new TextDecoder();
  promp = JSON.parse(utf8decoder.decode(promp));

  imgData = null;
  const comment = JSON.parse(promp.Comment);
  text = comment.prompt ?? "";
  text += "\n";
  text += "Negative prompt: " + comment.uc ?? "";
  text += "\n";
  delete comment.uc;
  delete comment.prompt;
  text += JSON.stringify(comment);

  if (text === "" && textCompressionm !== "") text = textCompressionm;

  return {
    width: maxWidth,
    height: maxHeight,
    text,
  };
}

function readBytes(alphaData, width, height, maxWidth, maxHeight) {
  let byte = 0;
  for (let i = 0; i < 8; i++) {
    byte <<= 1;
    byte |= alphaData[height][width];
    height++;
    if (height === maxHeight) {
      width++;
      height = 0;
    }
  }
  return {
    byte,
    width,
    height,
  };
}

function pngRead(byteArray) {
  let offset = 8;
  let width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    keywords = "",
    text = "",
    textCompressionm = "";
  const maxLenght = byteArray.length;
  const chunkLength2 =
    (byteArray[offset] << 24) |
    (byteArray[offset + 1] << 16) |
    (byteArray[offset + 2] << 8) |
    byteArray[offset + 3];
  for (let b = 3; b < maxLenght; b = b + 4) {
    const chunkType = String.fromCharCode(...byteArray.slice(b, b + 4));
    // debugger;
    if (chunkType === "stea") {
      debugger;
    }
  }

  while (offset < byteArray.length) {
    const chunkLength =
      (byteArray[offset] << 24) |
      (byteArray[offset + 1] << 16) |
      (byteArray[offset + 2] << 8) |
      byteArray[offset + 3];
    offset += 4;
    const chunkType = String.fromCharCode(
      ...byteArray.slice(offset, offset + 4)
    );
    offset += 4;
    debugger;
    if (chunkType === "tEXt") {
      const keyword = String.fromCharCode(
        ...byteArray.slice(offset, offset + chunkLength)
      );
      const keywordData = keyword.split("\0");
      keywords += keywordData[0] + "; ";
      text += keywordData[1] + "; ";
    } else if (chunkType === "zTXt") {
      const keyword = String.fromCharCode(
        ...byteArray.slice(offset, offset + chunkLength)
      );
      const keywordData = keyword.split("\0");
      const compression = byteArray[offset + keywordData[0].length + 1];
      keywords += keywordData[0] + "; ";
      if (compression === 0) {
        textCompressionm += keywordData[2] + "; ";
      } else {
      }
    } else if (chunkType === "iTXt") {
      const keyword = String.fromCharCode(
        ...byteArray.slice(offset, offset + chunkLength)
      );
      const keywordData = keyword.split("\0");
      keywords += keywordData[0] + "; ";
      if (keywordData[1] === "") {
        let foundKeywordIndex = null;
        for (let i = 3; i < keywordData.length; i++) {
          if (keywordData[i].length > 0) {
            foundKeywordIndex = i;
            break;
          }
        }
        if (foundKeywordIndex) text += keywordData[foundKeywordIndex] + "; ";
      } else {
      }
    } else if (chunkType === "IHDR") {
      width =
        (byteArray[offset] << 24) |
        (byteArray[offset + 1] << 16) |
        (byteArray[offset + 2] << 8) |
        byteArray[offset + 3];
      height =
        (byteArray[offset + 4] << 24) |
        (byteArray[offset + 5] << 16) |
        (byteArray[offset + 6] << 8) |
        byteArray[offset + 7];
      bitDepth = byteArray[offset + 8];
      colorType = byteArray[offset + 9];
      compressionMethod = byteArray[offset + 12];
      filterMethod = byteArray[offset + 13];
      interlaceMethod = byteArray[offset + 14];
    }
    offset += chunkLength + 4; // Skip the data and the CRC
  }

  // Fallback read UserComment when no uncompressed text was found
  if (
    text === "" &&
    String.fromCharCode(...byteArray.slice(106, 113)) === "UNICODE"
  ) {
    let offset = 114;
    const chunkLength = 4;
    const length = byteArray.length;
    let keywordsArray = [];

    while (offset < length) {
      ChunkData = byteArray.slice(offset, offset + chunkLength);
      // EOL User Comment

      if (
        String.fromCharCode(...ChunkData) === "zTXt" ||
        (String.fromCharCode(...ChunkData).endsWith("zT") &&
          String.fromCharCode(
            ...byteArray.slice(offset + chunkLength, offset + chunkLength + 2)
          ) === "Xt")
      ) {
        const removeEle = String.fromCharCode(...ChunkData).endsWith("zT")
          ? 6
          : 8;
        //reached the end remove the last chunk
        for (i = 0; i < removeEle; i++) {
          keywordsArray.pop();
        }
        keywords = String.fromCharCode(...keywordsArray);
        break;
      }
      keywordsArray.push(...ChunkData);
      offset += chunkLength;
    }
    text = keywords;
  }

  if (text === "" && textCompressionm !== "") text = textCompressionm;

  return {
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    text,
    keywords,
  };
}

function jpegRead(byteArray) {
  let offset =
    String.fromCharCode(...byteArray.slice(74, 81)) === "UNICODE" ? 82 : 78;
  const chunkLength = 2;
  let width = -1,
    height = -1,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    keywords = "",
    text = "";
  const length = byteArray.length;
  let ChunkData;

  while (offset < length) {
    ChunkData = byteArray.slice(offset, offset + chunkLength);
    // EOL User Comment

    if (
      String.fromCharCode(...ChunkData) === "ÿÀ" &&
      String.fromCharCode(
        ...byteArray.slice(offset + chunkLength, offset + 2 * chunkLength)
      ) === "\u0000\u0011"
    )
      break;
    keywords += String.fromCharCode(...ChunkData);
    offset += chunkLength;
  }
  keywords = keywords.replaceAll("\u0000", "");
  text = keywords;

  return {
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    text,
    keywords,
  };
}

async function newReader(arrayBuffer) {
  let width = -1,
    height = -1,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    keywords = "",
    text = "",
    fileType;

  try {
    const tags = await ExifReader.load(arrayBuffer);
    // The MakerNote tag can be really large. Remove it to lower
    // memory usage if you're parsing a lot of files and saving the
    // tags.
    delete tags["MakerNote"];
    colorType =
      typeof tags["Color Type"] === "object" &&
      typeof tags["Color Type"].value === "number"
        ? tags["Color Type"].value
        : -1;

    fileType =
      typeof tags["FileType"] === "object" &&
      typeof tags["FileType"].value === "string"
        ? tags["FileType"].value
        : null;
    height =
      typeof tags["Image Height"] === "object" &&
      typeof tags["Image Height"].value === "number"
        ? tags["Image Height"].value
        : -1;

    width =
      typeof tags["Image Width"] === "object" &&
      typeof tags["Image Width"].value === "number"
        ? tags["Image Width"].value
        : -1;

    text =
      typeof tags["parameters"] === "object" &&
      typeof tags.parameters.description === "string"
        ? tags.parameters.description
        : "";

    if (
      text === "" &&
      typeof tags.UserComment === "object" &&
      Array.isArray(tags.UserComment.value)
    ) {
      const bytesView = new Uint8Array(tags.UserComment.value);
      text = new TextDecoder().decode(bytesView).replaceAll("\u0000", "");
      text = text.startsWith("UNICODE") ? text.replace("UNICODE", "") : text;
    }

    //InvokeAI
    if (
      text === "" &&
      typeof tags.invokeai_metadata === "object" &&
      tags.invokeai_metadata.value
    ) {
      const invo = JSON.parse(tags.invokeai_metadata.value);
      if (invo.positive_prompt) {
        text = invo.positive_prompt;
        text += invo.negative_prompt
          ? `
          Negative prompt: ${invo.negative_prompt}`
          : "";
        text += "\n" + tags.invokeai_metadata.value;
      }
    }

    // Use the tags now present in `tags`.
  } catch (error) {
    // Handle error.

    console.log(error.toString());
  }
  return {
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    text,
    keywords,
    fileType,
  };
}

async function oldReader(byteArray) {
  let width = -1,
    height = -1,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    keywords = "",
    text = "";

  // PNG Logic
  if (String.fromCharCode(...byteArray.slice(1, 4)) === "PNG") {
    ({
      width,
      height,
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
      text,
      keywords,
    } = pngRead(byteArray));
  }
  // JPEG
  else if (
    String.fromCharCode(...byteArray.slice(6, 10)) === "JFIF" &&
    String.fromCharCode(...byteArray.slice(24, 28)) === "Exif" &&
    (String.fromCharCode(...byteArray.slice(74, 81)) === "UNICODE" ||
      String.fromCharCode(...byteArray.slice(70, 77)) === "UNICODE")
  ) {
    console.log("JPEG");
    ({
      width,
      height,
      bitDepth,
      colorType,
      compressionMethod,
      filterMethod,
      interlaceMethod,
      text,
      keywords,
    } = jpegRead(byteArray));
  }
  return {
    width,
    height,
    bitDepth,
    colorType,
    compressionMethod,
    filterMethod,
    interlaceMethod,
    text,
    keywords,
  };
}
