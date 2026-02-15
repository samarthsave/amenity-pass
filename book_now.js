require('dotenv').config();
const puppeteer = require('puppeteer');

const AMENITY_URL = 'https://amenitypass.app/properties/6581p8950s37s52a3p2t0w44gg/amenities/yt9198emjd193dbkydz0y93edm';
const TARGET_TEXT = "Wed 5:30 PM";

(async () => {
    console.log(`--- EMERGENCY BOOKING FOR: "${TARGET_TEXT}" ---`);
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to ${AMENITY_URL}`);
        await page.goto(AMENITY_URL, { waitUntil: 'networkidle2' });

        console.log('Waiting 10 seconds for full load...');
        await new Promise(r => setTimeout(r, 10000));

        let foundSlot = false;
        let continueUrl = null;
        let retries = 0;
        const maxRetries = 20;

        while (!foundSlot && retries < maxRetries) {
            try {
                // Scroll
                console.log('Scrolling...');
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                await new Promise(r => setTimeout(r, 1500));

                const result = await page.evaluate((target) => {
                    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
                    const availableSlots = [];
                    let clicked = false;

                    for (const input of inputs) {
                        if (input.disabled) continue;

                        // Logic: Input -> Parent (Time) -> Prev Sibling (Time) -> Abbr[title]
                        let slotLabel = '';
                        const parent = input.parentElement;
                        if (parent && parent.previousElementSibling) {
                            const abbr = parent.previousElementSibling.querySelector('abbr');
                            if (abbr && abbr.getAttribute('title')) {
                                slotLabel = abbr.getAttribute('title'); // e.g. "Wed Nov 26 2025 5:00 PM"
                            } else {
                                // Fallback to text
                                slotLabel = parent.previousElementSibling.innerText;
                            }
                        }

                        if (slotLabel) {
                            availableSlots.push(slotLabel);
                            // Check if it matches "Wed" and "5:00 PM"
                            // Target is "Wed 5:00 PM"
                            // We split target to match parts
                            const targetParts = target.split(' ');
                            const allPartsMatch = targetParts.every(part => slotLabel.includes(part));

                            if (allPartsMatch) {
                                console.log(`MATCH FOUND: "${slotLabel}"`);
                                input.click();
                                clicked = true;
                                break;
                            }
                        }
                    }
                    return { clicked, slots: availableSlots };
                }, TARGET_TEXT);

                console.log(`Visible slots (${result.slots.length}):`, result.slots.join(', '));

                if (result.clicked) {
                    console.log(`MATCH FOUND! Clicked.`);

                    // Wait for Continue
                    await new Promise(r => setTimeout(r, 1000));
                    const continueUrlFound = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const continueBtn = links.find(a => a.innerText.trim().toLowerCase().includes('continue'));
                        return continueBtn ? continueBtn.href : null;
                    });

                    if (continueUrlFound) {
                        foundSlot = true;
                        continueUrl = continueUrlFound;
                        console.log('Continue URL found:', continueUrl);
                        break;
                    } else {
                        console.log('Clicked but Continue not ready.');
                    }
                } else {
                    console.log(`Target "${TARGET_TEXT}" NOT found in visible slots.`);
                }

                console.log(`Reloading (${retries}/${maxRetries})...`);
                await page.reload({ waitUntil: 'domcontentloaded' });
                await new Promise(r => setTimeout(r, 3000));
                retries++;

            } catch (e) {
                console.log('Error in loop:', e.message);
                try { await page.reload({ waitUntil: 'domcontentloaded' }); } catch (err) { }
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Scroll to bottom
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await new Promise(r => setTimeout(r, 2000));

        // Capture screenshot
        await page.screenshot({ path: 'debug_view.png', fullPage: true });
        console.log('Screenshot saved to debug_view.png');

        // Dump HTML
        const html = await page.content();
        const fs = require('fs');
        fs.writeFileSync('debug_page.html', html);
        console.log('HTML saved to debug_page.html');

        // Log visible text around inputs
        const slotInfo = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
            return inputs.map(i => {
                let context = '';
                let el = i;
                // Get text from parent hierarchy
                for (let k = 0; k < 3; k++) {
                    if (el.parentElement) {
                        context += ` [Lvl${k}: ${el.parentElement.innerText.replace(/\n/g, '|')}]`;
                        el = el.parentElement;
                    }
                }
                return context;
            });
        });
        console.log('SLOT CONTEXTS:', JSON.stringify(slotInfo, null, 2));

        if (!foundSlot || !continueUrl) {
            throw new Error(`Failed to find slot "${TARGET_TEXT}" after retries.`);
        }

        // Navigate directly to the form
        console.log(`Navigating directly to form: ${continueUrl}`);
        await page.goto(continueUrl, { waitUntil: 'networkidle0' });

        console.log('Navigated to form. Waiting for inputs...');
        await new Promise(r => setTimeout(r, 3000));
        await page.waitForSelector('input', { timeout: 10000 });

        // Helper to fill by label or placeholder
        const fillByLabel = async (labelText, value) => {
            await page.evaluate((txt, val) => {
                let input = document.querySelector(`input[placeholder*="${txt}"]`);
                if (!input) {
                    const labels = Array.from(document.querySelectorAll('label'));
                    const label = labels.find(l => l.innerText.toLowerCase().includes(txt.toLowerCase()));
                    if (label) {
                        const id = label.getAttribute('for');
                        if (id) input = document.getElementById(id);
                        else input = label.querySelector('input');
                    }
                }
                if (!input) {
                    input = document.querySelector(`input[name*="${txt.toLowerCase()}"]`);
                }

                if (input) {
                    input.value = val;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                }
                return false;
            }, labelText, value);
        };

        console.log('Filling form...');
        await fillByLabel('Condo', process.env.CONDO) || await fillByLabel('Unit', process.env.CONDO);
        await fillByLabel('Passcode', process.env.PASSCODE) || await fillByLabel('Code', process.env.PASSCODE);
        await fillByLabel('Name', process.env.NAME);
        await fillByLabel('Phone', process.env.PHONE);
        await fillByLabel('Email', process.env.EMAIL);

        // Check for Terms checkbox
        await page.evaluate(() => {
            const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
            const terms = checkboxes.find(c => c.parentElement.innerText.match(/(terms|agree|policy)/i));
            if (terms && !terms.checked) {
                console.log('Clicking Terms checkbox...');
                terms.click();
            }
        });

        await new Promise(r => setTimeout(r, 1000));

        // Click Submit/Get Pass
        const submitClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const submitBtn = buttons.find(b =>
                b.innerText.match(/(Book|Reserve|Submit|Confirm|Continue|Get Pass)/i) && !b.disabled
            );

            if (submitBtn) {
                console.log('Submit button found: ' + submitBtn.innerText);
                submitBtn.click();
                return true;
            }
            return false;
        });

        if (submitClicked) {
            console.log('Clicked Submit/Get Pass! Waiting for confirmation...');
            await new Promise(r => setTimeout(r, 5000));
            await page.screenshot({ path: 'confirmation_emergency.png' });
            console.log('Emergency booking completed.');
        } else {
            console.log('Submit button not found immediately.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await browser.close();
    }
})();
