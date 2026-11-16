/* Share a job or a tip with the community.
 * <app-share-form kind="job|tip"></app-share-form>  With no kind, the visitor picks one.
 */
"use strict"
{
    const options = list => JSON.stringify(list.map(i => ({ id: i.id, display: i.name })));
    webui.define('app-share-form', {
        preload: 'app:store app:join button flex paper input-text input-message dropdown alert',
        attr: ['kind'],
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
            // Only the profile matters here. Rebuilding on every data change would clear a half-written post.
            t._off = window.dyhatj.on('profile', () => t.refresh());
        },
        async refresh() {
            const t = this;
            const d = window.dyhatj;
            const token = t._token = {};
            let access;
            try { access = await d.access('post'); } catch (ex) { access = 'error'; }
            if (token !== t._token || access === t._state) return;
            t._state = access;
            if (access !== 'ready') {
                t.replaceChildren(webui.create('app-join', { feature: 'post', action: 'share jobs and tips' }));
                return;
            }
            t.replaceChildren(t.build());
        },
        build() {
            const t = this;
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3' });
            const form = webui.create('form', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const fixed = t.getAttribute('kind');
            const kind = webui.create('webui-dropdown', { label: 'What are you sharing?', options: JSON.stringify([{ id: 'job', display: 'A job I heard about' }, { id: 'tip', display: 'A job search tip' }]) });
            const jobFields = webui.create('div', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const tipFields = webui.create('div', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const f = {
                title: webui.create('webui-input-text', { label: 'Job title', maxlength: `${d.limits.title}`, placeholder: 'Prep Cook' }),
                company: webui.create('webui-input-text', { label: 'Company', maxlength: `${d.limits.company}`, placeholder: 'Who is hiring?' }),
                location: webui.create('webui-input-text', { label: 'Location', maxlength: `${d.limits.location}`, placeholder: 'City, State or Remote (US)' }),
                workplace: webui.create('webui-dropdown', { label: 'Workplace', options: options(d.workplaces) }),
                type: webui.create('webui-dropdown', { label: 'Job type', options: options(d.jobTypes) }),
                pay: webui.create('webui-input-text', { label: 'Pay (optional)', maxlength: `${d.limits.pay}`, placeholder: '$20 an hour' }),
                url: webui.create('webui-input-text', { label: 'Link to the job post (optional)', type: 'url', maxlength: `${d.limits.url}`, placeholder: 'https://' }),
                note: webui.create('webui-input-message', { label: 'Why it\'s worth a look', placeholder: 'How did you hear about it? What should people know before applying?' }),
                category: webui.create('webui-dropdown', { label: 'Topic', options: options(d.tipCategories) }),
                tipTitle: webui.create('webui-input-text', { label: 'Title', maxlength: `${d.limits.title}`, placeholder: 'Practice your answers out loud' }),
                body: webui.create('webui-input-message', { label: 'Your tip', placeholder: 'What worked for you? Leave a blank line between paragraphs.' }),
            };
            const row = (...els) => { const r = webui.create('webui-flex', { gap: '3', wrap: '' }); r.append(...els); return r; };
            jobFields.append(f.title, f.company, f.location, row(f.workplace, f.type), f.pay, f.url, f.note,
                webui.create('small', { text: 'Only share jobs that are open to anyone. Never post a job that asks applicants to pay, buy equipment, or share bank details.' }));
            tipFields.append(f.category, f.tipTitle, f.body,
                webui.create('small', { text: 'Share what worked for you. Tips are community advice, not legal, tax, or financial advice.' }));
            const show = value => {
                const tip = value === 'tip';
                jobFields.style.display = tip ? 'none' : '';
                tipFields.style.display = tip ? '' : 'none';
            };
            kind.addEventListener('change', () => show(kind.value));
            if (fixed) kind.setAttribute('value', fixed);
            else form.appendChild(kind);
            show(fixed || 'job');
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'primary', 'start-icon': 'share', text: 'Share' }));
            form.append(jobFields, tipFields, webui.create('small', { html: 'Everything you share is public. Please follow the <a href="/guidelines">Community Guidelines</a>.' }), alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                const which = fixed || kind.value || 'job';
                const body = which === 'tip'
                    ? { kind: 'tip', category: f.category.value, title: f.tipTitle.value, body: f.body.value }
                    : { kind: 'job', title: f.title.value, company: f.company.value, location: f.location.value, workplace: f.workplace.value, type: f.type.value, pay: f.pay.value, url: f.url.value, note: f.note.value };
                try {
                    const post = await d.api.request('POST', 'posts', body);
                    webui.navigateTo(`/${which}/${post.id}`);
                } catch (ex) {
                    alert.setValue(webui.escapeHtml(d.message(ex)));
                }
            });
            paper.appendChild(form);
            return paper;
        },
    });
}
