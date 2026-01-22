console.log("[k8s] k8s_view.js loaded");

(function () {
  "use strict";

  // REQUIRED: define challenge object
  CTFd._internal.challenge.data = {};
  CTFd._internal.challenge.renderer = "k8s";

  // We do NOT use normal flag submission
  CTFd._internal.challenge.submit = function () {
    return Promise.resolve();
  };

  // Called after modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    initK8s();
  };

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject();
        }
      }, 100);
    });
  }

  async function initK8s() {
    console.log("[k8s] init() called");
    try {
      await waitForElement(".challenge-view");
    } catch {
      return;
    }

    const challengeId = document.getElementById("challenge-id")?.value;
    const output = document.getElementById("instance-info");
    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");

    if (!challengeId || !output) return;

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
    }

    async function api(endpoint, method = "POST") {
      const res = await fetch(`/api/v1/k8s/${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: method === "GET" ? null : JSON.stringify({ challenge_id: challengeId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    }

    startBtn?.addEventListener("click", async () => {
      console.log("[k8s] Start button clicked");
      output.textContent = "";
      log("Starting instance...");
      try {
        const data = await api("start");
        log("Instance started");
        if (data.ip) log(`IP: ${data.ip}`);
        if (data.port) log(`Port: ${data.port}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    stopBtn?.addEventListener("click", async () => {
      log("Stopping instance...");
      try {
        await api("stop");
        log("Instance stopped");
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    statusBtn?.addEventListener("click", async () => {
      log("Checking status...");
      try {
        const data = await api("status", "GET");
        log(`Status: ${data.status}`);
        if (data.ip) log(`IP: ${data.ip}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });
  }
})();
