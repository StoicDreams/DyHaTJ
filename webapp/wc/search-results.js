/* Results for the job search at /search/{job}/{location}: sponsored listings first, then the job feed, then jobs the
 * community shared that match. During the POC the feed is sample data stored in the browser.
 * <app-search-results></app-search-results>
 */
"use strict"
{
    webui.define('app-search-results', {
        preload: 'app:store app:search app:post-card flex dropdown alert',
        connected() {
            const t = this;
            const d = window.dyhatj;
            t._workplace = '';
            const bar = webui.create('webui-flex', { gap: '3', wrap: '', align: 'end', class: 'mb-3' });
            const workplace = webui.create('webui-dropdown', { label: 'Workplace', style: 'max-width:20em', options: JSON.stringify([{ id: '', display: 'Any' }].concat(d.workplaces.map(w => ({ id: w.id, display: w.name })))) });
            workplace.addEventListener('change', () => { t._workplace = workplace.value || ''; t.refresh(); });
            bar.appendChild(workplace);
            t._results = webui.create('div', { 'aria-live': 'polite' });
            t.replaceChildren(bar, t._results);
            t.addDataset('subscribe', 'page-path:refresh|session-user-role:refresh');
            t.listen();
            t.refresh();
        },
        reconnected() { this.listen(); },
        disconnected() {
            if (this._off) this._off();
            this._off = null;
        },
        listen() {
            const t = this;
            if (t._off) t._off();
            t._off = window.dyhatj.on('path', () => t.refresh());
        },
        async refresh() {
            const t = this;
            const d = window.dyhatj;
            if (!t._results) return;
            const search = webui.loadSearchFromUrl ? webui.loadSearchFromUrl() : { job: '', loc: '' };
            const token = t._token = {};
            if (!search.job) {
                t._results.replaceChildren(webui.create('p', { text: 'Enter a job title above to search. Try "cook", "nurse", "developer", or "remote".' }));
                return;
            }
            let found;
            try {
                found = await d.api.request('POST', 'listings/search', { job: search.job, loc: search.loc, workplace: t._workplace });
            } catch (ex) {
                if (token !== t._token) return;
                t._results.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            const frag = document.createDocumentFragment();
            const where = search.loc ? ` in ${search.loc}` : '';
            const total = found.sponsored.length + found.listings.length + found.community.length;
            frag.appendChild(webui.create('p', { text: `${total} result${total === 1 ? '' : 's'} for "${search.job}"${where}.`, role: 'status' }));
            const section = (title, items, note) => {
                if (!items.length) return;
                frag.appendChild(webui.create('h2', { text: title }));
                if (note) frag.appendChild(webui.create('small', { text: note, class: 'd-block mb-2' }));
                items.forEach(item => {
                    const card = webui.create('app-post-card');
                    card.item = item;
                    frag.appendChild(card);
                });
            };
            section('Sponsored', found.sponsored, 'Employers pay to show these listings first.');
            section('Job listings', found.listings, 'Gathered from job feeds. Apply on the employer\'s site.');
            section('Shared by the community', found.community, 'Jobs people heard about and passed along.');
            if (!total) frag.appendChild(webui.create('p', { text: 'No matches yet. Try fewer words, a nearby city, or leave the location empty.' }));
            t._results.replaceChildren(frag);
        },
    });
}
