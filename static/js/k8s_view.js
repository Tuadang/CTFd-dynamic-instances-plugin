(function () {
  "use strict";

  // REQUIRED: challenge metadata object. Preserve any existing data from CTFd.
  const existing = CTFd._internal.challenge.data || {};
  CTFd._internal.challenge.data = { ...existing, instance_info: existing.instance_info ?? null };
  CTFd._internal.challenge.renderer = "k8s";

  // REQUIRED: must exist or CTFd crashes
  CTFd._internal.challenge.preRender = function () {
  };

  // REQUIRED: legacy, still must exist
  CTFd._internal.challenge.render = function () {
  };

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
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

    try {
      await waitForElement("#challenge");
    } catch {
      return;
    }

    const challengeId = document.getElementById("challenge-id")?.value;
    const output = document.getElementById("instance-log");
    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");

    const k8sBase = ("http://localhost:5000").replace(/\/$/, "");
    const defaultImage = window.DYNAMIC_INSTANCES_K8S_IMAGE;
    const defaultTag = window.DYNAMIC_INSTANCES_K8S_TAG;
    const defaultPort = window.DYNAMIC_INSTANCES_K8S_PORT;
    const currentUser = (window.CTFd && window.CTFd._internal && window.CTFd._internal.user) ? window.CTFd._internal.user : {};
    let instanceId = null;

    if (!challengeId || !output) {
      return;
    }

    if (!k8sBase) {
      output.textContent = "[error] API base URL not configured (set window.DYNAMIC_INSTANCES_K8S_API_BASE or DYNAMIC_INSTANCES_API_BASE)";
      return;
    }

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
    }

    function resolveValue(key) {
      // priority: explicit input value -> data attr -> challenge data -> global default
      const input = document.getElementById(`challenge-${key}`);

      if (input && input.value) return input.value;

      const dataEl = document.querySelector(`[data-challenge-${key}]`);

      if (dataEl && dataEl.dataset && dataEl.dataset[`challenge${key.charAt(0).toUpperCase()}${key.slice(1)}`]) {
        return dataEl.dataset[`challenge${key.charAt(0).toUpperCase()}${key.slice(1)}`];
      }

      const challengeData = window.CTFd && window.CTFd._internal && window.CTFd._internal.challenge && window.CTFd._internal.challenge.data;
      
      if (challengeData && challengeData[key]) return challengeData[key];

      return key === "image" ? defaultImage : key === "tag" ? defaultTag : defaultPort;
    }

    function buildStartPayload() {
      const image = resolveValue("image");
      const tag = resolveValue("tag");
      const portVal = resolveValue("port");

      const port = portVal ? parseInt(portVal, 10) : undefined;
      const user = currentUser.name || currentUser.id || "user";

      return { image, tag, port, user };
    }

    async function api(endpoint, payload = {}) {
      const res = await fetch(`${k8sBase}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: JSON.stringify({
          challenge_id: challengeId,
          instance_id: instanceId,
          user_id: currentUser.id,
          user_name: currentUser.name,
          team_id: currentUser.team_id,
          user: currentUser.name || currentUser.id,
          ...payload,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        // If no JSON, keep generic message
      }

      if (!res.ok) {
        const msg = data.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      return data;
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
      output.textContent = "";
      log("Starting instance...");
      const startPayload = buildStartPayload();

      if (!startPayload.image) {
        log("Error: image not configured for this challenge");
        return;
      }
      
      try {
        const data = await api("start", startPayload);
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
