import React from "react";
import Main from "./Main";
import Head from "./Head";
import {collectedHead} from '../components/Head';
import PhactScripts from "./PhactScripts";

function Document({pageName, AppContents, appHtml, headElements}) {
    const headItems = headElements ?? collectedHead;

    return (
        <html>
        <Head collectedHead={headItems} />
        <body>
        {typeof appHtml === 'string' ? (
            <div id="__phact-root" dangerouslySetInnerHTML={{__html: appHtml}} />
        ) : (
            <div id="__phact-root">
                <Main App={AppContents}/>
            </div>
        )}
        <PhactScripts pageName={pageName}/>
        </body>
        </html>
    );
}

export default Document;
