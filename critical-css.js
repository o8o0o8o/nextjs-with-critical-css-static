const Beasties = require("beasties");
const { join } = require("path");
const fs = require("fs");
const { parse } = require("node-html-parser");
const CryptoJS = require("crypto-js");
const { minify } = require("csso");

// Recursive function to get files
function getHTMLFiles(dir, files = []) {
  // Get an array of all files and directories in the passed directory using fs.readdirSync
  const fileList = fs.readdirSync(dir);
  // Create the full path of the file/directory by concatenating the passed directory and file/directory name
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    // Check if the current file/directory is a directory using fs.statSync
    if (fs.statSync(name).isDirectory()) {
      // If it is a directory, recursively call the getFiles function with the directory path and the files array
      getHTMLFiles(name, files);
    } else {
      // If it is an HTML file, push the full path to the files array
      if (name.endsWith("html")) {
        files.push(name);
      }
    }
  }

  return files;
}

async function criticalCSS() {
  const currentFolder = join(process.cwd(), ".next");
  const files = getHTMLFiles(currentFolder);

  const beasties = new Beasties({
    path: currentFolder,
    fonts: true, // inline critical font rules (may be better for performance)
  });

  for (const file of files) {
    try {
      const html = fs.readFileSync(file, "utf-8");
      const DOMBeforeBeasties = parse(html);
      const uniqueImportantStyles = new Set();

      // first find all inline styles and add them to Set
      for (const style of DOMBeforeBeasties.querySelectorAll("style")) {
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

      const inlined = await beasties.process(changedToRealPath);
      const DOMAfterBeasties = parse(inlined);

      // merge all styles form existing <style/> tags into one string
      const importantCSS = Array.from(uniqueImportantStyles).join("");
      const body = DOMAfterBeasties.querySelector("body");

      if (importantCSS.length > 0) {
        const attachedStylesheets = new Set();
        const stylesheets = [];

        // find all <link/> tags with styles, get href from them and remove them from HTML
        for (const link of DOMAfterBeasties.querySelectorAll("link")) {
          if (
            link.attributes?.as === "style" ||
            link.attributes?.rel === "stylesheet"
          ) {
            attachedStylesheets.add(link.getAttribute("href"));

            link.remove();
          }
        }

        // go through found stylesheets: read file with CSS and push CSS string to stylesheets array
        for (const stylesheet of Array.from(attachedStylesheets)) {
          const stylesheetStyles = fs.readFileSync(
            join(currentFolder, stylesheet)
          );

          stylesheets.push(stylesheetStyles);
        }

        // Merge all stylesheets in one, add importantCSS in the end to persist specificity
        const allInOne = stylesheets.join("") + importantCSS;
        // using the hash, we will only create a new file if a file with that content does not exist
        const hash = CryptoJS.MD5(CryptoJS.enc.Latin1.parse(allInOne));
        const inlinedStylesPath = `/static/css/styles.${hash}.css`;

        fs.writeFileSync(
          join(currentFolder, inlinedStylesPath),
          // minification is optional here, it doesn't affect performance -- it is a lazy loaded CSS stylesheet, it only affects payload
          minify(allInOne).css
        );

        if (body) {
          body.insertAdjacentHTML(
            "beforeend",
            `<link rel="stylesheet" href="/_next${inlinedStylesPath}" />`
          );
        }
      }

      fs.writeFileSync(file, DOMAfterBeasties.toString());
    } catch (error) {
      console.log(error);
    }
  }
}

criticalCSS();
