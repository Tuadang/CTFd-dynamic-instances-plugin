document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");
    const infoBox = document.getElementById("instance-info");

    let instanceId = null;

    function updateInfo(text) {
        infoBox.innerText = text;
    }

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            updateInfo("Starting Kubernetes instance...");

            fetch("/plugins/dynamic_instances/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ challenge_type: "k8s" })
            })
            .then(res => res.json())
            .then(data => {
                instanceId = data.instance_id;
                updateInfo(JSON.stringify(data, null, 2));
            });
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener("click", () => {
            if (!instanceId) {
                updateInfo("No instance to stop.");
                return;
            }

            fetch("/plugins/dynamic_instances/stop", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instance_id: instanceId })
            })
            .then(res => res.json())
            .then(data => updateInfo(JSON.stringify(data, null, 2)));
        });
    }

    if (statusBtn) {
        statusBtn.addEventListener("click", () => {
            if (!instanceId) {
                updateInfo("No instance to check.");
                return;
            }

            fetch("/plugins/dynamic_instances/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instance_id: instanceId })
            })
            .then(res => res.json())
            .then(data => updateInfo(JSON.stringify(data, null, 2)));
        });
    }
});
