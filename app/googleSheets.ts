import { google } from 'googleapis';

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
  column: string,
  sheetName: string = 'Sheet1',
): Promise<RowAndUrl[]> => {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!${column}:${column}`,
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
  const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?(#.*)?$/;
  return urlPattern.test(str);
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
