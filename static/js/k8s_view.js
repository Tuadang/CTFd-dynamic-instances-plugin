(function () {
  "use strict";

  /**
   * Utility: wait until an element exists in DOM
   */
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
          reject(`Timeout waiting for ${selector}`);
        }
      }, 100);
    });
  }

  /**
   * Initialize once the challenge modal is rendered
   */
  async function initK8sChallenge() {
    let challengeId;
    let output;

    try {
      await waitForElement(".challenge-view");
    } catch (e) {
      console.warn("[k8s] Challenge view not found");
      return;
    }

    challengeId = document.getElementById("challenge-id")?.value;
    output = document.getElementById("instance-info");

    if (!challengeId || !output) {
      console.warn("[k8s] Required elements missing");
      return;
    }

    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
    }

    async function apiCall(endpoint, method = "POST") {
      const res = await fetch(`/api/v1/k8s/${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: JSON.stringify({ challenge_id: challengeId }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    }

    startBtn?.addEventListener("click", async () => {
      output.textContent = "";
      log("Starting instance...");

      try {
        const data = await apiCall("start");
        log(`Instance started`);
        if (data.ip) log(`IP: ${data.ip}`);
        if (data.port) log(`Port: ${data.port}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    stopBtn?.addEventListener("click", async () => {
      log("Stopping instance...");

      try {
        await apiCall("stop");
        log("Instance stopped");
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    statusBtn?.addEventListener("click", async () => {
      log("Checking status...");

      try {
        const data = await apiCall("status", "GET");
        log(`Status: ${data.status}`);
        if (data.ip) log(`IP: ${data.ip}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    /**
     * Cleanup when modal closes
     */
    document
      .querySelector(".challenge-window")
      ?.addEventListener("hidden.bs.modal", () => {
        output.textContent = "";
      });
  }

  /**
   * CTFd reuses DOM → listen globally
   */
  document.addEventListener("click", (e) => {
    const target = e.target.closest(".challenge-button, .challenge-title");
    if (!target) return;

    // Small delay so modal HTML is injected
    setTimeout(initK8sChallenge, 150);
  });

})();
