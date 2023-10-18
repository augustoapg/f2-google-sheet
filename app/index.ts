import 'dotenv/config';
import express from 'express';
import { google } from 'googleapis';
import axios from 'axios'; // Import axios
import { parse as parseHtml } from 'node-html-parser';
import path from 'path';
import sanitizeHtml from 'sanitize-html';
import { fileURLToPath } from 'url';
import {
  UpdateData,
  batchUpdateValues,
  extractSpreadsheetId,
  getUrlsFromSheet,
} from './googleSheets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL;
const SERVICE_ACCOUNT_PRIVATE_KEY = (process.env.SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

app.use(express.urlencoded({ extended: true }));

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
      'Could not extract spreadsheetId from this URL. Make sure the URL format is correct, like: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit#gid=0'
    );
    return;
  }

  const data: UpdateData[] = [];

  const rowsAndUrls = await getUrlsFromSheet(auth, spreadsheetId, column, sheetName);

  for (const { rowNum, url } of rowsAndUrls) {
    console.log(rowNum, url);
    try {
      // for IKEA links
      if (url.toLowerCase().includes('ikea')) {
        const response = await axios.get(url);
        const html = response.data;

        const htmlEl = parseHtml(html);

        const priceIntEl = htmlEl.querySelector('.pip-temp-price__integer');
        const priceInt = priceIntEl
          ? priceIntEl.childNodes[0]?.innerText
          : '#';

        const priceDecEl = htmlEl.querySelector('.pip-temp-price__decimal');
        const priceDec = priceDecEl
          ? priceDecEl.childNodes[1]?.innerText
          : '.#';

        const price = `${priceInt}.${priceDec}`;

        const titleEl = htmlEl.querySelector(
          '.pip-header-section__title--big.notranslate'
        );
        const title = titleEl ? titleEl.childNodes[0]?.innerText : '#';

        const descEl = htmlEl.querySelector(
          '.pip-header-section__description-text'
        );
        const desc = descEl ? descEl.childNodes[0]?.innerText : '#';

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
        if (!productNumber) continue;

        const headers = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
      }

        const res = await axios.get(
          `https://www.homedepot.ca/api/productsvc/v1/products/${productNumber}/store/7142?fields=BASIC_SPA&lang=en`, {headers}
        );
        const resWithImage = await axios.get(
          `https://www.homedepot.ca/api/fbtsvc/v1/fbt/products/${productNumber}/store/7142?checkStockAndPrice=true&lang=en`, {headers}
        );

        const resJson = res.data;
        const resWithImageJson = resWithImage.data;

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
        const response = await axios.get(url);
        const html = response.data;

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
      console.log((error as any)?.message || error);
    }
  }

  try {
    batchUpdateValues(spreadsheetId, data, 'USER_ENTERED', auth);
  } catch (error) {
    console.error(error);
  }
};

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/submit', async (req, res) => {
  const spreadsheetUrl = sanitizeHtml(
    req.body.spreadsheetUrl || '',
    { allowedTags: [], allowedAttributes: {} }
  );
  const sheetName = sanitizeHtml(
    req.body.sheetName || 'Sheet1',
    { allowedTags: [], allowedAttributes: {} }
  );
  const column = sanitizeHtml(
    req.body.column || '',
    { allowedTags: [], allowedAttributes: {} }
  );

  if (!spreadsheetUrl || !sheetName || !column) {
    return res.send("All values must be added. Please go back and try again.");
  }

  try {
    await main(spreadsheetUrl, column, sheetName);
    return res.send(`Spreadsheet should be filled now. Check in ${spreadsheetUrl} if all worked`);
  } catch (error) {
    console.error(error);
    return res.send(`Script failed with the following error: ${error}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
