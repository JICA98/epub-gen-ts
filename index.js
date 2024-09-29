
const epub = require('./dist/index.js').default;

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
        content: [content, content],
    }).then((data) => {
        console.log(data);
    }).catch((error) => {
        console.error(error);
    });
}

main();
