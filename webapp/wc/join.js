/* Shown in place of a feature the visitor can't use yet.
 * <app-join feature="post" action="share a job"></app-join>
 * Guests are asked to sign in. Signed-in visitors without a profile create one (display name, age, guidelines).
 * Signed-in visitors who lack the feature's role are told so. When nothing is missing it renders nothing.
 * Other components call dyhatj.needsJoin(feature) to decide whether to show it.
 */
"use strict"
{
    webui.define('app-join', {
        preload: 'app:store button flex paper input-text alert',
        attr: ['feature', 'action'],
        attrChanged() {
            if (this._ready) this.render();
        },
        connected() {
            const t = this;
            t._ready = true;
            t.addDataset('subscribe', 'session-user-role:render');
            t.render();
        },
        async render() {
            const t = this;
            const d = window.dyhatj;
            const feature = t.getAttribute('feature') || 'post';
            const action = t.getAttribute('action') || 'use this';
            const token = t._token = {};
            if (!d.isSignedIn()) {
                t.show('guest', () => t.message('user', `Sign in to ${action}`, 'Use the Sign In button at the top of the page. Reading jobs and tips never needs an account.'));
                return;
            }
            if (!d.can(feature)) {
                t.show('role', () => t.message('lock', 'Your account doesn\'t have access to this', 'This part of the site is for moderators.'));
                return;
            }
            let me;
            try {
                me = await d.api.request('GET', 'me');
            } catch (ex) {
                if (token !== t._token) return;
                t.show('error', () => t.message('triangle_exclamation', 'Couldn\'t open your data', d.message(ex)));
                return;
            }
            if (token !== t._token) return;
            if (!me.profile) {
                t.show('setup', () => t.setup(action));
                return;
            }
            t.show('ready', () => []);
        },
        show(state, build) {
            const t = this;
            if (t._state === state) return;
            t._state = state;
            t.replaceChildren(...build());
        },
        message(icon, title, detail) {
            return [webui.create('webui-paper', { class: 'elevation-5 pa-3' })].map(paper => {
                const row = webui.create('webui-flex', { align: 'center', gap: '3' });
                row.appendChild(webui.create('webui-icon', { icon: `circle_${icon}|backing|inverted|theme:info`, width: '32' }));
                const words = webui.create('div');
                words.appendChild(webui.create('strong', { text: title }));
                words.appendChild(webui.create('div', { text: detail }));
                row.appendChild(words);
                paper.appendChild(row);
                return paper;
            });
        },
        setup(action) {
            const t = this;
            const d = window.dyhatj;
            const form = webui.create('form', { class: 'd-flex', style: 'flex-direction:column;gap:var(--padding)' });
            form.appendChild(webui.create('h3', { text: `Create your profile to ${action}` }));
            form.appendChild(webui.create('p', { text: 'Your display name is shown on everything you share. Use a first name and initial, or a nickname. Don\'t use your full name or contact details.' }));
            const name = webui.create('webui-input-text', { label: 'Display name', name: 'displayName', maxlength: `${d.limits.displayName}`, placeholder: 'Sam O.' });
            const headline = webui.create('webui-input-text', { label: 'Headline (optional)', name: 'headline', maxlength: `${d.limits.headline}`, placeholder: 'Line cook looking for a sous chef role' });
            form.append(name, headline);
            const check = (key, html) => {
                const label = webui.create('label', { class: 'd-flex', style: 'gap:var(--padding);align-items:flex-start' });
                const box = webui.create('input', { type: 'checkbox', name: key });
                label.appendChild(box);
                label.appendChild(webui.create('span', { html }));
                form.appendChild(label);
                return box;
            };
            const age = check('confirmAge', 'I am at least 16 years old.');
            const accept = check('acceptGuidelines', 'I agree to the <a href="/guidelines">Community Guidelines</a> and the <a href="/terms">Terms</a>, and I have read the <a href="/privacy">Privacy Policy</a>.');
            const alert = webui.create('webui-alert', { variant: 'danger' });
            form.appendChild(alert);
            const buttons = webui.create('webui-flex', { justify: 'end' });
            buttons.appendChild(webui.create('webui-button', { type: 'submit', theme: 'primary', 'start-icon': 'user-check', text: 'Create profile' }));
            form.appendChild(buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                try {
                    await d.api.request('POST', 'me', { displayName: name.value, headline: headline.value, confirmAge: age.checked, acceptGuidelines: accept.checked });
                    d.emit('profile', {});
                } catch (ex) {
                    alert.setValue(webui.escapeHtml(d.message(ex)));
                }
            });
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3' });
            paper.appendChild(form);
            return [paper];
        },
    });
}
