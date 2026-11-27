import React from 'react';

export const collectedHead = [];

export function resetCollectedHead() {
    collectedHead.length = 0;
}

function Head({children}) {
    if (typeof window === 'undefined') {
        collectedHead.push(...React.Children.toArray(children));
    }
    return null;
}

export default Head;
