import Q from "q";
import _ from "underscore";
import ejs from "ejs";
import archiver from "archiver";
import IDOMParser from "advanced-html-parser";
import { fstat, writeFileSync } from "fs";

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c: string) {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

class TemplateOptions {
    customOpfTemplate: string;
    customNcxTocTemplate: string;
    customHtmlTocTemplate: string;

    constructor({
        customOpfTemplate,
        customNcxTocTemplate,
        customHtmlTocTemplate
    }: {
        customOpfTemplate?: string;
        customNcxTocTemplate?: string;
        customHtmlTocTemplate?: string;
    }) {
        this.customOpfTemplate = customOpfTemplate || contentOPF_EJS_TEMPLATE;
        this.customNcxTocTemplate = customNcxTocTemplate || contentNCX_EJS_TEMPLATE;
        this.customHtmlTocTemplate = customHtmlTocTemplate || toc_XHTML_EJS_TEMPLATE;
    }
}

class EpubStructure {
    content: ChapterOptions[];
    // meta-inf/container.xml
    containerXML: string = "<?xml version=\"1.0\" encoding=\"UTF-8\" ?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>";
    // meta-inf/com.apple.ibooks.display-options.xml
    displayOptionsXML: string = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?><display_options><platform name=\"*\"><option name=\"specified-fonts\">true</option></platform></display_options>";
    // oebps/content.opf
    contentOPF: string;
    // oebps/toc.ncx
    tocNCX: string;
    // oebps/toc.xhtml
    tocXHTML: string;
    // oebps/style.css
    styleCSS: string = templatesCSS;

    constructor({
        content,
        contentOPF,
        tocNCX,
        tocXHTML,
    }: {
        content: ChapterOptions[];
        contentOPF: string;
        tocNCX: string;
        tocXHTML: string;
    }) {
        this.content = content;
        this.contentOPF = contentOPF;
        this.tocNCX = tocNCX;
        this.tocXHTML = tocXHTML;
    }
}

export interface ChapterOptions {
    content: string;
    title?: string;
    author?: string[];
}

export interface EPubOptions {
    title: string;
    content: ChapterOptions[];
    description?: string;
    publisher?: string;
    author?: string[];
    appendChapterTitles?: boolean;
    tocTitle?: string;
    date?: string;
    lang?: string;
    docHeader?: string;
    id?: string;
    cover?: Blob;
    css?: string;
    verbose?: boolean;
    proxy?: string;
    template?: TemplateOptions;
    images?: any[];
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
        images: [],
    }, options);

    options.docHeader = `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE html>
    <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${options.lang}">\
    `;
    if (_.isEmpty(options.author)) {
        options.author = ["anonymous"];
    }
    options.content = covertContent(options);

    return render(options);
}

function covertContent(options: EPubOptions) {
    const content = options.content;
    const allowedAttributes = ["content", "alt", "id", "title", "src", "href", "about", "accesskey", "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-busy", "aria-checked", "aria-controls", "aria-describedat", "aria-describedby", "aria-disabled", "aria-dropeffect", "aria-expanded", "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden", "aria-invalid", "aria-label", "aria-labelledby", "aria-level", "aria-live", "aria-multiline", "aria-multiselectable", "aria-orientation", "aria-owns", "aria-posinset", "aria-pressed", "aria-readonly", "aria-relevant", "aria-required", "aria-selected", "aria-setsize", "aria-sort", "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext", "class", "content", "contenteditable", "contextmenu", "datatype", "dir", "draggable", "dropzone", "hidden", "hreflang", "id", "inlist", "itemid", "itemref", "itemscope", "itemtype", "lang", "media", "ns1:type", "ns2:alphabet", "ns2:ph", "onabort", "onblur", "oncanplay", "oncanplaythrough", "onchange", "onclick", "oncontextmenu", "ondblclick", "ondrag", "ondragend", "ondragenter", "ondragleave", "ondragover", "ondragstart", "ondrop", "ondurationchange", "onemptied", "onended", "onerror", "onfocus", "oninput", "oninvalid", "onkeydown", "onkeypress", "onkeyup", "onload", "onloadeddata", "onloadedmetadata", "onloadstart", "onmousedown", "onmousemove", "onmouseout", "onmouseover", "onmouseup", "onmousewheel", "onpause", "onplay", "onplaying", "onprogress", "onratechange", "onreadystatechange", "onreset", "onscroll", "onseeked", "onseeking", "onselect", "onshow", "onstalled", "onsubmit", "onsuspend", "ontimeupdate", "onvolumechange", "onwaiting", "prefix", "property", "rel", "resource", "rev", "role", "spellcheck", "style", "tabindex", "target", "title", "type", "typeof", "vocab", "xml:base", "xml:lang", "xml:space", "colspan", "rowspan", "epub:type", "epub:prefix"];
    const allowedXhtml11Tags = ["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "address", "hr", "pre", "blockquote", "center", "ins", "del", "a", "span", "bdo", "br", "em", "strong", "dfn", "code", "samp", "kbd", "bar", "cite", "abbr", "acronym", "q", "sub", "sup", "tt", "i", "b", "big", "small", "u", "s", "strike", "basefont", "font", "object", "param", "img", "table", "caption", "colgroup", "col", "thead", "tfoot", "tbody", "tr", "th", "td", "embed", "applet", "iframe", "img", "map", "noscript", "ns:svg", "object", "script", "table", "tt", "var"];

    function sanitizeContent(chapterOptions: ChapterOptions) {
        const content = chapterOptions.content;
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

            if (!allowedXhtml11Tags.includes(elem.tagName.toLowerCase())) {
                if (options.verbose) {
                    console.log(`Warning (content): ${elem.tagName} tag isn't allowed on EPUB 2/XHTML 1.1 DTD.`);
                }
                const child = elem.innerHTML;
                const div = document.createElement("div");
                div.innerHTML = child;
                elem.replaceChild(div, elem);
            }
        });

        return { ...chapterOptions, content: dom.outerHTML, author: chapterOptions.author ?? options.author };
    }

    return content.map((content) => {
        return sanitizeContent(content);
    });
}

async function render(options: EPubOptions): Promise<Blob> {
    if (options.verbose) { console.log("Generating Epub Structure"); }
    const epubStructure = await generateEPUBStructure(options);
    if (options.verbose) { console.log("Generating EPUB"); }
    return genEpub(options, epubStructure);
}

async function generateEPUBStructure(options: EPubOptions): Promise<EpubStructure> {
    if (!options.css) { options.css = templatesCSS; }
    options.content.forEach((option) => {
        option.content = `
            ${options.docHeader}
            <head>
                <meta charset="UTF-8" />
                    <title>${options.title} </title>
                        < link rel = "stylesheet" type = "text/css" href = "style.css" />
            </head>
            <body>
                <h1>${options.title}</h1>
                <p class="epub-author">${options?.author?.join(', ') ?? ''}</p>
                ${content}
            </body>
            </html>
            `
    });

    const templateOptions = options.template ?? new TemplateOptions({});

    try {
        const opf = await ejs.render(templateOptions.customOpfTemplate, options, {async: true});
        const ncxToc = await ejs.render(templateOptions.customNcxTocTemplate, options, {async: true});
        const htmlToc = await ejs.render(templateOptions.customHtmlTocTemplate, options, {async: true});

        return new EpubStructure({
            content: options.content,
            contentOPF: opf,
            tocNCX: ncxToc,
            tocXHTML: htmlToc,
        });
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function genEpub(options: EPubOptions, epubStructure: EpubStructure): Promise<Blob> {
    const genDefer = Q.defer<Blob>();
    const archive = archiver("zip", { zlib: { level: 9 } });
    if (options.verbose) { console.log("Zipping temp file"); }
    archive.append("application/epub+zip", { store: true, name: "mimetype" });
    const buffers: Buffer[] = [];
    archive.on('data', (data: Buffer) => buffers.push(data));
    archive.on('end', () => {
        const blob = new Blob(buffers, { type: 'application/epub+zip' });
        genDefer.resolve(blob);
    });
    archive.on('error', (err: any) => genDefer.reject(err));

    // Append the necessary files to the archive
    archive.append(epubStructure.containerXML, { name: 'META-INF/container.xml' });
    archive.append(epubStructure.displayOptionsXML, { name: 'META-INF/com.apple.ibooks.display-options.xml' });
    archive.append(epubStructure.contentOPF, { name: 'OEBPS/content.opf' });
    archive.append(epubStructure.tocNCX, { name: 'OEBPS/toc.ncx' });
    archive.append(epubStructure.tocXHTML, { name: 'OEBPS/toc.xhtml' });
    archive.append(epubStructure.styleCSS, { name: 'OEBPS/style.css' });

    // Add the content files
    epubStructure.content.forEach((content, index) => {
        archive.append(content.content, { name: `OEBPS/content_${index}.xhtml` });
    });

    await archive.finalize();
    return genDefer.promise;
}

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

const contentOPF_EJS_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf"
         version="3.0"
         unique-identifier="BookId"
         xmlns:dc="http://purl.org/dc/elements/1.1/"
         xmlns:dcterms="http://purl.org/dc/terms/"
         xml:lang="en"
         xmlns:media="http://www.idpf.org/epub/vocab/overlays/#"
         prefix="ibooks: http://vocabulary.itunes.apple.com/rdf/ibooks/vocabulary-extensions-1.0/">

    <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"
              xmlns:opf="http://www.idpf.org/2007/opf">

        <dc:identifier id="BookId"><%= id %></dc:identifier>
        <meta refines="#BookId" property="identifier-type" scheme="onix:codelist5">22</meta>
        <meta property="dcterms:identifier" id="meta-identifier">BookId</meta>
        <dc:title><%= title %></dc:title>
        <meta property="dcterms:title" id="meta-title"><%= title %></meta>
        <dc:language><%= lang || "en" %></dc:language>
        <meta property="dcterms:language" id="meta-language"><%= lang || "en" %></meta>
        <meta property="dcterms:modified"><%= (new Date()).toISOString().split(".")[0]+ "Z" %></meta>
        <dc:creator id="creator"><%= author.length ? author.join(",") : author %></dc:creator>
        <meta refines="#creator" property="file-as"><%= author.length ? author.join(",") : author %></meta>
        <meta property="dcterms:publisher"><%= publisher || "anonymous" %></meta>
        <dc:publisher><%= publisher || "anonymous" %></dc:publisher>
        <% var date = new Date(); var year = date.getFullYear(); var month = date.getMonth() + 1; var day = date.getDate(); var stringDate = "" + year + "-" + month + "-" + day; %>
        <meta property="dcterms:date"><%= stringDate %></meta>
        <dc:date><%= stringDate %></dc:date>
        <meta property="dcterms:rights">All rights reserved</meta>
        <dc:rights>Copyright &#x00A9; <%= (new Date()).getFullYear() %> by <%= publisher || "anonymous" %></dc:rights>
        <meta name="cover" content="image_cover"/>
        <meta name="generator" content="epub-gen" />
        <meta property="ibooks:specified-fonts">true</meta>

    </metadata>

    <manifest>
        <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />
        <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="css" href="style.css" media-type="text/css" />

        <% if(locals.cover) { %>
        <item id="image_cover" href="cover.<%= _coverExtension %>" media-type="<%= _coverMediaType %>" />
        <% } %>
        
        <% images.forEach(function(image, index){ %>
        <item id="image_<%= index %>" href="images/<%= image.id %>.<%= image.extension %>" media-type="<%= image.mediaType %>" />
        <% }) %>
        
        <% content.forEach(function(content, index){ %>
        <item id="content_<%= index %>_<%= content.id %>" href="<%= content.href %>" media-type="application/xhtml+xml" />
        <% }) %>

        <% fonts.forEach(function(font, index){%>
        <item id="font_<%= index%>" href="fonts/<%= font %>" media-type="application/x-font-ttf" />
        <%})%>
    </manifest>

    <spine toc="ncx">
        <% content.forEach(function(content, index){ %>
            <% if(content.beforeToc && !content.excludeFromToc){ %>
                <itemref idref="content_<%= index %>_<%= content.id %>"/>
            <% } %>
        <% }) %>
        <itemref idref="toc" />
        <% content.forEach(function(content, index){ %>
            <% if(!content.beforeToc && !content.excludeFromToc){ %>
                <itemref idref="content_<%= index %>_<%= content.id %>"/>
            <% } %>
        <% }) %>
    </spine>
    <guide>
        <reference type="text" title="Table of Content" href="toc.xhtml"/>
    </guide>
</package>`;

const contentNCX_EJS_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
        <meta name="dtb:uid" content="<%= id %>" />
        <meta name="dtb:generator" content="epub-gen"/>
        <meta name="dtb:depth" content="1"/>
        <meta name="dtb:totalPageCount" content="0"/>
        <meta name="dtb:maxPageNumber" content="0"/>
    </head>
    <docTitle>
        <text><%= title %></text>
    </docTitle>
    <docAuthor>
        <text><%= author %></text>
    </docAuthor>
    <navMap>
        <% var _index = 0; %>
        <% content.forEach(function(content, index){ %>
            <% if(!content.excludeFromToc && content.beforeToc){ %>
                <navPoint id="content_<%= index %>_<%= content.id %>" playOrder="<%= _index++ %>" class="chapter">
                    <navLabel>
                        <text><%= (1+index) + ". " + (content.title || "Chapter " + (1+index))%></text>
                    </navLabel>
                    <content src="<%= content.href %>"/>
                </navPoint>
            <% } %>
        <% }) %>

        <navPoint id="toc" playOrder="<%= _index++ %>" class="chapter">
            <navLabel>
                <text><%= tocTitle %></text>
            </navLabel>
            <content src="toc.xhtml"/>
        </navPoint>

        <% content.forEach(function(content, index){ %>
            <% if(!content.excludeFromToc && !content.beforeToc){ %>
                <navPoint id="content_<%= index %>_<%= content.id %>" playOrder="<%= _index++ %>" class="chapter">
                    <navLabel>
                        <text><%= (1+index) + ". " + (content.title || "Chapter " + (1+index))%></text>
                    </navLabel>
                    <content src="<%= content.href %>"/>
                </navPoint>
            <% } %>
        <% }) %>
    </navMap>
</ncx>`;

const toc_XHTML_EJS_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="<%- lang %>" lang="<%- lang %>">
<head>
    <title><%= title %></title>
    <meta charset="UTF-8" />
    <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
<h1 class="h1"><%= tocTitle %></h1>
<nav id="toc" epub:type="toc">
    <ol>
        <% content.forEach(function(content, index){ %>
            <% if(!content.excludeFromToc && content.beforeToc){ %>
                <li class="table-of-content">
                    <a href="<%= content.href %>"><%= (content.title || "Chapter "+ (1+index)) %><% if(content.author.length){ %> - <small class="toc-author"><%= content.author.join(",") %></small><% }%><% if(content.url){ %><span class="toc-link"><%= content.url %></span><% }%></a>
                </li>
            <% } %>
        <% }) %>
        <% content.forEach(function(content, index){ %>
            <% if(!content.excludeFromToc && !content.beforeToc){ %>
                <li class="table-of-content">
                    <a href="<%= content.href %>"><%= (content.title || "Chapter "+ (1+index)) %><% if(content.author.length){ %> - <small class="toc-author"><%= content.author.join(",") %></small><% }%><% if(content.url){ %><span class="toc-link"><%= content.url %></span><% }%></a>
                </li>
            <% } %>
        <% }) %>
    </ol>
</nav>

</body>
</html>`;


const content = `
<div id="question-header" class="d-flex sm:fd-column">
                        <h1 itemprop="name" class="fs-headline1 ow-break-word mb8 flex--item fl1"><a href="/questions/58211880/uncaught-syntaxerror-cannot-use-import-statement-outside-a-module-when-import" class="question-hyperlink">"Uncaught SyntaxError: Cannot use import statement outside a module" when importing ECMAScript 6</a></h1>

                <div class="ml12 aside-cta flex--item sm:ml0 sm:mb12 sm:order-first d-flex jc-end">

                        <div class="ml12 aside-cta flex--item print:d-none">
                                <a href="/questions/ask" class="ws-nowrap s-btn s-btn__filled">
        Ask Question
    </a>

                        </div>
                </div>
            </div>
`;

function main() {
    console.log('Hello World');
    epub({
        title: 'Hello World',
        content: [{ content }, { content }],
        verbose: true
    }).then(async (data) => {
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        writeFileSync(`${uuid()}.epub`, buffer);
    }).catch((error) => {
        console.error(error);
    });
}

main();