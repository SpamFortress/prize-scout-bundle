# Prize Scout

Local practice app for reading sweepstakes pages before you enter. It runs on your computer. It does not ship a hosted site.

## Practice install

Use Node 20 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open only [http://127.0.0.1:4342/practice](http://127.0.0.1:4342/practice).

The dev server binds to loopback. Do not publish port 4342 or put this app on the public internet. Owner routes answer only when the request host is `127.0.0.1`, `localhost`, or `::1`.

`.env.local` is optional. Leave the keys empty to practice without a search provider. Do not commit `.env.local`, `data/`, or pairing tokens.

The unpacked add-on is in `extension/`. See `INSTALL-ADDON.md`.
