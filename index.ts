import _ from "underscore";
import uslug from "uslug";
import ejs from "ejs";
import entities from "entities";
import request from "superagent";
import 'superagent-proxy';
import fsextra from "fs-extra";
import mime from "mime";
import archiver from "archiver";
import IDOMParser from "advanced-html-parser";

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

export interface TempFile {
    file: string;
    encoding: string;
}

export interface FileOptions {
    tempDir: string;
    writeFile: (file: TempFile) => string;
    readFile: (fileName: string) => TempFile;
}

interface ImageOptions {
    id: string;
    url: string;
    path: string;
    mediaType: string;
    extension: string;
}

export interface EPubOptions {
    title: string;
    content: string;
    description?: string;
    publisher?: string;
    author?: string[] | string;
    appendChapterTitles?: boolean;
    tocTitle?: string;
    date?: string;
    lang?: string;
    version?: number;
    docHeader?: string;
    id?: string;
    cover?: Blob;
    css?: string;
    verbose?: boolean;
    proxy?: string;
    fileOptions?: FileOptions;
    _images?: ImageOptions[];
}

export default function epub(options: EPubOptions): Promise<Blob> {
    if (!options.title || !options.content) {
        console.error(new Error("Title and content are both required"));
        throw new Error("Title and content are both required");
    }

    options = _.extend({
        description: options.title,
        publisher: "anonymous",
        author: ["anonymous"],
        tocTitle: "Table Of Contents",
        appendChapterTitles: true,
        date: new Date().toISOString(),
        lang: "en",
        fonts: [],
        version: 3,
        id: uuid(),
    }, options);

    if (options.version === 2) {
        options.docHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${options.lang}">\
`;
    } else {
        options.docHeader = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${options.lang}">\
`;
    }

    if (_.isString(options.author)) {
        options.author = [options.author];
    }
    if (_.isEmpty(options.author)) {
        options.author = ["anonymous"];
    }
    options._images = [];
    options.content = covertContent(options);

    if (options.cover) {
        options._coverMediaType = mime.getType(options.cover);
        options._coverExtension = mime.getExtension(options._coverMediaType);
    }

    return render(options);
}

function covertContent(options: EPubOptions) {
    const content = options.content;
    const allowedAttributes = ["content", "alt", "id", "title", "src", "href", "about", "accesskey", "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-busy", "aria-checked", "aria-controls", "aria-describedat", "aria-describedby", "aria-disabled", "aria-dropeffect", "aria-expanded", "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid", "aria-label", "aria-labelledby", "aria-level", "aria-live", "aria-multiline", "aria-multiselectable", "aria-orientation", "aria-owns", "aria-posinset", "aria-pressed", "aria-readonly", "aria-relevant", "aria-required", "aria-selected", "aria-setsize", "aria-sort", "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext", "class", "content", "contenteditable", "contextmenu", "datatype", "dir", "draggable", "dropzone", "hidden", "hreflang", "id", "inlist", "itemid", "itemref", "itemscope", "itemtype", "lang", "media", "ns1:type", "ns2:alphabet", "ns2:ph", "onabort", "onblur", "oncanplay", "oncanplaythrough", "onchange", "onclick", "oncontextmenu", "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "oninput", "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpause", "onplay", "onplaying", "onprogress", "onratechange", "onreadystatechange", "onreset", "onscroll", "onseeked", "onseeking", "onselect", "onshow", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "onvolumechange", "onwaiting", "prefix", "property", "rel", "resource", "rev", "role", "spellcheck", "style", "tabindex", "target", "title", "type", "typeof", "vocab", "xml:base", "xml:lang", "xml:space", "colspan", "rowspan", "epub:type", "epub:prefix"];
    const allowedXhtml11Tags = ["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "address", "hr", "pre", "blockquote", "center", "ins", "del", "a", "span", "bdo", "br", "em", "strong", "dfn", "code", "samp", "kbd", "bar", "cite", "abbr", "acronym", "q", "sub", "sup", "tt", "i", "b", "big", "small", "u", "s", "strike", "basefont", "font", "object", "param", "img", "table", "caption", "colgroup", "col", "thead", "tfoot", "tbody", "tr", "th", "td", "embed", "applet", "iframe", "img", "map", "noscript", "ns:svg", "object", "script", "table", "tt", "var"];

    const document = IDOMParser.parse(content);
    const dom = document.documentElement;

    // Only body innerHTML is allowed
    const body = dom.querySelector("body");
    if (body) {
        const bodyContent = body.innerHTML;
        dom.innerHTML = `<body>${bodyContent}</body>`;
    } else {
        dom.innerHTML = `<body>${dom.innerHTML}</body>`;
    }
    const elements = Array.from(dom.querySelectorAll("*")).reverse();
    elements.forEach((elem) => {
        const attrs = elem.attributes;
        if (["img", "br", "hr"].includes(elem.tagName.toLowerCase())) {
            if (elem.tagName.toLowerCase() === "img") {
                if (!elem.getAttribute("alt")) {
                    elem.setAttribute("alt", "image-placeholder");
                }
            }
        }

        if (attrs?.length) {
            for (let i = attrs.length - 1; i >= 0; i--) {
                const attr = attrs[i];
                if (!allowedAttributes.includes(attr.name)) {
                    elem.removeAttribute(attr.name);
                } else if (attr.name === "type" && elem.tagName.toLowerCase() !== "script") {
                    elem.removeAttribute(attr.name);
                }
            }
        }

        if (options.version === 2 && !allowedXhtml11Tags.includes(elem.tagName.toLowerCase())) {
            if (options.verbose) {
                console.log(`Warning (content): ${elem.tagName} tag isn't allowed on EPUB 2/XHTML 1.1 DTD.`);
            }
            const child = elem.innerHTML;
            const div = document.createElement("div");
            div.innerHTML = child;
            elem.replaceChild(div, elem);
        }
    });

    const imgElements = dom.querySelectorAll("img");
    imgElements.forEach((elem) => {
        let extension: any, id: any, image: ImageOptions | undefined;
        const url = elem.getAttribute("src");
        if (image = options._images?.find((element: { url: any; }) => element.url === url)) {
            ({ id } = image);
            ({ extension } = image);
        } else {
            id = uuid();
            const mediaType = mime.getType(url.replace(/\?.*/, ""));
            if (mediaType) {
                extension = mime.getExtension(mediaType);
                let path = options.fileOptions?.tempDir;
                if (path) {
                    options._images?.push({ id, url, path, mediaType, extension });
                }
            }
        }
        elem.setAttribute("src", `images/${id}.${extension}`);
    });

    return dom.innerHTML;
}

async function render(options: EPubOptions): Promise<Blob> {
    const self = this;
    if (options.verbose) { console.log("Generating Template Files....."); }

    const tempFile = await generateTempFile(options);
    return generateTempFile().then(function () {
        if (options.verbose) { console.log("Downloading Images..."); }
        return downloadAllImage().fin(function () {
            if (options.verbose) { console.log("Making Cover..."); }
            return makeCover().then(function () {
                if (options.verbose) { console.log("Generating Epub Files..."); }
                return genEpub().then(function (result: any) {
                    if (options.verbose) { console.log("About to finish..."); }
                    defer.resolve(result);
                    if (options.verbose) { return console.log("Done."); }
                }
                    , (err: any) => defer.reject(err));
            }
                , (err: any) => defer.reject(err));
        }
            , (err: any) => defer.reject(err));
    }
        , (err: any) => defer.reject(err));
}

async function generateTempFile(options: EPubOptions) {
    if (!options.css) { options.css = templatesCSS; }
    _.each(options.content, function (content: { title: any; author: { length: any; join: (arg0: string) => any; }; url: any; data: any; filePath: any; }) {
        let data = `${options.docHeader}
  <head>
  <meta charset="UTF-8" />
  <title>${entities.encodeXML(content.title || '')}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
<body>\
`;
        data += content.title && options.appendChapterTitles ? `<h1>${entities.encodeXML(content.title)}</h1>` : "";
        data += content.title && content.author && content.author.length ? `<p class='epub-author'>${entities.encodeXML(content.author.join(", "))}</p>` : "";
        data += content.title && content.url ? `<p class='epub-link'><a href='${content.url}'>${content.url}</a></p>` : "";
        data += `${content.data}</body></html>`;
        return fs.writeFileSync(content.filePath, data);
    });

    // write meta-inf/container.xml
    fs.mkdirSync(uuid + "/META-INF");
    fs.writeFileSync(`${uuid}/META-INF/container.xml`, "<?xml version=\"1.0\" encoding=\"UTF-8\" ?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>");

    if (options.version === 2) {
        // write meta-inf/com.apple.ibooks.display-options.xml [from pedrosanta:xhtml#6]
        fs.writeFileSync(`${uuid}/META-INF/com.apple.ibooks.display-options.xml`, `\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<display_options>
  <platform name="*">
    <option name="specified-fonts">true</option>
  </platform>
</display_options>\
`
        );
    }

    const opfPath = options.customOpfTemplatePath || path.resolve(__dirname, `../templates/epub${options.version}/content.opf.ejs`);
    if (!fs.existsSync(opfPath)) {
        generateDefer.reject(new Error('Custom file to OPF template not found.'));
        return generateDefer.promise;
    }

    const ncxTocPath = options.customNcxTocTemplatePath || path.resolve(__dirname, "../templates/toc.ncx.ejs");
    if (!fs.existsSync(ncxTocPath)) {
        generateDefer.reject(new Error('Custom file the NCX toc template not found.'));
        return generateDefer.promise;
    }

    const htmlTocPath = options.customHtmlTocTemplatePath || path.resolve(__dirname, `../templates/epub${options.version}/toc.xhtml.ejs`);
    if (!fs.existsSync(htmlTocPath)) {
        generateDefer.reject(new Error('Custom file to HTML toc template not found.'));
        return generateDefer.promise;
    }

    Q.all([
        Q.nfcall(ejs.renderFile, opfPath, options),
        Q.nfcall(ejs.renderFile, ncxTocPath, options),
        Q.nfcall(ejs.renderFile, htmlTocPath, options)
    ]).spread(function (data1: any, data2: any, data3: any) {
        fs.writeFileSync(path.resolve(uuid, "./OEBPS/content.opf"), data1);
        fs.writeFileSync(path.resolve(uuid, "./OEBPS/toc.ncx"), data2);
        fs.writeFileSync(path.resolve(uuid, "./OEBPS/toc.xhtml"), data3);
        return generateDefer.resolve();
    }
        , function (err: any) {
            console.error(arguments);
            return generateDefer.reject(err);
        });

    return generateDefer.promise;
}


async function downloadImage(options: { url: { indexOf: (arg0: string) => number; substr: (arg0: number) => any; }; id: string; extension: string; dir: any; }) {  //{id, url, mediaType}
    const self = this;
    const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/34.0.1847.116 Safari/537.36";
    if (!options.url && (typeof options !== "string")) {
        return false;
    }
    const downloadImageDefer = new Q.defer();
    const filename = path.resolve(uuid, ("./OEBPS/images/" + options.id + "." + options.extension));
    if (options.url.indexOf("file://") === 0) {
        const auxpath = options.url.substr(7);
        fsextra.copySync(auxpath, filename);
        return downloadImageDefer.resolve(options);
    } else {
        let requestAction: { pipe: (arg0: any) => void; on: (arg0: string, arg1: { (err: any): any; (): any; }) => void; };
        if (options.url.indexOf("http") === 0) {
            requestAction = request.get(options.url).set({ 'User-Agent': userAgent });
            requestAction.pipe(fs.createWriteStream(filename));
        } else {
            requestAction = fs.createReadStream(path.resolve(options.dir, options.url));
            requestAction.pipe(fs.createWriteStream(filename));
        }
        requestAction.on('error', function (err: any) {
            if (options.verbose) { console.error('[Download Error]', 'Error while downloading', options.url, err); }
            fs.unlinkSync(filename);
            return downloadImageDefer.reject(err);
        });

        requestAction.on('end', function () {
            if (options.verbose) { console.log("[Download Success]", options.url); }
            return downloadImageDefer.resolve(options);
        });

        return downloadImageDefer.promise;
    }
}


async function downloadAllImage() {
    const self = this;
    const imgDefer = new Q.defer();
    if (!options.images.length) {
        imgDefer.resolve();
    } else {
        fs.mkdirSync(path.resolve(uuid, "./OEBPS/images"));
        const deferArray = [];
        _.each(options.images, (image: any) => deferArray.push(downloadImage(image)));
        Q.all(deferArray)
            .fin(() => imgDefer.resolve());
    }
    return imgDefer.promise;
}

async function genEpub() {
    // Thanks to Paul Bradley
    // http://www.bradleymedia.org/gzip-markdown-epub/ (404 as of 28.07.2016)
    // Web Archive URL:
    // http://web.archive.org/web/20150521053611/http://www.bradleymedia.org/gzip-markdown-epub
    // or Gist:
    // https://gist.github.com/cyrilis/8d48eef37fbc108869ac32eb3ef97bca

    const genDefer = new Q.defer();

    const self = this;
    const cwd = uuid;

    const archive = archiver("zip", { zlib: { level: 9 } });
    const output = fs.createWriteStream(options.output);
    if (options.verbose) { console.log("Zipping temp dir to", options.output); }
    archive.append("application/epub+zip", { store: true, name: "mimetype" });
    archive.directory(cwd + "/META-INF", "META-INF");
    archive.directory(cwd + "/OEBPS", "OEBPS");
    archive.pipe(output);
    archive.on("end", function () {
        if (options.verbose) { console.log("Done zipping, clearing temp dir..."); }
        return rimraf(cwd, function (err: any) {
            if (err) {
                return genDefer.reject(err);
            } else {
                return genDefer.resolve();
            }
        });
    });
    archive.on("error", (err: any) => genDefer.reject(err));
    archive.finalize();

    return genDefer.promise;
}

module.exports = epub;

const templatesCSS = `
.epub-author {
    color: #555;
}

.epub-link {
    margin-bottom: 30px;
}

.epub-link a {
    color: #666;
    font-size: 90%;
}

.toc-author {
    font-size: 90%;
    color: #555;
}

.toc-link {
    color: #999;
    font-size: 85%;
    display: block;
}

hr {
    border: 0;
    border-bottom: 1px solid #dedede;
    margin: 60px 10%;
}
`;