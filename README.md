# F2 Shopping List Filler

Reads a list of urls from a Google Sheets link and populate the same Google Sheet with retrieved product information, such as image, price, description and name.

Current supported links are from:
- IKEA
- Home Depot (not extremely reliable)
- Amazon (not able to get description)

User can input where in the spreadsheet the list of urls is (which column), but results will be written on columns B to F (followed what I had in their PDF)

## How to setup/run
- Add the following account as an Editor on the Google Spreadsheet
```
test-service-account@test-212916.iam.gserviceaccount.com
```

- Add a `.env` file with the `SERVICE_ACCOUNT_EMAIL` and `SERVICE_ACCOUNT_PRIVATE_KEY` (retrieved from Google API service account).
- Build the project with `npm run dev`

## How to deploy
App is deployed in fly.io
- app: https://f2-shopping-list.fly.dev/
- dashboard: https://fly.io/apps/f2-shopping-list

- To deploy, simply run `fly deploy`
- To setup secrets (necessary for build to work), run `fly secrets set SERVICE_ACCOUNT_EMAIL=[secret_value]` and `fly secrets set SERVICE_ACCOUNT_PRIVATE_KEY="[secret_value]"`. For multiline, use double quotes with `\n` for new lines.