CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$

    $('#start-instance').click(() => {
        $.post('/plugins/dynamic_instances/start', {
            challenge_id: CHALLENGE_ID,
            type: 'k8s'
        }).done((data) => {
            $('#instance-info').text(JSON.stringify(data, null, 2))
        })
    })

    $('#stop-instance').click(() => {
        $.post('/plugins/dynamic_instances/stop', {
            challenge_id: CHALLENGE_ID,
            type: 'k8s'
        }).done((data) => {
            $('#instance-info').text(JSON.stringify(data, null, 2))
        })
    })

    $('#status-instance').click(() => {
        $.post('/plugins/dynamic_instances/status', {
            challenge_id: CHALLENGE_ID,
            type: 'k8s'
        }).done((data) => {
            $('#instance-info').text(JSON.stringify(data, null, 2))
        })
    })
})
