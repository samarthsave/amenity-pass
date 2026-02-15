const fs = require('fs');
require('dotenv').config();
const puppeteer = require('puppeteer');

const AMENITY_URL = 'https://amenitypass.app/properties/6581p8950s37s52a3p2t0w44gg/amenities/yt9198emjd193dbkydz0y93edm';

// Config
const BOOKING_LEAD_UNKNOWN_SEC = 2; // Buffer
const USERS = {
    USER1: {
        condo: process.env.CONDO,
        passcode: process.env.PASSCODE,
        name: process.env.NAME,
        phone: process.env.PHONE,
        email: process.env.EMAIL
    },
    USER2: {
        condo: process.env.CONDO_2,
        passcode: process.env.PASSCODE_2,
        name: process.env.NAME_2,
        phone: process.env.PHONE_2,
        email: process.env.EMAIL_2
    }
};

const TARGETS = [
    // User 1 Slots (Sat 8-9am, Sun 8-9am, Wed 6-7pm)
    { day: 6, hour: 8, minute: 0, label: "Sat 8:00 AM", user: "USER1" },
    { day: 6, hour: 8, minute: 30, label: "Sat 8:30 AM", user: "USER1" },
    { day: 0, hour: 8, minute: 0, label: "Sun 8:00 AM", user: "USER1" },
    { day: 0, hour: 8, minute: 30, label: "Sun 8:30 AM", user: "USER1" },
    { day: 3, hour: 18, minute: 0, label: "Wed 6:00 PM", user: "USER1" },
    { day: 3, hour: 18, minute: 30, label: "Wed 6:30 PM", user: "USER1" },

    // User 2 Slots (Sat 9-10am, Sun 9-10am, Wed 7-8pm)
    { day: 6, hour: 9, minute: 0, label: "Sat 9:00 AM", user: "USER2" },
    { day: 6, hour: 9, minute: 30, label: "Sat 9:30 AM", user: "USER2" },
    { day: 0, hour: 9, minute: 0, label: "Sun 9:00 AM", user: "USER2" },
    { day: 0, hour: 9, minute: 30, label: "Sun 9:30 AM", user: "USER2" },
    { day: 3, hour: 19, minute: 0, label: "Wed 7:00 PM", user: "USER2" },
    { day: 3, hour: 19, minute: 30, label: "Wed 7:30 PM", user: "USER2" }
];

// Cache to prevent re-booking same slot in same week
// Key: "Label_YYYY-MM-DD"
const successfulBookings = new Set();
// Clean up old keys periodically? Simple script, maybe restart once a week is fine.
// Or just keep a size limit.

const getNextOccurrence = (dayOfWeek, hour, minute) => {
    const now = new Date();
    const result = new Date(now);
    result.setHours(hour, minute, 0, 0);
    // Adjust day
    const currentDay = now.getDay();
    let dayDiff = dayOfWeek - currentDay;
    if (dayDiff < 0 || (dayDiff === 0 && now > result)) {
        dayDiff += 7;
    }
    result.setDate(now.getDate() + dayDiff);
    return result;
};

const bookSlot = async (targetText, targetDate, userProfile) => {
    console.log(`\n[${new Date().toISOString()}] Starting booking process for: "${targetText}" using ${userProfile.name}`);
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();
    let success = false;

    try {
        console.log(`Navigating to ${AMENITY_URL}`);
        await page.goto(AMENITY_URL, { waitUntil: 'networkidle2' });

        // Wait for initial load
        await new Promise(r => setTimeout(r, 2000));

        let foundSlot = false;
        let continueUrl = null;
        let retries = 0;
        const maxRetries = 60; // Increased to cover pre-start + wait (60 * ~2s = ~2 mins)

        while (!foundSlot && retries < maxRetries) {
            try {
                // Scroll
                await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

                const result = await page.evaluate((target) => {
                    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"], input[type="radio"]'));
                    let clicked = false;

                    for (const input of inputs) {
                        if (input.disabled) continue;

                        let slotLabel = '';
                        const parent = input.parentElement;
                        if (parent && parent.previousElementSibling) {
                            const abbr = parent.previousElementSibling.querySelector('abbr');
                            if (abbr && abbr.getAttribute('title')) {
                                slotLabel = abbr.getAttribute('title');
                            } else {
                                slotLabel = parent.previousElementSibling.innerText;
                            }
                        }

                        if (slotLabel) {
                            // Check match
                            const targetParts = target.split(' ');
                            // Very basic match: all parts of target must be in label
                            const allPartsMatch = targetParts.every(part => slotLabel.includes(part));

                            if (allPartsMatch) {
                                console.log(`Found target slot: ${slotLabel}`);
                                input.click();
                                clicked = true;
                                break;
                            }
                        }
                    }

                    if (clicked) {
                        const links = Array.from(document.querySelectorAll('a'));
                        const continueBtn = links.find(a => a.innerText.trim().toLowerCase().includes('continue'));
                        return { found: true, url: continueBtn ? continueBtn.href : null };
                    }
                    return { found: false, url: null };
                }, targetText);

                if (result.found) {
                    foundSlot = true;
                    // If URL not grabbed immediately, wait a split second
                    if (!result.url) {
                        await new Promise(r => setTimeout(r, 1000));
                        continueUrl = await page.evaluate(() => {
                            const links = Array.from(document.querySelectorAll('a'));
                            const btn = links.find(a => a.innerText.trim().toLowerCase().includes('continue'));
                            return btn ? btn.href : null;
                        });
                    } else {
                        continueUrl = result.url;
                    }
                    if (foundSlot && continueUrl) break;
                }

                if (!foundSlot) {
                    console.log(`Slot "${targetText}" not found. Reloading (${retries}/${maxRetries})...`);
                    await page.reload({ waitUntil: 'domcontentloaded' });
                    await new Promise(r => setTimeout(r, 1500));
                }

            } catch (e) {
                console.log(`Error in polling: ${e.message}`);
            }
            retries++;
        }

        if (foundSlot && continueUrl) {
            console.log(`Slot found! Navigating to: ${continueUrl}`);
            await page.goto(continueUrl, { waitUntil: 'networkidle0' });

            // Fill form
            await new Promise(r => setTimeout(r, 2000));
            await page.waitForSelector('input', { timeout: 10000 });

            const fillByLabel = async (labelText, value) => {
                await page.evaluate((txt, val) => {
                    let input = document.querySelector(`input[placeholder*="${txt}"]`);
                    if (!input) {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const label = labels.find(l => l.innerText.toLowerCase().includes(txt.toLowerCase()));
                        if (label) {
                            const id = label.getAttribute('for');
                            input = id ? document.getElementById(id) : label.querySelector('input');
                        }
                    }
                    if (!input) input = document.querySelector(`input[name*="${txt.toLowerCase()}"]`);

                    if (input) {
                        input.value = val;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, labelText, value);
            };

            await fillByLabel('Condo', userProfile.condo) || await fillByLabel('Unit', userProfile.condo);
            await fillByLabel('Passcode', userProfile.passcode) || await fillByLabel('Code', userProfile.passcode);
            await fillByLabel('Name', userProfile.name);
            await fillByLabel('Phone', userProfile.phone);
            await fillByLabel('Email', userProfile.email);

            // Terms
            await page.evaluate(() => {
                const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
                const terms = checkboxes.find(c => c.parentElement.innerText.match(/(terms|agree|policy)/i));
                if (terms && !terms.checked) terms.click();
            });

            await new Promise(r => setTimeout(r, 1000));

            // Submit
            const submitted = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const submitBtn = buttons.find(b =>
                    b.innerText.match(/(Book|Reserve|Submit|Confirm|Continue|Get Pass)/i) && !b.disabled
                );
                if (submitBtn) {
                    submitBtn.click();
                    return true;
                }
                return false;
            });

            if (submitted) {
                console.log('Submitted booking!');
                await new Promise(r => setTimeout(r, 5000));
                await page.screenshot({ path: `confirmation_${targetText.replace(/[: ]/g, '_')}.png` });
                success = true;
            } else {
                console.log('Submit button not found.');
            }
        } else {
            console.log(`Could not find or select slot "${targetText}" after retries.`);
        }

    } catch (err) {
        console.error('Booking failed:', err);
    } finally {
        await browser.close();
    }
    return success;
};

const runScheduler = async () => {
    console.log('--- Amenity Automation Service Started ---');
    console.log(`Monitoring for ${TARGETS.length} slots...`);
    TARGETS.forEach(t => console.log(` - ${t.label}`));

    while (true) {
        try {
            const now = new Date();
            let nextActionTime = Infinity;
            let targetToBook = null;

            for (const target of TARGETS) {
                const slotTime = getNextOccurrence(target.day, target.hour, target.minute);
                // Booking opens 48 hours before
                const openTime = new Date(slotTime.getTime() - (48 * 60 * 60 * 1000));

                // Start 10 seconds BEFORE open time
                const startTime = new Date(openTime.getTime() - 10000);
                // Give up 2 minutes AFTER open time (rollover logic)
                const giveUpTime = new Date(openTime.getTime() + 2 * 60000);

                const slotKey = `${target.label}_${slotTime.toDateString()}`;

                if (successfulBookings.has(slotKey)) {
                    continue; // Already processed (either booked or failed/skipped)
                }

                if (now >= startTime && now < giveUpTime) {
                    // Current window!
                    targetToBook = { target, slotTime, slotKey };
                    break;
                } else if (now < startTime) {
                    // Future window
                    const wait = startTime - now;
                    if (wait < nextActionTime) {
                        nextActionTime = wait;
                    }
                }
            }

            if (targetToBook) {
                const userKey = targetToBook.target.user;
                const userProfile = USERS[userKey];

                console.log(`\n[${new Date().toISOString()}] Launching for "${targetToBook.target.label}" (User: ${userKey}) (Opens 48h prior)...`);
                const booked = await bookSlot(targetToBook.target.label, targetToBook.slotTime, userProfile);

                // Regardless of success or failure, we mark this slot as processed 
                // so we don't keep trying it forever and can move to the next one (rollover).
                successfulBookings.add(targetToBook.slotKey);

                if (booked) {
                    console.log(`✅ Successfully booked ${targetToBook.target.label}`);
                } else {
                    console.log(`❌ Failed to book ${targetToBook.target.label}. Rolling over to next slot.`);
                }
            } else {
                // Wait logic
                const waitMs = Math.min(nextActionTime, 60 * 60 * 1000); // Cap at 1h
                if (nextActionTime !== Infinity && waitMs > 0) {
                    const waitSec = Math.round(waitMs / 1000);
                    // Only log if wait is substantial to avoid spamming
                    if (waitSec > 2) console.log(`Waiting for next slot window... (${waitSec}s)`);
                    await new Promise(r => setTimeout(r, waitMs));
                } else {
                    // Default small wait if nothing imminent (shouldn't really happen with valid targets)
                    // or if waitMs is negative/zero
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

        } catch (e) {
            console.error('Fatal scheduler error:', e);
            await new Promise(r => setTimeout(r, 60000));
        }
    }
};

runScheduler();
