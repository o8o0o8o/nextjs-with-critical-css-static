const Critters = require("critters");
const { join } = require("path");
const fs = require("fs");
const { parse } = require("node-html-parser");
const CryptoJS = require("crypto-js");
const { minify } = require("csso");

function getFiles(dir, files = []) {
  const fileList = fs.readdirSync(dir);

  for (const file of fileList) {
    const name = `${dir}/${file}`;

    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      files.push(name);
    }
  }

  return files;
}
async function criticalCSS() {
  const currentFolder = join(process.cwd(), ".next");
  const files = getFiles(currentFolder);

  const critters = new Critters({
    path: currentFolder,
    fonts: true,
  });

  for (const file of files) {
    if (file.endsWith(".html")) {
      try {
        const html = fs.readFileSync(file, "utf-8");
        const DOMBeforeCritters = parse(html);
        const uniqueImportantStyles = new Set();

        for (const style of DOMBeforeCritters.querySelectorAll("style")) {
          uniqueImportantStyles.add(style.innerHTML);
        }

        const pathPatterns = {
          real: "/static/css",
          original: "/_next/static/css",
        };

        const changedToRealPath = html.replaceAll(
          pathPatterns.original,
          pathPatterns.real
        );

        const inlined = await critters.process(changedToRealPath);

        const restoredNextJSPath = inlined.replaceAll(
          pathPatterns.real,
          pathPatterns.original
        );

        const DOMAfterCritters = parse(restoredNextJSPath);
        const head = DOMAfterCritters.querySelector("head");

        for (const linkInHead of head.querySelectorAll("link")) {
          if (
            linkInHead.attributes?.as === "style" ||
            linkInHead.attributes?.rel === "stylesheet"
          ) {
            linkInHead.remove();
          }
        }

        const importantCSS = Array.from(uniqueImportantStyles).join("");
        const body = DOMAfterCritters.querySelector("body");

        if (importantCSS.length > 0) {
          const hash = CryptoJS.MD5(CryptoJS.enc.Latin1.parse(importantCSS));
          const inlinedStylesPath = `/static/css/styles.${hash}.css`;
          const attachedStylesheets = [];
          const stylesheets = [];

          for (const stylesheet of attachedStylesheets) {
            const stylesheetStyles = fs.readFileSync(
              join(currentFolder, stylesheet)
            );

            stylesheets.push(stylesheetStyles);
          }
          // Merge all stylesheets in one, add importantCSS in the end to persist specificity
          const allInOne = stylesheets.join("") + importantCSS;

          fs.writeFileSync(
            join(currentFolder, inlinedStylesPath),
            minify(allInOne).css
          );

          if (body) {
            body.insertAdjacentHTML(
              "beforeend",
              `<link rel="stylesheet" href="/_next${inlinedStylesPath}" />`
            );
          }
        }

        fs.writeFileSync(file, DOMAfterCritters.toString());
      } catch (error) {
        console.log(error);
      }
    }
  }
}

criticalCSS();
