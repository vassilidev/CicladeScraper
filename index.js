import puppeteer from "puppeteer-extra";
import * as dotenv from 'dotenv'
import UserAgent from 'user-agents';
import fs from 'fs';
import csvParser from "csv-parser";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

dotenv.config();

puppeteer.use(
    RecaptchaPlugin({
        provider: {id: '2captcha', token: process.env.CAPTCHA_TOKEN},
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    }),
    StealthPlugin(),
);

(async () => {
    const browser = await puppeteer.launch({headless: false, ignoreHTTPSErrors: true});
    const page = await browser.newPage();

    await page.setUserAgent(new UserAgent().toString());

    const rows = [];
    const results = [];

    fs.createReadStream(process.env.INPUT_PATH)
        .pipe(csvParser())
        .on('data', (data) => rows.push(data))
        .on('end', parseData);

    /**
     * Read all the lines and loop though.
     */
    async function parseData() {
        for (const row of rows) {
            await getData(row);
        }

        // Log into console the result.
        console.log(results);

        await fs.writeFile(process.env.OUTPUT_PATH, JSON.stringify(results), err => {
            console.log(err);
        });

        return results;
    }

    /**
     * Read a single CSV row and run the scraper for each line.
     *
     * @param row
     */
    async function getData(row) {
        await page.goto(process.env.CICLADE_URL);

        await page.evaluate((row, process) => {
            if (document.querySelector(process.env.ACCEPT_COOKIE_SELECTOR)) {
                document.querySelector(process.env.ACCEPT_COOKIE_SELECTOR).click();
            }

            // Death

            if (row.is_dead === 1) {
                document.querySelector(process.env.DEAD_0_SELECTOR).checked = true;
                document.querySelector(process.env.DEAD_1_SELECTOR).checked = false;

                document.querySelector(process.env.DEATH_DATE_SELECTOR).parentElement.style.display = 'block';

                document.querySelector(process.env.DEATH_DATE_SELECTOR).value = row.date_of_death;
            } else {
                document.querySelector(process.env.DEAD_0_SELECTOR).checked = false;
                document.querySelector(process.env.DEAD_1_SELECTOR).checked = true;

                document.querySelector(process.env.DEATH_DATE_SELECTOR).parentElement.style.display = 'none';

                document.querySelector(process.env.DEATH_DATE_SELECTOR).value = '';
            }

            // Gender

            if (row.gender === 'mr') {
                document.querySelector(process.env.CIVILITY_MR_SELECTOR).checked = true;
                document.querySelector(process.env.CIVILITY_MME_SELECTOR).checked = false;
            } else {
                document.querySelector(process.env.CIVILITY_MR_SELECTOR).checked = false;
                document.querySelector(process.env.CIVILITY_MME_SELECTOR).checked = true;
            }

            // Names

            document.querySelector(process.env.BIRTH_SURNAME_SELECTOR).value = row.birth_surname;
            document.querySelector(process.env.USE_SURNAME).value = row.use_surname;

            let names = row.name.split('|');

            document.querySelector(process.env.NAME_SELECTOR).value = names[0];
            document.querySelector(process.env.OTHER_NAME_1_SELECTOR).value = names[1] ?? row.other_name1 ?? '';
            document.querySelector(process.env.OTHER_NAME_2_SELECTOR).value = names[2] ?? row.other_name2 ?? '';
            document.querySelector(process.env.OTHER_NAME_3_SELECTOR).value = names[3] ?? row.other_name3 ?? '';

            // Birth

            document.querySelector(process.env.BIRTH_DATE_SELECTOR).value = row.birth_date;
            document.querySelector(process.env.NATIONALITY_SELECTOR).value = row.nationality;
            document.querySelector(process.env.BIRTH_CITY_SELECTOR).value = row.birth_city;
            document.querySelector(process.env.BIRTH_COUNTRY_SELECTOR).value = row.birth_country;

            // Address

            document.querySelector(process.env.ADDRESS_SELECTOR).value = row.address;
            document.querySelector(process.env.ZIP_SELECTOR).value = row.zip;
            document.querySelector(process.env.CITY_SELECTOR).value = row.city;
            document.querySelector(process.env.COUNTRY_SELECTOR).value = row.country;

            document.querySelector('input[id=edit-numero-de-reference-0]').checked = true;
        }, row, process);

        // Bypass the re-captcha
        await page.solveRecaptchas();

        // Submit the form
        await page.click(process.env.FIRST_SUBMIT_SELECTOR);

        // Wait the new page
        await page.waitForNavigation();

        // Submit the last form
        await page.click(process.env.LAST_SUBMIT_SELECTOR);

        // Wait for the result
        await page.waitForNavigation();

        // Take a screenshot of the result
        await page.screenshot({path: 'response-' + Date.now() + '.png', fullPage: true});

        results.push({
            toto: 'titi',
        });
    }

})();