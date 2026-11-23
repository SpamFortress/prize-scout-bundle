# Install the Prize Scout add-on

Phase 1 checks the tab you opened. It does not search, prefill, or submit.

1. Start the practice app so it is listening on `127.0.0.1` (this repo's dev server uses port 4342).
2. Open Profile in the app and copy the pairing token.
3. In Chrome, open `chrome://extensions`.
4. Turn on Developer mode.
5. Choose Load unpacked and select the `extension` folder in this repo.
6. Open the sponsor page yourself. Click the Prize Scout toolbar button.
7. Paste the token. Leave the app address as `http://127.0.0.1:4342` unless you chose another port on `127.0.0.1`.
8. After this update, open `chrome://extensions`, find Prize Scout, and click Reload. The unpacked folder is `extension/` in this project. Version 0.2.2 shows its version in the popup, shows the extracted end date under the note, and reads widget frames, including www and embed hosts. A frame that cannot be read is named in the check.
9. Click Check this tab.

If the rules are on another page, the popup names that page. Open it yourself and click again. The add-on does not fetch it.

A website cannot call the practice app: the request must come from this extension and carry the pairing token.
