import { parse } from 'csv-parse';
import fs from 'fs';
import { google } from 'googleapis';
import fetch from 'node-fetch';
import { parse as parseHtml } from 'node-html-parser';
import puppeteer, { Browser, ElementHandle } from 'puppeteer';
import {
  extractSpreadsheetId,
  getUrlsFromSheet,
  updateValues,
} from './googleSheets.js';

// TODO: MAKE THIS SAFE
const SERVICE_ACCOUNT_EMAIL =

const SERVICE_ACCOUNT_PRIVATE_KEY = 

const scrapeProductData = async (
  url: string,
  // ): Promise<{ price: string; title: string; desc: string; img: string }> => {
): Promise<any> => {
  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      defaultViewport: null,
      headless: false,
      ignoreHTTPSErrors: true,
    });
  } catch (error) {
    console.log(`error with browser`);
    console.log(error);
    throw error;
  }
  const page = await browser.newPage();
  console.log('created page');

  let price,
    title,
    desc,
    img = '';

  try {
    console.log(url);
    await page.goto(url, { timeout: 600000 });
    console.log('here');

    // Wait for the product information to load (adjust selectors as needed)
    try {
      await page.waitForSelector('[data-enzyme-id=PriceBlockijoiojijoijoioj]', {
        timeout: 600000,
        visible: true,
      });

      const productPriceHandle: ElementHandle<Element> | null = await page.$(
        '[data-enzyme-id=PriceBlock]',
      );

      console.log(productPriceHandle);
      price = productPriceHandle
        ? await page.evaluate(
            (element: Element) => (element.textContent ?? '').trim(),
            productPriceHandle,
          )
        : '';

      console.log(price);
    } catch (error) {
      console.log(error);
    }

    await page.screenshot({ path: 'screenshot.png' });
    //   await page.evaluate(() => {
    //     console.log(document.querySelectorAll('img'));
    //   });

    //   const productPriceHandle: ElementHandle<Element> | null = await page.$(
    //     '.hdca-product__description-pricing-price--hero .hdca-product__description-pricing-price-value',
    //   );
    //   const productTitleHandle: ElementHandle<Element> | null = await page.$(
    //     '.hdca-product__description-title-product-name',
    //   );
    //   const productDescHandle: ElementHandle<Element> | null = await page.$(
    //     '.acl-py--x-small hdca-text-body--small',
    //   );
    //   const productImgHandle: ElementHandle<Element> | null = await page.$(
    //     '.image-item.selected img',
    //   );

    //   price = productPriceHandle
    //     ? await page.evaluate(
    //         (element: Element) => (element.textContent ?? '').trim(),
    //         productPriceHandle,
    //       )
    //     : '';

    //   title = productTitleHandle
    //     ? await page.evaluate(
    //         (element: Element) => (element.textContent ?? '').trim(),
    //         productTitleHandle,
    //       )
    //     : '';

    //   desc = productDescHandle
    //     ? await page.evaluate(
    //         (element: Element) => (element.textContent ?? '').trim(),
    //         productDescHandle,
    //       )
    //     : '';

    //   img = productImgHandle
    //     ? await page.evaluate(
    //         (element: Element) => ((element as any)?.src ?? '').trim(),
    //         productImgHandle,
    //       )
    //     : '';
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
  // return {
  //   price: price ?? '',
  //   title: title ?? '',
  //   desc: desc ?? '',
  //   img: img ?? '',
  // };
};

const readCSVFile = async (filePath: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const results: string[] = [];

    fs.createReadStream(filePath)
      .pipe(parse({ delimiter: ',', from_line: 1 }))
      .on('data', (row) => {
        results.push(row[0]);
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};

const main = async () => {
  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const spreadsheetUrl =
    'https://docs.google.com/spreadsheets/d/1_CnkavI1RyzclNUfMTIv2luQ50_TiQ6G73tscLTEfTQ/edit#gid=0';
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);

  if (spreadsheetId === null) {
    console.error(
      'could not extract spreadsheetId from this URL... make sure the format of the url is correct. It should be something like: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit#gid=0',
    );
    return;
  }
  await getUrlsFromSheet(auth, spreadsheetId);

  const links: string[] = await readCSVFile('./sheet/list.csv');
  let rows: any[][] = [];

  for (const link of []) {
    // for IKEA links
    if (link.toLowerCase().includes('ikea')) {
      const res = await fetch(link);
      const html = await res.text();

      const htmlEl = parseHtml(html);

      const priceIntEl = htmlEl.querySelector('.pip-temp-price__integer');
      const priceInt = priceIntEl ? priceIntEl?.childNodes[0]?.innerText : '#';

      const priceDecEl = htmlEl.querySelector('.pip-temp-price__decimal');
      const priceDec = priceDecEl ? priceDecEl?.childNodes[1]?.innerText : '.#';

      const price = `${priceInt}.${priceDec}`;

      const titleEl = htmlEl.querySelector(
        '.pip-header-section__title--big.notranslate',
      );
      const title = titleEl ? titleEl?.childNodes[0]?.innerText : '#';

      const descEl = htmlEl.querySelector(
        '.pip-header-section__description-text',
      );
      const desc = descEl ? descEl?.childNodes[0]?.innerText : '#';

      const imgEl = htmlEl.querySelector('.pip-image');

      const imgSrc = (imgEl as any)?._attrs?.src;

      rows.push([title, desc, price, link, `=IMAGE("${imgSrc}")`]);
    }
    if (link.toLowerCase().includes('homedepot')) {
      const productNumber = link.substring(link.lastIndexOf('/') + 1);

      const res = await fetch(
        `https://www.homedepot.ca/api/productsvc/v1/products/${productNumber}/store/7142?fields=BASIC_SPA&lang=en`,
      );
      const resWithImage = await fetch(
        `https://www.homedepot.ca/api/fbtsvc/v1/fbt/products/${productNumber}/store/7142?checkStockAndPrice=true&lang=en`,
      );

      const resJson: any = await res.json();
      const resWithImageJson: any = await resWithImage.json();

      const price = String(resJson?.optimizedPrice?.displayPrice?.value);
      const title = String(resWithImageJson?.anchorArticle?.name);
      const desc = String(resJson?.installServiceCTI?.services[0]?.description);
      const img = String(resWithImageJson?.anchorArticle?.images[0]?.url);

      rows.push([title, desc, price, link, `=IMAGE("${img}")`]);
    }
    if (link.toLowerCase().includes('amazon')) {
      const res = await fetch(link);
      const html = await res.text();

      const htmlEl = parseHtml(html);
      const priceEl = htmlEl.querySelector('.a-offscreen');
      const price = priceEl ? priceEl.childNodes[0]?.innerText : '#';

      const titleEl = htmlEl.querySelector('#productTitle');
      const title = titleEl ? titleEl.childNodes[0]?.innerText?.trim() : '#';

      const imgEl = htmlEl.querySelector('#imgTagWrapperId img');

      const imgSrc = (imgEl as any)?._attrs?.src;

      rows.push([title, '', price, link, `=IMAGE("${imgSrc}")`]);

      console.log(price);
    }
  }
  try {
    // const auth = await authorize();
    // listMajors(auth);

    updateValues(
      '1_CnkavI1RyzclNUfMTIv2luQ50_TiQ6G73tscLTEfTQ',
      'Sheet1',
      'USER_ENTERED',
      rows,
      auth,
    );
  } catch (error) {
    console.error(error);
  }
};

main();
