const root = document.getElementById("report-root");
const nameEl = document.getElementById("practice-name");
const kickerEl = document.getElementById("report-kicker");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function queryBusiness() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("biz") || sessionStorage.getItem("cited_business") || "").trim();
}

function unlockedFor() {
  return Boolean(sessionStorage.getItem("cited_email"));
}

function meaningText(report) {
  if (report.whatThisMeans) return report.whatThisMeans;
  if (report.status === "queued") {
    return "Your scan is queued. Check back on this page with the same practice name.";
  }
  if (report.mentioned) {
    return "AI search already names this practice in at least one Austin dentist query we ran. The names below are who else showed up in those answers.";
  }
  return "AI search did not name this practice in the queries we ran. The names below are who it recommended instead. Nothing here is guessed.";
}

function listHtml(items, empty) {
  if (!items.length) return `<p class="empty-line">${escapeHtml(empty)}</p>`;
  return `<ol class="list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function teaserHtml() {
  return `
    <section class="block">
      <h2>Queries tested</h2>
      <div class="bars"><i></i><i></i><i></i></div>
    </section>
    <section class="block">
      <h2>Who got mentioned instead</h2>
      <div class="bars"><i></i><i></i></div>
    </section>
    <section class="block means">
      <h2>What this means</h2>
      <div class="bars"><i></i><i></i><i></i></div>
    </section>
  `;
}

function detailsHtml(report) {
  return `
    <section class="block">
      <h2>Queries tested</h2>
      ${listHtml(report.queries || [], "No queries in the file for this practice.")}
    </section>
    <section class="block">
      <h2>Who got mentioned instead</h2>
      ${listHtml(report.mentionedInstead || [], "No other names in the file for this practice.")}
    </section>
    <section class="block means">
      <h2>What this means</h2>
      <p>${escapeHtml(meaningText(report))}</p>
    </section>
  `;
}

function mentionHtml(report) {
  if (report.status === "queued") {
    return `
      <div class="mention">
        <span class="mention-label">Mentioned</span>
        <span class="mention-value queued">Queued</span>
      </div>
      <div class="queued-note">
        <p>${escapeHtml(report.message || "Your scan is queued. Check back on this page with the same practice name.")}</p>
      </div>
    `;
  }
  return `
    <div class="mention">
      <span class="mention-label">Mentioned</span>
      <span class="mention-value ${report.mentioned ? "yes" : "no"}">${report.mentioned ? "Yes" : "No"}</span>
    </div>
  `;
}

function gateHtml(business, queued) {
  const blurb = queued
    ? "Leave an email if you want. We cannot send mail yet. Check back on this page with the same practice name."
    : "Email unlocks the full report on this page. We cannot send mail yet.";
  const label = queued ? "Save my email" : "Unlock the full report";
  return `
    <form id="unlock-form" class="intake gate-card" novalidate>
      <p>${blurb}</p>
      <div class="field">
        <label for="unlock-email">Email</label>
        <input id="unlock-email" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@practice.com">
      </div>
      <input type="hidden" name="business" value="${escapeHtml(business)}">
      <button type="submit" id="unlock-btn">${label}</button>
      <p class="form-note" id="unlock-status" role="status" aria-live="polite"></p>
    </form>
  `;
}

function render(report, business, unlocked) {
  document.title = `${report.business || business} · Cited`;
  nameEl.textContent = report.business || business;
  kickerEl.textContent = report.status === "queued" ? "Scan queued" : "Visibility report";

  if (report.status === "queued") {
    root.innerHTML = `
      ${mentionHtml(report)}
      ${unlocked ? `<section class="block means"><h2>What this means</h2><p>${escapeHtml(meaningText(report))}</p></section>` : ""}
      ${unlocked ? "" : gateHtml(business, true)}
    `;
    bindUnlock(business);
    return;
  }

  if (unlocked) {
    root.innerHTML = `${mentionHtml(report)}${detailsHtml(report)}`;
    return;
  }

  root.innerHTML = `
    ${mentionHtml(report)}
    <div class="gate">
      <div class="blurred" aria-hidden="true">${teaserHtml()}</div>
      ${gateHtml(business, false)}
    </div>
  `;
  bindUnlock(business);
}

function bindUnlock(business) {
  const form = document.getElementById("unlock-form");
  if (!form) return;
  const statusEl = document.getElementById("unlock-status");
  const button = document.getElementById("unlock-btn");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = String(form.email.value || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusEl.textContent = "Add a real email.";
      statusEl.classList.add("is-error");
      return;
    }
    button.disabled = true;
    statusEl.classList.remove("is-error");
    statusEl.textContent = "Saving.";
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, business, city: "Austin" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save that.");
      sessionStorage.setItem("cited_email", email);
      sessionStorage.setItem("cited_business", business);
      window.location.reload();
    } catch (err) {
      statusEl.textContent = err.message || "Try again.";
      statusEl.classList.add("is-error");
      button.disabled = false;
    }
  });
}

async function load() {
  const business = queryBusiness();
  if (!business) {
    nameEl.textContent = "No practice named";
    root.innerHTML = `<p>Add a practice name on the <a href="/">Cited home page</a>.</p>`;
    return;
  }

  nameEl.textContent = business;
  const email = sessionStorage.getItem("cited_email") || "";

  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ business, city: "Austin", email }),
    });
    const report = await res.json();
    if (!res.ok) throw new Error(report.error || "Scan failed.");
    render(report, business, unlockedFor());
  } catch (err) {
    root.innerHTML = `<p class="form-note is-error">${escapeHtml(err.message || "Could not load the report.")}</p>`;
  }
}

load();
