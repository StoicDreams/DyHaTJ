"use strict"
{
    const content = `
<webui-alert variant="info" show>Coming Soon!</webui-alert>
`;
    webui.define("app-search-results", {
        content: true,
        watchVisibility: false,
        isInput: false,
        preload: '',
        constructor() {
            const t = this;
        },
        flags: [],
        attr: ['height', 'max-height'],
        attrChanged(property, value) {
            const t = this;
            switch (property) {
                case 'height':
                    t.style.height = webui.pxIfNumber(value);
                    break;
                case 'maxHeight':
                    t.style.maxHeight = webui.pxIfNumber(value);
                    break;
            }
        },
        connected() {
            const t = this;
            t.setupComponent();
        },
        disconnected() {
            const t = this;
        },
        reconnected() {
            const t = this;
        },
        setupComponent() {
            const t = this;
            t.innerHTML = content;
        },
    });
}