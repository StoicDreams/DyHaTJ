/* The page for one job or tip: /job/{id} or /tip/{id}. Reads the id from the address and follows it when it changes,
 * because moving between two /job/ addresses keeps the same page. Posts get comments. Listings don't.
 * <app-post-detail></app-post-detail>
 */
"use strict"
{
    function idFromPath() {
        const parts = location.pathname.split('/').filter(Boolean);
        return parts.length === 2 && /^(job|tip)$/.test(parts[0]) ? { route: parts[0], id: parts[1] } : null;
    }
    webui.define('app-post-detail', {
        preload: 'app:store app:post-card app:comments button alert',
        connected() {
            const t = this;
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
            const offData = window.dyhatj.watch(t, t.refresh);
            const offPath = window.dyhatj.on('path', () => t.refresh());
            t._off = () => { offData(); offPath(); };
        },
        async refresh() {
            const t = this;
            const d = window.dyhatj;
            const target = idFromPath();
            const token = t._token = {};
            if (!target) {
                t.replaceChildren(t.back(), webui.create('p', { text: 'Pick a job or tip from the list to see it here.' }));
                return;
            }
            const isListing = target.id.startsWith('l-');
            let item;
            try {
                item = await d.api.request('GET', `${isListing ? 'listings' : 'posts'}/${target.id}`);
            } catch (ex) {
                if (token !== t._token) return;
                t.replaceChildren(t.back(target.route), webui.create('webui-alert', { variant: 'warning', show: '', text: d.message(ex) }));
                webui.setData('page-title', 'Not found');
                return;
            }
            if (token !== t._token) return;
            webui.setData('page-title', item.title);
            webui.setData('page-subtitle', item.kind === 'tip' ? d.nameOf(d.tipCategories, item.category) : [item.company, item.location].filter(Boolean).join(', '));
            // Keep the comment thread when only the card changed, so a half-written comment isn't lost.
            const card = webui.create('app-post-card', { full: '' });
            card.item = item;
            const existing = t.querySelector('app-comments');
            const parts = [t.back(target.route), card];
            if (!isListing) parts.push(existing && existing.getAttribute('post-id') === item.id ? existing : webui.create('app-comments', { 'post-id': item.id }));
            t.replaceChildren(...parts);
        },
        back(route) {
            const tip = route === 'tip';
            return webui.create('webui-link', { href: tip ? '/tips' : '/jobs', icon: 'arrow|rotate:180', class: 'mb-3 d-inlineblock', text: tip ? 'All tips' : 'All shared jobs' });
        },
    });
}
