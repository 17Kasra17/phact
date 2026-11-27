import React from 'react';

function PhactScripts({pageName}) {
    return (
        <>
            <script
                id="__PHACT_DATA__"
                type="application/json"
                dangerouslySetInnerHTML={{
                    __html: `<?php echo json_encode($props, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE); ?>`,
                }}
            />
            <script src={`/${pageName}.js`}></script>
        </>
    );
}

export default PhactScripts;
