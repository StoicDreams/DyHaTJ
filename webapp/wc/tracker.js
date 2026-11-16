/* The visitor's application tracker: saved jobs, where each application stands, notes, and a follow-up date.
 * Jobs are added from Save to tracker on any job, or by hand for jobs found elsewhere.
 * <app-tracker></app-tracker>
 */
"use strict"
{
    webui.define('app-tracker', {
        preload: 'app:store app:join button flex paper input-text input-message dropdown alert',
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
            const access = await d.access('tracker').catch(() => 'error');
            if (token !== t._token) return;
            if (access !== 'ready') {
                t.replaceChildren(webui.create('app-join', { feature: 'tracker', action: 'track your applications' }));
                return;
            }
            let entries;
            try {
                entries = await d.api.request('GET', 'tracker');
            } catch (ex) {
                t.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            const frag = document.createDocumentFragment();
            const counts = d.trackerStatuses.map(s => `${s.name}: ${entries.filter(e => e.status === s.id).length}`).join(' · ');
            frag.appendChild(webui.create('p', { text: entries.length ? counts : 'Nothing saved yet. Use Save to tracker on any job, or add one you found elsewhere below.', role: 'status' }));
            const today = new Date().toISOString().slice(0, 10);
            entries.forEach(e => frag.appendChild(t.entry(e, today)));
            // The same form is kept across refreshes, so a refresh doesn't clear what the visitor is typing.
            if (!t._addForm) t._addForm = t.addForm();
            frag.appendChild(t._addForm);
            t.replaceChildren(frag);
        },
        entry(e, today) {
            const t = this;
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3 mb-3', 'data-id': e.id });
            const title = webui.create('h3', { class: 'my-1' });
            if (e.refId) title.appendChild(webui.create('a', { href: `/job/${e.refId}`, text: e.title }));
            else title.innerText = e.title;
            paper.append(title, webui.create('div', { text: [e.company, e.location].filter(Boolean).join(' · '), style: 'font-weight:600' }));
            if (e.url) paper.appendChild(d.outLink(e.url, 'Job post'));
            if (e.followUp && e.followUp <= today && !['offer', 'closed'].includes(e.status)) {
                paper.appendChild(webui.create('webui-alert', { variant: 'warning', show: '', text: `Follow up is due (${e.followUp}).` }));
            }
            const row = webui.create('webui-flex', { gap: '3', wrap: '', align: 'end', class: 'mt-2' });
            const status = webui.create('webui-dropdown', { label: 'Status', value: e.status, options: JSON.stringify(d.trackerStatuses.map(s => ({ id: s.id, display: s.name }))) });
            const follow = webui.create('webui-input-text', { label: 'Follow up on', type: 'date', value: e.followUp || '' });
            row.append(status, follow);
            const notes = webui.create('webui-input-message', { label: 'Notes', value: e.notes || '', placeholder: 'Who you talked to, interview dates, questions to ask' });
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { gap: '2', justify: 'end', class: 'mt-2' });
            const save = webui.create('webui-button', { theme: 'primary', 'start-icon': 'save', text: 'Save changes' });
            const remove = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Remove' });
            save.addEventListener('click', async () => {
                try {
                    await d.api.request('POST', `tracker/${e.id}`, { status: status.value, followUp: follow.value, notes: notes.value });
                    t.refresh();
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            remove.addEventListener('click', async () => {
                if (!remove.getAttribute('data-confirm')) {
                    remove.setAttribute('data-confirm', '1');
                    remove.innerText = 'Click again to remove';
                    return;
                }
                try {
                    await d.api.request('DELETE', `tracker/${e.id}`);
                    t.refresh();
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            buttons.append(remove, save);
            paper.append(row, notes, alert, buttons);
            return paper;
        },
        addForm() {
            const t = this;
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-2 pa-3' });
            const form = webui.create('form', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const title = webui.create('webui-input-text', { label: 'Job title', maxlength: `${d.limits.title}` });
            const company = webui.create('webui-input-text', { label: 'Company', maxlength: `${d.limits.company}` });
            const location = webui.create('webui-input-text', { label: 'Location (optional)', maxlength: `${d.limits.location}` });
            const url = webui.create('webui-input-text', { label: 'Link (optional)', type: 'url', placeholder: 'https://' });
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'secondary', 'start-icon': 'plus', text: 'Add to tracker' }));
            form.append(webui.create('h3', { text: 'Add a job you found elsewhere', class: 'my-1' }), title, company, location, url,
                webui.create('small', { text: 'Your tracker is private. Only you can see it.' }), alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                try {
                    await d.api.request('POST', 'tracker', { title: title.value, company: company.value, location: location.value, url: url.value });
                    [title, company, location, url].forEach(f => f.value = '');
                    alert.removeAttribute('show');
                    t.refresh();
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            paper.appendChild(form);
            return paper;
        },
    });
}
