/* The moderator queue: reported or hidden posts, comments, and listings, with keep, hide, and remove.
 * Needs the moderator role. The API must check the role too: hiding this page only changes what is shown.
 * <app-moderation></app-moderation>
 */
"use strict"
{
    webui.define('app-moderation', {
        preload: 'app:store app:join button flex paper alert',
        connected() {
            const t = this;
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
            const d = window.dyhatj;
            const token = t._token = {};
            if (!d.can('moderate')) {
                t.replaceChildren(webui.create('app-join', { feature: 'moderate', action: 'review reports' }));
                return;
            }
            let queue;
            try {
                queue = await d.api.request('GET', 'moderation/queue');
            } catch (ex) {
                if (token !== t._token) return;
                t.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            const frag = document.createDocumentFragment();
            frag.appendChild(webui.create('p', { role: 'status', text: queue.length ? `${queue.length} item${queue.length === 1 ? '' : 's'} to review.` : 'Nothing to review. The queue is empty.' }));
            queue.forEach(entry => frag.appendChild(t.entry(entry)));
            t.replaceChildren(frag);
        },
        entry(entry) {
            const d = window.dyhatj;
            const item = entry.item;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3 mb-3', 'data-id': item.id });
            const kind = { post: item.kind === 'tip' ? 'Tip' : 'Shared job', comment: 'Comment', listing: item.kind === 'sponsored' ? 'Sponsored listing' : 'Feed listing' }[entry.targetType];
            paper.appendChild(webui.create('strong', { text: `${kind} · ${item.status === 'hidden' ? 'hidden' : item.status === 'removed' ? 'removed' : 'still showing'} · ${entry.reports.length} open report${entry.reports.length === 1 ? '' : 's'}` }));
            if (item.title) {
                const href = entry.targetType === 'comment' ? '' : `/${item.kind === 'tip' ? 'tip' : 'job'}/${item.id}`;
                const h = webui.create('h3', { class: 'my-1' });
                h.appendChild(href ? webui.create('a', { href, text: item.title }) : webui.create('span', { text: item.title }));
                paper.appendChild(h);
            }
            if (entry.targetType === 'comment') paper.appendChild(webui.create('a', { href: `/job/${item.postId}`, text: 'Open the post this comment is on', class: 'd-block' }));
            paper.appendChild(d.paragraphs(item.body || item.note || item.summary || ''));
            paper.appendChild(webui.create('small', { text: `By ${item.authorName || item.company || 'unknown'}${item.createdAt ? ` · ${d.timeAgo(item.createdAt)}` : ''}${item.hiddenReason === 'reports' ? ' · hidden automatically after reports' : ''}`, class: 'd-block' }));
            if (entry.reports.length) {
                const list = webui.create('ul');
                entry.reports.forEach(r => list.appendChild(webui.create('li', { text: `${d.nameOf(d.reportReasons, r.reason)}${r.details ? `: ${r.details}` : ''} (${d.timeAgo(r.createdAt)})` })));
                paper.appendChild(list);
            }
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { gap: '2', justify: 'end', wrap: '' });
            [['keep', 'success', 'check', 'Keep and dismiss reports'], ['hide', 'warning', 'eye|ban', 'Hide'], ['remove', 'danger', 'trash', 'Remove for good']].forEach(([action, theme, icon, label]) => {
                const b = webui.create('webui-button', { theme, 'start-icon': icon, text: label, 'data-action': action });
                b.addEventListener('click', async () => {
                    try { await d.api.request('POST', `moderation/${entry.targetType}/${item.id}`, { action }); } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
                });
                buttons.appendChild(b);
            });
            paper.append(alert, buttons);
            return paper;
        },
    });
}
