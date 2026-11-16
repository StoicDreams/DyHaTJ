/* Employers post a sponsored listing, pay for it (simulated: nothing is charged), and manage their listings.
 * <app-employer></app-employer>
 */
"use strict"
{
    const options = list => JSON.stringify(list.map(i => ({ id: i.id, display: i.name })));
    const statusNames = { 'pending-payment': 'Waiting for payment', active: 'Live', closed: 'Closed', removed: 'Removed by a moderator' };
    webui.define('app-employer', {
        preload: 'app:store app:join app:post-card button flex paper input-text input-message dropdown alert',
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
            const access = await d.access('employer').catch(() => 'error');
            if (token !== t._token) return;
            if (access !== 'ready') {
                t.replaceChildren(webui.create('app-join', { feature: 'employer', action: 'post a sponsored listing' }));
                return;
            }
            let listings;
            try {
                listings = await d.api.request('GET', 'employer/listings');
            } catch (ex) {
                t.replaceChildren(webui.create('webui-alert', { variant: 'danger', show: '', text: d.message(ex) }));
                return;
            }
            if (token !== t._token) return;
            const frag = document.createDocumentFragment();
            frag.appendChild(webui.create('h2', { text: 'Your listings' }));
            if (!listings.length) frag.appendChild(webui.create('p', { text: 'You have no listings yet.' }));
            listings.forEach(l => frag.appendChild(t.listing(l)));
            frag.appendChild(webui.create('h2', { text: 'Post a sponsored listing' }));
            // The same form is kept across refreshes, so a refresh doesn't clear what the employer is typing.
            if (!t._form) t._form = t.form();
            frag.appendChild(t._form);
            t.replaceChildren(frag);
        },
        listing(l) {
            const t = this;
            const d = window.dyhatj;
            const wrap = webui.create('div', { 'data-id': l.id });
            const status = statusNames[l.status] || l.status;
            const ends = l.status === 'active' && l.expiresAt ? `, until ${new Date(l.expiresAt).toLocaleDateString()}` : '';
            wrap.appendChild(webui.create('strong', { text: `Status: ${status}${ends}` }));
            const card = webui.create('app-post-card');
            card.item = l;
            wrap.appendChild(card);
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { gap: '2', justify: 'end', class: 'mb-4' });
            if (l.status === 'pending-payment') {
                const pay = webui.create('webui-button', { theme: 'success', 'start-icon': 'credit-card', text: 'Simulate payment and publish' });
                pay.addEventListener('click', async () => {
                    try { await d.api.request('POST', `employer/listings/${l.id}/pay`); t.refresh(); } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
                });
                buttons.appendChild(pay);
            }
            if (l.status === 'active' || l.status === 'pending-payment') {
                const close = webui.create('webui-button', { theme: 'danger', 'start-icon': 'xmark', text: 'Close listing' });
                close.addEventListener('click', async () => {
                    try { await d.api.request('POST', `employer/listings/${l.id}/close`); t.refresh(); } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
                });
                buttons.appendChild(close);
            }
            wrap.append(alert, buttons);
            return wrap;
        },
        form() {
            const t = this;
            const d = window.dyhatj;
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3' });
            const form = webui.create('form', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            const f = {
                title: webui.create('webui-input-text', { label: 'Job title', maxlength: `${d.limits.title}` }),
                company: webui.create('webui-input-text', { label: 'Company', maxlength: `${d.limits.company}` }),
                location: webui.create('webui-input-text', { label: 'Location', maxlength: `${d.limits.location}`, placeholder: 'City, State or Remote (US)' }),
                workplace: webui.create('webui-dropdown', { label: 'Workplace', options: options(d.workplaces) }),
                type: webui.create('webui-dropdown', { label: 'Job type', options: options(d.jobTypes) }),
                payMin: webui.create('webui-input-text', { label: 'Lowest pay', type: 'number', min: '0' }),
                payMax: webui.create('webui-input-text', { label: 'Highest pay', type: 'number', min: '0' }),
                payPeriod: webui.create('webui-dropdown', { label: 'Per', options: JSON.stringify([{ id: 'year', display: 'Year' }, { id: 'hour', display: 'Hour' }]) }),
                summary: webui.create('webui-input-message', { label: 'Description', placeholder: 'What the job is, who it suits, and what is required' }),
                url: webui.create('webui-input-text', { label: 'Application link', type: 'url', placeholder: 'https://' }),
                contactEmail: webui.create('webui-input-text', { label: 'Billing email', type: 'email' }),
            };
            const row = (...els) => { const r = webui.create('webui-flex', { gap: '3', wrap: '' }); r.append(...els); return r; };
            const plan = d.listingPlans[0];
            const attest = webui.create('input', { type: 'checkbox', name: 'attest' });
            const attestLabel = webui.create('label', { class: 'd-flex', style: 'gap:var(--padding);align-items:flex-start' });
            attestLabel.append(attest, webui.create('span', { text: 'I am authorized to post this job for this employer. The job is real and open, applicants are never charged a fee, the pay range is accurate, and the listing follows equal employment opportunity and pay transparency laws where the job is located.' }));
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'primary', 'start-icon': 'bullhorn', text: 'Continue to payment' }));
            form.append(f.title, f.company, f.location, row(f.workplace, f.type), row(f.payMin, f.payMax, f.payPeriod), f.summary, f.url, f.contactEmail,
                webui.create('webui-alert', { variant: 'info', show: '', text: `${plan.name} listing: ${plan.description} Price: not set yet. Payment in this preview is simulated and nothing is charged.` }),
                attestLabel, alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                const body = { plan: plan.id, attest: attest.checked };
                Object.keys(f).forEach(k => body[k] = f[k].value);
                try {
                    await d.api.request('POST', 'employer/listings', body);
                    t._form = null;
                    t.refresh();
                } catch (ex) { alert.setValue(webui.escapeHtml(d.message(ex))); }
            });
            paper.appendChild(form);
            return paper;
        },
    });
}
