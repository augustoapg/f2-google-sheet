import { google } from 'googleapis';
import fetch from 'node-fetch';
import { parse as parseHtml } from 'node-html-parser';
import config from './config';
import {
  UpdateData,
  batchUpdateValues,
  extractSpreadsheetId,
  getUrlsFromSheet,
} from './googleSheets.js';

const { SERVICE_ACCOUNT_EMAIL, SERVICE_ACCOUNT_PRIVATE_KEY } = config;

const extractHomeDepotProductNumber = (url: string): string | null => {
  // Define a regular expression to match the product number.
  const regex = /\/(\d+)(?:#reviews)?$/;

  // Use the regular expression to search for a match in the URL.
  const match = url.match(regex);

  // If a match is found, return the product number; otherwise, return null.
  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
};

const main = async (spreadsheetUrl: string, column: string, sheetName: string) => {
  const auth = new google.auth.JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: SERVICE_ACCOUNT_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);

  if (spreadsheetId === null) {
    console.error(
      'could not extract spreadsheetId from this URL... make sure the format of the url is correct. It should be something like: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit#gid=0',
    );
    return;
  }

  const data: UpdateData[] = [];

  const rowsAndUrls = await getUrlsFromSheet(
    auth,
    spreadsheetId,
    column,
    sheetName,
  );

  for (const { rowNum, url } of rowsAndUrls) {
    try {
      // for IKEA links
      if (url.toLowerCase().includes('ikea')) {
        const res = await fetch(url);
        const html = await res.text();

        const htmlEl = parseHtml(html);

        const priceIntEl = htmlEl.querySelector('.pip-temp-price__integer');
        const priceInt = priceIntEl
          ? priceIntEl?.childNodes[0]?.innerText
          : '#';

        const priceDecEl = htmlEl.querySelector('.pip-temp-price__decimal');
        const priceDec = priceDecEl
          ? priceDecEl?.childNodes[1]?.innerText
          : '.#';

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

        data.push({
          range: `Sheet1!B${rowNum}:F${rowNum}`,
          values: [
            [
              title ?? '',
              `=IMAGE("${imgSrc}")`,
              desc ?? '',
              'IKEA',
              price ?? '',
            ],
          ],
        });
      } else if (url.toLowerCase().includes('homedepot')) {
        const productNumber = extractHomeDepotProductNumber(url);

        const res = await fetch(
          `https://www.homedepot.ca/api/productsvc/v1/products/${productNumber}/store/7142?fields=BASIC_SPA&lang=en`,
        );
        const resWithImage = await fetch(
          `https://www.homedepot.ca/api/fbtsvc/v1/fbt/products/${productNumber}/store/7142?checkStockAndPrice=true&lang=en`,
        );

        const resJson: any = await res.json();
        const resWithImageJson: any = await resWithImage.json();

        const price = String(resJson?.optimizedPrice?.displayPrice?.value);
        const title = resWithImageJson?.anchorArticle?.name ?? '';
        const desc = resJson?.installServiceCTI?.services[0]?.description ?? '';
        const imgSrc = String(resWithImageJson?.anchorArticle?.images[0]?.url);

        data.push({
          range: `Sheet1!B${rowNum}:F${rowNum}`,
          values: [
            [
              title ?? '',
              `=IMAGE("${imgSrc}")`,
              desc ?? '',
              'HOME DEPOT',
              price ?? '',
            ],
          ],
        });
      } else if (url.toLowerCase().includes('amazon')) {
        const res = await fetch(url);
        const html = await res.text();

        const htmlEl = parseHtml(html);
        const priceEl = htmlEl.querySelector('.a-offscreen');
        const price = priceEl ? priceEl.childNodes[0]?.innerText : '#';

        const titleEl = htmlEl.querySelector('#productTitle');
        const title = titleEl ? titleEl.childNodes[0]?.innerText?.trim() : '#';

        const imgEl = htmlEl.querySelector('#imgTagWrapperId img');

        const imgSrc = (imgEl as any)?._attrs?.src;

        data.push({
          range: `Sheet1!B${rowNum}:F${rowNum}`,
          values: [[title, `=IMAGE("${imgSrc}")`, '', 'AMAZON', price]],
        });
      }
    } catch (error) {
      console.log(error);
    }
  }

  try {
    batchUpdateValues(spreadsheetId, data, 'USER_ENTERED', auth);
  } catch (error) {
    console.error(error);
  }
};

Bun.serve({
  port: 3000,
  
  async fetch(request) {
    const url = new URL(request.url);
    console.log(url.pathname)
    if (url.pathname === "/") return new Response(Bun.file(import.meta.dir + "/public/index.html"));
    if (url.pathname === "/submit") {
      const formData = await request.formData()
      const spreadsheetUrl = formData.get('spreadsheetUrl')?.toString();
      const sheetName = formData.get('sheetName')?.toString() || "Sheet1";
      const column = formData.get('column')?.toString();

      if (!spreadsheetUrl || !sheetName || !column) {
        return new Response("All values must be added. Please go back and try again.");
      }

      try {
        await main(spreadsheetUrl, column, sheetName);
        return new Response(`Spreadsheet should be filled now. Check in ${spreadsheetUrl} if all worked`);
      } catch (error) {
        console.error(error);
        return new Response(`Script failed with the following error: ${error}`)
      }
    }
    return new Response("404!");
  },
});
