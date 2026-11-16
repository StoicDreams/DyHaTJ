/* Resume keyword matcher: paste a job description and a resume, and see which of the posting's key words and phrases
 * the resume already uses and which it's missing. Runs in the browser. Nothing is saved or sent anywhere.
 * <app-keyword-match></app-keyword-match>
 */
"use strict"
{
    const STOP = new Set(`a about above after again all also am an and any are as at be because been before being below between both but by
can could did do does doing down during each etc few for from further had has have having he her here hers him his how i if in into is it its
just me more most my no nor not now of off on once only or other our ours out over own per same she should so some such than that the their
them then there these they this those through to too under until up us very via was we well were what when where which while who whom why will
with would you your yours able across ability work working job role position candidate candidates team teams company years year experience
including include includes new must strong plus preferred required requirements responsibilities responsible duties looking join help ensure
using use used make based within want great good day days per time full part apply applicant applicants opportunity people range pay salary
benefits equal employer`.split(/\s+/));

    function tokens(text) {
        return `${text || ''}`.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9+#.]+/)
            .map(w => w.replace(/^\.+|\.+$/g, ''))
            .filter(Boolean);
    }
    // A light stem so "managed", "manages", and "managing" all match "manage".
    function stem(word) {
        if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
        if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
        if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
        if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
        return word;
    }
    const keep = w => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w) || /^[a-z]\+\+$|^c#$|^\.net$|^sql$|^ui$|^ux$|^qa$|^it$|^rn$/.test(w);

    // Key words and two-word phrases from the job description, most repeated first.
    function keywords(description, max = 30) {
        const words = tokens(description);
        const counts = new Map();
        const add = (key, label, weight) => {
            const entry = counts.get(key) || { label, count: 0 };
            entry.count += weight;
            counts.set(key, entry);
        };
        words.forEach((w, i) => {
            if (!keep(w)) return;
            add(stem(w), w, 1);
            const next = words[i + 1];
            if (next && keep(next)) add(`${stem(w)} ${stem(next)}`, `${w} ${next}`, 1.5);
        });
        const list = [...counts.entries()]
            .map(([key, v]) => ({ key, label: v.label, count: v.count }))
            .filter(k => k.key.includes(' ') ? k.count >= 3 : true)
            .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
        // Drop single words that only appear inside a phrase already kept, so the list isn't repetitive.
        const picked = [];
        for (const k of list) {
            if (picked.length >= max) break;
            if (!k.key.includes(' ') && picked.some(p => p.key.includes(' ') && p.key.split(' ').includes(k.key) && p.count >= k.count)) continue;
            picked.push(k);
        }
        return picked;
    }
    function compare(description, resume) {
        const have = tokens(resume).map(stem);
        const haveSet = new Set(have);
        const pairs = new Set(have.map((w, i) => `${w} ${have[i + 1]}`));
        const found = [], missing = [];
        keywords(description).forEach(k => ((k.key.includes(' ') ? pairs.has(k.key) : haveSet.has(k.key)) ? found : missing).push(k));
        const total = found.length + missing.length;
        return { found, missing, score: total ? Math.round(found.length / total * 100) : 0 };
    }

    webui.define('app-keyword-match', {
        preload: 'button flex paper input-message alert',
        connected() {
            const t = this;
            const job = webui.create('webui-input-message', { label: 'Job description', placeholder: 'Paste the full job posting here', height: '220' });
            const resume = webui.create('webui-input-message', { label: 'Your resume', placeholder: 'Paste the text of your resume here', height: '220' });
            const run = webui.create('webui-button', { theme: 'primary', 'start-icon': 'magnifying-glass', text: 'Compare' });
            const results = webui.create('div', { 'aria-live': 'polite', class: 'mt-3' });
            const inputs = webui.create('webui-flex', { gap: '3', 'wrap-at': '800' });
            inputs.append(job, resume);
            const buttons = webui.create('webui-flex', { justify: 'end', class: 'mt-2' });
            buttons.appendChild(run);
            run.addEventListener('click', () => {
                if (!job.value.trim() || !resume.value.trim()) {
                    results.replaceChildren(webui.create('webui-alert', { variant: 'warning', show: '', text: 'Paste both the job description and your resume first.' }));
                    return;
                }
                results.replaceChildren(t.render(compare(job.value, resume.value)));
            });
            t.replaceChildren(inputs, buttons, results);
        },
        render(result) {
            const paper = webui.create('webui-paper', { class: 'elevation-5 pa-3' });
            paper.appendChild(webui.create('h3', { class: 'my-1', text: `Your resume uses ${result.found.length} of the posting's ${result.found.length + result.missing.length} key terms (${result.score}%)` }));
            const list = (title, items, theme) => {
                paper.appendChild(webui.create('h4', { text: title, class: 'mb-1' }));
                if (!items.length) {
                    paper.appendChild(webui.create('p', { text: 'None.' }));
                    return;
                }
                const row = webui.create('webui-flex', { gap: '2', wrap: '', 'data-list': theme });
                items.forEach(k => row.appendChild(webui.create('span', { text: k.label, style: `border:1px solid var(--color-${theme});border-radius:var(--corners,4px);padding:0.1em 0.5em` })));
                paper.appendChild(row);
            };
            list('Missing from your resume', result.missing, 'warning');
            list('Already in your resume', result.found, 'success');
            paper.appendChild(webui.create('p', { class: 'mt-3', text: 'Add missing terms only where they truthfully describe your experience. Matching words helps applicant tracking systems and recruiters find you, but it can\'t replace real experience.' }));
            return paper;
        },
    });
    window.dyhatjKeywords = { keywords, compare };
}
