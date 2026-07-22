function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function wireVisibilityToggle(button) {
  const input = document.getElementById(button.dataset.target);
  button.addEventListener("click", () => {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "🙈" : "👁";
  });
}

function showMessage(el, text, kind) {
  el.textContent = text;
  el.className = "form-message show " + kind;
}

function showFieldError(el, text) {
  if (!text) {
    el.classList.remove("show");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.add("show");
}

function setSession(email) {
  localStorage.setItem("dr_session", JSON.stringify({ email, at: Date.now() }));
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".toggle-visibility").forEach(wireVisibilityToggle);
});
