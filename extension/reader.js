/**
 * Reads the rendered tab. Open shadow roots are inlined. Closed shadow roots
 * and iframes this script cannot read are reported and left alone.
 * Classic script for chrome.scripting, and CommonJS for the unit tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PrizeScoutReader = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function readRenderedDocument(doc) {
    const limits = [];
    const frames = doc.querySelectorAll ? doc.querySelectorAll("iframe") : [];
    frames.forEach(function (frame) {
      let readable = false;
      try {
        readable = Boolean(frame.contentDocument && frame.contentDocument.body);
      } catch {
        readable = false;
      }
      if (!readable) limits.push("cross-origin iframe skipped");
    });

    const html = "<!doctype html>" + serialize(doc.documentElement, limits);
    return { title: doc.title || "", html: html, limits: limits };
  }

  function serialize(node, limits) {
    if (node.nodeType === 3) return escapeText(node.textContent || "");
    if (node.nodeType !== 1) return "";
    const el = node;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style") return "";
    let attrs = "";
    if (el.attributes) {
      for (let i = 0; i < el.attributes.length; i += 1) {
        const attr = el.attributes[i];
        if (attr.name === "srcdoc") continue;
        attrs += " " + attr.name + '="' + escapeAttr(attr.value) + '"';
      }
    }
    let inner = "";
    const shadow = el.shadowRoot;
    if (shadow) {
      inner += '<div data-open-shadow="true">';
      shadow.childNodes.forEach(function (child) {
        inner += serialize(child, limits);
      });
      inner += "</div>";
    }
    if (tag === "template" && el.content) {
      inner += '<div data-template="true">';
      el.content.childNodes.forEach(function (child) {
        inner += serialize(child, limits);
      });
      inner += "</div>";
    }
    el.childNodes.forEach(function (child) {
      inner += serialize(child, limits);
    });
    return "<" + tag + attrs + ">" + inner + "</" + tag + ">";
  }

  function escapeText(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeText(value).replace(/"/g, "&quot;");
  }

  function pdfEmbedUrl(doc, pageUrl) {
    var embed = doc.querySelector("embed[type='application/pdf'], embed[type='application/x-google-chrome-pdf'], iframe[type='application/pdf']");
    var src = embed ? (embed.getAttribute("src") || embed.src || "") : "";
    if (src) {
      try { return new URL(src, pageUrl).href; } catch { return pageUrl; }
    }
    if (/\.pdf(?:$|[?#])/i.test(pageUrl)) return pageUrl;
    if (/[?&]fs=true(?:&|$)/i.test(pageUrl)) return pageUrl;
    return "";
  }

  function readThisTab() {
    var read = readRenderedDocument(document);
    read.frameUrl = location.href;
    read.pdfUrl = pdfEmbedUrl(document, location.href);
    return read;
  }

  var WIDGET_HOSTS = [
    "sweepwidget.com",
    "gleam.io",
    "viralsweep.com",
    "woobox.com",
    "rafflecopter.com",
    "kingsumo.com",
    "shortstack.com",
    "shortstackapp.com",
    "wishpond.com",
    "upviral.com",
  ];

  function widgetHost(value) {
    var host = "";
    try {
      host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return false;
    }
    return WIDGET_HOSTS.some(function (domain) {
      return host === domain || host.slice(-(domain.length + 1)) === "." + domain;
    });
  }

  function frameAddress(frame) {
    if (!frame) return "";
    if (frame.url) return frame.url;
    return frame.result && frame.result.frameUrl ? frame.result.frameUrl : "";
  }

  /** Top frame plus widget frames read on the same click. Facts from a widget are wrapped. */
  function mergeFrameReads(reads) {
    var errors = [];
    (reads || []).forEach(function (frame) {
      if (frame && frame.error) errors.push("frame not read: " + (frame.url || (frame.result && frame.result.frameUrl) || "unknown frame"));
    });
    var frames = (reads || []).filter(function (item) {
      return item && item.result && item.result.html;
    });
    var top = frames.find(function (item) { return item.frameId === 0; }) || frames[0];
    if (!top) return { title: "", html: "", limits: ["This tab could not be read."].concat(errors), pdfUrl: "" };
    var html = top.result.html;
    var limits = (top.result.limits || []).slice();
    var readWidget = false;
    frames.forEach(function (frame) {
      if (frame === top) return;
      var address = frameAddress(frame);
      if (!widgetHost(address)) return;
      readWidget = true;
      var host = "";
      try { host = new URL(address).hostname.replace(/^www\./, ""); } catch { host = "widget"; }
      html += '<section data-widget-frame="' + escapeAttr(host) + '">' + frame.result.html + "</section>";
    });
    if (readWidget) limits = limits.filter(function (item) { return item !== "cross-origin iframe skipped"; });
    var seen = frames.map(frameAddress);
    var srcRe = /<iframe\b[^>]*\bsrc=["']([^"']+)["']/gi;
    var match;
    while ((match = srcRe.exec(top.result.html))) {
      var src = match[1];
      if (!widgetHost(src)) continue;
      var found = seen.some(function (address) {
        return address && (src.indexOf(address) !== -1 || address.indexOf(src) !== -1);
      });
      if (!found) limits.push("frame not read: " + src);
    }
    errors.forEach(function (item) {
      if (limits.indexOf(item) === -1) limits.push(item);
    });
    return { title: top.result.title || "", html: html, limits: limits, pdfUrl: top.result.pdfUrl || "" };
  }

  return { readRenderedDocument: readRenderedDocument, readThisTab: readThisTab, mergeFrameReads: mergeFrameReads, widgetHost: widgetHost, pdfEmbedUrl: pdfEmbedUrl };
});
