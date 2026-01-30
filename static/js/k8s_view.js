// dynamic-instance.js
// CTFd plugin frontend logic for per-user dynamic instances
// Assumes backend routes:
//   POST /dynamic/start
//   GET  /dynamic/status
//   POST /dynamic/stop

(() => {
  "use strict";

  const challengeId = window.CHALLENGE_ID;
  let instanceId = null;
  let statusInterval = null;

  async function api(path, method = "POST") {
    const res = await fetch(`/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body:
        method === "GET"
          ? null
          : JSON.stringify({
              challenge_id: challengeId,
              instance_id: instanceId,
            }),
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }

    return res.json();
  }

  async function startInstance() {
    const data = await api("dynamic/start", "POST");
    instanceId = data.instance_id;
    renderStatus(data);
    startPolling();
  }

  async function stopInstance() {
    if (!instanceId) return;
    const data = await api("dynamic/stop", "POST");
    clearPolling();
    renderStopped(data);
    instanceId = null;
  }

  async function pollStatus() {
    if (!instanceId) return;
    const data = await api("dynamic/status", "GET");
    renderStatus(data);
  }

  function startPolling() {
    clearPolling();
    statusInterval = setInterval(pollStatus, 3000);
  }

  function clearPolling() {
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
    }
  }

  function renderStatus(data) {
    const el = document.getElementById("dynamic-status");
    if (!el) return;

    if (data.status === "running") {
      el.innerHTML = `
        <div>
          <strong>Status:</strong> running<br>
          <a href="${data.url}" target="_blank">Open instance</a>
        </div>
      `;
    } else {
      el.innerHTML = `<div><strong>Status:</strong> ${data.status}</div>`;
    }
  }

  function renderStopped() {
    const el = document.getElementById("dynamic-status");
    if (!el) return;
    el.innerHTML = `<div><strong>Status:</strong> stopped</div>`;
  }

  function bindUI() {
    const startBtn = document.getElementById("dynamic-start");
    const stopBtn = document.getElementById("dynamic-stop");

    if (startBtn) {
      startBtn.addEventListener("click", () => {
        startInstance().catch(console.error);
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        stopInstance().catch(console.error);
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindUI();
  });
})();
