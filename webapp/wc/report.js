/* Report form for a post, comment, or listing. Opened from a card's or comment's Report button.
 * <app-report target-type="post|comment|listing" target-id="p-..."></app-report>
 */
"use strict"
{
    webui.define('app-report', {
        preload: 'app:store button flex dropdown input-message alert',
        attr: ['target-type', 'target-id'],
        connected() {
            const t = this;
            const d = window.dyhatj;
            const form = webui.create('form', { class: 'd-flex mt-2', style: 'flex-direction:column;gap:var(--padding)' });
            form.appendChild(webui.create('strong', { text: 'What\'s wrong with it?' }));
            const reason = webui.create('webui-dropdown', { label: 'Reason', options: JSON.stringify(d.reportReasons.map(r => ({ id: r.id, display: r.name }))) });
            const details = webui.create('webui-input-message', { label: 'Details (optional, required for "Something else")', placeholder: 'What should a moderator know?' });
            const alert = webui.create('webui-alert', { variant: 'danger' });
            const buttons = webui.create('webui-flex', { justify: 'end', gap: '2' });
            const cancel = webui.create('webui-button', { theme: 'secondary', text: 'Cancel' });
            cancel.addEventListener('click', () => t.remove());
            buttons.append(cancel, webui.create('webui-button', { type: 'submit', theme: 'warning', 'start-icon': 'flag', text: 'Send report' }));
            form.append(reason, details, webui.create('small', { text: 'Reports are private. Three reports hide a post until a moderator reviews it. If someone is in danger, contact local emergency services.' }), alert, buttons);
            form.addEventListener('submit', async ev => {
                ev.preventDefault();
                if (details.value.length > d.limits.reportDetails) {
                    alert.setValue(`Details must be ${d.limits.reportDetails} characters or fewer.`);
                    return;
                }
                try {
                    await d.api.request('POST', 'reports', { targetType: t.getAttribute('target-type'), targetId: t.getAttribute('target-id'), reason: reason.value, details: details.value });
                    t.replaceChildren(webui.create('webui-alert', { variant: 'success', show: '', text: 'Thanks. A moderator will review your report.' }));
                } catch (ex) {
                    alert.setValue(webui.escapeHtml(d.message(ex)));
                }
            });
            t.replaceChildren(form);
        },
    });
}
