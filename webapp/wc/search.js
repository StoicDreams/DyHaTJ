"use strict"
{
    const content = `
<webui-page-segment elevation="10" style="max-width:800px" class="mx-a">
<form id="searchform">
<webui-flex align="center" justify="center" class="px-3">
<webui-input-text name="job" label="Job Title" compact placeholder="restaurant specialist" data-subscribe="session-search-job:value" data-trigger="session-search-job"></webui-input-text>
<webui-flex align="center" justify="center" class="pt-3 px-3">in</webui-flex>
<webui-input-text name="loc" label="Location" compact placeholder="New York" data-subscribe="session-search-loc:value" data-trigger="session-search-loc"></webui-input-text>
</webui-flex>
<webui-flex justify="end" align="center" class="pt-3">
<webui-alert severity="danger"></webui-alert>
<webui-button type="submit" theme="primary" start-icon="search">Search</webui-button>
</webui-flex>
</form>
</webui-page-segment>
`;
    function convertForUrl(input) {
        input = input || '';
        return input.trim().replace(/[^A-Za-z0-9-_ ,]/g, '').replace(/[ ]+/g, '_');
    }
    function convertFromUrl(input) {
        input = input || '';
        return input.replace(/_/g, ' ');
    }
    webui.loadSearchFromUrl = function () {
        let result = { job: '', loc: '' };
        let ps = location.pathname.split('/').filter(s => !!s);
        if (ps.length < 2) return result;
        if (ps[0] !== 'search') return result;
        if (ps.length > 2) {
            result.loc = convertFromUrl(ps[2]);
        }
        result.job = convertFromUrl(ps[1]);
        return result;
    }
    webui.define("app-search", {
        content: true,
        watchVisibility: false,
        isInput: false,
        preload: '',
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
            this.setupComponent();
        },
        setupComponent() {
            const t = this;
            t.innerHTML = content;
            let form = t.querySelector('#searchform');
            let alert = t.querySelector('webui-alert');
            let data = webui.loadSearchFromUrl();
            if (data.job) {
                webui.setData('session-search-job', data.job);
            }
            if (data.loc) {
                webui.setData('session-search-loc', data.loc);
            }
            form.addEventListener('submit', ev => {
                ev.stopPropagation();
                ev.preventDefault();
                const formData = new FormData(form);
                const jsonData = Object.fromEntries(formData);
                let job = convertForUrl(jsonData.job);
                let loc = convertForUrl(jsonData.loc);
                if (!job) {
                    alert.setValue(`Please enter what job you are looking for`);
                    return;
                }
                if (loc) {
                    webui.navigateTo(`/search/${job}/${loc}`);
                } else {
                    webui.navigateTo(`/search/${job}`);
                }
            });
        },
    });
}