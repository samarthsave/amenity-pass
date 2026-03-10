const puppeteer = require('puppeteer');

(async () => {
    console.log("Opening Chrome window for WhatsApp Web login...");
    const browser = await puppeteer.launch({
        headless: false,
        userDataDir: './chrome_profile', // This saves the session for reserve.js to use later
        defaultViewport: null,
        args: ['--start-maximized']
    });

    const page = await browser.newPage();
    await page.goto('https://web.whatsapp.com');

    console.log("\n=============================================");
    console.log("ACTION REQUIRED:");
    console.log("1. Open WhatsApp on your phone.");
    console.log("2. Tap Menu or Settings and select Linked Devices.");
    console.log("3. Tap on Link a Device.");
    console.log("4. Point your phone to this screen to capture the code.");
    console.log("=============================================\n");
    console.log("Once you have successfully logged in and can see your chats, you can close the Chrome window manually.");
})();
