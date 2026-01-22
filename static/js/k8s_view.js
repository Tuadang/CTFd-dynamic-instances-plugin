CTFd._internal.challenge = {
    data: {},

    preRender: function () {
        // Called before the modal renders
        return Promise.resolve();
    },

    render: function (challenge) {
        // Save challenge data for later use
        CTFd._internal.challenge.data = challenge;
        return Promise.resolve();
    },

    postRender: function () {
        // Attach your custom button handlers
        const startBtn = document.getElementById("start-instance");
        const stopBtn = document.getElementById("stop-instance");
        const statusBtn = document.getElementById("status-instance");

        if (startBtn) startBtn.onclick = CTFd._internal.challenge.startInstance;
        if (stopBtn) stopBtn.onclick = CTFd._internal.challenge.stopInstance;
        if (statusBtn) statusBtn.onclick = CTFd._internal.challenge.statusInstance;

        return Promise.resolve();
    },

    startInstance: function () {
        const id = CTFd._internal.challenge.data.id;

        fetch(`/plugins/dynamic_instances/${id}/start`, {
            method: "POST",
            credentials: "same-origin"
        })
        .then(r => r.json())
        .then(data => {
            document.getElementById("instance-info").textContent =
                JSON.stringify(data, null, 2);
        });
    },

    stopInstance: function () {
        const id = CTFd._internal.challenge.data.id;

        fetch(`/plugins/dynamic_instances/${id}/stop`, {
            method: "POST",
            credentials: "same-origin"
        })
        .then(r => r.json())
        .then(data => {
            document.getElementById("instance-info").textContent =
                JSON.stringify(data, null, 2);
        });
    },

    statusInstance: function () {
        const id = CTFd._internal.challenge.data.id;

        fetch(`/plugins/dynamic_instances/${id}/status`, {
            method: "GET",
            credentials: "same-origin"
        })
        .then(r => r.json())
        .then(data => {
            document.getElementById("instance-info").textContent =
                JSON.stringify(data, null, 2);
        });
    }
};
