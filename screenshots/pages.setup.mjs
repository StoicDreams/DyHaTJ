import { expect } from '../tests/support/site.mjs';

// Did You Hear About This Job's setup for screenshots/pages.shots.mjs. Pages for signed-in visitors show a member,
// Jordan P., with a few saved applications, a shared tip, and reports to review, instead of the create-a-profile form.
// The data goes through the simulated API (window.dyhatj) into this test browser's IndexedDB only.

const memberPages = ['/tracker', '/profile', '/moderation'];

export async function prepare(page, route) {
    if (!memberPages.includes(route)) return;
    await page.waitForFunction(() => !!window.dyhatj);
    await page.evaluate(async route => {
        const d = window.dyhatj;
        await d.api.request('POST', 'me', { displayName: 'Jordan P.', headline: 'Line cook looking for a sous chef role', confirmAge: true, acceptGuidelines: true });
        if (route === '/tracker') {
            const saved = [];
            for (const id of ['l-1', 'l-19', 'l-2']) saved.push(await d.api.request('POST', 'tracker', { refType: 'listing', refId: id }));
            await d.api.request('POST', `tracker/${saved[0].id}`, { status: 'interviewing', notes: 'Second interview Thursday with the head chef.' });
            await d.api.request('POST', `tracker/${saved[1].id}`, { status: 'applied', followUp: '2026-11-09' });
        }
        if (route === '/profile') {
            await d.api.request('POST', 'posts', { kind: 'tip', category: 'interviews', title: 'Bring a clean apron to a kitchen trial', body: 'Many kitchens ask you to work a short trial shift. Show up early with your own knife and a clean apron.' });
        }
        if (route === '/moderation') {
            await d.api.request('POST', 'reports', { targetType: 'post', targetId: 'p-5', reason: 'filled', details: 'Applications closed in March.' });
            await d.api.request('POST', 'reports', { targetType: 'comment', targetId: 'c-2', reason: 'other', details: 'Not sure this is about the right company.' });
        }
        d.emit('profile', {});
    }, route);
    const component = { '/tracker': 'app-tracker', '/profile': 'app-profile', '/moderation': 'app-moderation' }[route];
    await expect(page.locator(`${component} [data-id]`).first()).toBeVisible();
    // The localhost preview tools are for development, not for pictures of the site.
    await page.evaluate(() => document.querySelectorAll('[data-dev-tools]').forEach(el => el.remove()));
    await page.evaluate(() => window.scrollTo(0, 0));
}
