/* One job listing, shared job, or tip, with its actions.
 * Set the data before adding it to the page: const card = webui.create('app-post-card'); card.item = post;
 * Add the "full" flag on detail pages to show all of a tip and hide the link to the post itself.
 * Listings (id l-...) come from the job feed or are sponsored. Posts (id p-...) are shared by the community.
 */
"use strict"
{
    webui.define('app-post-card', {
        preload: 'app:store app:report app:join button flex paper icon',
        flags: ['full'],
        props: {
            item: {
                get() { return this._item; },
                set(v) {
                    this._item = v;
                    if (this._ready) this.render();
                },
            },
        },
        connected() {
            const t = this;
            t._ready = true;
            if (t._item) t.render();
        },
        render() {
            const t = this;
            const d = window.dyhatj;
            const item = t._item;
            const isListing = item.id.startsWith('l-');
            const isTip = item.kind === 'tip';
            const sponsored = item.kind === 'sponsored';
            const detailUrl = `/${isTip ? 'tip' : 'job'}/${item.id}`;
            const paper = webui.create('webui-paper', { class: `elevation-${sponsored ? 10 : 5} pa-3 mb-3`, 'data-id': item.id });
            if (sponsored) paper.setAttribute('style', 'border-left:4px solid var(--color-title)');

            const badges = [];
            if (sponsored) badges.push(['Sponsored', 'title', 'bullhorn']);
            if (item.sample) badges.push(['Sample data', 'info', 'potion']);
            if (item.stale) badges.push(['May be filled', 'warning', 'hourglass']);
            if (item.status === 'hidden') badges.push(['Hidden while a moderator reviews it', 'danger', 'eye|ban']);
            if (isTip) badges.push([d.nameOf(d.tipCategories, item.category), 'secondary', (d.tipCategories.find(c => c.id === item.category) || {}).icon || 'lightbulb']);
            if (badges.length) {
                const row = webui.create('webui-flex', { gap: '2', wrap: '', class: 'mb-1', style: 'font-size:0.85em' });
                badges.forEach(([label, theme, icon]) => {
                    const b = webui.create('span', { style: `color:var(--color-${theme});display:inline-flex;gap:0.3em;align-items:center` });
                    b.appendChild(webui.create('webui-icon', { icon }));
                    b.appendChild(webui.create('span', { text: label }));
                    row.appendChild(b);
                });
                paper.appendChild(row);
            }

            const heading = webui.create('h3', { class: 'my-1' });
            if (t.hasAttribute('full')) heading.innerText = item.title;
            else heading.appendChild(webui.create('a', { href: detailUrl, text: item.title }));
            paper.appendChild(heading);

            if (!isTip) {
                const facts = [item.company, item.location, d.nameOf(d.workplaces, item.workplace), d.nameOf(d.jobTypes, item.type), d.payText(item)].filter(Boolean);
                paper.appendChild(webui.create('div', { text: facts.join(' · '), style: 'font-weight:600' }));
            }
            const body = isTip ? item.body : (item.summary || item.note);
            if (body) {
                const wrap = webui.create('div', { class: 'my-2' });
                if (isTip && !t.hasAttribute('full') && body.length > 260) {
                    wrap.appendChild(d.paragraphs(`${body.slice(0, 240).replace(/\s+\S*$/, '')}…`));
                } else {
                    wrap.appendChild(d.paragraphs(body));
                }
                paper.appendChild(wrap);
            }
            const byline = isListing
                ? `${item.source}${item.postedAt ? ` · posted ${d.timeAgo(item.postedAt)}` : ''}`
                : `Shared by ${item.authorName} · ${d.timeAgo(item.createdAt)}`;
            paper.appendChild(webui.create('small', { text: byline, style: 'opacity:0.8' }));

            const actions = webui.create('webui-flex', { gap: '2', wrap: '', align: 'center', class: 'mt-2' });
            if (!isListing) {
                const vote = webui.create('webui-button', {
                    theme: item.voted ? 'success' : 'info', 'start-icon': 'thumbs-up', 'aria-pressed': item.voted ? 'true' : 'false',
                    title: item.mine ? 'You can\'t vote for your own post' : 'Mark as helpful', text: `Helpful (${item.score})`,
                });
                if (item.mine) vote.setAttribute('disabled', '');
                else vote.addEventListener('click', () => t.act('vote', 'mark posts as helpful', () => d.api.request('POST', `posts/${item.id}/vote`, { helpful: !item.voted })));
                actions.appendChild(vote);
                if (!t.hasAttribute('full')) {
                    actions.appendChild(webui.create('webui-button', { theme: 'secondary', 'start-icon': 'comment', href: detailUrl, text: `Comments (${item.commentCount || 0})` }));
                }
            }
            if (!isTip) {
                const save = webui.create('webui-button', { theme: 'tertiary', 'start-icon': 'bookmark', text: 'Save to tracker' });
                save.addEventListener('click', () => t.act('tracker', 'save jobs to your tracker', async () => {
                    await d.api.request('POST', 'tracker', { refType: isListing ? 'listing' : 'post', refId: item.id });
                    save.innerText = 'Saved to tracker';
                    save.setAttribute('theme', 'success');
                }));
                actions.appendChild(save);
                if (item.url) {
                    actions.appendChild(d.outLink(item.url, isListing ? 'Apply on the employer\'s site' : 'Open the job post', sponsored));
                } else if (item.sample && isListing) {
                    actions.appendChild(webui.create('small', { text: 'Sample listing: no application link.' }));
                }
            }
            if (!item.mine && item.ownerId !== 'me') {
                const report = webui.create('webui-button', { theme: 'warning', 'start-icon': 'flag', text: 'Report' });
                report.addEventListener('click', () => t.toggleReport(isListing ? 'listing' : 'post'));
                actions.appendChild(report);
            }
            if (item.mine || (!isListing && d.can('moderate'))) {
                const del = webui.create('webui-button', { theme: 'danger', 'start-icon': 'trash', text: 'Delete' });
                del.addEventListener('click', () => t.confirmDelete(del));
                actions.appendChild(del);
            }
            paper.appendChild(actions);
            t._alert = webui.create('webui-alert', { variant: 'danger' });
            paper.appendChild(t._alert);
            t._extra = webui.create('div');
            paper.appendChild(t._extra);
            t.replaceChildren(paper);
        },
        // Runs an action, or shows what the visitor needs to do first.
        async act(feature, action, run) {
            const t = this;
            const d = window.dyhatj;
            if ((await d.access(feature)) !== 'ready') {
                t._extra.replaceChildren(webui.create('app-join', { feature, action }));
                return;
            }
            try {
                await run();
            } catch (ex) {
                t._alert.setValue(webui.escapeHtml(d.message(ex)));
            }
        },
        toggleReport(targetType) {
            const t = this;
            if (t._extra.querySelector('app-report')) {
                t._extra.replaceChildren();
                return;
            }
            t.act('report', 'report posts', () => {
                t._extra.replaceChildren(webui.create('app-report', { 'target-type': targetType, 'target-id': t._item.id }));
            });
        },
        confirmDelete(button) {
            const t = this;
            const d = window.dyhatj;
            if (button.getAttribute('data-confirm')) {
                t.act('read', 'delete', async () => {
                    await d.api.request('DELETE', `posts/${t._item.id}`);
                    if (t.hasAttribute('full')) webui.navigateTo(t._item.kind === 'tip' ? '/tips' : '/jobs');
                });
                return;
            }
            button.setAttribute('data-confirm', '1');
            button.innerText = 'Click again to delete';
        },
    });
}
