console.log("[k8s] k8s_view.js loaded");

(function () {
  "use strict";

  // REQUIRED: challenge metadata object
  CTFd._internal.challenge.data = {};
  CTFd._internal.challenge.renderer = "k8s";

  // REQUIRED: must exist or CTFd crashes
  CTFd._internal.challenge.preRender = function () {
    console.log("[k8s] preRender()");
  };

  // REQUIRED: legacy, still must exist
  CTFd._internal.challenge.render = function () {
    console.log("[k8s] render()");
  };

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    console.log("[k8s] postRender()");
    initK8s();
  };

  // We don’t submit flags for k8s
  CTFd._internal.challenge.submit = function () {
    return Promise.resolve();
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
    console.log("[k8s] initK8s()");

    try {
      await waitForElement(".challenge-view");
    } catch {
      console.warn("[k8s] .challenge-view not found");
      return;
    }

    const challengeId = document.getElementById("challenge-id")?.value;
    const output = document.getElementById("instance-info");
    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");

    if (!challengeId || !output) {
      console.warn("[k8s] missing elements");
      return;
    }

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
      console.log("[k8s] Start clicked");
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
