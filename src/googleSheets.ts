import fs from 'node:fs/promises';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import path from 'path';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist(): Promise<any> {
  try {
    const data = await fs.readFile(
      path.join(process.cwd(), TOKEN_PATH),
      'utf-8',
    );
    const credentials = JSON.parse(data);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client: any) {
  try {
    const data = await fs.readFile(
      path.join(process.cwd(), 'credentials.json'),
      'utf-8',
    );

    const keys = JSON.parse(data);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
    });
    try {
      await fs.writeFile(path.join(process.cwd(), TOKEN_PATH), payload);
    } catch (err) {
      console.log(`err writing: ${err}`);
    }
  } catch (err) {
    console.error(`readFile ${err}`);
  }
}

/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: path.join(process.cwd(), 'credentials.json'),
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
export async function listMajors(auth: any) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    range: 'Class Data!A2:E',
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  console.log('Name, Major:');
  rows.forEach((row: any) => {
    // Print columns A and E, which correspond to indices 0 and 4.
    console.log(`${row[0]}, ${row[4]}`);
  });
}

export interface RowAndUrl {
  rowNum: number;
  url: string;
}

export interface UpdateData {
  range: string;
  values: string[][];
}

export const getUrlsFromSheet = async (
  auth: any,
  spreadsheetId: string,
): Promise<RowAndUrl[]> => {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!H:H',
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return [];
  }

  const rowsAndUrls: RowAndUrl[] = [];

  rows.forEach((row: any, index) => {
    if (row[0] && isValidURL(row[0])) {
      rowsAndUrls.push({ rowNum: index + 1, url: row[0] });
    }
  });

  return rowsAndUrls;
};

export const extractSpreadsheetId = (url: string): string | null => {
  const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)\//;
  const match = url.match(regex);

  if (match && match[1]) {
    return match[1];
  } else {
    return null;
  }
};

export const isValidURL = (str: string): boolean => {
  const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/;
  return urlPattern.test(str);
};

export const updateValues = async (
  spreadsheetId: string,
  range: string,
  valueInputOption: any,
  values: any,
  auth: any,
) => {
  const sheet = google.sheets('v4');
  await sheet.spreadsheets.values.append({
    spreadsheetId,
    auth,
    range,
    valueInputOption,
    requestBody: {
      values,
    },
  });
};

export const batchUpdateValues = (
  spreadsheetId: string,
  data: UpdateData[],
  valueInputOption: string,
  auth: any,
) => {
  const sheet = google.sheets('v4');
  sheet.spreadsheets.values.batchUpdate({
    auth,
    spreadsheetId,
    requestBody: { data: data as any, valueInputOption },
  });
};
