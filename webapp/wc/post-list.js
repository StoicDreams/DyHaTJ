/* A list of community posts.
 * <app-post-list kind="job|tip" limit="20" controls></app-post-list>
 * controls: adds sort (newest or most helpful) and, for tips, a category filter.
 * category="interviews": only that tip category. sort="top": most helpful first. mine: only the visitor's own posts.
 */
"use strict"
{
    webui.define('app-post-list', {
        preload: 'app:store app:post-card app:join button flex dropdown alert',
        attr: ['kind', 'limit', 'category', 'empty', 'sort'],
        flags: ['controls', 'mine'],
        attrChanged() {
            if (this._ready) this.refresh();
        },
        connected() {
            const t = this;
            const d = window.dyhatj;
            t._ready = true;
            t._sort = t.getAttribute('sort') === 'top' ? 'top' : 'new';
            t._category = t.getAttribute('category') || '';
            t._list = webui.create('div', { 'aria-live': 'polite' });
            const parts = [];
            if (t.hasAttribute('controls')) {
                const bar = webui.create('webui-flex', { gap: '3', wrap: '', align: 'end', class: 'mb-3' });
                const sort = webui.create('webui-dropdown', { label: 'Sort', style: 'max-width:20em', options: JSON.stringify([{ id: 'new', display: 'Newest' }, { id: 'top', display: 'Most helpful' }]) });
                sort.addEventListener('change', () => { t._sort = sort.value || 'new'; t.refresh(); });
                bar.appendChild(sort);
                if (t.getAttribute('kind') === 'tip' && !t.hasAttribute('category')) {
                    const cats = [{ id: '', display: 'All topics' }].concat(d.tipCategories.map(c => ({ id: c.id, display: c.name })));
                    const cat = webui.create('webui-dropdown', { label: 'Topic', style: 'max-width:24em', options: JSON.stringify(cats) });
                    cat.addEventListener('change', () => { t._category = cat.value || ''; t.refresh(); });
                    bar.appendChild(cat);
                }
                parts.push(bar);
            }
            parts.push(t._list);
            t.replaceChildren(...parts);
            t.listen();
            t.addDataset('subscribe', 'session-user-role:refresh');
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
            t._off = window.dyhatj.watch(t, t.refresh);
        },
        async refresh() {
            const t = this;
            if (!t._list) return;
            const d = window.dyhatj;
            const token = t._token = {};
            let posts;
            try {
                posts = await d.api.request('POST', 'posts/query', {
                    kind: t.getAttribute('kind') || '', category: t._category, sort: t._sort,
                    limit: t.getAttribute('limit') || 50, mine: t.hasAttribute('mine'),
                });
            } catch (ex) {
                if (token !== t._token) return;
                t._list.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            if (!posts.length) {
                t._list.replaceChildren(webui.create('p', { text: t.getAttribute('empty') || 'Nothing here yet. Be the first to share something.' }));
                return;
            }
            const frag = document.createDocumentFragment();
            posts.forEach(post => {
                const card = webui.create('app-post-card');
                card.item = post;
                frag.appendChild(card);
            });
            t._list.replaceChildren(frag);
        },
    });
}
