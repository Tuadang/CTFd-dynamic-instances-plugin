CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    const md = _CTFd.lib.markdown()

    function getChallengeId() {
        const fromInput = parseInt(document.querySelector("input[name='id']")?.value)
        if (!Number.isNaN(fromInput)) return fromInput
        const match = window.location.pathname.match(/\/challenges\/(\d+)/)
        if (match) return parseInt(match[1])
        return null
    }

    const challengeId = getChallengeId()
    if (!challengeId) return

    fetch(`/api/v1/challenges/${challengeId}`, {
        method: "GET",
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
        },
    })
        .then((res) => res.json())
        .then((payload) => {
            const data = payload?.data || {}
            const templateInput = document.querySelector("input[name='template']")
            const portInput = document.querySelector("input[name='port']")
            if (templateInput && data.template) {
                templateInput.value = data.template
            }
            if (portInput && data.port !== undefined && data.port !== null) {
                portInput.value = data.port
            }
        })
        .catch(() => {})
})
