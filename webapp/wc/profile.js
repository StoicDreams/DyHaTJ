/* The visitor's profile: display name and headline, their posts, and their data (download or delete it).
 * On localhost only, it also has preview tools: a role picker for testing moderator features (the framework's
 * simulated sign-in only gives role 1) and a reset that reloads the sample data.
 * <app-profile></app-profile>
 */
"use strict"
{
    webui.define('app-profile', {
        preload: 'app:store app:join app:post-list button flex paper input-text alert switch',
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
            t._off = window.dyhatj.on('profile', () => t.refresh());
        },
        async refresh() {
            const t = this;
            const d = window.dyhatj;
            const token = t._token = {};
            const access = await d.access('post').catch(() => 'error');
            if (token !== t._token) return;
            const parts = [];
            if (access !== 'ready') {
                parts.push(webui.create('app-join', { feature: 'post', action: 'set up your profile' }));
            } else {
                const me = await d.api.request('GET', 'me');
                if (token !== t._token) return;
                parts.push(t.details(me.profile));
                parts.push(webui.create('h2', { text: 'What you shared' }));
                parts.push(webui.create('app-post-list', { mine: '', empty: 'You haven\'t shared anything yet.' }));
                parts.push(t.data());
            }
            if (webui.isLocalhost) parts.push(t.devTools());
            t.replaceChildren(...parts);
        },
        details(profile) {
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3 mb-3' });
            const form = webui.create('form', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const name = webui.create('webui-input-text', { label: 'Display name', value: profile.displayName, maxlength: `${d.limits.displayName}` });
            const headline = webui.create('webui-input-text', { label: 'Headline', value: profile.headline || '', maxlength: `${d.limits.headline}` });
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'primary', 'start-icon': 'save', text: 'Save profile' }));
            form.append(name, headline, webui.create('small', { text: `Member since ${new Date(profile.createdAt).toLocaleDateString()}. Your display name shows on everything you share.` }), alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                try {
                    await d.api.request('POST', 'me', { displayName: name.value, headline: headline.value });
                    alert.setAttribute('variant', 'success');
                    alert.setValue('Saved.');
                } catch (ex) {
                    alert.setAttribute('variant', 'danger');
                    alert.setValue(webui.escapeHtml(d.message(ex)));
                }
            });
            paper.appendChild(form);
            return paper;
        },
        data() {
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3 my-3' });
            paper.appendChild(webui.create('h2', { text: 'Your data', class: 'mt-0' }));
            paper.appendChild(webui.create('p', { text: 'Download a copy of everything you\'ve added, or delete it all. Deleting removes your profile, posts, comments, votes, reports, tracker, and listings, and can\'t be undone.' }));
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { gap: '2', wrap: '' });
            const exportButton = webui.create('webui-button', { theme: 'secondary', 'start-icon': 'download', text: 'Download my data' });
            exportButton.addEventListener('click', async () => {
                try {
                    const data = await d.api.request('GET', 'me/export');
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const a = webui.create('a', { href: URL.createObjectURL(blob), download: 'did-you-hear-about-this-job-data.json' });
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            const del = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Delete my data' });
            del.addEventListener('click', async () => {
                if (!del.getAttribute('data-confirm')) {
                    del.setAttribute('data-confirm', '1');
                    del.innerText = 'Click again to delete everything';
                    return;
                }
                try {
                    await d.api.request('DELETE', 'me');
                    d.emit('profile', {});
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            buttons.append(exportButton, del);
            paper.append(buttons, alert);
            return paper;
        },
        // Localhost only. Never shown or usable on the live site.
        devTools() {
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-2 pa-3 my-3', 'data-dev-tools': '' });
            paper.appendChild(webui.create('h2', { text: 'Preview tools (localhost only)', class: 'mt-0' }));
            paper.appendChild(webui.create('p', { text: 'Data in this preview lives in this browser\'s IndexedDB. Use these to test roles and start over.' }));
            const buttons = webui.create('webui-flex', { gap: '2', wrap: '' });
            const role = parseInt(webui.getData('session-user-role')) || 0;
            const isMod = (role & d.ROLES.moderator) === d.ROLES.moderator;
            const mod = webui.create('webui-button', { theme: isMod ? 'warning' : 'info', 'start-icon': 'shield', text: isMod ? 'Remove moderator role' : 'Add moderator role' });
            mod.addEventListener('click', () => {
                if (!webui.isLocalhost) return;
                const current = parseInt(webui.getData('session-user-role')) || 0;
                if (!(current & d.ROLES.user)) return;
                webui.setData('session-user-role', current ^ d.ROLES.moderator);
            });
            if (!(role & d.ROLES.user)) mod.setAttribute('disabled', '');
            const reset = webui.create('webui-button', { theme: 'danger', 'start-icon': 'refresh', text: 'Reset preview data' });
            reset.addEventListener('click', async () => {
                if (!reset.getAttribute('data-confirm')) {
                    reset.setAttribute('data-confirm', '1');
                    reset.innerText = 'Click again to reset';
                    return;
                }
                await d.api.request('POST', 'dev/reset');
                d.emit('profile', {});
            });
            buttons.append(mod, reset);
            paper.appendChild(buttons);
            return paper;
        },
    });
}
