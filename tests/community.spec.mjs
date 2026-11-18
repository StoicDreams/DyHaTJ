import { test, expect, openPage, signIn, expectSignedIn } from './support/site.mjs';

// The POC stores everything in IndexedDB through window.dyhatj (app-store). Each test gets a fresh browser context,
// so a fresh database with only the sample data.

const api = (page, method, path, body) => page.evaluate(([m, p, b]) => window.dyhatj.api.request(m, p, b), [method, path, body]);
const apiError = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
    try { await window.dyhatj.api.request(m, p, b); return null; } catch (ex) { return { status: ex.status, message: ex.message }; }
}, [method, path, body]);

async function member(page, route, roles = 1) {
    await signIn(page, roles);
    await openPage(page, route);
    await expectSignedIn(page, roles);
    await page.waitForFunction(() => !!window.dyhatj);
    await api(page, 'POST', 'me', { displayName: 'Test M.', confirmAge: true, acceptGuidelines: true });
    await page.evaluate(() => window.dyhatj.emit('profile', {}));
}

test.describe('app-store', () => {
    test('guests can read but not write', async ({ page }) => {
        await openPage(page, '/jobs');
        await page.waitForFunction(() => !!window.dyhatj);
        const posts = await api(page, 'POST', 'posts/query', { kind: 'job' });
        expect(posts.length).toBeGreaterThan(0);
        expect(posts.every(p => p.sample)).toBe(true);
        await expect(apiError(page, 'POST', 'posts', { kind: 'tip' })).resolves.toMatchObject({ status: 401 });
    });

    test('a profile needs the age and guidelines checks', async ({ page }) => {
        await signIn(page, 1);
        await openPage(page, '/share');
        await expectSignedIn(page, 1);
        await page.waitForFunction(() => !!window.dyhatj);
        await expect(apiError(page, 'POST', 'posts', { kind: 'tip' })).resolves.toMatchObject({ status: 428 });
        await expect(apiError(page, 'POST', 'me', { displayName: 'A', acceptGuidelines: true })).resolves.toMatchObject({ status: 400 });
        await expect(apiError(page, 'POST', 'me', { displayName: 'A', confirmAge: true })).resolves.toMatchObject({ status: 400 });
        const profile = await api(page, 'POST', 'me', { displayName: 'A', confirmAge: true, acceptGuidelines: true });
        expect(profile.acceptedGuidelinesAt).toBeTruthy();
    });

    test('posts are validated, rate limited, and links must be web addresses', async ({ page }) => {
        await member(page, '/share');
        await expect(apiError(page, 'POST', 'posts', { kind: 'job', title: 'Cook', company: 'X', location: 'Y', workplace: 'onsite', type: 'full-time', note: 'n', url: 'javascript:alert(1)' })).resolves
            .toMatchObject({ status: 400 });
        const job = { kind: 'job', title: 'Cook', company: 'X', location: 'Y', workplace: 'onsite', type: 'full-time', note: 'n', url: 'https://example.com/job' };
        await api(page, 'POST', 'posts', job);
        await expect(apiError(page, 'POST', 'posts', job)).resolves.toMatchObject({ status: 409 });
        for (let i = 1; i < 10; i++) await api(page, 'POST', 'posts', { kind: 'tip', category: 'interviews', title: `Tip ${i}`, body: 'Body' });
        await expect(apiError(page, 'POST', 'posts', { kind: 'tip', category: 'interviews', title: 'One more', body: 'Body' })).resolves.toMatchObject({ status: 429 });
    });

    test('three reports hide a post until a moderator keeps it', async ({ page }) => {
        await member(page, '/jobs');
        // Reports from three different people, simulated by switching the stored profile id between reports.
        for (const id of ['a', 'b', 'c']) {
            await page.evaluate(async id => {
                const req = indexedDB.open('dyhatj-poc');
                const db = await new Promise(r => { req.onsuccess = () => r(req.result); });
                await new Promise(r => { const tx = db.transaction('profiles', 'readwrite'); tx.objectStore('profiles').put({ id: 'me', displayName: id, createdAt: new Date().toISOString(), uid: id }); tx.oncomplete = r; });
                const reports = db.transaction('reports', 'readwrite').objectStore('reports');
                await new Promise(r => { const all = reports.getAll(); all.onsuccess = () => { all.result.forEach(x => { x.reporterId = `old-${x.id}`; reports.put(x); }); r(); }; });
            }, id);
            await api(page, 'POST', 'reports', { targetType: 'post', targetId: 'p-2', reason: 'scam' });
        }
        await expect(apiError(page, 'GET', 'posts/p-2')).resolves.toMatchObject({ status: 404 });
        await expect(apiError(page, 'GET', 'moderation/queue')).resolves.toMatchObject({ status: 403 });
        await page.evaluate(() => webui.setData('session-user-role', 17));
        const queue = await api(page, 'GET', 'moderation/queue');
        expect(queue[0]).toMatchObject({ targetId: 'p-2' });
        expect(queue[0].reports).toHaveLength(3);
        expect(queue[0].reports.some(r => 'reporterId' in r)).toBe(false);
        await api(page, 'POST', 'moderation/post/p-2', { action: 'keep' });
        expect((await api(page, 'GET', 'posts/p-2')).status).toBe('visible');
        await expect(api(page, 'GET', 'moderation/queue')).resolves.toEqual([]);
    });

    test('deleting my data removes everything I added', async ({ page }) => {
        await member(page, '/profile');
        const post = await api(page, 'POST', 'posts', { kind: 'tip', category: 'salary', title: 'Mine', body: 'Body' });
        await api(page, 'POST', 'posts/p-11/vote', { helpful: true });
        await api(page, 'POST', 'tracker', { refType: 'listing', refId: 'l-1' });
        const data = await api(page, 'GET', 'me/export');
        expect(data.posts).toHaveLength(1);
        expect(data.votes).toHaveLength(1);
        expect(data.tracker).toHaveLength(1);
        await api(page, 'DELETE', 'me');
        expect((await api(page, 'GET', 'me')).profile).toBeNull();
        await expect(apiError(page, 'GET', `posts/${post.id}`)).resolves.toMatchObject({ status: 404 });
        expect((await api(page, 'GET', 'posts/p-11')).score).toBe(18);
    });
});

test.describe('app-search-results', () => {
    test('a new search from the search page refreshes the results', async ({ page }) => {
        await openPage(page, '/search/nurse');
        await expect(page.locator('app-search-results')).toContainText('Registered Nurse');
        const job = page.locator('app-search webui-input-text[name="job"] input').first();
        await job.fill('electrician');
        await page.locator('app-search webui-button[type="submit"]').first().click();
        await page.waitForURL('**/search/electrician');
        await expect(page.locator('app-search-results')).toContainText('Electrician Apprentice');
        await expect(page.locator('app-search-results')).not.toContainText('Registered Nurse');
    });

    test('shows sponsored listings first, then the feed, then community shares', async ({ page }) => {
        await openPage(page, '/search/kitchen/NY');
        const results = page.locator('app-search-results');
        await expect(results.locator('h2')).toHaveText(['Sponsored', 'Job listings', 'Shared by the community']);
        await expect(results.locator('app-post-card').first()).toContainText('Kitchen Manager');
        await expect(results).toContainText('Line Cook');
        await expect(results).toContainText('Prep Cook, mornings only');
    });

    test('says when nothing matches', async ({ page }) => {
        await openPage(page, '/search/astronaut');
        await expect(page.locator('app-search-results')).toContainText('No matches yet');
    });
});

test.describe('app-post-list and app-post-card', () => {
    test('lists shared jobs with sample labels, and guests are asked to sign in to vote', async ({ page }) => {
        await openPage(page, '/jobs');
        const cards = page.locator('app-post-list app-post-card');
        await expect(cards).toHaveCount(5);
        await expect(cards.first()).toContainText('Sample data');
        await expect(page.locator('app-post-list')).toContainText('May be filled');
        await cards.first().locator('webui-button', { hasText: 'Helpful' }).click();
        await expect(cards.first().locator('app-join')).toContainText('Sign in to mark posts as helpful');
    });

    test('a member marks a tip helpful and the count goes up', async ({ page }) => {
        await member(page, '/tips');
        const card = page.locator('app-post-card', { hasText: 'Put your best match in the top third' });
        await card.locator('webui-button', { hasText: 'Helpful (18)' }).click();
        await expect(page.locator('app-post-card', { hasText: 'Put your best match' }).locator('webui-button', { hasText: 'Helpful (19)' })).toBeVisible();
    });

    test('tips filter by topic and sort by most helpful', async ({ page }) => {
        await openPage(page, '/tips');
        const list = page.locator('app-post-list');
        await list.locator('webui-dropdown').nth(1).evaluate(el => { el.value = 'salary'; el.dispatchEvent(new Event('change')); });
        await expect(list.locator('app-post-card')).toHaveCount(2);
        await list.locator('webui-dropdown').first().evaluate(el => { el.value = 'top'; el.dispatchEvent(new Event('change')); });
        await expect(list.locator('app-post-card').first()).toContainText('Look up the range');
    });
});

test.describe('app-post-detail, app-comments, and app-report', () => {
    test('a shared job has comments, and members can add one and report one', async ({ page }) => {
        await member(page, '/job/p-2');
        await expect(page.locator('app-post-detail h3')).toHaveText('Remote Customer Success Associate');
        const comments = page.locator('app-comments');
        await expect(comments.locator('webui-paper')).toHaveCount(2);
        await comments.locator('webui-input-message textarea').fill('Applying today!');
        await comments.locator('webui-button', { hasText: 'Post comment' }).click();
        await expect(comments.locator('webui-paper')).toHaveCount(3);
        await expect(comments).toContainText('Applying today!');
        await comments.locator('webui-paper').first().locator('webui-button', { hasText: 'Report' }).click();
        const report = comments.locator('app-report');
        await report.locator('webui-button', { hasText: 'Send report' }).click();
        await expect(report).toContainText('A moderator will review your report');
    });

    test('moving between two posts updates the page', async ({ page }) => {
        await openPage(page, '/tip/p-11');
        await expect(page.locator('app-post-detail h3')).toHaveText('Put your best match in the top third');
        await page.evaluate(() => window.dyhatj.go('/tip/p-13'));
        await expect(page.locator('app-post-detail h3')).toHaveText('Practice STAR answers out loud');
        await page.goBack();
        await expect(page.locator('app-post-detail h3')).toHaveText('Put your best match in the top third');
    });

    test('a missing post says so', async ({ page }) => {
        await openPage(page, '/job/p-missing');
        await expect(page.locator('app-post-detail')).toContainText('removed or never existed');
    });

    test('listings open without comments', async ({ page }) => {
        await openPage(page, '/job/l-5');
        await expect(page.locator('app-post-detail h3')).toHaveText('Junior Software Developer');
        await expect(page.locator('app-comments')).toHaveCount(0);
    });
});

test.describe('app-join and app-share-form', () => {
    test('guests are asked to sign in, and new members create a profile first', async ({ page }) => {
        await openPage(page, '/share');
        await expect(page.locator('app-join')).toContainText('Sign in to share jobs and tips');
        await page.evaluate(() => webui.setData('session-user-role', 1));
        const join = page.locator('app-join');
        await expect(join).toContainText('Create your profile');
        await join.locator('webui-input-text').first().locator('input').fill('Jo B.');
        await join.locator('webui-button', { hasText: 'Create profile' }).click();
        await expect(join.locator('webui-alert')).toContainText('at least 16');
        await join.locator('input[name="confirmAge"]').check();
        await join.locator('input[name="acceptGuidelines"]').check();
        await join.locator('webui-button', { hasText: 'Create profile' }).click();
        await expect(page.locator('app-share-form form')).toBeVisible();
    });

    test('sharing a tip opens its page', async ({ page }) => {
        await member(page, '/share');
        const form = page.locator('app-share-form');
        await form.locator('webui-dropdown').first().evaluate(el => { el.value = 'tip'; el.dispatchEvent(new Event('change')); });
        const visible = form.locator('webui-input-text:visible');
        await visible.first().locator('input').fill('Send a thank-you note');
        await form.locator('webui-input-message:visible textarea').fill('Within a day of the interview.');
        await form.locator('webui-button', { hasText: 'Share' }).click();
        await page.waitForURL(/\/tip\/p-/);
        await expect(page.locator('app-post-detail h3')).toHaveText('Send a thank-you note');
    });
});

test.describe('app-tracker', () => {
    test('saves a job from search and updates its status', async ({ page }) => {
        await member(page, '/search/nurse');
        const card = page.locator('app-post-card', { hasText: 'Registered Nurse' });
        await card.locator('webui-button', { hasText: 'Save to tracker' }).click();
        await expect(card.locator('webui-button', { hasText: 'Saved to tracker' })).toBeVisible();
        await page.evaluate(() => webui.navigateTo('/tracker'));
        const tracker = page.locator('app-tracker');
        await expect(tracker.locator('[data-id] h3')).toHaveText('Registered Nurse, Med-Surg');
        await tracker.locator('[data-id] webui-dropdown').evaluate(el => { el.value = 'applied'; });
        await tracker.locator('[data-id] webui-button', { hasText: 'Save changes' }).click();
        await expect(tracker.locator('p[role="status"]')).toContainText('Applied: 1');
    });

    test('adds a job found elsewhere', async ({ page }) => {
        await member(page, '/tracker');
        const tracker = page.locator('app-tracker');
        await expect(tracker.locator('p[role="status"]')).toContainText('Nothing saved yet');
        const fields = tracker.locator('form webui-input-text input');
        await fields.nth(0).fill('Barista');
        await fields.nth(1).fill('Corner Cafe');
        await tracker.locator('webui-button', { hasText: 'Add to tracker' }).click();
        await expect(tracker.locator('[data-id] h3')).toHaveText('Barista');
    });
});

test.describe('app-employer', () => {
    test('a sponsored listing needs a pay range and the statements, then goes live after simulated payment', async ({ page }) => {
        await member(page, '/employers');
        const employer = page.locator('app-employer');
        const field = label => employer.locator(`webui-input-text[label="${label}"] input`);
        await field('Job title').fill('Sous Chef');
        await field('Company').fill('Test Kitchen');
        await field('Location').fill('New York, NY');
        await employer.locator('webui-input-message textarea').fill('Run the line.');
        await field('Application link').fill('https://example.com/apply');
        await field('Billing email').fill('hiring@example.com');
        await employer.locator('webui-button', { hasText: 'Continue to payment' }).click();
        await expect(employer.locator('form webui-alert[variant="danger"]')).toContainText('confirm the listing statements');
        await employer.locator('input[name="attest"]').check();
        await employer.locator('webui-button', { hasText: 'Continue to payment' }).click();
        await expect(employer.locator('form webui-alert[variant="danger"]')).toContainText('pay range');
        await field('Lowest pay').fill('60000');
        await field('Highest pay').fill('70000');
        await employer.locator('webui-button', { hasText: 'Continue to payment' }).click();
        await expect(employer).toContainText('Status: Waiting for payment');
        await employer.locator('webui-button', { hasText: 'Simulate payment' }).click();
        await expect(employer).toContainText('Status: Live');
        const found = await api(page, 'POST', 'listings/search', { job: 'sous chef' });
        expect(found.sponsored.map(l => l.title)).toEqual(['Sous Chef']);
        // Other people never see an employer's billing email.
        await page.evaluate(async () => {
            const req = indexedDB.open('dyhatj-poc');
            const db = await new Promise(r => { req.onsuccess = () => r(req.result); });
            await new Promise(r => { const tx = db.transaction('profiles', 'readwrite'); tx.objectStore('profiles').put({ id: 'someone-else', displayName: 'X', createdAt: new Date().toISOString() }); tx.objectStore('profiles').delete('me'); tx.oncomplete = r; });
        });
        const seen = await api(page, 'POST', 'listings/search', { job: 'sous chef' });
        expect(seen.sponsored[0].contactEmail).toBeUndefined();
    });
});

test.describe('app-moderation and app-profile', () => {
    test('members without the moderator role are told so', async ({ page }) => {
        await member(page, '/moderation');
        await expect(page.locator('app-moderation')).toContainText('doesn\'t have access');
    });

    test('moderators hide a reported post', async ({ page }) => {
        await member(page, '/moderation', 17);
        await page.evaluate(() => window.dyhatj.api.request('POST', 'reports', { targetType: 'post', targetId: 'p-3', reason: 'spam' }));
        await page.evaluate(() => window.dyhatj.emit('change', {}));
        const entry = page.locator('app-moderation [data-id="p-3"]');
        await expect(entry).toContainText('Spam or advertising');
        await entry.locator('webui-button', { hasText: 'Hide' }).click();
        await expect(page.locator('app-moderation [data-id="p-3"]')).toContainText('hidden');
        await expect.poll(() => api(page, 'POST', 'posts/query', { kind: 'job' }).then(list => list.some(p => p.id === 'p-3'))).toBe(false);
    });

    test('the profile shows my posts, and on localhost the preview tools add the moderator role', async ({ page }) => {
        await member(page, '/profile');
        await api(page, 'POST', 'posts', { kind: 'tip', category: 'workplace', title: 'My own tip', body: 'Body' });
        const profile = page.locator('app-profile');
        await expect(profile.locator('app-post-list')).toContainText('My own tip');
        await expect(profile.locator('webui-button', { hasText: 'Delete my data' })).toBeVisible();
        // Tests run on localhost. The tools check webui.isLocalhost, so they never show on the live site.
        await profile.locator('[data-dev-tools] webui-button', { hasText: 'Add moderator role' }).click();
        await expect.poll(() => page.evaluate(() => webui.getData('session-user-role'))).toBe(17);
    });
});

test.describe('app-keyword-match', () => {
    test('lists the posting\'s key terms the resume is missing', async ({ page }) => {
        await openPage(page, '/tools/resume-keywords');
        const tool = page.locator('app-keyword-match');
        const boxes = tool.locator('webui-input-message textarea');
        await boxes.nth(0).fill('We need a line cook with food safety training. Food safety certification required. Knife skills and inventory management. Inventory management experience a plus.');
        await boxes.nth(1).fill('Line cook with strong knife skills. Managed inventory for a busy kitchen.');
        await tool.locator('webui-button', { hasText: 'Compare' }).click();
        await expect(tool.locator('[data-list="warning"]')).toContainText('food safety');
        await expect(tool.locator('[data-list="success"]')).toContainText('knife');
        const result = await page.evaluate(() => window.dyhatjKeywords.compare('python python sql', 'I write SQL'));
        expect(result.found.map(k => k.label)).toEqual(['sql']);
        expect(result.missing.map(k => k.label)).toEqual(['python']);
    });
});
