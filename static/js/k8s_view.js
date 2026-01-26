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
    let instanceId = null;

    if (!challengeId || !output) {
      console.warn("[k8s] missing elements");
      return;
    }

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
    }

    async function api(endpoint, payload = {}) {
      const res = await fetch(`/plugins/dynamic_instances/k8s/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: JSON.stringify({
          challenge_id: challengeId,
          instance_id: instanceId,
          ...payload,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    }

    function updateUI(data) {
      const connInput = document.getElementById("instance-connection");
      const statusBadge = document.getElementById("instance-status-badge");
      const connection = data.connection_string || (data.ip && data.port ? `nc ${data.ip} ${data.port}` : data.ip) || "Instance not started...";

      if (data.instance_id) instanceId = data.instance_id;

      if (data.status === "running") {
        connInput.value = connection;
        statusBadge.innerHTML = '<span class="badge bg-success">Online</span>';
      } else {
        connInput.value = connection || "Instance not started...";
        statusBadge.innerHTML = '<span class="badge bg-danger">Offline</span>';
      }
    }

    startBtn?.addEventListener("click", async () => {
      console.log("[k8s] Start clicked");
      output.textContent = "";
      log("Starting instance...");
      try {
        const data = await api("start");
        updateUI(data);
        log(`Instance ${data.instance_id || ""} started`);
        if (data.ip) log(`IP: ${data.ip}`);
        if (data.port) log(`Port: ${data.port}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    stopBtn?.addEventListener("click", async () => {
      log("Stopping instance...");
      try {
        const data = await api("stop");
        updateUI({ ...data, status: "stopped", connection_string: "Instance not started..." });
        log("Instance stopped");
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    statusBtn?.addEventListener("click", async () => {
      log("Checking status...");
      try {
        const data = await api("status");
        updateUI(data);
        log(`Status: ${data.status}`);
        if (data.ip) log(`IP: ${data.ip}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });
  }
})();
