const listEl = document.getElementById("dir-list");
const noteEl = document.getElementById("dir-note");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function load() {
  try {
    const res = await fetch("/data/directory.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load the directory.");
    const data = await res.json();
    const rows = Array.isArray(data.reports) ? data.reports : [];
    if (!rows.length) {
      listEl.innerHTML = "<li>No finished reports yet.</li>";
      return;
    }
    listEl.innerHTML = rows
      .map((row) => {
        const name = escapeHtml(row.business);
        const href = "/report?biz=" + encodeURIComponent(row.business);
        const flag = row.mentioned
          ? '<span class="dir-flag yes">Mentioned</span>'
          : '<span class="dir-flag no">Not named</span>';
        return `<li><a href="${href}"><span class="dir-name">${name}</span>${flag}</a></li>`;
      })
      .join("");
    const extra = data.engineNote ? ` ${escapeHtml(data.engineNote)}` : "";
    noteEl.textContent = `${rows.length} live report${rows.length === 1 ? "" : "s"}.${extra}`;
  } catch (err) {
    listEl.innerHTML = `<li>${escapeHtml(err.message || "Could not load the directory.")}</li>`;
  }
}

load();
