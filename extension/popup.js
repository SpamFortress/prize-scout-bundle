const ADDON_VERSION = "0.2.2";
const tokenInput = document.querySelector("#token");
const appInput = document.querySelector("#app");
const button = document.querySelector("#check");
const status = document.querySelector("#status");

const savedToken = localStorage.getItem("prize-scout-token") || "";
const savedApp = localStorage.getItem("prize-scout-app") || "http://127.0.0.1:4342";
tokenInput.value = savedToken;
appInput.value = savedApp;

function show(message, checked) {
  status.textContent = "";
  if (checked) {
    const mark = document.createElement("span");
    mark.className = "checked";
    mark.textContent = "Checked by you";
    status.appendChild(mark);
  }
  const line = document.createElement("span");
  line.textContent = message;
  status.appendChild(document.createElement("br"));
  status.appendChild(line);
}

function endDateLine(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = names[Number(match[2]) - 1];
  const day = Number(match[3]);
  if (!month || day < 1 || day > 31) return "";
  return "Ends " + month + " " + day + ", " + match[1];
}

function addLine(text) {
  const line = document.createElement("span");
  line.textContent = text;
  status.appendChild(document.createElement("br"));
  status.appendChild(line);
}

function showCheck(body) {
  status.textContent = "";
  if (body && body.checkedByYou === true) {
    const mark = document.createElement("span");
    mark.className = "checked";
    mark.textContent = "Checked by you";
    status.appendChild(mark);
  }
  addLine((body && body.rulesNote) || "Checked.");
  const end = endDateLine(body && body.endIso);
  if (end) addLine(end);
  if (body && body.openRulesUrl) {
    status.appendChild(document.createElement("br"));
    const link = document.createElement("a");
    link.href = body.openRulesUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open rules";
    status.appendChild(link);
  }
}

button.addEventListener("click", async function () {
  const token = tokenInput.value.trim();
  const app = appInput.value.trim().replace(/\/$/, "");
  localStorage.setItem("prize-scout-token", token);
  localStorage.setItem("prize-scout-app", app);
  if (!token) {
    show("Paste the pairing token from Profile.", false);
    return;
  }
  if (!/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(app)) {
    show("The practice app address must be on 127.0.0.1.", false);
    return;
  }
  const chromeApi = globalThis.chrome;
  if (!chromeApi || !chromeApi.tabs || !chromeApi.scripting) {
    show("Open this popup from the Prize Scout toolbar button.", false);
    return;
  }
  button.disabled = true;
  try {
    const [tab] = await chromeApi.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null || !tab.url || !tab.url.startsWith("https://")) {
      show("Open the sponsor page in this tab first.", false);
      return;
    }
    const pdfTab = /\.pdf(?:$|[?#])/i.test(tab.url) || /[?&]fs=true(?:&|$)/i.test(tab.url) || tab.url.startsWith("chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/");
    if (pdfTab) {
      const pdfUrl = tab.url.startsWith("https://") ? tab.url : "";
      if (!pdfUrl) {
        show("Open the PDF's https address, then click Prize Scout again.", false);
        return;
      }
      const pdfResponse = await fetch(app + "/api/addon/pdf", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ url: pdfUrl }),
      });
      const pdfBody = await pdfResponse.json();
      if (!pdfResponse.ok) {
        show(pdfBody.message || "The PDF could not be read.", false);
        return;
      }
      showCheck(pdfBody);
      return;
    }
    const readTab = function () {
      return globalThis.PrizeScoutReader.readThisTab();
    };
    let read = [];
    try {
      await chromeApi.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["reader.js"],
      });
      read = await chromeApi.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: readTab,
      });
    } catch (error) {
      read = [{ frameId: 0, error: String(error && error.message ? error.message : error) }];
      await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, files: ["reader.js"] });
      const topOnly = await chromeApi.scripting.executeScript({ target: { tabId: tab.id }, func: readTab });
      read = read.concat(topOnly || []);
    }
    const snapshot = globalThis.PrizeScoutReader.mergeFrameReads(read || []);
    if (snapshot && snapshot.pdfUrl) {
      const pdfResponse = await fetch(app + "/api/addon/pdf", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ url: snapshot.pdfUrl, addonVersion: ADDON_VERSION }),
      });
      const pdfBody = await pdfResponse.json();
      if (!pdfResponse.ok) {
        show(pdfBody.message || "The PDF could not be read.", false);
        return;
      }
      showCheck(pdfBody);
      return;
    }
    if (!snapshot || !snapshot.html) {
      show("This tab could not be read.", false);
      return;
    }
    const response = await fetch(app + "/api/addon/check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        url: tab.url,
        title: snapshot.title,
        html: snapshot.html,
        limits: snapshot.limits || [],
        addonVersion: ADDON_VERSION,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      show(body.message || "The practice app refused the check.", false);
      return;
    }
    if (body.notContest) {
      show("Not a contest page, nothing saved", false);
      return;
    }
    showCheck(body);
  } catch {
    show("The practice app on 127.0.0.1 did not answer.", false);
  } finally {
    button.disabled = false;
  }
});
