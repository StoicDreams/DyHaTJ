import { test, expect, openPage } from './support/site.mjs';

const search = page => page.locator('app-search').first();
const field = (page, name) => search(page).locator(`webui-input-text[name="${name}"] input`);
const submit = page => search(page).locator('webui-button[type="submit"]').click();

test.describe('app-search', () => {
    test('a job and location go into the address, with spaces as underscores', async ({ page }) => {
        await openPage(page, '/');
        await field(page, 'job').fill('  Restaurant Specialist ');
        await field(page, 'loc').fill('New York');
        await submit(page);
        await page.waitForURL('**/search/Restaurant_Specialist/New_York');
    });

    test('a job with no location searches everywhere', async ({ page }) => {
        await openPage(page, '/');
        await field(page, 'job').fill('Chef');
        await submit(page);
        await page.waitForURL(url => url.pathname === '/search/Chef');
    });

    test('characters that do not belong in an address are dropped', async ({ page }) => {
        await openPage(page, '/');
        await field(page, 'job').fill('C++ <dev>/ops?');
        await field(page, 'loc').fill('St. Louis, MO');
        await submit(page);
        await page.waitForURL(url => url.pathname === '/search/C_devops/St_Louis,_MO');
    });

    test('with no job it asks for one, and stays on the page', async ({ page }) => {
        await openPage(page, '/');
        await field(page, 'loc').fill('New York');
        await submit(page);
        await expect(search(page).locator('webui-alert')).toContainText('Please enter what job you are looking for');
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('a search address fills in the fields', async ({ page }) => {
        await openPage(page, '/search/Restaurant_Specialist/New_York');
        await expect(field(page, 'job')).toHaveValue('Restaurant Specialist');
        await expect(field(page, 'loc')).toHaveValue('New York');
        expect(await page.evaluate(() => webui.loadSearchFromUrl())).toEqual({ job: 'Restaurant Specialist', loc: 'New York' });
    });

    test('other pages are not read as a search', async ({ page }) => {
        await openPage(page, '/');
        expect(await page.evaluate(() => webui.loadSearchFromUrl())).toEqual({ job: '', loc: '' });
    });
});

test('app-search-results says results are coming soon', async ({ page }) => {
    await openPage(page, '/search/Chef');
    await expect(page.locator('app-search-results webui-alert')).toContainText('Coming Soon!');
    await expect(page.locator('webui-page-not-found')).toHaveCount(0);
});
