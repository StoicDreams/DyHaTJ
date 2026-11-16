/* Did You Hear About This Job: data layer for the POC.
 * Defines window.dyhatj: a simulated API stored in the browser's IndexedDB, the feature-to-role map, sample data,
 * and helpers shared by the site's components. Each api.request route is written the way the real MyFi endpoint
 * will be (see claude/dyhatj/API_SPEC.md), so swapping request() for webui.fetchApi is the only change needed once the
 * endpoints exist. Nothing here is secure: the real API must enforce the same rules on the server.
 * IndexedDB is used rather than localStorage, because the loader clears localStorage unless the visitor accepts long-term storage.
 */
"use strict"
{
    const DB_NAME = 'dyhatj-poc';
    const DB_VERSION = 1;
    const SEED_VERSION = 1;
    const DAY = 864e5;
    const LATENCY = 30;

    // MyFi role bits (cdn.myfi.ws/roles.json). Moderator is a placeholder until the API developer confirms the bit.
    const ROLES = { guest: 0, user: 1, moderator: 16 };
    // A feature is on when the visitor has any of its roles. Role 0 means everyone, signed in or not.
    const features = {
        read: [ROLES.guest],
        post: [ROLES.user],
        vote: [ROLES.user],
        comment: [ROLES.user],
        report: [ROLES.user],
        tracker: [ROLES.user],
        employer: [ROLES.user],
        moderate: [ROLES.moderator],
    };
    function currentRoles() {
        const role = parseInt(webui.getData('session-user-role')) || 0;
        return role;
    }
    function can(feature) {
        const roles = features[feature];
        if (!roles) return false;
        const mine = currentRoles();
        return roles.some(r => r === 0 || mine === -1 || (mine & r) === r);
    }

    const limits = {
        title: 120, company: 80, location: 80, url: 500, pay: 60, note: 1000, tipBody: 4000, comment: 1000,
        displayName: 40, headline: 100, reportDetails: 500, trackerNotes: 2000, postsPerDay: 10, commentsPerDay: 50,
        autoHideReports: 3, staleJobDays: 45,
    };
    const tipCategories = [
        { id: 'resumes', name: 'Resumes & Cover Letters', icon: 'file' },
        { id: 'interviews', name: 'Interviews', icon: 'messages' },
        { id: 'strategy', name: 'Job Search Strategy', icon: 'compass' },
        { id: 'salary', name: 'Salary & Negotiation', icon: 'coins' },
        { id: 'career-change', name: 'Career Change', icon: 'shuffle' },
        { id: 'workplace', name: 'Starting & Growing at Work', icon: 'seedling' },
    ];
    const workplaces = [
        { id: 'onsite', name: 'On-site' },
        { id: 'hybrid', name: 'Hybrid' },
        { id: 'remote', name: 'Remote' },
    ];
    const jobTypes = [
        { id: 'full-time', name: 'Full-time' },
        { id: 'part-time', name: 'Part-time' },
        { id: 'contract', name: 'Contract' },
        { id: 'temporary', name: 'Temporary' },
        { id: 'internship', name: 'Internship' },
    ];
    const reportReasons = [
        { id: 'scam', name: 'Scam, fake job, or asks for money' },
        { id: 'spam', name: 'Spam or advertising' },
        { id: 'discrimination', name: 'Discriminatory or illegal job requirements' },
        { id: 'harassment', name: 'Harassment or hate' },
        { id: 'personal-info', name: 'Shares someone\'s personal information' },
        { id: 'misleading', name: 'Misleading or harmful advice' },
        { id: 'filled', name: 'Job is filled or the link is broken' },
        { id: 'other', name: 'Something else' },
    ];
    const trackerStatuses = [
        { id: 'saved', name: 'Saved' },
        { id: 'applied', name: 'Applied' },
        { id: 'interviewing', name: 'Interviewing' },
        { id: 'offer', name: 'Offer' },
        { id: 'closed', name: 'Closed' },
    ];
    // Sponsored listing plans. Prices are not decided: these show as placeholders and checkout is simulated.
    const listingPlans = [
        { id: 'standard', name: 'Standard', days: 30, price: null, description: 'Shown as Sponsored at the top of matching searches for 30 days.' },
    ];

    class ApiError extends Error {
        constructor(status, message) {
            super(message);
            this.status = status;
        }
    }
    function fail(status, message) { throw new ApiError(status, message); }
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    const now = () => Date.now();
    const iso = time => new Date(time).toISOString();

    // IndexedDB --------------------------------------------------------------
    let dbPromise = null;
    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                ['profiles', 'listings', 'posts', 'votes', 'comments', 'reports', 'tracker', 'meta'].forEach(name => {
                    if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
                });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => { dbPromise = null; reject(req.error); };
        });
        return dbPromise;
    }
    function done(req) {
        return new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function store(name, mode = 'readonly') {
        const database = await openDb();
        return database.transaction(name, mode).objectStore(name);
    }
    const db = {
        async all(name) { return done((await store(name)).getAll()); },
        async get(name, key) { return done((await store(name)).get(key)); },
        async put(name, value) { return done((await store(name, 'readwrite')).put(value)); },
        async del(name, key) { return done((await store(name, 'readwrite')).delete(key)); },
        async putMany(name, values) {
            const database = await openDb();
            const tx = database.transaction(name, 'readwrite');
            const s = tx.objectStore(name);
            values.forEach(v => s.put(v));
            return new Promise((resolve, reject) => {
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
    };

    // Sample data --------------------------------------------------------------
    // Every sample record has sample:true, and the UI labels it, so nobody mistakes it for a real job or a real person.
    // Companies and people are made up.
    function seedData() {
        const t = now();
        const ago = days => iso(t - days * DAY);
        const listing = (id, days, f) => Object.assign({
            id: `l-${id}`, kind: 'feed', source: 'Sample job feed', url: '', sample: true, status: 'active',
            postedAt: ago(days), expiresAt: iso(t + (30 - days) * DAY), payPeriod: 'year', type: 'full-time', workplace: 'onsite',
        }, f);
        const listings = [
            listing(1, 1, { title: 'Line Cook', company: 'Harbor Lane Bistro', location: 'New York, NY', payMin: 19, payMax: 23, payPeriod: 'hour', summary: 'Prep and cook in a busy kitchen for dinner service. Weekend shifts required. Food handler card preferred.' }),
            listing(2, 3, { title: 'Restaurant Shift Supervisor', company: 'Copper Kettle Diner', location: 'Brooklyn, NY', payMin: 52000, payMax: 58000, summary: 'Lead front-of-house shifts, open and close the restaurant, and train new servers.' }),
            listing(3, 2, { title: 'Registered Nurse, Med-Surg', company: 'Brightpath Community Hospital', location: 'Columbus, OH', payMin: 74000, payMax: 92000, summary: 'Twelve-hour shifts on a 28-bed medical-surgical unit. Current RN license required. New grads welcome.' }),
            listing(4, 5, { title: 'Medical Assistant', company: 'Maple Grove Family Clinic', location: 'Columbus, OH', payMin: 18, payMax: 21, payPeriod: 'hour', summary: 'Room patients, take vitals, and keep the schedule moving in a friendly family practice.' }),
            listing(5, 1, { title: 'Junior Software Developer', company: 'Lumen Ridge Software', location: 'Remote (US)', workplace: 'remote', payMin: 68000, payMax: 85000, summary: 'Build and test features in JavaScript and Rust with a small, supportive team. Mentoring included.' }),
            listing(6, 6, { title: 'Senior Software Engineer', company: 'Cedar & Pine Logistics', location: 'Denver, CO', workplace: 'hybrid', payMin: 145000, payMax: 175000, summary: 'Own routing services that move thousands of shipments a day. Hybrid, two days a week in the office.' }),
            listing(7, 4, { title: 'IT Help Desk Technician', company: 'Northgate School District', location: 'Tacoma, WA', payMin: 24, payMax: 29, payPeriod: 'hour', summary: 'Support staff and students with laptops, accounts, and classroom tech. CompTIA A+ a plus.' }),
            listing(8, 2, { title: 'Warehouse Associate', company: 'Cedar & Pine Logistics', location: 'Aurora, CO', type: 'full-time', payMin: 20, payMax: 22, payPeriod: 'hour', summary: 'Pick, pack, and load orders. Day and night shifts. Able to lift 50 pounds.' }),
            listing(9, 8, { title: 'Customer Support Specialist', company: 'Bluebird Home Goods', location: 'Remote (US)', workplace: 'remote', payMin: 42000, payMax: 48000, summary: 'Help customers by chat and email. Patience and clear writing matter more than experience.' }),
            listing(10, 3, { title: 'Bookkeeper', company: 'Riverstone Accounting Group', location: 'Austin, TX', type: 'part-time', payMin: 25, payMax: 30, payPeriod: 'hour', summary: 'Twenty hours a week reconciling accounts and running payroll for small business clients.' }),
            listing(11, 9, { title: 'Marketing Coordinator', company: 'Sunfield Outdoor Co.', location: 'Boise, ID', workplace: 'hybrid', payMin: 50000, payMax: 60000, summary: 'Plan email campaigns, social posts, and in-store events for an outdoor gear retailer.' }),
            listing(12, 2, { title: 'Electrician Apprentice', company: 'Volt & Wire Services', location: 'Phoenix, AZ', payMin: 18, payMax: 22, payPeriod: 'hour', summary: 'Paid apprenticeship with classroom hours covered. No experience needed, valid driver\'s license required.' }),
            listing(13, 12, { title: 'Data Analyst', company: 'Northwind Insurance Partners', location: 'Chicago, IL', workplace: 'hybrid', payMin: 78000, payMax: 95000, summary: 'Turn claims data into dashboards and reports. SQL required, Python a plus.' }),
            listing(14, 1, { title: 'Summer Marketing Intern', company: 'Sunfield Outdoor Co.', location: 'Boise, ID', type: 'internship', payMin: 18, payMax: 18, payPeriod: 'hour', summary: 'Twelve-week paid internship for students studying marketing or communications.' }),
            listing(15, 4, { title: 'Delivery Driver', company: 'Bluebird Home Goods', location: 'Atlanta, GA', payMin: 21, payMax: 24, payPeriod: 'hour', summary: 'Deliver furniture with a two-person crew. Company truck, no CDL needed.' }),
            listing(16, 7, { title: 'Elementary Teacher, Grade 3', company: 'Northgate School District', location: 'Tacoma, WA', payMin: 61000, payMax: 98000, summary: 'Teach third grade starting in January. Washington teaching certificate required.' }),
            listing(17, 10, { title: 'Project Manager', company: 'Riverstone Accounting Group', location: 'Remote (US)', workplace: 'remote', type: 'contract', payMin: 55, payMax: 70, payPeriod: 'hour', summary: 'Six-month contract leading a software migration for an accounting firm.' }),
            listing(18, 3, { title: 'Dental Hygienist', company: 'Maple Grove Family Clinic', location: 'Dublin, OH', type: 'part-time', payMin: 40, payMax: 46, payPeriod: 'hour', summary: 'Three days a week in a calm, modern office. Ohio license required.' }),
            listing(19, 2, {
                kind: 'sponsored', source: 'Sponsored', ownerId: 'sample-employer', title: 'Kitchen Manager', company: 'Harbor Lane Bistro', location: 'New York, NY',
                payMin: 65000, payMax: 72000, summary: 'Run the kitchen for a 90-seat restaurant: ordering, schedules, and food safety. Two years of kitchen leadership required.',
            }),
            listing(20, 1, {
                kind: 'sponsored', source: 'Sponsored', ownerId: 'sample-employer', title: 'Software Engineer, Platform', company: 'Lumen Ridge Software', location: 'Remote (US)', workplace: 'remote',
                payMin: 110000, payMax: 135000, summary: 'Work on the build and deploy tools every team at Lumen Ridge uses. Rust or Go experience helps.',
            }),
        ];
        const person = (id, name) => ({ id: `sample-${id}`, name: `${name}` });
        const people = {
            priya: person('priya', 'Priya R.'), marcus: person('marcus', 'Marcus T.'), lena: person('lena', 'Lena K.'),
            dev: person('dev', 'Devon A.'), sam: person('sam', 'Sam O.'), rosa: person('rosa', 'Rosa M.'),
        };
        const post = (id, days, by, f) => Object.assign({
            id: `p-${id}`, authorId: by.id, authorName: by.name, createdAt: ago(days), status: 'visible', score: 0, sample: true,
        }, f);
        const posts = [
            post(1, 1, people.marcus, { kind: 'job', title: 'Prep Cook, mornings only', company: 'Copper Kettle Diner', location: 'Brooklyn, NY', workplace: 'onsite', type: 'part-time', pay: '$18 an hour', url: '', score: 7, note: 'My cousin works in the kitchen here. The morning crew is great, and they train you if you can show up on time. They said to apply in person before 10am.' }),
            post(2, 2, people.lena, { kind: 'job', title: 'Remote Customer Success Associate', company: 'Bluebird Home Goods', location: 'Remote (US)', workplace: 'remote', type: 'full-time', pay: '$45,000 a year', url: '', score: 12, note: 'Saw this on their careers page and it isn\'t on the big job boards yet. Good fit for anyone coming from retail or restaurant work.' }),
            post(3, 4, people.dev, { kind: 'job', title: 'Junior QA Tester', company: 'Lumen Ridge Software', location: 'Remote (US)', workplace: 'remote', type: 'contract', pay: '$28 an hour', url: '', score: 5, note: 'Three-month contract that often turns into a full-time role. Great way into tech if you\'re detail oriented.' }),
            post(4, 6, people.rosa, { kind: 'job', title: 'Pharmacy Technician Trainee', company: 'Maple Grove Family Clinic', location: 'Columbus, OH', workplace: 'onsite', type: 'full-time', pay: '$17 an hour while training', url: '', score: 9, note: 'They pay for your certification. I did this program two years ago and now I\'m a certified tech.' }),
            post(5, 50, people.sam, { kind: 'job', title: 'Seasonal Park Ranger Aide', company: 'Sunfield County Parks', location: 'Boise, ID', workplace: 'onsite', type: 'temporary', pay: '$16 an hour', url: '', score: 3, note: 'Outdoor summer work. Applications usually close in March.' }),
            post(11, 1, people.priya, { kind: 'tip', category: 'resumes', title: 'Put your best match in the top third', score: 18, body: 'Recruiters skim. Make the top third of your resume answer one question: why you, for this job?\n\nMove the two or three accomplishments that best match the posting up to a short summary, using the same words the posting uses for those skills.' }),
            post(12, 3, people.marcus, { kind: 'tip', category: 'resumes', title: 'Numbers make a line believable', score: 11, body: 'Instead of "Responsible for inventory", try "Cut food waste about 15% by reorganizing the walk-in and ordering twice a week."\n\nIf you don\'t know the exact number, a careful estimate you can explain is fine. Don\'t make one up.' }),
            post(13, 2, people.lena, { kind: 'tip', category: 'interviews', title: 'Practice STAR answers out loud', score: 15, body: 'Situation, Task, Action, Result. Write five stories from your past jobs, then say each one out loud in under two minutes.\n\nMost questions like "tell me about a time" can be answered with one of those five stories.' }),
            post(14, 5, people.dev, { kind: 'tip', category: 'interviews', title: 'Bring two questions about the team', score: 8, body: 'Ask "What does a great first 90 days look like?" and "What\'s the hardest part of this job?"\n\nThe answers tell you a lot, and asking shows you\'re picturing yourself doing the work.' }),
            post(15, 1, people.rosa, { kind: 'tip', category: 'strategy', title: 'Apply within the first few days', score: 13, body: 'Many postings get most of their applicants in the first week. Set up alerts and set aside a time each day to apply to new matches while they\'re fresh.' }),
            post(16, 7, people.sam, { kind: 'tip', category: 'strategy', title: 'Tell people what you\'re looking for', score: 10, body: 'Friends and former coworkers can\'t pass jobs along if they don\'t know you\'re looking. Send a short note: the kind of role, where, and one sentence about what you\'re good at.' }),
            post(17, 4, people.priya, { kind: 'tip', category: 'salary', title: 'Look up the range before you talk pay', score: 14, body: 'Several states now require pay ranges in job postings. Check the posting, similar postings, and public salary data before the first call, so you can name a number you can back up.' }),
            post(18, 9, people.lena, { kind: 'tip', category: 'salary', title: 'Get the offer in writing', score: 6, body: 'Before you give notice at your current job, ask for the offer in writing, with pay, start date, and benefits. A friendly email confirming the details works too.' }),
            post(19, 3, people.dev, { kind: 'tip', category: 'career-change', title: 'Translate your experience', score: 9, body: 'Write down what you actually did in your old job, then rewrite it in the new field\'s words. "Handled angry customers" becomes "resolved escalations"; "ran the closing shift" becomes "led a team of five".' }),
            post(20, 8, people.rosa, { kind: 'tip', category: 'workplace', title: 'Keep a running list of wins', score: 7, body: 'Keep a note on your phone and add a line whenever something goes well at work. It makes reviews, raises, and your next resume much easier.' }),
        ];
        const comment = (id, postId, days, by, body) => ({ id: `c-${id}`, postId: `p-${postId}`, authorId: by.id, authorName: by.name, createdAt: ago(days), status: 'visible', sample: true, body });
        const comments = [
            comment(1, 2, 1, people.sam, 'Applied yesterday, thanks for posting this!'),
            comment(2, 2, 1, people.priya, 'Their interview was two short video calls for me. Very friendly.'),
            comment(3, 13, 1, people.marcus, 'This helped me a lot. Timing my answers was the key part.'),
            comment(4, 17, 2, people.dev, 'Also worth checking whether the range is base pay only or includes bonus.'),
        ];
        return { listings, posts, comments };
    }
    let seeded = null;
    function ensureSeeded() {
        if (!seeded) {
            seeded = (async () => {
                const meta = await db.get('meta', 'seed');
                if (meta && meta.version === SEED_VERSION) return;
                const data = seedData();
                await db.putMany('listings', data.listings);
                await db.putMany('posts', data.posts);
                await db.putMany('comments', data.comments);
                await db.put('meta', { key: 'seed', version: SEED_VERSION, at: iso(now()) });
            })().catch(ex => { seeded = null; throw ex; });
        }
        return seeded;
    }

    // Validation ---------------------------------------------------------------
    function text(value, name, max, required) {
        const v = `${value ?? ''}`.replace(/\r\n/g, '\n').trim();
        if (required && !v) fail(400, `${name} is required.`);
        if (v.length > max) fail(400, `${name} must be ${max} characters or fewer.`);
        return v;
    }
    function oneOf(value, list, name, required) {
        const v = `${value ?? ''}`.trim();
        if (!v && !required) return '';
        if (!list.some(i => i.id === v)) fail(400, `Choose a ${name}.`);
        return v;
    }
    function link(value, required) {
        const v = text(value, 'The link', limits.url, required);
        if (!v) return '';
        let url;
        try { url = new URL(v); } catch { fail(400, 'The link must be a full web address, starting with https://'); }
        if (url.protocol !== 'https:' && url.protocol !== 'http:') fail(400, 'The link must start with https:// or http://');
        return url.href;
    }
    function money(value, name) {
        if (value === '' || value === null || value === undefined) return null;
        const n = Number(`${value}`.replace(/[$,\s]/g, ''));
        if (!Number.isFinite(n) || n < 0 || n > 10000000) fail(400, `${name} must be a number.`);
        return Math.round(n * 100) / 100;
    }

    // Access -------------------------------------------------------------------
    function requireFeature(feature) {
        if (can(feature)) return;
        if (!(currentRoles() & ROLES.user) && currentRoles() !== -1) fail(401, 'Sign in to do this.');
        fail(403, 'Your account does not have access to this.');
    }
    async function getProfile() {
        if (!(currentRoles() & ROLES.user) && currentRoles() !== -1) return null;
        return (await db.get('profiles', 'me')) || null;
    }
    async function requireProfile(feature) {
        requireFeature(feature);
        const profile = await getProfile();
        if (!profile) fail(428, 'Create your profile and accept the community guidelines first.');
        return profile;
    }
    const isModerator = () => can('moderate');
    async function postsToday(authorId, store) {
        const since = now() - DAY;
        return (await db.all(store)).filter(p => p.authorId === authorId && Date.parse(p.createdAt) > since).length;
    }

    // Shaping records for the caller -----------------------------------------
    async function decoratePosts(list) {
        const profile = await getProfile();
        const votes = profile ? new Set((await db.all('votes')).filter(v => v.userId === profile.id).map(v => v.postId)) : new Set();
        const comments = await db.all('comments');
        return list.map(p => Object.assign({}, p, {
            voted: votes.has(p.id),
            mine: !!profile && p.authorId === profile.id,
            commentCount: comments.filter(c => c.postId === p.id && c.status === 'visible').length,
            stale: p.kind === 'job' && now() - Date.parse(p.createdAt) > limits.staleJobDays * DAY,
        }));
    }
    function visibleToMe(item, profile) {
        if (item.status === 'visible' || item.status === 'active') return true;
        if (isModerator()) return item.status !== 'deleted';
        return !!profile && item.authorId === profile.id && item.status === 'hidden';
    }
    // Billing details stay with the listing's owner and moderators.
    function publicListing(listing, profile) {
        if (isModerator() || (profile && listing.ownerId === profile.id)) return listing;
        const copy = Object.assign({}, listing);
        delete copy.contactEmail;
        delete copy.payment;
        return copy;
    }
    const words = value => `${value || ''}`.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
    function matches(item, job, loc) {
        const hay = words([item.title, item.company, item.summary, item.note].join(' '));
        const where = words([item.location, item.workplace].join(' '));
        const jobWords = words(job), locWords = words(loc);
        const jobOk = jobWords.every(w => hay.some(h => h.startsWith(w)));
        const locOk = !locWords.length || locWords.every(w => where.some(h => h.startsWith(w)));
        return jobOk && locOk;
    }

    // Routes -------------------------------------------------------------------
    const routes = [];
    const route = (method, pattern, handler) => routes.push([method, pattern, handler]);

    // Profile and personal data
    route('GET', /^me$/, async () => ({ profile: await getProfile(), roles: currentRoles() }));
    route('POST', /^me$/, async (_, body) => {
        requireFeature('post');
        const existing = await getProfile();
        if (!existing && !body.confirmAge) fail(400, 'Please confirm that you are at least 16 years old.');
        if (!existing && !body.acceptGuidelines) fail(400, 'Please accept the community guidelines and terms.');
        const profile = Object.assign({ id: 'me', createdAt: iso(now()) }, existing, {
            displayName: text(body.displayName, 'Display name', limits.displayName, true),
            headline: text(body.headline, 'Headline', limits.headline, false),
            updatedAt: iso(now()),
        });
        if (!existing) profile.acceptedGuidelinesAt = iso(now());
        await db.put('profiles', profile);
        return profile;
    });
    route('GET', /^me\/export$/, async () => {
        const profile = await requireProfile('post');
        const mine = list => list.filter(i => i.authorId === profile.id || i.userId === profile.id || i.reporterId === profile.id || i.ownerId === profile.id);
        return {
            exportedAt: iso(now()), profile,
            posts: mine(await db.all('posts')), comments: mine(await db.all('comments')), votes: mine(await db.all('votes')),
            reports: mine(await db.all('reports')), tracker: mine(await db.all('tracker')), sponsoredListings: mine(await db.all('listings')),
        };
    });
    // Deletes everything this person made. Their posts and comments are removed for everyone.
    route('DELETE', /^me$/, async () => {
        const profile = await requireProfile('post');
        // Take back this person's votes from the posts they voted for.
        for (const vote of (await db.all('votes')).filter(v => v.userId === profile.id)) {
            const post = await db.get('posts', vote.postId);
            if (post) {
                post.score = Math.max(0, post.score - 1);
                await db.put('posts', post);
            }
        }
        for (const name of ['posts', 'comments', 'votes', 'reports', 'tracker', 'listings']) {
            for (const item of await db.all(name)) {
                if ([item.authorId, item.userId, item.reporterId, item.ownerId].includes(profile.id)) await db.del(name, item.id);
            }
        }
        await db.del('profiles', profile.id);
        return { deleted: true };
    });

    // Job search: sponsored listings first, then the job feed, then community shares that match.
    route('POST', /^listings\/search$/, async (_, body) => {
        const job = text(body.job, 'Job title', 100, true);
        const loc = text(body.loc, 'Location', 100, false);
        const workplace = oneOf(body.workplace, workplaces, 'workplace', false);
        const fresh = l => l.status === 'active' && Date.parse(l.expiresAt) > now();
        const fits = i => matches(i, job, loc) && (!workplace || i.workplace === workplace);
        const listings = (await db.all('listings')).filter(l => fresh(l) && fits(l)).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
        const posts = (await db.all('posts')).filter(p => p.kind === 'job' && p.status === 'visible' && fits(p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const profile = await getProfile();
        return {
            sponsored: listings.filter(l => l.kind === 'sponsored').slice(0, 2).map(l => publicListing(l, profile)),
            listings: listings.filter(l => l.kind === 'feed'),
            community: await decoratePosts(posts.slice(0, 10)),
        };
    });
    route('GET', /^listings\/([\w-]+)$/, async m => {
        const item = await db.get('listings', m[1]);
        const profile = await getProfile();
        if (!item || (item.status !== 'active' && !(profile && item.ownerId === profile.id) && !isModerator())) fail(404, 'This listing is no longer available.');
        return publicListing(item, profile);
    });

    // Community posts
    route('POST', /^posts\/query$/, async (_, body) => {
        const profile = await getProfile();
        const kind = body.kind === 'tip' ? 'tip' : body.kind === 'job' ? 'job' : '';
        const category = body.category ? oneOf(body.category, tipCategories, 'category', false) : '';
        let list = (await db.all('posts')).filter(p => (!kind || p.kind === kind) && (!category || p.category === category));
        if (body.mine) {
            if (!profile) return [];
            list = list.filter(p => p.authorId === profile.id && p.status !== 'deleted');
        } else {
            list = list.filter(p => p.status === 'visible');
        }
        if (body.sort === 'top') list.sort((a, b) => b.score - a.score || b.createdAt.localeCompare(a.createdAt));
        else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const limit = Math.min(Math.max(parseInt(body.limit) || 50, 1), 100);
        return decoratePosts(list.slice(0, limit));
    });
    route('GET', /^posts\/([\w-]+)$/, async m => {
        const post = await db.get('posts', m[1]);
        const profile = await getProfile();
        if (!post || !visibleToMe(post, profile)) fail(404, 'This post was removed or never existed.');
        return (await decoratePosts([post]))[0];
    });
    route('POST', /^posts$/, async (_, body) => {
        const profile = await requireProfile('post');
        if (await postsToday(profile.id, 'posts') >= limits.postsPerDay) fail(429, `You can share up to ${limits.postsPerDay} posts a day.`);
        const base = { id: `p-${webui.uuid()}`, authorId: profile.id, authorName: profile.displayName, createdAt: iso(now()), status: 'visible', score: 0 };
        let post;
        if (body.kind === 'job') {
            post = Object.assign(base, {
                kind: 'job',
                title: text(body.title, 'Job title', limits.title, true),
                company: text(body.company, 'Company', limits.company, true),
                location: text(body.location, 'Location', limits.location, true),
                workplace: oneOf(body.workplace, workplaces, 'workplace', true),
                type: oneOf(body.type, jobTypes, 'job type', true),
                pay: text(body.pay, 'Pay', limits.pay, false),
                url: link(body.url, false),
                note: text(body.note, 'Why it\'s worth a look', limits.note, true),
            });
            if (post.url) {
                const recent = (await db.all('posts')).find(p => p.kind === 'job' && p.url === post.url && p.status === 'visible' && now() - Date.parse(p.createdAt) < 30 * DAY);
                if (recent) fail(409, 'Someone already shared this job in the last 30 days. Add a comment to their post instead.');
            }
        } else if (body.kind === 'tip') {
            post = Object.assign(base, {
                kind: 'tip',
                category: oneOf(body.category, tipCategories, 'category', true),
                title: text(body.title, 'Title', limits.title, true),
                body: text(body.body, 'Your tip', limits.tipBody, true),
            });
        } else {
            fail(400, 'Choose whether you are sharing a job or a tip.');
        }
        await db.put('posts', post);
        return (await decoratePosts([post]))[0];
    });
    route('DELETE', /^posts\/([\w-]+)$/, async m => {
        const profile = await getProfile();
        const post = await db.get('posts', m[1]);
        if (!post) fail(404, 'This post was already removed.');
        if (!(profile && post.authorId === profile.id) && !isModerator()) fail(403, 'Only the person who shared this, or a moderator, can delete it.');
        await db.del('posts', post.id);
        for (const c of (await db.all('comments')).filter(c => c.postId === post.id)) await db.del('comments', c.id);
        for (const v of (await db.all('votes')).filter(v => v.postId === post.id)) await db.del('votes', v.id);
        return { deleted: true };
    });
    route('POST', /^posts\/([\w-]+)\/vote$/, async (m, body) => {
        const profile = await requireProfile('vote');
        const post = await db.get('posts', m[1]);
        if (!post || post.status !== 'visible') fail(404, 'This post was removed.');
        if (post.authorId === profile.id) fail(400, 'You can\'t vote for your own post.');
        const id = `${post.id}:${profile.id}`;
        const existing = await db.get('votes', id);
        if (body.helpful && !existing) {
            await db.put('votes', { id, postId: post.id, userId: profile.id, createdAt: iso(now()) });
            post.score += 1;
        } else if (!body.helpful && existing) {
            await db.del('votes', id);
            post.score = Math.max(0, post.score - 1);
        }
        await db.put('posts', post);
        return (await decoratePosts([post]))[0];
    });

    // Comments
    route('GET', /^posts\/([\w-]+)\/comments$/, async m => {
        const profile = await getProfile();
        return (await db.all('comments'))
            .filter(c => c.postId === m[1] && visibleToMe(c, profile))
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            .map(c => Object.assign({}, c, { mine: !!profile && c.authorId === profile.id }));
    });
    route('POST', /^posts\/([\w-]+)\/comments$/, async (m, body) => {
        const profile = await requireProfile('comment');
        const post = await db.get('posts', m[1]);
        if (!post || post.status !== 'visible') fail(404, 'This post was removed.');
        if (await postsToday(profile.id, 'comments') >= limits.commentsPerDay) fail(429, `You can leave up to ${limits.commentsPerDay} comments a day.`);
        const comment = {
            id: `c-${webui.uuid()}`, postId: post.id, authorId: profile.id, authorName: profile.displayName,
            createdAt: iso(now()), status: 'visible', body: text(body.body, 'Comment', limits.comment, true),
        };
        await db.put('comments', comment);
        return Object.assign({ mine: true }, comment);
    });
    route('DELETE', /^comments\/([\w-]+)$/, async m => {
        const profile = await getProfile();
        const comment = await db.get('comments', m[1]);
        if (!comment) fail(404, 'This comment was already removed.');
        if (!(profile && comment.authorId === profile.id) && !isModerator()) fail(403, 'Only the person who wrote this, or a moderator, can delete it.');
        await db.del('comments', comment.id);
        return { deleted: true };
    });

    // Reports and moderation
    async function findTarget(type, id) {
        const name = { post: 'posts', comment: 'comments', listing: 'listings' }[type];
        if (!name) fail(400, 'Unknown kind of report.');
        const item = await db.get(name, id);
        if (!item) fail(404, 'That was already removed.');
        return { name, item };
    }
    route('POST', /^reports$/, async (_, body) => {
        const profile = await requireProfile('report');
        const { name, item } = await findTarget(body.targetType, `${body.targetId || ''}`);
        if (item.authorId === profile.id || item.ownerId === profile.id) fail(400, 'You can\'t report your own post. Delete it instead.');
        const reason = oneOf(body.reason, reportReasons, 'reason', true);
        const details = text(body.details, 'Details', limits.reportDetails, reason === 'other');
        const reports = await db.all('reports');
        if (reports.some(r => r.targetId === item.id && r.reporterId === profile.id && r.status === 'open')) fail(409, 'You already reported this. A moderator will review it.');
        await db.put('reports', {
            id: `r-${webui.uuid()}`, targetType: body.targetType, targetId: item.id, reason, details,
            reporterId: profile.id, createdAt: iso(now()), status: 'open',
        });
        // Enough reports hide a post until a moderator reviews it. Sponsored listings are reviewed, not hidden automatically.
        const open = reports.filter(r => r.targetId === item.id && r.status === 'open').length + 1;
        if (name !== 'listings' && open >= limits.autoHideReports && item.status === 'visible') {
            item.status = 'hidden';
            item.hiddenReason = 'reports';
            await db.put(name, item);
        }
        return { reported: true };
    });
    route('GET', /^moderation\/queue$/, async () => {
        requireFeature('moderate');
        const reports = (await db.all('reports')).filter(r => r.status === 'open');
        const groups = new Map();
        for (const r of reports) {
            const key = `${r.targetType}:${r.targetId}`;
            if (!groups.has(key)) groups.set(key, { targetType: r.targetType, targetId: r.targetId, reports: [] });
            // Moderators see why something was reported, not who reported it.
            const { reporterId, ...report } = r;
            groups.get(key).reports.push(report);
        }
        const hidden = [];
        for (const name of ['posts', 'comments']) {
            for (const item of await db.all(name)) if (item.status === 'hidden') hidden.push({ targetType: name === 'posts' ? 'post' : 'comment', targetId: item.id });
        }
        hidden.forEach(h => { const key = `${h.targetType}:${h.targetId}`; if (!groups.has(key)) groups.set(key, Object.assign(h, { reports: [] })); });
        const queue = [];
        for (const g of groups.values()) {
            const name = { post: 'posts', comment: 'comments', listing: 'listings' }[g.targetType];
            const item = await db.get(name, g.targetId);
            if (item) queue.push(Object.assign(g, { item }));
        }
        return queue.sort((a, b) => b.reports.length - a.reports.length);
    });
    route('POST', /^moderation\/(post|comment|listing)\/([\w-]+)$/, async (m, body) => {
        requireFeature('moderate');
        const { name, item } = await findTarget(m[1], m[2]);
        const action = `${body.action || ''}`;
        if (!['keep', 'hide', 'remove'].includes(action)) fail(400, 'Choose keep, hide, or remove.');
        if (action === 'remove') await db.del(name, item.id);
        else {
            item.status = action === 'keep' ? (name === 'listings' ? 'active' : 'visible') : (name === 'listings' ? 'removed' : 'hidden');
            item.hiddenReason = action === 'hide' ? 'moderator' : '';
            await db.put(name, item);
        }
        for (const r of (await db.all('reports')).filter(r => r.targetId === item.id && r.status === 'open')) {
            r.status = 'resolved';
            r.resolution = action;
            r.resolvedAt = iso(now());
            await db.put('reports', r);
        }
        return { done: action };
    });

    // Application tracker
    route('GET', /^tracker$/, async () => {
        const profile = await requireProfile('tracker');
        return (await db.all('tracker')).filter(t => t.userId === profile.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
    route('POST', /^tracker$/, async (_, body) => {
        const profile = await requireProfile('tracker');
        const entries = (await db.all('tracker')).filter(t => t.userId === profile.id);
        if (entries.length >= 500) fail(429, 'Your tracker is full. Remove old entries first.');
        let snapshot;
        if (body.refType && body.refId) {
            const already = entries.find(e => e.refId === body.refId);
            if (already) return already;
            const { item } = await findTarget(body.refType, `${body.refId}`);
            snapshot = { title: item.title, company: item.company, location: item.location, url: item.url || '' };
        } else {
            snapshot = {
                title: text(body.title, 'Job title', limits.title, true), company: text(body.company, 'Company', limits.company, true),
                location: text(body.location, 'Location', limits.location, false), url: link(body.url, false),
            };
        }
        const entry = Object.assign({
            id: `t-${webui.uuid()}`, userId: profile.id, refType: body.refType || '', refId: body.refId || '',
            status: 'saved', notes: '', followUp: '', createdAt: iso(now()), updatedAt: iso(now()),
        }, snapshot);
        await db.put('tracker', entry);
        return entry;
    });
    route('POST', /^tracker\/([\w-]+)$/, async (m, body) => {
        const profile = await requireProfile('tracker');
        const entry = await db.get('tracker', m[1]);
        if (!entry || entry.userId !== profile.id) fail(404, 'That entry was removed.');
        if (body.status !== undefined) entry.status = oneOf(body.status, trackerStatuses, 'status', true);
        if (body.notes !== undefined) entry.notes = text(body.notes, 'Notes', limits.trackerNotes, false);
        if (body.followUp !== undefined) {
            const v = `${body.followUp || ''}`;
            if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail(400, 'The follow-up date must be a date.');
            entry.followUp = v;
        }
        entry.updatedAt = iso(now());
        await db.put('tracker', entry);
        return entry;
    });
    route('DELETE', /^tracker\/([\w-]+)$/, async m => {
        const profile = await requireProfile('tracker');
        const entry = await db.get('tracker', m[1]);
        if (!entry || entry.userId !== profile.id) fail(404, 'That entry was already removed.');
        await db.del('tracker', entry.id);
        return { deleted: true };
    });

    // Sponsored listings for employers. Payment is simulated: nothing is charged.
    route('GET', /^employer\/listings$/, async () => {
        const profile = await requireProfile('employer');
        return (await db.all('listings')).filter(l => l.ownerId === profile.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
    route('POST', /^employer\/listings$/, async (_, body) => {
        const profile = await requireProfile('employer');
        if (!body.attest) fail(400, 'Please confirm the listing statements before continuing.');
        const plan = listingPlans.find(p => p.id === body.plan) || fail(400, 'Choose a listing plan.');
        const payMin = money(body.payMin, 'Lowest pay'), payMax = money(body.payMax, 'Highest pay');
        if (payMin === null || payMax === null) fail(400, 'Enter a pay range. Many states require one in job postings.');
        if (payMax < payMin) fail(400, 'Highest pay must be at least the lowest pay.');
        const listing = {
            id: `l-${webui.uuid()}`, kind: 'sponsored', source: 'Sponsored', ownerId: profile.id, plan: plan.id,
            title: text(body.title, 'Job title', limits.title, true),
            company: text(body.company, 'Company', limits.company, true),
            location: text(body.location, 'Location', limits.location, true),
            workplace: oneOf(body.workplace, workplaces, 'workplace', true),
            type: oneOf(body.type, jobTypes, 'job type', true),
            payMin, payMax, payPeriod: body.payPeriod === 'hour' ? 'hour' : 'year',
            summary: text(body.summary, 'Description', limits.note, true),
            url: link(body.url, true),
            contactEmail: text(body.contactEmail, 'Billing email', 120, true),
            status: 'pending-payment', createdAt: iso(now()), postedAt: '', expiresAt: '',
        };
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(listing.contactEmail)) fail(400, 'Enter a valid billing email.');
        await db.put('listings', listing);
        return listing;
    });
    route('POST', /^employer\/listings\/([\w-]+)\/(pay|close)$/, async m => {
        const profile = await requireProfile('employer');
        const listing = await db.get('listings', m[1]);
        if (!listing || listing.ownerId !== profile.id) fail(404, 'That listing was removed.');
        if (m[2] === 'pay') {
            if (listing.status !== 'pending-payment') fail(409, 'This listing is already paid.');
            const plan = listingPlans.find(p => p.id === listing.plan) || listingPlans[0];
            listing.status = 'active';
            listing.paidAt = iso(now());
            listing.postedAt = iso(now());
            listing.expiresAt = iso(now() + plan.days * DAY);
            listing.payment = { simulated: true, amount: plan.price, at: iso(now()) };
        } else {
            listing.status = 'closed';
            listing.expiresAt = iso(now());
        }
        await db.put('listings', listing);
        return listing;
    });

    // Developer reset for the POC: removes everything in this browser and reloads the sample data.
    route('POST', /^dev\/reset$/, async () => {
        for (const name of ['profiles', 'listings', 'posts', 'votes', 'comments', 'reports', 'tracker', 'meta']) {
            for (const item of await db.all(name)) await db.del(name, item.id ?? item.key);
        }
        seeded = null;
        await ensureSeeded();
        return { reset: true };
    });

    async function request(method, path, body) {
        await webui.wait(LATENCY);
        await ensureSeeded();
        const found = routes.find(([m, pattern]) => m === method && pattern.test(path));
        if (!found) throw new ApiError(404, `No simulated endpoint for ${method} ${path}.`);
        const result = await found[2](path.match(found[1]), clone(body) || {});
        // Lists refresh on 'change'. Reports and tracker saves don't change what lists show, and a refresh would
        // replace the confirmation the visitor just got, so they stay quiet.
        if (method !== 'GET' && !/query|search|^reports|^tracker/.test(path)) emit('change', { method, path });
        return clone(result);
    }

    // Display helpers ------------------------------------------------------------
    function timeAgo(value) {
        const ms = now() - Date.parse(value);
        if (!Number.isFinite(ms)) return '';
        const mins = Math.round(ms / 6e4);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
        const days = Math.round(hours / 24);
        if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
        return new Date(value).toLocaleDateString();
    }
    function payText(item) {
        if (item.pay) return item.pay;
        if (item.payMin === undefined || item.payMin === null) return '';
        const f = n => item.payPeriod === 'hour' ? `$${n % 1 ? n.toFixed(2) : n}` : `$${Math.round(n).toLocaleString('en-US')}`;
        const range = item.payMax && item.payMax !== item.payMin ? `${f(item.payMin)} to ${f(item.payMax)}` : f(item.payMin);
        return `${range} ${item.payPeriod === 'hour' ? 'an hour' : 'a year'}`;
    }
    const nameOf = (list, id) => (list.find(i => i.id === id) || {}).name || '';
    // Plain text with blank lines between paragraphs, built as text nodes so user content can't add HTML.
    function paragraphs(value) {
        const frag = document.createDocumentFragment();
        `${value || ''}`.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean).forEach(p => frag.appendChild(webui.create('p', { text: p })));
        return frag;
    }
    // A link that leaves the site. User links are marked ugc, and paid ones sponsored, as search engines ask.
    function outLink(href, label, sponsored) {
        return webui.create('a', { href, text: label, target: '_blank', rel: `${sponsored ? 'sponsored' : 'ugc'} nofollow noopener noreferrer` });
    }
    function message(ex, fallback) {
        if (ex && ex.message) return ex.message;
        return fallback || 'Something went wrong.';
    }

    // Events -------------------------------------------------------------------
    const bus = new EventTarget();
    function emit(name, detail) { bus.dispatchEvent(new CustomEvent(name, { detail })); }
    function on(name, handler) {
        const fn = ev => handler(ev.detail);
        bus.addEventListener(name, fn);
        return () => bus.removeEventListener(name, fn);
    }
    // The loader doesn't reload a page, or update page-path, when the address changes to another address that shows the
    // same page (/job/a to /job/b, or a new search from /search/...). Components that read the address listen for 'path'.
    // go() navigates and sends it. Back and forward send it too.
    function go(href) {
        webui.navigateTo(href);
        emit('path', location.pathname);
    }
    window.addEventListener('popstate', () => setTimeout(() => emit('path', location.pathname)));

    window.dyhatj = {
        ROLES, features, can, limits, tipCategories, workplaces, jobTypes, reportReasons, trackerStatuses, listingPlans,
        ApiError, api: { request }, on, emit, go, timeAgo, payText, nameOf, paragraphs, outLink, message,
        isSignedIn: () => !!(currentRoles() & ROLES.user) || currentRoles() === -1,
        // What stands between the visitor and a feature: 'guest', 'role', 'setup' (no profile yet), or 'ready'.
        async access(feature) {
            if (!can(feature)) return dyhatj.isSignedIn() ? 'role' : 'guest';
            if (features[feature].includes(ROLES.guest)) return 'ready';
            const me = await request('GET', 'me');
            return me.profile ? 'ready' : 'setup';
        },
        // Calls refresh when data changes or the visitor signs in or out. Returns a function that stops it.
        watch(el, refresh) {
            const off = on('change', () => refresh.call(el));
            const offProfile = on('profile', () => refresh.call(el));
            return () => { off(); offProfile(); };
        },
    };
    const dyhatj = window.dyhatj;

    webui.define('app-store', {
        connected() {
            this.style.display = 'none';
        }
    });
}
