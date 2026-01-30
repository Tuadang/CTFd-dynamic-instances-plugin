// k8s_view.js
// CTFd challenge renderer for Kubernetes-backed dynamic instances

(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * REQUIRED CTFd CHALLENGE INTERFACE
   * ------------------------------------------------------------------ */

  // Preserve existing challenge data if present
  const existing = CTFd._internal.challenge.data || {};
  CTFd._internal.challenge.data = existing;

  // Renderer name (optional but correct)
  CTFd._internal.challenge.renderer = "k8s";

  // MUST exist or CTFd throws
  CTFd._internal.challenge.preRender = function () {};

  // Legacy hook — must exist
  CTFd._internal.challenge.render = function () {};

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    initK8sInstanceUI();
  };

  // Required even if unused
  CTFd._internal.challenge.submit = function () {
    return Promise.resolve();
  };

  /* ------------------------------------------------------------------
   * IMPLEMENTATION
   * ------------------------------------------------------------------ */

  let instanceId = null;
  let pollTimer = null;
  let globalClickBound = false;

  function challengeId() {
    const fromInput = parseInt(document.getElementById("challenge-id")?.value);
    if (!Number.isNaN(fromInput)) return fromInput;
    const fromData = parseInt(CTFd?._internal?.challenge?.data?.id);
    if (!Number.isNaN(fromData)) return fromData;
    const fromWindow = parseInt(window?.CHALLENGE_ID);
    if (!Number.isNaN(fromWindow)) return fromWindow;
    return null;
  }

  async function api(endpoint, method = "POST", payload = {}) {
    let url = `/plugins/dynamic_instances/dynamic/${endpoint}`;
    if (method === "GET" && payload && Object.keys(payload).length) {
      const params = new URLSearchParams(payload);
      url = `${url}?${params.toString()}`;
    }
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "CSRF-Token": CTFd.config.csrfNonce,
      },
      body: method === "GET" ? null : JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  }

  function updateStatus(data) {
    const el = document.getElementById("dynamic-status");
    if (!el) return;

    const connBadge = document.getElementById("instance-connection-status");
    const connInfo = document.getElementById("instance-connection-info");

    const status = data.status || data.pod_phase || "unknown";
    const isRunning = status === "running" || status === "Running";
    const isCreating = status === "starting" || status === "pending" || status === "Pending" || status === "creating";

    if (isRunning) {
      el.innerHTML = `
        <div>
          <strong>Status:</strong> running<br>
          <code>${data.connection || data.ip || ""}</code>
        </div>
      `;
      if (connBadge) {
        connBadge.textContent = "Available";
        connBadge.classList.remove("text-danger");
        connBadge.classList.add("text-success");
      }
      if (connInfo) {
        connInfo.textContent = data.connection || data.url || data.ip || "Available";
        connInfo.classList.remove("text-muted");
        connInfo.classList.add("text-success");
      }
    } else if (isCreating) {
      el.innerHTML = `<div><strong>Status:</strong> creating</div>`;
      if (connBadge) {
        connBadge.textContent = "Creating";
        connBadge.classList.remove("text-success", "text-danger");
        connBadge.classList.add("text-warning");
      }
      if (connInfo) {
        connInfo.textContent = "Starting...";
        connInfo.classList.remove("text-success", "text-danger");
        connInfo.classList.add("text-muted");
      }
    } else {
      el.innerHTML = `<div><strong>Status:</strong> ${status}</div>`;
      if (connBadge) {
        connBadge.textContent = "Unavailable";
        connBadge.classList.remove("text-success");
        connBadge.classList.add("text-danger");
      }
      if (connInfo) {
        connInfo.textContent = "Not available";
        connInfo.classList.remove("text-success");
        connInfo.classList.add("text-muted");
      }
    }
  }

  function clearPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    clearPolling();
    pollTimer = setInterval(async () => {
      if (!instanceId) return;
      try {
        const data = await api("status", "GET", {
          challenge_id: challengeId(),
          instance_id: instanceId,
        });
        updateStatus(data);
      } catch (_) {}
    }, 5000);
  }

  async function startInstance() {
    const data = await api("start", "POST", {
      challenge_id: challengeId(),
    });
    instanceId = data.instance_id;
    updateStatus({ ...data, status: data.status || "creating" });
    startPolling();
  }

  async function stopInstance() {
    if (!instanceId) return;
    await api("stop", "POST", {
      challenge_id: challengeId(),
      instance_id: instanceId,
    });
    instanceId = null;
    clearPolling();
    updateStatus({ status: "stopped" });
  }

  function initK8sInstanceUI() {
    bindGlobalClickHandler();
    // Only poll when an instance is known
    if (instanceId) {
      startPolling();
    }
  }

  function bindGlobalClickHandler() {
    if (globalClickBound) return;
    globalClickBound = true;
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("#start-instance, #stop-instance");
      if (!button) return;

      if (button.id === "start-instance") {
        startInstance().catch(() => {});
      } else if (button.id === "stop-instance") {
        stopInstance().catch(() => {});
      }
    });
  }
})();
