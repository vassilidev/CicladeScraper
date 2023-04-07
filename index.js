import puppeteer from "puppeteer-extra";
import * as dotenv from 'dotenv'
import UserAgent from 'user-agents';
import fs from 'fs';
import csvParser from "csv-parser";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as winston from 'winston';

dotenv.config();

puppeteer.use(
    RecaptchaPlugin({
        provider: {id: '2captcha', token: process.env.CAPTCHA_TOKEN},
        visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    }),
    StealthPlugin(),
);

const logConfiguration = {
    'transports': [
        new winston.transports.File({
            filename: 'logs/run-' + new Date().toJSON().replaceAll(':', '-') + '.log',
        }),
    ],
};

function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time)
    });
}

let logger = winston.createLogger(logConfiguration);

(async () => {
    logger.info('Start browser');

    const browser = await puppeteer.launch({headless: false, ignoreHTTPSErrors: true});
    const page = await browser.newPage();

    await page.setDefaultNavigationTimeout(0);

    await page.exposeFunction('logger', message => logger.info(message))

    logger.info('Set User Agent');

    await page.setUserAgent(new UserAgent().toString());

    const rows = [];
    const results = [];

    logger.info('Read input file');

    fs.createReadStream(process.env.INPUT_PATH)
        .pipe(csvParser())
        .on('data', (data) => rows.push(data))
        .on('end', parseData);

    /**
     * Read all the lines and loop though.
     */
    async function parseData() {
        logger.info('Start parsing data');

        for (const row of rows) {
            logger.info('Parse data for the row ' + row.ref_dossier);

            await getData(row);
        }

        logger.info('Closing the browser');

        await browser.close();

        logger.info('Write the output');

        await fs.writeFile(process.env.OUTPUT_PATH, JSON.stringify(results), err => {
            logger.error(err);
        });

        return results;
    }

    /**
     * Read a single CSV row and run the scraper for each line.
     *
     * @param row
     */
    async function getData(row) {
        logger.info('Going to ' + process.env.CICLADE_URL);

        await page.goto(process.env.CICLADE_URL);

        await page.evaluate((row, process) => {
            logger('Accept cookie');

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

            if (row.gender === 'H') {
                document.querySelector(process.env.CIVILITY_MR_SELECTOR).checked = true;
                document.querySelector(process.env.CIVILITY_MME_SELECTOR).checked = false;
            } else {
                document.querySelector(process.env.CIVILITY_MR_SELECTOR).checked = false;
                document.querySelector(process.env.CIVILITY_MME_SELECTOR).checked = true;
            }

            // Names

            document.querySelector(process.env.BIRTH_SURNAME_SELECTOR).value = row.birth_surname;
            document.querySelector(process.env.USE_SURNAME).value = row.use_surname;

            document.querySelector(process.env.NAME_SELECTOR).value = row.name ?? '';
            document.querySelector(process.env.OTHER_NAME_1_SELECTOR).value = row.other_name1 ?? '';
            document.querySelector(process.env.OTHER_NAME_2_SELECTOR).value = row.other_name2 ?? '';
            document.querySelector(process.env.OTHER_NAME_3_SELECTOR).value = row.other_name3 ?? '';

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

        logger.info('Waiting for captcha');

        // Bypass the re-captcha
        await page.solveRecaptchas();

        logger.info('Solved ! Submitting...');

        // Submit the form
        await page.click(process.env.FIRST_SUBMIT_SELECTOR);

        // Wait the new page
        await page.waitForNavigation();

        logger.info('Waiting result...');

        // Submit the last form
        await page.click(process.env.LAST_SUBMIT_SELECTOR);

        // Wait for the result
        await delay(1500);

        let isWorking = await page.evaluate(function (process) {
            return !document.querySelector(process.env.OUTPUT_SELECTOR).textContent.includes(process.env.OUTPUT_DONT_WORK);
        }, process);

        if (isWorking) {
            logger.info('GG ! ' + row.ref_dossier);

            results.push(row);
        } else {
            logger.info(':( Nothing for ' + row.ref_dossier);
        }

        return results;
    }
})();