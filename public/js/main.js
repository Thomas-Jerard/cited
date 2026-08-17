const form = document.getElementById("waitlist-form");
const statusEl = document.getElementById("form-status");
const button = document.getElementById("submit-btn");

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", Boolean(isError));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const business = String(form.business.value || "").trim();
  const email = String(form.email.value || "").trim();

  if (!business) {
    setStatus("Add the practice name.", true);
    form.business.focus();
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setStatus("Add a real email to see the full report.", true);
    form.email.focus();
    return;
  }

  button.disabled = true;
  setStatus("Saving your request.");

  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, business, city: "Austin" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Could not save that. Try again.");
    }
    sessionStorage.setItem("cited_email", email);
    sessionStorage.setItem("cited_business", business);
    window.location.href = "/report?biz=" + encodeURIComponent(business);
  } catch (err) {
    setStatus(err.message || "Something broke. Try again.", true);
    button.disabled = false;
  }
});
