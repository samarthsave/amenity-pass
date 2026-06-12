// One-shot manual test: find an available Saturday slot and book it through the
// real production bookSlot() code path. Run with: xvfb-run -a node deploy/test_book.js
const puppeteer = require('puppeteer');
const { bookSlot, USERS, TARGETS } = require('../reserve.js');

const AMENITY_URL = 'https://amenitypass.app/properties/6581p8950s37s52a3p2t0w44gg/amenities/yt9198emjd193dbkydz0y93edm';

(async () => {
    // Saturday targets only (day === 6), in their production label format.
    const satTargets = TARGETS.filter(t => t.day === 6);

    // --- Discovery pass (read-only): which Saturday labels are currently bookable? ---
    console.log('Discovering available Saturday slots...');
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null, args: ['--start-maximized', '--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(AMENITY_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    const availableLabels = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
        const out = [];
        for (const input of inputs) {
            if (input.disabled) continue;
            let label = '';
            const parent = input.parentElement;
            if (parent && parent.previousElementSibling) {
                const abbr = parent.previousElementSibling.querySelector('abbr');
                label = (abbr && abbr.getAttribute('title')) ? abbr.getAttribute('title') : parent.previousElementSibling.innerText;
            }
            if (label) out.push(label.trim());
        }
        return out;
    });
    await browser.close();

    console.log(`Found ${availableLabels.length} available slot label(s) on the page.`);

    // Match our configured Saturday targets against what's available (same logic as production).
    const match = satTargets.find(t =>
        availableLabels.some(lbl => t.label.split(' ').every(part => lbl.includes(part)))
    );

    if (!match) {
        console.log('NO available Saturday target slot found right now. Available labels were:');
        availableLabels.forEach(l => console.log('  - ' + l));
        console.log('TEST RESULT: no-slot');
        process.exit(0);
    }

    console.log(`\n>>> Booking "${match.label}" under user ${match.user} (${USERS[match.user].name}) <<<\n`);
    const ok = await bookSlot(match.label, new Date(), USERS[match.user]);
    console.log(`\nTEST RESULT: ${ok ? 'BOOKED ' + match.label : 'FAILED to book ' + match.label}`);
    process.exit(ok ? 0 : 1);
})().catch(e => { console.error('TEST ERROR:', e); process.exit(1); });
