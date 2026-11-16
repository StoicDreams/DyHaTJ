/* Comments on a shared job or tip, with a form to add one.
 * <app-comments post-id="p-..."></app-comments>
 */
"use strict"
{
    webui.define('app-comments', {
        preload: 'app:store app:report app:join button flex paper input-message alert',
        attr: ['post-id'],
        attrChanged() {
            if (this._ready) this.refresh();
        },
        connected() {
            const t = this;
            t._ready = true;
            t._list = webui.create('div', { 'aria-live': 'polite' });
            t._form = webui.create('div');
            t.replaceChildren(webui.create('h2', { text: 'Comments' }), t._list, t._form);
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
            const id = t.getAttribute('post-id');
            if (!id || !t._list) return;
            const token = t._token = {};
            let comments, access;
            try {
                [comments, access] = await Promise.all([d.api.request('GET', `posts/${id}/comments`), d.access('comment')]);
            } catch (ex) {
                if (token !== t._token) return;
                t._list.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            const frag = document.createDocumentFragment();
            if (!comments.length) frag.appendChild(webui.create('p', { text: 'No comments yet.' }));
            comments.forEach(c => frag.appendChild(t.comment(c)));
            t._list.replaceChildren(frag);
            if (access !== 'ready') {
                if (t._formState !== access) t._form.replaceChildren(webui.create('app-join', { feature: 'comment', action: 'comment' }));
            } else if (t._formState !== 'ready') {
                t._form.replaceChildren(t.form(id));
            }
            t._formState = access;
        },
        comment(c) {
            const t = this;
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-2 pa-2 mb-2', 'data-id': c.id });
            const head = webui.create('small', { text: `${c.authorName} · ${d.timeAgo(c.createdAt)}${c.sample ? ' · sample' : ''}${c.status === 'hidden' ? ' · hidden while a moderator reviews it' : ''}`, style: 'opacity:0.8' });
            paper.append(head, d.paragraphs(c.body));
            const actions = webui.create('webui-flex', { gap: '2', justify: 'end' });
            const extra = webui.create('div');
            if (c.mine || d.can('moderate')) {
                const del = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Delete' });
                del.addEventListener('click', async () => {
                    if (!del.getAttribute('data-confirm')) {
                        del.setAttribute('data-confirm', '1');
                        del.innerText = 'Click again to delete';
                        return;
                    }
                    try { await d.api.request('DELETE', `comments/${c.id}`); } catch (ex) { extra.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) })); }
                });
                actions.appendChild(del);
            }
            if (!c.mine) {
                const report = webui.create('webui-button', { theme: 'warning', 'start-icon': 'flag', text: 'Report' });
                report.addEventListener('click', async () => {
                    if (extra.firstChild) { extra.replaceChildren(); return; }
                    const access = await d.access('report');
                    extra.replaceChildren(access === 'ready'
                        ? webui.create('app-report', { 'target-type': 'comment', 'target-id': c.id })
                        : webui.create('app-join', { feature: 'report', action: 'report comments' }));
                });
                actions.appendChild(report);
            }
            paper.append(actions, extra);
            return paper;
        },
        form(id) {
            const d = window.dyhatj;
            const form = webui.create('form', { class: 'd-flex mt-3', style: 'flex-direction:column;gap:var(--padding)' });
            const body = webui.create('webui-input-message', { label: 'Add a comment', placeholder: 'Did you apply? Know something useful about this?' });
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'primary', 'start-icon': 'send', text: 'Post comment' }));
            form.append(body, webui.create('small', { text: 'Be kind and stay on topic. Don\'t share phone numbers, addresses, or other personal details.' }), alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                try {
                    await d.api.request('POST', `posts/${id}/comments`, { body: body.value });
                    body.value = '';
                    alert.removeAttribute('show');
                } catch (ex) {
                    alert.setValue(webui.escapeHtml(d.message(ex)));
                }
            });
            return form;
        },
    });
}
